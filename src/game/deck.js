export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
export const SUITS = ['s', 'h', 'd', 'c']

// Standard high-to-low suit order (spades, hearts, diamonds, clubs), used
// only as the final tiebreak between two otherwise exactly-equal hands so
// a column can never be drawn — see compareHands in handEvaluator.js.
const SUIT_VALUE = { s: 4, h: 3, d: 2, c: 1 }

export function suitValue(suit) {
  return SUIT_VALUE[suit] ?? 0
}

const RANK_VALUE = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]))

export function rankValue(rank) {
  return RANK_VALUE[rank]
}

export function cardCode(card) {
  return `${card.rank}${card.suit}`
}

export function parseCardCode(code) {
  return { rank: code.slice(0, -1), suit: code.slice(-1) }
}

export function createDeck() {
  const deck = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit })
    }
  }
  return deck
}

// Fisher-Yates using crypto randomness (rather than Math.random) so a
// single-player shuffle isn't trivially predictable.
export function shuffle(cards) {
  const deck = cards.slice()
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  return deck
}

function randomInt(exclusiveMax) {
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : globalThis.crypto
  const range = exclusiveMax
  const maxUint32 = 0xffffffff
  const limit = maxUint32 - (maxUint32 % range)
  const buf = new Uint32Array(1)
  let value
  do {
    cryptoObj.getRandomValues(buf)
    value = buf[0]
  } while (value >= limit)
  return value % range
}

export function createShuffledDeck() {
  return shuffle(createDeck())
}
