'use client';

import { useEffect, useMemo } from 'react';
import {
  cadenceUnitSingular,
  classifyPace,
  computeStreak,
  deriveImpliedTotal,
  parseDMY,
  parseISODateLocal,
  previousClosedPeriodFor,
  resolvePerTypeGoals,
  resolveRhythmState,
  resolveTotalState,
  type CadenceUnit,
} from '@/lib/goalTracker/engine';
import { useToday } from '@/lib/hooks/useToday';
import { FLOW3_RHYTHM_COPY, FLOW3_TOTAL_COPY } from '@/lib/goalTracker/copy';
import type { CopyContext } from '@/lib/goalTracker/copy';
import type { FlowRenderProps } from './types';
import TGRGauge from './TGRGauge';
import StateChip from './StateChip';
import { HeaderRow } from './Flow1TotalDeadline';

/**
 * Flow 3 — Cadence + Deadline. TWO headline numbers: rhythm (rolling weekly
 * hit/miss) and total-progress (implied total = rate x periods, same 5
 * pace-bands as Flow 1 against the same deadline). Can legitimately disagree
 * (on-rhythm this week, behind on total) — shown honestly per §3, never
 * smoothed over.
 */
export default function Flow3CadenceDeadline({ config, counts, onEdit, onReset, onShowExclusions, onStateResolved }: FlowRenderProps) {
  const { done, doneByType, countedSessions } = counts
  const today = useToday()
  const start = useMemo(() => parseDMY(config.startDate), [config.startDate])
  const end = useMemo(() => parseDMY(config.endDate), [config.endDate])

  const impliedTotal = start && end
    ? deriveImpliedTotal(config.recurringCount, config.recurringEvery, config.recurringUnit as CadenceUnit, start, end)
    : 0

  const totalPace = useMemo(() => {
    if (!start || !end) return null
    return classifyPace(done, impliedTotal, start, end, today)
  }, [start, end, done, impliedTotal, today])

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
  // Day-1-of-a-fresh-week/month surfaces the just-closed period so the
  // Hit/Missed verdict shows on the morning after; open-progress takes over
  // from day 2 (see engine.previousClosedPeriodFor).
  const previousClosed = previousClosedPeriodFor(streak, today, config.recurringUnit as CadenceUnit)
  const rhythmState = resolveRhythmState(previousClosed ? null : currentPeriod, previousClosed)

  const dateHasPassed = end ? today.getTime() > end.getTime() : false
  const totalState = resolveTotalState(done, impliedTotal, totalPace, totalPace?.daysRemaining ?? null, dateHasPassed)

  useEffect(() => {
    // Report the total-side state as the "overall" resolved state for AI-insight redundancy context.
    onStateResolved(totalState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalState])

  const rhythmTemplate = FLOW3_RHYTHM_COPY[rhythmState]
  const totalTemplate = FLOW3_TOTAL_COPY[totalState]

  const daysLeftInPeriod = currentPeriod
    ? Math.max(0, Math.round((parseISODateLocal(currentPeriod.periodEnd).getTime() - today.getTime()) / 86_400_000))
    : 0

  const ctx: CopyContext = {
    done,
    total: impliedTotal,
    endDate: config.endDate,
    daysRemaining: totalPace?.daysRemaining ?? 0,
    expectedByNow: totalPace?.expectedByNow ?? 0,
    gap: totalPace?.gap ?? 0,
    catchUpToday: totalPace?.catchUpToday ?? 0,
    requiredRatePerDay: totalPace?.requiredRatePerDay ?? 0,
    streak: streak?.currentStreak ?? 0,
    bestStreak: streak?.bestStreak ?? 0,
    periodTarget: config.recurringCount,
    periodActual: currentPeriod?.actual ?? 0,
    daysLeftInPeriod,
    percentDone: impliedTotal > 0 ? (done / impliedTotal) * 100 : 0,
    periodUnit: cadenceUnitSingular(config.recurringUnit as CadenceUnit),
    periodUnitPlural: config.recurringUnit,
  }

  const perType = resolvePerTypeGoals(3, config, doneByType, today)
  const completionPct = impliedTotal > 0 ? Math.min(100, Math.round((done / impliedTotal) * 100)) : 0

  return (
    <div className="flex flex-col gap-4">
      <HeaderRow onEdit={onEdit} onReset={onReset} onShowExclusions={onShowExclusions} />

      {/* Rhythm side */}
      {rhythmTemplate && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#5C4033]/60">
              {ctx.periodActual} of {ctx.periodTarget} this {ctx.periodUnit}
            </span>
            <StateChip state={rhythmState} periodUnit={ctx.periodUnit} />
          </div>
          <p className="text-xs text-[#3B2F2F]/80 leading-relaxed">{rhythmTemplate.status(ctx)}</p>
          {rhythmTemplate.action(ctx) && (
            <p className="text-[11px] text-[#3D5A35]/80 leading-snug">&rarr; {rhythmTemplate.action(ctx)}</p>
          )}
        </div>
      )}

      {/* Total / finish-line side */}
      <div className="border-t border-[#5C4033]/6 pt-3">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-[10px] text-[#5C4033]/60">{done} of {impliedTotal} overall</span>
          <StateChip state={totalState} />
        </div>
        <div className="h-[2px] bg-[#5C4033]/6 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${completionPct}%`, backgroundColor: '#3D5A35', opacity: 0.6 }} />
        </div>
      </div>

      {totalPace && (
        <div className="max-w-[132px] mx-auto w-full">
          <TGRGauge pace={totalPace.pace} band={totalPace.band} />
        </div>
      )}

      {totalTemplate && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] text-[#3B2F2F]/70 leading-relaxed">{totalTemplate.status(ctx)}</p>
          {(totalState === 'completeEarly' || totalState === 'fellShort') && (
            <button onClick={onReset} className="gt-cta mt-1 !py-2 !text-[11px]">Set a new goal</button>
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
