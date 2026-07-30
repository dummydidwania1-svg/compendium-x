/**
 * Pure exclusion-filtering logic, split out of sessionCounts.ts so it can be
 * imported by server code (app/api/goal-insight/route.ts) without dragging in
 * the client Firebase SDK. sessionCounts.ts (client-only, live subscriptions)
 * and the API route both call filterCountedSessions with their own
 * independently-fetched candidate lists — no Firebase imports here at all.
 */
import type { GoalConfig } from '@/lib/firebase/schema'
import { parseDMY, startOfDay } from './engine'

export interface CountedSession {
  sessionId: string // lobbyId
  caseType: string
  completedAtMs: number
  createdAtMs: number
  isRated: boolean
}

export interface GoalCountResult {
  countedSessions: CountedSession[]
  done: number
  doneByType: Record<string, number>
}

export type ExclusionConfig = Pick<
  GoalConfig,
  'startDate' | 'countPastCases' | 'countMode' | 'excludedTypes' | 'excludedSessionIds'
>

export function buildGoalCountResult(countedSessions: CountedSession[]): GoalCountResult {
  const doneByType: Record<string, number> = {}
  for (const s of countedSessions) {
    doneByType[s.caseType] = (doneByType[s.caseType] ?? 0) + 1
  }
  return { countedSessions, done: countedSessions.length, doneByType }
}

/**
 * Filters a candidate set of completed sessions down to the counted set per
 * `config`'s exclusions and start-date/countPastCases window. Pure function —
 * this is the single place exclusion semantics live.
 */
export function filterCountedSessions(
  candidates: CountedSession[],
  config: ExclusionConfig,
): CountedSession[] {
  const excludedTypes = new Set(config.excludedTypes)
  const excludedIds = new Set(config.excludedSessionIds)
  const start = parseDMY(config.startDate)
  const startMs = start ? startOfDay(start).getTime() : null

  return candidates.filter((s) => {
    if (excludedTypes.has(s.caseType)) return false
    if (excludedIds.has(s.sessionId)) return false
    if (config.countMode === 'rated' && !s.isRated) return false
    if (!config.countPastCases && startMs != null && s.completedAtMs < startMs) return false
    return true
  })
}
