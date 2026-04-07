'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, X, Info } from 'lucide-react';
import { COLORS, PARAM_WEIGHTS, PARAM_LABELS, FILTER_TYPES, FILTER_LEVELS } from '@/lib/constants';
import { filterDashboardEntries } from '@/lib/dashboard/live';
import { useDashboard } from './DashboardContext';

// ── Utility: compute weighted case score from 4 params ──
const computeWeightedScore = (c: any): number => {
  return (
    c.structure * PARAM_WEIGHTS.structure +
    c.delivery * PARAM_WEIGHTS.delivery +
    c.analysis * PARAM_WEIGHTS.analysis +
    c.creativity * PARAM_WEIGHTS.creativity
  );
};

// ── Utility: average an array of numbers ──
const avg = (arr: number[]): number =>
  arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : 0;

// ── Utility: score colour using ONLY the dashboard palette ──
const scoreColor = (score: number): string => {
  if (score >= 3.5) return COLORS.accent;
  if (score >= 2.5) return COLORS.warm;
  return COLORS.dark;
};

// ── Floating Weight Tooltip (portal-based, never clipped) ──
const WeightTooltip = ({
  anchorRef,
  visible,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  visible: boolean;
}) => {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const canUseDOM = typeof document !== 'undefined';

  useEffect(() => {
    if (visible && anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom - 102,
        left: rect.left + rect.width / 2,
      });
    }
  }, [visible, anchorRef]);

  if (!visible || !canUseDOM) return null;

  return createPortal(
    <div
      className="fixed z-[9999] animate-scale-in"
      style= {{top: pos.top, left: pos.left, transform: 'translateX(-50%)' }}
    >
      <div className="rounded-xl border border-[#5C4033]/10 bg-[#fff8f0] backdrop-blur-xl shadow-xl px-3 py-2.5 min-w-[130px]"
  style= {{boxShadow: '0 4px 24px rgba(92, 64, 51, 0.08), 0 1px 3px rgba(92, 64, 51, 0.06)' }}
>
        <p className="text-[8px] uppercase tracking-[0.12em] text-[#5C4033]/45 font-semibold mb-1.5">
          Score Weights
        </p>
        {Object.entries(PARAM_WEIGHTS).map(([key, w]) => (
          <div key={key} className="flex items-center justify-between py-[3px]">
            <span className="text-[10px] text-[#5C4033]/65 font-medium leading-none">
              {PARAM_LABELS[key]}
            </span>
            <span className="text-[10px] font-semibold text-[#3B2F2F] tabular-nums leading-none">
              {(w * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
};

// ── Score gauge (score-aware gradient) ──
const ScoreGauge = ({ score, max = 5 }: { score: number; max?: number }) => {
  const pct = (score / max) * 100;

  return (
    <div className="w-full flex flex-col gap-1">
      <div className="relative h-2 w-full rounded-full bg-[#D9D0C4]/30 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${COLORS.warm}, ${scoreColor(score)})`,
          }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-[#fff8f0] shadow-sm transition-all duration-1000 ease-out"
          style={{
            left: `calc(${pct}% - 6px)`,
            backgroundColor: scoreColor(score),
          }}
        />
      </div>
      <div className="flex justify-between px-0.5">
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            className="text-[8px] font-medium"
            style= {{color: n <= Math.round((score / max) * 5) ? COLORS.warm : '#D9D0C4' }}
          >
            {n}
          </span>
        ))}
      </div>
    </div>
  );
};

// ── Mini horizontal bar for drilldown rows (score-aware gradient) ──
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

// ── Breakdown column used for both Case Type and Difficulty ──
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
interface CaseScoreCardProps {
  filters: {
    types: string[];
    levels: string[];
    time: string;
    customStart: string;
    customEnd: string;
  };
}

const CaseScoreCard = ({ filters }: CaseScoreCardProps) => {
  const { entries } = useDashboard();
  const [showDrilldown, setShowDrilldown] = useState(false);
  const [showWeights, setShowWeights] = useState(false);
  const weightBtnRef = useRef<HTMLButtonElement>(null);

  // ── Filter cases ──
  const filteredCases = useMemo(() => {
    return filterDashboardEntries(entries, filters);
  }, [entries, filters]);

  // ── Computed scores ──
  const overallScore = useMemo(() => {
    if (filteredCases.length === 0) return 0;
    return +avg(filteredCases.map(computeWeightedScore)).toFixed(1);
  }, [filteredCases]);

  const scoreByType = useMemo(() => {
    const activeTypes = filters.types.length > 0 ? filters.types : FILTER_TYPES;
    return activeTypes
      .map((type) => {
        const cases = filteredCases.filter((c) => c.type === type);
        return { name: type, score: avg(cases.map(computeWeightedScore)), count: cases.length };
      })
      .filter((d) => d.count > 0)
      .sort((a, b) => b.score - a.score);
  }, [filteredCases, filters.types]);

  const scoreByLevel = useMemo(() => {
    const activeLevels = filters.levels.length > 0 ? filters.levels : FILTER_LEVELS;
    return activeLevels
      .map((level) => {
        const cases = filteredCases.filter((c) => c.level === level);
        return { name: level, score: avg(cases.map(computeWeightedScore)), count: cases.length };
      })
      .filter((d) => d.count > 0);
  }, [filteredCases, filters.levels]);

  const noData = filteredCases.length === 0;

// ── Animated score count-up ──
const [displayScore, setDisplayScore] = useState(0);
useEffect(() => {
  const duration = 600;
  const start = performance.now();
  const target = overallScore;
  const animate = (now: number) => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    setDisplayScore(+(eased * target).toFixed(1));
    if (progress < 1) requestAnimationFrame(animate);
  };
  requestAnimationFrame(animate);
}, [overallScore])

return (
    <>
      <div
  onClick={() => !noData && setShowDrilldown(true)}
  className="glass-card p-6 flex flex-col justify-between transition-all duration-300 ease-out relative overflow-visible cursor-pointer hover:bg-[#D9D0C4]/20 hover:-translate-y-0.5 hover:shadow-lg group"
>
        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-3">          <div>
            <div className="eyebrow !mb-1 flex items-center">OVERALL ASSESSMENT</div>
            <h3 className="text-sm font-medium text-[#3B2F2F] tracking-tight flex items-center gap-1">
              Case Score
              <button
                ref={weightBtnRef}
                onMouseEnter={() => setShowWeights(true)}
                onMouseLeave={() => setShowWeights(false)}
                className="w-3.5 h-3.5 flex items-center justify-center text-[#5C4033]/30 hover:text-[#5C4033]/60 transition-colors"
              >
                <Info className="w-3 h-3" />
              </button>
            </h3>
          </div>
        </div>

        {/* Portal-based weight tooltip */}
        <WeightTooltip anchorRef={weightBtnRef} visible={showWeights} />

        {noData ? (
          <div className="flex-1 flex items-center justify-center py-4">
            <p className="text-xs text-[#5C4033]/50 text-center">No cases match your current filters.</p>
          </div>
        ) : (
          <>
            {/* ── Score display + gauge ── */}
            <div className="flex items-center gap-4 mb-1">
              <div className="flex items-baseline shrink-0 relative">
  <div
    className="absolute -inset-3 rounded-full opacity-15 blur-xl pointer-events-none"
    style= {{backgroundColor: scoreColor(overallScore) }}
  />
  <span className="relative font-serif text-2xl font-bold text-[#3B2F2F] tracking-tight tabular-nums">
  {displayScore}
</span>
</div>
              <div className="flex-1 min-w-0">
                <ScoreGauge score={overallScore} />
              </div>
            </div>

            {/* ── Drilldown hint ── */}
            <span className="text-[9px] text-[#5C4033]/40 mt-2 group-hover:text-[#5C4033]/60 transition-all tracking-wide flex items-center gap-0.5">
  View Breakdown
  <ChevronRight className="w-2.5 h-2.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
</span>

          </>
        )}
      </div>

      {/* ── Drilldown overlay (ScoreOverlay-consistent layout) ── */}
      {showDrilldown && (
  <div className="absolute inset-0 z-40 flex items-center justify-center p-6" onClick={() => setShowDrilldown(false)} style={{ borderRadius: 'inherit' }}>
    <div className="absolute inset-0 bg-[#fff8f0]/40 backdrop-blur-md" style={{ borderRadius: 'inherit' }} />
    <div
      className="relative bg-[#fff8f0]/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-[#5C4033]/12 w-full max-w-md animate-scale-in overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
            {/* Header — matches ScoreOverlay */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#5C4033]/10">
  <div className="flex items-center gap-2">
    <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[#5C4033]/55">
      SCORE BREAKDOWN
    </span>
    <span className="text-[10px] text-[#5C4033]/30">·</span>
    <span className="text-xs font-semibold text-[#3B2F2F] tabular-nums">
      {overallScore} / 5
    </span>
  </div>
  <div className="flex items-center gap-2.5">
    <span className="text-[9px] font-medium text-[#5C4033]/30 tabular-nums tracking-wide">
      {filteredCases.length} {filteredCases.length === 1 ? 'case' : 'cases'}
    </span>
    <button
      onClick={() => setShowDrilldown(false)}
      className="w-5 h-5 flex items-center justify-center rounded-full bg-[#D9D0C4]/50 text-[#5C4033] hover:bg-[#3B2F2F] hover:text-[#F0EBE3] transition-colors"
    >
      <X className="w-2.5 h-2.5" />
    </button>
  </div>
</div>

            {/* Body — two columns: Case Type | Difficulty */}
            <div className="p-4 flex gap-6">
              <BreakdownColumn label="Type" data={scoreByType} />
              <div className="w-px bg-[#5C4033]/10 shrink-0" />
              <BreakdownColumn label="Level" data={scoreByLevel} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CaseScoreCard;
