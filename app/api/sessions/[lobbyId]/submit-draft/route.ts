/**
 * POST /api/sessions/[lobbyId]/submit-draft
 *
 * Candidate-initiated evaluation submission when the interviewer filled scores
 * (in localStorage draft) but didn't formally submit before the candidate ended
 * the session. The candidate calls this route; the server creates the evaluation
 * doc using the session's recorded interviewerId as the author, bypassing the
 * normal "caller must be interviewer" check.
 *
 * Idempotent: if an evaluation for this lobbyId already exists, returns 200.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { TransitionError, jsonOk, parseBody } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'
import { z } from 'zod'

export const runtime = 'nodejs'

const submitDraftInput = z.object({
  scores: z.object({
    structure: z.number().int().min(1).max(5),
    understanding: z.number().int().min(1).max(5),
    delivery: z.number().int().min(1).max(5),
    creativity: z.number().int().min(1).max(5),
  }),
  notes: z.string().default(''),
})

export const POST = authenticatedRoute<{ lobbyId: string }>(
  '/api/sessions/[lobbyId]/submit-draft',
  async (request, caller, { lobbyId }) => {
    const input = await parseBody(request, submitDraftInput)

    const sessionRef = adminDb.collection('sessions').doc(lobbyId)
    const sessionSnap = await sessionRef.get()
    if (!sessionSnap.exists) {
      throw new TransitionError(404, 'session_not_found', 'Session does not exist.')
    }
    const sessionData = sessionSnap.data() ?? {}

    if (sessionData.candidateId !== caller.uid) {
      throw new TransitionError(403, 'not_candidate', 'Caller is not the session candidate.')
    }

    const caseId = typeof sessionData.caseId === 'string' ? sessionData.caseId : null
    if (!caseId) {
      throw new TransitionError(409, 'no_case', 'Session has no case assigned.')
    }

    // Idempotent: if eval already exists, skip creation
    const existing = await adminDb
      .collection('evaluations')
      .where('lobbyId', '==', lobbyId)
      .limit(1)
      .get()
    if (!existing.empty) {
      return jsonOk({ ok: true, evaluationId: existing.docs[0].id })
    }

    const caseSnap = await adminDb.collection('cases').doc(caseId).get()
    const caseData = caseSnap.exists ? (caseSnap.data() ?? {}) : {}
    const caseTitle =
      typeof caseData.title === 'string' && caseData.title.trim().length > 0
        ? caseData.title.trim()
        : 'Untitled case'
    const caseType =
      typeof caseData.caseType === 'string'
        ? caseData.caseType
        : typeof caseData.case_type === 'string'
          ? caseData.case_type
          : null
    const industry =
      typeof caseData.industry === 'string' && caseData.industry.length > 0
        ? caseData.industry
        : null

    const candidateId = sessionData.candidateId as string
    const candidateEmail =
      typeof sessionData.candidateEmail === 'string' ? sessionData.candidateEmail : null
    // Use session's interviewerId if available, otherwise fall back to candidate (self-submitted)
    const interviewerId =
      typeof sessionData.interviewerId === 'string' ? sessionData.interviewerId : caller.uid
    const interviewerEmail =
      typeof sessionData.interviewerEmail === 'string' ? sessionData.interviewerEmail : caller.email

    const evaluationRef = adminDb.collection('evaluations').doc()
    const batch = adminDb.batch()

    batch.set(evaluationRef, {
      caseId,
      caseTitle,
      caseType,
      industry,
      lobbyId,
      candidateId,
      interviewerId,
      candidateName: candidateEmail ?? caller.email,
      interviewerEmail,
      structureScore: input.scores.structure,
      understandingScore: input.scores.understanding,
      deliveryScore: input.scores.delivery,
      creativityScore: input.scores.creativity,
      notes: input.notes,
      interviewerObservations: input.notes,
      createdAt: FieldValue.serverTimestamp(),
    })

    batch.set(
      sessionRef,
      {
        status: 'completed',
        completedBy: 'candidate_draft_submit',
        interviewerId,
        interviewerEmail,
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    await batch.commit()

    return jsonOk({ ok: true, evaluationId: evaluationRef.id })
  },
)
