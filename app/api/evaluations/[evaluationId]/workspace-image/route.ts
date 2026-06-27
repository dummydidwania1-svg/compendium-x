/**
 * POST /api/evaluations/[evaluationId]/workspace-image
 * DELETE /api/evaluations/[evaluationId]/workspace-image
 *
 * POST: Attaches an already-uploaded workspace image to a completed evaluation.
 * The client uploads the bytes to Storage first; this route owns the
 * Firestore mutation so completed-case image updates do not depend on
 * client-side Firestore write rules.
 *
 * DELETE: Removes a workspace image URL from the evaluation's array.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { z } from 'zod'
import { authenticatedRoute } from '@/lib/api/route'
import { jsonOk, parseBody, TransitionError } from '@/lib/api/responses'
import { adminDb } from '@/lib/firebase/admin'
import { attachWorkspaceImageInput } from '@/lib/firebase/inputs'

export const runtime = 'nodejs'

async function getEvaluationAndVerifyParticipant(
  evaluationId: string,
  callerUid: string,
) {
  const ref = adminDb.collection('evaluations').doc(evaluationId)
  const snap = await ref.get()
  if (!snap.exists) {
    throw new TransitionError(404, 'evaluation_not_found', 'Feedback entry not found.')
  }
  const data = snap.data() ?? {}
  const candidateId = typeof data.candidateId === 'string' ? data.candidateId : null
  const interviewerId = typeof data.interviewerId === 'string' ? data.interviewerId : null
  if (candidateId !== callerUid && interviewerId !== callerUid) {
    throw new TransitionError(
      403,
      'not_evaluation_participant',
      'You can only modify images for your own case attempts.',
    )
  }
  return ref
}

export const POST = authenticatedRoute<{ evaluationId: string }>(
  '/api/evaluations/[evaluationId]/workspace-image',
  async (request, caller, { evaluationId }) => {
    const input = await parseBody(request, attachWorkspaceImageInput)
    const normalizedPath = input.storagePath.replace(/^\/+|\/+$/g, '')
    const expectedPrefix = `workspace-images/${caller.uid}/${evaluationId}/`

    if (!normalizedPath.startsWith(expectedPrefix)) {
      throw new TransitionError(
        403,
        'storage_path_mismatch',
        'Image upload path does not match this feedback entry.',
      )
    }

    const ref = await getEvaluationAndVerifyParticipant(evaluationId, caller.uid)
    await ref.update({
      workspaceImageUrls: FieldValue.arrayUnion(input.workspaceImageUrl),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return jsonOk({ ok: true, workspaceImageUrl: input.workspaceImageUrl })
  },
)

const removeWorkspaceImageInput = z.object({
  workspaceImageUrl: z.string().url(),
})

export const DELETE = authenticatedRoute<{ evaluationId: string }>(
  '/api/evaluations/[evaluationId]/workspace-image',
  async (request, caller, { evaluationId }) => {
    const input = await parseBody(request, removeWorkspaceImageInput)
    const ref = await getEvaluationAndVerifyParticipant(evaluationId, caller.uid)
    await ref.update({
      workspaceImageUrls: FieldValue.arrayRemove(input.workspaceImageUrl),
      updatedAt: FieldValue.serverTimestamp(),
    })
    return jsonOk({ ok: true })
  },
)
