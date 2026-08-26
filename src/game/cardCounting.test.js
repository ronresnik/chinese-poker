import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countRemaining, COPIES_PER_RANK, DECK_SIZE } from './cardCounting.js'
import { createEmptyBoard, placeCard, COLUMNS, maskHiddenRow } from './board.js'

function c(code) {
  return { rank: code.slice(0, -1), suit: code.slice(-1) }
}

function boardWith(perColumn) {
  let board = createEmptyBoard()
  COLUMNS.forEach((col, i) => {
    for (const code of perColumn[i] ?? []) board = placeCard(board, col, c(code))
  })
  return board
}

test('an untouched table has all four of every rank unseen', () => {
  const { remaining, unseenTotal, unknownOnTable } = countRemaining({})
  assert.equal(remaining['A'], COPIES_PER_RANK)
  assert.equal(remaining['7'], COPIES_PER_RANK)
  assert.equal(unseenTotal, DECK_SIZE)
  assert.equal(unknownOnTable, 0)
})

test('face-up cards on either board are subtracted from their rank', () => {
  const mine = boardWith([['7s', '7h'], [], [], [], []])
  const theirs = boardWith([['7d'], [], [], [], []])
  const { remaining, seenTotal, unseenTotal } = countRemaining({ myBoard: mine, opponentBoard: theirs })
  assert.equal(remaining['7'], 1)
  assert.equal(seenTotal, 3)
  assert.equal(unseenTotal, DECK_SIZE - 3)
})

test('the card in hand and the swap card count as seen', () => {
  const { remaining } = countRemaining({ knownCards: [c('As'), c('Ah')] })
  assert.equal(remaining['A'], 2)
})

test("your own final row is seen by you but the opponent's is not — the two players count differently", () => {
  // Both players hold a full column; the 5th card of each is face-down
  // to the other. This is the case the counter has to get right.
  const ronFull = boardWith([['2s', '3s', '4s', '5s', 'Ks'], [], [], [], []])
  const samFull = boardWith([['2h', '3h', '4h', '5h', 'Kh'], [], [], [], []])

  // From Ron's seat: his own King is visible, Sam's is masked.
  const ron = countRemaining({ myBoard: ronFull, opponentBoard: maskHiddenRow(samFull) })
  // From Sam's seat: mirror image.
  const sam = countRemaining({ myBoard: samFull, opponentBoard: maskHiddenRow(ronFull) })

  // Each sees exactly one King — their own — so each still counts 3 left.
  assert.equal(ron.remaining['K'], 3)
  assert.equal(sam.remaining['K'], 3)

  // And each knows one card is committed face-down that they can't read.
  assert.equal(ron.unknownOnTable, 1)
  assert.equal(sam.unknownOnTable, 1)

  // The counts genuinely differ: Ron has seen the spade King, Sam the heart one.
  assert.equal(ron.seen['K'], 1)
  assert.equal(sam.seen['K'], 1)
  assert.notEqual(ron.unseenTotal, DECK_SIZE)
})

test("the opponent's hidden cards are never guessed at — they stay in the unseen pool", () => {
  const theirs = maskHiddenRow(
    boardWith([
      ['2s', '3s', '4s', '5s', 'As'],
      ['2h', '3h', '4h', '5h', 'Ah'],
      ['2d', '3d', '4d', '5d', 'Ad'],
      ['2c', '3c', '4c', '5c', 'Ac'],
      ['6s', '7s', '8s', '9s', 'Ts'],
    ]),
  )
  const { remaining, unknownOnTable } = countRemaining({ opponentBoard: theirs })

  // All four Aces sit in that hidden row. They are off the table, but the
  // player cannot know that, so every Ace must still read as unseen —
  // subtracting them would be inventing information.
  assert.equal(remaining['A'], COPIES_PER_RANK)
  // Five face-down cards placed, five reported as unreadable.
  assert.equal(unknownOnTable, 5)
})

test('unknownOnTable climbs only as the final row is actually placed', () => {
  const fourRows = boardWith([
    ['2s', '3s', '4s', '5s'],
    ['2h', '3h', '4h', '5h'],
    ['2d', '3d', '4d', '5d'],
    ['2c', '3c', '4c', '5c'],
    ['6s', '7s', '8s', '9s'],
  ])
  assert.equal(countRemaining({ opponentBoard: maskHiddenRow(fourRows) }).unknownOnTable, 0)

  const plusOne = placeCard(fourRows, 'col1', c('Ks'))
  assert.equal(countRemaining({ opponentBoard: maskHiddenRow(plusOne) }).unknownOnTable, 1)
})

test('seen and remaining always add up to a full deck of each rank', () => {
  const mine = boardWith([['9s', '9h', '9d'], ['Js'], [], [], []])
  const theirs = boardWith([['9c'], [], [], [], []])
  const { remaining, seen } = countRemaining({ myBoard: mine, opponentBoard: theirs, knownCards: [c('Jh')] })
  assert.equal(remaining['9'] + seen['9'], COPIES_PER_RANK)
  assert.equal(remaining['9'], 0)
  assert.equal(remaining['J'], 2)
})
