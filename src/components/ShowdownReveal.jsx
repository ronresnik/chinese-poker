import { useEffect, useState } from 'react'
import clsx from 'clsx'
import { COLUMNS, HIDDEN_ROW_INDEX } from '../game/board.js'
import { columnOutcomesFor } from '../game/scoring.js'
import { revealCaption } from '../game/reveal.js'
import { describeHand } from '../game/handEvaluator.js'
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
 * Column-by-column showdown reveal: each column's hidden row flips and
 * its win/lose colour treatment (see ColumnStack) applies one at a time,
 * so the player can track exactly which column decided what before moving
 * on. Only once every column has revealed does a button appear to
 * continue to the full result/payout summary.
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

  // Caption and highlighting both derive from `revealed` via the same
  // helper, so they can't drift out of step (see game/reveal.js).
  const caption = revealCaption(result.columns, revealed, myUid)

  // Swaps the plain column number for a short hand description ("Two
  // Pair, Kings and 5s") the instant that column's outcome reveals —
  // driven by the same `revealed` count as the border colour and the
  // caption above, so the three can never fall out of step with each
  // other. Columns not yet revealed pass null through, which
  // PlayerBoard/ColumnStack fall back to the plain column number for.
  const myHandLabels = COLUMNS.map((_, i) => (i < revealed ? describeHand(result.columns[i].hands[myUid]) : null))
  const opponentHandLabels = COLUMNS.map((_, i) =>
    i < revealed ? describeHand(result.columns[i].hands[opponentUid]) : null,
  )

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/85 px-4 py-6 backdrop-blur-sm"
      onClick={() => !allRevealed && setRevealed((n) => n + 1)}
    >
      <div className="w-full max-w-lg text-center text-sm text-white/60">{opponentName}</div>
      <div className="w-full max-w-lg">
        <PlayerBoard
          board={maskUnrevealed(opponentBoard, revealed)}
          columnOutcomes={opponentOutcomes}
          columnLabels={opponentHandLabels}
        />
      </div>

      <div className="flex h-10 items-center justify-center">
        {caption && (
          <span
            key={revealed}
            className={clsx(
              'animate-deal-in rounded-full px-4 py-1.5 text-base font-bold',
              caption.outcome === 'win' && 'bg-win/20 text-win',
              caption.outcome === 'lose' && 'bg-red-500/20 text-red-300',
              caption.outcome === 'tie' && 'bg-white/10 text-white/70',
            )}
          >
            {caption.text}
          </span>
        )}
        {!caption && !allRevealed && <span className="text-xs text-white/40">Revealing…</span>}
      </div>

      <div className="w-full max-w-lg">
        <PlayerBoard
          board={maskUnrevealed(myBoard, revealed)}
          size="md"
          columnOutcomes={myOutcomes}
          columnLabels={myHandLabels}
        />
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
