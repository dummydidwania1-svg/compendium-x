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
import { computeStreak, parseISODateLocal, cadenceUnitSingular, daysBetween, type CadenceUnit, type GoalState } from './engine'

export type InsightAxis = 'timestamp' | 'caseType'

/**
 * Which call-to-action the dashboard should offer alongside this insight:
 *   cadencePace / slipTiming  -> "Adjust my goal" (cadence/total/deadline) vs "No, I'll stay the course"
 *   frontBackLoading          -> "Adjust my goal" vs "No, I'll catch up as-is"
 *   perTypeStalling           -> "Practice a [type] case" vs "No, I'll get to it"
 *   practiceNow               -> "Log a case today" (repository) vs "Not right now"
 */
export type InsightDimension = 'cadencePace' | 'frontBackLoading' | 'slipTiming' | 'perTypeStalling' | 'practiceNow'

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
  // Timestamp — situation shapes (dimension varies)
  | 'ts_onboardingNudge'
  | 'ts_endgameCrunch'
  | 'ts_streakCelebration'
  // Case-type — rhythm (dimension: perTypeStalling)
  | 'ct_perTypeSubGoalStalling'
  | 'ct_catchUpTypeSkew'
  | 'ct_untouchedTypeGap'
  | 'ct_partialTypeLag'

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
  /**
   * The finish line the card actually shows: config.totalCases EXCEPT Flow 3,
   * where it's derived from cadence × dates (AdjustGoalPanel quick-adjusts
   * never rewrite the stored field). Detectors that reason about "remaining"
   * must use this, never config.totalCases.
   */
  effectiveTotal: number
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
  // 'more regular' is praise with no lever — the CTA pair has no natural act
  // for it (and streakCelebration owns positive framing now). Only scatter
  // worth fixing qualifies.
  if (ratio < 0.75) return null
  return {
    shapeId: 'ts_frequencyRegularityTrend',
    axis: 'timestamp',
    dimension: 'cadencePace',
    magnitude: Math.min(1, Math.abs(ratio - 1)),
    data: { direction: 'less regular' },
  }
}

/* -------------------------------------------------------------------------- */
/* Dimension: frontBackLoading — clustered early or late within periods?      */
/* -------------------------------------------------------------------------- */

function detectFrontBackLoading({ config, countedSessions, today }: DetectorInput): ShapeCandidate | null {
  // Weeks and months both have a meaningful early/late half; daily periods are
  // a single day, so the split is meaningless there.
  if (config.goalKind !== 'cadence' || (config.recurringUnit !== 'weeks' && config.recurringUnit !== 'months')) return null
  const parsed = parseDateSafe(config.startDate)
  if (!parsed) return null
  const streak = computeStreak(
    countedSessions.map((s) => new Date(s.completedAtMs)),
    { unit: config.recurringUnit as CadenceUnit, every: config.recurringEvery, count: config.recurringCount },
    parsed,
    today,
  )
  if (streak.periodHistory.length < 3) return null
  // Within each hit period, is completion clustered early (first half) or late (second half)?
  let earlyCount = 0
  let lateCount = 0
  for (const period of streak.periodHistory) {
    // Local-midnight parsing (§2): `new Date('YYYY-MM-DD')` would read these
    // as UTC and shift period buckets vs the user's visible card.
    const start = parseISODateLocal(period.periodStart).getTime()
    const end = parseISODateLocal(period.periodEnd).getTime()
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
  // Near-miss already tells the miss story gently ("so close"); positional
  // clustering only adds value when the story ISN'T near-misses.
  const nearMissActive =
    closed.filter((p) => !p.hit && p.actual === p.target - 1).length >= 2 &&
    closed.length >= 3
  if (nearMissActive) return null
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

function detectCatchUpTypeSkew({ countedSessions, currentState, config }: DetectorInput): ShapeCandidate | null {
  if (currentState !== 'behind' && currentState !== 'atRisk') return null
  if (countedSessions.length < MIN_SESSIONS_FOR_TYPE) return null
  const sorted = [...countedSessions].sort((a, b) => a.completedAtMs - b.completedAtMs)
  const recent = sorted.slice(-5)
  const counts = new Map<string, number>()
  for (const s of recent) counts.set(s.caseType, (counts.get(s.caseType) ?? 0) + 1)
  const [topType, topCount] = [...counts.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))
  const share = topCount / recent.length
  if (share < 0.6) return null
  // The CTA deep-links a type to practice — pointing it at topType would send
  // the user deeper into the very skew this shape flags. Aim it at the
  // targeted-but-neglected type when per-type data exists; otherwise the most
  // recently neglected non-skewed practice type.
  let redirectType: string | undefined
  if (config.hasPerType) {
    const doneByType = new Map<string, number>()
    for (const s of countedSessions) doneByType.set(s.caseType, (doneByType.get(s.caseType) ?? 0) + 1)
    const targeted = Object.entries(config.perType).filter(([, t]) => t > 0)
    if (targeted.length > 0) {
      const neglected = targeted
        .map(([type, target]) => ({ type, ratio: (doneByType.get(type) ?? 0) / target }))
        .sort((a, b) => a.ratio - b.ratio)[0]
      if (neglected && neglected.type !== topType) redirectType = neglected.type
    }
  }
  if (!redirectType) {
    const lastPracticed = new Map<string, number>()
    for (const s of sorted) lastPracticed.set(s.caseType, s.completedAtMs)
    const candidates = [...lastPracticed.entries()]
      .filter(([type]) => type !== topType)
      .sort((a, b) => a[1] - b[1])
    redirectType = candidates[0]?.[0]
  }
  return {
    shapeId: 'ct_catchUpTypeSkew',
    axis: 'caseType',
    dimension: 'perTypeStalling',
    magnitude: share,
    data: { type: topType, share: Math.round(share * 100), redirectType },
    targetType: redirectType,
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
/* Situation shapes — the moments the old library went silent                 */
/* -------------------------------------------------------------------------- */

/**
 * Brand-new users (1-4 cases) got `null` from every detector, so their very
 * first "Ask Tracker" clicks read as a broken button. A milestone-framed
 * nudge fills that gap; momentum detectors take over automatically at 5+.
 */
function detectOnboardingNudge({ countedSessions, currentState }: DetectorInput): ShapeCandidate | null {
  const done = countedSessions.length
  if (done < 1 || done > 4) return null
  if (currentState === 'complete' || currentState === 'completeEarly') return null
  return {
    shapeId: 'ts_onboardingNudge',
    axis: 'timestamp',
    dimension: 'practiceNow',
    magnitude: 0.9,
    data: { done, nextMilestone: 5 },
  }
}

/**
 * Deadline crunch: required daily rate now exceeds what the user has actually
 * been managing recently, with meaningful work left and the deadline inside
 * three weeks. This is exactly when "Adjust my goal" (the existing CTA) is
 * genuinely the right advice — and it never had a detector before.
 */
function detectEndgameCrunch({ config, countedSessions, today, effectiveTotal }: DetectorInput): ShapeCandidate | null {
  const done = countedSessions.length
  if (!config.hasEndDate || !effectiveTotal || effectiveTotal <= 0) return null
  if (done >= effectiveTotal) return null // already there — celebrate instead
  const start = parseDateSafe(config.startDate)
  const end = parseDateSafe(config.endDate)
  if (!start || !end) return null
  const daysRemaining = daysBetween(today, end)
  if (daysRemaining <= 0 || daysRemaining > 21) return null
  const remaining = effectiveTotal - done
  const requiredPerDay = remaining / daysRemaining
  const sinceMs = today.getTime() - 14 * 86_400_000
  const recentCount = countedSessions.filter((s) => s.completedAtMs >= sinceMs).length
  const realizedPerDay = recentCount / 14
  if (realizedPerDay >= requiredPerDay) return null // current pace already clears it
  const crunchRatio = requiredPerDay / Math.max(0.25, realizedPerDay)
  if (crunchRatio < 1.5) return null // not dramatic enough to be worth flagging
  return {
    shapeId: 'ts_endgameCrunch',
    axis: 'timestamp',
    dimension: 'cadencePace',
    magnitude: Math.min(1, (crunchRatio - 1) / 2),
    data: {
      daysRemaining,
      remaining,
      requiredPerDay: Math.round(requiredPerDay * 10) / 10,
      realizedPerDay: Math.round(realizedPerDay * 10) / 10,
    },
  }
}

/**
 * Consistency reward. The old library only recognized failure patterns, so
 * the model citizen hitting target every period produced silence. Fires on a
 * live streak of 3+, but ONLY says something when it adds information beyond
 * what StreakDots shows: either this ties/beats their best, or they're one
 * period away from it.
 */
function detectStreakCelebration({ config, countedSessions, today }: DetectorInput): ShapeCandidate | null {
  if (config.goalKind !== 'cadence' || config.recurringCount <= 0) return null
  const start = parseDateSafe(config.startDate)
  if (!start) return null
  const streak = computeStreak(
    countedSessions.map((s) => new Date(s.completedAtMs)),
    { unit: config.recurringUnit as CadenceUnit, every: config.recurringEvery, count: config.recurringCount },
    start,
    today,
  )
  const s = streak.currentStreak
  if (s < 3) return null
  const atBest = s >= streak.bestStreak
  if (!atBest && s < streak.bestStreak - 1) return null
  return {
    shapeId: 'ts_streakCelebration',
    axis: 'timestamp',
    dimension: 'practiceNow',
    magnitude: atBest ? 0.85 : 0.7,
    data: {
      streak: s,
      bestStreak: streak.bestStreak,
      unit: cadenceUnitSingular(config.recurringUnit as CadenceUnit),
      atBest,
    },
  }
}

/**
 * Per-type targets where one type sits below half its proportional progress —
 * badly lagging, not just untouched (absolute zero was the only trigger
 * before, so partial neglect was invisible).
 */
function detectPartialTypeLag({ config, countedSessions }: DetectorInput): ShapeCandidate | null {
  if (!config.hasPerType) return null
  if (countedSessions.length < MIN_SESSIONS_FOR_TYPE) return null
  const doneByType = new Map<string, number>()
  for (const s of countedSessions) doneByType.set(s.caseType, (doneByType.get(s.caseType) ?? 0) + 1)
  const targeted = Object.entries(config.perType).filter(([, t]) => t > 0 && t >= 2)
  if (targeted.length < 2) return null // single-type goals can't 'lag' meaningfully
  const lagging = targeted
    .map(([type, target]) => ({ type, target, done: doneByType.get(type) ?? 0 }))
    .filter(({ done, target }) => done < target / 2)
    .sort((a, b) => a.done / a.target - b.done / b.target)
  if (lagging.length === 0) return null
  const worst = lagging[0]
  return {
    shapeId: 'ct_partialTypeLag',
    axis: 'caseType',
    dimension: 'perTypeStalling',
    magnitude: 1 - worst.done / worst.target,
    data: { type: worst.type, done: worst.done, target: worst.target },
    targetType: worst.type,
  }
}

/* -------------------------------------------------------------------------- */
/* Aggregate entry point                                                      */
/* -------------------------------------------------------------------------- */

const DETECTORS: Array<(input: DetectorInput) => ShapeCandidate | null> = [
  detectOnboardingNudge,
  detectEndgameCrunch,
  detectStreakCelebration,
  detectShortTermMomentum,
  detectLongRunAccelDecel,
  detectFrequencyRegularityTrend,
  detectFrontBackLoading,
  detectNearMissPattern,
  detectSlipTimingPattern,
  detectPerTypeSubGoalStalling,
  detectPartialTypeLag,
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
