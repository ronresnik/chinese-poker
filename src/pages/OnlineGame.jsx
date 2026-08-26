import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useOnlineGameStore } from '../store/useOnlineGameStore.js'
import GameScreen from '../components/GameScreen.jsx'

export default function OnlineGame() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const store = useOnlineGameStore()

  if (store.roomId !== roomId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-white/70">
          This game session isn&rsquo;t open in this tab. Room links can&rsquo;t be joined directly — head back to the
          lobby to host or join a game.
        </p>
        <button type="button" className="btn-gold" onClick={() => navigate('/')}>
          Back to Lobby
        </button>
      </div>
    )
  }

  if (store.status === 'waiting') {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        <p className="text-white/70">Share this code with your opponent:</p>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(roomId)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
          className="rounded-xl border border-gold/50 bg-gold/10 px-6 py-3 font-mono text-2xl font-bold tracking-widest text-gold-light"
        >
          {roomId}
        </button>
        <p className="text-xs text-white/40">{copied ? 'Copied!' : 'Tap to copy'}</p>
        <p className="text-sm text-white/60">Waiting for opponent to join…</p>
        <button type="button" className="btn-ghost" onClick={() => navigate('/')}>
          Cancel
        </button>
      </div>
    )
  }

  if (!store.opponentUid || store.status === 'dealing') {
    return <div className="flex flex-1 items-center justify-center text-white/60">Dealing…</div>
  }

  if (store.error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-red-400">{store.error}</p>
        <button type="button" className="btn-gold" onClick={() => navigate('/')}>
          Back to Lobby
        </button>
      </div>
    )
  }

  const isMyTurn = store.status === 'placing' && store.turnUid === store.myUid
  const opponentName = store.room?.players?.[store.opponentUid]?.displayName ?? 'Opponent'
  const opponentConnected = store.room?.players?.[store.opponentUid]?.connected ?? true

  return (
    <GameScreen
      status={store.status}
      myUid={store.myUid}
      myName={store.myName}
      opponentName={opponentName}
      opponentConnected={opponentConnected}
      myBoard={store.myBoard}
      opponentBoard={store.opponentBoard}
      isMyTurn={isMyTurn}
      cashGame={store.cashGame}
      nextCard={isMyTurn ? store.nextCardToPlace() : null}
      onPlaceCard={store.place}
      swapCard={store.myPrivate?.swapCard}
      myLocked={store.room?.players?.[store.myUid]?.locked ?? false}
      opponentLocked={store.room?.players?.[store.opponentUid]?.locked ?? false}
      onSwapCard={store.swap}
      coachTip={store.lastCoachTip}
      result={store.result}
      onPlayAgain={() => {
        store.leave()
        navigate('/')
      }}
      onExit={() => {
        store.leave()
        navigate('/')
      }}
    />
  )
}
