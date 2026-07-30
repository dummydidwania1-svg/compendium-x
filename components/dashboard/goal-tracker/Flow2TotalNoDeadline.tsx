'use client';

import { useEffect, useMemo } from 'react';
import { resolveFlatNoDeadlineState, resolvePerTypeGoals, startOfDay } from '@/lib/goalTracker/engine';
import { FLOW2_COPY } from '@/lib/goalTracker/copy';
import type { CopyContext } from '@/lib/goalTracker/copy';
import type { FlowRenderProps } from './types';
import StateChip from './StateChip';
import { HeaderRow } from './Flow1TotalDeadline';

/**
 * Flow 2 — Total + No Deadline. No pace concept, no "behind" ever exists.
 * Only Zero/kickoff, In-progress, and Complete states (§3).
 */
export default function Flow2TotalNoDeadline({ config, counts, onEdit, onReset, onShowExclusions, onStateResolved }: FlowRenderProps) {
  const { done, doneByType } = counts
  const today = useMemo(() => startOfDay(new Date()), [])
  const state = resolveFlatNoDeadlineState(done, config.totalCases)
  const template = FLOW2_COPY[state]

  useEffect(() => {
    onStateResolved(state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const completionPct = config.totalCases > 0 ? Math.min(100, Math.round((done / config.totalCases) * 100)) : 0
  const percentDone = config.totalCases > 0 ? (done / config.totalCases) * 100 : 0

  const ctx: CopyContext = {
    done,
    total: config.totalCases,
    endDate: '',
    daysRemaining: 0,
    expectedByNow: 0,
    gap: 0,
    catchUpToday: 0,
    requiredRatePerDay: 0,
    streak: 0,
    bestStreak: 0,
    periodTarget: 0,
    periodActual: 0,
    daysLeftInPeriod: 0,
    percentDone,
  }

  const perType = resolvePerTypeGoals(2, config, doneByType, today)

  return (
    <div className="flex flex-col gap-4">
      <HeaderRow onEdit={onEdit} onReset={onReset} onShowExclusions={onShowExclusions} />

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-[10px] text-[#5C4033]/60">{done} of {config.totalCases} cases</span>
          <StateChip state={state} />
        </div>
        <div className="h-[2px] bg-[#5C4033]/6 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${completionPct}%`, backgroundColor: '#3D5A35', opacity: 0.6 }}
          />
        </div>
      </div>

      {template && (
        <div className="border-t border-[#5C4033]/6 pt-3 flex flex-col gap-1.5">
          <p className="text-xs text-[#3B2F2F]/80 leading-relaxed">{template.status(ctx)}</p>
          {template.action(ctx) && (
            <div className="flex items-start gap-2 mt-1 px-3 py-2 rounded-lg" style={{ background: 'rgba(217,208,196,0.25)' }}>
              <span className="text-[#3D5A35] text-xs mt-[1px]">&rarr;</span>
              <p className="text-[11px] text-[#3B2F2F]/75 leading-snug">{template.action(ctx)}</p>
            </div>
          )}
          {state === 'complete' && (
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
