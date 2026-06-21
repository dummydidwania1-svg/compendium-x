/**
 * POST /api/sessions/[lobbyId]/recording
 *
 * Finalizes a recording upload. Two discriminated shapes via Zod:
 *   - status: 'uploaded'      → success path
 *   - status: 'upload_failed' → failure path
 *
 * Local / old sessions (no `role` in body):
 *   Writes the embedded `session.recording` map exactly as before.
 *   Auth: caller must be the session's candidateId.
 *
 * Remote / dual-mic sessions (`role: 'candidate' | 'interviewer'` in body):
 *   Writes to `sessions/{lobbyId}/recordings/{role}` subcollection.
 *   Auth: candidate role → candidateId === caller.uid
 *         interviewer role → interviewerId === caller.uid
 *   Subcollection write sets transcriptStatus:'pending' which triggers
 *   the per-track Cloud Function (transcribeParticipantRecording).
 *
 * Storage-prefix check uses caller.uid in both modes (each participant
 * writes under their own session-recordings/{uid}/{lobbyId}/ prefix).
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

    const sessionRef = adminDb.collection('sessions').doc(lobbyId)

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(sessionRef)
      if (!snap.exists) {
        throw new TransitionError(404, 'session_not_found', 'Session does not exist.')
      }
      const data = snap.data() ?? {}

      const role = body.role

      // ── Per-role identity check ───────────────────────────────────────────
      if (!role || role === 'candidate') {
        // Legacy path (no role) and explicit candidate role.
        if (data.candidateId !== caller.uid) {
          throw new TransitionError(403, 'not_candidate', 'Caller is not the session candidate.')
        }
      } else {
        // Interviewer role — Part 1 established interviewerId on select-case.
        if (!data.interviewerId || data.interviewerId !== caller.uid) {
          throw new TransitionError(403, 'not_interviewer', 'Caller is not the session interviewer.')
        }
      }

      // Accept both 'in_progress' and 'completed' (interviewer can submit
      // feedback before the recording finishes uploading).
      if (data.status !== 'in_progress' && data.status !== 'completed') {
        throw new TransitionError(
          409,
          'invalid_transition',
          `Cannot record when session is "${data.status}".`,
        )
      }

      const sharedFields = {
        source: role === 'interviewer' ? 'interviewer_device' : 'candidate_workspace',
        candidateId: data.candidateId ?? caller.uid,
        candidateEmail: data.candidateEmail ?? caller.email,
        caseId: data.caseId ?? null,
        mode: body.mode,
        stoppedAt: FieldValue.serverTimestamp(),
        stoppedAtMs: body.stoppedAtMs,
        stopReason: body.stopReason,
        ...(role ? { role } : {}),
        ...(body.startOffsetMs !== undefined ? { startOffsetMs: body.startOffsetMs } : {}),
        ...(body.anchorSelectedAtMs !== undefined ? { anchorSelectedAtMs: body.anchorSelectedAtMs } : {}),
      }

      const trackData =
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

      if (role) {
        // Dual-mic path: write to subcollection doc for this role.
        // The per-track Cloud Function trigger (transcribeParticipantRecording)
        // fires when transcriptStatus transitions to 'pending'.
        const trackRef = adminDb
          .collection('sessions')
          .doc(lobbyId)
          .collection('recordings')
          .doc(role)
        tx.set(trackRef, { ...trackData, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        // For candidate uploads, denormalize fields onto the session doc so the
        // dashboard can read them without querying the subcollection:
        //   candidateAudioUrl → dashboard audio player
        //   mergedTranscriptStatus:'pending' → show "Generating…" immediately
        const sessionUpdate: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() }
        if (role === 'candidate' && body.status === 'uploaded') {
          sessionUpdate.candidateAudioUrl = body.audioUrl
          if (!data.mergedTranscriptStatus) {
            sessionUpdate.mergedTranscriptStatus = 'pending'
          }
        }
        tx.set(sessionRef, sessionUpdate, { merge: true })
      } else {
        // Legacy path: embedded recording map (local sessions, old clients).
        tx.set(
          sessionRef,
          { recording: trackData, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        )
      }
    })

    return jsonOk({ ok: true, lobbyId, status: body.status, role: body.role ?? 'candidate' })
  },
)
