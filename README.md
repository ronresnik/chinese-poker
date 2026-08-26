# 5-Column Poker

A custom head-to-head poker SPA: each player builds **5 separate columns**
(5 separate poker hands) instead of one. Column 1 vs. Column 1, Column 2 vs.
Column 2, and so on. Play online (real-time, Firebase-backed) or offline vs.
a computer bot.

Mobile-first, dark "casino" aesthetic. Built with React + Vite + Tailwind
CSS, deployed as a static site to GitHub Pages, backed by Firebase
(Authentication, Firestore, Realtime Database — all free tier).

## Status

Being built step by step:

1. ✅ Project structure, dependencies, Firebase config
2. ✅ Database schema & Firebase Security Rules
3. ✅ Game logic, state management, scoring, AI Coach
4. ✅ UI components (Lobby, Board, Animations)
5. ✅ GitHub Pages deployment

## Tech stack

- **Frontend:** React 18 + Vite, Tailwind CSS, React Router (`HashRouter`,
  required for GitHub Pages' static hosting), Zustand for state, Framer
  Motion for animation.
- **Backend:** Firebase Authentication, Firestore (durable data: users,
  match history, leaderboard), Realtime Database (live turn-by-turn game
  state).

## Project structure

```
src/
  components/   shared UI (Card, board, showdown modal, coach tip toast…)
  pages/        route-level pages (Home, LocalGame, OnlineGame, Leaderboard)
  game/         pure game logic — deck, hand eval, rules, scoring, AI bot
  firebase/     Firebase SDK initialization & data access helpers
  store/        Zustand stores wiring game/ + firebase/ to React
  hooks/        React hooks built on store/
  utils/        small stateless helpers
```

## Local development

```bash
npm install
cp .env.example .env.local   # fill in your Firebase project config
npm run dev
npm test                     # unit tests (Node's built-in runner)
```

## Game logic

`src/game/` is pure, framework-free, and fully unit tested (hand
evaluation, the 3-2 / 4-1 / 5-0(x2) payout math, a full simulated game
with card-conservation checks, showdown reveal captions, seen-card
counting, and the AI Coach heuristics), alongside the pure parts of
`src/firebase/`. See [`src/game/README.md`](src/game/README.md) for the
module map and the exact turn-flow math the custom 5-column rules imply.

`npm test` passes no path to Node's test runner on purpose, letting it
discover `*.test.js` recursively (it skips `node_modules` itself). Don't
replace that with a `**` glob argument: Node only began expanding glob
patterns itself in v21, so a globbed script passes on a newer local Node
and fails on an older one in CI with `Could not find 'src/**/*.test.js'`.

`src/store/` wires that logic to React: `useLocalGameStore` drives
single-player vs. the bot end-to-end (no Firebase involved), while
`useOnlineGameStore` + `src/firebase/rooms.js` implement real-time online
play against the Step 2 schema/rules.

## UI

Mobile-first (5 tappable, overlapping-card columns fit comfortably on a
phone screen), dark casino theme, tap-to-place — no drag-and-drop, which
is more reliable on touch and still snappy. `GameScreen` is one shared
component driving both single-player and online play, since both stores
converge on the same board shape (see `src/game/README.md`). The 3-D
"losing columns fold forward" showdown treatment and the AI Coach's
tip toast are both implemented and were exercised live (see below).

**Live-verified in a real headless browser (Playwright against the Vite
dev server), single-player end to end** — full game from deal through a
30+ turn placement phase, the swap step, and the showdown modal, zero
console errors; the Leaderboard route degrades gracefully when Firestore
is unreachable. That run caught and fixed two real bugs: a "Connecting…"
button that never recovered on an auth failure, and the AI Coach's tip
toast getting yanked away by the bot's very next move instead of showing
for its intended duration.

**Not live-verified: online multiplayer.** This sandbox's network policy
explicitly does not support WebSocket upgrades through its proxy, and the
Realtime Database transport online play depends on is WebSocket-based —
so this is a hard environment limitation, not something more testing here
would fix. The online store's logic was carefully reasoned through in
Step 3 and bundles cleanly, but treat it as unexercised against a live
Firebase project until it's tried on a network without that restriction.

## Firebase schema & security rules

See [`docs/firebase-schema.md`](docs/firebase-schema.md) for the full
Firestore + Realtime Database data model, the game's state machine, and —
important — the trust model: what these rules cryptographically guarantee
on a free-tier (no Cloud Functions) setup, and what they explicitly don't.

To deploy the rules to your Firebase project:

```bash
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,firestore:indexes,database
```

## Deploy

See [`docs/deployment.md`](docs/deployment.md) for the full walkthrough
(repository secrets, enabling Pages, troubleshooting). Short version:

1. Add the 7 `VITE_FIREBASE_*` values as GitHub repository secrets
   (Settings -> Secrets and variables -> Actions).
2. Settings -> Pages -> Source: **GitHub Actions**.
3. Push to `main` (or merge a PR into it) — `.github/workflows/deploy.yml`
   runs the test suite, builds, and publishes automatically. The live site
   ends up at `https://<you>.github.io/chinese-poker/`.

A manual alternative (`npm run deploy`, via the `gh-pages` package) is
also available — see the docs page for when you'd use that instead.
