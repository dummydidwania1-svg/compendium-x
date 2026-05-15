/**
 * POST /api/sessions/[lobbyId]/select-case
 *
 * Interviewer attaches a case to a waiting session.
 * Transitions: waiting → in_progress.
 * Records the interviewer's uid so downstream rules can scope reads.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { verifyRequest } from '@/lib/auth/verifyRequest'
import { TransitionError, errorToResponse, jsonOk, parseBody } from '@/lib/api/responses'
import { selectCaseInput } from '@/lib/firebase/inputs'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ lobbyId: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const caller = await verifyRequest(request)
    const { lobbyId } = await params
    const { caseId, sessionMode } = await parseBody(request, selectCaseInput)

    const ref = adminDb.collection('sessions').doc(lobbyId)

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) {
        throw new TransitionError(
          404,
          'session_not_found',
          'Session does not exist. Candidate must open the lobby first.',
        )
      }
      const data = snap.data() ?? {}
      if (data.status !== 'waiting') {
        throw new TransitionError(
          409,
          'invalid_transition',
          `Cannot select case when session is "${data.status}".`,
        )
      }

      tx.set(
        ref,
        {
          caseId,
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
  } catch (err) {
    return errorToResponse(err)
  }
}
