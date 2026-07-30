/**
 * Locked per-flow, per-state copy templates — the exact worked-state tables
 * from the Goal Tracker design spec (§3: output definitions). Buddy tone
 * throughout, no emoji, no em/en dashes (verified by the repo-wide dash grep
 * in the verification pass, not re-checked here).
 */
import type { GoalState } from './engine'

export interface CopyContext {
  done: number
  total: number
  endDate: string
  daysRemaining: number
  expectedByNow: number
  gap: number
  catchUpToday: number
  requiredRatePerDay: number
  streak: number
  bestStreak: number
  periodTarget: number
  periodActual: number
  daysLeftInPeriod: number
  finishedOnDay?: number
  percentDone: number
}

export interface StateCopyTemplate {
  chip: string
  status: (ctx: CopyContext) => string
  action: (ctx: CopyContext) => string | null
  detail: (ctx: CopyContext) => string | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

/* -------------------------------------------------------------------------- */
/* Flow 1 — Total + Deadline                                                  */
/* -------------------------------------------------------------------------- */

export const FLOW1_COPY: Partial<Record<GoalState, StateCopyTemplate>> = {
  zero: {
    chip: 'Just started',
    status: () => 'Your goal is set. Log your first case to begin.',
    action: (ctx) => `Required pace: about ${round1(ctx.total / Math.max(1, ctx.daysRemaining))}/day.`,
    detail: () => null,
  },
  ahead: {
    chip: 'Ahead',
    status: () => "You're ahead of the pace this date needs.",
    action: () => 'Optional: bank a buffer, or rotate to a weak type.',
    detail: (ctx) => `Expected ${Math.round(ctx.expectedByNow)}, ${ctx.done} done, ${ctx.daysRemaining} days left.`,
  },
  onTrack: {
    chip: 'On track',
    status: (ctx) => `Right on pace for ${ctx.endDate}.`,
    action: (ctx) => `Keep the rhythm: about ${round1(ctx.requiredRatePerDay)}/day holds this.`,
    detail: (ctx) => `Expected ${Math.round(ctx.expectedByNow)}, ${ctx.daysRemaining} days left.`,
  },
  slightlyBehind: {
    chip: 'Slightly behind',
    status: () => 'A touch behind, easy to recover.',
    action: (ctx) => `Do ${ctx.catchUpToday} today to be back on pace.`,
    detail: (ctx) => `Expected ${Math.round(ctx.expectedByNow)}, gap ${Math.ceil(ctx.gap)}, ${ctx.daysRemaining} days left.`,
  },
  behind: {
    chip: 'Behind',
    status: () => "You've slipped off the pace.",
    action: (ctx) => `Do ${ctx.catchUpToday} over the next couple of days to close the gap.`,
    detail: (ctx) => `Expected ${Math.round(ctx.expectedByNow)}, gap ${Math.ceil(ctx.gap)}, new rate needed ${round1(ctx.requiredRatePerDay)}/day.`,
  },
  atRisk: {
    chip: 'At risk',
    status: () => 'This goal needs real catch up to land by the date.',
    action: (ctx) => `You'd need about ${round1(ctx.requiredRatePerDay)}/day from here. Consider extending.`,
    detail: (ctx) => `Expected ${Math.round(ctx.expectedByNow)}, gap ${Math.ceil(ctx.gap)}, required rate ${round1(ctx.requiredRatePerDay)}/day.`,
  },
  completeEarly: {
    chip: 'Complete',
    status: (ctx) =>
      ctx.finishedOnDay != null && ctx.daysRemaining > 0
        ? `Done, ${ctx.total} cases, with ${ctx.daysRemaining} days to spare.`
        : `Done, all ${ctx.total} cases.`,
    action: () => 'Set your next goal, or raise this target.',
    detail: (ctx) => (ctx.finishedOnDay != null ? `Finished on day ${ctx.finishedOnDay}.` : null),
  },
  fellShort: {
    chip: 'Fell short',
    status: (ctx) => `The date passed at ${ctx.done} of ${ctx.total}.`,
    action: () => 'Extend the deadline, or set a new goal.',
    detail: (ctx) => `${Math.round(ctx.percentDone)}% there, ${ctx.total - ctx.done} short.`,
  },
}

/* -------------------------------------------------------------------------- */
/* Flow 2 — Total + No Deadline (only good/neutral states, never "behind")    */
/* -------------------------------------------------------------------------- */

export const FLOW2_COPY: Partial<Record<GoalState, StateCopyTemplate>> = {
  zero: {
    chip: 'Just started',
    status: () => 'Your goal is set, at your own pace.',
    action: () => 'Log your first case to begin.',
    detail: () => null,
  },
  inProgress: {
    chip: 'In progress',
    status: (ctx) => `${Math.round(ctx.percentDone)}% of the way there.`,
    action: (ctx) => `${ctx.total - ctx.done} to go. Next case moves the bar.`,
    detail: () => null,
  },
  complete: {
    chip: 'Complete',
    status: (ctx) => `Done, all ${ctx.total} cases.`,
    action: () => 'Set a new goal, or raise the number.',
    detail: () => null,
  },
}

/* -------------------------------------------------------------------------- */
/* Flow 3 — Cadence + Deadline: rhythm side + total/finish-line side          */
/* -------------------------------------------------------------------------- */

export const FLOW3_RHYTHM_COPY: Partial<Record<GoalState, StateCopyTemplate>> = {
  zero: {
    chip: 'Week 1',
    status: (ctx) => `Habit set: ${ctx.periodTarget} a week. Let's build a streak.`,
    action: (ctx) => `Do your first ${ctx.periodTarget} to start the streak.`,
    detail: () => null,
  },
  periodOpenOnPace: {
    chip: 'On pace',
    status: (ctx) => `${ctx.periodActual} of ${ctx.periodTarget} done this week, ${ctx.daysLeftInPeriod} days left.`,
    action: (ctx) => `${Math.max(0, ctx.periodTarget - ctx.periodActual)} more this week keeps the streak.`,
    detail: () => null,
  },
  periodOpenAtRisk: {
    chip: 'Slipping',
    status: (ctx) => `0 of ${ctx.periodTarget} with ${ctx.daysLeftInPeriod} days left this week.`,
    action: (ctx) => `Do ${ctx.periodTarget} in ${ctx.daysLeftInPeriod} days to save the week.`,
    detail: () => null,
  },
  periodHit: {
    chip: 'Hit',
    status: (ctx) => `Week hit. Streak now ${ctx.streak}.`,
    action: () => 'Same again this week.',
    detail: () => null,
  },
  periodMissed: {
    chip: 'Missed last week',
    status: () => 'Only some done last week. Streak reset.',
    action: () => 'Fresh week. Hit the target to restart the streak.',
    detail: () => null,
  },
}

export const FLOW3_TOTAL_COPY: Partial<Record<GoalState, StateCopyTemplate>> = FLOW1_COPY

/* -------------------------------------------------------------------------- */
/* Flow 4 — Cadence + No Deadline + No Total (habit only, never completes)    */
/* -------------------------------------------------------------------------- */

export const FLOW4_COPY: Partial<Record<GoalState, StateCopyTemplate>> = {
  zero: {
    chip: 'Week 1',
    status: (ctx) => `Habit set: ${ctx.periodTarget} a week. Let's build a streak.`,
    action: (ctx) => `Do your first ${ctx.periodTarget} to start the streak.`,
    detail: () => null,
  },
  periodOpenOnPace: {
    chip: 'On pace',
    status: (ctx) => `${ctx.periodActual} of ${ctx.periodTarget} this week.`,
    action: (ctx) => `${Math.max(0, ctx.periodTarget - ctx.periodActual)} more keeps it alive.`,
    detail: () => null,
  },
  periodHit: {
    chip: 'Hit',
    status: (ctx) => `Week done. Streak: ${ctx.streak}.`,
    action: () => 'Same next week.',
    detail: (ctx) => (ctx.streak >= 6 ? `${ctx.streak} weeks straight. Your best yet.` : null),
  },
  periodMissed: {
    chip: 'Missed last week',
    status: () => 'Missed last week. Streak reset to 0.',
    action: (ctx) => `Fresh week, get ${ctx.periodTarget} to restart.`,
    detail: () => null,
  },
}

/* -------------------------------------------------------------------------- */
/* Flow 5 — Cadence + No Deadline + With Total: rhythm (Flow 4) + total bar    */
/* -------------------------------------------------------------------------- */

export const FLOW5_TOTAL_COPY: Partial<Record<GoalState, StateCopyTemplate>> = {
  zero: {
    chip: 'Just started',
    status: (ctx) => `${ctx.periodTarget} a week, working toward ${ctx.total}.`,
    action: (ctx) => `First ${ctx.periodTarget} starts your streak and the count.`,
    detail: () => null,
  },
  inProgress: {
    chip: 'In progress',
    status: (ctx) => `${ctx.done} of ${ctx.total} overall.`,
    action: (ctx) => {
      const remaining = ctx.total - ctx.done
      const weeksLeft = ctx.periodTarget > 0 ? Math.ceil(remaining / ctx.periodTarget) : null
      return weeksLeft != null
        ? `${remaining} to go at this rhythm, about ${weeksLeft} more weeks.`
        : `${remaining} to go at this rhythm.`
    },
    detail: () => null,
  },
  complete: {
    chip: 'Complete',
    status: (ctx) => `Reached ${ctx.total}. Habit intact.`,
    action: () => 'Set a new goal, or keep the rhythm going.',
    detail: () => null,
  },
}
