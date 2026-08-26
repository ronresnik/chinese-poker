import { create } from 'zustand'
import { onAuthStateChanged, signInAnonymously, updateProfile } from 'firebase/auth'
import { auth } from '../firebase/config.js'

export const useAuthStore = create(() => ({
  user: null,
  status: 'loading', // 'loading' | 'ready' | 'error'
  error: null,
}))

let initialized = false

// Call once, at app startup. Anonymous auth is enough to identify a
// player across a game room and to attribute leaderboard stats — see
// docs/firebase-schema.md for why the Firebase config values themselves
// aren't secret; this is what actually establishes "who is this player".
export function initAuth() {
  if (initialized) return
  initialized = true
  if (!auth) {
    // firebase/config.js already logged why. Online play and the
    // leaderboard become visibly "unavailable" (see Home.jsx's
    // onlineReady check); single-player is entirely unaffected.
    useAuthStore.setState({ status: 'error', error: 'Firebase is not configured' })
    return
  }
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      useAuthStore.setState({ user, status: 'ready', error: null })
      return
    }
    try {
      await signInAnonymously(auth)
    } catch (err) {
      useAuthStore.setState({ status: 'error', error: err.message })
    }
  })
}

export async function setDisplayName(name) {
  if (!auth?.currentUser) return
  await updateProfile(auth.currentUser, { displayName: name })
  useAuthStore.setState({ user: auth.currentUser })
}
