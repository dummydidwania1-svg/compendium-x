/**
 * POST /api/sessions/[lobbyId]/cancel
 *
 * Interviewer (or candidate) cancels an in-progress session entirely,
 * resetting it to 'waiting' so the candidate lobby returns to step 1.
 * Unlike /abandon (which sets status='abandoned' for 24h Cloud Function
 * promotion), this resets the session cleanly — same lobbyId, fresh state.
 *
 * Authorized callers: the session's candidateId OR interviewerId.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { TransitionError, jsonOk } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'

export const runtime = 'nodejs'

export const POST = authenticatedRoute<{ lobbyId: string }>(
  '/api/sessions/[lobbyId]/cancel',
  async (_request, caller, { lobbyId }) => {
    const ref = adminDb.collection('sessions').doc(lobbyId)

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) {
        throw new TransitionError(404, 'session_not_found', 'Session does not exist.')
      }
      const data = snap.data() ?? {}

      const isCandidate = data.candidateId === caller.uid
      const isInterviewer = data.interviewerId === caller.uid
      if (!isCandidate && !isInterviewer) {
        throw new TransitionError(403, 'not_authorized', 'Caller is not part of this session.')
      }

      // Already terminal or already waiting — nothing to do.
      if (data.status === 'waiting') return
      if (data.status === 'completed' || data.status === 'abandoned') return

      if (data.status !== 'in_progress' && data.status !== 'replacing') {
        throw new TransitionError(
          409,
          'invalid_transition',
          `Cannot cancel a session with status "${data.status}".`,
        )
      }

      tx.set(
        ref,
        {
          status: 'waiting',
          caseId: FieldValue.delete(),
          caseName: FieldValue.delete(),
          interviewerId: FieldValue.delete(),
          interviewerEmail: FieldValue.delete(),
          selectedAt: FieldValue.delete(),
          replacingAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    })

    return jsonOk({ ok: true, lobbyId })
  },
)
