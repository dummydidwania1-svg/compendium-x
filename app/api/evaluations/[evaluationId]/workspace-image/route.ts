/**
 * POST /api/evaluations/[evaluationId]/workspace-image
 *
 * Attaches an already-uploaded workspace image to a completed evaluation.
 * The client uploads the bytes to Storage first; this route owns the
 * Firestore mutation so completed-case image updates do not depend on
 * client-side Firestore write rules.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { authenticatedRoute } from '@/lib/api/route'
import { jsonOk, parseBody, TransitionError } from '@/lib/api/responses'
import { adminDb } from '@/lib/firebase/admin'
import { attachWorkspaceImageInput } from '@/lib/firebase/inputs'

export const runtime = 'nodejs'

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

    const evaluationRef = adminDb.collection('evaluations').doc(evaluationId)
    const evaluationSnap = await evaluationRef.get()
    if (!evaluationSnap.exists) {
      throw new TransitionError(404, 'evaluation_not_found', 'Feedback entry not found.')
    }

    const data = evaluationSnap.data() ?? {}
    const candidateId = typeof data.candidateId === 'string' ? data.candidateId : null
    const interviewerId = typeof data.interviewerId === 'string' ? data.interviewerId : null
    const isParticipant = candidateId === caller.uid || interviewerId === caller.uid

    if (!isParticipant) {
      throw new TransitionError(
        403,
        'not_evaluation_participant',
        'You can upload images only for your own case attempts.',
      )
    }

    await evaluationRef.update({
      workspaceImageUrls: FieldValue.arrayUnion(input.workspaceImageUrl),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return jsonOk({ ok: true, workspaceImageUrl: input.workspaceImageUrl })
  },
)
