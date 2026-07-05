'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { COLORS, FILTER_TYPES, FILTER_LEVELS } from '@/lib/constants';
import { filterDashboardEntries } from '@/lib/dashboard/live';
import { useDashboard } from './DashboardContext';

// ── Utility: average an array of numbers (same as CaseScoreCard) ──
const avg = (arr: number[]): number =>
  arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;

// ── Score colour (consistent with CaseScoreCard / HighestScoreCard / LowestScoreCard) ──
const scoreColor = (score: number): string => {
  if (score >= 3.5) return COLORS.accent;
  if (score >= 2.5) return COLORS.warm;
  return COLORS.dark;
};

const DotGauge = ({ score, max = 5 }: { score: number; max?: number }) => {
  const [visible, setVisible] = useState(false);
  const targetPct = (score / max) * 100;
  const pct = visible ? targetPct : 0;

  useEffect(() => {
    // Force a paint at 0% first, then animate
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setVisible(true);
      });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // Re-animate when score changes (filter change)
  useEffect(() => {
    setVisible(false);
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setVisible(true);
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [score]);

  return (
    <div className="relative h-[20px] w-full flex items-center">
      <div className="absolute left-0 right-0 h-[1px] bg-[#D9D0C4]/30" />
      <div
        className="absolute left-0 h-[2px] rounded-full transition-all duration-700 ease-out"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${COLORS.warm}60, ${COLORS.dark}, ${scoreColor(score)})`,
        }}
      />
      <div
        className="absolute rounded-full transition-all duration-700 ease-out shadow-sm"
        style={{
          left: `calc(${pct}% - 5px)`,
          width: pct < 40 ? '12px' : '10px',
          height: pct < 40 ? '12px' : '10px',
          opacity: visible ? 1 : 0,
          backgroundColor: scoreColor(score),
          boxShadow: `0 0 8px ${scoreColor(score)}40`,
        }}
      />
    </div>
  );
};

// ── Mini horizontal bar for drilldown rows (exact same as CaseScoreCard MiniBar) ──
const MiniBar = ({ score, max = 5 }: { score: number; max?: number }) => (
  <div className="relative h-[5px] w-full rounded-full bg-[#D9D0C4]/20 overflow-hidden">
    <div
      className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
      style={{
        width: `${(score / max) * 100}%`,
        background: `linear-gradient(90deg, ${COLORS.warm}, ${scoreColor(score)})`,
      }}
    />
  </div>
);

// ── Breakdown column (exact same as CaseScoreCard BreakdownColumn) ──
const BreakdownColumn = ({ label, data }: { label: string; data: { name: string; score: number }[] }) => (
  <div className="flex-1 min-w-0">
    <p className="text-[10px] uppercase tracking-wider font-semibold text-[#5C4033]/60 mb-2">{label}</p>
    <div className="flex flex-col gap-2">
      {data.map((d) => (
        <div key={d.name} className="flex items-center gap-2">
          <span className="text-xs text-[#5C4033]/70 font-medium w-[80px] truncate shrink-0">
            {d.name}
          </span>
          <div className="flex-1 min-w-0">
            <MiniBar score={d.score} />
          </div>
          <span className="text-xs font-medium text-[#3B2F2F] tabular-nums w-8 text-right shrink-0">
            {d.score}
          </span>
        </div>
      ))}
    </div>
  </div>
);

// ══════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════
interface ParameterBarChartProps {
  filters: {
    types: string[];
    levels: string[];
    time: string;
    customStart: string;
    customEnd: string;
  };
}

const ParameterBarChart = ({ filters }: ParameterBarChartProps) => {
  const { entries, isPreview } = useDashboard();
  const [drillDown, setDrillDown] = useState<string | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const closeDrilldown = () => {
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    setDrillDown(null);
  };

  const handleBarMouseEnter = (paramName: string) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    // 500ms delay so a passing hover doesn't trigger the overlay
    hoverTimerRef.current = setTimeout(() => setDrillDown(paramName), 650);
  };

  const handleBarMouseLeave = () => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
  };

  const handleBarClick = (paramName: string) => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    setDrillDown(paramName);
  };

  // These run on the inner modal card, not the full-card backdrop.
  // This means the overlay closes when the mouse leaves the modal window,
  // not when it leaves the card — so users can switch parameters without
  // dragging the cursor far away.
  const handleOverlayMouseEnter = () => {
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
  };

  const handleOverlayMouseLeave = () => {
    closeTimerRef.current = setTimeout(() => setDrillDown(null), 200);
  };

  // ── Filter cases (same logic as CaseScoreCard) ──
  const filteredCases = useMemo(() => {
    return filterDashboardEntries(entries, filters).filter((c) => !c.isUnrated);
  }, [entries, filters]);

  // ── Compute parameter scores from filtered cases ──
  // Standard dashboard order + short names: Structure, Understanding, Delivery, Creativity
  const parameterScores = useMemo(() => {
    const params: { name: string; key: string }[] = [
      { name: 'Structure', key: 'structure' },
      { name: 'Understanding', key: 'analysis' },
      { name: 'Delivery', key: 'delivery' },
      { name: 'Creativity', key: 'creativity' },
    ];
    return params.map((p) => ({
      name: p.name,
      score: avg(filteredCases.map((c) => (c as any)[p.key])),
    }));
  }, [filteredCases]);

  // ── Display-name → data-key map (display names no longer match keys) ──
  const NAME_TO_KEY: Record<string, 'structure' | 'analysis' | 'delivery' | 'creativity'> = {
    Structure: 'structure',
    Understanding: 'analysis',
    Delivery: 'delivery',
    Creativity: 'creativity',
  };

  // ── Compute drilldown: score by Case Type for selected parameter ──
  const scoreByType = useMemo(() => {
    const paramKey = drillDown ? NAME_TO_KEY[drillDown] : undefined;
    if (!paramKey) return [];

    const activeTypes = filters.types.length > 0 ? filters.types : FILTER_TYPES;
    return activeTypes
      .map((type) => {
        const cases = filteredCases.filter((c) => c.type === type);
        const scores = cases.map((c) => (c as any)[paramKey]);
        return { name: type, score: avg(scores), count: cases.length };
      })
      .filter((d) => d.count > 0)
      .sort((a, b) => b.score - a.score);
  }, [drillDown, filteredCases, filters.types]);

  // ── Compute drilldown: score by Difficulty for selected parameter ──
  const scoreByLevel = useMemo(() => {
    const paramKey = drillDown ? NAME_TO_KEY[drillDown] : undefined;
    if (!paramKey) return [];

    const activeLevels = filters.levels.length > 0 ? filters.levels : FILTER_LEVELS;
    return activeLevels
      .map((level) => {
        const cases = filteredCases.filter((c) => c.level === level);
        const scores = cases.map((c) => (c as any)[paramKey]);
        return { name: level, score: avg(scores), count: cases.length };
      })
      .filter((d) => d.count > 0);
  }, [drillDown, filteredCases, filters.levels]);

  // ── Overall score for selected parameter (for drilldown header) ──
  const drillDownOverallScore = useMemo(() => {
    const paramKey = drillDown ? NAME_TO_KEY[drillDown] : undefined;
    if (!paramKey) return 0;
    return avg(filteredCases.map((c) => (c as any)[paramKey]));
  }, [drillDown, filteredCases]);

  const noData = filteredCases.length === 0;

  return (
    <div
      className="glass-card p-6 flex flex-col relative overflow-hidden h-full min-h-[280px] group transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-lg"
      onMouseLeave={drillDown ? closeDrilldown : undefined}
    >
      {/* ── Header ── */}
      <div className="mb-5">
        <div className="eyebrow !mb-1 flex items-center">PARAMETER ANALYSIS</div>
        <h3 className="text-sm font-medium text-[#3B2F2F] tracking-tight">Skill Profile</h3>
      </div>

      {/* ── Main chart — custom CSS bars ── */}
      {!drillDown && (
        <div className="flex-1 flex flex-col justify-center gap-4 animate-scale-in">
          {noData ? (
            <div className="flex-1 flex items-center justify-center py-4">
              <p className="text-[11px] text-[#5C4033]/45 tracking-[0.01em] text-center">
                {isPreview ? 'Sign in to see your skill profile.' : entries.length === 0 ? 'Complete a case to see your skill profile.' : 'No cases match your filters.'}
              </p>
            </div>
          ) : (
            <>
              {parameterScores.map((entry) => (
                <button
                  key={entry.name}
                  onClick={() => handleBarClick(entry.name)}
                  onMouseEnter={() => handleBarMouseEnter(entry.name)}
                  onMouseLeave={handleBarMouseLeave}
                  className="flex items-center gap-3 group/bar cursor-pointer hover:bg-[#D9D0C4]/15 -mx-2 px-2 py-1.5 rounded-lg transition-all duration-200"
                >
                  <span className="text-[11px] font-medium text-[#5C4033]/70 w-[88px] text-right shrink-0 group-hover/bar:text-[#3B2F2F] transition-colors">
                    {entry.name}
                  </span>
                  <div className="flex-1 min-w-0 group-hover/bar:scale-[1.02] transition-transform">
  <DotGauge score={entry.score} />
</div>
                  <span className="text-xs font-semibold text-[#3B2F2F] tabular-nums w-7 text-right shrink-0">
                    {entry.score}
                  </span>
                </button>
              ))}

              {/* ── Helper line ── */}
              <span className="text-[9px] text-[#5C4033]/40 mt-1 group-hover:text-[#5C4033]/60 transition-all tracking-wide flex items-center gap-0.5 justify-center">
                Hover over a skill to explore
                <ChevronRight className="w-2.5 h-2.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
              </span>
            </>
          )}
        </div>
      )}

      {/* ── Drilldown overlay (exact CaseScoreCard pattern — two columns) ── */}
      {drillDown && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center p-6"
          style={{ borderRadius: 'inherit' }}
        >
          {/* Glass backdrop */}
          <div
            className="absolute inset-0 bg-[#fff8f0]/40 backdrop-blur-md"
            style={{ borderRadius: 'inherit' }}
          />

          {/* Inner modal — hover handlers live here so the overlay closes when
              the mouse leaves the modal window, not when it leaves the card. */}
          <div
            className="relative bg-[#fff8f0]/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-[#5C4033]/12 w-full max-w-md animate-scale-in overflow-hidden"
            onMouseEnter={handleOverlayMouseEnter}
            onMouseLeave={handleOverlayMouseLeave}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
<div className="flex items-center justify-between px-4 py-3 border-b border-[#5C4033]/10">
  <div className="flex items-center gap-2">
    <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[#5C4033]/55">
      {drillDown}
    </span>
    <span className="text-[10px] text-[#5C4033]/30">·</span>
    <span className="text-xs font-semibold text-[#3B2F2F] tabular-nums">
      {drillDownOverallScore} / 5
    </span>
  </div>
  <div className="flex items-center gap-2.5">
    <span className="text-[9px] font-medium text-[#5C4033]/30 tabular-nums tracking-wide">
      {filteredCases.length} {filteredCases.length === 1 ? 'case' : 'cases'}
    </span>
    <button
      onClick={closeDrilldown}
      className="w-5 h-5 flex items-center justify-center rounded-full bg-[#D9D0C4]/50 text-[#5C4033] hover:bg-[#3B2F2F] hover:text-[#F0EBE3] transition-colors"
    >
      <X className="w-2.5 h-2.5" />
    </button>
  </div>
</div>

            {/* Body — two columns: Case Type | Difficulty (exact CaseScoreCard layout) */}
            <div className="p-4 flex gap-6">
              <BreakdownColumn label="Type" data={scoreByType} />
              <div className="w-px bg-[#5C4033]/10 shrink-0" />
              <BreakdownColumn label="Level" data={scoreByLevel} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParameterBarChart;
