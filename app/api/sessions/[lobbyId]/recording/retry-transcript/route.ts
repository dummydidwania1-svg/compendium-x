/**
 * POST /api/sessions/[lobbyId]/recording/retry-transcript
 *
 * Re-queues a failed transcript by flipping `recording.transcriptStatus`
 * back to `'pending'`. The Firestore-triggered `transcribeRecording`
 * Cloud Function picks up the transition and re-runs Gemini against the
 * existing audio URL — no audio re-upload, no client wait.
 *
 * Requires:
 *   - Caller is the session candidate
 *   - Session has a recording with an audioUrl (i.e. audio was uploaded)
 *   - Current transcriptStatus is 'failed' (no point retrying a completed
 *     or in-flight transcript)
 */
import { FieldValue } from 'firebase-admin/firestore'
import { adminDb } from '@/lib/firebase/admin'
import { TransitionError, jsonOk } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'

export const runtime = 'nodejs'

export const POST = authenticatedRoute<{ lobbyId: string }>(
  '/api/sessions/[lobbyId]/recording/retry-transcript',
  async (_request, caller, { lobbyId }) => {
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
      const recording = data.recording as
        | { audioUrl?: string; storagePath?: string; transcriptStatus?: string }
        | undefined
      if (!recording?.audioUrl || !recording.storagePath) {
        throw new TransitionError(
          409,
          'no_recording',
          'No recording is attached to this session yet.',
        )
      }
      if (recording.transcriptStatus === 'pending' || recording.transcriptStatus === 'processing') {
        throw new TransitionError(
          409,
          'already_in_flight',
          'Transcript generation is already running. Try again in a moment.',
        )
      }

      tx.set(
        ref,
        {
          recording: {
            transcriptStatus: 'pending',
            transcriptRequestedAt: FieldValue.serverTimestamp(),
            transcriptError: null,
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    })

    return jsonOk({ ok: true, lobbyId })
  },
)
