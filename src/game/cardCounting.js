import { RANKS, SUITS } from './deck.js'
import { COLUMNS } from './board.js'

export const COPIES_PER_RANK = 4
export const COPIES_PER_SUIT = 13
export const DECK_SIZE = 52

/**
 * How many of each rank a given player can still account for.
 *
 * This is deliberately built from *what that player can see*, not from
 * the true deck state, which is why the two players legitimately see
 * different numbers. A card counts as seen when its rank is visible to
 * this player:
 *
 *  - every face-up card on either board;
 *  - this player's own final row, which they know and their opponent
 *    does not (their board arrives here with real rank/suit, while the
 *    opponent's arrives masked — see board.js's maskHiddenRow and the
 *    online store's mergeHidden);
 *  - `knownCards`: the card currently in hand, and the spare swap card.
 *
 * The final row is the case worth being careful about. Once it starts,
 * the opponent commits five cards this player cannot identify. Those
 * cards are off the table but their ranks are unknown, so they must not
 * be subtracted from any particular rank — doing so would invent
 * information the player doesn't have. They stay counted as unseen, and
 * are reported separately as `unknownOnTable` so the UI can say plainly
 * how much of the unseen pool is already committed face-down rather than
 * still to come. That number is what makes the count "dynamic" during
 * the last row: the per-rank AND per-suit figures stop moving for the
 * opponent's hidden cards while `unknownOnTable` climbs to five.
 *
 * The suit tally (`remainingBySuit`/`seenBySuit`) follows the identical
 * rule for the identical reason: a card in the opponent's face-down last
 * row has an unknown suit exactly as much as it has an unknown rank, so
 * it's excluded from both tallies the same way, via the same `see()`
 * call below (rank and suit are only ever counted together, from the
 * same real card).
 */
export function countRemaining({ myBoard, opponentBoard, knownCards = [] } = {}) {
  const seen = Object.fromEntries(RANKS.map((r) => [r, 0]))
  const seenBySuit = Object.fromEntries(SUITS.map((s) => [s, 0]))
  let seenTotal = 0

  const see = (card) => {
    if (!card?.rank || !card?.suit) return
    if (seen[card.rank] !== undefined) seen[card.rank] += 1
    if (seenBySuit[card.suit] !== undefined) seenBySuit[card.suit] += 1
    seenTotal += 1
  }

  for (const board of [myBoard, opponentBoard]) {
    if (!board) continue
    for (const col of COLUMNS) for (const card of board[col] ?? []) see(card)
  }
  for (const card of knownCards) see(card)

  // Placed by the opponent but unreadable: present in the column, no rank.
  let unknownOnTable = 0
  if (opponentBoard) {
    for (const col of COLUMNS) {
      for (const card of opponentBoard[col] ?? []) {
        if (card && !card.rank) unknownOnTable += 1
      }
    }
  }

  const remaining = Object.fromEntries(RANKS.map((r) => [r, COPIES_PER_RANK - seen[r]]))
  const remainingBySuit = Object.fromEntries(SUITS.map((s) => [s, COPIES_PER_SUIT - seenBySuit[s]]))
  return {
    remaining,
    seen,
    remainingBySuit,
    seenBySuit,
    seenTotal,
    unknownOnTable,
    unseenTotal: DECK_SIZE - seenTotal,
  }
}
