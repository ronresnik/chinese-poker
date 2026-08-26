import clsx from 'clsx'

const SUIT_SYMBOL = { s: '♠', h: '♥', d: '♦', c: '♣' }
const SUIT_COLOR = { s: 'text-ink', h: 'text-red-600', c: 'text-ink', d: 'text-red-600' }

const SIZE = {
  sm: 'w-8 h-11 text-[10px] rounded-md',
  md: 'w-10 h-14 sm:w-12 sm:h-16 text-xs sm:text-sm rounded-lg',
  lg: 'w-16 h-24 text-lg rounded-xl',
}

/**
 * `card` is either a real {rank,suit[,faceDown]} or just {faceDown:true}
 * with no rank/suit (the shape the opponent's hidden row arrives as pre-
 * showdown — see docs/firebase-schema.md). Rendering a back whenever rank
 * is missing, regardless of the faceDown flag, means this component can't
 * accidentally leak a card it was never actually given.
 */
export default function Card({ card, size = 'md', empty = false, highlight = false, className }) {
  const sizeClass = SIZE[size]

  if (empty || !card) {
    return (
      <div
        className={clsx(
          sizeClass,
          'border border-dashed border-white/15 bg-white/[0.03]',
          className,
        )}
      />
    )
  }

  const showBack = !card.rank || !card.suit

  if (showBack) {
    return (
      <div
        className={clsx(
          sizeClass,
          'flex items-center justify-center border border-gold-dark/60 bg-gradient-to-br from-card-back to-card-back-dark shadow-card',
          className,
        )}
      >
        <div className="h-[55%] w-[55%] rounded-full border-2 border-gold/40" />
      </div>
    )
  }

  return (
    <div
      className={clsx(
        sizeClass,
        'relative flex flex-col justify-between border bg-card-face p-0.5 font-bold shadow-card sm:p-1',
        highlight ? 'border-gold shadow-gold' : 'border-black/10',
        SUIT_COLOR[card.suit],
        className,
      )}
    >
      {/* Corner pips (rank + suit together) rather than rank alone: in a
          stacked column (ColumnStack) only a thin top strip of a covered
          card stays visible, and the old lone-rank top span left the suit
          hidden under the next card — pairing them here is what makes a
          stacked card's suit/color readable without fanning it out. */}
      <span className="flex items-center gap-0.5 leading-none">
        <span>{card.rank}</span>
        <span>{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="self-center text-base leading-none sm:text-xl">{SUIT_SYMBOL[card.suit]}</span>
      <span className="flex rotate-180 items-center gap-0.5 self-end leading-none">
        <span>{card.rank}</span>
        <span>{SUIT_SYMBOL[card.suit]}</span>
      </span>
    </div>
  )
}
