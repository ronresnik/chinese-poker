import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useLocalGameStore, HUMAN_UID, BOT_UID } from '../store/useLocalGameStore.js'
import { getCurrentTurnUid, getNextCard, PHASE } from '../game/engine.js'
import { maskHiddenRow } from '../game/board.js'
import GameScreen from '../components/GameScreen.jsx'

export default function LocalGame() {
  const navigate = useNavigate()
  const location = useLocation()
  const { state, startGame, place, swap, reset } = useLocalGameStore()
  const [displayedTip, setDisplayedTip] = useState(null)

  useEffect(() => {
    if (!state) {
      startGame({
        humanName: location.state?.name ?? 'You',
        cashGame: location.state?.cashGame,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // engine.js's lastCoachTip is a single shared field the bot's own moves
  // also write to — capture only the human's tips here so a bot move
  // ~700ms later doesn't yank the toast away before its own display timer
  // (see CoachTipToast) has run its course.
  useEffect(() => {
    if (state?.lastCoachTip?.uid === HUMAN_UID) {
      setDisplayedTip(state.lastCoachTip)
    }
  }, [state?.lastCoachTip])

  if (!state) {
    return <div className="flex flex-1 items-center justify-center text-white/60">Dealing…</div>
  }

  const isMyTurn = state.status === PHASE.PLACING && getCurrentTurnUid(state) === HUMAN_UID
  const nextCard = isMyTurn ? getNextCard(state) : null
  // The bot's board object always holds its true hidden card (the local
  // engine has no network boundary to keep it off this client) — mask it
  // until the game reaches COMPLETE, when ShowdownReveal takes over and
  // needs the real values to animate the column-by-column reveal.
  const revealed = state.status === PHASE.COMPLETE
  const opponentBoard = revealed ? state.players[BOT_UID].board : maskHiddenRow(state.players[BOT_UID].board)

  return (
    <GameScreen
      status={state.status}
      myUid={HUMAN_UID}
      myName={state.players[HUMAN_UID].name}
      opponentName={state.players[BOT_UID].name}
      myBoard={state.players[HUMAN_UID].board}
      opponentBoard={opponentBoard}
      isMyTurn={isMyTurn}
      cashGame={state.cashGame}
      nextCard={nextCard}
      onPlaceCard={place}
      swapCard={state.players[HUMAN_UID].swapCard}
      myLocked={state.players[HUMAN_UID].locked}
      opponentLocked={state.players[BOT_UID].locked}
      onSwapCard={swap}
      coachTip={displayedTip}
      result={state.result}
      onPlayAgain={() => {
        reset()
        startGame({ humanName: state.players[HUMAN_UID].name, cashGame: state.cashGame })
      }}
      onExit={() => {
        reset()
        navigate('/')
      }}
    />
  )
}
