# game/

Pure, framework-free game logic (no React, no Firebase): deck/shuffle,
hand evaluation, board rules, turn order, scoring, the swap mechanic, and
the AI bot / coach heuristics. Everything here is a deterministic function
of its inputs — randomness only enters via `deck.js`'s shuffle, so the
rest is trivial to unit test (see the `*.test.js` files; run with
`npm test`).

## The exact card math

5 columns x 5 rows = 25 cards per player x 2 players = 50, leaving exactly
2 cards from the 52-card deck for the swap step (1 per player). That match
is what pins down the turn flow precisely:

1. **Initial deal:** each player gets 5 cards, evaluated as a standalone
   5-card poker hand (`turnOrder.js`) to decide who acts first — then
   those same 5 cards are dealt straight onto the board, one per column
   (`board.js`'s `dealInitialRow`), with no player choice. This fills row
   0 across all 5 columns before any turn-based placement happens.
2. **Placement phase:** starting with the first player, turns alternate
   one placement at a time, each turn drawing the next card from the deck.
   A column may only receive its next card once every other column
   already holds at least that many (`openColumnsForPlacement`) — so row 1
   must fill across all 5 columns before any column starts row 2, and so
   on up to the hidden row 4. This runs for 20 more placements per player
   (40 total) until every column on both boards is full.
3. **The hidden row:** columns fill strictly bottom-to-top (index 0 first,
   4 last), so "the last card placed in a column" is always index 4 —
   there's no ambiguity to track separately, `board.js` just treats index
   4 as face-down unconditionally.
4. **Swap:** the 2 cards left in the deck are dealt, one to each player.
   Each player may swap theirs into any one of their 5 hidden (index-4)
   cards, discarding whichever card comes out — or keep their board as is.
5. **Showdown:** column-by-column comparison, scored per
   `docs/firebase-schema.md`'s payout rules (`scoring.js`).

## Module map

- `deck.js` — card codes, deck construction, crypto-random shuffle.
- `handEvaluator.js` — standard 5-card hand ranking + comparator.
- `board.js` — the 5-column board: placement, fullness, the face-down rule.
- `turnOrder.js` — initial-hand evaluation -> first player.
- `scoring.js` — showdown comparison + the 3-2 / 4-1 / 5-0(x2) payout math.
- `reveal.js` — the caption for the column-by-column showdown reveal.
- `cardCounting.js` — per-rank "what haven't I seen yet" tally.
- `swap.js` — applying a swap, and evaluating swap options for the coach/bot.
- `aiCoach.js` — heuristic "how sound was that move" tips for placements
  and swaps. Statistical, not a trained model — see the file for the method.
- `bot.js` — single-player opponent, built on the same heuristics as the
  coach so its play and its "explanations" are consistent.
- `engine.js` — the state machine tying the above into one game: pure
  `dispatch(state, action) -> state`, no I/O. `store/` wraps this for React
  + bot auto-play (offline) or mirrors its shape from Firebase (online).

## What's deliberately NOT here

Hiding the opponent's face-down cards is an access-control concern (who
can *read* the data), not a game-logic concern — that's enforced by the
Firebase rules from Step 2 and by what the online store chooses to sync
into view. This engine always holds full, real card data for both players
(there's no one to hide it from inside a single process), which keeps it
simple to test; `store/` is what decides what a given client actually gets
to see.

## No column is ever drawn

Standard poker ranks two hands with the same five rank values as a tie.
This game doesn't have ties: `compareHands` falls through to the suits
(spades > hearts > diamonds > clubs), comparing the strongest card first.
That last step can't itself end level — equal category *and* equal
tiebreak means both hands hold the same five rank values, and with one
52-card deck their suits can't match too without being literally the same
cards.

Two consequences worth knowing:

- A match can't end level either. Five columns, none drawn, so the split
  is always 5-0, 4-1 or 3-2 — exactly the three cases the payout table in
  `scoring.js` covers.
- `columnOutcomesFor` and `reveal.js` still handle a winner-less column.
  It's unreachable, but the fallback keeps a drawn column from being
  silently reported to both players as a loss if that ever changes.

## Counting what a player has seen

`cardCounting.js` answers "how many of each rank are still unaccounted
for" *from one player's seat*, which is why the two players legitimately
see different numbers: each can see their own face-down final row and not
their opponent's.

The final row is the case that needs care. Once it begins, the opponent
commits five cards this player cannot identify. They're off the table,
but their ranks are unknown, so subtracting them from any particular rank
would invent information the player doesn't have. They stay in the unseen
pool and are reported separately as `unknownOnTable`, which is what lets
the UI say how much of that pool is already face-down rather than still
to come.
