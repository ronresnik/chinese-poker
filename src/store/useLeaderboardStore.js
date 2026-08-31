import { create } from 'zustand'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from '../firebase/config.js'

export const useLeaderboardStore = create((set) => ({
  entries: [],
  status: 'idle', // 'idle' | 'loading' | 'ready' | 'error'
  error: null,

  async fetchTop(count = 50) {
    set({ status: 'loading', error: null })
    try {
      const q = query(collection(db, 'users'), orderBy('stats.gamesWon', 'desc'), fsLimit(count))
      const snap = await getDocs(q)
      const entries = snap.docs.map((d) => d.data())
      set({ entries, status: 'ready' })
    } catch (err) {
      set({ status: 'error', error: err.message })
    }
  },
}))

// A fresh Firestore auto-id for a vs-computer match record. Online rooms
// reuse their RTDB roomId as the games/{gameId} key (see recordGameResult
// below); a local game has no room, so it needs its own id the same
// shape Firestore already knows how to generate.
//
// Returns null rather than throwing if Firestore itself isn't configured
// (db is null — see firebase/config.js's safeInit). Single-player vs. the
// computer must work on a device with no Firebase config at all; this is
// called unconditionally from LocalGame.jsx's very first render, so it
// can never be the thing that takes that guarantee down.
export function newLocalGameId() {
  if (!db) return null
  return doc(collection(db, 'games')).id
}

export async function ensureUserProfile(uid, displayName) {
  const ref = doc(db, 'users', uid)
  const snap = await getDoc(ref)
  if (snap.exists()) return snap.data()
  const profile = {
    uid,
    displayName: displayName ?? 'Player',
    createdAt: serverTimestamp(),
    stats: { gamesPlayed: 0, gamesWon: 0, gamesLost: 0 },
  }
  await setDoc(ref, profile)
  return profile
}

// Returns null rather than throwing when the host's match record never
// lands. Nothing about a finished game depends on the leaderboard, so a
// missing record must degrade to "stats not counted", never to an error
// that replaces the player's result screen (see recordGameResult).
async function waitForGameDoc(gameId, attempts = 5) {
  const gameRef = doc(db, 'games', gameId)
  for (let i = 0; i < attempts; i++) {
    const snap = await getDoc(gameRef)
    if (snap.exists()) return snap
    await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)))
  }
  return null
}

/**
 * Records one finished game — online or vs-computer alike, see
 * useLocalGameStore.js/LocalGame.jsx and useOnlineGameStore.js for the two
 * callers. Online, this runs independently on EACH client once it
 * observes the room has reached "complete"; every write here is scoped to
 * that caller's own uid, which is what firestore.rules actually allows
 * (see docs/firebase-schema.md). Only the room host writes the shared,
 * immutable `games/{gameId}` match record, to avoid two clients racing to
 * create the same doc; the non-host briefly waits for it to land before
 * bumping its own stats, since the rules require that record to already
 * exist and name the winner before a gamesWon increment is allowed.
 *
 * A vs-computer game has only one real client, so it always takes the
 * `isHost: true` path — structurally the same write (`players` just
 * includes the bot's constant uid rather than a second real player), so
 * no rule or code path here needs to know which kind of game this was.
 */
export async function recordGameResult({
  gameId,
  isHost,
  myUid,
  myName,
  opponentUid,
  opponentName,
  cashGame,
  result,
}) {
  if (isHost) {
    await setDoc(doc(db, 'games', gameId), {
      players: [myUid, opponentUid],
      playerNames: { [myUid]: myName, [opponentUid]: opponentName },
      // winnerUid has to sit at the TOP level, not only inside `result`:
      // firestore.rules validates `request.resource.data.winnerUid in
      // request.resource.data.players` on create, and the users/{uid}
      // rule reads `get(games/$(lastGameId)).data.winnerUid` to authorize
      // a gamesWon increment. Writing it only under `result` made both
      // reads undefined, so every match record was rejected and the
      // games collection stayed permanently empty.
      winnerUid: result.winnerUid ?? null,
      cashGame,
      result: {
        columnsWon: result.columnsWon,
        winnerUid: result.winnerUid ?? null,
        sweep: result.sweep,
        payout: result.payout,
      },
      startedAt: serverTimestamp(),
      endedAt: serverTimestamp(),
    })
  } else if (!(await waitForGameDoc(gameId))) {
    // The host never wrote the record (offline, closed the tab, or the
    // Firestore rules aren't published). Their own stats still count;
    // ours simply can't, because the rules require the match record to
    // exist before a win can be claimed.
    return { recorded: false, reason: 'match record was never created by the host' }
  }

  await ensureUserProfile(myUid, myName)
  const userRef = doc(db, 'users', myUid)
  const won = result.winnerUid === myUid
  const lost = result.winnerUid === opponentUid

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef)
    const stats = snap.data().stats
    tx.update(userRef, {
      lastGameId: gameId,
      stats: {
        gamesPlayed: stats.gamesPlayed + 1,
        gamesWon: stats.gamesWon + (won ? 1 : 0),
        gamesLost: stats.gamesLost + (lost ? 1 : 0),
      },
    })
  })

  return { recorded: true }
}
