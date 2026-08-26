# Firebase data model & security design

This project runs entirely on the Firebase **free (Spark) tier**: Auth,
Firestore, and Realtime Database only — no Cloud Functions, no paid
backend. That constraint shapes the design below, and its consequences are
called out explicitly rather than glossed over.

## Why two databases

- **Realtime Database (RTDB):** the live game room. Turn-by-turn card
  placements need low-latency sync between exactly two connected clients —
  RTDB's socket-based model and cheap per-write cost fit that better than
  Firestore's document model.
- **Firestore:** durable, queryable data that outlives a single match —
  user profiles, aggregate stats, and finished-game records. Firestore's
  `orderBy` is what powers the leaderboard.

Single-player (vs. computer) never touches either database — it's pure
client-side state (see `src/game/`).

---

## Realtime Database: `rooms/{roomId}`

```
rooms/{roomId}/
  meta/
    hostUid                string   — creator of the room; also the dealer (see Trust model)
    guestUid                string   — set once a second player joins
    status                  enum     — "waiting" | "dealing" | "placing" | "swap" | "showdown" | "complete"
    turnUid                 string   — whose turn it is to place a card
    firstPlayerUid           string   — winner of the initial 5-card evaluation
    cashGame/
      enabled                bool
      valuePerColumn          number  — e.g. 5
      currency                string  — e.g. "NIS", "USD"
    dealCommitmentHash       string   — SHA-256 of the full shuffled deck order + salt,
                                        written by the host BEFORE any card is dealt
    dealReveal/
      order                   string[] — full 52-card order, revealed at "complete"
      salt                    string
    createdAt / updatedAt     server timestamp

  players/{uid}/                     -- PUBLIC to both room members
    displayName              string
    connected                bool     — driven by onDisconnect()
    locked                   bool     — player has confirmed their swap decision
    swapUsed                 bool
    initialHandRank/
      category                number (0-9, standard poker hand category)
      tiebreak                number[]
    board/
      col1..col5/
        "0".."3"              { rank, suit, faceDown:false }   — face-up rows
        "4"                   { faceDown:true }                — the final row: value withheld

  private/{uid}/                     -- PRIVATE until showdown (see rule below)
    initialHand               card[5]           — the actual dealt starting hand
    hiddenCardByCol/
      col1..col5               { rank, suit } | null   — the real value behind board/col*/4
    swapCard                   { rank, suit } | null    — the extra card from the final 2-card split

  usedCards/{cardCode}         uid       — append-only set; a card code (e.g. "As") can be
                                           claimed once per room, blocking accidental or
                                           malicious duplicate dealing

  log/{pushId}                 { uid, type, col, ts, rank?, suit? }
                                — action feed driving animations + the AI Coach tips;
                                  a hidden-row placement is logged WITHOUT rank/suit
```

### State machine (`meta/status`)

`waiting → dealing → placing → swap → showdown → complete`

- **waiting:** room created, host has set the cash-game config, waiting for
  a guest (or the guest just joined).
- **dealing:** host deals 5 initial cards to each player; both clients
  evaluate their own hand to determine `firstPlayerUid`.
- **placing:** the 40-card turn-based phase (20 placements per player,
  filling rows 0-3 of all 5 columns, then row 4 face-down).
- **swap:** the last 2 cards are dealt (1 per player); each player may swap
  it into one of their `hiddenCardByCol` slots before locking in.
- **showdown:** both players have `locked: true` — hidden cards become
  readable by the opponent (rule-enforced, see below) and the client runs
  the column-by-column reveal animation.
- **complete:** result written to Firestore `games/{gameId}`, RTDB room can
  be cleaned up / left to expire.

### Why row index 4 is always the hidden row

Each column fills strictly in order (index 0, then 1, 2, 3, 4) as a player
chooses that column for a placement — there's no way to place into slot 3
before slot 0. That makes "the last card placed in a column" always land
at index 4, so the rules can hard-code "index 4 is face-down" instead of
tracking placement order separately.

---

## Firestore

```
users/{uid}
  uid, displayName, createdAt
  stats/
    gamesPlayed, gamesWon, gamesLost     number, monotonically non-decreasing
  lastGameId                              string — audit pointer, see rules

games/{gameId}                            -- immutable once created
  players: [uidA, uidB]
  playerNames: { [uid]: name }
  cashGame: { enabled, valuePerColumn, currency }
  result: { columnsWon: { [uid]: n }, winnerUid, sweep: bool, payout: number }
  startedAt, endedAt
```

The leaderboard is just `users` ordered by `stats.gamesWon desc` — a plain
single-field `orderBy`, so no composite index is required.

---

## Trust model — what these rules do and don't guarantee

This is a peer-to-peer, serverless design. Two trust boundaries are
**enforced by the rules below** (verified at the database layer, not just
hidden in the UI):

1. **Hidden-card confidentiality.** `private/{uid}` is unreadable by the
   opponent until `meta/status` reaches `showdown`/`complete`. This is a
   real database-level access control, not CSS — the opponent's client
   cannot fetch the bytes early, regardless of what code it runs.
2. **Leaderboard tamper-resistance (partial).** A `users/{uid}` write that
   increments `gamesWon` must cite a `games/{gameId}` document where
   `winnerUid == uid`, and `games` documents are immutable once created and
   require both real participant UIDs. A client can't fabricate a win out
   of thin air; it can still, at most, lie about the *outcome* of a game it
   genuinely played (see below).

Two things are **explicitly not guaranteed**, because they'd require a
trusted server (a paid Cloud Functions plan) to referee:

- **The dealer (room host) sees the deck order before dealing.** There's no
  third party to shuffle blindly, so the host's client necessarily knows
  what it's dealing. The `dealCommitmentHash` / `dealReveal` fields let
  either player verify *after the fact* that the deck wasn't reshuffled
  mid-game to favor the host — they don't stop the host from peeking ahead.
  For two people who trust each other enough to play a cash game together,
  this is a normal, disclosed limitation of free-tier serverless card
  games; it is not disguised as more secure than it is.
- **A modified client could self-report a fabricated win.** The `games`
  document is created by one of the two participating clients from its own
  local view of the finished board. Without a server recomputing the
  showdown independently, a sufficiently motivated cheater with devtools
  open could alter their own client's idea of who won. The audit trail
  (immutable `games` docs, monotonic stats) stops casual/accidental abuse
  and makes deliberate cheating detectable (a `games` doc a player didn't
  actually win looks inconsistent against the opponent's own copy, and both
  players' clients write independent `log` entries), but it isn't
  cryptographic proof. Upgrading to Cloud Functions (Blaze plan) would
  close this gap by having a server independently recompute the showdown.
