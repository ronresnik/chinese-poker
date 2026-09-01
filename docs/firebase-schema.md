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
  meta/                               -- readable by ANY authenticated user (see below)
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
    drawQueue                  card[20]          — this player's entire remaining draw
                                                    sequence, pre-allocated at deal time
                                                    (see "Why pre-allocate draws" below)
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
- **dealing:** host shuffles once and writes each player's full allocation
  in one shot — `initialHand` (5), `drawQueue` (20), `swapCard` (1) — then
  both clients independently evaluate their own `initialHand` to determine
  `firstPlayerUid`, and each writes its own `initialHand` straight onto its
  board, one card per column (self-write, no player choice — see
  `src/game/README.md`), filling row 0 before any turn-based placement.
  See "Why pre-allocate draws" below.
- **placing:** the 40-card turn-based phase (20 placements per player,
  filling rows 1-3 of all 5 columns, then row 4 face-down) — each player
  draws from their own already-allocated `drawQueue`, no further host
  involvement needed. A column may only receive its next card once every
  other column in that player's board already holds at least that many
  (enforced client-side, mirroring the local engine's
  `openColumnsForPlacement`) — row 1 fills across all 5 columns before any
  column starts row 2, and so on.
- **swap:** each player already holds their `swapCard` from the initial
  allocation; they may swap it into one of their `hiddenCardByCol` slots
  before locking in, or keep their board as is.
- **showdown:** both players have `locked: true` — hidden cards become
  readable by the opponent (rule-enforced, see below) and the client runs
  the column-by-column reveal animation.
- **complete:** result written to Firestore `games/{gameId}`, RTDB room can
  be cleaned up / left to expire.

### Why pre-allocate draws instead of a shared `deck` path

A naive design keeps one shared "remaining deck" that players draw from
turn by turn — but the only entity that can validly reveal the *next* card
in a shuffle it alone generated is the host (see "Trust model" below), and
the placement phase's 40 remaining turns would then need the host to
mediate every single draw, live, for the whole game. Instead, the host
does its one necessary act of trust exactly once, at deal time: it splits
its shuffle into `initialHand` (5) + `drawQueue` (20) + `swapCard` (1) per
player — 52 cards total — and writes all of it in one shot while
`meta/status` is `dealing`. From then on each player just pops their own
`drawQueue` locally (a self-write, already allowed at any time) whenever
their hand is empty on their turn. This is statistically identical to
drawing one at a time from a single shared shuffled deck — a uniformly
shuffled sequence's contiguous slices are exchangeable with its interleaved
ones — it's just a different, equally fair way to read the same shuffle.
The payoff is that the host's private-write exception only ever needs to
open during `dealing` (initial hands + draw queues + swap cards) and
`swap` (nothing left to deal there in this design, kept open for symmetry)
— never during the 40-turn `placing` phase itself.

### Why row index 4 is always the hidden row

Each column fills strictly in order (index 0, then 1, 2, 3, 4) as a player
chooses that column for a placement — there's no way to place into slot 3
before slot 0. That makes "the last card placed in a column" always land
at index 4, so the rules can hard-code "index 4 is face-down" instead of
tracking placement order separately.

### Reads can't span children with different access outcomes

A real bug from early testing, worth documenting so it doesn't recur: RTDB
security rules aren't a filter. If a single read or listen touches several
child paths and even one of them evaluates to denied, the *entire* read
fails — it doesn't come back with the accessible parts and the denied
parts simply omitted. `rooms/{roomId}` as a whole is exactly this kind of
path: `meta` is open to any authenticated user, `players` is open to any
room member, but `private/{uid}` is open only to that specific uid (or
everyone, post-showdown) — three different rules with three different
outcomes for the same reader. A client that isn't a room member yet
(mid-join) or a member reading pre-showdown (when the opponent's
`private/*` has real data but is still denied to them) will have that one
broad read fail outright, masking as a generic permission error even
though the part they actually needed (`meta`, to check the room exists) is
individually readable.

The fix: never listen or read broadly at `rooms/{roomId}`. Each of `meta`,
`players`, and each `private/{uid}` gets its own separate listener
(`useOnlineGameStore.js`), and their snapshots are merged into one object
client-side. Each of those three has a *uniform* access outcome across its
own subtree for a given reader (doesn't depend on which specific child is
being touched), which is what makes reading each of them broadly, on its
own, safe.

### Entering a room is not the same as taking a seat

The rule `meta/guestUid` enforces — correctly — that the guest must be a
*different* user than the host:

```
"guestUid": { ".write": "... && root.child(...).child('meta/hostUid').val() !== auth.uid" }
```

The client originally treated "enter a room by code" as always meaning
"claim the empty second seat", which collides with that rule in the one
case that matters most: **the host re-entering their own room**. That
isn't a hypothetical. The online store holds the room purely in memory,
so any reload — including iOS silently evicting a backgrounded tab, which
happens routinely when you switch apps to send someone the room code —
drops the host out of their own room with no way back in. And because
only the host may deal (see the trust model above), a host who lost their
tab leaves the guest waiting forever: the room sits at `status: "waiting"`
with two players registered and never progresses.

Entering a room is therefore resolved as four separate outcomes
(`src/firebase/roomEntry.js`, unit-tested without a live database):

| you are | outcome |
| --- | --- |
| the host | resume your seat |
| the guest | resume your seat |
| a stranger, second seat free | take the seat |
| a stranger, second seat taken | refused, with the uid comparison shown |

Resuming is checked **before** the "is the room full?" test, because a
member re-entering isn't competing for a seat — they already hold one.
Landing on a room URL directly uses a resume-only mode so an accidental
visit can never consume the seat the real opponent is about to take.

### Why room errors are reported at length

RTDB denials are deliberately uninformative — the rules can't leak which
condition failed, or they'd be probeable. That's fine for security and
terrible for a player: `get()` rejects with a bare `Permission denied`
and `update()` with `PERMISSION_DENIED: Permission denied`, for every one
of the a dozen-odd separate writes the online flow makes, with no path and
no reason. Shown raw, as the app first did, the message cannot distinguish
"you tried to join your own room" from "the Console still has last week's
rules" from "this in-app browser blocked storage so you were never signed
in at all".

`src/firebase/errors.js` reconstructs what Firebase won't say, from
context the client already has: which operation and path were attempted,
the reader's uid next to the room's `hostUid`/`guestUid` (the single most
diagnostic line — it collapses a uid comparison the reader would
otherwise have to do by eye), whether sign-in actually succeeded, and
which database host the app is talking to (rules published to a
*different* database look exactly like stale rules). Causes are listed
most-likely-first per operation, and the whole block is copyable.

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

`meta/{roomId}` is readable by **any authenticated user**, not just that
room's members — this was tightened-then-loosened during development: an
earlier version restricted it to members only, which broke joining outright
(a prospective joiner isn't a member *yet*, and has to be able to check
"does this room exist, is it full?" before they can become one). This
doesn't leak anything sensitive — `meta` never holds card data, only
status/turn/cash-game info. Card data (`private/{uid}`) keeps its strict
membership-plus-showdown-gated read rule unchanged, regardless of any of
the below.

**This section originally justified the above by calling a room ID "an
unguessable, out-of-band-shared token" — that stopped being true once
room codes shrank to 4 digits** (`firebase/rooms.js`'s `newRoomId`, added
for usability: a person can actually read a 4-digit code aloud or type it
on a phone keyboard, unlike a 20-character Firebase push key). A 4-digit
code has only 10,000 possible values, all of them brute-forceable — a
scanner could enumerate every code and read the `meta` of every open
room, and in principle race a real second player to an open seat in one
it finds still `"waiting"`. `meta` still never carries card data, so this
doesn't expose hands or outcomes — but it's a real narrowing of the
privacy assumption this section used to lean on, taken on deliberately in
exchange for a code a person can actually use, not an oversight. See the
comment on `newRoomId` for the full writeup.

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
- **`meta/turnUid` can be written by either room member, not strictly only
  by whoever's turn it currently is.** A precise "only the acting player
  may hand off the turn" rule is straightforward to state but easy to get
  subtly wrong by hand in RTDB's rules language without the emulator to
  test against (see the Step 2 notes on why this project didn't chase that
  level of rigor for a casual, trusted-opponent game). What *is* still
  enforced: `turnUid` must always be one of the two real room members, and
  every placement itself is written to that player's own board path only
  (self-write), so the worst a malicious client can do here is grant
  itself an extra turn, not alter the opponent's board or see their hidden
  cards. Tightened turn-order enforcement is a reasonable follow-up once
  the rules can be validated against the Firebase Emulator Suite.
