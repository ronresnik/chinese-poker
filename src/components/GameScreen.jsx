import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { openColumnsForPlacement, maskHiddenRow, COLUMNS } from '../game/board.js'
import Card from './Card.jsx'
import PlayerBoard from './PlayerBoard.jsx'
import TurnBanner from './TurnBanner.jsx'
import CashBadge from './CashBadge.jsx'
import CoachTipToast from './CoachTipToast.jsx'
import SwapBar from './SwapBar.jsx'
import CardCounter from './CardCounter.jsx'
import ShowdownReveal from './ShowdownReveal.jsx'
import ShowdownModal from './ShowdownModal.jsx'

function cardKey(card) {
  return card?.rank && card?.suit ? `card-${card.rank}${card.suit}` : undefined
}

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
  statsNote,
  onPlayAgain,
  onExit,
}) {
  const isPlacing = status === 'placing'
  const isSwap = status === 'swap'
  const isDone = status === 'showdown' || status === 'complete'

  const [revealDone, setRevealDone] = useState(false)
  useEffect(() => {
    if (result) setRevealDone(false)
  }, [result])

  // Scopes the "fly from center to column" shared-layout transition to
  // exactly the one card that was just placed, for one brief moment —
  // applying layoutId to every column's last card persistently would
  // trigger unwanted shared-transitions on any unrelated layout shift
  // (e.g. the coach tip toast appearing/disappearing).
  const [flyingKey, setFlyingKey] = useState(null)
  const prevNextCardRef = useRef(nextCard)
  useEffect(() => {
    const prev = prevNextCardRef.current
    prevNextCardRef.current = nextCard
    if (prev && cardKey(prev) !== cardKey(nextCard)) {
      const key = cardKey(prev)
      setFlyingKey(key)
      const timer = setTimeout(() => setFlyingKey(null), 500)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [nextCard])

  const openForPlacement = isPlacing && isMyTurn ? openColumnsForPlacement(myBoard) : []
  const openForSwap = isSwap && !myLocked ? COLUMNS : []

  const opponentUid = result ? Object.keys(result.columnsWon).find((u) => u !== myUid) : null

  // The moment `status` reaches showdown/complete, both stores start
  // feeding this component the opponent's *true* hidden card (ShowdownReveal
  // needs it, to progressively unmask one column at a time) — but that same
  // true board also flows into the plain PlayerBoard below, which sits right
  // behind ShowdownReveal's fixed, near-opaque overlay. Mask it there until
  // the player has actually clicked through the reveal, so the real values
  // never render outside of ShowdownReveal's own controlled unmasking.
  const displayOpponentBoard = isDone && !revealDone ? maskHiddenRow(opponentBoard) : opponentBoard

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-3 px-3 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-white/80">
          <span className={opponentConnected ? 'h-2 w-2 rounded-full bg-win' : 'h-2 w-2 rounded-full bg-white/30'} />
          {opponentName}
        </div>
        <CashBadge cashGame={cashGame} />
      </div>

      <PlayerBoard board={displayOpponentBoard} />

      <TurnBanner status={status} isMyTurn={isMyTurn} myLocked={myLocked} opponentLocked={opponentLocked} />

      {coachTip && <CoachTipToast tip={coachTip} />}

      {isPlacing && isMyTurn && nextCard && (
        <div className="flex items-center justify-center gap-3 rounded-xl bg-white/5 p-2">
          <span className="text-xs text-white/50">Your card</span>
          <motion.div layoutId={cardKey(nextCard)} transition={{ type: 'spring', stiffness: 700, damping: 40 }}>
            <Card card={nextCard} size="lg" highlight />
          </motion.div>
        </div>
      )}

      {isSwap && <SwapBar swapCard={swapCard} locked={myLocked} onKeep={() => onSwapCard(null)} />}

      <PlayerBoard
        board={myBoard}
        size="md"
        openColumns={[...openForPlacement, ...openForSwap]}
        onPlaceColumn={isPlacing ? onPlaceCard : onSwapCard}
        flyingCardKey={flyingKey}
      />

      <div className="text-center text-sm font-medium text-white/70">{myName} (you)</div>

      {/* Rendered for the whole game, not just placing/swap: both players
          derive this purely from their own local state (see
          game/cardCounting.js), so at any given moment they'd already see
          identical *kinds* of numbers — gating it to specific phases just
          meant whichever player reached the next phase first stopped
          seeing it while the other still could, which read as "only one
          of us has this." Hidden only once the final summary modal is up,
          since that panel already shows everything by then. Uses
          displayOpponentBoard (masked pre-reveal, same as the board above
          it) rather than the raw prop, so the count itself can't tip off
          a rank/suit as exhausted before the official reveal shows it. */}
      {!(isDone && revealDone) && (
        <CardCounter
          myBoard={myBoard}
          opponentBoard={displayOpponentBoard}
          // Cards this player has been shown but that aren't on a board
          // yet. The spare swap card only counts from the swap phase, as
          // that's when they're actually shown it — counting it earlier
          // would quietly rule its rank out of the tally while the player
          // has no idea why.
          knownCards={[nextCard, isSwap ? swapCard : null].filter(Boolean)}
        />
      )}

      {isDone && result && !revealDone && (
        <ShowdownReveal
          result={result}
          myUid={myUid}
          opponentUid={opponentUid}
          myName={myName}
          opponentName={opponentName}
          myBoard={myBoard}
          opponentBoard={opponentBoard}
          onContinue={() => setRevealDone(true)}
        />
      )}

      {isDone && result && revealDone && (
        <ShowdownModal
          result={result}
          myUid={myUid}
          myName={myName}
          opponentName={opponentName}
          cashGame={cashGame}
          statsNote={statsNote}
          onPlayAgain={onPlayAgain}
          onClose={onExit}
        />
      )}
    </div>
  )
}
