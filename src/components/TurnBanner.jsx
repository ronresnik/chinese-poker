export default function TurnBanner({ status, isMyTurn, myLocked, opponentLocked }) {
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

  return (
    <div className="rounded-full bg-white/5 px-4 py-1.5 text-center text-xs font-medium text-white/80 sm:text-sm">
      {text}
    </div>
  )
}
