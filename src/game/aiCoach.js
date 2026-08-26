import { openColumns } from './board.js'
import { rankValue } from './deck.js'
import { evaluateHand } from './handEvaluator.js'
import { evaluateSwapOptions, bestSwapOption } from './swap.js'

/**
 * The "AI Coach" is a statistical heuristic, not a trained model: it scores
 * how much potential a card adds to a partially-filled column (pair/flush/
 * straight draws) and, once a column is complete, its actual hand strength.
 * Placements and swaps are then rated by comparing the chosen option's
 * score against the best available alternative. This is deliberately
 * transparent and explainable — that's the point of a "coach" tip.
 */

// Scores range roughly 0-39 for an open (not-yet-complete) column, and
// 40-96 for a column that would be completed by this placement — so a
// completed-column outcome always outranks a mere draw, which matches how
// a real player would weigh "sure thing" vs. "still drawing".
export function potentialScore(existingCards, candidate) {
  const cards = [...existingCards, candidate]
  const remainingSlots = 5 - cards.length

  if (remainingSlots === 0) {
    const hand = evaluateHand(cards)
    return 40 + hand.category * 7
  }

  const values = cards.map((c) => rankValue(c.rank))
  const suits = cards.map((c) => c.suit)

  const rankCounts = countBy(values)
  const maxRankCount = Math.max(...rankCounts.values())
  const pairScore = [0, 6, 26, 58, 90][maxRankCount] ?? 90

  const suitCounts = countBy(suits)
  const maxSuitCount = Math.max(...suitCounts.values())
  const flushPossible = maxSuitCount + remainingSlots >= 5
  const flushScore = flushPossible ? maxSuitCount * 12 : 0

  const uniqueValues = [...new Set(values)].sort((a, b) => a - b)
  let straightScore = 0
  if (uniqueValues.length === cards.length) {
    const span = uniqueValues[uniqueValues.length - 1] - uniqueValues[0]
    const gapsInside = span - (uniqueValues.length - 1)
    if (span <= 4 && gapsInside <= remainingSlots) {
      straightScore = 30 - gapsInside * 5
    }
  }

  const score = pairScore * 0.5 + flushScore * 0.3 + straightScore * 0.3
  return Math.min(39, Math.max(0, score))
}

export function scorePlacementOptions(board, card) {
  return openColumns(board)
    .map((col) => ({ col, score: potentialScore(board[col], card) }))
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

export function coachTipForPlacement(board, card, chosenCol) {
  const ranked = scorePlacementOptions(board, card)
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
