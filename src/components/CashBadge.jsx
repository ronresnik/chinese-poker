import { formatCurrency } from '../utils/format.js'

export default function CashBadge({ cashGame }) {
  if (!cashGame?.enabled) return null
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold-light">
      <span aria-hidden>💰</span>
      {formatCurrency(cashGame.valuePerColumn, cashGame.currency)} / column
    </div>
  )
}
