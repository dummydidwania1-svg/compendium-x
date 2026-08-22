/**
 * Zod input schemas for the API routes that mutate Firestore.
 *
 * These are deliberately stricter than the document-shape schemas in
 * `lib/firebase/schema.ts`:
 *   - No timestamps (server fills with `FieldValue.serverTimestamp()`)
 *   - No identity claims (server derives `candidateId` / `interviewerId`
 *     from the verified caller token)
 *   - Tight bounds on string lengths to avoid abuse
 */
import { z } from 'zod'

// New sessions generate IDs via lib/session/lobbyId.ts (crypto.randomUUID —
// 122 bits of CSPRNG entropy). The loose lower bound keeps pre-existing
// short-format lobby IDs (older sessions, in-flight at deploy time) working.
const lobbyId = z.string().min(4).max(128)
const caseId = z.string().min(1).max(128)
const sessionMode = z.enum(['remote', 'local'])
const stopReason = z.string().min(1).max(64)
const score = z.number().min(0.5).max(5)
const participantRole = z.enum(['candidate', 'interviewer'])

/* -------------------------------------------------------------------------- */
/* POST /api/sessions — candidate creates / refreshes their session           */
/* -------------------------------------------------------------------------- */

export const createSessionInput = z.object({
  lobbyId,
  sessionMode,
})
export type CreateSessionInput = z.infer<typeof createSessionInput>

/* -------------------------------------------------------------------------- */
/* POST /api/sessions/[lobbyId]/select-case                                   */
/* -------------------------------------------------------------------------- */

export const selectCaseInput = z.object({
  caseId,
  sessionMode,
  caseName: z.string().max(256).optional(),
})
export type SelectCaseInput = z.infer<typeof selectCaseInput>

/* -------------------------------------------------------------------------- */
/* POST /api/sessions/[lobbyId]/recording                                     */
/* -------------------------------------------------------------------------- */

// Shared dual-mic fields — optional so old callers (local mode) don't break.
const dualMicFields = {
  /** 'candidate' or 'interviewer'. Omit for local sessions (embedded recording). */
  role: participantRole.optional(),
  /** Ms elapsed between session.selectedAt and recording start. */
  startOffsetMs: z.number().int().optional(),
  /** Device's ms reading of selectedAt used as anchor (for skew debugging). */
  anchorSelectedAtMs: z.number().int().optional(),
  /**
   * Safari primed-recording only: ms of dead audio at the FRONT to trim
   * server-side (recording started at the launch click, before case-start).
   */
  trimStartMs: z.number().int().nonnegative().optional(),
  /**
   * Periodic cumulative flush (overwrite stable live path).
   * When true, sets transcriptStatus:'recording' — does NOT trigger transcription.
   * Omit or false for the final upload.
   */
  live: z.boolean().optional(),
  /**
   * Hard-close beacon: the interviewer left mid-session.
   * Finalizes the last-flushed audio (sets transcriptStatus:'pending') and marks
   * the track + session as interviewerInterrupted so the merge can label it.
   */
  interrupted: z.boolean().optional(),
}

const recordingUploadedInput = z.object({
  status: z.literal('uploaded'),
  mode: sessionMode,
  storagePath: z.string().min(1).max(512),
  audioUrl: z.string().url().max(2048),
  byteSize: z.number().int().nonnegative(),
  mimeType: z.string().min(1).max(128),
  durationMs: z.number().int().nullable(),
  startedAtMs: z.number().int().nonnegative(),
  stoppedAtMs: z.number().int().nonnegative(),
  stopReason,
  ...dualMicFields,
})

const recordingFailedInput = z.object({
  status: z.literal('upload_failed'),
  mode: sessionMode,
  stoppedAtMs: z.number().int().nonnegative(),
  stopReason,
  error: z.string().min(1).max(2000),
  ...dualMicFields,
})

export const recordingInput = z.discriminatedUnion('status', [
  recordingUploadedInput,
  recordingFailedInput,
])
export type RecordingInput = z.infer<typeof recordingInput>

/* -------------------------------------------------------------------------- */
/* POST /api/sessions/[lobbyId]/complete                                      */
/* -------------------------------------------------------------------------- */

export const completeSessionInput = z.object({
  completedBy: z.literal('candidate'),
})
export type CompleteSessionInput = z.infer<typeof completeSessionInput>

// /api/transcribe was removed. Transcription is now handled by a
// Firestore-triggered Cloud Function (functions/src/index.ts) when
// `recording.transcriptStatus` transitions to 'pending'.

/* -------------------------------------------------------------------------- */
/* POST /api/evaluations                                                      */
/* -------------------------------------------------------------------------- */

// Server fetches caseTitle/caseType/industry from the `cases` collection so
// the client can't tamper with denormalized eval metadata.
export const submitEvaluationInput = z.object({
  lobbyId: lobbyId.nullable(),
  caseId,
  scores: z.object({
    structure: score.optional(),
    understanding: score.optional(),
    delivery: score.optional(),
    creativity: score.optional(),
  }),
  notes: z.string().max(10000),
})
export type SubmitEvaluationInput = z.infer<typeof submitEvaluationInput>

/* -------------------------------------------------------------------------- */
/* POST /api/evaluations/[evaluationId]/workspace-image                       */
/* -------------------------------------------------------------------------- */

export const attachWorkspaceImageInput = z.object({
  storagePath: z.string().min(1).max(512),
  workspaceImageUrl: z.string().url().max(2048),
})
export type AttachWorkspaceImageInput = z.infer<typeof attachWorkspaceImageInput>
