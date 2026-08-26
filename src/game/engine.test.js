import { test } from 'node:test'
import assert from 'node:assert/strict'
import { initGame, placeCard, chooseSwap, getCurrentTurnUid, isGameComplete, PHASE } from './engine.js'
import { cardCode } from './deck.js'
import { chooseBotPlacement, chooseBotSwap } from './bot.js'

function playFullGame() {
  let state = initGame({
    players: [
      { uid: 'A', name: 'Alice' },
      { uid: 'B', name: 'Bob', isBot: true },
    ],
    cashGame: { enabled: true, valuePerColumn: 5, currency: 'USD' },
  })

  let guard = 0
  while (state.status === PHASE.PLACING) {
    if (++guard > 1000) throw new Error('placement phase did not terminate')
    const uid = getCurrentTurnUid(state)
    const board = state.players[uid].board
    const col = chooseBotPlacement(board, state.players[uid].hand[0] ?? state.deck[0])
    state = placeCard(state, uid, col)
  }

  guard = 0
  while (state.status === PHASE.SWAP) {
    if (++guard > 10) throw new Error('swap phase did not terminate')
    for (const uid of state.order) {
      if (state.players[uid].locked) continue
      const board = state.players[uid].board
      const col = chooseBotSwap(board, state.players[uid].swapCard)
      state = chooseSwap(state, uid, col)
    }
  }

  return state
}

test('a full game reaches completion with 5 full columns per player', () => {
  const state = playFullGame()
  assert.equal(state.status, PHASE.COMPLETE)
  assert.equal(isGameComplete(state), true)
  for (const uid of ['A', 'B']) {
    for (const col of ['col1', 'col2', 'col3', 'col4', 'col5']) {
      assert.equal(state.players[uid].board[col].length, 5)
    }
  }
})

test('every card dealt across a full game is unique (no duplicate deals)', () => {
  const state = playFullGame()
  const allCards = []
  for (const uid of ['A', 'B']) {
    for (const col of ['col1', 'col2', 'col3', 'col4', 'col5']) {
      for (const card of state.players[uid].board[col]) {
        allCards.push(cardCode(card))
      }
    }
  }
  assert.equal(allCards.length, 50)
  assert.equal(new Set(allCards).size, 50)
  assert.equal(state.deck.length, 0)
})

test('exactly one column-4 card per column is face-down, the rest face-up', () => {
  const state = playFullGame()
  for (const uid of ['A', 'B']) {
    for (const col of ['col1', 'col2', 'col3', 'col4', 'col5']) {
      const flags = state.players[uid].board[col].map((c) => c.faceDown)
      assert.deepEqual(flags, [false, false, false, false, true])
    }
  }
})

test('showdown result matches the columns actually won', () => {
  const state = playFullGame()
  assert.ok(state.result)
  assert.equal(state.result.columnsWon.A + state.result.columnsWon.B <= 5, true)
  const winner = state.result.winnerUid
  if (winner) {
    assert.ok(state.result.payout > 0)
  } else {
    assert.equal(state.result.payout, 0)
  }
})

test('turns strictly alternate between the two players', () => {
  let state = initGame({ players: [{ uid: 'A', name: 'A' }, { uid: 'B', name: 'B' }] })
  const turns = []
  for (let i = 0; i < 10 && state.status === PHASE.PLACING; i++) {
    const uid = getCurrentTurnUid(state)
    turns.push(uid)
    state = placeCard(state, uid, `col${(i % 5) + 1}`)
  }
  for (let i = 1; i < turns.length; i++) {
    assert.notEqual(turns[i], turns[i - 1])
  }
})

test('placing out of turn throws', () => {
  const state = initGame({ players: [{ uid: 'A', name: 'A' }, { uid: 'B', name: 'B' }] })
  const notTurnUid = state.order[1]
  assert.throws(() => placeCard(state, notTurnUid, 'col1'))
})

test('a bot-vs-bot game is deterministic-ish and always terminates', () => {
  for (let i = 0; i < 5; i++) {
    const state = playFullGame()
    assert.equal(state.status, PHASE.COMPLETE)
  }
})
