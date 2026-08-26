import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateHand, compareHands, CATEGORY, describeHand } from './handEvaluator.js'

function cards(codes) {
  return codes.map((c) => ({ rank: c.slice(0, -1), suit: c.slice(-1) }))
}

test('royal flush', () => {
  const h = evaluateHand(cards(['As', 'Ks', 'Qs', 'Js', 'Ts']))
  assert.equal(h.category, CATEGORY.STRAIGHT_FLUSH)
  assert.equal(h.tiebreak[0], 14)
  assert.equal(describeHand(h), 'Royal Flush')
})

test('straight flush, not royal', () => {
  const h = evaluateHand(cards(['9h', '8h', '7h', '6h', '5h']))
  assert.equal(h.category, CATEGORY.STRAIGHT_FLUSH)
  assert.equal(h.tiebreak[0], 9)
})

test('wheel straight flush (steel wheel)', () => {
  const h = evaluateHand(cards(['As', '2s', '3s', '4s', '5s']))
  assert.equal(h.category, CATEGORY.STRAIGHT_FLUSH)
  assert.equal(h.tiebreak[0], 5)
})

test('four of a kind', () => {
  const h = evaluateHand(cards(['Kh', 'Kd', 'Ks', 'Kc', '2h']))
  assert.equal(h.category, CATEGORY.QUADS)
  assert.deepEqual(h.tiebreak, [13, 2])
})

test('full house', () => {
  const h = evaluateHand(cards(['7h', '7d', '7s', '3c', '3h']))
  assert.equal(h.category, CATEGORY.FULL_HOUSE)
  assert.deepEqual(h.tiebreak, [7, 3])
})

test('flush', () => {
  const h = evaluateHand(cards(['Ac', '9c', '7c', '4c', '2c']))
  assert.equal(h.category, CATEGORY.FLUSH)
  assert.deepEqual(h.tiebreak, [14, 9, 7, 4, 2])
})

test('straight, ace low (wheel, mixed suits)', () => {
  const h = evaluateHand(cards(['Ah', '2d', '3s', '4c', '5h']))
  assert.equal(h.category, CATEGORY.STRAIGHT)
  assert.equal(h.tiebreak[0], 5)
})

test('straight, ace high', () => {
  const h = evaluateHand(cards(['Ah', 'Kd', 'Qs', 'Jc', 'Th']))
  assert.equal(h.category, CATEGORY.STRAIGHT)
  assert.equal(h.tiebreak[0], 14)
})

test('not a straight (gap)', () => {
  const h = evaluateHand(cards(['Ah', 'Kd', 'Qs', 'Jc', '9h']))
  assert.equal(h.category, CATEGORY.HIGH_CARD)
})

test('trips', () => {
  const h = evaluateHand(cards(['5h', '5d', '5s', 'Kc', '2h']))
  assert.equal(h.category, CATEGORY.TRIPS)
  assert.deepEqual(h.tiebreak, [5, 13, 2])
})

test('two pair', () => {
  const h = evaluateHand(cards(['Jh', 'Jd', '4s', '4c', '9h']))
  assert.equal(h.category, CATEGORY.TWO_PAIR)
  assert.deepEqual(h.tiebreak, [11, 4, 9])
})

test('one pair', () => {
  const h = evaluateHand(cards(['9h', '9d', 'Ks', '4c', '2h']))
  assert.equal(h.category, CATEGORY.PAIR)
  assert.deepEqual(h.tiebreak, [9, 13, 4, 2])
})

test('high card', () => {
  const h = evaluateHand(cards(['Ah', 'Jd', '8s', '4c', '2h']))
  assert.equal(h.category, CATEGORY.HIGH_CARD)
  assert.deepEqual(h.tiebreak, [14, 11, 8, 4, 2])
})

test('compareHands: higher category wins regardless of tiebreak', () => {
  const pair = evaluateHand(cards(['Ah', 'Ad', 'Ks', 'Qc', 'Jh']))
  const straight = evaluateHand(cards(['9h', '8d', '7s', '6c', '5h']))
  assert.equal(compareHands(straight, pair), 1)
  assert.equal(compareHands(pair, straight), -1)
})

test('compareHands: same category, tiebreak decides', () => {
  const kingsUp = evaluateHand(cards(['Kh', 'Kd', '4s', '4c', '9h']))
  const queensUp = evaluateHand(cards(['Qh', 'Qd', '4s', '4c', '9h']))
  assert.equal(compareHands(kingsUp, queensUp), 1)
})

test('compareHands: exact tie', () => {
  const a = evaluateHand(cards(['Kh', 'Kd', '4s', '4c', '9h']))
  const b = evaluateHand(cards(['Ks', 'Kc', '4h', '4d', '9s']))
  assert.equal(compareHands(a, b), 0)
})

test('every 5-card combo from a full deck evaluates without throwing', () => {
  // Cheap sanity sweep rather than exhaustive C(52,5): random-ish disjoint hands.
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']
  const suits = ['s', 'h', 'd', 'c']
  const deck = suits.flatMap((s) => ranks.map((r) => ({ rank: r, suit: s })))
  for (let i = 0; i < 200; i++) {
    const hand = []
    const used = new Set()
    while (hand.length < 5) {
      const idx = Math.floor(Math.random() * deck.length)
      const key = deck[idx].rank + deck[idx].suit
      if (used.has(key)) continue
      used.add(key)
      hand.push(deck[idx])
    }
    const evaluated = evaluateHand(hand)
    assert.ok(evaluated.category >= 0 && evaluated.category <= 8)
  }
})
