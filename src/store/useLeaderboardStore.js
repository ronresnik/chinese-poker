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

async function waitForGameDoc(gameId, attempts = 5) {
  const gameRef = doc(db, 'games', gameId)
  for (let i = 0; i < attempts; i++) {
    const snap = await getDoc(gameRef)
    if (snap.exists()) return snap
    await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)))
  }
  throw new Error(`games/${gameId} was not created in time — stats update skipped`)
}

/**
 * Called independently by EACH client once it observes the room has
 * reached "complete" — every write here is scoped to that caller's own
 * uid, which is what firestore.rules actually allows (see
 * docs/firebase-schema.md). Only the room host writes the shared,
 * immutable `games/{gameId}` match record, to avoid two clients racing to
 * create the same doc; the non-host briefly waits for it to land before
 * bumping its own stats, since the rules require that record to already
 * exist and name the winner before a gamesWon increment is allowed.
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
      cashGame,
      result: {
        columnsWon: result.columnsWon,
        winnerUid: result.winnerUid,
        sweep: result.sweep,
        payout: result.payout,
      },
      startedAt: serverTimestamp(),
      endedAt: serverTimestamp(),
    })
  } else {
    await waitForGameDoc(gameId)
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
}
