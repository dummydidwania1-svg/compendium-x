'use client';

import { useEffect, useMemo } from 'react';
import { Settings2 } from 'lucide-react';
import {
  classifyPace,
  daysBetween,
  parseDMY,
  resolvePerTypeGoals,
  resolveTotalState,
} from '@/lib/goalTracker/engine';
import { useToday } from '@/lib/hooks/useToday';
import { FLOW1_COPY } from '@/lib/goalTracker/copy';
import type { CopyContext } from '@/lib/goalTracker/copy';
import type { FlowRenderProps } from './types';
import TGRGauge from './TGRGauge';
import StateChip from './StateChip';

/** Flow 1 — Total + Deadline. Full pace-banded 8-state table (§3). */
export default function Flow1TotalDeadline({ config, counts, onEdit, onReset, onShowExclusions, onQuickAdjust, onStateResolved }: FlowRenderProps) {
  const { done, doneByType } = counts;
  const today = useToday();
  const start = useMemo(() => parseDMY(config.startDate), [config.startDate]);
  const end = useMemo(() => parseDMY(config.endDate), [config.endDate]);

  const pace = useMemo(() => {
    if (!start || !end) return null
    return classifyPace(done, config.totalCases, start, end, today)
  }, [start, end, done, config.totalCases, today])

  const dateHasPassed = end ? today.getTime() > end.getTime() : false
  const state = resolveTotalState(done, config.totalCases, pace, pace?.daysRemaining ?? null, dateHasPassed)
  const template = FLOW1_COPY[state]

  useEffect(() => {
    onStateResolved(state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const completionPct = config.totalCases > 0 ? Math.min(100, Math.round((done / config.totalCases) * 100)) : 0
  const percentDone = config.totalCases > 0 ? (done / config.totalCases) * 100 : 0
  // 1-based so finishing on launch day reads "day 1", not "day 0".
  const finishedOnDay = start ? daysBetween(start, today) + 1 : undefined

  const ctx: CopyContext = {
    done,
    total: config.totalCases,
    endDate: config.endDate,
    daysRemaining: pace?.daysRemaining ?? 0,
    expectedByNow: pace?.expectedByNow ?? 0,
    gap: pace?.gap ?? 0,
    catchUpToday: pace?.catchUpToday ?? 0,
    requiredRatePerDay: pace?.requiredRatePerDay ?? 0,
    streak: 0,
    bestStreak: 0,
    periodTarget: 0,
    periodActual: 0,
    daysLeftInPeriod: 0,
    finishedOnDay,
    percentDone,
    periodUnit: '',
    periodUnitPlural: '',
  }

  const perType = resolvePerTypeGoals(1, config, doneByType, today)

  return (
    <div className="flex flex-col gap-4">
      <HeaderRow onEdit={onEdit} onReset={onReset} onShowExclusions={onShowExclusions} />

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-[10px] text-[#5C4033]/60">{done} of {config.totalCases} cases</span>
          <div className="flex items-baseline gap-2">
            <span className="text-[9px] text-[#5C4033]/45">
              {pace && pace.daysRemaining > 0 ? `${pace.daysRemaining}d left` : 'due'}
            </span>
            <StateChip state={state} />
          </div>
        </div>
        <div className="h-[2px] bg-[#5C4033]/6 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${completionPct}%`, backgroundColor: '#3D5A35', opacity: 0.6 }}
          />
        </div>
      </div>

      {pace && (
        <div className="max-w-[148px] mx-auto w-full">
          <TGRGauge pace={pace.pace} band={pace.band} />
        </div>
      )}

      {template && (
        <div className="border-t border-[#5C4033]/6 pt-3 flex flex-col gap-1.5">
          <p className="text-xs text-[#3B2F2F]/80 leading-relaxed">{template.status(ctx)}</p>
          {template.action(ctx) && (
            <div className="flex items-start gap-2 mt-1 px-3 py-2 rounded-lg" style={{ background: 'rgba(217,208,196,0.25)' }}>
              <span className="text-[#3D5A35] text-xs mt-[1px]">&rarr;</span>
              <p className="text-[11px] text-[#3B2F2F]/75 leading-snug">{template.action(ctx)}</p>
            </div>
          )}
          {template.detail(ctx) && <p className="text-[9px] text-[#5C4033]/40">{template.detail(ctx)}</p>}
          {(state === 'completeEarly' || state === 'fellShort') && (
            <div className="flex items-center gap-2 mt-1">
              <button onClick={onReset} className="gt-cta flex-1 !py-2 !text-[11px]">Set a new goal</button>
              {state === 'fellShort' && (
                <button onClick={onQuickAdjust} className="flex-1 !py-2 text-[11px] font-semibold rounded-[10px] border border-[#3D5A35]/25 text-[#3D5A35]">
                  Adjust goal
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {perType.length > 0 && (
        <div className="border-t border-[#5C4033]/6 pt-3 grid grid-cols-3 gap-x-3 gap-y-3">
          {perType.map((row) => {
            const pct = row.target > 0 ? Math.min(100, (row.done / row.target) * 100) : 0
            const barColor = row.pace ? bandColor(row.pace.band) : pct >= 100 ? '#3D5A35' : '#C4A882'
            return (
              <div key={row.type} className="flex flex-col gap-1">
                <span className="text-[8px] font-semibold text-[#5C4033]/38 truncate">{row.type.split(' ')[0]}</span>
                <div className="h-[2px] bg-[#5C4033]/7 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: barColor, opacity: 0.75 }} />
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

function bandColor(band: string): string {
  switch (band) {
    case 'ahead':
    case 'onTrack':
      return '#3D5A35'
    case 'slightlyBehind':
      return '#9a8a3a'
    case 'behind':
      return '#c08329'
    default:
      return '#b23a30'
  }
}

export function HeaderRow({
  onEdit,
  onReset,
  onShowExclusions,
}: {
  onEdit: () => void
  onReset: () => void
  onShowExclusions: () => void
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={onShowExclusions}
        className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold text-[#3D5A35]/50 hover:text-[#3D5A35] transition-colors"
      >
        <Settings2 className="w-2.5 h-2.5" /> Exclusions
      </button>
      <span className="text-[#5C4033]/25 text-[10px]">&middot;</span>
      <button
        onClick={onEdit}
        className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold text-[#3D5A35]/60 hover:text-[#3D5A35] transition-colors"
      >
        <Settings2 className="w-2.5 h-2.5" /> Edit
      </button>
      <span className="text-[#5C4033]/25 text-[10px]">&middot;</span>
      <button
        onClick={onReset}
        className="text-[9px] uppercase tracking-wider font-semibold text-[#5C4033]/35 hover:text-[#5C4033]/65 transition-colors"
      >
        Reset
      </button>
    </div>
  )
}
