/**
 * The showdown reveal walks the five columns one at a time. Getting the
 * caption and the highlighting to agree turned out to be easy to get
 * subtly wrong — an earlier version read `columns[revealed]` for the
 * caption while highlighting `columns.slice(0, revealed)`, so the banner
 * described the column *after* the one that had just lit up ("Column 2:
 * You lose" while column 1 was the highlighted one). Both now derive
 * from this single function, and it's unit-tested.
 *
 * `revealedCount` is how many columns have been turned over so far, 0..5.
 * The caption always describes the most recently revealed column — the
 * one that is currently showing its win/lose colour — and its number is
 * that column's position on screen (1-based), not an index.
 */
export function revealCaption(columns, revealedCount, myUid) {
  if (!columns?.length || revealedCount <= 0) return null

  const index = Math.min(revealedCount, columns.length) - 1
  const column = columns[index]
  if (!column) return null

  const outcome = !column.winnerUid ? 'tie' : column.winnerUid === myUid ? 'win' : 'lose'
  const columnNumber = index + 1

  return {
    columnNumber,
    outcome,
    // "Tie" is unreachable in normal play — compareHands breaks every
    // level column by suit — but a column with no winner would otherwise
    // silently render as a loss, so it stays handled explicitly.
    text:
      outcome === 'win'
        ? `Column ${columnNumber}: You win!`
        : outcome === 'lose'
          ? `Column ${columnNumber}: You lose`
          : `Column ${columnNumber}: Tie`,
  }
}
