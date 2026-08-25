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
2. ⬜ Database schema & Firebase Security Rules
3. ⬜ Game logic, state management, scoring, AI Coach
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
```

## Deploy

Deployment instructions land in Step 5, once the game itself is built.
