import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useOnlineGameStore } from '../store/useOnlineGameStore.js'
import { useAuthStore } from '../store/useAuthStore.js'
import { closeLobbyEntry } from '../firebase/rooms.js'
import GameScreen from '../components/GameScreen.jsx'
import ErrorReport from '../components/ErrorReport.jsx'

export default function OnlineGame() {
  const { roomId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [copied, setCopied] = useState(false)
  const store = useOnlineGameStore()
  const { user, status: authStatus } = useAuthStore()

  const attached = store.roomId === roomId
  const myName = location.state?.name ?? 'Player'

  // The online store lives only in memory, so a reload — or iOS quietly
  // evicting a backgrounded tab, which is routine when you switch apps to
  // send someone the room code — used to drop the player out of their own
  // room permanently, with no way back in. For the host that also froze
  // the game for both players: only the host is allowed to deal, so a
  // host who lost their tab left the guest waiting forever (exactly the
  // rooms sitting at status "waiting" with two players registered).
  // Re-attach automatically instead, using the seat this uid already
  // holds. Resume-only: an accidental visit must never take the seat the
  // real opponent is about to claim.
  const [rejoin, setRejoin] = useState({ state: 'idle', error: null })
  const triedRef = useRef(null)

  useEffect(() => {
    if (attached || authStatus !== 'ready' || !user?.uid) return
    if (triedRef.current === roomId) return
    triedRef.current = roomId
    setRejoin({ state: 'working', error: null })
    store
      .resumeRoom({ roomId, uid: user.uid, name: myName })
      .then(() => setRejoin({ state: 'idle', error: null }))
      .catch((err) => setRejoin({ state: err.notAMember ? 'not-member' : 'failed', error: err.message }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attached, authStatus, user?.uid, roomId])

  async function joinFresh() {
    setRejoin({ state: 'working', error: null })
    try {
      await store.joinGame({ roomId, uid: user.uid, name: myName })
      setRejoin({ state: 'idle', error: null })
    } catch (err) {
      setRejoin({ state: 'failed', error: err.message })
    }
  }

  if (!attached) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-5 text-center">
        {rejoin.state === 'working' && <p className="text-white/60">Reconnecting you to this room…</p>}

        {rejoin.state === 'idle' && authStatus !== 'ready' && <p className="text-white/60">Signing in…</p>}

        {rejoin.state === 'not-member' && (
          <>
            <p className="text-white/70">
              You&rsquo;re not one of the two players in this room yet.
            </p>
            <p className="font-mono text-sm text-gold-light">{roomId}</p>
            <button type="button" className="btn-gold" onClick={joinFresh}>
              Join this game
            </button>
          </>
        )}

        {rejoin.state === 'failed' && <ErrorReport message={rejoin.error} className="w-full" />}

        <button type="button" className="btn-ghost" onClick={() => navigate('/')}>
          Back to Lobby
        </button>
      </div>
    )
  }

  // Checked before every other state: a failure during dealing used to
  // fall through to the "Dealing…" branch below and hang there forever,
  // hiding the only message that explained what went wrong.
  if (store.error) {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-4 px-5">
        <ErrorReport message={store.error} className="w-full" />
        <button type="button" className="btn-gold" onClick={() => navigate('/')}>
          Back to Lobby
        </button>
      </div>
    )
  }

  if (store.status === 'waiting') {
    const hostConnected = store.room?.players?.[store.room?.meta?.hostUid]?.connected
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
        {store.isHost ? (
          <>
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
            <p className="max-w-xs text-xs text-white/30">
              Keep this screen open — the cards are dealt from your device the moment your opponent joins.
            </p>
          </>
        ) : (
          <>
            <p className="text-white/70">You&rsquo;re in. Waiting for the host to deal…</p>
            {hostConnected === false && (
              <p className="max-w-xs text-sm text-red-300">
                The host&rsquo;s device looks disconnected. Only the host can deal the cards, so they need to reopen
                this room before the game can start.
              </p>
            )}
          </>
        )}
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            // The host leaving a still-open room used to just navigate
            // away with no cleanup at all — the room stayed listed in
            // the open-rooms lobby (see Home.jsx) as tappable, joinable,
            // and permanently stuck at "waiting" for a host who'd already
            // left. Only the host can close it (see closeLobbyEntry's own
            // rule-backed permission check); a guest leaving has nothing
            // of their own to clean up here.
            if (store.isHost) closeLobbyEntry(roomId).catch(() => {})
            store.leave()
            navigate('/')
          }}
        >
          Leave
        </button>
      </div>
    )
  }

  if (!store.opponentUid || store.status === 'dealing') {
    return <div className="flex flex-1 items-center justify-center text-white/60">Dealing…</div>
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
      statsNote={store.statsNote}
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
