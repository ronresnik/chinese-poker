import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyBoard, placeCard, isColumnFull, isBoardFull, openColumns, replaceHiddenCard } from './board.js'

test('columns fill bottom-to-top and only the 5th card is face-down', () => {
  let board = createEmptyBoard()
  const cards = [
    { rank: '2', suit: 's' },
    { rank: '3', suit: 's' },
    { rank: '4', suit: 's' },
    { rank: '5', suit: 's' },
    { rank: '6', suit: 's' },
  ]
  for (const c of cards) board = placeCard(board, 'col1', c)

  assert.equal(isColumnFull(board, 'col1'), true)
  assert.deepEqual(
    board.col1.map((c) => c.faceDown),
    [false, false, false, false, true],
  )
})

test('cannot place into a full column', () => {
  let board = createEmptyBoard()
  for (let i = 0; i < 5; i++) board = placeCard(board, 'col1', { rank: '2', suit: 's' })
  assert.throws(() => placeCard(board, 'col1', { rank: '3', suit: 'h' }))
})

test('openColumns excludes full columns', () => {
  let board = createEmptyBoard()
  for (let i = 0; i < 5; i++) board = placeCard(board, 'col1', { rank: '2', suit: 's' })
  assert.deepEqual(openColumns(board), ['col2', 'col3', 'col4', 'col5'])
})

test('isBoardFull only true once every column has 5 cards', () => {
  let board = createEmptyBoard()
  assert.equal(isBoardFull(board), false)
  for (const col of ['col1', 'col2', 'col3', 'col4', 'col5']) {
    for (let i = 0; i < 5; i++) board = placeCard(board, col, { rank: '2', suit: 's' })
  }
  assert.equal(isBoardFull(board), true)
})

test('replaceHiddenCard swaps the face-down card and returns the discard', () => {
  let board = createEmptyBoard()
  for (let i = 0; i < 4; i++) board = placeCard(board, 'col1', { rank: '2', suit: 's' })
  board = placeCard(board, 'col1', { rank: 'A', suit: 'h' })

  const { board: updated, discarded } = replaceHiddenCard(board, 'col1', { rank: 'K', suit: 'd' })
  assert.deepEqual(discarded, { rank: 'A', suit: 'h' })
  assert.equal(updated.col1[4].rank, 'K')
  assert.equal(updated.col1[4].faceDown, true)
})
