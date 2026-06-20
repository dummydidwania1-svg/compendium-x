/**
 * Single source of truth for Firestore document shapes.
 *
 * Each section defines:
 *   - A Zod schema (runtime validation, parsed on every Firestore read via
 *     `withConverter` in `lib/firebase/collections.ts`)
 *   - An inferred TypeScript type derived from the schema
 *
 * Schemas reflect the CURRENT shape of data in production, including legacy /
 * inconsistent fields. Items marked `TODO(normalize)` are tech-debt we will
 * fix in a later phase once writes are server-mediated.
 */
import { z } from 'zod'
import type { Timestamp } from 'firebase/firestore'

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A Firestore Timestamp value. Duck-typed via `.toDate()` so the same schema
 * passes whether parsed against a client SDK Timestamp or an Admin SDK
 * Timestamp (different classes, same interface).
 */
const timestamp = z.custom<Timestamp>(
  (value): value is Timestamp =>
    value != null &&
    typeof value === 'object' &&
    typeof (value as { toDate?: unknown }).toDate === 'function',
  { message: 'Expected Firestore Timestamp' },
)

/** Permissive nullable string — accepts string, null, or missing. */
const optionalString = z.string().nullable().optional()

/** Score field used across all four evaluation dimensions. */
const score = z.number().int().min(1).max(5)

/* -------------------------------------------------------------------------- */
/* profiles/{uid}                                                             */
/* -------------------------------------------------------------------------- */

// Loose objects on the read path so future fields added by other sessions
// survive parsing. Without `.loose()`, Zod silently strips unknown keys and
// downstream renderers fall through to defaults — see the frameworkTree
// regression that hit case-detail rendering after the cross-branch rebase.
export const profileSchema = z
  .object({
    fullName: z.string(),
    university: z.string(),
    goalTargetCases: z.number().optional(),
    updatedAt: timestamp.optional(),
  })
  .loose()
export type Profile = z.infer<typeof profileSchema>

/* -------------------------------------------------------------------------- */
/* cases/{docId}                                                              */
/* -------------------------------------------------------------------------- */

// TODO(normalize): `case_type` should be `caseType` for consistency with the
// rest of the codebase. Migration requires backfill + dual-read window.
// `frameworkTree` is the rich tree consumed by CasePreviewMaster; we keep it
// typed as `unknown` here so the renderer can cast and Zod doesn't strip it.
export const caseSchema = z
  .object({
    id: z.number().optional(),
    title: z.string(),
    industry: z.string(),
    difficulty: z.string(),
    case_type: z.string(),
    prompt: z.string(),
    framework: z.string(),
    frameworkTree: z.unknown().optional(),
    additionalFrameworkTrees: z.array(z.unknown()).optional(),
    company: z.string().optional(),
    round: z.string().optional(),
    createdAt: timestamp.optional(),
    updatedAt: timestamp.optional(),
  })
  .loose()
export type Case = z.infer<typeof caseSchema>

/* -------------------------------------------------------------------------- */
/* sessions/{lobbyId}                                                         */
/* -------------------------------------------------------------------------- */

export const sessionStatus = z.enum(['waiting', 'in_progress', 'completed', 'abandoned', 'fallback_unrated', 'replacing'])
export type SessionStatus = z.infer<typeof sessionStatus>

export const sessionMode = z.enum(['remote', 'local'])
export type SessionMode = z.infer<typeof sessionMode>

export const recordingStatus = z.enum(['recording', 'uploaded', 'upload_failed'])
export type RecordingStatus = z.infer<typeof recordingStatus>

export const transcriptStatus = z.enum(['pending', 'processing', 'completed', 'failed'])
export type TranscriptStatus = z.infer<typeof transcriptStatus>

/** The `recording` subdocument embedded on a session doc once recording starts. */
export const sessionRecordingSchema = z
  .object({
    status: recordingStatus,
    source: z.literal('candidate_workspace'),
    mode: sessionMode,
    candidateId: z.string(),
    candidateEmail: optionalString,
    caseId: optionalString,

    startedAt: timestamp.optional(),
    startedAtMs: z.number().optional(),
    stoppedAt: timestamp.optional(),
    stoppedAtMs: z.number().optional(),
    durationMs: z.number().nullable().optional(),
    stopReason: z.string().optional(),

    storagePath: z.string().optional(),
    audioUrl: z.string().optional(),
    mimeType: z.string().optional(),
    byteSize: z.number().optional(),

    transcriptStatus: transcriptStatus.optional(),
    transcriptRequestedAt: timestamp.optional(),
    transcriptCompletedAt: timestamp.optional(),
    transcriptFailedAt: timestamp.optional(),
    transcript: z.string().optional(),
    transcriptPreview: z.string().optional(),
    transcriptModel: optionalString,
    transcriptUsage: z.unknown().optional(),
    transcriptMimeType: z.string().optional(),
    transcriptByteSize: z.number().nullable().optional(),
    transcriptStoragePath: z.string().optional(),
    transcriptError: optionalString,

    error: z.string().optional(),
  })
  .loose()
export type SessionRecording = z.infer<typeof sessionRecordingSchema>

/** Presence subdoc written by each participant via /presence heartbeat (remote mode). */
export const participantPresenceSchema = z
  .object({
    active: z.boolean(),
    lastSeenAt: timestamp,
  })
  .loose()

/** Candidate-specific presence includes whether their recording is active. */
export const candidatePresenceSchema = participantPresenceSchema.extend({
  recording: z.boolean(),
})

export const sessionSchema = z
  .object({
    lobbyId: z.string(),
    candidateId: z.string(),
    candidateEmail: optionalString,
    interviewerId: z.string().optional(),
    interviewerEmail: optionalString,
    status: sessionStatus,
    sessionMode: sessionMode,
    caseId: optionalString,

    createdAt: timestamp.optional(),
    updatedAt: timestamp.optional(),
    selectedAt: timestamp.optional(),
    completedAt: timestamp.optional(),
    completedBy: z.string().optional(),
    abandonedAt: timestamp.optional(),
    fallbackAt: timestamp.optional(),

    recording: sessionRecordingSchema.optional(),

    // Remote-mode presence: each side writes a heartbeat every ~10s.
    // The other side reads these via onSnapshot to detect disconnection.
    candidatePresence: candidatePresenceSchema.optional(),
    interviewerPresence: participantPresenceSchema.optional(),
  })
  .loose()
export type Session = z.infer<typeof sessionSchema>
export type CandidatePresence = z.infer<typeof candidatePresenceSchema>
export type InterviewerPresence = z.infer<typeof participantPresenceSchema>

/* -------------------------------------------------------------------------- */
/* evaluations/{evaluationId}                                                 */
/* -------------------------------------------------------------------------- */

// TODO(normalize): `notes` and `interviewerObservations` are duplicates.
// TODO(normalize): legacy aliases `quantScore`, `businessSenseScore`,
//   `communicationScore`, and singular `workspaceImageUrl` should be migrated
//   off in a future cleanup.
export const evaluationSchema = z
  .object({
    caseId: z.string(),
    caseTitle: z.string(),
    caseType: optionalString,
    industry: optionalString,
    lobbyId: optionalString,

    candidateId: z.string(),
    interviewerId: z.string().nullable(),
    candidateName: optionalString,
    interviewerEmail: optionalString,

    structureScore: score.nullable().optional(),
    understandingScore: score.nullable().optional(),
    deliveryScore: score.nullable().optional(),
    creativityScore: score.nullable().optional(),

    isUnrated: z.boolean().optional(),
    completedBy: z.string().optional(),

    notes: z.string(),
    interviewerObservations: z.string().optional(),

    workspaceImageUrls: z.array(z.string()).optional(),

    createdAt: timestamp.optional(),
    updatedAt: timestamp.optional(),
  })
  .loose()
export type Evaluation = z.infer<typeof evaluationSchema>

/* -------------------------------------------------------------------------- */
/* case_forums/{caseId}                                                       */
/* -------------------------------------------------------------------------- */

export const caseForumSchema = z
  .object({
    caseId: z.string(),
    caseTitle: optionalString,
    updatedAt: timestamp.optional(),
    lastActivityAt: timestamp.optional(),
    threadCount: z.number().optional(),
  })
  .loose()
export type CaseForum = z.infer<typeof caseForumSchema>

/* -------------------------------------------------------------------------- */
/* case_forums/{caseId}/threads/{threadId}                                    */
/* -------------------------------------------------------------------------- */

export const forumThreadSchema = z
  .object({
    caseId: z.string(),
    caseTitle: optionalString,
    body: z.string().min(1).max(3000),
    title: z.string().optional(), // legacy
    authorId: z.string(),
    authorName: z.string(),
    createdAt: timestamp.optional(),
    updatedAt: timestamp.optional(),
  })
  .loose()
export type ForumThread = z.infer<typeof forumThreadSchema>

/* -------------------------------------------------------------------------- */
/* case_forums/{caseId}/threads/{threadId}/replies/{replyId}                  */
/* -------------------------------------------------------------------------- */

export const forumReplySchema = z
  .object({
    body: z.string().min(1).max(3000),
    authorId: z.string(),
    authorName: z.string(),
    createdAt: timestamp.optional(),
    updatedAt: timestamp.optional(),
  })
  .loose()
export type ForumReply = z.infer<typeof forumReplySchema>

/* -------------------------------------------------------------------------- */
/* case_forums/{caseId}/threads/{threadId}/votes/{uid}                        */
/* -------------------------------------------------------------------------- */

export const forumVoteSchema = z
  .object({
    value: z.union([z.literal(1), z.literal(-1)]),
    updatedAt: timestamp.optional(),
  })
  .loose()
export type ForumVote = z.infer<typeof forumVoteSchema>
