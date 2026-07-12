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
import { OWN_CASE_ID, CUSTOM_CASE_TITLE } from '@/lib/constants'

export const runtime = 'nodejs'

export const POST = authenticatedRoute('/api/evaluations', async (request, caller) => {
  const input = await parseBody(request, submitEvaluationInput)

  // "Do your own case" sessions have no curated `cases` document. Their caseId
  // is the reserved sentinel, so skip the lookup and use neutral metadata; the
  // case type is resolved from the session's autosaved `customCaseType` below.
  const isCustom = input.caseId === OWN_CASE_ID

  // 1) Pull case metadata from the source of truth (repository cases only).
  let caseTitle = CUSTOM_CASE_TITLE
  let caseType: string | null = null
  let industry: string | null = null
  if (!isCustom) {
    const caseSnap = await adminDb.collection('cases').doc(input.caseId).get()
    if (!caseSnap.exists) {
      throw new TransitionError(404, 'case_not_found', 'Case does not exist.')
    }
    const caseData = caseSnap.data() ?? {}
    caseTitle =
      typeof caseData.title === 'string' && caseData.title.trim().length > 0
        ? caseData.title.trim()
        : 'Untitled case'
    caseType =
      typeof caseData.caseType === 'string'
        ? caseData.caseType
        : typeof caseData.case_type === 'string'
          ? caseData.case_type
          : null
    industry =
      typeof caseData.industry === 'string' && caseData.industry.length > 0
        ? caseData.industry
        : null
  }

  // 2) Resolve candidate identity from session (or fall back to caller).
  let candidateId: string
  let candidateEmail: string | null
  let sessionRef: FirebaseFirestore.DocumentReference | null = null
  // Hoisted so the candidate stuck-track recovery below (used by both the
  // upsert and fresh-create paths) can read sessionMode without a re-fetch.
  let sessionData: FirebaseFirestore.DocumentData = {}
  if (input.lobbyId) {
    sessionRef = adminDb.collection('sessions').doc(input.lobbyId)
    const sessionSnap = await sessionRef.get()
    if (!sessionSnap.exists) {
      throw new TransitionError(404, 'session_not_found', 'Session does not exist.')
    }
    sessionData = sessionSnap.data() ?? {}

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

    // Custom sessions denormalize the interviewer's autosaved case type onto
    // the evaluation so dashboard analytics weight the scores like any case.
    if (isCustom && typeof sessionData.customCaseType === 'string' && sessionData.customCaseType.trim().length > 0) {
      caseType = sessionData.customCaseType.trim()
    }
  } else {
    candidateId = caller.uid
    candidateEmail = caller.email
  }

  // 3) Guard against duplicate submissions. If an evaluation already exists for
  // this session, update it with fresh scores/notes (upsert). This covers the
  // auto-save → formal-submit update path: when the candidate ends the session,
  // the interviewer's scores are auto-saved; if the interviewer then formally
  // submits with edited/complete scores, the formal submit wins.
  if (input.lobbyId) {
    const existing = await adminDb
      .collection('evaluations')
      .where('lobbyId', '==', input.lobbyId)
      .limit(1)
      .get()
    if (!existing.empty) {
      const scoredCount = [input.scores.structure, input.scores.understanding, input.scores.delivery, input.scores.creativity]
        .filter((s) => s !== undefined).length
      const updateData: Record<string, unknown> = {
        notes: input.notes,
        interviewerObservations: input.notes,
        updatedAt: FieldValue.serverTimestamp(),
      }
      if (input.scores.structure !== undefined) updateData.structureScore = input.scores.structure
      if (input.scores.understanding !== undefined) updateData.understandingScore = input.scores.understanding
      if (input.scores.delivery !== undefined) updateData.deliveryScore = input.scores.delivery
      if (input.scores.creativity !== undefined) updateData.creativityScore = input.scores.creativity
      updateData.isUnrated = scoredCount < 4 ? true : FieldValue.delete()
      await existing.docs[0].ref.set(updateData, { merge: true })

      // Same stuck-track recovery as the fresh-create path: if the interviewer's
      // recording track is still in 'recording' (periodic flush ran but the final
      // beacon never arrived), promote it to 'pending' so transcription fires.
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

      // Mirror-image recovery for the candidate's own track — remote mode only.
      // Same-device sessions also write recordings/candidate (single-mic capture
      // of both voices), but must never get these flags: their existing
      // 5-minute-grace merge path in evaluateAndMerge is untouched by design.
      if (sessionData.sessionMode === 'remote') {
        try {
          const evalSessionRef = adminDb.collection('sessions').doc(input.lobbyId)
          const candidateTrackRef = evalSessionRef.collection('recordings').doc('candidate')
          const candidateTrackSnap = await candidateTrackRef.get()
          const candidateTrackData = candidateTrackSnap.data()
          if (candidateTrackSnap.exists && candidateTrackData?.transcriptStatus === 'recording' && candidateTrackData?.audioUrl) {
            // Candidate closed their tab mid-session: their last periodic flush
            // left real partial audio stuck at 'recording'. Promote it now so
            // transcription fires instead of waiting on the grace-window sweep.
            await candidateTrackRef.set(
              { transcriptStatus: 'pending', candidateInterrupted: true, updatedAt: FieldValue.serverTimestamp() },
              { merge: true },
            )
            await evalSessionRef.set(
              { candidateInterrupted: true, updatedAt: FieldValue.serverTimestamp() },
              { merge: true },
            )
          } else if (!candidateTrackSnap.exists) {
            // Candidate never started recording at all (disconnected before
            // select-case, or during a case replace). Flag it so evaluateAndMerge
            // treats "no candidate audio" as a known absence, not something to wait for.
            await evalSessionRef.set(
              { candidateNeverRecorded: true, updatedAt: FieldValue.serverTimestamp() },
              { merge: true },
            )
          }
        } catch {
          // best-effort — don't fail the evaluation submission if this errors
        }
      }

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

    // Mirror-image recovery for the candidate's own track — remote mode only.
    // Same-device sessions also write recordings/candidate (single-mic capture
    // of both voices), but must never get these flags: their existing
    // 5-minute-grace merge path in evaluateAndMerge is untouched by design.
    if (sessionData.sessionMode === 'remote') {
      try {
        const candidateTrackRef = adminDb
          .collection('sessions')
          .doc(input.lobbyId)
          .collection('recordings')
          .doc('candidate')
        const candidateTrackSnap = await candidateTrackRef.get()
        const candidateTrackData = candidateTrackSnap.data()
        if (candidateTrackSnap.exists && candidateTrackData?.transcriptStatus === 'recording' && candidateTrackData?.audioUrl) {
          // Candidate closed their tab mid-session: their last periodic flush
          // left real partial audio stuck at 'recording'. Promote it now so
          // transcription fires instead of waiting on the grace-window sweep.
          await candidateTrackRef.set(
            { transcriptStatus: 'pending', candidateInterrupted: true, updatedAt: FieldValue.serverTimestamp() },
            { merge: true },
          )
          await sessionRef.set(
            { candidateInterrupted: true, updatedAt: FieldValue.serverTimestamp() },
            { merge: true },
          )
        } else if (!candidateTrackSnap.exists) {
          // Candidate never started recording at all (disconnected before
          // select-case, or during a case replace). Flag it so evaluateAndMerge
          // treats "no candidate audio" as a known absence, not something to wait for.
          await sessionRef.set(
            { candidateNeverRecorded: true, updatedAt: FieldValue.serverTimestamp() },
            { merge: true },
          )
        }
      } catch {
        // best-effort — don't fail the evaluation submission if this errors
      }
    }
  }

  return jsonOk({ ok: true, evaluationId: evaluationRef.id })
})
