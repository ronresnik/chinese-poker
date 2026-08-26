import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculatePayout, columnOutcomesFor, evaluateShowdown } from './scoring.js'
import { createEmptyBoard, placeCard } from './board.js'

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

test('evaluateShowdown tags each column with a uid-keyed hands map and columnOutcomesFor reads it per-perspective', () => {
  let boardA = createEmptyBoard()
  let boardB = createEmptyBoard()
  for (const code of ['Ah', 'Kh', 'Qh', 'Jh', 'Th']) boardA = placeCard(boardA, 'col1', c(code))
  for (const code of ['2c', '5d', '9h', 'Ks', '3c']) boardB = placeCard(boardB, 'col1', c(code))
  for (const col of ['col2', 'col3', 'col4', 'col5']) {
    for (const code of ['2c', '5d', '9h', 'Ks', '3c']) boardA = placeCard(boardA, col, c(code))
    for (const code of ['Ah', 'Kh', 'Qh', 'Jh', 'Th']) boardB = placeCard(boardB, col, c(code))
  }

  const showdown = evaluateShowdown({ uid: 'A', board: boardA }, { uid: 'B', board: boardB })
  assert.equal(showdown.columns[0].hands.A.category, showdown.columns[0].handA.category)
  assert.equal(showdown.columns[0].winnerUid, 'A')

  const fromA = columnOutcomesFor(showdown.columns, 'A')
  const fromB = columnOutcomesFor(showdown.columns, 'B')
  assert.equal(fromA.col1, 'win')
  assert.equal(fromB.col1, 'lose')
  assert.equal(fromA.col2, 'lose')
  assert.equal(fromB.col2, 'win')
})

function c(code) {
  return { rank: code.slice(0, -1), suit: code.slice(-1) }
}
