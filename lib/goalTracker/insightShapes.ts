/**
 * The AI-insight candidate library, restricted to shapes that map onto one
 * of 4 actionable dimensions the goal-tracker UI can hand the user a real
 * call-to-action for (see InsightDimension). Score-correlation and
 * cross-goal-history shapes were dropped: the former duplicated what
 * Feedback Analyser already does with richer qualitative evidence, the
 * latter rarely has enough goalHistory to fire for most users, and neither
 * had a clean "so what do I do about it" action. Session-mode axis is
 * EXCLUDED ENTIRELY per the locked spec — never a candidate, not even as a
 * minor supporting detail.
 *
 * Each detector returns null when the underlying data doesn't clear a
 * minimum data-sufficiency threshold; only shapes that clear threshold
 * become real ShapeCandidates sent to the ranking LLM call.
 *
 * Server-only module — never imported client-side, keeps these formulas
 * (and the raw numbers they reveal) out of the browser bundle.
 */
import 'server-only'
import type { GoalConfig } from '@/lib/firebase/schema'
import type { CountedSession } from './sessionCounts'
import { computeStreak, type CadenceUnit, type GoalState } from './engine'

export type InsightAxis = 'timestamp' | 'caseType'

/**
 * Which call-to-action the dashboard should offer alongside this insight:
 *   cadencePace / slipTiming  -> "Adjust my goal" (cadence/total/deadline) vs "No, I'll stay the course"
 *   frontBackLoading          -> "Adjust my goal" vs "No, I'll catch up as-is"
 *   perTypeStalling           -> "Practice a [type] case" vs "No, I'll get to it"
 */
export type InsightDimension = 'cadencePace' | 'frontBackLoading' | 'slipTiming' | 'perTypeStalling'

export type InsightShapeId =
  // Timestamp — pace trend (dimension: cadencePace)
  | 'ts_shortTermMomentum'
  | 'ts_longRunAccelDecel'
  | 'ts_frequencyRegularityTrend'
  // Timestamp — within-period shape (dimension: frontBackLoading)
  | 'ts_frontBackLoading'
  // Timestamp — rhythm/slip (dimension: slipTiming)
  | 'ts_nearMissPattern'
  | 'ts_slipTimingPattern'
  // Case-type — rhythm (dimension: perTypeStalling)
  | 'ct_perTypeSubGoalStalling'
  | 'ct_catchUpTypeSkew'
  | 'ct_untouchedTypeGap'

export interface ShapeCandidate {
  shapeId: InsightShapeId
  axis: InsightAxis
  dimension: InsightDimension
  /** Statistical strength, used as a ranking tiebreaker. Roughly 0-1. */
  magnitude: number
  /** Real precomputed numbers specific to this shape; schema varies per shapeId. */
  data: Record<string, unknown>
  /** Case type the "perTypeStalling" dimension's CTA should deep-link practice to, if applicable. */
  targetType?: string
}

interface DetectorInput {
  countedSessions: CountedSession[]
  config: GoalConfig
  currentState: GoalState
  today: Date
}

/* -------------------------------------------------------------------------- */
/* Small shared helpers                                                       */
/* -------------------------------------------------------------------------- */

const MIN_SESSIONS_FOR_TYPE = 6

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}

function stddev(nums: number[]): number {
  if (nums.length < 2) return 0
  const m = mean(nums)
  return Math.sqrt(mean(nums.map((n) => (n - m) ** 2)))
}

function parseDateSafe(dmy: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dmy.trim())
  if (!m) return null
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  d.setHours(0, 0, 0, 0)
  return d
}

/* -------------------------------------------------------------------------- */
/* Dimension: cadencePace — is the user's practice rate trending down?        */
/* -------------------------------------------------------------------------- */

function detectShortTermMomentum({ countedSessions, today }: DetectorInput): ShapeCandidate | null {
  if (countedSessions.length < 5) return null
  const last3DaysMs = today.getTime() - 3 * 86_400_000
  const priorWindowMs = today.getTime() - 14 * 86_400_000
  const recentCount = countedSessions.filter((s) => s.completedAtMs >= last3DaysMs).length
  const priorCount = countedSessions.filter(
    (s) => s.completedAtMs >= priorWindowMs && s.completedAtMs < last3DaysMs,
  ).length
  const priorDailyRate = priorCount / 11
  const recentDailyRate = recentCount / 3
  if (priorDailyRate === 0 && recentDailyRate === 0) return null
  const delta = recentDailyRate - priorDailyRate
  const magnitude = Math.min(1, Math.abs(delta) / Math.max(0.5, priorDailyRate))
  if (magnitude < 0.3) return null
  return {
    shapeId: 'ts_shortTermMomentum',
    axis: 'timestamp',
    dimension: 'cadencePace',
    magnitude,
    data: { direction: delta > 0 ? 'up' : 'down', recentDailyRate, priorDailyRate },
  }
}

function detectLongRunAccelDecel({ countedSessions }: DetectorInput): ShapeCandidate | null {
  if (countedSessions.length < 10) return null
  const sorted = [...countedSessions].sort((a, b) => a.completedAtMs - b.completedAtMs)
  const half = Math.floor(sorted.length / 2)
  const firstHalfSpanDays = Math.max(1, (sorted[half - 1].completedAtMs - sorted[0].completedAtMs) / 86_400_000)
  const secondHalfSpanDays = Math.max(
    1,
    (sorted[sorted.length - 1].completedAtMs - sorted[half].completedAtMs) / 86_400_000,
  )
  const firstRate = half / firstHalfSpanDays
  const secondRate = (sorted.length - half) / secondHalfSpanDays
  if (firstRate === 0) return null
  const ratio = secondRate / firstRate
  if (ratio > 0.7 && ratio < 1.4) return null // no meaningful accel/decel
  return {
    shapeId: 'ts_longRunAccelDecel',
    axis: 'timestamp',
    dimension: 'cadencePace',
    magnitude: Math.min(1, Math.abs(ratio - 1)),
    data: { direction: ratio > 1 ? 'accelerating' : 'decelerating', ratio: Math.round(ratio * 100) / 100 },
  }
}

function detectFrequencyRegularityTrend({ countedSessions }: DetectorInput): ShapeCandidate | null {
  if (countedSessions.length < 10) return null
  const sorted = [...countedSessions].sort((a, b) => a.completedAtMs - b.completedAtMs)
  const gaps = sorted.slice(1).map((s, i) => (s.completedAtMs - sorted[i].completedAtMs) / 86_400_000)
  const half = Math.floor(gaps.length / 2)
  const firstHalfStd = stddev(gaps.slice(0, half))
  const secondHalfStd = stddev(gaps.slice(half))
  if (firstHalfStd === 0) return null
  const ratio = secondHalfStd / firstHalfStd
  if (ratio > 0.75 && ratio < 1.35) return null
  return {
    shapeId: 'ts_frequencyRegularityTrend',
    axis: 'timestamp',
    dimension: 'cadencePace',
    magnitude: Math.min(1, Math.abs(ratio - 1)),
    data: { direction: ratio < 1 ? 'more regular' : 'less regular' },
  }
}

/* -------------------------------------------------------------------------- */
/* Dimension: frontBackLoading — clustered early or late within periods?      */
/* -------------------------------------------------------------------------- */

function detectFrontBackLoading({ config, countedSessions, today }: DetectorInput): ShapeCandidate | null {
  if (config.goalKind !== 'cadence' || config.recurringUnit !== 'weeks') return null
  const parsed = parseDateSafe(config.startDate)
  if (!parsed) return null
  const streak = computeStreak(
    countedSessions.map((s) => new Date(s.completedAtMs)),
    { unit: 'weeks', every: config.recurringEvery, count: config.recurringCount },
    parsed,
    today,
  )
  if (streak.periodHistory.length < 3) return null
  // Within each hit period, is completion clustered early (first half) or late (second half)?
  let earlyCount = 0
  let lateCount = 0
  for (const period of streak.periodHistory) {
    const start = new Date(period.periodStart).getTime()
    const end = new Date(period.periodEnd).getTime()
    const mid = start + (end - start) / 2
    for (const s of countedSessions) {
      if (s.completedAtMs >= start && s.completedAtMs < end) {
        if (s.completedAtMs < mid) earlyCount += 1
        else lateCount += 1
      }
    }
  }
  const total = earlyCount + lateCount
  if (total < 6) return null
  const earlyShare = earlyCount / total
  if (earlyShare > 0.35 && earlyShare < 0.65) return null
  return {
    shapeId: 'ts_frontBackLoading',
    axis: 'timestamp',
    dimension: 'frontBackLoading',
    magnitude: Math.abs(earlyShare - 0.5) * 2,
    data: { pattern: earlyShare > 0.5 ? 'front-loaded' : 'back-loaded', earlyShare: Math.round(earlyShare * 100) },
  }
}

/* -------------------------------------------------------------------------- */
/* Dimension: slipTiming — do misses cluster near-miss or at a repeat point?  */
/* -------------------------------------------------------------------------- */

function detectNearMissPattern({ config, countedSessions, today }: DetectorInput): ShapeCandidate | null {
  if (config.goalKind !== 'cadence' || config.recurringCount <= 0) return null
  const parsed = parseDateSafe(config.startDate)
  if (!parsed) return null
  const streak = computeStreak(
    countedSessions.map((s) => new Date(s.completedAtMs)),
    { unit: config.recurringUnit as CadenceUnit, every: config.recurringEvery, count: config.recurringCount },
    parsed,
    today,
  )
  const closed = streak.periodHistory
  if (closed.length < 3) return null
  const nearMisses = closed.filter((p) => !p.hit && p.actual === p.target - 1).length
  const hitCount = closed.filter((p) => p.hit).length
  if (nearMisses < 2 || hitCount === closed.length) return null
  const shareNearMiss = nearMisses / closed.length
  if (shareNearMiss < 0.25) return null
  return {
    shapeId: 'ts_nearMissPattern',
    axis: 'timestamp',
    dimension: 'slipTiming',
    magnitude: shareNearMiss,
    data: { nearMisses, totalPeriods: closed.length, target: config.recurringCount },
  }
}

function detectSlipTimingPattern({ config, countedSessions, today }: DetectorInput): ShapeCandidate | null {
  if (config.goalKind !== 'cadence' || config.recurringCount <= 0) return null
  const parsed = parseDateSafe(config.startDate)
  if (!parsed) return null
  const streak = computeStreak(
    countedSessions.map((s) => new Date(s.completedAtMs)),
    { unit: config.recurringUnit as CadenceUnit, every: config.recurringEvery, count: config.recurringCount },
    parsed,
    today,
  )
  const closed = streak.periodHistory
  if (closed.length < 4) return null
  const missIndices = closed.map((p, i) => (!p.hit ? i : -1)).filter((i) => i >= 0)
  if (missIndices.length < 2) return null
  const missMean = mean(missIndices)
  const missStd = stddev(missIndices)
  // Low spread relative to the period count means misses cluster at a specific point.
  if (missStd / closed.length > 0.3) return null
  return {
    shapeId: 'ts_slipTimingPattern',
    axis: 'timestamp',
    dimension: 'slipTiming',
    magnitude: Math.min(1, 1 - missStd / closed.length),
    data: { typicalSlipPeriodIndex: Math.round(missMean), totalPeriods: closed.length },
  }
}

/* -------------------------------------------------------------------------- */
/* Dimension: perTypeStalling — is a specific case type being neglected?      */
/* -------------------------------------------------------------------------- */

function detectPerTypeSubGoalStalling({ config, countedSessions }: DetectorInput): ShapeCandidate | null {
  if (!config.hasPerType) return null
  const doneByType = new Map<string, number>()
  for (const s of countedSessions) doneByType.set(s.caseType, (doneByType.get(s.caseType) ?? 0) + 1)
  const entries = Object.entries(config.perType).filter(([, target]) => target > 0)
  const stalled = entries.find(([type, target]) => {
    const done = doneByType.get(type) ?? 0
    return done === 0 && target > 0
  })
  const activeCount = entries.filter(([type]) => (doneByType.get(type) ?? 0) > 0).length
  if (!stalled || activeCount === 0) return null
  return {
    shapeId: 'ct_perTypeSubGoalStalling',
    axis: 'caseType',
    dimension: 'perTypeStalling',
    magnitude: 0.7,
    data: { stalledType: stalled[0], target: stalled[1] },
    targetType: stalled[0],
  }
}

function detectCatchUpTypeSkew({ countedSessions, currentState }: DetectorInput): ShapeCandidate | null {
  if (currentState !== 'behind' && currentState !== 'atRisk') return null
  if (countedSessions.length < MIN_SESSIONS_FOR_TYPE) return null
  const sorted = [...countedSessions].sort((a, b) => a.completedAtMs - b.completedAtMs)
  const recent = sorted.slice(-5)
  const counts = new Map<string, number>()
  for (const s of recent) counts.set(s.caseType, (counts.get(s.caseType) ?? 0) + 1)
  const [topType, topCount] = [...counts.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))
  const share = topCount / recent.length
  if (share < 0.6) return null
  return {
    shapeId: 'ct_catchUpTypeSkew',
    axis: 'caseType',
    dimension: 'perTypeStalling',
    magnitude: share,
    data: { type: topType, share: Math.round(share * 100) },
    targetType: topType,
  }
}

function detectUntouchedTypeGap({ countedSessions, config }: DetectorInput): ShapeCandidate | null {
  if (countedSessions.length < MIN_SESSIONS_FOR_TYPE) return null
  const allTypes = Object.keys(config.perType).length > 0 ? Object.keys(config.perType) : null
  if (!allTypes || allTypes.length < 2) return null
  const touched = new Set(countedSessions.map((s) => s.caseType))
  const untouched = allTypes.filter((t) => !touched.has(t))
  if (untouched.length === 0) return null
  return {
    shapeId: 'ct_untouchedTypeGap',
    axis: 'caseType',
    dimension: 'perTypeStalling',
    magnitude: untouched.length / allTypes.length,
    data: { untouchedTypes: untouched },
    targetType: untouched[0],
  }
}

/* -------------------------------------------------------------------------- */
/* Aggregate entry point                                                      */
/* -------------------------------------------------------------------------- */

const DETECTORS: Array<(input: DetectorInput) => ShapeCandidate | null> = [
  detectShortTermMomentum,
  detectLongRunAccelDecel,
  detectFrequencyRegularityTrend,
  detectFrontBackLoading,
  detectNearMissPattern,
  detectSlipTimingPattern,
  detectPerTypeSubGoalStalling,
  detectCatchUpTypeSkew,
  detectUntouchedTypeGap,
]

/**
 * Runs all shape detectors, returning only candidates that clear their own
 * data-sufficiency threshold. Session-mode axis is never evaluated (no
 * detector reads sessionMode) per the locked exclusion.
 */
export function computeShapeCandidates(input: DetectorInput): ShapeCandidate[] {
  const results: ShapeCandidate[] = []
  for (const detect of DETECTORS) {
    const candidate = detect(input)
    if (candidate) results.push(candidate)
  }
  return results
}

export type { DetectorInput }
