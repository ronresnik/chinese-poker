import Card from './Card.jsx'

// The actual swap target (which column to swap into) is chosen by tapping
// a column in the player's own board — see GameScreen.jsx, which wires
// onSwapCard directly to PlayerBoard during the swap phase. This bar only
// surfaces the extra card and the "keep as is" option.
export default function SwapBar({ swapCard, locked, onKeep }) {
  if (locked) {
    return (
      <div className="panel flex items-center justify-center gap-3 p-3 text-sm text-white/60">
        Decision locked in — waiting for your opponent.
      </div>
    )
  }

  return (
    <div className="panel flex flex-col items-center gap-3 p-3">
      <p className="text-center text-xs text-white/70 sm:text-sm">
        Your extra card — tap one of your face-down cards below to swap it in, or keep your board as is.
      </p>
      <Card card={swapCard} size="lg" highlight />
      <button type="button" onClick={onKeep} className="btn-ghost text-sm">
        Keep my board
      </button>
    </div>
  )
}
