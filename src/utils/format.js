export function formatCurrency(amount, currency = 'USD') {
  const symbols = { USD: '$', NIS: '₪', EUR: '€', GBP: '£' }
  const symbol = symbols[currency]
  if (symbol) return `${symbol}${amount}`
  return `${amount} ${currency}`
}
