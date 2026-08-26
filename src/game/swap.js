import { COLUMNS, replaceHiddenCard } from './board.js'
import { evaluateHand, compareHands } from './handEvaluator.js'

/** Applies a player's swap decision (or no-op if col is null/undefined). */
export function applySwap(board, col, swapCard) {
  if (!col) return { board, discarded: swapCard }
  return replaceHiddenCard(board, col, swapCard)
}

/**
 * For each column, compares "keep the current hidden card" against
 * "swap in the offered card" using full information (this only ever runs
 * on the owning player's own client/state, so seeing their own hidden
 * cards is expected, not a security concern).
 */
export function evaluateSwapOptions(board, swapCard) {
  return COLUMNS.map((col) => {
    const cards = board[col]
    const currentHand = evaluateHand(cards)
    const swappedCards = cards.slice(0, 4).concat([swapCard])
    const swappedHand = evaluateHand(swappedCards)
    const improvement = compareHands(swappedHand, currentHand)
    return { col, currentHand, swappedHand, improves: improvement > 0, worsens: improvement < 0 }
  })
}

export function bestSwapOption(board, swapCard) {
  const options = evaluateSwapOptions(board, swapCard)
  const improving = options.filter((o) => o.improves)
  if (improving.length === 0) return null
  improving.sort((a, b) => {
    const cmp = compareHands(a.swappedHand, a.currentHand)
    // rank improving options by how much stronger the swapped hand is
    const marginA = handStrengthScore(a.swappedHand) - handStrengthScore(a.currentHand)
    const marginB = handStrengthScore(b.swappedHand) - handStrengthScore(b.currentHand)
    return marginB - marginA || cmp
  })
  return improving[0]
}

// Coarse, monotonic-with-compareHands numeric score used only to rank
// *how much* one option beats another, not to compare across categories
// on its own (compareHands already does exact ranking; this just gives
// evaluateSwapOptions/bestSwapOption a single number to sort by).
function handStrengthScore(hand) {
  return hand.category * 1_000_000 + hand.tiebreak.reduce((acc, v, i) => acc + v * 10 ** (4 - i), 0)
}
