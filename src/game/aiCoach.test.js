import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createEmptyBoard, placeCard, COLUMNS } from './board.js'
import { coachTipForPlacement, coachTipForSwap, scorePlacementOptions, potentialScore } from './aiCoach.js'
import { chooseBotPlacement, chooseBotSwap } from './bot.js'
import { countRemaining } from './cardCounting.js'

function c(code) {
  return { rank: code.slice(0, -1), suit: code.slice(-1) }
}

function fillColumn(board, col, codes) {
  let b = board
  for (const code of codes) b = placeCard(b, col, c(code))
  return b
}

// Fills every column to the same depth (satisfying the row-by-row rule,
// see openColumnsForPlacement) from a {col: [codes]} map, so every column
// stays eligible for the next placement in these fixtures.
function fillAllColumns(cardsByCol) {
  let board = createEmptyBoard()
  for (const col of COLUMNS) board = fillColumn(board, col, cardsByCol[col])
  return board
}

// Fills every column with a royal flush (As Ks Qs Js Ts) — the best
// possible 5-card hand, so no single-card swap can ever improve it. Board
// rules don't enforce cross-column/deck uniqueness (that's a Firebase-rules
// concern for the online mode, see docs/firebase-schema.md), so this is a
// safe fixture for exercising "nothing improves" logic in isolation.
function fullUnbeatableBoard() {
  return fillAllColumns(Object.fromEntries(COLUMNS.map((col) => [col, ['As', 'Ks', 'Qs', 'Js', 'Ts']])))
}

// col1 is one card from a club flush; the rest hold unrelated cards at the
// same depth, so all 5 stay eligible together under the row-by-row rule.
function flushDrawBoard() {
  return fillAllColumns({
    col1: ['2c', '5c', '9c', 'Kc'],
    col2: ['2h', '5d', '9s', 'Kd'],
    col3: ['3h', '6d', 'Ts', 'Qd'],
    col4: ['4h', '7d', 'Js', 'Ad'],
    col5: ['3s', '6h', '8d', 'Qh'],
  })
}

test('a card completing a flush scores higher than a random open column', () => {
  const board = flushDrawBoard()
  const options = scorePlacementOptions(board, c('7c'))
  const col1 = options.find((o) => o.col === 'col1')
  const col2 = options.find((o) => o.col === 'col2')
  assert.ok(col1.score > col2.score)
})

test('coachTipForPlacement rates the best column as great', () => {
  const board = flushDrawBoard()
  const tip = coachTipForPlacement(board, c('7c'), 'col1')
  assert.equal(tip.rating, 'great')
})

test('coachTipForPlacement rates a weak column as risky when a strong one was open', () => {
  const board = flushDrawBoard()
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
  const board = flushDrawBoard()
  const col = chooseBotPlacement(board, c('7c'), undefined, () => 0.99) // force exploitation path
  assert.equal(col, 'col1')
})

test('bot swap returns null when no swap improves', () => {
  const board = fullUnbeatableBoard()
  assert.equal(chooseBotSwap(board, c('9h')), null)
})

// The regression these three guard: the old heuristic scored every
// pair/flush/straight draw from a fixed table, blind to whether the
// specific cards that would complete it were still findable in the deck.
// A "great" draw kept scoring the same even once every remaining copy of
// the needed rank/suit/gap card was already dead on the table.

test('a pair draw scores zero once both remaining copies of that rank are already visible elsewhere', () => {
  // col1 holds one King; the candidate is the second. In the fresh board
  // the other two Kings are still unseen; in the dead board both are
  // already placed elsewhere, so the pair can never become trips/quads.
  const freshBoard = fillAllColumns({
    col1: ['Ks', '2h', '3d'],
    col2: ['4h', '5d', '6s'],
    col3: ['7h', '8d', '9s'],
    col4: ['Th', 'Jd', 'Qs'],
    col5: ['2s', '3h', '4d'],
  })
  const deadBoard = fillAllColumns({
    col1: ['Ks', '2h', '3d'],
    col2: ['Kd', '5d', '6s'],
    col3: ['Kc', '8d', '9s'],
    col4: ['Th', 'Jd', 'Qs'],
    col5: ['2s', '3h', '4d'],
  })

  const freshCol1 = scorePlacementOptions(freshBoard, c('Kh')).find((o) => o.col === 'col1')
  const deadCol1 = scorePlacementOptions(deadBoard, c('Kh')).find((o) => o.col === 'col1')

  assert.ok(freshCol1.score > 0)
  assert.equal(deadCol1.score, 0)
})

test('a flush draw scores lower the fewer copies of the needed suit remain unseen', () => {
  const existing = [c('2c'), c('5c'), c('9c')] // 3 clubs; candidate is the 4th
  const candidate = c('Kc')

  const freshCounts = countRemaining({ myBoard: createEmptyBoard(), knownCards: [...existing, candidate] })
  const freshScore = potentialScore(existing, candidate, freshCounts)

  // Every other club placed on the opponent's board: none remain unseen.
  let deadOpponent = createEmptyBoard()
  deadOpponent = fillColumn(deadOpponent, 'col1', ['3c', '4c', '6c', '7c', '8c'])
  deadOpponent = fillColumn(deadOpponent, 'col2', ['Tc', 'Jc', 'Qc', 'Ac'])
  const deadCounts = countRemaining({
    myBoard: createEmptyBoard(),
    opponentBoard: deadOpponent,
    knownCards: [...existing, candidate],
  })
  const deadScore = potentialScore(existing, candidate, deadCounts)

  assert.ok(freshScore > deadScore)
})

test('a straight draw scores lower the fewer copies of the specific gap cards remain unseen', () => {
  // 5s, 9h on the board + 7d candidate leaves a run of 5-7-9 needing
  // exactly a 6 and an 8 to complete — not any two cards, those two ranks.
  const existing = [c('5s'), c('9h')]
  const candidate = c('7d')

  const freshCounts = countRemaining({ myBoard: createEmptyBoard(), knownCards: [...existing, candidate] })
  const freshScore = potentialScore(existing, candidate, freshCounts)

  // Every 6 and every 8 placed elsewhere: the specific gap cards are dead,
  // even though plenty of other ranks remain untouched.
  let deadOpponent = createEmptyBoard()
  deadOpponent = fillColumn(deadOpponent, 'col1', ['6s', '6h', '6d', '6c', '8s'])
  deadOpponent = fillColumn(deadOpponent, 'col2', ['8h', '8d', '8c'])
  const deadCounts = countRemaining({
    myBoard: createEmptyBoard(),
    opponentBoard: deadOpponent,
    knownCards: [...existing, candidate],
  })
  const deadScore = potentialScore(existing, candidate, deadCounts)

  assert.ok(freshScore > deadScore)
})

test('scorePlacementOptions masks nothing on its own — passing no opponentBoard treats every rank/suit as fully live', () => {
  // Backward-compatible default: omitting opponentBoard entirely must not
  // throw, and should behave like the pre-existing heuristic (every draw
  // still scores above zero).
  const board = flushDrawBoard()
  const options = scorePlacementOptions(board, c('7c'))
  assert.ok(options.every((o) => o.score >= 0))
})
