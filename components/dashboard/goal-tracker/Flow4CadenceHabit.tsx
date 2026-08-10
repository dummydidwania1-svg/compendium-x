'use client';

import { useEffect, useMemo } from 'react';
import { cadenceUnitSingular, computeStreak, parseDMY, parseISODateLocal, resolveRhythmState, type CadenceUnit } from '@/lib/goalTracker/engine';
import { useToday } from '@/lib/hooks/useToday';
import { FLOW4_COPY } from '@/lib/goalTracker/copy';
import type { CopyContext } from '@/lib/goalTracker/copy';
import type { FlowRenderProps } from './types';
import StateChip from './StateChip';
import StreakDots from './StreakDots';
import { HeaderRow } from './Flow1TotalDeadline';

/**
 * Flow 4 — Cadence + No Deadline + No Total. Pure habit tracking, streak is
 * the hero number, never completes, no total bar ever (§3). No per-type
 * ever applies here (no total to split).
 */
export default function Flow4CadenceHabit({ config, counts, onEdit, onReset, onShowExclusions, onStateResolved }: FlowRenderProps) {
  const { countedSessions } = counts
  const today = useToday()
  const start = useMemo(() => parseDMY(config.startDate), [config.startDate])

  const streak = useMemo(() => {
    if (!start) return null
    return computeStreak(
      countedSessions.map((s) => new Date(s.completedAtMs)),
      { unit: config.recurringUnit as CadenceUnit, every: config.recurringEvery, count: config.recurringCount },
      start,
      today,
    )
  }, [countedSessions, config.recurringUnit, config.recurringEvery, config.recurringCount, start, today])

  const currentPeriod = streak?.periodHistory[streak.periodHistory.length - 1] ?? null
  const previousClosed = currentPeriod && parseISODateLocal(currentPeriod.periodEnd) <= today ? currentPeriod : null
  const state = resolveRhythmState(previousClosed ? null : currentPeriod, previousClosed)
  const template = FLOW4_COPY[state]

  useEffect(() => {
    onStateResolved(state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const ctx: CopyContext = {
    done: counts.done,
    total: 0,
    endDate: '',
    daysRemaining: 0,
    expectedByNow: 0,
    gap: 0,
    catchUpToday: 0,
    requiredRatePerDay: 0,
    streak: streak?.currentStreak ?? 0,
    bestStreak: streak?.bestStreak ?? 0,
    periodTarget: config.recurringCount,
    periodActual: currentPeriod?.actual ?? 0,
    daysLeftInPeriod: 0,
    percentDone: 0,
    periodUnit: cadenceUnitSingular(config.recurringUnit as CadenceUnit),
    periodUnitPlural: config.recurringUnit,
  }

  return (
    <div className="flex flex-col gap-4">
      <HeaderRow onEdit={onEdit} onReset={onReset} onShowExclusions={onShowExclusions} />

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#5C4033]/60">
          {ctx.periodActual} of {ctx.periodTarget} this {ctx.periodUnit}
        </span>
        <StateChip state={state} periodUnit={ctx.periodUnit} />
      </div>

      <StreakDots
        currentStreak={streak?.currentStreak ?? 0}
        bestStreak={streak?.bestStreak ?? 0}
        recentPeriods={streak?.periodHistory ?? []}
        periodUnit={ctx.periodUnit}
      />

      {template && (
        <div className="border-t border-[#5C4033]/6 pt-3 flex flex-col gap-1.5">
          <p className="text-xs text-[#3B2F2F]/80 leading-relaxed">{template.status(ctx)}</p>
          {template.action(ctx) && (
            <p className="text-[11px] text-[#3D5A35]/80 leading-snug">&rarr; {template.action(ctx)}</p>
          )}
          {template.detail(ctx) && <p className="text-[9px] text-[#5C4033]/40">{template.detail(ctx)}</p>}
        </div>
      )}
    </div>
  )
}
