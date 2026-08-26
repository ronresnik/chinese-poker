import { COLUMNS } from '../game/board.js'
import { columnOutcomesFor } from '../game/scoring.js'
import Card from './Card.jsx'
import PlayerBoard from './PlayerBoard.jsx'
import TurnBanner from './TurnBanner.jsx'
import CashBadge from './CashBadge.jsx'
import CoachTipToast from './CoachTipToast.jsx'
import SwapBar from './SwapBar.jsx'
import ShowdownModal from './ShowdownModal.jsx'

/**
 * Shared board+swap+showdown UI for both single-player and online games —
 * both stores converge on the same {col1..col5: Card[]} board shape (see
 * src/game/README.md), so this component doesn't need to know which one
 * it's talking to. Pages adapt their store's state into these props.
 */
export default function GameScreen({
  status,
  myUid,
  myName,
  opponentName,
  opponentConnected = true,
  myBoard,
  opponentBoard,
  isMyTurn,
  cashGame,
  nextCard,
  onPlaceCard,
  swapCard,
  myLocked,
  opponentLocked,
  onSwapCard,
  coachTip,
  result,
  onPlayAgain,
  onExit,
}) {
  const isPlacing = status === 'placing'
  const isSwap = status === 'swap'
  const isDone = status === 'showdown' || status === 'complete'

  const openForPlacement = isPlacing && isMyTurn ? COLUMNS.filter((c) => (myBoard[c]?.length ?? 0) < 5) : []
  const openForSwap = isSwap && !myLocked ? COLUMNS : []

  const myOutcomes = isDone && result ? columnOutcomesFor(result.columns, myUid) : {}
  const oppUid = result ? Object.keys(result.columnsWon).find((u) => u !== myUid) : null
  const oppOutcomes = isDone && result && oppUid ? columnOutcomesFor(result.columns, oppUid) : {}

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-3 px-3 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-white/80">
          <span className={opponentConnected ? 'h-2 w-2 rounded-full bg-win' : 'h-2 w-2 rounded-full bg-white/30'} />
          {opponentName}
        </div>
        <CashBadge cashGame={cashGame} />
      </div>

      <PlayerBoard board={opponentBoard} columnOutcomes={oppOutcomes} />

      <TurnBanner status={status} isMyTurn={isMyTurn} myLocked={myLocked} opponentLocked={opponentLocked} />

      {coachTip && <CoachTipToast tip={coachTip} />}

      {isPlacing && isMyTurn && nextCard && (
        <div className="flex items-center justify-center gap-3 rounded-xl bg-white/5 p-2">
          <span className="text-xs text-white/50">Your card</span>
          <Card card={nextCard} size="lg" highlight />
        </div>
      )}

      {isSwap && (
        <SwapBar swapCard={swapCard} locked={myLocked} onKeep={() => onSwapCard(null)} />
      )}

      <PlayerBoard
        board={myBoard}
        size="md"
        openColumns={[...openForPlacement, ...openForSwap]}
        onPlaceColumn={isPlacing ? onPlaceCard : onSwapCard}
        columnOutcomes={myOutcomes}
      />

      <div className="text-center text-sm font-medium text-white/70">{myName} (you)</div>

      {isDone && result && (
        <ShowdownModal
          result={result}
          myUid={myUid}
          myName={myName}
          opponentName={opponentName}
          cashGame={cashGame}
          onPlayAgain={onPlayAgain}
          onClose={onExit}
        />
      )}
    </div>
  )
}
