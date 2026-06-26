/**
 * POST /api/sessions/[lobbyId]/presence
 *
 * Heartbeat for remote-mode sessions. Each participant (candidate or
 * interviewer) calls this every ~10s while in the case/workspace view.
 * The resulting `candidatePresence` / `interviewerPresence` sub-doc on
 * the session document lets the other side detect disconnection via their
 * existing `onSnapshot` subscription without a separate realtime channel.
 *
 * Auth: caller must be either the session's candidateId or interviewerId.
 * Idempotent (merge: true) — safe to call on every heartbeat tick.
 */
import { FieldValue } from 'firebase-admin/firestore'
import { z } from 'zod'
import { adminDb } from '@/lib/firebase/admin'
import { TransitionError, jsonOk, parseBody } from '@/lib/api/responses'
import { authenticatedRoute } from '@/lib/api/route'

export const runtime = 'nodejs'

const presenceInput = z.object({
  role: z.enum(['candidate', 'interviewer']),
  active: z.boolean(),
  /** Only meaningful for the candidate role — whether recording is currently live. */
  recording: z.boolean().optional(),
  /**
   * Only meaningful for the interviewer role. When explicitly set to `false`,
   * merges `interviewerAudioCaptured: false` onto the session doc, telling the
   * candidate that only their side will appear in the merged transcript.
   * Omit (or set true) when audio is being captured normally.
   */
  interviewerAudioCaptured: z.boolean().optional(),
  /**
   * Only meaningful for the candidate role in remote mode. When explicitly set
   * to `true`, merges `candidateOptedOutRecording: true` onto the session doc
   * so the interviewer gate can suppress the mic prompt (no recording needed).
   */
  candidateOptedOutRecording: z.boolean().optional(),
})

export const POST = authenticatedRoute<{ lobbyId: string }>(
  '/api/sessions/[lobbyId]/presence',
  async (request, caller, { lobbyId }) => {
    const { role, active, recording, interviewerAudioCaptured, candidateOptedOutRecording } = await parseBody(request, presenceInput)
    const ref = adminDb.collection('sessions').doc(lobbyId)

    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref)
      if (!snap.exists) {
        throw new TransitionError(404, 'session_not_found', 'Session does not exist.')
      }
      const data = snap.data() ?? {}

      if (role === 'candidate') {
        if (data.candidateId !== caller.uid) {
          throw new TransitionError(403, 'not_candidate', 'Caller is not the session candidate.')
        }
        const candidateUpdate: Record<string, unknown> = {
          candidatePresence: {
            active,
            recording: recording ?? false,
            lastSeenAt: FieldValue.serverTimestamp(),
          },
        }
        if (candidateOptedOutRecording === true) {
          candidateUpdate.candidateOptedOutRecording = true
        }
        tx.set(ref, candidateUpdate, { merge: true })
      } else {
        // Allow writes before interviewerId is registered (lobby phase).
        // Once set, require identity match.
        if (data.interviewerId && data.interviewerId !== caller.uid) {
          throw new TransitionError(403, 'not_interviewer', 'Caller is not the session interviewer.')
        }
        const interviewerUpdate: Record<string, unknown> = {
          interviewerPresence: {
            active,
            lastSeenAt: FieldValue.serverTimestamp(),
          },
        }
        // §3b: when the interviewer explicitly signals they won't be recording,
        // merge interviewerAudioCaptured:false onto the session doc so the
        // candidate sees the "only your side will be in the transcript" notice
        // and the Cloud Function produces a partial (candidate-only) transcript.
        if (interviewerAudioCaptured === false) {
          interviewerUpdate.interviewerAudioCaptured = false
        }
        tx.set(ref, interviewerUpdate, { merge: true })
      }
    })

    return jsonOk({ ok: true, lobbyId })
  },
)
