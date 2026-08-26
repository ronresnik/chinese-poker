import { COLUMNS } from './board.js'
import { evaluateHand, compareHands } from './handEvaluator.js'

/**
 * Column-by-column showdown between two players' completed boards.
 * @param {{uid:string, board:object}} playerA
 * @param {{uid:string, board:object}} playerB
 */
export function evaluateShowdown(playerA, playerB) {
  const columns = COLUMNS.map((col) => {
    const handA = evaluateHand(playerA.board[col])
    const handB = evaluateHand(playerB.board[col])
    const cmp = compareHands(handA, handB)
    return {
      col,
      handA,
      handB,
      hands: { [playerA.uid]: handA, [playerB.uid]: handB },
      winnerUid: cmp === 0 ? null : cmp > 0 ? playerA.uid : playerB.uid,
    }
  })

  const columnsWon = { [playerA.uid]: 0, [playerB.uid]: 0 }
  for (const c of columns) {
    if (c.winnerUid) columnsWon[c.winnerUid] += 1
  }

  return { columns, columnsWon }
}

/**
 * Per-column 'win' | 'lose' | 'tie' from the given uid's point of view —
 * drives the showdown's colour treatment (see ColumnStack). 'tie' is
 * unreachable in normal play, since compareHands settles every level
 * column on suit, but is kept so a winner-less column can never be
 * silently rendered as a loss.
 */
export function columnOutcomesFor(columns, uid) {
  const outcomes = {}
  for (const c of columns) {
    outcomes[c.col] = !c.winnerUid ? 'tie' : c.winnerUid === uid ? 'win' : 'lose'
  }
  return outcomes
}

/**
 * The payout rules (docs/firebase-schema.md):
 *  - 3-2 (diff 1): loser pays 1 column's value.
 *  - 4-1 (diff 3): loser pays 3 columns' value.
 *  - 5-0 sweep: loser pays 5 columns' value, doubled.
 * Generalized: payout = diff * valuePerColumn * (sweep ? 2 : 1), where
 * "sweep" means the loser won zero columns (ties don't count for either
 * side, so a 5-0-with-a-tie board is impossible, but 3-0-2ties etc. can
 * happen and just falls out of the same formula with no multiplier).
 */
export function calculatePayout(columnsWon, uidA, uidB, valuePerColumn) {
  const colsA = columnsWon[uidA]
  const colsB = columnsWon[uidB]
  const diff = Math.abs(colsA - colsB)

  if (diff === 0) {
    return { winnerUid: null, loserUid: null, diff: 0, sweep: false, payout: 0 }
  }

  const winnerUid = colsA > colsB ? uidA : uidB
  const loserUid = winnerUid === uidA ? uidB : uidA
  const sweep = Math.min(colsA, colsB) === 0
  const payout = diff * valuePerColumn * (sweep ? 2 : 1)

  return { winnerUid, loserUid, diff, sweep, payout }
}
