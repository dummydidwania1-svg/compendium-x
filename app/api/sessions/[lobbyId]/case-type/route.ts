/**
 * POST /api/sessions/[lobbyId]/case-type
 *
 * Interviewer autosaves the case type for a "do your own case" (custom) session
 * while it is in progress. Persists onto the session doc so every completion
 * path (evaluation submit, save-unrated, submit-draft) can denormalize it onto
 * the evaluation and dashboard analytics weight the scores like any other case.
 *
 * Only valid for custom sessions and only writable by the session interviewer.
 * Never touches recording/transcript state.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { TransitionError, jsonOk, parseBody } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'
import { setCaseTypeInput } from '@/lib/firebase/inputs'

export const runtime = 'nodejs'

export const POST = authenticatedRoute<{ lobbyId: string }>(
  '/api/sessions/[lobbyId]/case-type',
  async (request, caller, { lobbyId }) => {
    const { caseType } = await parseBody(request, setCaseTypeInput)

    const ref = adminDb.collection('sessions').doc(lobbyId)

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) {
        throw new TransitionError(404, 'session_not_found', 'Session does not exist.')
      }
      const data = snap.data() ?? {}
      if (data.caseSource !== 'custom') {
        throw new TransitionError(
          409,
          'not_custom_session',
          'Case type can only be set for a custom ("do your own case") session.',
        )
      }
      if (data.interviewerId && data.interviewerId !== caller.uid) {
        throw new TransitionError(403, 'not_interviewer', 'Caller is not the session interviewer.')
      }

      tx.set(
        ref,
        {
          customCaseType: caseType ?? FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    })

    return jsonOk({ ok: true, lobbyId, caseType: caseType ?? null })
  },
)
