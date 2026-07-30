'use client';

import { useEffect, useMemo } from 'react';
import {
  computeStreak,
  parseDMY,
  resolveFlatNoDeadlineState,
  resolvePerTypeGoals,
  resolveRhythmState,
  startOfDay,
  type CadenceUnit,
} from '@/lib/goalTracker/engine';
import { FLOW4_COPY, FLOW5_TOTAL_COPY } from '@/lib/goalTracker/copy';
import type { CopyContext } from '@/lib/goalTracker/copy';
import type { FlowRenderProps } from './types';
import StateChip from './StateChip';
import StreakDots from './StreakDots';
import { HeaderRow } from './Flow1TotalDeadline';

/**
 * Flow 5 — Cadence + No Deadline + With Total. Rhythm side identical to
 * Flow 4. Plus a persistent total bar with no pace/no "behind" (no clock
 * exists) — can complete on total while rhythm keeps tracking independently
 * (§3).
 */
export default function Flow5CadenceWithTotal({ config, counts, onEdit, onReset, onShowExclusions, onStateResolved }: FlowRenderProps) {
  const { done, doneByType, countedSessions } = counts
  const today = useMemo(() => startOfDay(new Date()), [])
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
  const previousClosed = currentPeriod && new Date(currentPeriod.periodEnd) <= today ? currentPeriod : null
  const rhythmState = resolveRhythmState(previousClosed ? null : currentPeriod, previousClosed)
  const totalState = resolveFlatNoDeadlineState(done, config.totalCases)

  useEffect(() => {
    onStateResolved(totalState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalState])

  const rhythmTemplate = FLOW4_COPY[rhythmState]
  const totalTemplate = FLOW5_TOTAL_COPY[totalState]

  const ctx: CopyContext = {
    done,
    total: config.totalCases,
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
    percentDone: config.totalCases > 0 ? (done / config.totalCases) * 100 : 0,
  }

  const perType = resolvePerTypeGoals(5, config, doneByType, today)
  const completionPct = config.totalCases > 0 ? Math.min(100, Math.round((done / config.totalCases) * 100)) : 0

  return (
    <div className="flex flex-col gap-4">
      <HeaderRow onEdit={onEdit} onReset={onReset} onShowExclusions={onShowExclusions} />

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[#5C4033]/60">
          {ctx.periodActual} of {ctx.periodTarget} this week
        </span>
        <StateChip state={rhythmState} />
      </div>

      <StreakDots
        currentStreak={streak?.currentStreak ?? 0}
        bestStreak={streak?.bestStreak ?? 0}
        recentPeriods={streak?.periodHistory ?? []}
      />

      {rhythmTemplate?.action(ctx) && (
        <p className="text-[11px] text-[#3D5A35]/80 leading-snug text-center">&rarr; {rhythmTemplate.action(ctx)}</p>
      )}

      <div className="border-t border-[#5C4033]/6 pt-3">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-[10px] text-[#5C4033]/60">{done} of {config.totalCases}</span>
          <StateChip state={totalState} />
        </div>
        <div className="h-[2px] bg-[#5C4033]/6 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${completionPct}%`, backgroundColor: '#3D5A35', opacity: 0.6 }} />
        </div>
      </div>

      {totalTemplate && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] text-[#3B2F2F]/70 leading-relaxed">{totalTemplate.status(ctx)}</p>
          {totalTemplate.action(ctx) && (
            <p className="text-[10px] text-[#5C4033]/50 leading-snug">{totalTemplate.action(ctx)}</p>
          )}
        </div>
      )}

      {perType.length > 0 && (
        <div className="border-t border-[#5C4033]/6 pt-3 grid grid-cols-3 gap-x-3 gap-y-3">
          {perType.map((row) => {
            const pct = row.target > 0 ? Math.min(100, (row.done / row.target) * 100) : 0
            return (
              <div key={row.type} className="flex flex-col gap-1">
                <span className="text-[8px] font-semibold text-[#5C4033]/38 truncate">{row.type.split(' ')[0]}</span>
                <div className="h-[2px] bg-[#5C4033]/7 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: '#C4A882', opacity: 0.75 }} />
                </div>
                <span className="text-[8px] font-semibold text-[#3B2F2F]/35">{row.done}/{row.target}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
