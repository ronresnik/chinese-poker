import { describeHand } from '../game/handEvaluator.js'
import { formatCurrency } from '../utils/format.js'

export default function ShowdownModal({ result, myUid, myName, opponentName, cashGame, onClose, onPlayAgain }) {
  if (!result) return null

  const iWon = result.winnerUid === myUid
  const isPush = !result.winnerUid
  const myCols = result.columnsWon[myUid] ?? 0
  const oppUid = Object.keys(result.columnsWon).find((u) => u !== myUid)
  const oppCols = result.columnsWon[oppUid] ?? 0

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div className="animate-deal-in panel w-full max-w-sm p-5">
        <h2 className="text-center font-display text-xl font-bold text-gold-light">
          {isPush ? 'Push' : iWon ? 'You Win!' : `${opponentName} Wins`}
        </h2>
        <p className="mt-1 text-center text-sm text-white/60">
          {myName} {myCols} — {oppCols} {opponentName}
          {result.sweep && <span className="ml-1 font-semibold text-gold-light">(Sweep! ×2)</span>}
        </p>

        {cashGame?.enabled && !isPush && (
          <p className="mt-2 text-center text-lg font-bold text-gold-light">
            {iWon ? `You collect ${formatCurrency(result.payout, cashGame.currency)}` : `You owe ${formatCurrency(result.payout, cashGame.currency)}`}
          </p>
        )}

        <ul className="mt-4 space-y-1 text-xs sm:text-sm">
          {result.columns.map((c, i) => (
            <li key={c.col} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5">
              <span className="text-white/50">Column {i + 1}</span>
              <span
                className={
                  c.winnerUid === myUid
                    ? 'font-semibold text-win'
                    : c.winnerUid
                      ? 'text-red-300'
                      : 'text-white/50'
                }
              >
                {describeHand(c.hands[myUid])}
                {c.winnerUid && c.winnerUid !== myUid ? ' (lost)' : ''}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex gap-3">
          <button type="button" onClick={onPlayAgain} className="btn-gold flex-1">
            Play Again
          </button>
          <button type="button" onClick={onClose} className="btn-ghost flex-1">
            Exit
          </button>
        </div>
      </div>
    </div>
  )
}
