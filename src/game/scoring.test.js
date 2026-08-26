import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculatePayout } from './scoring.js'

test('3-2 win pays 1 column value', () => {
  const r = calculatePayout({ A: 3, B: 2 }, 'A', 'B', 5)
  assert.equal(r.winnerUid, 'A')
  assert.equal(r.diff, 1)
  assert.equal(r.sweep, false)
  assert.equal(r.payout, 5)
})

test('4-1 win pays 3 column values', () => {
  const r = calculatePayout({ A: 4, B: 1 }, 'A', 'B', 5)
  assert.equal(r.winnerUid, 'A')
  assert.equal(r.diff, 3)
  assert.equal(r.payout, 15)
})

test('5-0 sweep pays 5 column values doubled', () => {
  const r = calculatePayout({ A: 5, B: 0 }, 'A', 'B', 5)
  assert.equal(r.winnerUid, 'A')
  assert.equal(r.sweep, true)
  assert.equal(r.payout, 50)
})

test('sweep the other direction', () => {
  const r = calculatePayout({ A: 0, B: 5 }, 'A', 'B', 10)
  assert.equal(r.winnerUid, 'B')
  assert.equal(r.loserUid, 'A')
  assert.equal(r.payout, 100)
})

test('even split (with a tied column) is a push', () => {
  const r = calculatePayout({ A: 2, B: 2 }, 'A', 'B', 5)
  assert.equal(r.winnerUid, null)
  assert.equal(r.payout, 0)
})

test('3-1 with a tied column: no sweep multiplier since loser won one', () => {
  const r = calculatePayout({ A: 3, B: 1 }, 'A', 'B', 5)
  assert.equal(r.sweep, false)
  assert.equal(r.diff, 2)
  assert.equal(r.payout, 10)
})
