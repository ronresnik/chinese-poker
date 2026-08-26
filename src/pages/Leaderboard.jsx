import { useEffect } from 'react'
import { useLeaderboardStore } from '../store/useLeaderboardStore.js'

export default function Leaderboard() {
  const { entries, status, fetchTop } = useLeaderboardStore()

  useEffect(() => {
    fetchTop(50)
  }, [fetchTop])

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-8">
      <h1 className="text-center font-display text-2xl font-bold text-gold-light">Leaderboard</h1>

      {status === 'loading' && <p className="text-center text-sm text-white/50">Loading…</p>}
      {status === 'error' && <p className="text-center text-sm text-red-400">Couldn&rsquo;t load the leaderboard.</p>}
      {status === 'ready' && entries.length === 0 && (
        <p className="text-center text-sm text-white/50">No games recorded yet — be the first!</p>
      )}

      {entries.length > 0 && (
        <ol className="panel divide-y divide-white/10">
          {entries.map((entry, i) => (
            <li key={entry.uid} className="flex items-center gap-3 px-4 py-3">
              <span className="w-6 text-center font-display text-sm font-bold text-gold-light">{i + 1}</span>
              <span className="flex-1 truncate text-sm text-white/90">{entry.displayName}</span>
              <span className="text-sm font-semibold text-win">{entry.stats?.gamesWon ?? 0}</span>
              <span className="text-xs text-white/40">wins</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
