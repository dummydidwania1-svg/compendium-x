/**
 * Typed collection / document references for every Firestore path in the app.
 *
 * Each reference is wired to a Zod schema via `withConverter`, so:
 *   - Reads return typed objects, validated at the SDK boundary
 *   - Writes are type-checked at compile time (Firestore sentinel values like
 *     `serverTimestamp()`, `arrayUnion()`, `increment()` still work thanks to
 *     the SDK's `WithFieldValue<T>` wrapper)
 *
 * Prefer these refs over raw `collection(db, '...')` calls — they give us
 * one place to evolve schemas + a single audit point for backend changes.
 */
import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
  type FirestoreDataConverter,
} from 'firebase/firestore'
import type { ZodType } from 'zod'
import { db } from './config'
import {
  caseForumSchema,
  caseSchema,
  evaluationSchema,
  forumReplySchema,
  forumThreadSchema,
  forumVoteSchema,
  goalConfigSchema,
  participantRecordingSchema,
  profileSchema,
  sessionSchema,
  type Case,
  type CaseForum,
  type Evaluation,
  type ForumReply,
  type ForumThread,
  type ForumVote,
  type GoalConfig,
  type ParticipantRecording,
  type ParticipantRole,
  type Profile,
  type Session,
} from './schema'

/**
 * Build a Firestore data converter from a Zod schema.
 *
 * Reads: schema.safeParse — if it fails, log a warning and fall through with
 * the raw data. We never crash a page over schema drift in prod.
 *
 * Writes: pass-through (Firestore + the SDK's WithFieldValue<T> handle the
 * type check at the call site).
 */
function converter<T extends ZodType>(label: string, schema: T): FirestoreDataConverter<ReturnType<T['parse']>> {
  type Parsed = ReturnType<T['parse']>
  return {
    toFirestore(data) {
      return data as Record<string, unknown>
    },
    fromFirestore(snap, options) {
      const raw = snap.data(options)
      const result = schema.safeParse(raw)
      if (!result.success) {
        console.warn(
          `[firestore:${label}] schema mismatch on ${snap.ref.path}`,
          result.error.issues,
        )
        return raw as Parsed
      }
      return result.data as Parsed
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Top-level collections                                                      */
/* -------------------------------------------------------------------------- */

export const profilesCol: CollectionReference<Profile> = collection(db, 'profiles').withConverter(
  converter('profiles', profileSchema),
)
export const profileDoc = (uid: string): DocumentReference<Profile> => doc(profilesCol, uid)

export const goalsCol: CollectionReference<GoalConfig> = collection(db, 'goals').withConverter(
  converter('goals', goalConfigSchema),
)
export const goalDoc = (uid: string): DocumentReference<GoalConfig> => doc(goalsCol, uid)

export const casesCol: CollectionReference<Case> = collection(db, 'cases').withConverter(
  converter('cases', caseSchema),
)
export const caseDoc = (caseId: string): DocumentReference<Case> => doc(casesCol, caseId)

export const sessionsCol: CollectionReference<Session> = collection(db, 'sessions').withConverter(
  converter('sessions', sessionSchema),
)
export const sessionDoc = (lobbyId: string): DocumentReference<Session> => doc(sessionsCol, lobbyId)

export const evaluationsCol: CollectionReference<Evaluation> = collection(db, 'evaluations').withConverter(
  converter('evaluations', evaluationSchema),
)
export const evaluationDoc = (id: string): DocumentReference<Evaluation> => doc(evaluationsCol, id)

/* -------------------------------------------------------------------------- */
/* sessions/{lobbyId}/recordings/{role} — dual-mic tracks (remote mode)       */
/* -------------------------------------------------------------------------- */

export const participantRecordingsCol = (lobbyId: string): CollectionReference<ParticipantRecording> =>
  collection(db, 'sessions', lobbyId, 'recordings').withConverter(
    converter('sessions.recordings', participantRecordingSchema),
  )

export const participantRecordingDoc = (
  lobbyId: string,
  role: ParticipantRole,
): DocumentReference<ParticipantRecording> => doc(participantRecordingsCol(lobbyId), role)

/* -------------------------------------------------------------------------- */
/* Forum subcollections                                                       */
/* -------------------------------------------------------------------------- */

export const caseForumDoc = (caseId: string): DocumentReference<CaseForum> =>
  doc(db, 'case_forums', caseId).withConverter(converter('case_forums', caseForumSchema))

export const forumThreadsCol = (caseId: string): CollectionReference<ForumThread> =>
  collection(db, 'case_forums', caseId, 'threads').withConverter(
    converter('case_forums.threads', forumThreadSchema),
  )

export const forumThreadDoc = (caseId: string, threadId: string): DocumentReference<ForumThread> =>
  doc(forumThreadsCol(caseId), threadId)

export const forumRepliesCol = (
  caseId: string,
  threadId: string,
): CollectionReference<ForumReply> =>
  collection(db, 'case_forums', caseId, 'threads', threadId, 'replies').withConverter(
    converter('case_forums.threads.replies', forumReplySchema),
  )

export const forumVotesCol = (
  caseId: string,
  threadId: string,
): CollectionReference<ForumVote> =>
  collection(db, 'case_forums', caseId, 'threads', threadId, 'votes').withConverter(
    converter('case_forums.threads.votes', forumVoteSchema),
  )

export const forumVoteDoc = (
  caseId: string,
  threadId: string,
  uid: string,
): DocumentReference<ForumVote> => doc(forumVotesCol(caseId, threadId), uid)
