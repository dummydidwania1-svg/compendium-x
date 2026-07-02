/**
 * POST /api/evaluations
 *
 * Interviewer submits scores + notes for a candidate. Two flows:
 *   - With `lobbyId`: a live session. Server reads the session for
 *     candidateId, verifies caller is the registered interviewer, creates
 *     the evaluation doc, and transitions session → completed.
 *   - With `lobbyId: null`: preview / self-rating. candidateId = caller.uid
 *     so the doc still satisfies the read rules.
 *
 * Server pulls case title/type/industry from the `cases` collection so
 * those denormalized fields can't be tampered with by the client.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { TransitionError, jsonOk, parseBody } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'
import { submitEvaluationInput } from '@/lib/firebase/inputs'

export const runtime = 'nodejs'

export const POST = authenticatedRoute('/api/evaluations', async (request, caller) => {
  const input = await parseBody(request, submitEvaluationInput)

  // 1) Pull case metadata from the source of truth.
  const caseSnap = await adminDb.collection('cases').doc(input.caseId).get()
  if (!caseSnap.exists) {
    throw new TransitionError(404, 'case_not_found', 'Case does not exist.')
  }
  const caseData = caseSnap.data() ?? {}
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

  // 2) Resolve candidate identity from session (or fall back to caller).
  let candidateId: string
  let candidateEmail: string | null
  let sessionRef: FirebaseFirestore.DocumentReference | null = null
  if (input.lobbyId) {
    sessionRef = adminDb.collection('sessions').doc(input.lobbyId)
    const sessionSnap = await sessionRef.get()
    if (!sessionSnap.exists) {
      throw new TransitionError(404, 'session_not_found', 'Session does not exist.')
    }
    const sessionData = sessionSnap.data() ?? {}

    if (sessionData.interviewerId && sessionData.interviewerId !== caller.uid) {
      throw new TransitionError(
        403,
        'not_interviewer',
        'Caller is not the registered interviewer for this session.',
      )
    }
    if (typeof sessionData.candidateId !== 'string') {
      throw new TransitionError(
        409,
        'session_no_candidate',
        'Session has no candidate. Cannot submit evaluation.',
      )
    }
    candidateId = sessionData.candidateId
    candidateEmail =
      typeof sessionData.candidateEmail === 'string' ? sessionData.candidateEmail : null
  } else {
    candidateId = caller.uid
    candidateEmail = caller.email
  }

  // 3) Guard against duplicate submissions (e.g. interviewer opens two tabs).
  if (input.lobbyId) {
    const existing = await adminDb
      .collection('evaluations')
      .where('lobbyId', '==', input.lobbyId)
      .limit(1)
      .get()
    if (!existing.empty) {
      return jsonOk({ ok: true, evaluationId: existing.docs[0].id })
    }
  }

  // 4) Create evaluation + (optionally) complete session in one batch.
  const evaluationRef = adminDb.collection('evaluations').doc()
  const batch = adminDb.batch()

  const scoredCount = [input.scores.structure, input.scores.understanding, input.scores.delivery, input.scores.creativity]
    .filter((s) => s !== undefined).length

  batch.set(evaluationRef, {
    caseId: input.caseId,
    caseTitle,
    caseType,
    industry,
    lobbyId: input.lobbyId,
    candidateId,
    interviewerId: caller.uid,
    candidateName: candidateEmail ?? caller.email,
    interviewerEmail: caller.email,
    ...(input.scores.structure !== undefined && { structureScore: input.scores.structure }),
    ...(input.scores.understanding !== undefined && { understandingScore: input.scores.understanding }),
    ...(input.scores.delivery !== undefined && { deliveryScore: input.scores.delivery }),
    ...(input.scores.creativity !== undefined && { creativityScore: input.scores.creativity }),
    ...(scoredCount < 4 && { isUnrated: true }),
    notes: input.notes,
    interviewerObservations: input.notes,
    createdAt: FieldValue.serverTimestamp(),
  })

  if (sessionRef) {
    batch.set(
      sessionRef,
      {
        status: 'completed',
        caseId: input.caseId,
        interviewerId: caller.uid,
        interviewerEmail: caller.email,
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  }

  await batch.commit()

  // If the interviewer's recording track is stuck in 'recording' (periodic flush
  // wrote the audio but the final upload beacon never arrived — common when the
  // browser closes right after the session), flip it to 'pending' now so the
  // transcription Cloud Function fires immediately rather than waiting for the
  // 5-minute finalizePendingMerges sweep.
  if (sessionRef && input.lobbyId) {
    try {
      const trackRef = adminDb
        .collection('sessions')
        .doc(input.lobbyId)
        .collection('recordings')
        .doc('interviewer')
      const trackSnap = await trackRef.get()
      const trackData = trackSnap.data()
      if (trackSnap.exists && trackData?.transcriptStatus === 'recording' && trackData?.audioUrl) {
        await trackRef.set(
          { transcriptStatus: 'pending', updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        )
      }
    } catch {
      // best-effort — don't fail the evaluation submission if this errors
    }
  }

  return jsonOk({ ok: true, evaluationId: evaluationRef.id })
})
