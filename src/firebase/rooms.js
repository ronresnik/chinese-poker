import { ref, get, update, onValue, push, onDisconnect, serverTimestamp } from 'firebase/database'
import { rtdb } from './config.js'
import { buildDealPlan } from '../game/dealPlan.js'
import { evaluateHand } from '../game/handEvaluator.js'
import { COLUMNS, HIDDEN_ROW_INDEX } from '../game/board.js'
import { cardCode } from '../game/deck.js'

export function newRoomId() {
  return push(ref(rtdb, 'rooms')).key
}

export function setupPresence(roomId, uid) {
  const connectedRef = ref(rtdb, `rooms/${roomId}/players/${uid}/connected`)
  onDisconnect(connectedRef).set(false)
}

export async function createRoom({ roomId, hostUid, hostName, cashGame }) {
  await update(ref(rtdb), {
    [`rooms/${roomId}/meta/hostUid`]: hostUid,
    [`rooms/${roomId}/meta/status`]: 'waiting',
    [`rooms/${roomId}/meta/cashGame`]: cashGame,
    [`rooms/${roomId}/meta/createdAt`]: serverTimestamp(),
    [`rooms/${roomId}/meta/updatedAt`]: serverTimestamp(),
    [`rooms/${roomId}/players/${hostUid}/displayName`]: hostName,
    [`rooms/${roomId}/players/${hostUid}/connected`]: true,
    [`rooms/${roomId}/players/${hostUid}/locked`]: false,
    [`rooms/${roomId}/players/${hostUid}/swapUsed`]: false,
  })
  setupPresence(roomId, hostUid)
}

export async function joinRoom({ roomId, guestUid, guestName }) {
  await update(ref(rtdb), {
    [`rooms/${roomId}/meta/guestUid`]: guestUid,
    [`rooms/${roomId}/meta/updatedAt`]: serverTimestamp(),
    [`rooms/${roomId}/players/${guestUid}/displayName`]: guestName,
    [`rooms/${roomId}/players/${guestUid}/connected`]: true,
    [`rooms/${roomId}/players/${guestUid}/locked`]: false,
    [`rooms/${roomId}/players/${guestUid}/swapUsed`]: false,
  })
  setupPresence(roomId, guestUid)
}

/**
 * Host-only. One atomic multi-path update writes meta/status="dealing"
 * together with both players' private allocations in the SAME call — RTDB
 * evaluates a multi-location update's rules against the fully-merged
 * post-update tree, so this is what lets database.rules.json's host
 * exception (which is gated on status being "dealing") actually apply to
 * the private/{guestUid} write happening here. See docs/firebase-schema.md.
 *
 * Each player's own client is responsible for publishing its own
 * `players/{uid}/initialHandRank` once it can read its own private hand
 * (self-write, no rule exception needed) — see publishInitialHandRank
 * below and useOnlineGameStore.js.
 */
export async function dealRoom({ roomId, hostUid, guestUid }) {
  const { plan } = buildDealPlan(hostUid, guestUid)

  const dealUpdates = { [`rooms/${roomId}/meta/status`]: 'dealing' }
  for (const uid of [hostUid, guestUid]) {
    dealUpdates[`rooms/${roomId}/private/${uid}/initialHand`] = plan[uid].initialHand
    dealUpdates[`rooms/${roomId}/private/${uid}/drawQueue`] = plan[uid].drawQueue
    dealUpdates[`rooms/${roomId}/private/${uid}/swapCard`] = plan[uid].swapCard
  }
  await update(ref(rtdb), dealUpdates)

  const handA = evaluateHand(plan[hostUid].initialHand)
  const handB = evaluateHand(plan[guestUid].initialHand)
  const cmp = compareCategoryThenTiebreak(handA, handB)
  const firstPlayerUid = cmp === 0 ? [hostUid, guestUid].sort()[0] : cmp > 0 ? hostUid : guestUid

  await update(ref(rtdb), {
    [`rooms/${roomId}/meta/status`]: 'placing',
    [`rooms/${roomId}/meta/turnUid`]: firstPlayerUid,
    [`rooms/${roomId}/meta/firstPlayerUid`]: firstPlayerUid,
    [`rooms/${roomId}/meta/updatedAt`]: serverTimestamp(),
  })

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
 * Places `card` for `uid` into `col`. `nextIndex` (0-4) is the position it
 * lands at — the caller (useOnlineGameStore) derives this from the
 * player's current public board length, since that's the same number both
 * this write and database.rules.json's shape validation agree on.
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

  await update(ref(rtdb), updates)
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
  if (bothLocked) {
    updates[`rooms/${roomId}/meta/status`] = 'showdown'
  }
  await update(ref(rtdb), updates)
}

export async function markComplete(roomId) {
  await update(ref(rtdb), { [`rooms/${roomId}/meta/status`]: 'complete' })
}

export function subscribeRoom(roomId, onChange) {
  const unsub = onValue(ref(rtdb, `rooms/${roomId}`), (snap) => onChange(snap.val()))
  return unsub
}

export function subscribePrivate(roomId, uid, onChange) {
  const unsub = onValue(ref(rtdb, `rooms/${roomId}/private/${uid}`), (snap) => onChange(snap.val()))
  return unsub
}

export async function readRoom(roomId) {
  const snap = await get(ref(rtdb, `rooms/${roomId}`))
  return snap.val()
}

export { COLUMNS }
