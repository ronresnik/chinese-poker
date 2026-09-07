import { useEffect, useState } from 'react'

export default function TurnBanner({ status, isMyTurn, myLocked, opponentLocked, turnDeadlineMs = null }) {
  let text
  if (status === 'placing') {
    text = isMyTurn ? 'Your turn — tap a column to place your card' : "Opponent's turn…"
  } else if (status === 'swap') {
    if (myLocked && !opponentLocked) text = 'Waiting for opponent to decide on their swap…'
    else if (!myLocked) text = 'Final card — swap it into a hidden card, or keep your board'
    else text = 'Both players ready — revealing…'
  } else if (status === 'showdown' || status === 'complete') {
    text = 'Showdown!'
  } else {
    text = 'Waiting for opponent…'
  }

  // Ticks its own clock rather than taking secondsLeft as a prop — a
  // parent re-render every second just to update one number would be
  // wasteful, and every consumer would need the same setInterval anyway.
  const [now, setNow] = useState(Date.now())
  const showCountdown = status === 'placing' && turnDeadlineMs != null
  useEffect(() => {
    if (!showCountdown) return undefined
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [showCountdown])

  const secondsLeft = showCountdown ? Math.max(0, Math.ceil((turnDeadlineMs - now) / 1000)) : null

  return (
    <div className="flex items-center justify-center gap-2 rounded-full bg-white/5 px-4 py-1.5 text-center text-xs font-medium text-white/80 sm:text-sm">
      <span>{text}</span>
      {secondsLeft !== null && (
        <span
          className={
            'shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ' +
            (secondsLeft <= 10 ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-white/60')
          }
        >
          {secondsLeft}s
        </span>
      )}
    </div>
  )
}
