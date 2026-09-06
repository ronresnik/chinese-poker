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

  headToHead: [],
  headToHeadStatus: 'idle', // 'idle' | 'loading' | 'ready' | 'error'

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

  // The signed-in viewer's own record against every opponent they've
  // played — the users/{uid} doc itself only carries totals, not who
  // they were against, so this reads the sibling headToHead subcollection
  // (see firestore.rules and recordGameResult below) instead.
  async fetchHeadToHead(uid) {
    if (!uid) {
      set({ headToHead: [], headToHeadStatus: 'idle' })
      return
    }
    set({ headToHeadStatus: 'loading' })
    try {
      const snap = await getDocs(collection(db, 'users', uid, 'headToHead'))
      const records = snap.docs.map((d) => d.data()).sort((a, b) => b.gamesPlayed - a.gamesPlayed)
      set({ headToHead: records, headToHeadStatus: 'ready' })
    } catch {
      set({ headToHeadStatus: 'error' })
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
    // Online games only — see recordGameResult's isOnline branch. A
    // vs-computer game never updates this doc at all, so these numbers
    // can't be inflated by farming wins against the bot.
    stats: {
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      // columnsWon/wins5_0/wins4_1/wins3_2/currentWinStreak/bestWinStreak:
      // see recordGameResult and firestore.rules' users/{uid} update
      // rule, which reads each with a `.get(field, 0)` fallback
      // specifically so a profile created before these existed doesn't
      // get permanently locked out of ever updating again.
      columnsWon: 0,
      wins5_0: 0,
      wins4_1: 0,
      wins3_2: 0,
      currentWinStreak: 0,
      bestWinStreak: 0,
    },
  }
  await setDoc(ref, profile)
  return profile
}

// Firestore's own permission-denied message is the same generic string
// ("Missing or insufficient permissions.") no matter which of the several
// writes below actually triggered it — reported once, that's genuinely
// impossible to act on: is it the games/{gameId} create, the vs-computer
// headToHead write, or the online stats transaction? Each is wrapped with
// this so the step name rides along in statsNote, turning "insufficient
// permissions" into "insufficient permissions writing headToHead (bot)" —
// the difference between a guess and an actual diagnosis.
async function withStep(step, fn) {
  try {
    return await fn()
  } catch (err) {
    const wrapped = new Error(`${err.message} [writing ${step}]`)
    wrapped.cause = err
    throw wrapped
  }
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
 * Records one finished game — online or vs-computer, see
 * useLocalGameStore.js/LocalGame.jsx and useOnlineGameStore.js for the two
 * callers, distinguished here by `isOnline`. Both kinds write the same
 * immutable `games/{gameId}` audit record and the same headToHead entry
 * against whoever the opponent was (the bot's constant uid works there
 * exactly like a real player's). They diverge after that: only an online
 * result touches `users/{uid}.stats` — the ranked leaderboard, win
 * streaks, and margin counts are online-only by construction, so a solo
 * player can't inflate them by farming wins against the bot. "How much
 * you've won vs. the Computer" still exists, it's just the headToHead
 * entry for opponentUid 'bot', not a users/{uid}.stats field.
 *
 * Online, this runs independently on EACH client once it observes the
 * room has reached "complete"; every write here is scoped to that
 * caller's own uid, which is what firestore.rules actually allows (see
 * docs/firebase-schema.md). Only the room host writes the shared `games`
 * record, to avoid two clients racing to create the same doc; the
 * non-host briefly waits for it to land before bumping its own stats,
 * since the rules require that record to already exist and name the
 * winner before a gamesWon increment is allowed. A vs-computer game has
 * only one real client, so it always takes the `isHost: true` path —
 * structurally the same `games` write either way (`players` just
 * includes the bot's constant uid rather than a second real player).
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
  isOnline,
}) {
  if (isHost) {
    await withStep(`games/${gameId}`, () =>
      setDoc(doc(db, 'games', gameId), {
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
      }),
    )
  } else if (!(await waitForGameDoc(gameId))) {
    // The host never wrote the record (offline, closed the tab, or the
    // Firestore rules aren't published). Their own stats still count;
    // ours simply can't, because the rules require the match record to
    // exist before a win can be claimed.
    return { recorded: false, reason: 'match record was never created by the host' }
  }

  const h2hRef = doc(db, 'users', myUid, 'headToHead', opponentUid)
  const won = result.winnerUid === myUid
  const lost = result.winnerUid === opponentUid

  // The shared part of both branches below: read whatever head-to-head
  // record already exists against this opponent (there may be none yet)
  // and fold this game's outcome into it. tx.set (a full overwrite, not
  // tx.update's partial merge) either way: on a brand-new opponent this
  // doc doesn't exist yet, so update() would fail outright, and
  // firestore.rules' create/update split expects the complete shape in
  // both cases anyway.
  function foldHeadToHead(tx, h2hSnap) {
    const h2h = h2hSnap.exists() ? h2hSnap.data() : { wins: 0, losses: 0, gamesPlayed: 0 }
    tx.set(h2hRef, {
      opponentUid,
      opponentName,
      wins: h2h.wins + (won ? 1 : 0),
      losses: h2h.losses + (lost ? 1 : 0),
      gamesPlayed: h2h.gamesPlayed + 1,
      lastGameId: gameId,
    })
  }

  if (!isOnline) {
    // Vs-computer: head-to-head against the bot is the entire record —
    // see this function's doc comment for why the ranked leaderboard
    // stats below never see a vs-computer game at all.
    await withStep(`headToHead/${opponentUid}`, () =>
      runTransaction(db, async (tx) => {
        const h2hSnap = await tx.get(h2hRef)
        foldHeadToHead(tx, h2hSnap)
      }),
    )
    return { recorded: true }
  }

  await withStep(`users/${myUid} (ensureUserProfile)`, () => ensureUserProfile(myUid, myName))
  const userRef = doc(db, 'users', myUid)
  const columnsWonThisGame = result.columnsWon?.[myUid] ?? 0
  // The winning margin (5, 4, or 3 columns — see game/README.md's "no
  // column is ever drawn" proof, which is what makes those the only
  // three possibilities) only means anything when this player actually
  // won; unused otherwise, so it's fine that it's just this player's own
  // column count rather than something more elaborate.
  const margin = won ? columnsWonThisGame : null

  await withStep(`users/${myUid} + headToHead/${opponentUid} (online stats)`, () =>
    runTransaction(db, async (tx) => {
      // Every read in a Firestore transaction must happen before any write
      // — both docs are read here first, then both written below.
      const userSnap = await tx.get(userRef)
      const h2hSnap = await tx.get(h2hRef)

      const stats = userSnap.data().stats
      // .get-with-fallback equivalent for a profile written before these
      // fields existed — see ensureUserProfile and firestore.rules' matching
      // .get(field, 0) on the same fields, which is what actually allows an
      // update from a legacy document to succeed at all.
      const columnsWon = stats.columnsWon ?? 0
      const wins5_0 = stats.wins5_0 ?? 0
      const wins4_1 = stats.wins4_1 ?? 0
      const wins3_2 = stats.wins3_2 ?? 0
      const currentWinStreak = stats.currentWinStreak ?? 0
      const bestWinStreak = stats.bestWinStreak ?? 0

      const newCurrentWinStreak = won ? currentWinStreak + 1 : 0

      tx.update(userRef, {
        lastGameId: gameId,
        stats: {
          gamesPlayed: stats.gamesPlayed + 1,
          gamesWon: stats.gamesWon + (won ? 1 : 0),
          gamesLost: stats.gamesLost + (lost ? 1 : 0),
          columnsWon: columnsWon + columnsWonThisGame,
          wins5_0: wins5_0 + (margin === 5 ? 1 : 0),
          wins4_1: wins4_1 + (margin === 4 ? 1 : 0),
          wins3_2: wins3_2 + (margin === 3 ? 1 : 0),
          currentWinStreak: newCurrentWinStreak,
          bestWinStreak: Math.max(bestWinStreak, newCurrentWinStreak),
        },
      })

      foldHeadToHead(tx, h2hSnap)
    }),
  )

  return { recorded: true }
}
