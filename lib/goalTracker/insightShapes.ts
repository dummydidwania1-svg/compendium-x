/**
 * The 25-shape AI-insight candidate library, across the 4 in-scope axes
 * (timestamp, case-type, cross-goal, scores). Session-mode axis is EXCLUDED
 * ENTIRELY per the locked spec — never a candidate, not even as a minor
 * supporting detail.
 *
 * Every score-based shape is framed as a correlation with pursuit behavior
 * (pace/timing/rhythm/type mix), never a standalone performance read — that
 * stays exclusively Coach's/Analyser's job. Each detector returns null when
 * the underlying data doesn't clear a minimum data-sufficiency threshold;
 * only shapes that clear threshold become real ShapeCandidates sent to the
 * ranking LLM call.
 *
 * Server-only module — never imported client-side, keeps these formulas
 * (and the raw numbers they reveal) out of the browser bundle.
 */
import 'server-only'
import type { GoalConfig, GoalHistoryEntry } from '@/lib/firebase/schema'
import type { CountedSession } from './sessionCounts'
import { computeStreak, type CadenceUnit, type GoalState } from './engine'

export type InsightAxis = 'timestamp' | 'caseType' | 'crossGoal' | 'score'

export type InsightShapeId =
  // Timestamp — clustering
  | 'ts_dayOfWeekCluster'
  | 'ts_timeOfDayCluster'
  | 'ts_batchingVsSpacing'
  // Timestamp — trend
  | 'ts_shortTermMomentum'
  | 'ts_longRunAccelDecel'
  | 'ts_frequencyRegularityTrend'
  // Timestamp — rhythm
  | 'ts_nearMissPattern'
  | 'ts_slipTimingPattern'
  | 'ts_recoveryAfterMiss'
  | 'ts_frontBackLoading'
  // Case-type — clustering
  | 'ct_overallConcentration'
  | 'ct_typePairClustering'
  | 'ct_untouchedTypeGap'
  | 'ct_difficultyMixClustering'
  // Case-type — trend
  | 'ct_broadeningNarrowingTrend'
  | 'ct_difficultyEscalationTrend'
  | 'ct_noveltyTrend'
  // Case-type — rhythm
  | 'ct_perTypeSubGoalStalling'
  | 'ct_typeRotationVsCadence'
  | 'ct_catchUpTypeSkew'
  // Cross-goal
  | 'xg_startStrongFadeLater'
  | 'xg_completionRateHistory'
  | 'xg_preferredGoalShape'
  | 'xg_recurringSlipPoint'
  // Scores (always pursuit-correlated, never standalone)
  | 'sc_paceVsScoreTrend'
  | 'sc_volumeVsScoreTrend'
  | 'sc_consistencyVsScoreTrend'
  | 'sc_scoreByTimingCluster'
  | 'sc_scoreByTypeCluster'
  | 'sc_scoreByCadencePositionCluster'
  | 'sc_postMissScorePattern'
  | 'sc_streakLengthVsScorePattern'
  | 'sc_endOfPeriodRushVsScorePattern'

export interface ShapeCandidate {
  shapeId: InsightShapeId
  axis: InsightAxis
  /** Statistical strength, used as a ranking tiebreaker. Roughly 0-1. */
  magnitude: number
  /** Real precomputed numbers specific to this shape; schema varies per shapeId. */
  data: Record<string, unknown>
}

export interface EvaluationScoreRow {
  lobbyId: string | null
  createdAtMs: number
  structureScore: number | null
  understandingScore: number | null
  deliveryScore: number | null
  creativityScore: number | null
}

interface DetectorInput {
  countedSessions: CountedSession[]
  evaluations: EvaluationScoreRow[]
  goalHistory: GoalHistoryEntry[]
  config: GoalConfig
  currentState: GoalState
  today: Date
}

/* -------------------------------------------------------------------------- */
/* Small shared helpers                                                       */
/* -------------------------------------------------------------------------- */

const MIN_SESSIONS_FOR_TIMING = 8
const MIN_SESSIONS_FOR_TYPE = 6
const MIN_SESSIONS_FOR_SCORE = 6

function dayOfWeek(ms: number): number {
  return new Date(ms).getDay()
}

function hourOfDay(ms: number): number {
  return new Date(ms).getHours()
}

function overallScore(row: EvaluationScoreRow): number | null {
  const scores = [row.structureScore, row.understandingScore, row.deliveryScore, row.creativityScore].filter(
    (s): s is number => s != null,
  )
  if (scores.length === 0) return null
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
}

function stddev(nums: number[]): number {
  if (nums.length < 2) return 0
  const m = mean(nums)
  return Math.sqrt(mean(nums.map((n) => (n - m) ** 2)))
}

/** Joins a counted session to its evaluation score row by sessionId (lobbyId), if present. */
function scoreFor(session: CountedSession, evaluations: EvaluationScoreRow[]): number | null {
  const row = evaluations.find((e) => e.lobbyId === session.sessionId)
  return row ? overallScore(row) : null
}

/* -------------------------------------------------------------------------- */
/* Timestamp axis                                                             */
/* -------------------------------------------------------------------------- */

function detectDayOfWeekCluster({ countedSessions }: DetectorInput): ShapeCandidate | null {
  if (countedSessions.length < MIN_SESSIONS_FOR_TIMING) return null
  const counts = new Array(7).fill(0)
  for (const s of countedSessions) counts[dayOfWeek(s.completedAtMs)] += 1
  const maxCount = Math.max(...counts)
  const maxDay = counts.indexOf(maxCount)
  const share = maxCount / countedSessions.length
  if (share < 0.4) return null // not a real cluster, roughly evenly spread
  return {
    shapeId: 'ts_dayOfWeekCluster',
    axis: 'timestamp',
    magnitude: share,
    data: { dayOfWeek: maxDay, share: Math.round(share * 100), sampleSize: countedSessions.length },
  }
}

function detectTimeOfDayCluster({ countedSessions }: DetectorInput): ShapeCandidate | null {
  if (countedSessions.length < MIN_SESSIONS_FOR_TIMING) return null
  const buckets = { morning: 0, afternoon: 0, evening: 0, night: 0 }
  for (const s of countedSessions) {
    const h = hourOfDay(s.completedAtMs)
    if (h >= 5 && h < 12) buckets.morning += 1
    else if (h >= 12 && h < 17) buckets.afternoon += 1
    else if (h >= 17 && h < 22) buckets.evening += 1
    else buckets.night += 1
  }
  const entries = Object.entries(buckets)
  const [topBucket, topCount] = entries.reduce((a, b) => (b[1] > a[1] ? b : a))
  const share = topCount / countedSessions.length
  if (share < 0.45) return null
  return {
    shapeId: 'ts_timeOfDayCluster',
    axis: 'timestamp',
    magnitude: share,
    data: { bucket: topBucket, share: Math.round(share * 100) },
  }
}

function detectBatchingVsSpacing({ countedSessions }: DetectorInput): ShapeCandidate | null {
  if (countedSessions.length < MIN_SESSIONS_FOR_TIMING) return null
  const sorted = [...countedSessions].sort((a, b) => a.completedAtMs - b.completedAtMs)
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i += 1) {
    gaps.push((sorted[i].completedAtMs - sorted[i - 1].completedAtMs) / 86_400_000)
  }
  if (gaps.length < 4) return null
  const gapStd = stddev(gaps)
  const gapMean = mean(gaps)
  if (gapMean === 0) return null
  const coefficientOfVariation = gapStd / gapMean
  // High CoV = bursty/batching; low CoV = evenly spaced. Only surface if clearly one or the other.
  if (coefficientOfVariation < 0.6 && coefficientOfVariation > 0.35) return null
  const pattern = coefficientOfVariation >= 0.6 ? 'batching' : 'spacing'
  return {
    shapeId: 'ts_batchingVsSpacing',
    axis: 'timestamp',
    magnitude: Math.min(1, coefficientOfVariation),
    data: { pattern, avgGapDays: Math.round(gapMean * 10) / 10 },
  }
}

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
    magnitude: Math.min(1, Math.abs(ratio - 1)),
    data: { direction: ratio < 1 ? 'more regular' : 'less regular' },
  }
}

function detectNearMissPattern({ config, countedSessions, today }: DetectorInput): ShapeCandidate | null {
  if (config.goalKind !== 'cadence' || config.recurringCount <= 0) return null
  const start = config.startDate
  const parsed = parseDateSafe(start)
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
    magnitude: Math.min(1, 1 - missStd / closed.length),
    data: { typicalSlipPeriodIndex: Math.round(missMean), totalPeriods: closed.length },
  }
}

function detectRecoveryAfterMiss({ config, countedSessions, today }: DetectorInput): ShapeCandidate | null {
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
  let recoveries = 0
  let missesFollowedByAnother = 0
  for (let i = 0; i < closed.length - 1; i += 1) {
    if (!closed[i].hit) {
      if (closed[i + 1].hit) recoveries += 1
      else missesFollowedByAnother += 1
    }
  }
  const totalMissesWithFollow = recoveries + missesFollowedByAnother
  if (totalMissesWithFollow < 2) return null
  const recoveryRate = recoveries / totalMissesWithFollow
  if (recoveryRate < 0.65) return null
  return {
    shapeId: 'ts_recoveryAfterMiss',
    axis: 'timestamp',
    magnitude: recoveryRate,
    data: { recoveryRate: Math.round(recoveryRate * 100) },
  }
}

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
    magnitude: Math.abs(earlyShare - 0.5) * 2,
    data: { pattern: earlyShare > 0.5 ? 'front-loaded' : 'back-loaded', earlyShare: Math.round(earlyShare * 100) },
  }
}

/* -------------------------------------------------------------------------- */
/* Case-type axis                                                             */
/* -------------------------------------------------------------------------- */

function detectOverallConcentration({ countedSessions }: DetectorInput): ShapeCandidate | null {
  if (countedSessions.length < MIN_SESSIONS_FOR_TYPE) return null
  const counts = new Map<string, number>()
  for (const s of countedSessions) counts.set(s.caseType, (counts.get(s.caseType) ?? 0) + 1)
  const [topType, topCount] = [...counts.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))
  const share = topCount / countedSessions.length
  if (share < 0.5) return null
  return {
    shapeId: 'ct_overallConcentration',
    axis: 'caseType',
    magnitude: share,
    data: { type: topType, share: Math.round(share * 100) },
  }
}

function detectTypePairClustering({ countedSessions }: DetectorInput): ShapeCandidate | null {
  if (countedSessions.length < MIN_SESSIONS_FOR_TYPE) return null
  const counts = new Map<string, number>()
  for (const s of countedSessions) counts.set(s.caseType, (counts.get(s.caseType) ?? 0) + 1)
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1])
  if (sorted.length < 2) return null
  const topTwoShare = (sorted[0][1] + sorted[1][1]) / countedSessions.length
  if (topTwoShare < 0.75) return null
  return {
    shapeId: 'ct_typePairClustering',
    axis: 'caseType',
    magnitude: topTwoShare,
    data: { types: [sorted[0][0], sorted[1][0]], share: Math.round(topTwoShare * 100) },
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
    magnitude: untouched.length / allTypes.length,
    data: { untouchedTypes: untouched },
  }
}

function detectDifficultyMixClustering(): ShapeCandidate | null {
  // Difficulty isn't tracked on CountedSession (session-level, no case-difficulty
  // join in this module's scope) — left as a documented no-op candidate.
  return null
}

function detectBroadeningNarrowingTrend({ countedSessions }: DetectorInput): ShapeCandidate | null {
  if (countedSessions.length < 10) return null
  const sorted = [...countedSessions].sort((a, b) => a.completedAtMs - b.completedAtMs)
  const half = Math.floor(sorted.length / 2)
  const firstHalfTypes = new Set(sorted.slice(0, half).map((s) => s.caseType)).size
  const secondHalfTypes = new Set(sorted.slice(half).map((s) => s.caseType)).size
  if (firstHalfTypes === secondHalfTypes) return null
  return {
    shapeId: 'ct_broadeningNarrowingTrend',
    axis: 'caseType',
    magnitude: Math.min(1, Math.abs(firstHalfTypes - secondHalfTypes) / Math.max(firstHalfTypes, secondHalfTypes)),
    data: { direction: secondHalfTypes > firstHalfTypes ? 'broadening' : 'narrowing' },
  }
}

function detectDifficultyEscalationTrend(): ShapeCandidate | null {
  return null // requires case-difficulty join, out of this module's current data scope
}

function detectNoveltyTrend({ countedSessions }: DetectorInput): ShapeCandidate | null {
  if (countedSessions.length < 10) return null
  const sorted = [...countedSessions].sort((a, b) => a.completedAtMs - b.completedAtMs)
  const seen = new Set<string>()
  const firstNewTypeIndices: number[] = []
  sorted.forEach((s, i) => {
    if (!seen.has(s.caseType)) {
      seen.add(s.caseType)
      firstNewTypeIndices.push(i)
    }
  })
  if (firstNewTypeIndices.length < 2) return null
  const half = Math.floor(sorted.length / 2)
  const noveltyInFirstHalf = firstNewTypeIndices.filter((i) => i < half).length
  const noveltyShare = noveltyInFirstHalf / firstNewTypeIndices.length
  if (noveltyShare < 0.7) return null
  return {
    shapeId: 'ct_noveltyTrend',
    axis: 'caseType',
    magnitude: noveltyShare,
    data: { newTypesTriedEarly: noveltyInFirstHalf, totalNewTypes: firstNewTypeIndices.length },
  }
}

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
    magnitude: 0.7,
    data: { stalledType: stalled[0], target: stalled[1] },
  }
}

function detectTypeRotationVsCadence({ config, countedSessions, today }: DetectorInput): ShapeCandidate | null {
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
  const typesPerPeriod = streak.periodHistory.map((period) => {
    const start = new Date(period.periodStart).getTime()
    const end = new Date(period.periodEnd).getTime()
    const types = new Set(
      countedSessions.filter((s) => s.completedAtMs >= start && s.completedAtMs < end).map((s) => s.caseType),
    )
    return types.size
  })
  const avgTypesPerPeriod = mean(typesPerPeriod)
  if (avgTypesPerPeriod === 0) return null
  const pattern = avgTypesPerPeriod >= 1.6 ? 'rotates' : 'repeats'
  return {
    shapeId: 'ct_typeRotationVsCadence',
    axis: 'caseType',
    magnitude: Math.min(1, Math.abs(avgTypesPerPeriod - 1)),
    data: { pattern, avgTypesPerPeriod: Math.round(avgTypesPerPeriod * 10) / 10 },
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
    magnitude: share,
    data: { type: topType, share: Math.round(share * 100) },
  }
}

/* -------------------------------------------------------------------------- */
/* Cross-goal axis (requires goalHistory — often empty for newer users)      */
/* -------------------------------------------------------------------------- */

function detectStartStrongFadeLater({ goalHistory }: DetectorInput): ShapeCandidate | null {
  if (goalHistory.length < 2) return null
  const fadedCount = goalHistory.filter((h) => !h.completed && h.finalDone > 0).length
  const share = fadedCount / goalHistory.length
  if (share < 0.5) return null
  return {
    shapeId: 'xg_startStrongFadeLater',
    axis: 'crossGoal',
    magnitude: share,
    data: { fadedGoals: fadedCount, totalGoals: goalHistory.length },
  }
}

function detectCompletionRateHistory({ goalHistory }: DetectorInput): ShapeCandidate | null {
  if (goalHistory.length < 3) return null
  const completedCount = goalHistory.filter((h) => h.completed).length
  const rate = completedCount / goalHistory.length
  return {
    shapeId: 'xg_completionRateHistory',
    axis: 'crossGoal',
    magnitude: 0.5, // moderate baseline confidence — this is a track-record fact, not a strength signal
    data: { completedCount, totalGoals: goalHistory.length, rate: Math.round(rate * 100) },
  }
}

function detectPreferredGoalShape({ goalHistory }: DetectorInput): ShapeCandidate | null {
  if (goalHistory.length < 3) return null
  const cadenceGoals = goalHistory.filter((h) => h.config.goalKind === 'cadence')
  const flatGoals = goalHistory.filter((h) => h.config.goalKind === 'flat')
  if (cadenceGoals.length < 1 || flatGoals.length < 1) return null
  const cadenceRate = cadenceGoals.filter((h) => h.completed).length / cadenceGoals.length
  const flatRate = flatGoals.filter((h) => h.completed).length / flatGoals.length
  const diff = Math.abs(cadenceRate - flatRate)
  if (diff < 0.25) return null
  return {
    shapeId: 'xg_preferredGoalShape',
    axis: 'crossGoal',
    magnitude: diff,
    data: { betterShape: cadenceRate > flatRate ? 'cadence' : 'flat' },
  }
}

function detectRecurringSlipPoint({ goalHistory }: DetectorInput): ShapeCandidate | null {
  const withFellShort = goalHistory.filter((h) => !h.completed && h.fellShortBy != null)
  if (withFellShort.length < 2) return null
  const shortfalls = withFellShort.map((h) => (h.fellShortBy ?? 0) / Math.max(1, h.config.totalCases))
  const avgShortfall = mean(shortfalls)
  const shortfallStd = stddev(shortfalls)
  if (shortfallStd / Math.max(0.01, avgShortfall) > 0.5) return null // too inconsistent to call a pattern
  return {
    shapeId: 'xg_recurringSlipPoint',
    axis: 'crossGoal',
    magnitude: Math.min(1, avgShortfall),
    data: { avgShortfallPercent: Math.round(avgShortfall * 100), occurrences: withFellShort.length },
  }
}

/* -------------------------------------------------------------------------- */
/* Scores axis — always pursuit-correlated, never standalone                 */
/* -------------------------------------------------------------------------- */

function detectPaceVsScoreTrend({ countedSessions, evaluations, currentState }: DetectorInput): ShapeCandidate | null {
  if (evaluations.length < MIN_SESSIONS_FOR_SCORE) return null
  const isCatchUpState = currentState === 'behind' || currentState === 'atRisk' || currentState === 'slightlyBehind'
  const sorted = [...countedSessions].sort((a, b) => a.completedAtMs - b.completedAtMs)
  const withScores = sorted
    .map((s) => ({ score: scoreFor(s, evaluations), s }))
    .filter((r): r is { score: number; s: CountedSession } => r.score != null)
  if (withScores.length < MIN_SESSIONS_FOR_SCORE) return null
  const half = Math.floor(withScores.length / 2)
  const firstHalfAvg = mean(withScores.slice(0, half).map((r) => r.score))
  const secondHalfAvg = mean(withScores.slice(half).map((r) => r.score))
  const delta = secondHalfAvg - firstHalfAvg
  if (Math.abs(delta) < 0.3) return null
  if (!isCatchUpState && delta >= 0) return null // only surface the "cramming hurts scores" framing when relevant
  return {
    shapeId: 'sc_paceVsScoreTrend',
    axis: 'score',
    magnitude: Math.min(1, Math.abs(delta) / 2),
    data: { direction: delta < 0 ? 'dips when rushing' : 'holds steady', delta: Math.round(delta * 100) / 100 },
  }
}

function detectVolumeVsScoreTrend({ countedSessions, evaluations }: DetectorInput): ShapeCandidate | null {
  if (evaluations.length < MIN_SESSIONS_FOR_SCORE || countedSessions.length < 10) return null
  const sorted = [...countedSessions].sort((a, b) => a.completedAtMs - b.completedAtMs)
  const half = Math.floor(sorted.length / 2)
  const firstHalfSpanDays = Math.max(1, (sorted[half - 1].completedAtMs - sorted[0].completedAtMs) / 86_400_000)
  const secondHalfSpanDays = Math.max(
    1,
    (sorted[sorted.length - 1].completedAtMs - sorted[half].completedAtMs) / 86_400_000,
  )
  const firstRate = half / firstHalfSpanDays
  const secondRate = (sorted.length - half) / secondHalfSpanDays
  if (secondRate <= firstRate * 1.15) return null // volume must have genuinely increased
  const firstScores = sorted
    .slice(0, half)
    .map((s) => scoreFor(s, evaluations))
    .filter((n): n is number => n != null)
  const secondScores = sorted
    .slice(half)
    .map((s) => scoreFor(s, evaluations))
    .filter((n): n is number => n != null)
  if (firstScores.length < 3 || secondScores.length < 3) return null
  const scoreDelta = Math.abs(mean(secondScores) - mean(firstScores))
  if (scoreDelta > 0.4) return null // scores must have held steady despite the volume jump
  return {
    shapeId: 'sc_volumeVsScoreTrend',
    axis: 'score',
    magnitude: Math.min(1, (secondRate - firstRate) / Math.max(0.1, firstRate)),
    data: { volumeIncreasePercent: Math.round(((secondRate - firstRate) / firstRate) * 100) },
  }
}

function detectConsistencyVsScoreTrend({ countedSessions, evaluations }: DetectorInput): ShapeCandidate | null {
  if (evaluations.length < 10) return null
  const sorted = [...countedSessions].sort((a, b) => a.completedAtMs - b.completedAtMs)
  const gaps = sorted.slice(1).map((s, i) => (s.completedAtMs - sorted[i].completedAtMs) / 86_400_000)
  if (gaps.length < 8) return null
  // Find the most consistent (lowest local gap variance) contiguous stretch of ~5 sessions.
  const windowSize = 5
  let bestWindowStart = 0
  let bestWindowStd = Infinity
  for (let i = 0; i <= gaps.length - windowSize; i += 1) {
    const windowStd = stddev(gaps.slice(i, i + windowSize))
    if (windowStd < bestWindowStd) {
      bestWindowStd = windowStd
      bestWindowStart = i
    }
  }
  const windowSessions = sorted.slice(bestWindowStart, bestWindowStart + windowSize + 1)
  const windowScores = windowSessions.map((s) => scoreFor(s, evaluations)).filter((n): n is number => n != null)
  const restScores = sorted
    .filter((s) => !windowSessions.includes(s))
    .map((s) => scoreFor(s, evaluations))
    .filter((n): n is number => n != null)
  if (windowScores.length < 3 || restScores.length < 3) return null
  const windowAvg = mean(windowScores)
  const restAvg = mean(restScores)
  if (windowAvg - restAvg < 0.3) return null
  return {
    shapeId: 'sc_consistencyVsScoreTrend',
    axis: 'score',
    magnitude: Math.min(1, (windowAvg - restAvg) / 1.5),
    data: { consistentStretchAvg: Math.round(windowAvg * 10) / 10, restAvg: Math.round(restAvg * 10) / 10 },
  }
}

function detectScoreByTimingCluster({ countedSessions, evaluations }: DetectorInput): ShapeCandidate | null {
  if (evaluations.length < MIN_SESSIONS_FOR_SCORE) return null
  const withScores = countedSessions
    .map((s) => ({ score: scoreFor(s, evaluations), hour: hourOfDay(s.completedAtMs) }))
    .filter((r): r is { score: number; hour: number } => r.score != null)
  if (withScores.length < MIN_SESSIONS_FOR_SCORE) return null
  const morning = withScores.filter((r) => r.hour < 12).map((r) => r.score)
  const evening = withScores.filter((r) => r.hour >= 17).map((r) => r.score)
  if (morning.length < 3 || evening.length < 3) return null
  const delta = mean(morning) - mean(evening)
  if (Math.abs(delta) < 0.35) return null
  return {
    shapeId: 'sc_scoreByTimingCluster',
    axis: 'score',
    magnitude: Math.min(1, Math.abs(delta) / 1.5),
    data: { strongerPeriod: delta > 0 ? 'morning' : 'evening' },
  }
}

function detectScoreByTypeCluster({ countedSessions, evaluations }: DetectorInput): ShapeCandidate | null {
  if (evaluations.length < MIN_SESSIONS_FOR_SCORE) return null
  const counts = new Map<string, number>()
  for (const s of countedSessions) counts.set(s.caseType, (counts.get(s.caseType) ?? 0) + 1)
  if (counts.size === 0) return null
  const [mostPracticedType] = [...counts.entries()].reduce((a, b) => (b[1] > a[1] ? b : a))
  const withType = countedSessions
    .map((s) => ({ score: scoreFor(s, evaluations), type: s.caseType }))
    .filter((r): r is { score: number; type: string } => r.score != null)
  const mostPracticedScores = withType.filter((r) => r.type === mostPracticedType).map((r) => r.score)
  const otherScores = withType.filter((r) => r.type !== mostPracticedType).map((r) => r.score)
  if (mostPracticedScores.length < 3 || otherScores.length < 3) return null
  const delta = mean(mostPracticedScores) - mean(otherScores)
  if (delta < 0.3) return null // only surface the "practice pays off" framing, not a deficit read
  return {
    shapeId: 'sc_scoreByTypeCluster',
    axis: 'score',
    magnitude: Math.min(1, delta / 1.5),
    data: { type: mostPracticedType },
  }
}

function detectScoreByCadencePositionCluster({
  config,
  countedSessions,
  evaluations,
  today,
}: DetectorInput): ShapeCandidate | null {
  if (config.goalKind !== 'cadence' || evaluations.length < MIN_SESSIONS_FOR_SCORE) return null
  const parsed = parseDateSafe(config.startDate)
  if (!parsed) return null
  const streak = computeStreak(
    countedSessions.map((s) => new Date(s.completedAtMs)),
    { unit: config.recurringUnit as CadenceUnit, every: config.recurringEvery, count: config.recurringCount },
    parsed,
    today,
  )
  if (streak.periodHistory.length < 3) return null
  const positioned = countedSessions
    .map((s) => {
      const period = streak.periodHistory.find(
        (p) => s.completedAtMs >= new Date(p.periodStart).getTime() && s.completedAtMs < new Date(p.periodEnd).getTime(),
      )
      if (!period) return null
      const start = new Date(period.periodStart).getTime()
      const end = new Date(period.periodEnd).getTime()
      const positionFraction = (s.completedAtMs - start) / Math.max(1, end - start)
      return { score: scoreFor(s, evaluations), positionFraction }
    })
    .filter((r): r is { score: number; positionFraction: number } => r != null && r.score != null)
  const early = positioned.filter((r) => r.positionFraction < 0.5).map((r) => r.score)
  const late = positioned.filter((r) => r.positionFraction >= 0.5).map((r) => r.score)
  if (early.length < 3 || late.length < 3) return null
  const delta = mean(early) - mean(late)
  if (Math.abs(delta) < 0.35) return null
  return {
    shapeId: 'sc_scoreByCadencePositionCluster',
    axis: 'score',
    magnitude: Math.min(1, Math.abs(delta) / 1.5),
    data: { strongerPosition: delta > 0 ? 'early in period' : 'late in period' },
  }
}

function detectPostMissScorePattern({
  config,
  countedSessions,
  evaluations,
  today,
}: DetectorInput): ShapeCandidate | null {
  if (config.goalKind !== 'cadence' || evaluations.length < MIN_SESSIONS_FOR_SCORE) return null
  const parsed = parseDateSafe(config.startDate)
  if (!parsed) return null
  const streak = computeStreak(
    countedSessions.map((s) => new Date(s.completedAtMs)),
    { unit: config.recurringUnit as CadenceUnit, every: config.recurringEvery, count: config.recurringCount },
    parsed,
    today,
  )
  const missedPeriods = streak.periodHistory.filter((p) => !p.hit)
  if (missedPeriods.length < 2) return null
  const postMissScores: number[] = []
  const normalScores: number[] = []
  for (const s of countedSessions) {
    const score = scoreFor(s, evaluations)
    if (score == null) continue
    const followsAMiss = missedPeriods.some((p) => {
      const end = new Date(p.periodEnd).getTime()
      return s.completedAtMs >= end && s.completedAtMs < end + 7 * 86_400_000
    })
    if (followsAMiss) postMissScores.push(score)
    else normalScores.push(score)
  }
  if (postMissScores.length < 2 || normalScores.length < 3) return null
  const delta = mean(normalScores) - mean(postMissScores)
  if (delta < 0.3) return null
  return {
    shapeId: 'sc_postMissScorePattern',
    axis: 'score',
    magnitude: Math.min(1, delta / 1.5),
    data: { scoreDipAfterMiss: Math.round(delta * 10) / 10 },
  }
}

function detectStreakLengthVsScorePattern({
  config,
  countedSessions,
  evaluations,
  today,
}: DetectorInput): ShapeCandidate | null {
  if (config.goalKind !== 'cadence' || evaluations.length < MIN_SESSIONS_FOR_SCORE) return null
  const parsed = parseDateSafe(config.startDate)
  if (!parsed) return null
  const streak = computeStreak(
    countedSessions.map((s) => new Date(s.completedAtMs)),
    { unit: config.recurringUnit as CadenceUnit, every: config.recurringEvery, count: config.recurringCount },
    parsed,
    today,
  )
  if (streak.periodHistory.length < 4) return null
  const scoresByPeriod = streak.periodHistory.map((p) => {
    const start = new Date(p.periodStart).getTime()
    const end = new Date(p.periodEnd).getTime()
    const scores = countedSessions
      .filter((s) => s.completedAtMs >= start && s.completedAtMs < end)
      .map((s) => scoreFor(s, evaluations))
      .filter((n): n is number => n != null)
    return { hit: p.hit, variance: scores.length > 1 ? stddev(scores) : null }
  })
  const longStreakVariances = scoresByPeriod.filter((p) => p.hit && p.variance != null).map((p) => p.variance as number)
  const shortStreakVariances = scoresByPeriod.filter((p) => !p.hit && p.variance != null).map((p) => p.variance as number)
  if (longStreakVariances.length < 2 || shortStreakVariances.length < 2) return null
  const hitVariance = mean(longStreakVariances)
  const missVariance = mean(shortStreakVariances)
  if (hitVariance >= missVariance) return null // only surface when streaks correlate with MORE stability
  return {
    shapeId: 'sc_streakLengthVsScorePattern',
    axis: 'score',
    magnitude: Math.min(1, (missVariance - hitVariance) / Math.max(0.1, missVariance)),
    data: { currentStreak: streak.currentStreak },
  }
}

function detectEndOfPeriodRushVsScorePattern({
  config,
  countedSessions,
  evaluations,
  today,
}: DetectorInput): ShapeCandidate | null {
  if (config.goalKind !== 'flat' || !config.hasEndDate || evaluations.length < MIN_SESSIONS_FOR_SCORE) return null
  const end = parseDateSafe(config.endDate)
  if (!end) return null
  const rushWindowMs = end.getTime() - 5 * 86_400_000
  const rushScores: number[] = []
  const normalScores: number[] = []
  for (const s of countedSessions) {
    const score = scoreFor(s, evaluations)
    if (score == null) continue
    if (s.completedAtMs >= rushWindowMs && s.completedAtMs <= end.getTime()) rushScores.push(score)
    else normalScores.push(score)
  }
  if (rushScores.length < 3 || normalScores.length < 3) return null
  const delta = mean(normalScores) - mean(rushScores)
  if (delta < 0.3) return null
  return {
    shapeId: 'sc_endOfPeriodRushVsScorePattern',
    axis: 'score',
    magnitude: Math.min(1, delta / 1.5),
    data: { scoreDipDuringRush: Math.round(delta * 10) / 10 },
  }
}

/* -------------------------------------------------------------------------- */
/* Aggregate entry point                                                      */
/* -------------------------------------------------------------------------- */

function parseDateSafe(dmy: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dmy.trim())
  if (!m) return null
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  d.setHours(0, 0, 0, 0)
  return d
}

const DETECTORS: Array<(input: DetectorInput) => ShapeCandidate | null> = [
  detectDayOfWeekCluster,
  detectTimeOfDayCluster,
  detectBatchingVsSpacing,
  detectShortTermMomentum,
  detectLongRunAccelDecel,
  detectFrequencyRegularityTrend,
  detectNearMissPattern,
  detectSlipTimingPattern,
  detectRecoveryAfterMiss,
  detectFrontBackLoading,
  detectOverallConcentration,
  detectTypePairClustering,
  detectUntouchedTypeGap,
  detectDifficultyMixClustering,
  detectBroadeningNarrowingTrend,
  detectDifficultyEscalationTrend,
  detectNoveltyTrend,
  detectPerTypeSubGoalStalling,
  detectTypeRotationVsCadence,
  detectCatchUpTypeSkew,
  detectStartStrongFadeLater,
  detectCompletionRateHistory,
  detectPreferredGoalShape,
  detectRecurringSlipPoint,
  detectPaceVsScoreTrend,
  detectVolumeVsScoreTrend,
  detectConsistencyVsScoreTrend,
  detectScoreByTimingCluster,
  detectScoreByTypeCluster,
  detectScoreByCadencePositionCluster,
  detectPostMissScorePattern,
  detectStreakLengthVsScorePattern,
  detectEndOfPeriodRushVsScorePattern,
]

/**
 * Runs all 25 shape detectors, returning only candidates that clear their own
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
