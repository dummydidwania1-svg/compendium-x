/**
 * POST /api/sessions/[lobbyId]/select-case
 *
 * Interviewer attaches a case to a waiting session.
 * Transitions: waiting → in_progress.
 * Records the interviewer's uid so downstream rules can scope reads.
 */
import { FieldValue } from 'firebase-admin/firestore'
import type * as FirebaseFirestore from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { TransitionError, jsonOk, parseBody } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'
import { selectCaseInput } from '@/lib/firebase/inputs'

export const runtime = 'nodejs'

const POLL_INTERVAL_MS = 500
const POLL_TIMEOUT_MS = 8000

async function waitForWaitingSession(
  ref: FirebaseFirestore.DocumentReference,
): Promise<FirebaseFirestore.DocumentData | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    const snap = await ref.get()
    if (snap.exists) return snap.data() ?? {}
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  return null
}

export const POST = authenticatedRoute<{ lobbyId: string }>(
  '/api/sessions/[lobbyId]/select-case',
  async (request, caller, { lobbyId }) => {
    const { caseId, sessionMode, caseName } = await parseBody(request, selectCaseInput)

    const ref = adminDb.collection('sessions').doc(lobbyId)

    // Wait up to 8 s for the candidate workspace to create the session doc.
    // This covers the race where the interviewer selects a case before the
    // candidate's POST /api/sessions has finished writing to Firestore.
    const existingData = await waitForWaitingSession(ref)
    if (!existingData) {
      throw new TransitionError(
        404,
        'session_not_found',
        "Candidate hasn't opened their lobby yet. Ask them to load the workspace, then try again.",
      )
    }

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) {
        throw new TransitionError(
          404,
          'session_not_found',
          "Candidate hasn't opened their lobby yet. Ask them to load the workspace, then try again.",
        )
      }
      const data = snap.data() ?? {}
      if (data.status !== 'waiting' && data.status !== 'replacing') {
        const friendlyMessage =
          data.status === 'completed'
            ? 'This session has already ended. You can close this window.'
            : data.status === 'in_progress'
              ? 'A case is already running in this session. Starting a new one will replace it.'
              : `This session can't accept a new case right now (status: ${data.status}).`
        throw new TransitionError(409, 'invalid_transition', friendlyMessage)
      }

      tx.set(
        ref,
        {
          caseId,
          ...(caseName ? { caseName } : {}),
          status: 'in_progress',
          sessionMode,
          interviewerId: caller.uid,
          interviewerEmail: caller.email,
          selectedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    })

    return jsonOk({ ok: true, lobbyId, caseId })
  },
)
