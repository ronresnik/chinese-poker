import { openColumnsForPlacement } from './board.js'
import { rankValue, RANKS } from './deck.js'
import { evaluateHand } from './handEvaluator.js'
import { evaluateSwapOptions, bestSwapOption } from './swap.js'
import { countRemaining, COPIES_PER_RANK, COPIES_PER_SUIT } from './cardCounting.js'

/**
 * The "AI Coach" is a statistical heuristic, not a trained model: it scores
 * how much potential a card adds to a partially-filled column (pair/flush/
 * straight draws) and, once a column is complete, its actual hand strength.
 * Placements and swaps are then rated by comparing the chosen option's
 * score against the best available alternative. This is deliberately
 * transparent and explainable — that's the point of a "coach" tip.
 *
 * A completed column (evaluateHand) and a swap decision (see swap.js) are
 * both *exact* — five real cards is five real cards, no probability
 * involved. The one place this coach used to guess blind was scoring a
 * still-open column's draw potential: a pair/flush/straight draw was
 * scored by a fixed table, with no regard for whether the specific cards
 * that would complete it are still findable in the deck. A "great" flush
 * draw kept scoring exactly the same whether the 5th needed suit card was
 * still fully live or every remaining copy of it was already dead on the
 * table. potentialScore now takes `remainingCounts` — see
 * game/cardCounting.js, the same per-rank/per-suit "what haven't I seen
 * yet" tally the on-screen counter uses — and scales each draw's score by
 * how many of its actual outs are still unseen, going to zero once none
 * are. That's the "considering the remaining cards" fix.
 */

function rankLabelForValue(value) {
  return RANKS[value - 2]
}

// Scores range roughly 0-39 for an open (not-yet-complete) column, and
// 40-96 for a column that would be completed by this placement — so a
// completed-column outcome always outranks a mere draw, which matches how
// a real player would weigh "sure thing" vs. "still drawing".
//
// `remainingCounts` is the result of cardCounting.js's countRemaining(),
// computed by the caller from whatever this player can legitimately see
// (their own board, the opponent's board with its hidden row masked, and
// the card in hand) — see scorePlacementOptions below. Omitting it falls
// back to treating every rank/suit as fully live, i.e. the old behavior;
// every real call site provides it.
export function potentialScore(existingCards, candidate, remainingCounts) {
  const cards = [...existingCards, candidate]
  const remainingSlots = 5 - cards.length

  if (remainingSlots === 0) {
    const hand = evaluateHand(cards)
    return 40 + hand.category * 7
  }

  const remaining = remainingCounts?.remaining
  const remainingBySuit = remainingCounts?.remainingBySuit

  const values = cards.map((c) => rankValue(c.rank))
  const suits = cards.map((c) => c.suit)

  const rankCounts = countBy(values)
  const maxRankCount = Math.max(...rankCounts.values())
  const matchedRankValue = [...rankCounts.entries()].find(([, n]) => n === maxRankCount)[0]
  const rankBase = [0, 6, 26, 58, 90][maxRankCount] ?? 90
  // How many more of this rank could still turn up, at most (you already
  // hold maxRankCount of the 4 copies a deck has) versus how many the
  // deck-aware tally says are actually still unseen. A pair whose other
  // two copies are both already visible elsewhere scores 0 here, not the
  // flat table value the old heuristic gave every pair alike.
  const maxRankOuts = COPIES_PER_RANK - maxRankCount
  const rankOuts = remaining ? remaining[rankLabelForValue(matchedRankValue)] : maxRankOuts
  const pairScore = maxRankOuts > 0 ? rankBase * (Math.min(rankOuts, maxRankOuts) / maxRankOuts) : 0

  const suitCounts = countBy(suits)
  const maxSuitCount = Math.max(...suitCounts.values())
  const matchedSuit = [...suitCounts.entries()].find(([, n]) => n === maxSuitCount)[0]
  const flushPossible = maxSuitCount + remainingSlots >= 5
  const maxSuitOuts = COPIES_PER_SUIT - maxSuitCount
  const suitOuts = remainingBySuit ? remainingBySuit[matchedSuit] : maxSuitOuts
  const flushScore =
    flushPossible && maxSuitOuts > 0 ? maxSuitCount * 12 * (Math.min(suitOuts, maxSuitOuts) / maxSuitOuts) : 0

  const uniqueValues = [...new Set(values)].sort((a, b) => a - b)
  let straightScore = 0
  if (uniqueValues.length === cards.length) {
    const span = uniqueValues[uniqueValues.length - 1] - uniqueValues[0]
    const gapsInside = span - (uniqueValues.length - 1)
    if (span <= 4 && gapsInside <= remainingSlots) {
      const missingValues = []
      for (let v = uniqueValues[0]; v <= uniqueValues[uniqueValues.length - 1]; v++) {
        if (!uniqueValues.includes(v)) missingValues.push(v)
      }
      // Every gap card scoring 0 outs (all four copies already dead
      // elsewhere) makes this specific straight impossible now, not just
      // "less likely" — the score should say so, not shrug it off as a
      // generic reduced draw.
      const maxGapOuts = gapsInside * COPIES_PER_RANK
      const gapOuts = remaining
        ? missingValues.reduce((sum, v) => sum + Math.min(remaining[rankLabelForValue(v)] ?? 0, COPIES_PER_RANK), 0)
        : maxGapOuts
      straightScore = maxGapOuts > 0 ? (30 - gapsInside * 5) * (gapOuts / maxGapOuts) : 30 - gapsInside * 5
    }
  }

  const score = pairScore * 0.5 + flushScore * 0.3 + straightScore * 0.3
  return Math.min(39, Math.max(0, score))
}

/**
 * `opponentBoard` should already be scoped to what this player can
 * legitimately see — the opponent's hidden final row masked out (see
 * game/board.js's maskHiddenRow) unless showdown has actually opened it.
 * The online store's opponentBoard is already scoped this way by
 * construction; the local engine holds true data for both sides
 * internally (see game/README.md) and must mask explicitly when scoring
 * either player's move, or a "coach" would be reasoning from cards it —
 * or the bot — has no legitimate way to know.
 */
export function scorePlacementOptions(board, card, opponentBoard) {
  const remainingCounts = countRemaining({ myBoard: board, opponentBoard, knownCards: [card] })
  return openColumnsForPlacement(board)
    .map((col) => ({ col, score: potentialScore(board[col], card, remainingCounts) }))
    .sort((a, b) => b.score - a.score)
}

function ratingForRank(rankIndex, total) {
  if (rankIndex === 0) return 'great'
  if (rankIndex <= Math.ceil(total / 2)) return 'ok'
  return 'risky'
}

function colLabel(col) {
  return col.replace('col', 'Column ')
}

export function coachTipForPlacement(board, card, chosenCol, opponentBoard) {
  const ranked = scorePlacementOptions(board, card, opponentBoard)
  const rankIndex = ranked.findIndex((o) => o.col === chosenCol)
  const chosen = ranked[rankIndex]
  const best = ranked[0]
  const rating = ratingForRank(rankIndex, ranked.length)

  const message =
    rating === 'great'
      ? `Great placement — ${colLabel(chosenCol)} was the strongest spot for this card.`
      : `${rating === 'risky' ? 'Risky' : 'Reasonable'} — ${colLabel(best.col)} looked stronger for this card (${Math.round(best.score)} vs ${Math.round(chosen.score)}).`

  return { rating, message, bestCol: best.col, options: ranked }
}

export function coachTipForSwap(board, swapCard, chosenCol) {
  const options = evaluateSwapOptions(board, swapCard)
  const best = bestSwapOption(board, swapCard)

  if (!chosenCol) {
    if (!best) {
      return {
        rating: 'great',
        message: 'Good call keeping your board as is — no swap here would have improved a column.',
        bestCol: null,
        options,
      }
    }
    return {
      rating: 'risky',
      message: `Consider swapping into ${colLabel(best.col)} instead — it would have upgraded that column to ${describeUpgrade(best)}.`,
      bestCol: best.col,
      options,
    }
  }

  const chosenOption = options.find((o) => o.col === chosenCol)
  if (chosenOption.improves && (!best || best.col === chosenCol)) {
    return {
      rating: 'great',
      message: `Great swap — ${colLabel(chosenCol)} improves to ${describeUpgrade(chosenOption)}.`,
      bestCol: best?.col ?? chosenCol,
      options,
    }
  }
  if (chosenOption.improves) {
    return {
      rating: 'ok',
      message: `This helps ${colLabel(chosenCol)}, but ${colLabel(best.col)} would have been the bigger upgrade.`,
      bestCol: best.col,
      options,
    }
  }
  return {
    rating: 'risky',
    message: chosenOption.worsens
      ? `This actually weakens ${colLabel(chosenCol)} — consider keeping your board as is.`
      : `This swap doesn't change ${colLabel(chosenCol)}'s strength — consider keeping your board as is.`,
    bestCol: best?.col ?? null,
    options,
  }
}

function describeUpgrade(option) {
  return `a ${['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'][option.swappedHand.category]}`
}

function countBy(values) {
  const map = new Map()
  for (const v of values) map.set(v, (map.get(v) ?? 0) + 1)
  return map
}
