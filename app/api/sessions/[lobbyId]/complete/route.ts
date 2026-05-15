/**
 * POST /api/sessions/[lobbyId]/complete
 *
 * Candidate ends the session. Transitions in_progress → completed.
 * Idempotent: completing an already-completed session is a no-op.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { verifyRequest } from '@/lib/auth/verifyRequest'
import { TransitionError, errorToResponse, jsonOk, parseBody } from '@/lib/api/responses'
import { completeSessionInput } from '@/lib/firebase/inputs'

export const runtime = 'nodejs'

interface RouteContext {
  params: Promise<{ lobbyId: string }>
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const caller = await verifyRequest(request)
    const { lobbyId } = await params
    const { completedBy } = await parseBody(request, completeSessionInput)

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
      if (data.status === 'completed') {
        // Idempotent: nothing to do.
        return
      }
      if (data.status !== 'in_progress') {
        throw new TransitionError(
          409,
          'invalid_transition',
          `Cannot complete a session that is "${data.status}".`,
        )
      }

      tx.set(
        ref,
        {
          status: 'completed',
          completedBy,
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    })

    return jsonOk({ ok: true, lobbyId })
  } catch (err) {
    return errorToResponse(err)
  }
}
