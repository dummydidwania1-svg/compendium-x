import { getApp, getApps, initializeApp } from 'firebase/app'
import {
  browserLocalPersistence,
  browserSessionPersistence,
  connectAuthEmulator,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
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

// We only use email/password auth in the web app right now, so initialize Auth
// with explicit browser persistence and no popup/redirect resolver.
export const auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: [
        indexedDBLocalPersistence,
        browserLocalPersistence,
        browserSessionPersistence,
      ],
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
      experimentalAutoDetectLongPolling: true,
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
