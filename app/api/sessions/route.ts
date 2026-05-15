/**
 * POST /api/sessions
 *
 * Candidate creates (or refreshes) their session for a given lobbyId.
 * - Idempotent: replays from a refresh re-merge the same fields.
 * - Rejects if an existing session is owned by a different uid.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { verifyRequest } from '@/lib/auth/verifyRequest'
import { errorToResponse, jsonError, jsonOk, parseBody } from '@/lib/api/responses'
import { createSessionInput } from '@/lib/firebase/inputs'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const caller = await verifyRequest(request)
    const { lobbyId, sessionMode } = await parseBody(request, createSessionInput)

    const ref = adminDb.collection('sessions').doc(lobbyId)
    const snap = await ref.get()

    if (snap.exists) {
      const existing = snap.data() ?? {}
      if (existing.candidateId && existing.candidateId !== caller.uid) {
        return jsonError(
          403,
          'session_owned_by_other',
          'This lobby is already owned by another user.',
        )
      }
      await ref.set(
        {
          lobbyId,
          candidateId: caller.uid,
          candidateEmail: caller.email,
          sessionMode,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    } else {
      await ref.set({
        lobbyId,
        candidateId: caller.uid,
        candidateEmail: caller.email,
        sessionMode,
        status: 'waiting',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    }

    return jsonOk({ ok: true, lobbyId })
  } catch (err) {
    return errorToResponse(err)
  }
}
