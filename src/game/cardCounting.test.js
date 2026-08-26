import { test } from 'node:test'
import assert from 'node:assert/strict'
import { countRemaining, COPIES_PER_RANK, COPIES_PER_SUIT, DECK_SIZE } from './cardCounting.js'
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

test('an untouched table has all four of every rank, and all 13 of every suit, unseen', () => {
  const { remaining, remainingBySuit, unseenTotal, unknownOnTable } = countRemaining({})
  assert.equal(remaining['A'], COPIES_PER_RANK)
  assert.equal(remaining['7'], COPIES_PER_RANK)
  assert.equal(remainingBySuit['s'], COPIES_PER_SUIT)
  assert.equal(remainingBySuit['h'], COPIES_PER_SUIT)
  assert.equal(unseenTotal, DECK_SIZE)
  assert.equal(unknownOnTable, 0)
})

test('face-up cards on either board are subtracted from their rank AND their suit', () => {
  const mine = boardWith([['7s', '7h'], [], [], [], []])
  const theirs = boardWith([['7d'], [], [], [], []])
  const { remaining, remainingBySuit, seenTotal, unseenTotal } = countRemaining({ myBoard: mine, opponentBoard: theirs })
  assert.equal(remaining['7'], 1)
  assert.equal(remainingBySuit['s'], COPIES_PER_SUIT - 1)
  assert.equal(remainingBySuit['h'], COPIES_PER_SUIT - 1)
  assert.equal(remainingBySuit['d'], COPIES_PER_SUIT - 1)
  assert.equal(remainingBySuit['c'], COPIES_PER_SUIT)
  assert.equal(seenTotal, 3)
  assert.equal(unseenTotal, DECK_SIZE - 3)
})

test('the card in hand and the swap card count as seen, by rank and suit', () => {
  const { remaining, remainingBySuit } = countRemaining({ knownCards: [c('As'), c('Ah')] })
  assert.equal(remaining['A'], 2)
  assert.equal(remainingBySuit['s'], COPIES_PER_SUIT - 1)
  assert.equal(remainingBySuit['h'], COPIES_PER_SUIT - 1)
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

  // Same asymmetry, one level down. Ron's own column is all spades (5
  // cards, all seen); Sam's masked column is all hearts, but only its
  // first 4 (rows 0-3, face-up) are visible to Ron — Sam's hidden Kh
  // isn't. So Ron has seen 5 spades and 4 hearts; Sam, the mirror image.
  assert.equal(ron.remainingBySuit['s'], COPIES_PER_SUIT - 5)
  assert.equal(ron.remainingBySuit['h'], COPIES_PER_SUIT - 4)
  assert.equal(sam.remainingBySuit['h'], COPIES_PER_SUIT - 5)
  assert.equal(sam.remainingBySuit['s'], COPIES_PER_SUIT - 4)
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

test("the opponent's hidden cards are never guessed at by suit either", () => {
  // Every hidden card in this layout happens to be a spade (As, Ts, and
  // col5's own As are all masked) — if the suit tally leaked anything
  // from a masked card, spades would be the rank/suit combo to catch it.
  const theirs = maskHiddenRow(
    boardWith([
      ['2h', '3h', '4h', '5h', 'As'],
      ['2d', '3d', '4d', '5d', 'Ad'],
      ['2c', '3c', '4c', '5c', 'Ac'],
      ['6h', '7h', '8h', '9h', 'Ts'],
      ['6d', '7d', '8d', '9d', 'Td'],
    ]),
  )
  const { remainingBySuit } = countRemaining({ opponentBoard: theirs })
  // No spade has been placed anywhere face-up in this layout, so all 13
  // must still read as unseen even though two spades really are on the
  // table, face-down.
  assert.equal(remainingBySuit['s'], COPIES_PER_SUIT)
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

test('seen and remaining always add up to a full deck of each suit too', () => {
  const mine = boardWith([['9s', '2s', '5s'], ['Js'], [], [], []])
  const theirs = boardWith([['Ks'], [], [], [], []])
  const { remainingBySuit, seenBySuit } = countRemaining({ myBoard: mine, opponentBoard: theirs })
  assert.equal(remainingBySuit['s'] + seenBySuit['s'], COPIES_PER_SUIT)
  assert.equal(seenBySuit['s'], 5)
  assert.equal(remainingBySuit['s'], COPIES_PER_SUIT - 5)
  assert.equal(remainingBySuit['h'], COPIES_PER_SUIT)
})
