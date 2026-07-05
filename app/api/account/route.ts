/**
 * DELETE /api/account
 *
 * Soft-deletes the calling user's account. Nothing is erased — this exists
 * so an accidental click never costs a user their data. Runs server-side
 * with the Admin SDK so the deactivation cannot be tampered with by the
 * client:
 *   1. Firestore: profiles/{uid} flagged pendingDeletion (data kept in place)
 *   2. Auth: user disabled (blocks all future sign-in attempts outright)
 *   3. Auth: refresh tokens revoked (belt-and-suspenders; the Firestore flag
 *      via security rules is what actually locks out an already-open session
 *      promptly, since a revoked-but-unexpired ID token isn't invalidated
 *      client-side until its next refresh)
 *
 * Reactivating a deactivated account is a manual/support operation for now
 * (flip pendingDeletion back to false + re-enable the Auth user) — there is
 * intentionally no self-service path.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminAuth, adminDb } from '@/lib/firebase/admin'
import { jsonOk, parseBody } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'
import { deleteAccountInput } from '@/lib/firebase/inputs'

export const runtime = 'nodejs'

export const DELETE = authenticatedRoute('/api/account', async (request, caller) => {
  await parseBody(request, deleteAccountInput)
  const uid = caller.uid

  // 1) Flag the profile — data stays, nothing is deleted.
  await adminDb.collection('profiles').doc(uid).set(
    {
      pendingDeletion: true,
      pendingDeletionAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  )

  // 2) Block all future sign-ins outright (auth/user-disabled).
  await adminAuth.updateUser(uid, { disabled: true })

  // 3) Revoke refresh tokens so a subsequent token refresh also fails.
  //    The Firestore pendingDeletion flag (enforced via security rules) is
  //    what actually stops an already-open session immediately; this is a
  //    second layer for anything not mediated by those rules.
  await adminAuth.revokeRefreshTokens(uid)

  return jsonOk({ ok: true })
})
