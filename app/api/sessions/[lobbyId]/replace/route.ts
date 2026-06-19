/**
 * POST /api/sessions/[lobbyId]/replace
 *
 * Interviewer wants to swap the active case for a different one.
 * Transitions in_progress → replacing. Clears caseId/caseName so the
 * candidate lobby sees a case-less 'replacing' status and updates its UI.
 * The interviewer then navigates back to the repository to pick a new case,
 * which calls select-case (which accepts status='replacing') to re-enter in_progress.
 *
 * Authorized callers: the session's candidateId OR interviewerId.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { TransitionError, jsonOk } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'

export const runtime = 'nodejs'

export const POST = authenticatedRoute<{ lobbyId: string }>(
  '/api/sessions/[lobbyId]/replace',
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

      if (data.status === 'replacing') return // already replacing — idempotent
      if (data.status !== 'in_progress') {
        throw new TransitionError(
          409,
          'invalid_transition',
          `Cannot replace a case on a session with status "${data.status}".`,
        )
      }

      tx.set(
        ref,
        {
          status: 'replacing',
          caseId: FieldValue.delete(),
          caseName: FieldValue.delete(),
          replacingAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    })

    return jsonOk({ ok: true, lobbyId })
  },
)
