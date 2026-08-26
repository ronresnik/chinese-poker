import { create } from 'zustand'
// Aliased: zustand's own `create((set, get) => ...)` parameters below would
// otherwise shadow these names throughout the store body.
import { ref, onValue } from 'firebase/database'
import { rtdb } from '../firebase/config.js'
import {
  newRoomId,
  createRoom,
  joinRoom,
  dealRoom,
  publishInitialHandRank,
  publishInitialBoard,
  placeCardOnline,
  chooseSwapOnline,
  markComplete,
  subscribeMeta,
  subscribePlayers,
  fetchMetaOnce,
  markConnected,
} from '../firebase/rooms.js'
import { shortId, describeRole } from '../firebase/errors.js'
import {
  decideRoomEntry,
  RESUME_HOST,
  RESUME_GUEST,
  TAKE_SEAT,
  NOT_MEMBER,
  ROOM_MISSING,
  ROOM_FULL,
  NOT_SIGNED_IN,
} from '../firebase/roomEntry.js'
import { COLUMNS, HIDDEN_ROW_INDEX, openColumnsForPlacement } from '../game/board.js'
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
  room: null, // { meta, players } reconstructed from the two separate listeners below
  myPrivate: null,
  opponentPrivate: null, // only populated once readable (showdown/complete)
  cashGame: null,
  turnUid: null,
  myBoard: null,
  opponentBoard: null,
  result: null,
  lastCoachTip: null,
  error: null,
  // Non-fatal: the leaderboard/stats write didn't go through. Shown as a
  // footnote on the result screen, never as an error page.
  statsNote: null,
}

// meta and players are subscribed separately (see firebase/rooms.js for
// why: RTDB rules aren't a filter, so a single listen touching both an
// accessible child and an inaccessible one — e.g. the old one-shot
// rooms/{roomId} read hitting private/{opponentUid} pre-showdown — fails
// in its entirety, not just the denied part). Their latest snapshots are
// merged here into the same {meta, players} shape the rest of this file
// already expects, so only the subscription plumbing changes.
let latestMeta = null
let latestPlayers = null
let metaUnsub = null
let playersUnsub = null
let privateUnsub = null
let opponentPrivateUnsub = null
let dealTriggered = false
let initialBoardTriggered = false
let completeHandled = false

export const useOnlineGameStore = create((set, get) => ({
  ...initialState,

  async hostGame({ uid, name, cashGame }) {
    const roomId = newRoomId()
    await createRoom({ roomId, hostUid: uid, hostName: name, cashGame })
    get()._attach({ roomId, uid, name, isHost: true })
    return roomId
  },

  /**
   * Enters a room by code. This deliberately handles *four* cases rather
   * than only "a stranger takes the empty seat", because the other three
   * were each producing a bare PERMISSION_DENIED that no player could act
   * on:
   *
   *  - You are the room's host. Joining your own room as the second
   *    player is denied by the rules (guestUid must differ from hostUid),
   *    which is correct — but the fix is to *resume* your seat, not to
   *    show a permissions error. This is also what happens when a host's
   *    tab reloads: the store is memory-only, so the host silently drops
   *    out of their own room and the game can never start (only the host
   *    is allowed to deal). That is exactly the "two players joined but
   *    status stayed 'waiting'" state seen in the database.
   *  - You are already the guest — same thing, resume rather than
   *    re-claim a seat you already hold.
   *  - The seat is genuinely taken by someone else.
   *  - The room doesn't exist.
   */
  async joinGame({ roomId, uid, name }) {
    return get()._enterRoom({ roomId, uid, name, allowNewSeat: true })
  },

  // Resume-only: never claims the second seat. Used when landing on a
  // room URL directly, so an accidental visit can't consume the seat the
  // real opponent is about to take.
  async resumeRoom({ roomId, uid, name }) {
    return get()._enterRoom({ roomId, uid, name, allowNewSeat: false })
  },

  async _enterRoom({ roomId, uid, name, allowNewSeat }) {
    const code = String(roomId ?? '').trim()
    if (!code) throw new Error('Enter the room code your opponent shared with you.')

    const meta = uid ? await fetchMetaOnce(code, uid) : null
    const { action, isHost } = decideRoomEntry({ meta, myUid: uid, allowNewSeat })

    switch (action) {
      case RESUME_HOST:
      case RESUME_GUEST:
        await markConnected(code, uid)
        get()._attach({ roomId: code, uid, name, isHost })
        return { resumed: true, isHost }

      case TAKE_SEAT:
        await joinRoom({
          roomId: code,
          guestUid: uid,
          guestName: name,
          facts: { hostUid: meta.hostUid, guestUid: meta.guestUid, roomStatus: meta.status },
        })
        get()._attach({ roomId: code, uid, name, isHost: false })
        return { resumed: false, isHost: false }

      case NOT_MEMBER: {
        const err = new Error('You are not a player in this room.')
        err.notAMember = true
        throw err
      }

      case ROOM_MISSING:
        throw new Error(
          [
            `No room with the code "${code}" exists.`,
            '',
            'Room codes are case-sensitive and usually start with "-". Check for a missing character or a stray space, and make sure the host still has the room open.',
          ].join('\n'),
        )

      case ROOM_FULL:
        throw new Error(
          [
            'This room already has both of its players.',
            '',
            'A room seats exactly two people. If you think this should be your seat, the most likely cause is that this browser is signed in as a different anonymous user than before — anonymous identity is per-browser and is lost when site data is cleared.',
            '',
            'Diagnostics:',
            `  room id     : ${code}`,
            `  your uid    : ${shortId(uid)}`,
            `  host uid    : ${shortId(meta.hostUid)}`,
            `  guest uid   : ${shortId(meta.guestUid)}`,
            `  you are     : ${describeRole({ myUid: uid, hostUid: meta.hostUid, guestUid: meta.guestUid })}`,
            `  room status : ${meta.status ?? '(unknown)'}`,
          ].join('\n'),
        )

      case NOT_SIGNED_IN:
      default:
        throw new Error(
          [
            'This device is not signed in, so it cannot open a room.',
            '',
            'Anonymous sign-in happens automatically, but it fails silently in a private/incognito window, and in in-app browsers (Instagram, WhatsApp, Messenger) that block the site storage Firebase needs.',
            'Try opening the site in Safari or Chrome directly.',
          ].join('\n'),
        )
    }
  },

  _attach({ roomId, uid, name, isHost }) {
    get().leave()
    latestMeta = null
    latestPlayers = null
    dealTriggered = false
    initialBoardTriggered = false
    completeHandled = false
    set({ ...initialState, roomId, myUid: uid, myName: name, isHost, status: 'waiting' })

    metaUnsub = subscribeMeta(roomId, (meta) => {
      latestMeta = meta
      get()._onRoomChange()
    })
    playersUnsub = subscribePlayers(roomId, (players) => {
      latestPlayers = players
      get()._onRoomChange()
    })
    privateUnsub = onValue(ref(rtdb, `rooms/${roomId}/private/${uid}`), (snap) => get()._onMyPrivate(snap.val()))
  },

  _onRoomChange() {
    if (!latestMeta) return
    const room = { meta: latestMeta, players: latestPlayers ?? {} }
    const { myUid, isHost } = get()
    const opponentUid = room.meta.hostUid === myUid ? room.meta.guestUid : room.meta.hostUid

    set({ room, opponentUid, cashGame: room.meta.cashGame, turnUid: room.meta.turnUid ?? null, status: room.meta.status })

    // Both display names come from the room itself, which is the only
    // copy both devices agree on. Taking our own name from here too
    // matters on a resume: a reload has no navigation state to carry the
    // name the player originally typed, so without this they'd show up
    // to themselves as the fallback "Player" mid-game.
    const myNameFromRoom = room.players?.[myUid]?.displayName
    if (myNameFromRoom && myNameFromRoom !== get().myName) set({ myName: myNameFromRoom })

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

    // Auto-deal: the initial 5 cards land one per column, no player
    // choice (mirrors src/game/engine.js's initGame) — self-write, so
    // this doesn't wait on the host or any particular room status beyond
    // having our own private hand to deal from.
    const myPublicBoard = normalizeBoard(room?.players?.[myUid]?.board)
    const alreadyDealt = totalPlaced(myPublicBoard) > 0
    if (priv?.initialHand && !alreadyDealt && !initialBoardTriggered) {
      initialBoardTriggered = true
      publishInitialBoard(roomId, myUid, priv.initialHand).catch(() => {
        initialBoardTriggered = false
      })
    }
  },

  _onOpponentPrivate(priv) {
    set({ opponentPrivate: priv, opponentBoard: mergeHidden(get().opponentBoard ?? normalizeBoard(), priv?.hiddenCardByCol) })
    // This is what actually completes the reveal once showdown opens the
    // read rule — _onRoomChange already tried once when status flipped,
    // but the opponent's data almost always lands in a later, separate
    // callback.
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
    if (!openColumnsForPlacement(myBoard).includes(col)) return
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
    })
      .then((outcome) => {
        if (outcome && outcome.recorded === false) set({ statsNote: outcome.reason })
      })
      // Deliberately NOT `set({ error })`: the leaderboard is bookkeeping
      // that happens after the game is already decided and on screen, and
      // routing its failures into the fatal error state replaced the
      // finished game — result, payout and all — with an error page. The
      // game itself needs nothing from Firestore.
      .catch((err) => set({ statsNote: err.message }))
  },

  leave() {
    if (metaUnsub) metaUnsub()
    if (playersUnsub) playersUnsub()
    if (privateUnsub) privateUnsub()
    if (opponentPrivateUnsub) opponentPrivateUnsub()
    metaUnsub = playersUnsub = privateUnsub = opponentPrivateUnsub = null
    set(initialState)
  },
}))
