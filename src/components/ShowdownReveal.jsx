import { useEffect, useState } from 'react'
import { COLUMNS, HIDDEN_ROW_INDEX } from '../game/board.js'
import { columnOutcomesFor } from '../game/scoring.js'
import PlayerBoard from './PlayerBoard.jsx'

const REVEAL_INTERVAL_MS = 1400

// Masks the hidden row for every column at/after `revealedCount` back to a
// face-down placeholder, even though the caller's board already has the
// real values (showdown has them for both sides by then) — this is what
// lets the reveal happen one column at a time instead of all at once.
function maskUnrevealed(board, revealedCount) {
  const masked = {}
  COLUMNS.forEach((col, i) => {
    masked[col] =
      i < revealedCount ? board[col] : board[col].map((card, idx) => (idx === HIDDEN_ROW_INDEX ? { faceDown: true } : card))
  })
  return masked
}

/**
 * Column-by-column showdown reveal: each column's hidden row flips and its
 * win/lose treatment (fold-forward / gold glow, see ColumnStack) applies
 * one at a time, so the player can track exactly which column decided
 * what before moving on. Only once every column has revealed does a
 * button appear to continue to the full result/payout summary.
 */
export default function ShowdownReveal({
  result,
  myUid,
  opponentUid,
  myName,
  opponentName,
  myBoard,
  opponentBoard,
  onContinue,
}) {
  const [revealed, setRevealed] = useState(0)
  const allRevealed = revealed >= COLUMNS.length

  useEffect(() => {
    if (allRevealed) return undefined
    const timer = setTimeout(() => setRevealed((n) => n + 1), REVEAL_INTERVAL_MS)
    return () => clearTimeout(timer)
  }, [revealed, allRevealed])

  const myOutcomes = columnOutcomesFor(result.columns.slice(0, revealed), myUid)
  const opponentOutcomes = columnOutcomesFor(result.columns.slice(0, revealed), opponentUid)

  const current = !allRevealed ? result.columns[revealed] : null
  const currentLabel = current
    ? current.winnerUid === myUid
      ? `Column ${revealed + 1}: You win!`
      : current.winnerUid
        ? `Column ${revealed + 1}: You lose`
        : `Column ${revealed + 1}: Tie`
    : null

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/85 px-4 py-6 backdrop-blur-sm"
      onClick={() => !allRevealed && setRevealed((n) => n + 1)}
    >
      <div className="w-full max-w-lg text-center text-sm text-white/60">{opponentName}</div>
      <div className="w-full max-w-lg">
        <PlayerBoard board={maskUnrevealed(opponentBoard, revealed)} columnOutcomes={opponentOutcomes} />
      </div>

      <div className="flex h-10 items-center justify-center">
        {currentLabel && (
          <span
            key={revealed}
            className="animate-deal-in rounded-full bg-white/10 px-4 py-1.5 text-base font-bold text-gold-light"
          >
            {currentLabel}
          </span>
        )}
        {!currentLabel && !allRevealed && <span className="text-xs text-white/40">Revealing…</span>}
      </div>

      <div className="w-full max-w-lg">
        <PlayerBoard board={maskUnrevealed(myBoard, revealed)} size="md" columnOutcomes={myOutcomes} />
      </div>
      <div className="w-full max-w-lg text-center text-sm text-white/60">{myName} (you)</div>

      {allRevealed ? (
        <button type="button" onClick={onContinue} className="btn-gold mt-2">
          See Results
        </button>
      ) : (
        <p className="text-xs text-white/30">Tap to skip ahead</p>
      )}
    </div>
  )
}
