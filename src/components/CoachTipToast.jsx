import { useEffect, useState } from 'react'
import clsx from 'clsx'

const RATING_STYLE = {
  great: 'border-win/50 bg-win/10 text-win',
  ok: 'border-gold/50 bg-gold/10 text-gold-light',
  risky: 'border-lose/50 bg-lose/10 text-red-300',
}

const RATING_ICON = { great: '✓', ok: '~', risky: '!' }

/** Auto-dismissing banner for the AI Coach's tip after a placement/swap. */
export default function CoachTipToast({ tip }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!tip) return undefined
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), 5000)
    return () => clearTimeout(timer)
  }, [tip])

  if (!tip || !visible) return null

  return (
    <div
      className={clsx(
        'animate-deal-in mx-auto flex max-w-md items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium shadow-card sm:text-sm',
        RATING_STYLE[tip.rating],
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-[11px]">
        {RATING_ICON[tip.rating]}
      </span>
      <span>{tip.message}</span>
    </div>
  )
}
