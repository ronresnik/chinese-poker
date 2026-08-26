import clsx from 'clsx'
import { describeHand } from '../game/handEvaluator.js'
import { formatCurrency } from '../utils/format.js'

const TONE = {
  win: 'text-win',
  lose: 'text-red-300',
  tie: 'text-white/50',
}

function HandRow({ name, hand, tone }) {
  return (
    <div className="mt-1 flex items-baseline justify-between gap-3">
      <span className="shrink-0 truncate text-[11px] text-white/40">{name}</span>
      <span className={clsx('text-right font-medium', TONE[tone])}>{describeHand(hand)}</span>
    </div>
  )
}

export default function ShowdownModal({
  result,
  myUid,
  myName,
  opponentName,
  cashGame,
  statsNote,
  onClose,
  onPlayAgain,
}) {
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

        {/* Every column shows BOTH hands, always — the point of the
            summary is to see why each column went the way it did, which
            you can't tell from your own hand alone. Green is the hand
            that took the column, red the one that lost it. */}
        <ul className="mt-4 max-h-[45vh] space-y-2 overflow-y-auto text-xs sm:text-sm">
          {result.columns.map((c, i) => {
            const iWonCol = c.winnerUid === myUid
            const tied = !c.winnerUid
            return (
              <li
                key={c.col}
                className={clsx(
                  'rounded-lg border-l-4 bg-white/5 px-3 py-2',
                  tied ? 'border-white/30' : iWonCol ? 'border-win' : 'border-red-400',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-white/50">Column {i + 1}</span>
                  <span
                    className={clsx(
                      'text-[11px] font-bold uppercase tracking-wide',
                      tied ? 'text-white/40' : iWonCol ? 'text-win' : 'text-red-300',
                    )}
                  >
                    {tied ? 'Tie' : iWonCol ? 'Won' : 'Lost'}
                  </span>
                </div>
                <HandRow
                  name={`${myName} (you)`}
                  hand={c.hands[myUid]}
                  tone={tied ? 'tie' : iWonCol ? 'win' : 'lose'}
                />
                <HandRow
                  name={opponentName}
                  hand={c.hands[oppUid]}
                  tone={tied ? 'tie' : iWonCol ? 'lose' : 'win'}
                />
              </li>
            )
          })}
        </ul>

        {statsNote && (
          <p className="mt-3 text-center text-[11px] leading-snug text-white/30">
            The result above is final — only the leaderboard update didn&rsquo;t go through ({statsNote}).
          </p>
        )}

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
