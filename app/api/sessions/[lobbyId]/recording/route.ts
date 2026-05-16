/**
 * POST /api/sessions/[lobbyId]/recording
 *
 * Candidate finalizes a recording upload. Accepts two discriminated shapes
 * via Zod: `status: 'uploaded'` (success path) or `status: 'upload_failed'`
 * (failure path). In both cases the server merges a `recording` subdocument
 * onto the session.
 *
 * Requires the session to be `in_progress` and the caller to be the
 * registered candidate. For the success path, the storage path must live
 * under `session-recordings/{auth.uid}/{lobbyId}/`.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { TransitionError, jsonOk, parseBody } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'
import { recordingInput } from '@/lib/firebase/inputs'

export const runtime = 'nodejs'

export const POST = authenticatedRoute<{ lobbyId: string }>(
  '/api/sessions/[lobbyId]/recording',
  async (request, caller, { lobbyId }) => {
    const body = await parseBody(request, recordingInput)

    if (body.status === 'uploaded') {
      const expectedPrefix = `session-recordings/${caller.uid}/${lobbyId}/`
      const normalized = body.storagePath.replace(/^\/+|\/+$/g, '')
      if (!normalized.startsWith(expectedPrefix)) {
        throw new TransitionError(
          403,
          'storage_path_mismatch',
          'Storage path is not under your session-recordings prefix.',
        )
      }
    }

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
      // Accept both 'in_progress' and 'completed'. The interviewer can submit
      // feedback (which transitions the session to 'completed') before the
      // candidate finishes uploading the recording — both orderings are valid
      // in practice and the recording subdoc is informational, not a state
      // transition. Only reject on truly invalid prior states (e.g. 'waiting',
      // before a case has been attached).
      if (data.status !== 'in_progress' && data.status !== 'completed') {
        throw new TransitionError(
          409,
          'invalid_transition',
          `Cannot record when session is "${data.status}".`,
        )
      }

      const sharedFields = {
        source: 'candidate_workspace' as const,
        candidateId: caller.uid,
        candidateEmail: caller.email,
        caseId: data.caseId ?? null,
        mode: body.mode,
        stoppedAt: FieldValue.serverTimestamp(),
        stoppedAtMs: body.stoppedAtMs,
        stopReason: body.stopReason,
      }

      const recording =
        body.status === 'uploaded'
          ? {
              ...sharedFields,
              status: 'uploaded',
              startedAtMs: body.startedAtMs,
              durationMs: body.durationMs,
              storagePath: body.storagePath,
              audioUrl: body.audioUrl,
              mimeType: body.mimeType,
              byteSize: body.byteSize,
              transcriptStatus: 'pending',
            }
          : {
              ...sharedFields,
              status: 'upload_failed',
              error: body.error,
              transcriptStatus: 'failed',
            }

      tx.set(
        ref,
        {
          recording,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    })

    return jsonOk({ ok: true, lobbyId, status: body.status })
  },
)
