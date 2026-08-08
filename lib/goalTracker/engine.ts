/**
 * Pure, framework-agnostic goal-tracking math: flow resolution, calendar-aware
 * period derivation, pace-band classification, and streak computation.
 *
 * No Firestore, no React — importable from both client components (instant
 * deterministic rendering) and the server API route (AI-insight candidate
 * precompute). Every function is a pure function of its inputs so streak/pace
 * "recompute" on exclusion changes is just calling these again with a new
 * counted-session set — there is no separate migration/backfill step.
 */
import type { GoalConfig } from '@/lib/firebase/schema'

/* -------------------------------------------------------------------------- */
/* Flow resolution                                                            */
/* -------------------------------------------------------------------------- */

export type FlowId = 1 | 2 | 3 | 4 | 5

/**
 * Resolves which of the 5 locked flows a goal config represents.
 *   1 — flat + deadline
 *   2 — flat + no deadline
 *   3 — cadence + deadline (implied total = rate × periods)
 *   4 — cadence + no deadline + no total
 *   5 — cadence + no deadline + with total
 */
export function resolveFlow(
  config: Pick<GoalConfig, 'goalKind' | 'hasEndDate' | 'totalCases'>,
): FlowId {
  if (config.goalKind === 'flat') {
    return config.hasEndDate ? 1 : 2
  }
  // cadence
  if (config.hasEndDate) return 3
  return config.totalCases > 0 ? 5 : 4
}

/* -------------------------------------------------------------------------- */
/* Date helpers — local timezone, midnight-based (per locked §2 timezone rule)*/
/* -------------------------------------------------------------------------- */

/** Parses a DD/MM/YYYY string into a local-midnight Date, or null if malformed/empty. */
export function parseDMY(value: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim())
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  const d = new Date(year, month - 1, day)
  d.setHours(0, 0, 0, 0)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null
  return d
}

/** Returns a local-midnight copy of `date` (strips time-of-day). */
export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Whole-day difference (b - a), truncated toward zero. */
export function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 86_400_000
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY)
}

/**
 * Adds `months` real calendar months to `date` (e.g. Jan 15 + 1 = Feb 15).
 * Clamps day-of-month overflow to the target month's last day
 * (e.g. Jan 31 + 1 month = Feb 28, or Feb 29 on a leap year) rather than
 * silently rolling into the following month, matching how people actually
 * read "one month from the 31st."
 */
export function addCalendarMonths(date: Date, months: number): Date {
  const year = date.getFullYear()
  const month = date.getMonth()
  const day = date.getDate()

  const targetMonthIndex = month + months
  const targetYear = year + Math.floor(targetMonthIndex / 12)
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12

  const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate()
  const clampedDay = Math.min(day, lastDayOfTargetMonth)

  const result = new Date(targetYear, targetMonth, clampedDay)
  result.setHours(date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds())
  return result
}

/* -------------------------------------------------------------------------- */
/* Cadence period derivation                                                  */
/* -------------------------------------------------------------------------- */

export type CadenceUnit = 'days' | 'weeks' | 'months'

export interface CadencePeriod {
  periodStart: Date
  periodEnd: Date // exclusive
  index: number // 0-based, chronological
}

/**
 * Derives the sequence of cadence periods from `startDate` through
 * `throughDate` (inclusive of the period containing `throughDate`).
 *
 * - 'weeks'  → rolling 7-day blocks anchored on `startDate` (not calendar weeks).
 * - 'months' → real calendar months via `addCalendarMonths` (not 30-day blocks).
 * - 'days'   → calendar-day blocks of size `every`.
 */
export function derivePeriods(
  startDate: Date,
  unit: CadenceUnit,
  every: number,
  throughDate: Date,
): CadencePeriod[] {
  const start = startOfDay(startDate)
  const through = startOfDay(throughDate)
  const periods: CadencePeriod[] = []
  let cursor = start
  let index = 0

  // Safety cap: never emit more than 10 years of periods, guards against a
  // malformed `every` of 0 or a negative-length interval looping forever.
  const MAX_PERIODS = 3660
  const step = Math.max(1, every)

  while (cursor.getTime() <= through.getTime() && index < MAX_PERIODS) {
    let periodEnd: Date
    if (unit === 'months') {
      periodEnd = addCalendarMonths(cursor, step)
    } else if (unit === 'weeks') {
      periodEnd = new Date(cursor)
      periodEnd.setDate(periodEnd.getDate() + step * 7)
    } else {
      periodEnd = new Date(cursor)
      periodEnd.setDate(periodEnd.getDate() + step)
    }
    periods.push({ periodStart: cursor, periodEnd, index })
    cursor = periodEnd
    index += 1
  }

  return periods
}

/**
 * Implied total cases for a cadence+deadline goal (Flow 3): rate x number of
 * cadence periods that start on/before the deadline (a trailing partial
 * period still counts, since cases can be logged toward it right up to the
 * deadline). Anchored on `startDate`, matching the period boundaries
 * `computeStreak` uses, so the rhythm and total sides of Flow 3 agree on
 * where periods fall.
 *
 * Single source of truth: both the wizard's save-time total and the live
 * dashboard total must call this — do not reimplement this math elsewhere.
 */
export function deriveImpliedTotal(
  recurringCount: number,
  recurringEvery: number,
  recurringUnit: CadenceUnit,
  startDate: Date,
  endDate: Date,
): number {
  if (recurringCount <= 0 || recurringEvery <= 0) return 0
  const periods = derivePeriods(startDate, recurringUnit, recurringEvery, endDate)
  return recurringCount * periods.length
}

/** Finds the period containing `date`, or null if `date` is before the first period. */
export function findPeriodFor(periods: CadencePeriod[], date: Date): CadencePeriod | null {
  const t = startOfDay(date).getTime()
  for (const p of periods) {
    if (t >= p.periodStart.getTime() && t < p.periodEnd.getTime()) return p
  }
  // Date may fall exactly on/after the last period's end if throughDate landed
  // mid-period — the last period still "contains" ongoing today in that case.
  const last = periods[periods.length - 1]
  if (last && t >= last.periodStart.getTime()) return last
  return null
}

/* -------------------------------------------------------------------------- */
/* Pace-band classification (Flow 1, and Flow 3's total/finish-line side)     */
/* -------------------------------------------------------------------------- */

export type PaceBand = 'ahead' | 'onTrack' | 'slightlyBehind' | 'behind' | 'atRisk'

export interface PaceResult {
  pace: number // raw ratio: done / expectedByNow
  band: PaceBand
  expectedByNow: number
  gap: number // expectedByNow - done, clamped to >= 0
  /** Cases needed TODAY to restore on-pace, rounded UP for display only. */
  catchUpToday: number
  /** Required daily rate for the remainder of the goal to still land on time. */
  requiredRatePerDay: number
  daysRemaining: number
}

const PACE_BANDS: { min: number; band: PaceBand }[] = [
  { min: 1.15, band: 'ahead' },
  { min: 0.9, band: 'onTrack' },
  { min: 0.75, band: 'slightlyBehind' },
  { min: 0.5, band: 'behind' },
  { min: -Infinity, band: 'atRisk' },
]

export function classifyPaceBand(pace: number): PaceBand {
  for (const { min, band } of PACE_BANDS) {
    if (pace >= min) return band
  }
  return 'atRisk'
}

/**
 * Core formula: pace = done / expectedByNow, where
 * expectedByNow = (total / totalDays) * elapsedDays, anchored on `startDate`
 * (never `createdAt`).
 */
export function classifyPace(
  done: number,
  total: number,
  startDate: Date,
  endDate: Date,
  today: Date,
): PaceResult {
  const totalDays = Math.max(1, daysBetween(startDate, endDate))
  const elapsedDays = Math.max(0, Math.min(totalDays, daysBetween(startDate, today)))
  const daysRemaining = Math.max(0, daysBetween(today, endDate))

  const expectedByNow = (total / totalDays) * elapsedDays
  // A goal with zero expected progress yet (day 0-1) reads as on-track by
  // definition — avoids a divide-by-zero band flip on the very first day.
  const pace = expectedByNow > 0 ? done / expectedByNow : 1
  const band = classifyPaceBand(pace)
  const gap = Math.max(0, expectedByNow - done)

  const catchUpToday = daysRemaining > 0 ? Math.ceil(gap / 1) : Math.ceil(gap)
  const remainingCases = Math.max(0, total - done)
  const requiredRatePerDay = daysRemaining > 0 ? remainingCases / daysRemaining : remainingCases

  return { pace, band, expectedByNow, gap, catchUpToday, requiredRatePerDay, daysRemaining }
}

/* -------------------------------------------------------------------------- */
/* Streak computation (Flows 3/4/5) — retroactive-recompute-safe by design    */
/* -------------------------------------------------------------------------- */

export interface PeriodHitResult {
  periodStart: string // ISO date
  periodEnd: string
  target: number
  actual: number
  hit: boolean
}

export interface StreakResult {
  currentStreak: number
  bestStreak: number
  periodHistory: PeriodHitResult[]
}

/**
 * Re-derives every period's hit/miss from the counted-session date list, then
 * re-derives current + best streak from that history — every single call.
 * This is deliberate: there is no incremental/cached streak state to
 * invalidate when exclusions change, callers just call this again with the
 * new counted set and get a correct answer.
 *
 * ANY miss (including a single missed day on a daily cadence) resets the
 * current streak to 0 — one uniform rule, no special-casing by cadence unit
 * (explicit, locked override of an earlier "soft nudge" recommendation).
 */
export function computeStreak(
  countedSessionDates: Date[], // dates of counted sessions, post-exclusion filtering
  cadence: { unit: CadenceUnit; every: number; count: number },
  startDate: Date,
  today: Date,
): StreakResult {
  const periods = derivePeriods(startDate, cadence.unit, cadence.every, today)
  const dateStrings = countedSessionDates.map((d) => startOfDay(d).getTime())

  const todayMs = startOfDay(today).getTime()

  const periodHistory: (PeriodHitResult & { periodEndMs: number })[] = periods.map((p) => {
    const actual = dateStrings.filter(
      (t) => t >= p.periodStart.getTime() && t < p.periodEnd.getTime(),
    ).length
    return {
      periodStart: toISODate(p.periodStart),
      periodEnd: toISODate(p.periodEnd),
      periodEndMs: p.periodEnd.getTime(),
      target: cadence.count,
      actual,
      hit: actual >= cadence.count,
    }
  })

  // Only fully-elapsed periods count toward streak history — the period
  // containing `today` is still "open" and shouldn't count as a miss yet.
  // Compares against the local-midnight ms timestamp directly (not a
  // re-parsed ISO date string, which would round-trip through UTC and can
  // shift by the local timezone offset).
  const closedHistory = periodHistory.filter((p) => p.periodEndMs <= todayMs)

  let currentStreak = 0
  for (let i = closedHistory.length - 1; i >= 0; i -= 1) {
    if (closedHistory[i].hit) currentStreak += 1
    else break
  }

  let bestStreak = 0
  let running = 0
  for (const p of closedHistory) {
    running = p.hit ? running + 1 : 0
    bestStreak = Math.max(bestStreak, running)
  }
  bestStreak = Math.max(bestStreak, currentStreak)

  const publicHistory: PeriodHitResult[] = periodHistory.map(
    ({ periodStart, periodEnd, target, actual, hit }) => ({ periodStart, periodEnd, target, actual, hit }),
  )

  return { currentStreak, bestStreak, periodHistory: publicHistory }
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Parses a `toISODate`-shaped "YYYY-MM-DD" string into a local-midnight Date.
 * Unlike `new Date(isoString)`, which parses a date-only ISO string as UTC
 * midnight per spec, this stays in local time — required whenever the result
 * is compared against another local-midnight Date (e.g. `startOfDay(new
 * Date())`), or the comparison silently shifts by the local UTC offset.
 */
export function parseISODateLocal(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/* -------------------------------------------------------------------------- */
/* Per-case-type sub-goal resolution (flow-aware, §4 of the locked spec)      */
/* -------------------------------------------------------------------------- */

export interface PerTypeGoalResult {
  type: string
  target: number
  done: number
  /** Present only for Flow 1 (per-type inherits the overall deadline and runs its own pace bands). */
  pace?: PaceResult
}

/**
 * Resolves per-type sub-goals per the locked flow-resolution table:
 *   Flow 1 — pace-banded against the overall deadline, own target.
 *   Flow 2 — progress-only (no pace concept exists in this flow at all).
 *   Flow 3 — progress-only (cadence/streak stays overall-only; only the
 *            total/finish-line side splits per type).
 *   Flow 4 — never applies; always returns [] (no total to split).
 *   Flow 5 — progress-only (rhythm/streak overall-only, total splits per type).
 */
export function resolvePerTypeGoals(
  flow: FlowId,
  config: Pick<GoalConfig, 'hasPerType' | 'perType' | 'startDate' | 'endDate' | 'hasEndDate'>,
  doneByType: Record<string, number>,
  today: Date,
): PerTypeGoalResult[] {
  if (flow === 4) return []
  if (!config.hasPerType) return []

  const entries = (Object.entries(config.perType) as [string, number][]).filter(
    ([, target]) => target > 0,
  )

  if (flow === 1 && config.hasEndDate) {
    const start = parseDMY(config.startDate)
    const end = parseDMY(config.endDate)
    if (start && end) {
      return entries.map(([type, target]) => ({
        type,
        target,
        done: doneByType[type] ?? 0,
        pace: classifyPace(doneByType[type] ?? 0, target, start, end, today),
      }))
    }
  }

  // Flows 2/3/5 (and Flow 1 as a fallback if dates fail to parse): progress-only.
  return entries.map(([type, target]) => ({
    type,
    target,
    done: doneByType[type] ?? 0,
  }))
}

/* -------------------------------------------------------------------------- */
/* State resolution — drives which copy template + chip + visual to render   */
/* -------------------------------------------------------------------------- */

export type GoalState =
  | 'zero'
  | 'ahead'
  | 'onTrack'
  | 'slightlyBehind'
  | 'behind'
  | 'atRisk'
  | 'completeEarly'
  | 'fellShort'
  | 'inProgress'
  | 'complete'
  | 'periodOpenOnPace'
  | 'periodOpenAtRisk'
  | 'periodHit'
  | 'periodMissed'

/** Flows 1 & 3 (total/finish-line side): full pace-banded + terminal states. */
export function resolveTotalState(
  done: number,
  total: number,
  pace: PaceResult | null,
  daysRemaining: number | null,
  dateHasPassed: boolean,
): GoalState {
  // A non-positive total isn't a real target to be "done >= total" against —
  // without this, a fresh goal with total 0 reads `0 >= 0` as true and shows
  // "complete" before the user has done anything. Surface it as "not started
  // yet" instead of a false completion.
  if (total <= 0) return 'zero'
  if (dateHasPassed) return done >= total ? 'completeEarly' : 'fellShort'
  if (done >= total) return 'completeEarly'
  if (done === 0) return 'zero'
  if (!pace) return 'onTrack'
  return pace.band
}

/** Flow 2 (total, no deadline): only good/neutral states, never "behind". */
export function resolveFlatNoDeadlineState(done: number, total: number): GoalState {
  if (done === 0) return 'zero'
  if (done >= total) return 'complete'
  return 'inProgress'
}

/** Flows 4/5 rhythm side: current-period hit/miss/at-risk framing. */
export function resolveRhythmState(
  currentPeriod: PeriodHitResult | null,
  previousPeriodJustClosed: PeriodHitResult | null,
): GoalState {
  if (previousPeriodJustClosed) {
    return previousPeriodJustClosed.hit ? 'periodHit' : 'periodMissed'
  }
  if (!currentPeriod) return 'zero'
  const remaining = currentPeriod.target - currentPeriod.actual
  if (remaining <= 0) return 'periodOpenOnPace'
  return currentPeriod.actual > 0 ? 'periodOpenOnPace' : 'periodOpenAtRisk'
}
