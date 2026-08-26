import { create } from 'zustand'
// Aliased: zustand's own `create((set, get) => ...)` parameters below would
// otherwise shadow these names throughout the store body.
import { ref, get as fbGet, onValue } from 'firebase/database'
import { rtdb } from '../firebase/config.js'
import {
  newRoomId,
  createRoom,
  joinRoom,
  dealRoom,
  publishInitialHandRank,
  placeCardOnline,
  chooseSwapOnline,
  markComplete,
  subscribeRoom,
} from '../firebase/rooms.js'
import { COLUMNS, HIDDEN_ROW_INDEX } from '../game/board.js'
import { coachTipForPlacement, coachTipForSwap } from '../game/aiCoach.js'
import { evaluateShowdown, calculatePayout } from '../game/scoring.js'
import { recordGameResult } from './useLeaderboardStore.js'

// RTDB collapses a fully-populated 0..N sequential-key node into a real JS
// array on read, but any gap (or an empty column) comes back as an object
// or undefined — normalize so the rest of this file can always index/`.length`.
function columnAsArray(col) {
  if (!col) return []
  if (Array.isArray(col)) return col
  return Object.keys(col)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => col[k])
}

function normalizeBoard(rawBoard) {
  const board = {}
  for (const col of COLUMNS) board[col] = columnAsArray(rawBoard?.[col])
  return board
}

function totalPlaced(board) {
  return COLUMNS.reduce((sum, col) => sum + board[col].length, 0)
}

function isFullyRevealed(board) {
  return COLUMNS.every((col) => {
    const card = board[col][HIDDEN_ROW_INDEX]
    return Boolean(card?.rank && card?.suit)
  })
}

// Fills in a column's real hidden-row value from private data, when known
// (always for your own board; only after showdown for the opponent's).
function mergeHidden(board, hiddenByCol) {
  if (!hiddenByCol) return board
  const merged = {}
  for (const col of COLUMNS) {
    merged[col] = board[col].map((card, idx) =>
      idx === HIDDEN_ROW_INDEX && hiddenByCol[col] ? { ...card, ...hiddenByCol[col] } : card,
    )
  }
  return merged
}

const initialState = {
  roomId: null,
  myUid: null,
  myName: null,
  opponentUid: null,
  isHost: false,
  status: 'idle', // idle | waiting | dealing | placing | swap | showdown | complete | error
  room: null, // last raw snapshot from RTDB
  myPrivate: null,
  opponentPrivate: null, // only populated once readable (showdown/complete)
  cashGame: null,
  turnUid: null,
  myBoard: null,
  opponentBoard: null,
  result: null,
  lastCoachTip: null,
  error: null,
}

let roomUnsub = null
let privateUnsub = null
let opponentPrivateUnsub = null
let dealTriggered = false
let completeHandled = false

export const useOnlineGameStore = create((set, get) => ({
  ...initialState,

  async hostGame({ uid, name, cashGame }) {
    const roomId = newRoomId()
    await createRoom({ roomId, hostUid: uid, hostName: name, cashGame })
    get()._attach({ roomId, uid, name, isHost: true })
    return roomId
  },

  async joinGame({ roomId, uid, name }) {
    const roomSnap = await fetchRoomOnce(roomId)
    if (!roomSnap?.meta?.hostUid) throw new Error('Room not found')
    if (roomSnap.meta.guestUid) throw new Error('Room is already full')
    await joinRoom({ roomId, guestUid: uid, guestName: name })
    get()._attach({ roomId, uid, name, isHost: false })
  },

  _attach({ roomId, uid, name, isHost }) {
    get().leave()
    dealTriggered = false
    completeHandled = false
    set({ ...initialState, roomId, myUid: uid, myName: name, isHost, status: 'waiting' })

    roomUnsub = subscribeRoom(roomId, (room) => get()._onRoom(room))
    privateUnsub = onValue(ref(rtdb, `rooms/${roomId}/private/${uid}`), (snap) => get()._onMyPrivate(snap.val()))
  },

  _onRoom(room) {
    if (!room) return
    const { myUid, isHost } = get()
    const opponentUid = room.meta.hostUid === myUid ? room.meta.guestUid : room.meta.hostUid

    set({ room, opponentUid, cashGame: room.meta.cashGame, turnUid: room.meta.turnUid ?? null, status: room.meta.status })

    const myPublicBoard = normalizeBoard(room.players?.[myUid]?.board)
    const opponentPublicBoard = opponentUid ? normalizeBoard(room.players?.[opponentUid]?.board) : normalizeBoard()
    set({
      myBoard: mergeHidden(myPublicBoard, get().myPrivate?.hiddenCardByCol),
      opponentBoard: mergeHidden(opponentPublicBoard, get().opponentPrivate?.hiddenCardByCol),
    })

    // Host-only: deal the moment a guest has joined a still-"waiting" room.
    if (isHost && room.meta.status === 'waiting' && room.meta.guestUid && !dealTriggered) {
      dealTriggered = true
      dealRoom({ roomId: get().roomId, hostUid: myUid, guestUid: room.meta.guestUid }).catch((err) =>
        set({ status: 'error', error: err.message }),
      )
    }

    // Once the room reaches showdown, the private-read rule opens up for
    // the opponent's data too — subscribe to it (not before: earlier than
    // this it would just be a permission-denied listener).
    if ((room.meta.status === 'showdown' || room.meta.status === 'complete') && opponentUid && !opponentPrivateUnsub) {
      opponentPrivateUnsub = onValue(ref(rtdb, `rooms/${get().roomId}/private/${opponentUid}`), (snap) =>
        get()._onOpponentPrivate(snap.val()),
      )
    }

    if (room.meta.status === 'showdown') {
      get()._maybeFinalizeShowdown()
    }
  },

  _onMyPrivate(priv) {
    const { room, myUid, roomId } = get()
    set({ myPrivate: priv, myBoard: mergeHidden(get().myBoard ?? normalizeBoard(), priv?.hiddenCardByCol) })

    // Publish our own initial-hand rank once we can see our own hand and
    // haven't already (self-write; see src/firebase/rooms.js for why this
    // isn't the host's job even though the host dealt the cards).
    if (priv?.initialHand && !room?.players?.[myUid]?.initialHandRank) {
      publishInitialHandRank(roomId, myUid, priv.initialHand).catch(() => {})
    }
  },

  _onOpponentPrivate(priv) {
    set({ opponentPrivate: priv, opponentBoard: mergeHidden(get().opponentBoard ?? normalizeBoard(), priv?.hiddenCardByCol) })
    // This is what actually completes the reveal once showdown opens the
    // read rule — _onRoom already tried once when status flipped, but the
    // opponent's data almost always lands in a later, separate callback.
    if (get().room?.meta?.status === 'showdown') get()._maybeFinalizeShowdown()
  },

  nextCardToPlace() {
    const { myPrivate, myBoard } = get()
    if (!myPrivate || !myBoard) return null
    const placed = totalPlaced(myBoard)
    return placed < 5 ? myPrivate.initialHand[placed] : myPrivate.drawQueue[placed - 5]
  },

  async place(col) {
    const { room, roomId, myUid, opponentUid, myBoard } = get()
    if (!room || room.meta.status !== 'placing' || room.meta.turnUid !== myUid) return
    const card = get().nextCardToPlace()
    if (!card) return

    const nextIndex = myBoard[col].length
    if (nextIndex >= 5) return

    const coachTip = coachTipForPlacement(myBoard, card, col)
    set({ lastCoachTip: { uid: myUid, ...coachTip } })

    const willBeMyTotal = totalPlaced(myBoard) + 1
    const opponentTotal = totalPlaced(get().opponentBoard ?? normalizeBoard())
    const bothBoardsFull = willBeMyTotal === 25 && opponentTotal === 25

    await placeCardOnline({
      roomId,
      uid: myUid,
      opponentTurnUid: opponentUid,
      col,
      card,
      nextIndex,
      bothBoardsFull,
    })
  },

  async swap(col) {
    const { room, roomId, myUid, myPrivate, myBoard } = get()
    if (!room || room.meta.status !== 'swap' || room.players?.[myUid]?.locked) return
    if (!myPrivate?.swapCard) return

    const coachTip = coachTipForSwap(myBoard, myPrivate.swapCard, col)
    set({ lastCoachTip: { uid: myUid, ...coachTip } })

    const opponentUid = get().opponentUid
    const bothLocked = !!room.players?.[opponentUid]?.locked

    await chooseSwapOnline({ roomId, uid: myUid, col, swapCard: myPrivate.swapCard, bothLocked })
  },

  _maybeFinalizeShowdown() {
    const { room, myUid, opponentUid, myBoard, opponentBoard, isHost, roomId, myName } = get()
    if (!room || !opponentBoard || completeHandled) return
    // A board's array length is already 25 from public placeholders well
    // before showdown (the hidden slot exists, just without rank/suit) —
    // only a real rank/suit at every hidden slot proves the opponent's
    // private reveal has actually arrived over the wire.
    if (!isFullyRevealed(myBoard) || !isFullyRevealed(opponentBoard)) return

    completeHandled = true
    const showdown = evaluateShowdown({ uid: myUid, board: myBoard }, { uid: opponentUid, board: opponentBoard })
    const payout = calculatePayout(showdown.columnsWon, myUid, opponentUid, room.meta.cashGame?.valuePerColumn ?? 0)
    const result = { ...showdown, ...payout }
    set({ result, status: 'complete' })

    markComplete(roomId).catch(() => {})

    recordGameResult({
      gameId: roomId,
      isHost,
      myUid,
      myName,
      opponentUid,
      opponentName: room.players?.[opponentUid]?.displayName ?? 'Opponent',
      cashGame: room.meta.cashGame,
      result,
    }).catch((err) => set({ error: err.message }))
  },

  leave() {
    if (roomUnsub) roomUnsub()
    if (privateUnsub) privateUnsub()
    if (opponentPrivateUnsub) opponentPrivateUnsub()
    roomUnsub = privateUnsub = opponentPrivateUnsub = null
    set(initialState)
  },
}))

async function fetchRoomOnce(roomId) {
  const snap = await fbGet(ref(rtdb, `rooms/${roomId}`))
  return snap.val()
}
