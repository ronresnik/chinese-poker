import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyBoard, placeCard } from './board.js'
import { coachTipForPlacement, coachTipForSwap, scorePlacementOptions } from './aiCoach.js'
import { chooseBotPlacement, chooseBotSwap } from './bot.js'

function c(code) {
  return { rank: code.slice(0, -1), suit: code.slice(-1) }
}

function fillColumn(board, col, codes) {
  let b = board
  for (const code of codes) b = placeCard(b, col, c(code))
  return b
}

// Fills every column with a royal flush (As Ks Qs Js Ts) — the best
// possible 5-card hand, so no single-card swap can ever improve it. Board
// rules don't enforce cross-column/deck uniqueness (that's a Firebase-rules
// concern for the online mode, see docs/firebase-schema.md), so this is a
// safe fixture for exercising "nothing improves" logic in isolation.
function fullUnbeatableBoard() {
  let board = createEmptyBoard()
  for (const col of ['col1', 'col2', 'col3', 'col4', 'col5']) {
    board = fillColumn(board, col, ['As', 'Ks', 'Qs', 'Js', 'Ts'])
  }
  return board
}

test('a card completing a flush scores higher than a random open column', () => {
  let board = createEmptyBoard()
  board = fillColumn(board, 'col1', ['2c', '5c', '9c', 'Kc'])
  const options = scorePlacementOptions(board, c('7c'))
  const col1 = options.find((o) => o.col === 'col1')
  const col2 = options.find((o) => o.col === 'col2')
  assert.ok(col1.score > col2.score)
})

test('coachTipForPlacement rates the best column as great', () => {
  let board = createEmptyBoard()
  board = fillColumn(board, 'col1', ['2c', '5c', '9c', 'Kc'])
  const tip = coachTipForPlacement(board, c('7c'), 'col1')
  assert.equal(tip.rating, 'great')
})

test('coachTipForPlacement rates a weak column as risky when a strong one was open', () => {
  let board = createEmptyBoard()
  board = fillColumn(board, 'col1', ['2c', '5c', '9c', 'Kc'])
  const tip = coachTipForPlacement(board, c('7c'), 'col5')
  assert.equal(tip.bestCol, 'col1')
  assert.notEqual(tip.rating, 'great')
})

test('coachTipForSwap: swapping into an improving column is rated well', () => {
  let board = fullUnbeatableBoard()
  // col1 is 4 spades toward a royal flush, but the hidden 5th card breaks
  // it (off-suit) — swapping in the missing Ts completes the royal flush.
  board = { ...board, col1: [c('As'), c('Ks'), c('Qs'), c('Js'), { ...c('2h'), faceDown: true }] }
  const tip = coachTipForSwap(board, c('Ts'), 'col1')
  assert.ok(tip.rating === 'great' || tip.rating === 'ok')
})

test('coachTipForSwap: keeping board when nothing improves is rated great', () => {
  const board = fullUnbeatableBoard()
  const tip = coachTipForSwap(board, c('9h'), null)
  assert.equal(tip.rating, 'great')
})

test('bot placement always chooses one of the open columns', () => {
  let board = createEmptyBoard()
  board = fillColumn(board, 'col1', ['2c', '5c', '9c', 'Kc'])
  const col = chooseBotPlacement(board, c('7c'), () => 0.99) // force exploitation path
  assert.equal(col, 'col1')
})

test('bot swap returns null when no swap improves', () => {
  const board = fullUnbeatableBoard()
  assert.equal(chooseBotSwap(board, c('9h')), null)
})
