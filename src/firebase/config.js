import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getDatabase } from 'firebase/database'

// All values come from Vite env vars (see .env.example). Never hardcode
// secrets here — Firebase web config is not secret by design (security is
// enforced by Firestore/RTDB rules, see Step 2), but keeping it in env vars
// lets each contributor/deploy target point at their own Firebase project.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  // Realtime Database is used for the live turn-by-turn game state
  // (low-latency, ephemeral); Firestore holds durable data (users, match
  // history, leaderboard).
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
}

// Guard against re-initializing during Vite HMR.
export const app = getApps().length ? getApp() : initializeApp(firebaseConfig)

// getAuth/getFirestore/getDatabase validate their piece of the config and
// throw *synchronously* on a bad value (most notably getDatabase(), which
// throws immediately if databaseURL is missing or malformed) — and because
// this module is imported at the very top of main.jsx's chain, an
// uncaught throw here aborts the entire script before React ever mounts,
// producing a blank page with no visible error (only in devtools).
// Single-player mode doesn't touch Firebase at all, so it shouldn't be
// held hostage by a misconfigured env var: catch here, log clearly, and
// let auth/db/rtdb be null — online-only features degrade to a visible
// "unavailable" state (see useAuthStore.js, useOnlineGameStore.js)
// instead of taking the whole app down with them.
function safeInit(label, factory) {
  try {
    return factory()
  } catch (err) {
    console.error(`[firebase] Failed to initialize ${label} — check your VITE_FIREBASE_* config:`, err)
    return null
  }
}

export const auth = safeInit('Auth', () => getAuth(app))
export const db = safeInit('Firestore', () => getFirestore(app))
export const rtdb = safeInit('Realtime Database', () => getDatabase(app))
