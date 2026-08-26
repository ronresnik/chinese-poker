import { test } from 'node:test'
import assert from 'node:assert/strict'
import { revealCaption } from './reveal.js'

const ME = 'me'
const THEM = 'them'

// Column 3 is the one I win; the rest go to my opponent.
const columns = [
  { col: 'col1', winnerUid: THEM },
  { col: 'col2', winnerUid: THEM },
  { col: 'col3', winnerUid: ME },
  { col: 'col4', winnerUid: THEM },
  { col: 'col5', winnerUid: ME },
]

test('nothing is announced before the first column turns over', () => {
  assert.equal(revealCaption(columns, 0, ME), null)
})

test('the caption describes the column that just turned over, not the next one', () => {
  // The regression this guards: reading columns[revealed] captioned the
  // column *after* the highlighted one, so the banner read "Column 2"
  // while column 1 was the one lit up.
  const first = revealCaption(columns, 1, ME)
  assert.equal(first.columnNumber, 1)
  assert.equal(first.outcome, 'lose')
  assert.equal(first.text, 'Column 1: You lose')
})

test('column numbers are 1-based and match their position on screen', () => {
  assert.equal(revealCaption(columns, 3, ME).columnNumber, 3)
  assert.equal(revealCaption(columns, 5, ME).columnNumber, 5)
})

test('win and loss are stated from the reading player s own point of view', () => {
  assert.equal(revealCaption(columns, 3, ME).text, 'Column 3: You win!')
  // Same column, other seat: the opposite verdict.
  assert.equal(revealCaption(columns, 3, THEM).text, 'Column 3: You lose')
})

test('every column reports the outcome its winnerUid implies, for both seats', () => {
  for (let n = 1; n <= columns.length; n++) {
    const mine = revealCaption(columns, n, ME)
    const theirs = revealCaption(columns, n, THEM)
    const winner = columns[n - 1].winnerUid

    assert.equal(mine.columnNumber, n)
    assert.equal(theirs.columnNumber, n)
    assert.equal(mine.outcome, winner === ME ? 'win' : 'lose')
    assert.equal(theirs.outcome, winner === THEM ? 'win' : 'lose')
    // Exactly one side may be told it won.
    assert.notEqual(mine.outcome, theirs.outcome)
  }
})

test('the last caption stays put once every column is revealed', () => {
  // revealed can be nudged past the end by a skip tap; it must not read
  // off the end of the array or renumber the final column.
  const atEnd = revealCaption(columns, 5, ME)
  const past = revealCaption(columns, 9, ME)
  assert.deepEqual(past, atEnd)
  assert.equal(past.columnNumber, 5)
})

test('a column with no winner is called a tie rather than silently a loss', () => {
  const drawn = [{ col: 'col1', winnerUid: null }]
  const caption = revealCaption(drawn, 1, ME)
  assert.equal(caption.outcome, 'tie')
  assert.equal(caption.text, 'Column 1: Tie')
})

test('empty input is handled rather than throwing', () => {
  assert.equal(revealCaption([], 1, ME), null)
  assert.equal(revealCaption(undefined, 1, ME), null)
})
