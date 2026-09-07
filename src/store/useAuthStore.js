import { create } from 'zustand'
import {
  onAuthStateChanged,
  signInAnonymously,
  updateProfile,
  GoogleAuthProvider,
  linkWithPopup,
  signInWithPopup,
} from 'firebase/auth'
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

/**
 * Upgrades the current session to a real, cross-device Google identity —
 * anonymous auth (the default, see initAuth) is scoped to one browser and
 * can never give a returning player their name/stats back on a different
 * device or after clearing site data; Google sign-in is what actually
 * does that, since Firebase resolves the same Google account back to the
 * same uid every time, on any device.
 *
 * Links from the CURRENT anonymous session when there is one, so a player
 * who already has stats under this browser's anonymous uid keeps them
 * once they add Google to the same account, rather than starting over
 * under a second, brand-new uid. If this exact Google account already
 * has its OWN uid from signing in before (a returning player, on a new
 * device, or one who declines linking and signs in fresh) — Firebase
 * reports that as 'auth/credential-already-in-use' — fall back to
 * signing into that existing account directly; that one has whatever
 * profile/stats they built up previously; this session's anonymous
 * identity (and anything recorded under it — almost certainly nothing
 * yet, for a first-time linker) is simply abandoned.
 */
export async function signInWithGoogleAccount() {
  if (!auth) throw new Error('Firebase is not configured')
  const provider = new GoogleAuthProvider()

  if (auth.currentUser?.isAnonymous) {
    try {
      const cred = await linkWithPopup(auth.currentUser, provider)
      useAuthStore.setState({ user: cred.user })
      return cred.user
    } catch (err) {
      if (err.code !== 'auth/credential-already-in-use') throw err
    }
  }

  const cred = await signInWithPopup(auth, provider)
  useAuthStore.setState({ user: cred.user })
  return cred.user
}
