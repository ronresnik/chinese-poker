export const COLUMNS = ['col1', 'col2', 'col3', 'col4', 'col5']
export const COLUMN_SIZE = 5
export const HIDDEN_ROW_INDEX = COLUMN_SIZE - 1

export function createEmptyBoard() {
  return Object.fromEntries(COLUMNS.map((c) => [c, []]))
}

export function isColumnFull(board, col) {
  return board[col].length >= COLUMN_SIZE
}

export function isBoardFull(board) {
  return COLUMNS.every((col) => isColumnFull(board, col))
}

export function openColumns(board) {
  return COLUMNS.filter((col) => !isColumnFull(board, col))
}

// Columns fill strictly bottom-to-top, so whichever card lands in the last
// slot (index 4) is, by construction, always "the last card placed in that
// column" — the face-down row the rules call for. See src/game/README.md.
export function placeCard(board, col, card) {
  if (isColumnFull(board, col)) {
    throw new Error(`Column ${col} is already full`)
  }
  const nextIndex = board[col].length
  const placed = { ...card, faceDown: nextIndex === HIDDEN_ROW_INDEX }
  return {
    ...board,
    [col]: [...board[col], placed],
  }
}

export function getColumnCards(board, col) {
  return board[col]
}

export function replaceHiddenCard(board, col, newCard) {
  const existing = board[col]
  if (existing.length !== COLUMN_SIZE) {
    throw new Error(`Column ${col} is not complete; cannot swap its hidden card`)
  }
  const discarded = existing[HIDDEN_ROW_INDEX]
  const updated = existing.slice(0, HIDDEN_ROW_INDEX).concat([{ ...newCard, faceDown: true }])
  return {
    board: { ...board, [col]: updated },
    discarded: { rank: discarded.rank, suit: discarded.suit },
  }
}
