import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  createEmptyBoard,
  placeCard,
  isColumnFull,
  isBoardFull,
  openColumns,
  openColumnsForPlacement,
  dealInitialRow,
  replaceHiddenCard,
  maskHiddenRow,
  COLUMNS,
} from './board.js'

function c(code) {
  return { rank: code.slice(0, -1), suit: code.slice(-1) }
}

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

test('dealInitialRow places one card per column, in order, all face-up', () => {
  const board = dealInitialRow(createEmptyBoard(), ['2s', '3h', '4d', '5c', '6s'].map(c))
  assert.deepEqual(
    COLUMNS.map((col) => board[col].length),
    [1, 1, 1, 1, 1],
  )
  assert.deepEqual(
    COLUMNS.map((col) => board[col][0].rank),
    ['2', '3', '4', '5', '6'],
  )
  assert.equal(
    COLUMNS.every((col) => board[col][0].faceDown === false),
    true,
  )
})

test('openColumnsForPlacement only allows the least-filled column(s) — enforces row-by-row fill', () => {
  let board = dealInitialRow(createEmptyBoard(), ['2s', '3h', '4d', '5c', '6s'].map(c))
  // every column has 1 card: all 5 are eligible for row 1
  assert.deepEqual(openColumnsForPlacement(board), COLUMNS)

  // fill col1's row 1 -> col1 is now ahead (length 2) and must wait
  board = placeCard(board, 'col1', c('7s'))
  assert.deepEqual(openColumnsForPlacement(board), ['col2', 'col3', 'col4', 'col5'])

  // finish row 1 everywhere else -> row 2 opens up for all 5 again
  for (const col of ['col2', 'col3', 'col4', 'col5']) board = placeCard(board, col, c('7h'))
  assert.deepEqual(openColumnsForPlacement(board), COLUMNS)
})

test('openColumnsForPlacement returns empty once the board is full', () => {
  let board = createEmptyBoard()
  for (const col of COLUMNS) {
    for (let i = 0; i < 5; i++) board = placeCard(board, col, c('2s'))
  }
  assert.deepEqual(openColumnsForPlacement(board), [])
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

test('maskHiddenRow strips rank/suit from every column\'s row-4 card, leaves rows 0-3 untouched', () => {
  let board = createEmptyBoard()
  for (const col of COLUMNS) {
    for (let i = 0; i < 5; i++) board = placeCard(board, col, c(`${2 + i}s`))
  }

  const masked = maskHiddenRow(board)
  for (const col of COLUMNS) {
    assert.deepEqual(
      masked[col].slice(0, 4),
      board[col].slice(0, 4),
    )
    assert.deepEqual(masked[col][4], { faceDown: true })
    assert.equal(masked[col][4].rank, undefined)
    assert.equal(masked[col][4].suit, undefined)
  }
})
