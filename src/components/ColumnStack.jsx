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
 * drives the showdown reveal: a losing column's cards fold forward and
 * fade (the CSS 3D animation from tailwind.config.js), a winning one gets
 * a gold glow, matching the spec's showdown treatment.
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
      {label && <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">{label}</span>}
      <button
        type="button"
        disabled={!tappable}
        onClick={tappable ? onTap : undefined}
        className={clsx(
          'perspective-800 relative w-full rounded-lg transition-shadow',
          tappable && 'cursor-pointer ring-2 ring-gold/70 animate-pulse-gold',
          !tappable && 'cursor-default',
          outcome === 'win' && 'ring-2 ring-win shadow-[0_0_16px_rgba(46,204,113,0.5)]',
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
          // per column; a resolved column's fold/win treatment takes over
          // instead once there's an outcome, so the two never overlap.
          const isFold = outcome === 'lose'
          const isDealIn = i === 0 && !outcome
          return (
            <Wrapper
              key={i}
              {...wrapperProps}
              className={clsx(
                'preserve-3d absolute left-1/2 -translate-x-1/2 transition-transform duration-500',
                isFold && 'animate-fold-forward',
                isDealIn && 'animate-deal-in',
              )}
              style={{
                top: i * offset,
                animationDelay: isFold ? `${i * 60}ms` : isDealIn ? `${columnIndex * 120}ms` : undefined,
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
