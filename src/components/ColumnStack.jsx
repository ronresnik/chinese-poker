import clsx from 'clsx'
import { motion } from 'framer-motion'
import Card from './Card.jsx'

const STACK_OFFSET = { sm: 16, md: 20 }
const CARD_HEIGHT = { sm: 44, md: 56 }

function cardKey(card) {
  return card?.rank && card?.suit ? `card-${card.rank}${card.suit}` : undefined
}

/**
 * One column's 5-card pile, cards overlapping vertically so 5 of these
 * fit side by side on a phone screen. `outcome` ('win'|'lose'|'tie'|null)
 * drives the showdown reveal, as a plain colour treatment on the column:
 * green for won, red for lost, neutral for tied. Losing columns used to
 * fold forward and fade away in 3D, which read as the cards being
 * discarded and made the losing hand hard to actually look at — the
 * point of the reveal is to compare the two hands, so both stay fully
 * legible and only the framing changes.
 */
export default function ColumnStack({
  cards,
  size = 'sm',
  onTap,
  tappable = false,
  outcome = null,
  label,
  flyingCardKey = null,
  columnIndex = 0,
}) {
  const offset = STACK_OFFSET[size]
  const cardHeight = CARD_HEIGHT[size]
  const slots = Array.from({ length: 5 }, (_, i) => cards[i] ?? null)
  const height = cardHeight + offset * 4

  return (
    <div className="flex flex-col items-center gap-1">
      {label && (
        // h-7: a fixed height (rather than growing with the label) keeps
        // every column's cards starting at the same y-position whether
        // its label is a single-digit column number or a two-line hand
        // description — without it, the one column whose hand name wraps
        // to a second line would push its own cards down relative to the
        // other four.
        <span className="flex h-7 items-center text-center text-[10px] font-semibold uppercase leading-tight tracking-wide text-white/40">
          {label}
        </span>
      )}
      <button
        type="button"
        disabled={!tappable}
        onClick={tappable ? onTap : undefined}
        className={clsx(
          'relative w-full rounded-lg transition-shadow',
          tappable && 'cursor-pointer ring-2 ring-gold/70 animate-pulse-gold',
          !tappable && 'cursor-default',
          outcome === 'win' && 'ring-2 ring-win shadow-[0_0_16px_rgba(46,204,113,0.5)]',
          outcome === 'lose' && 'ring-2 ring-red-500/70 shadow-[0_0_16px_rgba(239,68,68,0.35)]',
          outcome === 'tie' && 'ring-2 ring-white/30',
        )}
        style={{ height }}
      >
        {slots.map((card, i) => {
          // Only the one card that was *just* placed carries the shared
          // layoutId (see GameScreen.jsx) — every other card renders as a
          // plain, non-motion element so an unrelated layout shift
          // elsewhere on the page can never trigger a stray "shared
          // transition" on cards that have already settled.
          const isFlying = flyingCardKey && cardKey(card) === flyingCardKey
          const Wrapper = isFlying ? motion.div : 'div'
          const wrapperProps = isFlying
            ? { layoutId: flyingCardKey, transition: { type: 'spring', stiffness: 700, damping: 40 } }
            : {}
          // The initial deal (row 0) plays a "dealt in" entrance, staggered
          // per column. Once a column has an outcome the entrance is done
          // with, and the outcome is expressed purely by the column's
          // colour treatment above — no per-card animation.
          const isDealIn = i === 0 && !outcome
          return (
            <Wrapper
              key={i}
              {...wrapperProps}
              className={clsx(
                'absolute left-1/2 -translate-x-1/2 transition-transform duration-500',
                isDealIn && 'animate-deal-in',
              )}
              style={{
                top: i * offset,
                animationDelay: isDealIn ? `${columnIndex * 120}ms` : undefined,
              }}
            >
              <Card card={card} size={size === 'sm' ? 'sm' : 'md'} empty={!card} highlight={outcome === 'win'} />
            </Wrapper>
          )
        })}
      </button>
    </div>
  )
}
