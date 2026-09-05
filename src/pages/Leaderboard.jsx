import { useEffect } from 'react'
import { useLeaderboardStore } from '../store/useLeaderboardStore.js'
import { useAuthStore } from '../store/useAuthStore.js'

function winRate(stats) {
  const played = stats?.gamesPlayed ?? 0
  if (played === 0) return null
  return Math.round(((stats?.gamesWon ?? 0) / played) * 100)
}

// A small pill for one stat, used across the main leaderboard rows so
// they all read as the same kind of information.
function Stat({ label, value }) {
  if (value === null || value === undefined) return null
  return (
    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-white/60">
      <span className="font-semibold text-white/80">{value}</span> {label}
    </span>
  )
}

// One win-margin count (how many games ended 5-0 / 4-1 / 3-2) — kept
// visually distinct from the general Stat pills above since these three
// always add up to gamesWon and read better as a small inline breakdown
// than as more pills in the same row.
function Margin({ label, value }) {
  if (!value) return null
  return (
    <span className="text-white/50">
      <span className="font-semibold text-white/80">{value}</span> × {label}
    </span>
  )
}

export default function Leaderboard() {
  const { entries, status, fetchTop, headToHead, headToHeadStatus, fetchHeadToHead } = useLeaderboardStore()
  const { user } = useAuthStore()

  useEffect(() => {
    fetchTop(50)
  }, [fetchTop])

  useEffect(() => {
    fetchHeadToHead(user?.uid)
  }, [fetchHeadToHead, user?.uid])

  // The bot's entry gets its own simple card below, separate from real
  // opponents — see useLeaderboardStore.js's recordGameResult for why
  // vs-computer play is tracked here (head-to-head) and nowhere else.
  const vsComputer = headToHead.find((h) => h.opponentUid === 'bot')
  const vsPlayers = headToHead.filter((h) => h.opponentUid !== 'bot')

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 py-8">
      <h1 className="text-center font-display text-2xl font-bold text-gold-light">Leaderboard</h1>

      {user && headToHeadStatus === 'ready' && vsComputer && (
        <div className="panel flex items-center justify-between p-4">
          <span className="text-sm text-white/70">Vs. Computer</span>
          <span className="text-sm">
            <span className="font-semibold text-win">{vsComputer.wins}</span>
            <span className="text-white/40"> you</span>
            <span className="mx-2 text-white/30">–</span>
            <span className="font-semibold text-red-300">{vsComputer.losses}</span>
            <span className="text-white/40"> computer</span>
          </span>
        </div>
      )}

      {/* Your own record against every real opponent you've played — the
          ranked list below only has totals, not who they were against.
          Only ever reads the signed-in viewer's own subcollection (see
          firestore.rules' users/{uid}/headToHead), so there's nothing to
          show before sign-in completes. */}
      {user && headToHeadStatus === 'ready' && vsPlayers.length > 0 && (
        <div className="panel flex flex-col gap-2 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">Your Head-to-Head</h2>
          <ul className="flex flex-col divide-y divide-white/10">
            {vsPlayers.map((h) => (
              <li key={h.opponentUid} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-sm text-white/90">vs. {h.opponentName ?? 'Opponent'}</span>
                <span className="shrink-0 text-sm">
                  <span className="font-semibold text-win">{h.wins}</span>
                  <span className="text-white/40">–</span>
                  <span className="font-semibold text-red-300">{h.losses}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-white/40">Online Rankings</h2>

        {status === 'loading' && <p className="text-center text-sm text-white/50">Loading…</p>}
        {status === 'error' && <p className="text-center text-sm text-red-400">Couldn&rsquo;t load the leaderboard.</p>}
        {status === 'ready' && entries.length === 0 && (
          <p className="text-center text-sm text-white/50">No online games recorded yet — be the first!</p>
        )}

        {entries.length > 0 && (
          <ol className="panel divide-y divide-white/10">
            {entries.map((entry, i) => {
              const stats = entry.stats ?? {}
              const rate = winRate(stats)
              const hasMargins = stats.wins5_0 > 0 || stats.wins4_1 > 0 || stats.wins3_2 > 0
              return (
                <li key={entry.uid} className="flex flex-col gap-1.5 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center font-display text-sm font-bold text-gold-light">{i + 1}</span>
                    <span className="flex-1 truncate text-sm text-white/90">{entry.displayName}</span>
                    <span className="text-sm font-semibold text-win">{stats.gamesWon ?? 0}</span>
                    <span className="text-xs text-white/40">wins</span>
                  </div>
                  <div className="ml-9 flex flex-wrap gap-1.5">
                    <Stat label="played" value={stats.gamesPlayed ?? 0} />
                    {rate !== null && <Stat label="win rate" value={`${rate}%`} />}
                    {stats.currentWinStreak > 0 && <Stat label="streak 🔥" value={stats.currentWinStreak} />}
                    {stats.bestWinStreak > 0 && <Stat label="best streak" value={stats.bestWinStreak} />}
                    {stats.columnsWon > 0 && (
                      <Stat label={stats.columnsWon === 1 ? 'column won' : 'columns won'} value={stats.columnsWon} />
                    )}
                  </div>
                  {hasMargins && (
                    <div className="ml-9 flex gap-3 text-[11px]">
                      <Margin label="5-0" value={stats.wins5_0} />
                      <Margin label="4-1" value={stats.wins4_1} />
                      <Margin label="3-2" value={stats.wins3_2} />
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
