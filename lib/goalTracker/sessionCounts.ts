/**
 * Client-only live-subscribing session counter. Deliberately separate from
 * `lib/dashboard/live.ts`'s evaluation-based DashboardCaseEntry pipeline
 * (which Coach/Analyser own). Per the locked §2 count-source rule, "completed
 * case" = any session with status === 'completed', not an evaluation doc.
 *
 * Pure filtering logic lives in ./goalCountFilter (no Firebase imports there)
 * so the server route can reuse it without pulling the client Firestore SDK
 * into server code.
 */
import { getDoc, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore'
import { caseDoc, evaluationsCol, sessionsCol } from '@/lib/firebase/collections'
import { normalizeCaseType } from '@/lib/dashboard/live'
import {
  buildGoalCountResult,
  filterCountedSessions,
  type CountedSession,
  type ExclusionConfig,
  type GoalCountResult,
} from './goalCountFilter'

export type { CountedSession, GoalCountResult } from './goalCountFilter'

/**
 * Live-subscribing hook-friendly helper: watches this candidate's completed
 * sessions (joined with case-type metadata, and evaluations when
 * countMode === 'rated'), applies exclusions, and calls `onUpdate` on every
 * relevant change. Returns an unsubscribe function.
 *
 * Re-fires automatically whenever the underlying Firestore data changes —
 * this IS the "recompute" mechanism for exclusion changes: the config is
 * passed in fresh on every call site render, so toggling an exclusion and
 * re-invoking this naturally produces the new counted set with no separate
 * migration step.
 */
export function subscribeGoalCounts(
  uid: string,
  config: ExclusionConfig,
  onUpdate: (result: GoalCountResult) => void,
): Unsubscribe {
  const casesByIdCache = new Map<string, string>() // caseId -> normalized caseType
  let latestSessions: Array<{
    sessionId: string
    caseId: string | null
    completedAtMs: number
    createdAtMs: number
  }> = []
  let latestRatedLobbyIds = new Set<string>()

  const recompute = async () => {
    // Resolve case types for any session whose caseId we haven't cached yet.
    const missingCaseIds = [
      ...new Set(latestSessions.map((s) => s.caseId).filter((id): id is string => !!id)),
    ].filter((id) => !casesByIdCache.has(id))

    if (missingCaseIds.length > 0) {
      await Promise.all(
        missingCaseIds.map(async (caseId) => {
          try {
            const snap = await getDoc(caseDoc(caseId))
            const data = snap.data()
            casesByIdCache.set(caseId, data?.case_type ?? 'General')
          } catch {
            casesByIdCache.set(caseId, 'General') // best-effort; unresolved case falls back to normalizeCaseType's default
          }
        }),
      )
    }

    const candidates: CountedSession[] = latestSessions.map((s) => ({
      sessionId: s.sessionId,
      caseType: normalizeCaseType(s.caseId ? casesByIdCache.get(s.caseId) ?? null : null),
      completedAtMs: s.completedAtMs,
      createdAtMs: s.createdAtMs,
      isRated: latestRatedLobbyIds.has(s.sessionId),
    }))

    onUpdate(buildGoalCountResult(filterCountedSessions(candidates, config)))
  }

  const unsubSessions = onSnapshot(
    query(sessionsCol, where('candidateId', '==', uid), where('status', '==', 'completed')),
    (snap) => {
      latestSessions = snap.docs
        .map((d) => {
          const data = d.data()
          const completedAtMs = data.completedAt?.toMillis() ?? data.updatedAt?.toMillis() ?? null
          if (completedAtMs == null) {
            // No app-level timestamp at all — the client SDK has no access
            // to Firestore's own server-side document-creation time (that's
            // Admin-SDK-only, see the equivalent fallback in
            // app/api/goal-insight/route.ts), so there's no honest date left
            // to fall back to. Excluded rather than counted under a fake one.
            console.warn('[sessionCounts] session missing all timestamps, excluding from goal count', { sessionId: d.id })
            return null
          }
          return {
            sessionId: d.id,
            caseId: data.caseId ?? null,
            completedAtMs,
            createdAtMs: data.createdAt?.toMillis() ?? 0,
          }
        })
        .filter((s): s is NonNullable<typeof s> => s !== null)
      void recompute()
    },
  )

  const unsubEvaluations =
    config.countMode === 'rated'
      ? onSnapshot(query(evaluationsCol, where('candidateId', '==', uid)), (snap) => {
          latestRatedLobbyIds = new Set(
            snap.docs
              .filter((d) => d.data().lobbyId && !d.data().isUnrated)
              .map((d) => d.data().lobbyId as string),
          )
          void recompute()
        })
      : null

  return () => {
    unsubSessions()
    unsubEvaluations?.()
  }
}
