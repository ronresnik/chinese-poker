import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/useAuthStore.js'
import { useOnlineGameStore } from '../store/useOnlineGameStore.js'
import ErrorReport from '../components/ErrorReport.jsx'

const CURRENCIES = ['USD', 'NIS', 'EUR', 'GBP']

export default function Home() {
  const navigate = useNavigate()
  const { user, status: authStatus, error: authError } = useAuthStore()
  const hostGame = useOnlineGameStore((s) => s.hostGame)
  const joinGame = useOnlineGameStore((s) => s.joinGame)

  const [name, setName] = useState('')
  const [cashEnabled, setCashEnabled] = useState(false)
  const [value, setValue] = useState(5)
  const [currency, setCurrency] = useState('USD')
  const [joinCode, setJoinCode] = useState('')
  const [showJoin, setShowJoin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const cashGame = { enabled: cashEnabled, valuePerColumn: Number(value) || 0, currency }
  const playerName = name.trim() || 'Player'

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

  async function handleJoin(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await joinGame({ roomId: joinCode.trim(), uid: user.uid, name: playerName })
      navigate(`/online/${joinCode.trim()}`, { state: { name: playerName } })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  const onlineReady = authStatus === 'ready' && !!user

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-5 py-8">
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold text-gold-light">5-Column Poker</h1>
        <p className="mt-1 text-sm text-white/60">Five hands. One board. Winner takes the columns.</p>
      </div>

      <div className="panel flex flex-col gap-4 p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-white/70">Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Player"
            maxLength={20}
            className="rounded-lg border border-white/10 bg-ink px-3 py-2 text-white outline-none focus:border-gold/60"
          />
        </label>

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

      <div className="flex flex-col gap-3">
        <button
          type="button"
          className="btn-gold"
          onClick={() => navigate('/local', { state: { name: playerName, cashGame } })}
        >
          Play vs. Computer
        </button>

        <button type="button" className="btn-ghost" disabled={!onlineReady || busy} onClick={handleHost}>
          {authStatus === 'error' ? 'Online unavailable — offline?' : onlineReady ? 'Host Online Game' : 'Connecting…'}
        </button>

        {!showJoin ? (
          <button type="button" className="btn-ghost" disabled={!onlineReady} onClick={() => setShowJoin(true)}>
            {authStatus === 'error' ? 'Online unavailable — offline?' : 'Join Online Game'}
          </button>
        ) : (
          <form onSubmit={handleJoin} className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Room code"
              className="flex-1 rounded-lg border border-white/10 bg-ink px-3 py-2 text-white outline-none focus:border-gold/60"
            />
            <button type="submit" className="btn-gold" disabled={busy || !joinCode.trim()}>
              Join
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
