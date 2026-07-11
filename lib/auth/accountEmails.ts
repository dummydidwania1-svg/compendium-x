import { httpsCallable } from 'firebase/functions'
import { functions } from '@/lib/firebase/config'

/**
 * Client wrappers around the account-email Cloud Functions.
 *
 * Both are best-effort from the caller's perspective — the UI should never
 * block or fail on them, since the emails are transactional side effects. The
 * server enforces correctness (verification state, one-time onboarding).
 */

/** Sends/resends the custom verification email to the signed-in user. */
export async function triggerVerificationEmail(): Promise<void> {
  const callable = httpsCallable(functions, 'sendVerificationEmail')
  await callable()
}

/**
 * Asks the server to send the onboarding email. Safe to call on every verified
 * email/password sign-in — the function is idempotent and only sends once.
 */
export async function triggerOnboardingEmail(): Promise<void> {
  const callable = httpsCallable(functions, 'sendOnboardingEmail')
  await callable()
}
