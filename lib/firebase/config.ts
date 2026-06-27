import { getApp, getApps, initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInAnonymously,
  type User,
} from 'firebase/auth'
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
} from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)

export const missingFirebaseClientConfig = Object.entries(firebaseConfig)
  .filter(([, value]) => typeof value !== 'string' || value.trim().length === 0)
  .map(([key]) => key)

export const auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
      ],
      popupRedirectResolver: browserPopupRedirectResolver,
    })
  } catch {
    return getAuth(app)
  }
})()
export const storage = getStorage(app)

// Network-hardening for unstable ISP/proxy paths:
// auto-detect long polling when streaming transport is unreliable.
export const db = (() => {
  try {
    return initializeFirestore(app, {
      // Skip WebChannel streaming probe — go straight to long polling.
      // AutoDetect can silently hang for 1-2 min on some networks before falling back.
      experimentalForceLongPolling: true,
    })
  } catch {
    return getFirestore(app)
  }
})()

// When `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=1`, route every SDK call to the
// local emulators on the default ports defined in firebase.json. Guarded so
// hot-reload re-imports don't re-connect (which throws).
if (
  typeof window !== 'undefined' &&
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === '1' &&
  !(globalThis as { __FIREBASE_EMULATORS_WIRED__?: boolean }).__FIREBASE_EMULATORS_WIRED__
) {
  ;(globalThis as { __FIREBASE_EMULATORS_WIRED__?: boolean }).__FIREBASE_EMULATORS_WIRED__ = true
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectStorageEmulator(storage, '127.0.0.1', 9199)

  console.info('[firebase] connected to local emulators (auth:9099, firestore:8080, storage:9199)')
}

export function waitForAuthUser(): Promise<User | null> {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe()
      resolve(user)
    })
  })
}

/**
 * Ensure there is *some* Firebase user available — used by interviewer-entry
 * pages so guests can act without going through signup.
 *
 * Order:
 *   1. Wait for IndexedDB auth rehydration (avoids race on first paint).
 *   2. If a user already exists (real or anonymous), return it.
 *   3. Otherwise sign in anonymously. Anonymous users still receive a real
 *      Firebase UID and ID token, so every authenticated /api route and
 *      Firestore rule keeps working without changes.
 *
 * Interviewer pages should `await` this once before touching the API.
 */
export async function signInAnonymouslyIfNeeded(): Promise<User> {
  const existing = await waitForAuthUser()
  if (existing) return existing
  const credential = await signInAnonymously(auth)
  return credential.user
}
