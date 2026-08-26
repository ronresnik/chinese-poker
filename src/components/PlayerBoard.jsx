import { COLUMNS } from '../game/board.js'
import ColumnStack from './ColumnStack.jsx'

/**
 * `board` is the merged {col1..col5: Card[]} shape both game stores
 * produce (see src/store/). Rows before the 5th are always real
 * {rank,suit}; the 5th is only real once this board's owner is allowed to
 * see it (always for isOwn, only post-showdown otherwise) — ColumnStack's
 * Card renders a back for anything missing rank/suit, so this component
 * doesn't need its own hiding logic.
 */
export default function PlayerBoard({
  board,
  size = 'sm',
  openColumns = [],
  onPlaceColumn,
  columnOutcomes = {},
}) {
  return (
    <div className="grid grid-cols-5 gap-1 sm:gap-2">
      {COLUMNS.map((col, i) => (
        <ColumnStack
          key={col}
          cards={board[col] ?? []}
          size={size}
          tappable={openColumns.includes(col)}
          onTap={() => onPlaceColumn?.(col)}
          outcome={columnOutcomes[col] ?? null}
          label={`${i + 1}`}
        />
      ))}
    </div>
  )
}
