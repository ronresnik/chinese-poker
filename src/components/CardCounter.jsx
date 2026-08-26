import clsx from 'clsx'
import { RANKS } from '../game/deck.js'
import { countRemaining } from '../game/cardCounting.js'

/**
 * A per-rank tally of what this player has not yet seen. Built from their
 * own view of the table (see game/cardCounting.js), so the two players
 * legitimately read different numbers — each can see their own final row
 * and not their opponent's.
 *
 * The footnote is the important part once the last row starts: those
 * cards are committed but unreadable, so they can't be deducted from any
 * particular rank and instead stay in the unseen pool with a plain note
 * saying how many of it is already face-down on the table.
 */
export default function CardCounter({ myBoard, opponentBoard, knownCards = [] }) {
  const { remaining, unseenTotal, unknownOnTable } = countRemaining({ myBoard, opponentBoard, knownCards })

  return (
    <div className="rounded-xl bg-white/5 px-2 py-2">
      <div className="flex items-baseline justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">Cards you haven&rsquo;t seen</span>
        <span className="text-[10px] font-semibold text-white/50">{unseenTotal} left</span>
      </div>

      <div className="mt-1 grid grid-cols-[repeat(13,minmax(0,1fr))] gap-0.5">
        {RANKS.map((rank) => {
          const left = remaining[rank]
          return (
            <div
              key={rank}
              className={clsx(
                'flex flex-col items-center rounded py-0.5',
                left === 0 ? 'bg-white/5 text-white/25' : 'bg-black/20',
              )}
            >
              <span className="text-[10px] font-bold leading-none text-white/60">{rank}</span>
              <span
                className={clsx(
                  'mt-0.5 text-[11px] font-bold leading-none',
                  left === 0 ? 'text-white/25' : left === 1 ? 'text-gold-light' : 'text-white',
                )}
              >
                {left}
              </span>
            </div>
          )
        })}
      </div>

      {unknownOnTable > 0 && (
        <p className="mt-1.5 px-1 text-[10px] leading-snug text-white/35">
          {unknownOnTable} of those {unknownOnTable === 1 ? 'is' : 'are'} already face-down in your opponent&rsquo;s last
          row — you know {unknownOnTable === 1 ? "it's" : "they're"} gone, but not which {unknownOnTable === 1 ? 'card' : 'cards'}.
        </p>
      )}
    </div>
  )
}
