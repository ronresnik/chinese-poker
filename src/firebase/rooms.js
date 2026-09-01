import { ref, get, update, onValue, onDisconnect, serverTimestamp } from 'firebase/database'
import { rtdb, auth } from './config.js'
import { buildRoomErrorReport } from './errors.js'
import { buildDealPlan } from '../game/dealPlan.js'
import { evaluateHand } from '../game/handEvaluator.js'
import { COLUMNS, HIDDEN_ROW_INDEX } from '../game/board.js'
import { cardCode } from '../game/deck.js'

const ROOM_CODE_DIGITS = 4
const ROOM_CODE_MAX_ATTEMPTS = 25

/**
 * A 4-digit numeric code (e.g. "0427") rather than a Firebase push key
 * (e.g. "-P-wGAzkBsMBQ9ZPONcu") — short enough to read aloud or type on a
 * phone keyboard, which a 20-character opaque string never was.
 *
 * This is a real trade-off, not a free win, and worth being explicit
 * about: docs/firebase-schema.md's trust model leans on the room id being
 * "an unguessable, out-of-band-shared token" to justify `meta` being
 * readable by any signed-in user. A 4-digit code has only 10,000 possible
 * values, all of them guessable by brute-force enumeration — someone
 * could scan every code and read the `meta` (status/turn/cash-game info,
 * never card data) of every open room, and in principle race a real
 * second player to an open seat. `meta` still never carries card data
 * (that stays behind the private/{uid} read rule regardless), so this
 * doesn't expose hands or outcomes — but it's a real narrowing of the
 * "share this code with your opponent" privacy assumption, made in
 * exchange for a code a person can actually use. See
 * docs/firebase-schema.md for the full writeup.
 *
 * Retries on collision (checked via a real existence read, not just left
 * to the create-room write to fail) since the keyspace is small enough
 * that a collision is a real possibility, not a hypothetical.
 */
export async function newRoomId() {
  for (let attempt = 0; attempt < ROOM_CODE_MAX_ATTEMPTS; attempt++) {
    const code = randomRoomCode()
    const snap = await get(ref(rtdb, `rooms/${code}/meta/hostUid`))
    if (!snap.exists()) return code
  }
  throw new Error('Could not find a free room code — please try hosting again.')
}

function randomRoomCode() {
  const max = 10 ** ROOM_CODE_DIGITS
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  const n = buf[0] % max
  return String(n).padStart(ROOM_CODE_DIGITS, '0')
}

/**
 * Wraps one RTDB call so a failure carries the context needed to explain
 * itself (see errors.js). Firebase's own message names neither the path
 * nor the operation, and this app's whole online flow is a chain of
 * separate small writes — without this, every one of them fails with the
 * identical unusable string.
 */
async function guarded(op, path, facts, fn) {
  try {
    return await fn()
  } catch (err) {
    const report = buildRoomErrorReport({
      op,
      path,
      err,
      facts: { ...facts, ...ambientFacts() },
    })
    const wrapped = new Error(report)
    wrapped.cause = err
    wrapped.isRoomError = true
    throw wrapped
  }
}

// Environment-level facts every report wants, gathered here so no call
// site has to remember them. databaseHost in particular catches a whole
// class of "I published the rules" confusion — rules published to a
// different database than the app talks to look exactly like stale rules.
function ambientFacts() {
  let databaseHost
  try {
    databaseHost = rtdb ? new URL(rtdb.app.options.databaseURL).host : '(rtdb not initialized)'
  } catch {
    databaseHost = rtdb?.app?.options?.databaseURL ?? '(unknown)'
  }
  return {
    databaseHost,
    signedIn: !!auth?.currentUser,
    mode: import.meta.env?.MODE,
    now: new Date().toISOString(),
  }
}

export function setupPresence(roomId, uid) {
  const connectedRef = ref(rtdb, `rooms/${roomId}/players/${uid}/connected`)
  // Fire-and-forget: presence is a nicety, and a failure here must never
  // be what stops a player from entering a room they're otherwise allowed
  // into. Left unhandled it would also surface as an unhandled rejection.
  onDisconnect(connectedRef).set(false).catch(() => {})
}

/**
 * Marks an existing member as connected again and re-arms their
 * disconnect hook. Needed because the online store holds the room purely
 * in memory: a reload (or iOS evicting a backgrounded tab) drops the
 * player out of their own room with `connected` stuck at false, and
 * nothing else ever sets it back.
 */
export async function markConnected(roomId, uid) {
  await guarded('rejoin', `rooms/${roomId}/players/${uid}/connected`, { roomId, myUid: uid }, () =>
    update(ref(rtdb), { [`rooms/${roomId}/players/${uid}/connected`]: true }),
  )
  setupPresence(roomId, uid)
}

/**
 * Every function below writes in a strict sequence of separate update()
 * calls whenever a later field's rule needs to check an earlier one via a
 * root.child() cross-reference (e.g. "is meta/status already 'dealing'?").
 * Each write only ever depends on state a *prior, already-committed* call
 * put there — never on a sibling field being written in the same call.
 * Deliberately not relying on Firebase resolving cross-path root
 * references against an in-flight multi-location update, since that
 * couldn't be verified against a live project/emulator in development
 * (see docs/firebase-schema.md and README's testing notes) and getting it
 * wrong here means every write in the game fails closed with
 * PERMISSION_DENIED — worth the extra round trips to not depend on it.
 */

export async function createRoom({ roomId, hostUid, hostName, cashGame }) {
  const facts = { roomId, myUid: hostUid, hostUid }
  await guarded('create-room', `rooms/${roomId}/meta/hostUid`, facts, () =>
    update(ref(rtdb), { [`rooms/${roomId}/meta/hostUid`]: hostUid }),
  )
  await guarded('create-room', `rooms/${roomId}/meta/status`, facts, () =>
    update(ref(rtdb), { [`rooms/${roomId}/meta/status`]: 'waiting' }),
  )
  await guarded('create-room', `rooms/${roomId}/meta + players/${hostUid}`, facts, () =>
    update(ref(rtdb), {
      [`rooms/${roomId}/meta/cashGame`]: cashGame,
      [`rooms/${roomId}/meta/createdAt`]: serverTimestamp(),
      [`rooms/${roomId}/meta/updatedAt`]: serverTimestamp(),
      [`rooms/${roomId}/players/${hostUid}/displayName`]: hostName,
      [`rooms/${roomId}/players/${hostUid}/connected`]: true,
      [`rooms/${roomId}/players/${hostUid}/locked`]: false,
      [`rooms/${roomId}/players/${hostUid}/swapUsed`]: false,
    }),
  )
  setupPresence(roomId, hostUid)
}

// `facts` carries the room's host/guest uids so a denial can say *why*
// (see errors.js) — "you are the host" and "someone else took the seat"
// are the same PERMISSION_DENIED as far as Firebase is concerned.
export async function joinRoom({ roomId, guestUid, guestName, facts = {} }) {
  const base = { ...facts, roomId, myUid: guestUid }
  await guarded('claim-guest-seat', `rooms/${roomId}/meta/guestUid`, base, () =>
    update(ref(rtdb), { [`rooms/${roomId}/meta/guestUid`]: guestUid }),
  )
  await guarded('write-player', `rooms/${roomId}/players/${guestUid}`, { ...base, guestUid }, () =>
    update(ref(rtdb), {
      [`rooms/${roomId}/meta/updatedAt`]: serverTimestamp(),
      [`rooms/${roomId}/players/${guestUid}/displayName`]: guestName,
      [`rooms/${roomId}/players/${guestUid}/connected`]: true,
      [`rooms/${roomId}/players/${guestUid}/locked`]: false,
      [`rooms/${roomId}/players/${guestUid}/swapUsed`]: false,
    }),
  )
  setupPresence(roomId, guestUid)
}

/**
 * Host-only. Each player's own client is responsible for publishing its
 * own `players/{uid}/initialHandRank` once it can read its own private
 * hand (self-write, no rule exception needed) — see publishInitialHandRank
 * below and useOnlineGameStore.js.
 */
export async function dealRoom({ roomId, hostUid, guestUid }) {
  const { plan } = buildDealPlan(hostUid, guestUid)
  const facts = { roomId, myUid: hostUid, hostUid, guestUid }

  await guarded('deal', `rooms/${roomId}/meta/status`, facts, () =>
    update(ref(rtdb), { [`rooms/${roomId}/meta/status`]: 'dealing' }),
  )

  const dealUpdates = {}
  for (const uid of [hostUid, guestUid]) {
    dealUpdates[`rooms/${roomId}/private/${uid}/initialHand`] = plan[uid].initialHand
    dealUpdates[`rooms/${roomId}/private/${uid}/drawQueue`] = plan[uid].drawQueue
    dealUpdates[`rooms/${roomId}/private/${uid}/swapCard`] = plan[uid].swapCard
  }
  await guarded('deal', `rooms/${roomId}/private/{both players}`, facts, () =>
    update(ref(rtdb), dealUpdates),
  )

  const handA = evaluateHand(plan[hostUid].initialHand)
  const handB = evaluateHand(plan[guestUid].initialHand)
  const cmp = compareCategoryThenTiebreak(handA, handB)
  const firstPlayerUid = cmp === 0 ? [hostUid, guestUid].sort()[0] : cmp > 0 ? hostUid : guestUid

  await guarded('deal', `rooms/${roomId}/meta (status→placing)`, facts, () =>
    update(ref(rtdb), {
      [`rooms/${roomId}/meta/status`]: 'placing',
      [`rooms/${roomId}/meta/turnUid`]: firstPlayerUid,
      [`rooms/${roomId}/meta/firstPlayerUid`]: firstPlayerUid,
      [`rooms/${roomId}/meta/updatedAt`]: serverTimestamp(),
    }),
  )

  const cardUpdates = {}
  for (const uid of [hostUid, guestUid]) {
    for (const card of [...plan[uid].initialHand, ...plan[uid].drawQueue, plan[uid].swapCard]) {
      cardUpdates[`rooms/${roomId}/usedCards/${cardCode(card)}`] = hostUid
    }
  }
  // Best-effort bookkeeping (docs/firebase-schema.md's duplicate-card
  // guard) — a failure here must never block the game from starting.
  update(ref(rtdb), cardUpdates).catch(() => {})
}

function compareCategoryThenTiebreak(a, b) {
  if (a.category !== b.category) return a.category > b.category ? 1 : -1
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const av = a.tiebreak[i] ?? 0
    const bv = b.tiebreak[i] ?? 0
    if (av !== bv) return av > bv ? 1 : -1
  }
  return 0
}

export async function publishInitialHandRank(roomId, uid, initialHand) {
  const hand = evaluateHand(initialHand)
  await update(ref(rtdb), {
    [`rooms/${roomId}/players/${uid}/initialHandRank/category`]: hand.category,
    [`rooms/${roomId}/players/${uid}/initialHandRank/tiebreak`]: hand.tiebreak,
  })
}

/**
 * Self-write: the initial 5-card hand is dealt straight onto the board,
 * one card per column, no player choice (mirrors src/game/engine.js's
 * initGame — see src/game/README.md). Safe to combine into one call: each
 * column's board/$idx validate rule only checks its own node, never a
 * sibling column being written in the same update.
 */
export async function publishInitialBoard(roomId, uid, initialHand) {
  const updates = {}
  COLUMNS.forEach((col, i) => {
    const card = initialHand[i]
    updates[`rooms/${roomId}/players/${uid}/board/${col}/0/faceDown`] = false
    updates[`rooms/${roomId}/players/${uid}/board/${col}/0/rank`] = card.rank
    updates[`rooms/${roomId}/players/${uid}/board/${col}/0/suit`] = card.suit
  })
  await update(ref(rtdb), updates)
}

/**
 * Places `card` for `uid` into `col`. `nextIndex` (0-4) is the position it
 * lands at — the caller (useOnlineGameStore) derives this from the
 * player's current public board length, since that's the same number both
 * this write and database.rules.json's shape validation agree on.
 *
 * Safe to combine in one call: none of these fields' rules cross-reference
 * a sibling field written here (status/turnUid rules only check
 * meta/hostUid + meta/guestUid, which are stable/unmodified by this call).
 */
export async function placeCardOnline({ roomId, uid, opponentTurnUid, col, card, nextIndex, bothBoardsFull }) {
  // Cards are already claimed in usedCards once, at deal time (dealRoom) —
  // re-claiming here would violate its "claim once" rule and fail this
  // entire atomic update, so placement only ever touches the board itself.
  const isHidden = nextIndex === HIDDEN_ROW_INDEX
  const updates = {
    [`rooms/${roomId}/players/${uid}/board/${col}/${nextIndex}/faceDown`]: isHidden,
    [`rooms/${roomId}/meta/updatedAt`]: serverTimestamp(),
  }
  if (isHidden) {
    updates[`rooms/${roomId}/private/${uid}/hiddenCardByCol/${col}`] = { rank: card.rank, suit: card.suit }
  } else {
    updates[`rooms/${roomId}/players/${uid}/board/${col}/${nextIndex}/rank`] = card.rank
    updates[`rooms/${roomId}/players/${uid}/board/${col}/${nextIndex}/suit`] = card.suit
  }
  updates[`rooms/${roomId}/meta/status`] = bothBoardsFull ? 'swap' : 'placing'
  // Once both boards are full there's no next turn to hand off, so
  // turnUid is simply left as-is rather than written to a value the
  // schema wouldn't accept (its .validate requires a real member uid).
  if (!bothBoardsFull) {
    updates[`rooms/${roomId}/meta/turnUid`] = opponentTurnUid
  }

  await guarded('place', `rooms/${roomId}/players/${uid}/board/${col}/${nextIndex}`, { roomId, myUid: uid }, () =>
    update(ref(rtdb), updates),
  )
}

export async function chooseSwapOnline({ roomId, uid, col, swapCard, bothLocked }) {
  // The public board's hidden slot already reads faceDown:true from the
  // original placement and never needs to change — a swap only ever
  // replaces the real value privately, in hiddenCardByCol.
  const updates = {
    [`rooms/${roomId}/players/${uid}/locked`]: true,
    [`rooms/${roomId}/players/${uid}/swapUsed`]: !!col,
    [`rooms/${roomId}/private/${uid}/swapCard`]: null,
    [`rooms/${roomId}/meta/updatedAt`]: serverTimestamp(),
  }
  if (col) {
    updates[`rooms/${roomId}/private/${uid}/hiddenCardByCol/${col}`] = { rank: swapCard.rank, suit: swapCard.suit }
  }
  await update(ref(rtdb), updates)

  if (bothLocked) {
    // Separate, later call: the showdown transition's .validate checks
    // BOTH players' players/*/locked via root.child() — including this
    // player's own, just committed above — so it needs to see
    // already-persisted state, not a sibling write in the same update.
    await update(ref(rtdb), { [`rooms/${roomId}/meta/status`]: 'showdown' })
  }
}

export async function markComplete(roomId) {
  await update(ref(rtdb), { [`rooms/${roomId}/meta/status`]: 'complete' })
}

/**
 * meta and players each have a single, uniform access rule that doesn't
 * depend on which child is being read (meta: any authenticated user;
 * players: any room member) — safe to read/listen to as one broad
 * request. rooms/{roomId} as a whole is NOT safe to read broadly: RTDB
 * rules aren't a filter, so a single read touching both an accessible
 * child (meta) and an inaccessible one (e.g. private/{opponentUid}
 * pre-showdown) fails in its entirety, not just the denied part. That's
 * why there's no subscribeRoom() here — see useOnlineGameStore.js, which
 * subscribes to meta, players, and each private/{uid} as separate
 * listeners instead.
 */
export function subscribeMeta(roomId, onChange) {
  return onValue(ref(rtdb, `rooms/${roomId}/meta`), (snap) => onChange(snap.val()))
}

export function subscribePlayers(roomId, onChange) {
  return onValue(ref(rtdb, `rooms/${roomId}/players`), (snap) => onChange(snap.val()))
}

export function subscribePrivate(roomId, uid, onChange) {
  const unsub = onValue(ref(rtdb, `rooms/${roomId}/private/${uid}`), (snap) => onChange(snap.val()))
  return unsub
}

export async function fetchMetaOnce(roomId, myUid) {
  const snap = await guarded('read-meta', `rooms/${roomId}/meta`, { roomId, myUid }, () =>
    get(ref(rtdb, `rooms/${roomId}/meta`)),
  )
  return snap.val()
}

export { COLUMNS }
