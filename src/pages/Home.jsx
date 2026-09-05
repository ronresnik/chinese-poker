import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore.js'
import { useOnlineGameStore } from '../store/useOnlineGameStore.js'
import { sanitizeRoomCode, ROOM_CODE_LENGTH } from '../firebase/roomEntry.js'
import { subscribeOpenRooms } from '../firebase/rooms.js'
import { formatCurrency } from '../utils/format.js'
import ErrorReport from '../components/ErrorReport.jsx'

const CURRENCIES = ['USD', 'NIS', 'EUR', 'GBP']

// A host who closes their tab without hitting "Leave" (see
// OnlineGame.jsx) leaves their lobby entry behind indefinitely — there's
// no server-side cleanup on this free-tier stack (see
// docs/firebase-schema.md). Hiding anything older than this is a cheap
// client-side mitigation, not a real fix: a stale entry still exists in
// the database, it just stops being *offered* to browse.
const STALE_ROOM_MS = 2 * 60 * 60 * 1000

export default function Home() {
  const navigate = useNavigate()
  const { user, status: authStatus, error: authError } = useAuthStore()
  const hostGame = useOnlineGameStore((s) => s.hostGame)
  const joinGame = useOnlineGameStore((s) => s.joinGame)

  // Two screens rather than one long form: naming yourself and choosing
  // what to play are different decisions, and cramming both onto one
  // screen buried the actual choice (vs. computer vs. online) under
  // name/cash-game controls that only need to be set once. 'choose' is
  // only ever reached with a validated, trimmed name already in hand.
  const [step, setStep] = useState('name')
  const [name, setName] = useState('')
  const [cashEnabled, setCashEnabled] = useState(false)
  const [value, setValue] = useState(5)
  const [currency, setCurrency] = useState('USD')
  const [joinCode, setJoinCode] = useState('')
  const [showJoin, setShowJoin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const cashGame = { enabled: cashEnabled, valuePerColumn: Number(value) || 0, currency }
  const playerName = name.trim()
  const NAME_REQUIRED_MESSAGE = 'Please enter your name before playing — every game needs to know who you are.'

  function handleContinue(e) {
    e.preventDefault()
    if (!playerName) {
      setError(NAME_REQUIRED_MESSAGE)
      return
    }
    setError(null)
    setStep('choose')
  }

  function handlePlayLocal() {
    navigate('/local', { state: { name: playerName, cashGame } })
  }

  async function handleHost() {
    setBusy(true)
    setError(null)
    try {
      const roomId = await hostGame({ uid: user.uid, name: playerName, cashGame })
      navigate(`/online/${roomId}`, { state: { name: playerName } })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  // Shared by the manual code form below AND tapping an entry in the open
  // rooms list — same call, same sanitization, same navigation target.
  // Sanitizing once, here, and using the result for BOTH the join call
  // and the URL matters even for a list tap (where the code is already
  // clean): using the raw input for one and the sanitized code for the
  // other would make OnlineGame.jsx's `store.roomId !== roomId` check
  // fail even for a join that actually succeeded.
  async function joinRoomByCode(rawCode) {
    setBusy(true)
    setError(null)
    const code = sanitizeRoomCode(rawCode)
    try {
      await joinGame({ roomId: code, uid: user.uid, name: playerName })
      navigate(`/online/${code}`, { state: { name: playerName } })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  function handleJoinForm(e) {
    e.preventDefault()
    joinRoomByCode(joinCode)
  }

  const onlineReady = authStatus === 'ready' && !!user

  // Open rooms: see firebase/rooms.js's subscribeOpenRooms/publishToLobby
  // for why this can list rooms at all (a separate `lobby` index, since
  // nothing grants a broad read over `rooms` itself). Only subscribed
  // once signed in — `lobby`'s RTDB rule requires auth, so attaching any
  // earlier would just be a listener sitting on a permission error.
  const [openRooms, setOpenRooms] = useState([])
  useEffect(() => {
    if (!onlineReady) return undefined
    const unsub = subscribeOpenRooms((raw) => {
      const now = Date.now()
      const rooms = Object.entries(raw ?? {})
        .map(([id, entry]) => ({ id, ...entry }))
        .filter((r) => r.status === 'waiting' && r.hostUid !== user.uid && now - (r.createdAt ?? 0) < STALE_ROOM_MS)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
      setOpenRooms(rooms)
    })
    return unsub
  }, [onlineReady, user?.uid])

  if (step === 'name') {
    return (
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-5 py-8">
        <div className="text-center">
          <h1 className="font-display text-3xl font-bold text-gold-light">5-Column Poker</h1>
          <p className="mt-1 text-sm text-white/60">Five hands. One board. Winner takes the columns.</p>
        </div>

        <form onSubmit={handleContinue} className="panel flex flex-col gap-4 p-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-white/70">Your name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (error === NAME_REQUIRED_MESSAGE) setError(null)
              }}
              placeholder="Enter your name"
              maxLength={20}
              aria-invalid={error === NAME_REQUIRED_MESSAGE}
              className={
                'rounded-lg border bg-ink px-3 py-2 text-white outline-none focus:border-gold/60 ' +
                (error === NAME_REQUIRED_MESSAGE ? 'border-red-500/60' : 'border-white/10')
              }
            />
          </label>

          {error && <ErrorReport message={error} />}

          <button type="submit" className="btn-gold">
            Continue
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-5 py-8">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep('name')}
          className="text-sm text-white/50 transition-colors hover:text-white/80"
        >
          ← {playerName}
        </button>
        <span className="text-xs uppercase tracking-wide text-white/30">Choose a game</span>
      </div>

      <div className="panel flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/70">Cash game</span>
          <button
            type="button"
            onClick={() => setCashEnabled((v) => !v)}
            className={
              cashEnabled
                ? 'relative h-6 w-11 rounded-full bg-gold transition-colors'
                : 'relative h-6 w-11 rounded-full bg-white/15 transition-colors'
            }
          >
            <span
              className={
                'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ' +
                (cashEnabled ? 'translate-x-5' : 'translate-x-0.5')
              }
            />
          </button>
        </div>

        {cashEnabled && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-white/60">Value / column</span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-20 rounded-lg border border-white/10 bg-ink px-2 py-1.5 text-white outline-none focus:border-gold/60"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="rounded-lg border border-white/10 bg-ink px-2 py-1.5 text-white outline-none focus:border-gold/60"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && <ErrorReport message={error} />}

      {authStatus === 'error' && !error && (
        <ErrorReport
          message={[
            'Online play is unavailable on this device.',
            '',
            `Sign-in failed: ${authError ?? 'unknown reason'}`,
            '',
            'This is almost always one of:',
            '  1. An in-app browser (Instagram, WhatsApp, Messenger) or a private/incognito window blocking the site storage Firebase needs. Open the site in Safari or Chrome directly.',
            '  2. No network connection.',
            '',
            'Playing vs. the computer works regardless — it never touches the network.',
          ].join('\n')}
        />
      )}

      {/* Two clearly labeled groups rather than a flat button stack — vs.
          computer and online are different kinds of games (only one of
          them touches the ranked leaderboard, see useLeaderboardStore.js),
          so they read as separate choices even though every button here
          shares the same gold styling. */}
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-white/40">Vs. Computer</h2>
          <button type="button" className="btn-gold" onClick={handlePlayLocal}>
            Play vs. Computer
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-white/40">Play Online</h2>

          <button type="button" className="btn-gold" disabled={!onlineReady || busy} onClick={handleHost}>
            {authStatus === 'error' ? 'Online unavailable — offline?' : onlineReady ? 'Host Online Game' : 'Connecting…'}
          </button>

          {/* Browsable rooms, not just a code field: tapping one joins with
              no typing at all. See firebase/rooms.js's subscribeOpenRooms
              for what makes a room "open" here, and the trust-model note in
              docs/firebase-schema.md for what listing rooms publicly like
              this trades away versus only being joinable by a shared code. */}
          {onlineReady && (
            <div className="panel flex flex-col gap-2 p-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/40">Open Rooms</span>
                {openRooms.length > 0 && <span className="text-xs text-white/30">{openRooms.length} waiting</span>}
              </div>

              {openRooms.length === 0 ? (
                <p className="px-1 text-xs text-white/40">No open rooms right now — host one, or join with a code below.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {openRooms.map((room) => (
                    <li key={room.id}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => joinRoomByCode(room.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-left transition-colors hover:bg-white/10 disabled:opacity-50"
                      >
                        <span className="truncate text-sm text-white/90">{room.hostName || 'Player'}&rsquo;s room</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {room.cashGame?.enabled && (
                            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold-light">
                              {formatCurrency(room.cashGame.valuePerColumn, room.cashGame.currency)}/col
                            </span>
                          )}
                          <span className="font-mono text-xs text-white/40">{room.id}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!showJoin ? (
            <button type="button" className="btn-gold" disabled={!onlineReady} onClick={() => setShowJoin(true)}>
              {authStatus === 'error' ? 'Online unavailable — offline?' : 'Join by Code'}
            </button>
          ) : (
            <form onSubmit={handleJoinForm} className="flex gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(sanitizeRoomCode(e.target.value).slice(0, ROOM_CODE_LENGTH))}
                placeholder="0000"
                inputMode="numeric"
                autoComplete="off"
                maxLength={ROOM_CODE_LENGTH}
                className="w-28 flex-1 rounded-lg border border-white/10 bg-ink px-3 py-2 text-center font-mono text-lg tracking-[0.3em] text-white outline-none focus:border-gold/60"
              />
              <button type="submit" className="btn-gold" disabled={busy || joinCode.length !== ROOM_CODE_LENGTH}>
                Join
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
