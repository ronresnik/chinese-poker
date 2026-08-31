import { scorePlacementOptions } from './aiCoach.js'
import { bestSwapOption } from './swap.js'

// Epsilon-greedy over the coach's own scoring: mostly plays the best-scoring
// column so its moves and its coach tips stay consistent, but occasionally
// (15%) takes the second-best option so single-player games aren't
// perfectly predictable.
const EXPLORATION_RATE = 0.15

export function chooseBotPlacement(board, card, opponentBoard, random = Math.random) {
  const ranked = scorePlacementOptions(board, card, opponentBoard)
  if (ranked.length > 1 && random() < EXPLORATION_RATE) {
    return ranked[1].col
  }
  return ranked[0].col
}

export function chooseBotSwap(board, swapCard) {
  const best = bestSwapOption(board, swapCard)
  return best ? best.col : null
}
