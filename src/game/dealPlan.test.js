import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDealPlan } from './dealPlan.js'
import { cardCode } from './deck.js'

test('deals exactly 26 cards per player and 52 total, all unique', () => {
  const { plan, fullOrder } = buildDealPlan('A', 'B')
  assert.equal(plan.A.initialHand.length, 5)
  assert.equal(plan.A.drawQueue.length, 20)
  assert.ok(plan.A.swapCard)
  assert.equal(plan.B.initialHand.length, 5)
  assert.equal(plan.B.drawQueue.length, 20)
  assert.ok(plan.B.swapCard)
  assert.equal(fullOrder.length, 52)

  const allCards = [
    ...plan.A.initialHand,
    ...plan.A.drawQueue,
    plan.A.swapCard,
    ...plan.B.initialHand,
    ...plan.B.drawQueue,
    plan.B.swapCard,
  ]
  assert.equal(allCards.length, 52)
  assert.equal(new Set(allCards.map(cardCode)).size, 52)
})
