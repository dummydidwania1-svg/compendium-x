'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, X, Info } from 'lucide-react';
import { COLORS, PARAM_LABELS, FILTER_TYPES, FILTER_LEVELS, CASE_TYPE_WEIGHTS, DEFAULT_CASE_WEIGHTS, getCaseTypeWeights } from '@/lib/constants';
import { filterDashboardEntries } from '@/lib/dashboard/live';
import { useDashboard } from './DashboardContext';

// ── Utility: compute weighted case score using per-type matrix ──
const computeWeightedScore = (c: any): number => {
  const w = getCaseTypeWeights(c.type);
  return (
    (c.structure ?? 0) * w.structure +
    (c.analysis ?? 0) * w.analysis +
    (c.delivery ?? 0) * w.delivery +
    (c.creativity ?? 0) * w.creativity
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

// ── Pastel tints from the dashboard's timeline chart line palette ──
// `short` matches the Skill Profile panel's vocabulary so the legend stays one line.
const PARAM_META: { key: string; label: string; short: string; fill: string }[] = [
  { key: 'structure',  label: PARAM_LABELS.structure,  short: 'Structure',     fill: '#A08878' },
  { key: 'analysis',   label: PARAM_LABELS.analysis,   short: 'Understanding', fill: '#6B9E7E' },
  { key: 'delivery',   label: PARAM_LABELS.delivery,   short: 'Delivery',      fill: '#C8A280' },
  { key: 'creativity', label: PARAM_LABELS.creativity,  short: 'Creativity',    fill: '#7E9EAA' },
];

const MATRIX_TYPES = [
  'Profitability', 'Market Entry', 'Growth', 'Pricing', 'Guesstimate', 'Unconventional',
] as const;

// ── Heatmap grid row — pct as quiet text on a weight-scaled tint ──
// Hovering a cell drives the shared highlight, so the legend lights up too.
const WeightRow = ({
  type, animate, rowIndex, highlightIdx, onCellEnter, onCellLeave,
}: {
  type: string;
  animate: boolean;
  rowIndex: number;
  highlightIdx: number | null;
  onCellEnter: (i: number) => void;
  onCellLeave: () => void;
}) => {
  const w = getCaseTypeWeights(type);
  const cells = [
    { ...PARAM_META[0], pct: w.structure  * 100 },
    { ...PARAM_META[1], pct: w.analysis   * 100 },
    { ...PARAM_META[2], pct: w.delivery   * 100 },
    { ...PARAM_META[3], pct: w.creativity * 100 },
  ];
  const maxPct = Math.max(...cells.map((c) => c.pct));

  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-right text-[10px] text-[#5C4033]/55 leading-none" style={{ width: 84 }}>
        {type}
      </span>

      {cells.map((cell, i) => {
        const dimmed = highlightIdx !== null && highlightIdx !== i;
        const lit = highlightIdx === i;
        const isMax = cell.pct === maxPct && maxPct > 25;
        return (
          <div
            key={cell.key}
            className="flex-1 flex items-center justify-center rounded-md cursor-default"
            onMouseEnter={() => onCellEnter(i)}
            onMouseLeave={onCellLeave}
            style={{
              height: 24,
              // tint intensity tracks the weight: 15% → faint, 40% → present
              background: `color-mix(in srgb, ${cell.fill} ${Math.round(cell.pct * (lit ? 1.25 : 0.95))}%, transparent)`,
              opacity: animate ? (dimmed ? 0.25 : 1) : 0,
              transform: lit ? 'scale(1.05)' : 'scale(1)',
              transition: [
                `opacity 0.25s ease ${animate && highlightIdx === null ? rowIndex * 40 + i * 20 : 0}ms`,
                'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
                'background 0.25s ease',
              ].join(', '),
            }}
          >
            <span
              className={`text-[10px] tabular-nums leading-none select-none ${isMax || lit ? 'font-semibold' : 'font-normal'}`}
              style={{
                color: lit ? 'rgba(59,47,47,0.9)' : 'rgba(59,47,47,0.72)',
                transition: 'color 0.2s ease',
              }}
            >
              {cell.pct.toFixed(0)}%
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ── Legend — hover highlights, click pins; lights up when a grid cell is hovered ──
const WeightLegend = ({
  highlightIdx,
  pinnedIdx,
  onEnter,
  onLeave,
  onPin,
}: {
  highlightIdx: number | null;
  pinnedIdx: number | null;
  onEnter: (i: number) => void;
  onLeave: () => void;
  onPin: (i: number) => void;
}) => (
  <div className="flex items-center justify-center gap-x-5 flex-nowrap">
    {PARAM_META.map(({ key, fill, short }, i) => {
      const lit = highlightIdx === i;
      const active = highlightIdx === null || lit;
      const pinned = pinnedIdx === i;
      return (
        <button
          key={key}
          type="button"
          className="flex items-center gap-1.5 cursor-pointer bg-transparent border-0 p-0"
          onMouseEnter={() => onEnter(i)}
          onMouseLeave={onLeave}
          onClick={() => onPin(i)}
          style={{ opacity: active ? 1 : 0.3, transition: 'opacity 0.18s ease' }}
        >
          <div
            className="w-[6px] h-[6px] rounded-full shrink-0"
            style={{
              backgroundColor: fill,
              opacity: lit ? 1 : 0.8,
              transform: lit ? 'scale(1.5)' : 'scale(1)',
              boxShadow: pinned ? `0 0 0 2.5px color-mix(in srgb, ${fill} 25%, transparent)` : 'none',
              transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.18s ease, box-shadow 0.2s ease',
            }}
          />
          <span
            className="text-[9px] leading-none whitespace-nowrap"
            style={{
              color: lit ? fill : 'rgba(92,64,51,0.55)',
              fontWeight: lit || pinned ? 600 : 400,
              transition: 'color 0.18s ease',
            }}
          >
            {short}
          </span>
        </button>
      );
    })}
  </div>
);

// ── Floating Weight Matrix Tooltip — always above the anchor ──
const WeightTooltip = ({
  anchorRef,
  visible,
  onMouseEnter,
  onMouseLeave,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  visible: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) => {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [animate, setAnimate] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [pinnedIdx, setPinnedIdx] = useState<number | null>(null);
  // Hover wins while active; a pinned selection persists after mouse-out.
  const highlightIdx = hoverIdx ?? pinnedIdx;
  const cardRef = useRef<HTMLDivElement>(null);
  const canUseDOM = typeof document !== 'undefined';

  useEffect(() => {
    if (visible && anchorRef.current) {
      const anchor = anchorRef.current.getBoundingClientRect();
      const cardW = 440;
      let left = anchor.left + anchor.width / 2 - cardW / 2;
      left = Math.max(12, Math.min(left, window.innerWidth - cardW - 12));
      setPos({ top: -9999, left });
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (cardRef.current) {
          const cardH = cardRef.current.offsetHeight;
          // Keep clear of the sticky navbar: if opening above would collide
          // with it, open to the right of the anchor instead.
          const nav = document.querySelector('nav, header');
          const safeTop = (nav ? nav.getBoundingClientRect().bottom : 0) + 8;
          let top = anchor.top - cardH - 10;
          let l = left;
          if (top < safeTop) {
            l = anchor.right + 14;
            top = Math.max(
              safeTop,
              Math.min(anchor.top + anchor.height / 2 - cardH / 2, window.innerHeight - cardH - 12),
            );
            if (l + cardW > window.innerWidth - 12) {
              // No room on the right either — fall back to below the anchor.
              l = left;
              top = anchor.bottom + 10;
            }
          }
          setPos({ top, left: l });
        }
        setAnimate(true);
      }));
    } else {
      setAnimate(false);
      setHoverIdx(null);
      setPinnedIdx(null);
    }
  }, [visible, anchorRef]);

  if (!visible || !canUseDOM) return null;

  return createPortal(
    <div
      className="fixed z-[9999]"
      style={{ top: pos.top, left: pos.left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        ref={cardRef}
        className="rounded-xl border border-[#5C4033]/10 bg-[#fff8f0]/95 backdrop-blur-xl"
        style={{
          width: 440,
          boxShadow: '0 6px 28px rgba(92,64,51,0.09), 0 1px 4px rgba(92,64,51,0.04)',
          animation: 'weight-card-in 0.2s cubic-bezier(0.16,1,0.3,1) both',
        }}
      >
        {/* Header */}
        <div className="pt-4 pb-3 text-center">
          <p className="text-[9px] uppercase tracking-[0.15em] text-[#5C4033]/45 font-semibold leading-none">
            How is Case Score calculated?
          </p>
        </div>

        {/* Weight grid */}
        <div className="px-5 flex flex-col gap-[5px]">
          {MATRIX_TYPES.map((type, i) => (
            <WeightRow
              key={type}
              type={type}
              animate={animate}
              rowIndex={i}
              highlightIdx={highlightIdx}
              onCellEnter={setHoverIdx}
              onCellLeave={() => setHoverIdx(null)}
            />
          ))}
        </div>

        {/* Legend — one line, two-way interactive: hover highlights, click pins */}
        <div className="px-5 pt-3 pb-4">
          <WeightLegend
            highlightIdx={highlightIdx}
            pinnedIdx={pinnedIdx}
            onEnter={setHoverIdx}
            onLeave={() => setHoverIdx(null)}
            onPin={(i) => setPinnedIdx((prev) => (prev === i ? null : i))}
          />
        </div>
      </div>

      <style>{`
        @keyframes weight-card-in {
          from { opacity: 0; transform: translateY(4px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0)  scale(1); }
        }
      `}</style>
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
            style={{ color: n <= Math.round((score / max) * 5) ? COLORS.warm : '#D9D0C4' }}
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
  const { entries, isPreview } = useDashboard();
  const [showDrilldown, setShowDrilldown] = useState(false);
  const [showWeights, setShowWeights] = useState(false);
  const weightBtnRef = useRef<HTMLButtonElement>(null);
  const weightShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const weightHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (weightShowTimerRef.current) clearTimeout(weightShowTimerRef.current);
    if (weightHideTimerRef.current) clearTimeout(weightHideTimerRef.current);
  }, []);

  const handleWeightEnter = () => {
    if (weightHideTimerRef.current) { clearTimeout(weightHideTimerRef.current); weightHideTimerRef.current = null; }
    if (!showWeights) weightShowTimerRef.current = setTimeout(() => setShowWeights(true), 150);
  };

  const handleWeightLeave = () => {
    if (weightShowTimerRef.current) { clearTimeout(weightShowTimerRef.current); weightShowTimerRef.current = null; }
    weightHideTimerRef.current = setTimeout(() => setShowWeights(false), 250);
  };

  // ── Filter cases ──
  const filteredCases = useMemo(() => {
    return filterDashboardEntries(entries, filters).filter((c) => !c.isUnrated);
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
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(+(eased * target).toFixed(1));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [overallScore]);

  return (
    <>
      <div
        onClick={() => !noData && setShowDrilldown(true)}
        className="glass-card p-6 flex flex-col justify-between transition-all duration-300 ease-out relative overflow-visible cursor-pointer hover:bg-[#D9D0C4]/20 hover:-translate-y-0.5 hover:shadow-lg group"
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="eyebrow !mb-1 flex items-center">OVERALL ASSESSMENT</div>
            <h3 className="text-sm font-medium text-[#3B2F2F] tracking-tight flex items-center gap-1">
              Case Score
              <button
                ref={weightBtnRef}
                onMouseEnter={handleWeightEnter}
                onMouseLeave={handleWeightLeave}
                className="w-3.5 h-3.5 flex items-center justify-center text-[#5C4033]/30 hover:text-[#5C4033]/60 transition-colors"
              >
                <Info className="w-3 h-3" />
              </button>
            </h3>
          </div>
        </div>

        {/* Portal-based weight tooltip */}
        <WeightTooltip
          anchorRef={weightBtnRef}
          visible={showWeights}
          onMouseEnter={handleWeightEnter}
          onMouseLeave={handleWeightLeave}
        />

        {noData ? (
          <div className="flex-1 flex items-center justify-center py-4">
            <p className="text-[11px] text-[#5C4033]/45 tracking-[0.01em] text-center">
              {isPreview ? 'Sign in to see your score.' : entries.length === 0 ? 'Complete a case to see your score.' : 'No cases match your filters.'}
            </p>
          </div>
        ) : (
          <>
            {/* ── Score display + gauge ── */}
            <div className="flex items-center gap-4 mb-1">
              <div className="flex items-baseline shrink-0 relative">
                <div
                  className="absolute -inset-3 rounded-full opacity-15 blur-xl pointer-events-none"
                  style={{ backgroundColor: scoreColor(overallScore) }}
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
