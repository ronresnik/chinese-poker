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
4. ⬜ UI components (Lobby, Board, Animations)
5. ⬜ GitHub Pages deployment

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
  components/   shared UI components
  pages/        route-level pages (Home/Lobby, Game, Leaderboard)
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
npm test                     # runs src/game/'s unit test suite (Node's built-in test runner)
```

## Game logic

`src/game/` is pure, framework-free, and fully unit tested (43 tests —
hand evaluation, the 3-2 / 4-1 / 5-0(x2) payout math, a full simulated
game with card-conservation checks, and the AI Coach heuristics). See
[`src/game/README.md`](src/game/README.md) for the module map and the
exact turn-flow math the custom 5-column rules imply.

`src/store/` wires that logic to React: `useLocalGameStore` drives
single-player vs. the bot end-to-end (no Firebase involved), while
`useOnlineGameStore` + `src/firebase/rooms.js` implement real-time online
play against the Step 2 schema/rules. The online store hasn't been
exercised against a live Firebase project yet (only build-verified) — treat
it as a solid first pass to smoke-test once Step 4 wires up real UI.

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

Full deployment instructions (GitHub Pages) land in Step 5, once the game
itself is built.
