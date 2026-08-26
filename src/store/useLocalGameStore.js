import { create } from 'zustand'
import { initGame, placeCard, chooseSwap, getCurrentTurnUid, PHASE } from '../game/engine.js'
import { chooseBotPlacement, chooseBotSwap } from '../game/bot.js'

export const HUMAN_UID = 'you'
export const BOT_UID = 'bot'
const BOT_MOVE_DELAY_MS = 700

export const useLocalGameStore = create((set, get) => ({
  state: null,

  startGame({ humanName = 'You', cashGame } = {}) {
    const state = initGame({
      players: [
        { uid: HUMAN_UID, name: humanName },
        { uid: BOT_UID, name: 'Computer', isBot: true },
      ],
      cashGame: cashGame ?? { enabled: false, valuePerColumn: 0, currency: 'USD' },
    })
    set({ state })
    runBotTurnIfNeeded(set, get)
  },

  place(col) {
    const { state } = get()
    if (!state || state.status !== PHASE.PLACING) return
    if (getCurrentTurnUid(state) !== HUMAN_UID) return
    set({ state: placeCard(state, HUMAN_UID, col) })
    runBotTurnIfNeeded(set, get)
  },

  swap(col) {
    const { state } = get()
    if (!state || state.status !== PHASE.SWAP) return
    if (state.players[HUMAN_UID].locked) return
    set({ state: chooseSwap(state, HUMAN_UID, col) })
    runBotTurnIfNeeded(set, get)
  },

  reset() {
    set({ state: null })
  },
}))

function runBotTurnIfNeeded(set, get) {
  const { state } = get()
  if (!state) return

  if (state.status === PHASE.PLACING && getCurrentTurnUid(state) === BOT_UID) {
    setTimeout(() => {
      const { state: current } = get()
      if (!current || current.status !== PHASE.PLACING || getCurrentTurnUid(current) !== BOT_UID) return
      const bot = current.players[BOT_UID]
      const card = bot.hand[0] ?? current.deck[0]
      const col = chooseBotPlacement(bot.board, card)
      set({ state: placeCard(current, BOT_UID, col) })
      runBotTurnIfNeeded(set, get)
    }, BOT_MOVE_DELAY_MS)
    return
  }

  if (state.status === PHASE.SWAP && !state.players[BOT_UID].locked) {
    setTimeout(() => {
      const { state: current } = get()
      if (!current || current.status !== PHASE.SWAP || current.players[BOT_UID].locked) return
      const bot = current.players[BOT_UID]
      const col = chooseBotSwap(bot.board, bot.swapCard)
      set({ state: chooseSwap(current, BOT_UID, col) })
    }, BOT_MOVE_DELAY_MS)
  }
}
