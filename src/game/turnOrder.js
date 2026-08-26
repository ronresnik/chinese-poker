import { evaluateHand, compareHands } from './handEvaluator.js'

/**
 * Decides who acts first from each player's initial 5-card hand.
 *
 * A genuine tie is astronomically unlikely but not impossible (suits don't
 * factor into hand rank, so two disjoint 5-card hands can still land on
 * identical category+tiebreak). Rather than needing extra communication to
 * agree on a coin flip, ties break on uid sort order — both clients (or
 * the local engine) compute the same result independently, deterministically.
 */
export function determineFirstPlayer(players) {
  const evaluated = players.map((p) => ({ uid: p.uid, hand: evaluateHand(p.initialHand) }))
  const [a, b] = evaluated
  const cmp = compareHands(a.hand, b.hand)
  const firstPlayerUid = cmp === 0 ? [a.uid, b.uid].sort()[0] : cmp > 0 ? a.uid : b.uid
  return {
    firstPlayerUid,
    tie: cmp === 0,
    hands: Object.fromEntries(evaluated.map((e) => [e.uid, e.hand])),
  }
}
