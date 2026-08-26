import { createShuffledDeck } from './deck.js'

const INITIAL_HAND_SIZE = 5
const DRAW_QUEUE_SIZE = 20

/**
 * One shuffle, split into each player's full allocation for the whole
 * game: 5 (initial hand) + 20 (draw queue) + 1 (swap card) = 26 cards per
 * player, 52 total. See docs/firebase-schema.md "Why pre-allocate draws"
 * for why the online store deals this way instead of a shared live deck.
 */
export function buildDealPlan(uidA, uidB) {
  const deck = createShuffledDeck()
  let cursor = 0
  const take = (n) => deck.slice(cursor, (cursor += n))

  const plan = {}
  for (const uid of [uidA, uidB]) {
    plan[uid] = {
      initialHand: take(INITIAL_HAND_SIZE),
      drawQueue: take(DRAW_QUEUE_SIZE),
      swapCard: take(1)[0],
    }
  }

  return { plan, fullOrder: deck }
}
