'use client';

import React, { useState, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { CheckCircle2, ChevronRight, X, SlidersHorizontal, Info } from 'lucide-react';
import { COLORS } from '@/lib/constants';
import { filterDashboardEntries } from '@/lib/dashboard/live';
import { useDashboard } from './DashboardContext';

const formatChartDate = (dateStr: string): string => {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${months[m - 1]} ${String(d).padStart(2, '0')}|${String(y).slice(2)}`;
};

// ── Custom X-axis tick: "Oct 05" primary + "'24" dimmer below ──
const CustomXTick = ({ x, y, payload }: any) => {
  const [datePart, yearPart] = (payload.value as string).split('|');
  return (
    <g transform={`translate(${x},${y})`}>
      <text dy={12} textAnchor="middle" fill={COLORS.warm} fontSize={10} opacity={0.6}>{datePart}</text>
      {yearPart && (
        <text dy={24} textAnchor="middle" fill={COLORS.warm} fontSize={8} opacity={0.3}>{`'${yearPart}`}</text>
      )}
    </g>
  );
};

// ── Extended color palette: 8 perceptually-distinct earth + sage tones ──
// Hue variety (brown → sage → terracotta → slate → amber → olive → caramel → mauve)
// so adjacent lines stay readable even at 6-8 series.
const LINE_COLORS = [
  '#3B2F2F', // espresso
  '#6B9E5E', // sage-green (accent — lighter for contrast vs espresso)
  '#C47A6A', // terracotta
  '#6E8FAA', // slate
  '#C8A256', // amber
  '#7E8C6A', // olive
  '#B8876A', // caramel
  '#9B8898', // mauve
];
const LINE_DASHES: (string | undefined)[] = [
  undefined,    // solid
  undefined,    // solid
  '6 3',        // long dash
  '2 3',        // dots
  undefined,    // solid
  '8 3 2 3',   // dash-dot
  '4 2',        // short dash
  '6 2 2 2',   // dash-dot-dot
];
const LINE_WIDTHS = [2.5, 2, 2, 2, 2, 2, 1.5, 1.5];

type MetricId = 'overall' | 'structure' | 'delivery' | 'analysis' | 'creativity';
type SplitBy  = 'none' | 'type' | 'level' | 'segment';

interface Segment { type: string; level: string; }

interface WorkflowState {
  metrics:   MetricId[];
  splitBy:   SplitBy;
  forFilter: { types: string[]; levels: string[] };
  segments:  Segment[];
}

interface ChartSeries {
  key:             string;
  name:            string;
  color:           string;
  dataKey:         string;
  strokeWidth:     number;
  strokeDasharray?: string;
  pointCount:      number;
}

interface Filters {
  types: string[]; levels: string[]; time: string; customStart: string; customEnd: string;
}

const METRIC_OPTIONS: { id: MetricId; label: string }[] = [
  { id: 'overall',    label: 'Overall Score' },
  { id: 'structure',  label: 'Structure'     },
  { id: 'delivery',   label: 'Delivery'      },
  { id: 'analysis',   label: 'Analysis'      },
  { id: 'creativity', label: 'Creativity'    },
];

const SPLIT_OPTIONS: { id: SplitBy; label: string }[] = [
  { id: 'none',  label: 'Together'   },
  { id: 'type',  label: 'Type'  },
  { id: 'level', label: 'Level' },
];

// ── Shared dropdown primitives ──
const DropdownPanel = ({ children, wide, xwide }: { children: React.ReactNode; wide?: boolean; xwide?: boolean }) => (
  <div className={`bg-[#fff8f0] rounded-2xl p-2 shadow-xl border border-[#5C4033]/12 ${xwide ? 'w-[280px]' : wide ? 'min-w-[180px]' : 'min-w-[160px]'}`}>
    {children}
  </div>
);

const DropdownHeader = ({ label, onClear }: { label: string; onClear?: () => void }) => (
  <div className="flex items-center justify-between px-2 pt-1.5 pb-2">
    <p className="text-[9px] uppercase tracking-widest text-[#5C4033]/50 font-semibold">{label}</p>
    {onClear && (
      <button onClick={onClear} className="text-[8px] text-[#5C4033]/35 hover:text-[#5C4033]/70 transition-colors flex items-center gap-0.5">
        <X className="w-2 h-2" /> Clear
      </button>
    )}
  </div>
);

const DropdownOption = ({
  label, isSelected, isRadio = false, onClick, disabled = false,
}: {
  label: string; isSelected: boolean; isRadio?: boolean; onClick: () => void; disabled?: boolean;
}) => (
  <button
    onClick={onClick} disabled={disabled}
    className={`w-full flex items-center gap-2 px-2 py-1.5 text-[11px] rounded-lg transition-colors text-left ${
      isSelected ? 'bg-[#3D5A35]/8 text-[#3B2F2F] font-medium' : 'text-[#5C4033] hover:bg-[#D9D0C4]/30'
    } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
  >
    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? 'bg-[#3B2F2F] border-[#3B2F2F]' : 'border-[#5C4033]/30'}`}>
      {isSelected && <CheckCircle2 className="w-2.5 h-2.5 text-[#F0EBE3]" />}
    </div>
    <span className="truncate">{label}</span>
  </button>
);

// ── Workflow Chip ──
const WorkflowChip = ({ prefix, value, isActive, isOpen, onClick, onMouseEnter, onMouseLeave, chipRef, children }: {
  prefix: string; value: string; isActive: boolean; isOpen: boolean;
  onClick: () => void; onMouseEnter?: () => void; onMouseLeave?: () => void;
  chipRef: React.RefObject<HTMLDivElement | null>; children: React.ReactNode;
}) => (
  <div ref={chipRef} className="relative" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
    <button
      onClick={onClick}
      className={`flex items-center gap-1 pl-2.5 pr-2 py-1 rounded-full text-[10px] font-medium transition-all duration-200 border ${
        isActive
          ? 'bg-[#3B2F2F] text-[#F0EBE3] border-[#3B2F2F] shadow-sm'
          : 'bg-[#fff8f0]/80 text-[#5C4033] border-[#5C4033]/15 hover:border-[#5C4033]/30 hover:bg-[#D9D0C4]/25'
      }`}
    >
      <span className={`text-[8px] uppercase tracking-wide font-bold ${isActive ? 'opacity-50' : 'opacity-35'}`}>{prefix}</span>
      <span className="font-semibold ml-0.5">{value}</span>
      <ChevronRight className={`w-2.5 h-2.5 ml-0.5 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''} ${isActive ? 'opacity-40' : 'opacity-25'}`} />
    </button>
    {isOpen && (
      <div className="absolute bottom-full left-0 mb-2 z-[60] animate-scale-in">
        {children}
      </div>
    )}
  </div>
);

// ── Dynamic Tooltip ──
const DynamicTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data  = payload[0]?.payload;
  if (!data) return null;
  const items = payload.filter((p: any) => p.value !== null && p.value !== undefined);
  if (!items.length) return null;
  return (
    <div className="glass-card p-3 !rounded-xl border-[#5C4033]/10 shadow-xl min-w-[160px] max-w-[230px]">
      <p className="text-[9px] font-semibold text-[#5C4033]/40 uppercase tracking-widest mb-1.5">{(data.date as string).replace('|', " '")}</p>
      {data.caseName && (
        <div className="mb-2">
          <p className="text-xs font-semibold text-[#3B2F2F] truncate leading-snug">{data.caseName}</p>
          <div className="flex gap-1 mt-0.5 flex-wrap">
            {data.caseType  && <span className="text-[8px] font-medium bg-[#3D5A35]/10 text-[#3B2F2F] px-1.5 py-px rounded">{data.caseType}</span>}
            {data.caseLevel && <span className="text-[8px] font-medium bg-[#D9D0C4]/50 text-[#5C4033] px-1.5 py-px rounded">{data.caseLevel}</span>}
          </div>
        </div>
      )}
      <div className="space-y-1 border-t border-[#5C4033]/8 pt-1.5">
        {items.map((p: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
              <span className="text-[10px] text-[#5C4033]/65 truncate">{p.name}</span>
            </div>
            <span className="text-[10px] font-bold text-[#3B2F2F] tabular-nums flex-shrink-0">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════
const TimeLineChart = ({ filters }: { filters: Filters }) => {
  const { entries, isPreview } = useDashboard();
  const [workflow, setWorkflow] = useState<WorkflowState>({ metrics: ['overall'], splitBy: 'none', forFilter: { types: [], levels: [] }, segments: [] });
  const [openChip, setOpenChip] = useState<'metric' | 'split' | 'for' | 'vs' | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const metricRef    = useRef<HTMLDivElement>(null);
  const splitRef     = useRef<HTMLDivElement>(null);
  const forRef       = useRef<HTMLDivElement>(null);
  const vsRef        = useRef<HTMLDivElement>(null);
  const hoverTimeRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const helpTimeRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const helpEnter = () => { if (helpTimeRef.current) clearTimeout(helpTimeRef.current); setShowHelp(true); };
  const helpLeave = () => { helpTimeRef.current = setTimeout(() => setShowHelp(false), 200); };

  const chipEnter = (id: 'metric' | 'split' | 'for' | 'vs') => {
    if (hoverTimeRef.current) clearTimeout(hoverTimeRef.current);
    setOpenChip(id);
  };
  const chipLeave = () => {
    hoverTimeRef.current = setTimeout(() => setOpenChip(null), 200);
  };
  const chipClick = () => setHasInteracted(true);

  // ── Global filter ──
  const filteredCases = useMemo(() => {
    return filterDashboardEntries(entries, filters);
  }, [entries, filters]);

  // Available options constrained by global filter
  const availableTypes = useMemo(() => {
    if (filters.types.length > 0) return filters.types;
    return [...new Set(filteredCases.map((c: any) => c.type))].sort() as string[];
  }, [filteredCases, filters.types]);

  const availableLevels = useMemo(() => {
    const order = ['Easy', 'Medium', 'Hard'];
    if (filters.levels.length > 0) return order.filter(l => filters.levels.includes(l));
    return order.filter(l => filteredCases.some((c: any) => c.level === l));
  }, [filteredCases, filters.levels]);

  // ── Workflow mutations ──
  const setSplitBy = (splitBy: SplitBy) => {
    setWorkflow(w => ({
      ...w, splitBy, forFilter: { types: [], levels: [] }, segments: [],
      metrics: splitBy !== 'none' && w.metrics.length > 1 ? [w.metrics[0]] : w.metrics,
    }));
    setOpenChip(null);
  };

  const toggleMetric = (id: MetricId) => {
    setWorkflow(w => {
      if (w.metrics.includes(id)) {
        return w.metrics.length === 1 ? w : { ...w, metrics: w.metrics.filter(m => m !== id) };
      }
      if (w.splitBy !== 'none') return { ...w, metrics: [id] };
      return { ...w, metrics: [...w.metrics, id] };
    });
  };

  const toggleForType = (val: string) => setWorkflow(w => ({
    ...w,
    forFilter: { ...w.forFilter, types: w.forFilter.types.includes(val) ? w.forFilter.types.filter(v => v !== val) : [...w.forFilter.types, val] },
  }));
  const toggleForLevel = (val: string) => setWorkflow(w => ({
    ...w,
    forFilter: { ...w.forFilter, levels: w.forFilter.levels.includes(val) ? w.forFilter.levels.filter(v => v !== val) : [...w.forFilter.levels, val] },
  }));
  const toggleVsMode = () => {
    setHasInteracted(true);
    if (workflow.splitBy === 'segment') {
      setWorkflow(w => ({ ...w, splitBy: 'none', segments: [], forFilter: { types: [], levels: [] } }));
      setOpenChip(null);
    } else {
      setWorkflow(w => ({
        ...w, splitBy: 'segment', forFilter: { types: [], levels: [] }, segments: [],
        metrics: w.metrics.length > 1 ? [w.metrics[0]] : w.metrics,
      }));
    }
  };

  const toggleSegment = (type: string, level: string) => setWorkflow(w => {
    const exists = w.segments.some(s => s.type === type && s.level === level);
    return { ...w, segments: exists ? w.segments.filter(s => !(s.type === type && s.level === level)) : [...w.segments, { type, level }] };
  });

  // ── Series + data generation ──
  const { chartData, series, maxSeriesPoints } = useMemo<{ chartData: any[]; series: ChartSeries[]; maxSeriesPoints: number }>(() => {
    let cases = filteredCases as any[];

    if (workflow.splitBy === 'none') {
      if (workflow.forFilter.types.length > 0) cases = cases.filter((c: any) => workflow.forFilter.types.includes(c.type));
      if (workflow.forFilter.levels.length > 0) cases = cases.filter((c: any) => workflow.forFilter.levels.includes(c.level));
      const sorted = [...cases].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const data = sorted.map(c => ({
        date: formatChartDate(c.date),
        overall: c.score, structure: c.structure, delivery: c.delivery,
        analysis: c.analysis, creativity: c.creativity,
        caseName: c.name, caseType: c.type, caseLevel: c.level,
      }));
      const s: ChartSeries[] = workflow.metrics.map((mid, i) => ({
        key: mid,
        name: METRIC_OPTIONS.find(m => m.id === mid)!.label,
        color: LINE_COLORS[i % LINE_COLORS.length],
        dataKey: mid === 'overall' ? 'overall' : mid,
        strokeWidth: LINE_WIDTHS[i] ?? 2,
        strokeDasharray: LINE_DASHES[i],
        pointCount: data.length,
      }));
      return { chartData: data, series: s, maxSeriesPoints: data.length };

    } else if (workflow.splitBy === 'type') {
      const groups      = workflow.forFilter.types.length > 0 ? workflow.forFilter.types : availableTypes;
      const mk          = workflow.metrics[0] === 'overall' ? 'score' : workflow.metrics[0];
      let activeCases   = cases.filter((c: any) => groups.includes(c.type));
      if (workflow.forFilter.levels.length > 0) activeCases = activeCases.filter((c: any) => workflow.forFilter.levels.includes(c.level));
      const sorted      = [...activeCases].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const data        = sorted.map(c => {
        const row: any = { date: formatChartDate(c.date), caseName: c.name, caseType: c.type, caseLevel: c.level };
        groups.forEach(g => { row[`t_${g}`] = c.type === g ? c[mk] : null; });
        return row;
      });
      const s: ChartSeries[] = groups.map((g, i) => ({
        key: `t_${g}`, name: g,
        color: LINE_COLORS[i % LINE_COLORS.length], dataKey: `t_${g}`, strokeWidth: 2,
        strokeDasharray: LINE_DASHES[i],
        pointCount: activeCases.filter((c: any) => c.type === g).length,
      }));
      const maxPts = groups.length ? Math.max(...s.map(s => s.pointCount)) : data.length;
      return { chartData: data, series: s, maxSeriesPoints: maxPts };

    } else if (workflow.splitBy === 'level') {
      const groups      = workflow.forFilter.levels.length > 0 ? workflow.forFilter.levels : availableLevels;
      const mk          = workflow.metrics[0] === 'overall' ? 'score' : workflow.metrics[0];
      let activeCases   = cases.filter((c: any) => groups.includes(c.level));
      if (workflow.forFilter.types.length > 0) activeCases = activeCases.filter((c: any) => workflow.forFilter.types.includes(c.type));
      const sorted      = [...activeCases].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const data        = sorted.map(c => {
        const row: any = { date: formatChartDate(c.date), caseName: c.name, caseType: c.type, caseLevel: c.level };
        groups.forEach(g => { row[`l_${g}`] = c.level === g ? c[mk] : null; });
        return row;
      });
      const s: ChartSeries[] = groups.map((g, i) => ({
        key: `l_${g}`, name: g,
        color: LINE_COLORS[i % LINE_COLORS.length], dataKey: `l_${g}`, strokeWidth: 2,
        strokeDasharray: LINE_DASHES[i],
        pointCount: activeCases.filter((c: any) => c.level === g).length,
      }));
      const maxPts = groups.length ? Math.max(...s.map(s => s.pointCount)) : data.length;
      return { chartData: data, series: s, maxSeriesPoints: maxPts };

    } else {
      // splitBy === 'segment': one line per (type × level) pair
      const segs = workflow.segments;
      if (!segs.length) return { chartData: [], series: [], maxSeriesPoints: 0 };
      const mk          = workflow.metrics[0] === 'overall' ? 'score' : workflow.metrics[0];
      const activeCases = cases.filter((c: any) => segs.some(s => s.type === c.type && s.level === c.level));
      const sorted      = [...activeCases].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const data        = sorted.map(c => {
        const row: any = { date: formatChartDate(c.date), caseName: c.name, caseType: c.type, caseLevel: c.level };
        segs.forEach(s => { row[`seg_${s.type}_${s.level}`] = (c.type === s.type && c.level === s.level) ? c[mk] : null; });
        return row;
      });
      const series: ChartSeries[] = segs.map((s, i) => ({
        key: `seg_${s.type}_${s.level}`, name: `${s.type} · ${s.level}`,
        color: LINE_COLORS[i % LINE_COLORS.length], dataKey: `seg_${s.type}_${s.level}`, strokeWidth: 2,
        strokeDasharray: LINE_DASHES[i],
        pointCount: activeCases.filter((c: any) => c.type === s.type && c.level === s.level).length,
      }));
      const maxPts = segs.length ? Math.max(...segs.map(s => activeCases.filter((c: any) => c.type === s.type && c.level === s.level).length)) : data.length;
      return { chartData: data, series, maxSeriesPoints: maxPts };
    }
  }, [filteredCases, workflow, availableTypes, availableLevels]);

  const n             = chartData.length;
  const showDotsGlobal = maxSeriesPoints <= 12 && series.length <= 3;

  const yDomain = useMemo((): [number, number] => {
    const allVals = series.flatMap(s => chartData.map((d: any) => d[s.dataKey]).filter((v: any) => v != null));
    if (!allVals.length) return [0, 5];
    const rawMin = Math.min(...allVals);
    const rawMax = Math.max(...allVals);
    const pad = Math.max(0.5, (rawMax - rawMin) * 0.15);
    return [Math.max(0, +(rawMin - pad).toFixed(1)), Math.min(5, +(rawMax + pad).toFixed(1))];
  }, [chartData, series]);

  const yTicks = useMemo(() => {
    const [min, max] = yDomain;
    const ticks: number[] = [];
    for (let i = Math.ceil(min); i <= Math.floor(max); i++) ticks.push(i);
    return ticks.length ? ticks : [1, 2, 3, 4, 5];
  }, [yDomain]);

  const xTicks = useMemo(() => {
    if (n === 0) return [];
    if (n <= 5)  return chartData.map((d: any) => d.date);
    const step = Math.ceil(n / 5);
    return chartData.filter((_: any, i: number) => i % step === 0).map((d: any) => d.date);
  }, [chartData, n]);

  const chartKey = useMemo(
    () => chartData.map((d: any) => d.date).join(',') + workflow.splitBy + workflow.metrics.join('') + workflow.forFilter.types.join('') + workflow.forFilter.levels.join('') + workflow.segments.map(s => s.type + s.level).join(''),
    [chartData, workflow]
  );

  // ── Chip label helpers ──
  const metricLabel = workflow.metrics.length === 1
    ? METRIC_OPTIONS.find(m => m.id === workflow.metrics[0])!.label
    : `${workflow.metrics.length} Metrics`;
  const isSegmentMode = workflow.splitBy === 'segment';
  const splitLabel    = isSegmentMode ? 'Together' : SPLIT_OPTIONS.find(s => s.id === workflow.splitBy)!.label;

  const forValueLabel = (() => {
    const { types, levels } = workflow.forFilter;
    if (!types.length && !levels.length) return 'All Cases';
    const parts: string[] = [];
    if (types.length === 1) parts.push(types[0]);
    else if (types.length > 1) parts.push(`${types.length} Types`);
    if (levels.length === 1) parts.push(levels[0]);
    else if (levels.length > 1) parts.push(`${levels.length} Levels`);
    return parts.join(' · ');
  })();

  const vsChipLabel = !workflow.segments.length
    ? 'Pick Segments'
    : workflow.segments.length === 1
      ? `${workflow.segments[0].type} · ${workflow.segments[0].level}`
      : `${workflow.segments.length} Segs`;

  const isMetricActive = !(workflow.metrics.length === 1 && workflow.metrics[0] === 'overall');
  const isSplitActive  = workflow.splitBy !== 'none' && !isSegmentMode;
  const isForActive    = workflow.forFilter.types.length > 0 || workflow.forFilter.levels.length > 0;
  const isVsActive     = workflow.segments.length > 0;
  const isModified     = isMetricActive || isSplitActive || isForActive || isSegmentMode;
  const showForChip    = !isSegmentMode && (availableTypes.length > 1 || availableLevels.length > 1);

  return (
    <div className="glass-card p-6 flex flex-col flex-1">

      {/* Header */}
      <div className="mb-3 relative" onMouseEnter={helpEnter} onMouseLeave={helpLeave}>
        <div className="eyebrow !mb-1 flex items-center">PERFORMANCE TREND</div>
        <div className="flex items-center gap-1">
          <h3 className="text-sm font-medium text-[#3B2F2F] tracking-tight">Score Over Time</h3>
          <button className="p-1 rounded-full text-[#5C4033]/25 hover:text-[#5C4033]/55 hover:bg-[#D9D0C4]/40 transition-all duration-200">
            <Info className="w-3 h-3" />
          </button>
        </div>

        {/* Feature guide — compact horizontal strip, anchored below header row */}
        {showHelp && (
          <div
            className="absolute left-0 top-full mt-1 z-50 animate-scale-in"
            onMouseEnter={helpEnter}
            onMouseLeave={helpLeave}
          >
            <style>{`@keyframes _fu{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:translateY(0)}}`}</style>
            <div className="bg-[#fff8f0] rounded-xl shadow-lg border border-[#5C4033]/10 overflow-hidden" style={{ width: '352px' }}>
              <div className="flex">
                {[
                  { n: '01', title: 'Show Metric',  body: 'Track any score dimension.' },
                  { n: '02', title: 'Split View',   body: 'Break lines by type or level.' },
                  { n: '03', title: 'Versus Mode',  body: 'Pick segments to compare.' },
                ].map((f, i) => (
                  <div
                    key={f.n}
                    className={`flex-1 px-2.5 py-2.5 hover:bg-[#D9D0C4]/25 transition-colors cursor-default ${i < 2 ? 'border-r border-[#5C4033]/6' : ''}`}
                    style={{ opacity: 0, animation: `_fu 0.14s ease forwards`, animationDelay: `${i * 40}ms` }}
                  >
                    <div className="flex items-center gap-1 mb-0.5">
                      <span className="text-[7px] font-bold text-[#3B2F2F]/30 shrink-0 tabular-nums">{f.n}</span>
                      <p className="text-[10px] font-semibold text-[#3B2F2F] leading-none">{f.title}</p>
                    </div>
                    <p className="text-[9px] text-[#5C4033]/48 leading-snug pl-[14px]">{f.body}</p>
                  </div>
                ))}
              </div>
              <div className="h-px bg-[#5C4033]/6" />
              <div className="px-3 py-1.5 flex items-center gap-1.5">
                <SlidersHorizontal className="w-2.5 h-2.5 text-[#5C4033]/28 flex-shrink-0" />
                <p className="text-[8px] text-[#5C4033]/38">Use the workflow bar below to explore</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      {n === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[11px] text-[#5C4033]/45 tracking-[0.01em] text-center">
            {isSegmentMode && !workflow.segments.length
              ? 'Pick segments in the workflow bar to compare.'
              : isPreview
                ? 'Sign in to see your performance trend.'
                : entries.length === 0
                  ? 'Complete a case to see your performance trend.'
                  : 'No cases match your filters.'}
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 select-none [&_*]:outline-none">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <LineChart key={chartKey} data={chartData} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
              <XAxis
                dataKey="date" tickLine={false} axisLine={false}
                tick={<CustomXTick />} height={42} ticks={xTicks}
              />
              <YAxis
                domain={yDomain} ticks={yTicks}
                tickLine={false} axisLine={false}
                tick={{ fill: COLORS.warm, fontSize: 10, opacity: 0.6 }}
              />
              <Tooltip
                cursor={{ stroke: COLORS.subtle, strokeWidth: 1, strokeDasharray: '4 4' }}
                content={<DynamicTooltip />}
              />
              {series.map((s, i) => (
                <Line
                  key={s.key} type="monotone" dataKey={s.dataKey} name={s.name}
                  stroke={s.color} strokeWidth={s.strokeWidth} strokeDasharray={s.strokeDasharray}
                  dot={showDotsGlobal || s.pointCount <= 1 ? { fill: COLORS.base, stroke: s.color, strokeWidth: 2, r: i === 0 && series.length <= 3 ? 4 : 3 } : false}
                  activeDot={{ r: 5, fill: s.color, stroke: COLORS.base, strokeWidth: 2 }}
                  connectNulls={workflow.splitBy !== 'none'}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Dynamic Legend — only when multiple lines */}
      {series.length > 1 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 px-0.5">
          {series.map(s => (
            <div key={s.key} className="flex items-center gap-1.5">
              <svg width="16" height="8" className="flex-shrink-0">
                <line x1="0" y1="4" x2="16" y2="4"
                  stroke={s.color} strokeWidth="1.5"
                  strokeDasharray={s.strokeDasharray || ''}
                />
              </svg>
              <span className="text-[9px] text-[#5C4033]/55 font-medium">{s.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Workflow Builder */}
      <div className="flex items-center gap-1.5 flex-wrap pt-3 border-t border-[#5C4033]/[0.08] mt-3">

        {/* Icon with engagement pulse */}
        <div className="relative shrink-0 mr-1">
          <SlidersHorizontal className="w-3.5 h-3.5 text-[#5C4033]/35" />
          {!hasInteracted && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-[#3D5A35] animate-ping opacity-75" />
          )}
        </div>

        {/* SHOW chip */}
        <WorkflowChip
          prefix="Show" value={metricLabel} isActive={isMetricActive}
          isOpen={openChip === 'metric'}
          onClick={chipClick}
          onMouseEnter={() => chipEnter('metric')} onMouseLeave={chipLeave}
          chipRef={metricRef}
        >
          <DropdownPanel wide>
            <DropdownHeader label="Metric" />
            {METRIC_OPTIONS.map(opt => {
              const isSelected = workflow.metrics.includes(opt.id);
              const isOnly     = isSelected && workflow.metrics.length === 1;
              return (
                <DropdownOption
                  key={opt.id} label={opt.label} isSelected={isSelected}
                  disabled={isOnly} onClick={() => toggleMetric(opt.id)}
                />
              );
            })}
            {workflow.splitBy !== 'none' && (
              <p className="text-[9px] text-[#5C4033]/40 px-3 pt-1.5 pb-0.5 italic">One metric in split mode</p>
            )}
          </DropdownPanel>
        </WorkflowChip>

        {/* Normal mode: SPLIT + FOR chips */}
        {!isSegmentMode && (
          <>
            <span className="text-[9px] text-[#5C4033]/40 shrink-0">by</span>

            <WorkflowChip
              prefix="Split" value={splitLabel} isActive={isSplitActive}
              isOpen={openChip === 'split'}
              onClick={chipClick}
              onMouseEnter={() => chipEnter('split')} onMouseLeave={chipLeave}
              chipRef={splitRef}
            >
              <DropdownPanel wide>
                <DropdownHeader label="Split by" />
                {SPLIT_OPTIONS.map(opt => (
                  <DropdownOption
                    key={opt.id} label={opt.label}
                    isSelected={workflow.splitBy === opt.id}
                    isRadio onClick={() => setSplitBy(opt.id)}
                  />
                ))}
              </DropdownPanel>
            </WorkflowChip>

            {showForChip && (
              <>
                <span className="text-[9px] text-[#5C4033]/40 shrink-0">for</span>

                <WorkflowChip
                  prefix="For" value={forValueLabel} isActive={isForActive}
                  isOpen={openChip === 'for'}
                  onClick={chipClick}
                  onMouseEnter={() => chipEnter('for')} onMouseLeave={chipLeave}
                  chipRef={forRef}
                >
                  <DropdownPanel xwide>
                    <DropdownHeader
                      label="Filter cases"
                      onClear={isForActive ? () => setWorkflow(w => ({ ...w, forFilter: { types: [], levels: [] } })) : undefined}
                    />
                    {availableTypes.length > 1 && (
                      <div className={availableLevels.length > 1 ? 'mb-1' : ''}>
                        {availableLevels.length > 1 && (
                          <p className="text-[9px] uppercase tracking-wider text-[#5C4033]/50 font-semibold px-2 pt-1.5 pb-1">Type</p>
                        )}
                        <div className="grid grid-cols-2 gap-0.5">
                          {availableTypes.map(opt => {
                            const sel = workflow.forFilter.types.includes(opt);
                            return (
                              <button key={opt} onClick={() => toggleForType(opt)}
                                className={`flex items-center gap-2 px-2 py-1.5 text-[11px] rounded-lg transition-colors text-left ${sel ? 'bg-[#3D5A35]/8 text-[#3B2F2F] font-medium' : 'text-[#5C4033] hover:bg-[#D9D0C4]/30'}`}
                              >
                                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-all ${sel ? 'bg-[#3B2F2F] border-[#3B2F2F]' : 'border-[#5C4033]/30'}`}>
                                  {sel && <CheckCircle2 className="w-2.5 h-2.5 text-[#F0EBE3]" />}
                                </div>
                                <span className="truncate">{opt}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {availableTypes.length > 1 && availableLevels.length > 1 && (
                      <div className="border-t border-[#5C4033]/8 my-1.5 mx-1" />
                    )}
                    {availableLevels.length > 1 && (
                      <div>
                        {availableTypes.length > 1 && (
                          <p className="text-[9px] uppercase tracking-wider text-[#5C4033]/50 font-semibold px-2 pt-0.5 pb-1">Level</p>
                        )}
                        <div className="flex gap-0.5">
                          {availableLevels.map(opt => {
                            const sel = workflow.forFilter.levels.includes(opt);
                            return (
                              <button key={opt} onClick={() => toggleForLevel(opt)}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] rounded-lg transition-colors ${sel ? 'bg-[#3D5A35]/8 text-[#3B2F2F] font-medium' : 'text-[#5C4033] hover:bg-[#D9D0C4]/30'}`}
                              >
                                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-all ${sel ? 'bg-[#3B2F2F] border-[#3B2F2F]' : 'border-[#5C4033]/30'}`}>
                                  {sel && <CheckCircle2 className="w-2.5 h-2.5 text-[#F0EBE3]" />}
                                </div>
                                <span>{opt}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </DropdownPanel>
                </WorkflowChip>
              </>
            )}
          </>
        )}

        {/* Vs. mode: dedicated chip with segment grid */}
        {isSegmentMode && (
          <WorkflowChip
            prefix="Vs" value={vsChipLabel} isActive={isVsActive}
            isOpen={openChip === 'vs'}
            onClick={chipClick}
            onMouseEnter={() => chipEnter('vs')} onMouseLeave={chipLeave}
            chipRef={vsRef}
          >
            <DropdownPanel xwide>
              <DropdownHeader
                label="Compare segments"
                onClear={workflow.segments.length > 0 ? () => setWorkflow(w => ({ ...w, segments: [] })) : undefined}
              />
              <div className="px-1 pb-1">
                <div className="flex items-center mb-0.5">
                  <div className="flex-1" />
                  {availableLevels.map(lv => (
                    <div key={lv} className="w-14 text-center text-[9px] uppercase tracking-wider text-[#5C4033]/45 font-semibold">
                      {lv.length > 4 ? lv.slice(0, 3) : lv}
                    </div>
                  ))}
                </div>
                {availableTypes.map(type => (
                  <div key={type} className="flex items-center">
                    <div className="flex-1 min-w-0 pr-1">
                      <span className="text-[11px] text-[#5C4033] truncate block">{type}</span>
                    </div>
                    {availableLevels.map(level => {
                      const sel = workflow.segments.some(s => s.type === type && s.level === level);
                      const has = filteredCases.some((c: any) => c.type === type && c.level === level);
                      return (
                        <button key={level} disabled={!has} onClick={() => toggleSegment(type, level)}
                          className={`w-14 flex items-center justify-center py-1.5 rounded-lg transition-colors ${sel ? 'bg-[#3D5A35]/10' : has ? 'hover:bg-[#D9D0C4]/30' : ''} ${!has ? 'opacity-20 cursor-not-allowed' : ''}`}
                        >
                          <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all ${sel ? 'bg-[#3B2F2F] border-[#3B2F2F]' : 'border-[#5C4033]/30'}`}>
                            {sel && <CheckCircle2 className="w-2.5 h-2.5 text-[#F0EBE3]" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </DropdownPanel>
          </WorkflowChip>
        )}

        {/* Right side: Versus Mode toggle + Reset */}
        <div className="flex items-center gap-2.5 ml-auto">
          <button
            onClick={isPreview || entries.length === 0 ? undefined : toggleVsMode}
            disabled={isPreview || entries.length === 0}
            className={`group relative flex items-center gap-2.5 px-3 py-1.5 rounded-full border overflow-hidden transition-all duration-300 ${
              isPreview || entries.length === 0
                ? 'border-[#5C4033]/8 opacity-35 cursor-not-allowed'
                : isSegmentMode
                  ? 'bg-[#3B2F2F]/6 border-[#3B2F2F]/15 shadow-sm'
                  : 'border-[#5C4033]/12 hover:border-[#5C4033]/25 hover:bg-[#D9D0C4]/15'
            }`}
          >
            {/* Hover shimmer */}
            <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-[#3D5A35]/8 to-transparent pointer-events-none" />
            <span className={`relative text-[10px] font-semibold tracking-wide select-none transition-colors duration-200 ${
              isSegmentMode ? 'text-[#3B2F2F]' : 'text-[#5C4033]/45 group-hover:text-[#5C4033]/65'
            }`}>Versus Mode</span>
            <div className="relative flex-shrink-0">
              {/* Attention ping ring when off and user hasn't interacted yet */}
              {!isSegmentMode && !hasInteracted && entries.length > 0 && !isPreview && (
                <span className="absolute inset-[-3px] rounded-full border border-[#5C4033]/30 animate-ping [animation-duration:2s]" />
              )}
              <div className={`relative w-8 h-4 rounded-full transition-all duration-300 ${
                isSegmentMode ? 'bg-[#3B2F2F]' : 'bg-[#5C4033]/12 group-hover:bg-[#5C4033]/18'
              }`}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full shadow-sm transition-all duration-300 ${
                  isSegmentMode ? 'left-[18px] bg-[#fff8f0]' : 'left-0.5 bg-[#5C4033]/30 group-hover:bg-[#5C4033]/50'
                }`} />
              </div>
            </div>
          </button>
          {isModified && (
            <button
              onClick={() => { setWorkflow({ metrics: ['overall'], splitBy: 'none', forFilter: { types: [], levels: [] }, segments: [] }); setOpenChip(null); }}
              className="flex items-center gap-1 px-2.5 py-1 text-[9px] font-medium rounded-full border border-[#5C4033]/15 text-[#5C4033]/50 hover:text-[#5C4033]/80 hover:border-[#5C4033]/30 transition-colors"
            >
              <X className="w-2.5 h-2.5" /> Reset
            </button>
          )}
        </div>
      </div>

    </div>
  );
};

// Prevent re-renders from unrelated parent state (GoalTracker, AI coach, etc.)
// Only re-render when filter values actually change — not on object reference churn.
export default React.memo(TimeLineChart, (prev, next) =>
  prev.filters.time        === next.filters.time        &&
  prev.filters.customStart === next.filters.customStart &&
  prev.filters.customEnd   === next.filters.customEnd   &&
  prev.filters.types.join()  === next.filters.types.join()  &&
  prev.filters.levels.join() === next.filters.levels.join()
);
