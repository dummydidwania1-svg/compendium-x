/**
 * DELETE /api/evaluations/[evaluationId]
 *
 * Permanently removes a candidate's case-session record from their dashboard
 * history. Firestore's security rules set `allow delete: if false` on the
 * evaluations collection, so this Admin-SDK route is the only way to delete
 * one — mirroring the workspace-image route's server-owned mutation pattern.
 *
 * Deletes:
 *   - the `evaluations/{evaluationId}` doc (what drives the dashboard listing)
 *   - best-effort: the linked `sessions/{lobbyId}` doc AND its
 *     `recordings/{candidate,interviewer}` subcollection, where the transcript
 *     and audio metadata for this attempt live.
 *
 * Storage cleanup (audio under `session-recordings/…`, merged audio, and
 * `workspace-images/…`) is intentionally NOT performed here — see PR notes.
 */
import { authenticatedRoute } from '@/lib/api/route'
import { jsonOk, TransitionError } from '@/lib/api/responses'
import { adminDb } from '@/lib/firebase/admin'

export const runtime = 'nodejs'

export const DELETE = authenticatedRoute<{ evaluationId: string }>(
  '/api/evaluations/[evaluationId]',
  async (_request, caller, { evaluationId }) => {
    const ref = adminDb.collection('evaluations').doc(evaluationId)
    const snap = await ref.get()
    if (!snap.exists) {
      throw new TransitionError(404, 'evaluation_not_found', 'Feedback entry not found.')
    }

    const data = snap.data() ?? {}
    const candidateId = typeof data.candidateId === 'string' ? data.candidateId : null
    const interviewerId = typeof data.interviewerId === 'string' ? data.interviewerId : null
    if (candidateId !== caller.uid && interviewerId !== caller.uid) {
      throw new TransitionError(
        403,
        'not_evaluation_participant',
        'You can only delete your own case attempts.',
      )
    }

    // Delete the evaluation first — this is the record the dashboard listing
    // is built from, so once it's gone the entry disappears from history.
    await ref.delete()

    // Then best-effort remove the linked session doc and its recordings
    // subcollection. Failure here must not fail the request: the evaluation
    // (the user-visible entry) is already gone.
    const lobbyId = typeof data.lobbyId === 'string' ? data.lobbyId : null
    if (lobbyId) {
      try {
        await adminDb.recursiveDelete(adminDb.collection('sessions').doc(lobbyId))
      } catch {
        // Swallow — the evaluation is deleted, which is what the user sees.
      }
    }

    return jsonOk({ ok: true, evaluationId })
  },
)
