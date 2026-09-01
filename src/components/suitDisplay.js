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

// The engine/deck represent ten as the single character 'T' (see
// game/deck.js's RANKS) so every hand stays a fixed-width single
// character internally — but shown to a player as a bare "T" it reads as
// an abbreviation no other rank has (2-9 already show as themselves, J/Q/K/A
// are the one-letter forms everyone already knows). Anywhere a rank is
// displayed as text, run it through this first; nothing that treats rank
// as data (sorting, equality, the 'T' card code used as a lookup key)
// should ever call it.
export function rankDisplay(rank) {
  return rank === 'T' ? '10' : rank
}
