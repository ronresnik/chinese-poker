import { createShuffledDeck } from './deck.js'
import { createEmptyBoard, isBoardFull, placeCard as placeCardOnBoard } from './board.js'
import { determineFirstPlayer } from './turnOrder.js'
import { evaluateShowdown, calculatePayout } from './scoring.js'
import { applySwap } from './swap.js'
import { coachTipForPlacement, coachTipForSwap } from './aiCoach.js'

export const PHASE = {
  PLACING: 'placing',
  SWAP: 'swap',
  COMPLETE: 'complete',
}

/**
 * Builds a fresh game. This resolves the initial deal + turn-order
 * determination synchronously, since a local single-player engine has no
 * async handoff to model — the RTDB-backed online mode's extra "dealing"
 * phase (docs/firebase-schema.md) exists only because the host has to
 * write each player's private hand over the network before play starts;
 * that's a store-layer concern, not something this pure engine needs.
 *
 * @param {{players:{uid:string,name:string,isBot?:boolean}[], cashGame?:object}} config
 */
export function initGame({ players, cashGame }) {
  if (players.length !== 2) throw new Error('This game is strictly head-to-head (2 players)')

  const deck = createShuffledDeck()
  const initialHands = {}
  for (const p of players) initialHands[p.uid] = deck.splice(0, 5)

  const { firstPlayerUid, hands: evaluatedHands } = determineFirstPlayer(
    players.map((p) => ({ uid: p.uid, initialHand: initialHands[p.uid] })),
  )
  const order =
    firstPlayerUid === players[0].uid ? [players[0].uid, players[1].uid] : [players[1].uid, players[0].uid]

  const playerState = {}
  for (const p of players) {
    playerState[p.uid] = {
      uid: p.uid,
      name: p.name,
      isBot: !!p.isBot,
      hand: initialHands[p.uid],
      board: createEmptyBoard(),
      initialHandRank: evaluatedHands[p.uid],
      swapCard: null,
      swapUsed: false,
      locked: false,
    }
  }

  return {
    status: PHASE.PLACING,
    players: playerState,
    order,
    firstPlayerUid,
    turnIndex: 0,
    deck,
    log: [],
    result: null,
    cashGame: cashGame ?? { enabled: false, valuePerColumn: 0, currency: 'USD' },
    lastCoachTip: null,
  }
}

export function getCurrentTurnUid(state) {
  return state.status === PHASE.PLACING ? state.order[state.turnIndex % 2] : null
}

/** The card `uid` would place next, without mutating state — for UI display. */
export function getNextCard(state, uid) {
  const player = state.players[uid]
  return player.hand.length > 0 ? player.hand[0] : state.deck[0]
}

export function placeCard(state, uid, col) {
  if (state.status !== PHASE.PLACING) throw new Error('Not in the placement phase')
  if (getCurrentTurnUid(state) !== uid) throw new Error(`It is not ${uid}'s turn`)

  const player = state.players[uid]
  let card
  let hand = player.hand
  let deck = state.deck
  if (hand.length > 0) {
    card = hand[0]
    hand = hand.slice(1)
  } else {
    if (deck.length === 0) throw new Error('Deck is empty — this should be unreachable given the card math')
    card = deck[0]
    deck = deck.slice(1)
  }

  const coachTip = coachTipForPlacement(player.board, card, col)
  const newBoard = placeCardOnBoard(player.board, col, card)
  const placedCard = newBoard[col][newBoard[col].length - 1]

  let players = { ...state.players, [uid]: { ...player, hand, board: newBoard } }
  let status = state.status

  if (Object.values(players).every((p) => isBoardFull(p.board))) {
    status = PHASE.SWAP
    for (const playerUid of state.order) {
      const swapCard = deck[0]
      deck = deck.slice(1)
      players = { ...players, [playerUid]: { ...players[playerUid], swapCard } }
    }
  }

  const logEntry = {
    uid,
    type: 'place',
    col,
    ts: Date.now(),
    ...(placedCard.faceDown ? {} : { rank: placedCard.rank, suit: placedCard.suit }),
  }

  return {
    ...state,
    players,
    deck,
    status,
    turnIndex: state.turnIndex + 1,
    log: [...state.log, logEntry],
    lastCoachTip: { uid, ...coachTip },
  }
}

export function chooseSwap(state, uid, col) {
  if (state.status !== PHASE.SWAP) throw new Error('Not in the swap phase')
  const player = state.players[uid]
  if (player.locked) throw new Error(`${uid} has already locked in their swap decision`)
  if (!player.swapCard) throw new Error(`${uid} has no swap card to act on`)

  const coachTip = coachTipForSwap(player.board, player.swapCard, col)
  const { board: newBoard } = applySwap(player.board, col, player.swapCard)

  const players = {
    ...state.players,
    [uid]: { ...player, board: newBoard, swapCard: null, swapUsed: !!col, locked: true },
  }

  let status = state.status
  let result = state.result

  if (Object.values(players).every((p) => p.locked)) {
    status = PHASE.COMPLETE
    const [uidA, uidB] = state.order
    const showdown = evaluateShowdown(players[uidA], players[uidB])
    const payout = calculatePayout(showdown.columnsWon, uidA, uidB, state.cashGame.valuePerColumn ?? 0)
    result = { ...showdown, ...payout }
  }

  return {
    ...state,
    players,
    status,
    result,
    log: [...state.log, { uid, type: 'swap', col: col ?? null, ts: Date.now() }],
    lastCoachTip: { uid, ...coachTip },
  }
}

export function isGameComplete(state) {
  return state.status === PHASE.COMPLETE
}
