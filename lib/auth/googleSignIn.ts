import {
  GoogleAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  type User,
} from 'firebase/auth'
import { auth } from '@/lib/firebase/config'

// Popup-based Google sign-in has no built-in timeout: if the popup window is
// silently blocked (common on locked-down corporate laptops — a security
// extension or proxy converts window.open into a same-tab navigation, or
// breaks the window.closed polling Firebase's popup flow relies on),
// signInWithPopup's promise never resolves or rejects. Without a timeout,
// the calling UI is stuck on its loading state forever with no way out.
const POPUP_TIMEOUT_MS = 12000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('auth/popup-timeout')), ms)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
}

/**
 * Sign in with Google, preferring a popup (no page reload, feels instant)
 * but automatically falling back to a full-page redirect if the popup is
 * blocked, hangs past POPUP_TIMEOUT_MS, or the browser cancels it outright —
 * all signs the popup path is hostile in this browser (locked-down corporate
 * policy, aggressive extension, strict third-party-cookie blocking).
 *
 * On fallback, signInWithRedirect navigates the whole tab away — this
 * function's promise never resolves in that case (the page is leaving);
 * the caller must handle the return trip separately via
 * consumeGoogleRedirectResult() on next mount.
 */
export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider()
  try {
    const result = await withTimeout(signInWithPopup(auth, provider), POPUP_TIMEOUT_MS)
    return result.user
  } catch (error) {
    const code = error instanceof Error ? error.message : ''
    const shouldFallBackToRedirect =
      code.includes('auth/popup-timeout') ||
      code.includes('auth/popup-blocked') ||
      code.includes('auth/cancelled-popup-request')

    if (!shouldFallBackToRedirect) throw error

    // Full-page redirect — the tab navigates away here. Whatever called this
    // will never see this promise settle; the flow resumes on the next page
    // load via consumeGoogleRedirectResult().
    await signInWithRedirect(auth, provider)
    return new Promise<User>(() => {}) // navigation interrupts before this matters
  }
}

/**
 * Call once on mount (module-level guard prevents double-consumption across
 * multiple mounted callers, e.g. Navbar + MarketingAuthPanel both checking on
 * the same page load). Resolves the user if this page load is the return
 * trip from signInWithGoogle's redirect fallback, otherwise null.
 */
let redirectResultConsumed = false
export async function consumeGoogleRedirectResult(): Promise<User | null> {
  if (redirectResultConsumed) return null
  redirectResultConsumed = true
  try {
    const result = await getRedirectResult(auth)
    return result?.user ?? null
  } catch {
    return null
  }
}
