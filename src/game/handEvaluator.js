import { rankValue, suitValue } from './deck.js'

export const CATEGORY = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
}

export const CATEGORY_NAME = [
  'High Card',
  'Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
]

const RANK_LABEL = {
  14: 'Ace',
  13: 'King',
  12: 'Queen',
  11: 'Jack',
  10: 'Ten',
}
function rankLabel(v) {
  return RANK_LABEL[v] ?? String(v)
}

/**
 * @param {{rank:string,suit:string}[]} cards exactly 5 cards
 * @returns {{category:number, tiebreak:number[]}}
 */
export function evaluateHand(cards) {
  if (cards.length !== 5) {
    throw new Error(`evaluateHand requires exactly 5 cards, got ${cards.length}`)
  }
  // `suits` rides along on every result purely as the last-resort
  // tiebreak (see compareHands): the hand's suits ordered by the card
  // they belong to, strongest card first.
  const suits = cards
    .slice()
    .sort((x, y) => rankValue(y.rank) - rankValue(x.rank) || suitValue(y.suit) - suitValue(x.suit))
    .map((c) => suitValue(c.suit))
  return { ...classifyHand(cards), suits }
}

function classifyHand(cards) {
  const values = cards.map((c) => rankValue(c.rank)).sort((a, b) => b - a)
  const isFlush = cards.every((c) => c.suit === cards[0].suit)

  const counts = new Map()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
  const countShape = groups.map(([, n]) => n)

  const straightHigh = countShape.length === 5 ? straightHighCard(values) : null
  const isStraight = straightHigh !== null

  if (isStraight && isFlush) {
    return { category: CATEGORY.STRAIGHT_FLUSH, tiebreak: [straightHigh] }
  }
  if (countShape[0] === 4) {
    return { category: CATEGORY.QUADS, tiebreak: [groups[0][0], groups[1][0]] }
  }
  if (countShape[0] === 3 && countShape[1] === 2) {
    return { category: CATEGORY.FULL_HOUSE, tiebreak: [groups[0][0], groups[1][0]] }
  }
  if (isFlush) {
    return { category: CATEGORY.FLUSH, tiebreak: values }
  }
  if (isStraight) {
    return { category: CATEGORY.STRAIGHT, tiebreak: [straightHigh] }
  }
  if (countShape[0] === 3) {
    const kickers = groups.slice(1).map(([r]) => r)
    return { category: CATEGORY.TRIPS, tiebreak: [groups[0][0], ...kickers] }
  }
  if (countShape[0] === 2 && countShape[1] === 2) {
    const [pairHi, pairLo] = [groups[0][0], groups[1][0]].sort((a, b) => b - a)
    return { category: CATEGORY.TWO_PAIR, tiebreak: [pairHi, pairLo, groups[2][0]] }
  }
  if (countShape[0] === 2) {
    const kickers = groups.slice(1).map(([r]) => r)
    return { category: CATEGORY.PAIR, tiebreak: [groups[0][0], ...kickers] }
  }
  return { category: CATEGORY.HIGH_CARD, tiebreak: values }
}

// values: 5 distinct rank values, sorted descending. Returns the straight's
// high card value, or null if not consecutive (accounting for the wheel,
// A-2-3-4-5, where the Ace plays low and the straight's high card is 5).
function straightHighCard(values) {
  const isWheel = values.join(',') === [14, 5, 4, 3, 2].join(',')
  if (isWheel) return 5
  for (let i = 0; i < values.length - 1; i++) {
    if (values[i] - values[i + 1] !== 1) return null
  }
  return values[0]
}

/**
 * Returns 1 if a beats b, -1 if b beats a. Never returns 0 for two real
 * hands: a column always has a winner in this game, so once standard
 * poker ranking comes out level the suits decide it (spades > hearts >
 * diamonds > clubs), comparing the strongest card first.
 *
 * That final step can't itself end level. Equal category *and* equal
 * tiebreak implies both hands hold the same five rank values, and both
 * are drawn from one 52-card deck, so their suits cannot also match —
 * that would make them literally the same five cards. With no drawn
 * columns, and an odd five of them, a match can't end level either: the
 * column split is always 5-0, 4-1 or 3-2, exactly the three cases the
 * payout table covers (see calculatePayout).
 */
export function compareHands(a, b) {
  if (a.category !== b.category) return a.category > b.category ? 1 : -1
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const av = a.tiebreak[i] ?? 0
    const bv = b.tiebreak[i] ?? 0
    if (av !== bv) return av > bv ? 1 : -1
  }
  const aSuits = a.suits ?? []
  const bSuits = b.suits ?? []
  for (let i = 0; i < Math.max(aSuits.length, bSuits.length); i++) {
    const av = aSuits[i] ?? 0
    const bv = bSuits[i] ?? 0
    if (av !== bv) return av > bv ? 1 : -1
  }
  return 0
}

export function describeHand(evaluated) {
  const { category, tiebreak } = evaluated
  const name = CATEGORY_NAME[category]
  switch (category) {
    case CATEGORY.STRAIGHT_FLUSH:
      return tiebreak[0] === 14 ? 'Royal Flush' : `${name}, ${rankLabel(tiebreak[0])} high`
    case CATEGORY.QUADS:
      return `${name}, ${rankLabel(tiebreak[0])}s`
    case CATEGORY.FULL_HOUSE:
      return `${name}, ${rankLabel(tiebreak[0])}s full of ${rankLabel(tiebreak[1])}s`
    case CATEGORY.FLUSH:
      return `${name}, ${rankLabel(tiebreak[0])} high`
    case CATEGORY.STRAIGHT:
      return `${name}, ${rankLabel(tiebreak[0])} high`
    case CATEGORY.TRIPS:
      return `${name}, ${rankLabel(tiebreak[0])}s`
    case CATEGORY.TWO_PAIR:
      return `${name}, ${rankLabel(tiebreak[0])}s and ${rankLabel(tiebreak[1])}s`
    case CATEGORY.PAIR:
      return `${name} of ${rankLabel(tiebreak[0])}s`
    default:
      return `${name}, ${rankLabel(tiebreak[0])} high`
  }
}
