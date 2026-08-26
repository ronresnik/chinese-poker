// Shared between Card.jsx and CardCounter.jsx so a suit renders with the
// identical symbol everywhere it appears. Kept in its own module rather
// than exported from Card.jsx: a component file may only export
// components, or Vite's fast-refresh stops working for it.
export const SUIT_SYMBOL = { s: '♠', h: '♥', d: '♦', c: '♣' }

// For a card FACE (bg-card-face, near-white) — spades/clubs need a dark
// ink to read against that light background.
export const SUIT_COLOR = { s: 'text-ink', h: 'text-red-600', c: 'text-ink', d: 'text-red-600' }

// For suit glyphs sitting directly on the app's dark felt background
// (CardCounter's tally, not a card face) — text-ink here would be a
// near-black glyph on a near-black background, effectively invisible.
export const SUIT_COLOR_ON_DARK = { s: 'text-white/80', h: 'text-red-400', c: 'text-white/80', d: 'text-red-400' }
