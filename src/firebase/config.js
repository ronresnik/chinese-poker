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

export const auth = getAuth(app)
export const db = getFirestore(app)
export const rtdb = getDatabase(app)
