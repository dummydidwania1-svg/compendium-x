/**
 * POST /api/sessions/[lobbyId]/abandon
 *
 * Candidate left mid-session without completing recording/upload.
 * Transitions in_progress → abandoned. Idempotent for already-abandoned/completed sessions.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { TransitionError, jsonOk } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'

export const runtime = 'nodejs'

export const POST = authenticatedRoute<{ lobbyId: string }>(
  '/api/sessions/[lobbyId]/abandon',
  async (_request, caller, { lobbyId }) => {
    const ref = adminDb.collection('sessions').doc(lobbyId)

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) {
        throw new TransitionError(404, 'session_not_found', 'Session does not exist.')
      }
      const data = snap.data() ?? {}
      if (data.candidateId !== caller.uid) {
        throw new TransitionError(403, 'not_candidate', 'Caller is not the session candidate.')
      }
      // Already terminal — nothing to do.
      if (data.status === 'abandoned' || data.status === 'completed') return
      if (data.status !== 'in_progress') {
        throw new TransitionError(
          409,
          'invalid_transition',
          `Cannot abandon a session with status "${data.status}".`,
        )
      }

      tx.set(
        ref,
        {
          status: 'abandoned',
          completedBy: 'candidate_abandoned',
          abandonedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    })

    return jsonOk({ ok: true, lobbyId })
  },
)
