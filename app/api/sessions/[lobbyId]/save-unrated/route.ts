/**
 * POST /api/sessions/[lobbyId]/save-unrated
 *
 * Candidate ended the session (saving audio) while the interviewer had NOT
 * finished rating. The audio is kept and the case shows up in the candidate's
 * dashboard immediately as an "unrated" entry. This creates an evaluation doc
 * with isUnrated: true (no scores) using the session's recorded interviewerId
 * as the author, and marks the session completed.
 *
 * Idempotent: if an evaluation for this lobbyId already exists (e.g. the
 * interviewer submitted in the meantime), it is left untouched and the session
 * is simply marked completed.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { TransitionError, jsonOk } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'
import { OWN_CASE_ID, CUSTOM_CASE_TITLE } from '@/lib/constants'

export const runtime = 'nodejs'

export const POST = authenticatedRoute<{ lobbyId: string }>(
  '/api/sessions/[lobbyId]/save-unrated',
  async (_request, caller, { lobbyId }) => {
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

    // If an evaluation already exists (interviewer submitted), just mark the
    // session completed — don't overwrite real scores with an unrated stub.
    const existing = await adminDb
      .collection('evaluations')
      .where('lobbyId', '==', lobbyId)
      .limit(1)
      .get()

    // Custom ("do your own case") sessions have no `cases` document: use neutral
    // metadata and the interviewer's autosaved case type from the session.
    const isCustom = sessionData.caseSource === 'custom' || caseId === OWN_CASE_ID
    let caseTitle = CUSTOM_CASE_TITLE
    let caseType: string | null =
      typeof sessionData.customCaseType === 'string' && sessionData.customCaseType.trim().length > 0
        ? sessionData.customCaseType.trim()
        : null
    let industry: string | null = null
    if (!isCustom) {
      const caseSnap = await adminDb.collection('cases').doc(caseId).get()
      const caseData = caseSnap.exists ? (caseSnap.data() ?? {}) : {}
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

    const candidateId = sessionData.candidateId as string
    const candidateEmail =
      typeof sessionData.candidateEmail === 'string' ? sessionData.candidateEmail : null
    const interviewerId =
      typeof sessionData.interviewerId === 'string' ? sessionData.interviewerId : caller.uid
    const interviewerEmail =
      typeof sessionData.interviewerEmail === 'string' ? sessionData.interviewerEmail : caller.email

    const batch = adminDb.batch()

    if (existing.empty) {
      // Use a stable, lobbyId-derived document ID so concurrent calls are
      // idempotent — both would set the same doc with the same data rather
      // than creating two separate unrated stubs.
      const evaluationRef = adminDb.collection('evaluations').doc(`unrated_${lobbyId}`)
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
        isUnrated: true,
        notes: '',
        interviewerObservations: '',
        createdAt: FieldValue.serverTimestamp(),
      })
    }

    batch.set(
      sessionRef,
      {
        status: 'completed',
        completedBy: 'candidate_unrated_save',
        interviewerId,
        interviewerEmail,
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    await batch.commit()

    return jsonOk({
      ok: true,
      evaluationId: existing.empty ? undefined : existing.docs[0].id,
    })
  },
)
