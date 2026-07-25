'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, Settings2, Target, Sparkles, LockKeyhole } from 'lucide-react';
import { deleteDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import CalendarPicker from '@/components/ui/CalendarPicker';
import { goalDoc } from '@/lib/firebase/collections';
import type { GoalConfig } from '@/lib/firebase/schema';
import { useDashboard } from './DashboardContext';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
const CASE_TYPES = [
  'Profitability', 'Market Entry', 'Growth',
  'Pricing', 'Unconventional', 'Guesstimate',
] as const;
type CaseType = typeof CASE_TYPES[number];

type Phase =
  | 'welcome' | 'enterDate' | 'askRecurring' | 'enterRecurring'
  | 'askOverrideTotal' | 'enterTotal' | 'askPerType' | 'enterPerType' | 'done';

export type { GoalConfig };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function parseDDMMYYYY(s: string): Date | null {
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

function daysFromTomorrow(end: Date): number {
  const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + 1);
  const e = new Date(end); e.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((e.getTime() - t.getTime()) / 86400000) + 1);
}

function calcAutoTotal(count: number, every: number, unit: 'days' | 'weeks' | 'months', end: Date): number {
  const days = daysFromTomorrow(end);
  const period = unit === 'days' ? every : unit === 'weeks' ? every * 7 : every * 30;
  return period > 0 ? count * Math.floor(days / period) : 0;
}

function getTomorrowISO(): string {
  const t = new Date(); t.setDate(t.getDate() + 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function stepProgress(p: Phase): number {
  return ({
    welcome: 6, enterDate: 20, askRecurring: 34, enterRecurring: 50,
    askOverrideTotal: 60, enterTotal: 65, askPerType: 78, enterPerType: 88, done: 100,
  } as Record<Phase, number>)[p] ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const OptionList = ({ options }: {
  options: { label: string; sub?: string; onClick: () => void }[];
}) => (
  <div className="border border-[#5C4033]/10 rounded-xl overflow-hidden bg-[#D9D0C4]/10">
    {options.map((opt, i) => (
      <React.Fragment key={opt.label}>
        {i > 0 && <div className="h-px bg-[#5C4033]/8" />}
        <button onClick={opt.onClick}
          className="w-full text-left px-4 py-3 hover:bg-[#D9D0C4]/25 transition-colors duration-150 group"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-[#3B2F2F] leading-snug">{opt.label}</p>
              {opt.sub && <p className="text-[9.5px] text-[#5C4033]/45 mt-[3px] leading-snug">{opt.sub}</p>}
            </div>
            <span className="text-[#5C4033]/25 group-hover:text-[#3D5A35] transition-colors shrink-0">→</span>
          </div>
        </button>
      </React.Fragment>
    ))}
  </div>
);

// IntInput must live OUTSIDE the component so React sees a stable component type.
// Defining it inside would cause remount on every render, losing focus after each keystroke.
const IntInput = ({
  value, onChange, placeholder, className = '', min = 1,
}: {
  value: number | ''; onChange: (v: number | '') => void;
  placeholder: string; className?: string; min?: number;
}) => (
  <input
    type="number" min={min} step={1} placeholder={placeholder} value={value}
    className={`gt-input ${className}`}
    onKeyDown={e => (e.key === '.' || e.key === ',') && e.preventDefault()}
    onChange={e => onChange(e.target.value === '' ? '' : Math.max(min, Math.floor(+e.target.value)))}
  />
);

// ─────────────────────────────────────────────────────────────────────────────
// GTF Engine — rule-based, no API call needed
// ─────────────────────────────────────────────────────────────────────────────
function generateGTFInsight(
  tgr: number | null,
  totalDone: number,
  config: GoalConfig,
  doneByType: Record<string, number>
): string {
  if (totalDone === 0) {
    return config.hasEndDate
      ? `Log your first case to activate pacing. ${config.totalCases} cases to reach by ${config.endDate}.`
      : `Log your first case to start tracking momentum.`;
  }
  if (!config.hasEndDate || tgr === null) {
    const rem = config.totalCases - totalDone;
    if (rem <= 0) return `You've hit your target of ${config.totalCases} cases. Consider raising the bar.`;
    return `${rem} case${rem !== 1 ? 's' : ''} left toward your goal of ${config.totalCases}. Keep the momentum.`;
  }
  let starvingType: string | null = null, starvingPct = 1, saturatedType: string | null = null;
  if (config.hasPerType) {
    for (const [type, target] of Object.entries(config.perType as Record<string, number>)) {
      const done = doneByType[type] || 0;
      const pct = target > 0 ? done / target : 0;
      if (pct < starvingPct) { starvingPct = pct; starvingType = type; }
      if (pct >= 1 && !saturatedType) saturatedType = type;
    }
  }
  if (tgr < 0.8) {
    if (saturatedType && starvingType)
      return `Well ahead of schedule. ${saturatedType} is done — pivot to ${starvingType} for framework diversity.`;
    return `Ahead of pace. Use this buffer to explore edge cases and unconventional frameworks.`;
  }
  if (tgr < 1.2) {
    if (starvingType && starvingPct < 0.2)
      return `On track, but ${starvingType} is a blind spot. Rotate there next to balance your portfolio.`;
    return `Prep pace is synced with your deadline. Stay consistent and rotate case types.`;
  }
  if (tgr < 1.5) {
    if (starvingType)
      return `Time is tightening. Prioritise ${starvingType} — it has the largest gap relative to your target.`;
    return `Workload is building. Triage the most unfinished categories first.`;
  }
  if (starvingType)
    return `Intensity is critical. Focus exclusively on ${starvingType} to ensure coverage by ${config.endDate}.`;
  return `Critical gap. Focus on essential coverage only before ${config.endDate}.`;
}

// Zone metadata — used by header badge and done case
const ZONE_META = {
  cruising: { label: 'Cruising',       color: '#A5B9A0' },
  focused:  { label: 'Focused',        color: '#C4A882' },
  high:     { label: 'High Intensity', color: '#C47A6A' },
  critical: { label: 'Critical',       color: '#B85C5C' },
} as const;
type Zone = keyof typeof ZONE_META;

// TGR Gauge — SVG donut semicircle with needle
const TGRGauge = ({ tgr, zone }: { tgr: number; zone: Zone }) => {
  const CX = 100, CY = 88, RO = 66, RI = 50;
  const pt = (t: number, r: number): [number, number] => {
    const a = (Math.PI / 180) * 90 * (2 - Math.min(t, 2));
    return [+(CX + r * Math.cos(a)).toFixed(2), +(CY - r * Math.sin(a)).toFixed(2)];
  };
  const seg = (t1: number, t2: number) => {
    const [ox1, oy1] = pt(t1, RO), [ox2, oy2] = pt(t2, RO);
    const [ix1, iy1] = pt(t2, RI), [ix2, iy2] = pt(t1, RI);
    return `M ${ox1} ${oy1} A ${RO} ${RO} 0 0 0 ${ox2} ${oy2} L ${ix1} ${iy1} A ${RI} ${RI} 0 0 1 ${ix2} ${iy2} Z`;
  };
  const zones: { t1: number; t2: number; color: string; id: string }[] = [
    { t1: 0, t2: 0.8, color: '#A5B9A0', id: 'cruising' },
    { t1: 0.8, t2: 1.2, color: '#C4A882', id: 'focused' },
    { t1: 1.2, t2: 1.5, color: '#C47A6A', id: 'high' },
    { t1: 1.5, t2: 2, color: '#B85C5C', id: 'critical' },
  ];
  const capped = Math.min(tgr, 2);
  const [nx, ny] = pt(capped, RO - 10);
  return (
    <svg viewBox="18 18 164 74" width="100%">
      <path d={seg(0, 2)} fill="#5C4033" opacity={0.04} />
      {zones.map(z => (
        <path key={z.id} d={seg(z.t1, z.t2)} fill={z.color}
          opacity={zone === z.id ? 0.72 : 0.22} />
      ))}
      {zones.map(z => zone === z.id &&
        <path key={`h${z.id}`} d={seg(z.t1, z.t2)} fill="white" opacity={0.12} />
      )}
      <line x1={CX} y1={CY} x2={nx} y2={ny}
        stroke="#3B2F2F" strokeWidth={1.6} strokeLinecap="round" opacity={0.5} />
      <circle cx={CX} cy={CY} r={2.5} fill="#3B2F2F" opacity={0.38} />
    </svg>
  );
};

const GTF_VERBS = ['Calibrating', 'Mapping gaps', 'Analysing pace', 'Reading zones', 'Sizing up', 'Almost there'];

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const GoalTracker = ({ isLocked }: { isLocked: boolean }) => {
  const { user, entries: allEntries } = useDashboard();
  const entries = useMemo(() => allEntries.filter((e) => !e.isUnrated), [allEntries]);
  const [lockHovered, setLockHovered] = useState(false);
  const [phase, setPhase]         = useState<Phase>('welcome');
  const [history, setHistory]     = useState<Phase[]>([]);
  const [dir, setDir]             = useState<'fwd' | 'bwd'>('fwd');
  const [animKey, setAnimKey]     = useState(0);
  const [isEditing, setIsEditing] = useState(false);

  const [hasEndDate, setHasEndDate]     = useState<boolean | null>(null);
  const [endDate, setEndDate]           = useState('');      // DD/MM/YYYY
  const [hasRecurring, setHasRecurring] = useState<boolean | null>(null);
  const [rCount, setRCount]             = useState<number | ''>('');
  const [rEvery, setREvery]             = useState<number | ''>('');
  const [rUnit, setRUnit]               = useState<'days' | 'weeks' | 'months'>('weeks');
  const [totalCases, setTotalCases]     = useState<number | ''>('');
  const [perType, setPerType]           = useState<Partial<Record<CaseType, number | ''>>>({});
  const [savedConfig, setSavedConfig]   = useState<GoalConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState('');
  const [insightReady, setInsightReady]             = useState(false);
  const [insightVerbIdx, setInsightVerbIdx]         = useState(0);
  const [insightVerbVisible, setInsightVerbVisible] = useState(true);

  // Zone for header badge — derived from TGR logic (only when done + hasEndDate)
  const gtfZone: Zone | null = (() => {
    if (phase !== 'done' || !savedConfig?.hasEndDate || !savedConfig.endDate || savedConfig.totalCases <= 0) return null;
    const endObj = parseDDMMYYYY(savedConfig.endDate);
    if (!endObj || entries.length === 0) return null;
    const totalDone = entries.length;
    const earliest = entries.reduce((m: string, c: any) => c.date < m ? c.date : m, entries[0].date);
    const startObj = new Date(earliest + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const totalDays = Math.max(1, Math.round((endObj.getTime() - startObj.getTime()) / 86400000));
    const elapsed = Math.max(0, Math.round((today.getTime() - startObj.getTime()) / 86400000));
    const goalPct = totalDone / savedConfig.totalCases;
    const tgr = goalPct > 0 ? (elapsed / totalDays) / goalPct : 10;
    return tgr < 0.8 ? 'cruising' : tgr < 1.2 ? 'focused' : tgr < 1.5 ? 'high' : 'critical';
  })();

  // Load saved goals — live Firestore subscription, scoped to the signed-in
  // account (so a goal set on one device shows up on every other). Preview
  // mode (no real user, e.g. a signed-out visitor) has nowhere to persist to,
  // so it just skips straight to the empty wizard.
  useEffect(() => {
    if (!user) {
      setSavedConfig(null);
      setConfigLoading(false);
      return;
    }
    setConfigLoading(true);
    const unsubscribe = onSnapshot(
      goalDoc(user.uid),
      (snapshot) => {
        const cfg = snapshot.exists() ? snapshot.data() : null;
        setSavedConfig(cfg);
        setPhase((prev) => (cfg ? 'done' : prev === 'done' ? 'welcome' : prev));
        setConfigLoading(false);
      },
      () => {
        setConfigLoading(false);
      },
    );
    return () => unsubscribe();
  }, [user]);

  // ── Derived ──
  const endDateObj  = parseDDMMYYYY(endDate);
  const isValidDate = !!endDateObj && endDateObj > new Date();
  const daysLeft    = isValidDate && endDateObj ? daysFromTomorrow(endDateObj) : 0;

  // Convert DD/MM/YYYY → YYYY-MM-DD for CalendarPicker
  const endDateISO = endDate.match(/^\d{2}\/\d{2}\/\d{4}$/)
    ? `${endDate.slice(6)}-${endDate.slice(3, 5)}-${endDate.slice(0, 2)}`
    : '';

  const availableUnits: ('days' | 'weeks' | 'months')[] =
    !hasEndDate   ? ['days', 'weeks', 'months'] :
    daysLeft < 7  ? ['days'] :
    daysLeft < 30 ? ['days', 'weeks'] :
    ['days', 'weeks', 'months'];

  // Auto-select unit when only one is available (change #11)
  useEffect(() => {
    if (hasEndDate && daysLeft > 0 && daysLeft < 7 && rUnit !== 'days') setRUnit('days');
  }, [hasEndDate, daysLeft]);

  // Insight generation animation — brief simulated delay when entering done state
  useEffect(() => {
    if (phase !== 'done') { setInsightReady(false); return; }
    setInsightReady(false);
    setInsightVerbIdx(0);
    const t = setTimeout(() => setInsightReady(true), 1100);
    return () => clearTimeout(t);
  }, [phase]);

  // Verb cycling while insight is loading
  useEffect(() => {
    if (insightReady || phase !== 'done') return;
    const t = setInterval(() => {
      setInsightVerbVisible(false);
      setTimeout(() => {
        setInsightVerbIdx(i => (i + 1) % GTF_VERBS.length);
        setInsightVerbVisible(true);
      }, 180);
    }, 700);
    return () => clearInterval(t);
  }, [insightReady, phase]);

  const autoTotal: number | null =
    hasEndDate && endDateObj && rCount && rEvery
      ? calcAutoTotal(+rCount, +rEvery, rUnit, endDateObj)
      : null;

  const effectiveTotal = typeof totalCases === 'number' && totalCases > 0
    ? totalCases : (autoTotal ?? 0);

  const allocated = Object.values(perType).reduce<number>(
    (s, v) => s + (typeof v === 'number' && v > 0 ? v : 0), 0
  );
  const remaining = effectiveTotal - allocated;
  const isOver    = effectiveTotal > 0 && allocated > effectiveTotal;

  const tomorrowISO = getTomorrowISO();

  // ── Building trail — only shows chips for steps already completed (in history).
  //    Going back shrinks history → chips disappear in sync with navigation. ──
  const buildingTrail = (() => {
    if (phase === 'welcome' || phase === 'done') return [];
    const chips: { label: string; value: string }[] = [];

    // Date chip: confirmed only after leaving enterDate
    if (history.includes('enterDate') && endDate)
      chips.push({ label: 'By', value: endDate });
    // Open-ended chip: confirmed when leaving welcome without entering a date
    else if (history.includes('welcome') && hasEndDate === false)
      chips.push({ label: 'Deadline', value: 'Open-ended' });

    // Recurring type: confirmed when leaving askRecurring
    if (history.includes('askRecurring') && hasRecurring === false)
      chips.push({ label: 'Style', value: 'Total only' });

    // Cadence values: confirmed when leaving enterRecurring
    if (history.includes('enterRecurring') && hasRecurring === true && rCount && rEvery) {
      const rc = +rCount, re = +rEvery;
      chips.push({ label: 'Cadence', value: `${rc} ${rc === 1 ? 'case' : 'cases'} / ${re} ${re === 1 ? rUnit.slice(0, -1) : rUnit}` });
    }

    // Total: confirmed when leaving enterRecurring (auto) or enterTotal (manual)
    if ((history.includes('enterRecurring') || history.includes('enterTotal'))
        && typeof totalCases === 'number' && totalCases > 0)
      chips.push({ label: 'Target', value: `${totalCases} ${totalCases === 1 ? 'case' : 'cases'}` });

    return chips;
  })();

  // ── Navigation ──
  const go = (next: Phase) => {
    setDir('fwd'); setHistory(h => [...h, phase]);
    setAnimKey(k => k + 1); setPhase(next);
  };
  const back = () => {
    if (!history.length) return;
    setDir('bwd');
    setPhase(history[history.length - 1]);
    setHistory(h => h.slice(0, -1));
    setAnimKey(k => k + 1);
  };

  // ── Edit / Reset ──
  const startEdit = () => {
    if (!savedConfig) return;
    setHasEndDate(savedConfig.hasEndDate);
    setEndDate(savedConfig.endDate);
    setHasRecurring(savedConfig.hasRecurring);
    setRCount(savedConfig.recurringCount || '');
    setREvery(savedConfig.recurringEvery || '');
    setRUnit(savedConfig.recurringUnit);
    setTotalCases(savedConfig.totalCases || '');
    setPerType({ ...savedConfig.perType } as Partial<Record<CaseType, number | ''>>);
    setHistory([]); setIsEditing(true);
    setDir('bwd'); setAnimKey(k => k + 1); setPhase('welcome');
  };
  const cancelEdit = () => {
    setIsEditing(false); setHistory([]);
    setDir('fwd'); setAnimKey(k => k + 1); setPhase('done');
  };
  const reset = async () => {
    setSavedConfig(null);
    setHasEndDate(null); setEndDate(''); setHasRecurring(null);
    setRCount(''); setREvery(''); setRUnit('weeks');
    setTotalCases(''); setPerType({}); setHistory([]);
    setIsEditing(false); setDir('fwd'); setSaveError('');
    setAnimKey(k => k + 1); setPhase('welcome');
    if (!user) return;
    try {
      await deleteDoc(goalDoc(user.uid));
    } catch {
      // Local state is already cleared; the live subscription will resync
      // truth from Firestore on the next successful read either way.
    }
  };

  // ── Save ──
  const finish = async (withPerType: boolean) => {
    if (saving) return;
    const cfg: GoalConfig = {
      hasEndDate:     !!hasEndDate,
      endDate,
      hasRecurring:   !!hasRecurring,
      recurringCount: +(rCount || 0),
      recurringEvery: +(rEvery || 0),
      recurringUnit:  rUnit,
      totalCases:     effectiveTotal,
      hasPerType:     withPerType,
      perType: withPerType
        ? (Object.fromEntries(
            Object.entries(perType)
              .filter(([, v]) => typeof v === 'number' && (v as number) > 0)
          ) as Record<string, number>)
        : {},
    };

    if (!user) {
      // Preview mode (signed-out visitor) — nothing to persist to, just
      // reflect the choice locally so the demo dashboard still responds.
      setSavedConfig(cfg);
      setIsEditing(false);
      go('done');
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      await setDoc(goalDoc(user.uid), { ...cfg, updatedAt: serverTimestamp() });
      setSavedConfig(cfg);
      setIsEditing(false);
      go('done');
    } catch {
      setSaveError("Couldn't save your goal. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Step content ──
  const renderStep = (): React.ReactNode => {
    switch (phase) {

      case 'welcome': return (
        <div>
          <div className="mb-4">
            <h3 className="mb-1">Do you have a target date?</h3>
            <p className="text-[10.5px] text-[#5C4033]/38 leading-relaxed">An interview, placement season, or any deadline you are building toward.</p>
          </div>
          <OptionList options={[
            { label: 'Yes, I have a date in mind', sub: 'Build a timeline-based plan', onClick: () => { setHasEndDate(true); go('enterDate'); } },
            { label: 'Not right now', sub: 'Set a cadence or total target instead', onClick: () => { setHasEndDate(false); setEndDate(''); go('askRecurring'); } },
          ]} />
        </div>
      );

      case 'enterDate': return (
        <div>
          <div className="mb-4">
            <h3 className="mb-1">When is your deadline?</h3>
          </div>
          <div className="flex flex-col gap-2.5">
            <CalendarPicker
              value={endDateISO}
              onChange={iso => { const [y, m, d] = iso.split('-'); setEndDate(`${d}/${m}/${y}`); }}
              label="Pick your target date"
              minDate={tomorrowISO}
            />
            {isValidDate && (
              <p className="text-[10px] text-[#3D5A35] font-medium pl-0.5">
                {daysLeft} {daysLeft === 1 ? 'day' : 'days'} to go
              </p>
            )}
            <button onClick={() => go('askRecurring')} disabled={!isValidDate} className="gt-cta mt-1">
              Continue
            </button>
          </div>
        </div>
      );

      case 'askRecurring': return (
        <div>
          <div className="mb-4">
            <h3 className="mb-1">Set a recurring practice goal?</h3>
            <p className="text-[10.5px] text-[#5C4033]/38 leading-relaxed">Something like 3 cases every week.</p>
          </div>
          <OptionList options={[
            { label: 'Yes, define a cadence', sub: 'Pick a rhythm and stick to it', onClick: () => { setHasRecurring(true); go('enterRecurring'); } },
            { label: 'No, just set a total number', sub: 'Define how many cases overall', onClick: () => { setHasRecurring(false); go('enterTotal'); } },
          ]} />
        </div>
      );

      case 'enterRecurring': {
        const valid = rCount && rEvery && +rCount > 0 && +rEvery > 0;
        const ok    = !hasEndDate || (autoTotal !== null && autoTotal > 0);
        return (
          <div>
            <div className="mb-4">
              <h3 className="mb-1">How often will you practice?</h3>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#5C4033]/42 shrink-0">Practice</span>
                <IntInput value={rCount} onChange={setRCount} placeholder="n" className="w-14 text-center" />
                <span className="text-[11px] text-[#5C4033]/42 shrink-0">cases</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#5C4033]/42 shrink-0">every</span>
                <IntInput value={rEvery} onChange={setREvery} placeholder="n" className="w-14 text-center" />
                <div className="flex rounded-lg overflow-hidden border border-[#5C4033]/12 shrink-0">
                  {availableUnits.map(u => (
                    <button key={u} onClick={() => setRUnit(u)}
                      className={`px-2.5 py-[6px] text-[9px] font-bold uppercase tracking-widest transition-colors ${
                        rUnit === u ? 'bg-[#3B2F2F] text-[#F0EBE3]' : 'text-[#5C4033]/35 hover:bg-[#D9D0C4]/30'
                      }`}
                    >{u}</button>
                  ))}
                </div>
              </div>
              {hasEndDate && valid && (
                <div className="px-3 py-2 rounded-lg border border-[#5C4033]/8 bg-[#D9D0C4]/12">
                  {autoTotal && autoTotal > 0 ? (
                    <p className="text-[10px] text-[#5C4033]/42 leading-snug">
                      <span className="font-semibold text-[#3B2F2F]/80">{autoTotal} {autoTotal === 1 ? 'case' : 'cases'}</span>
                      {' '}across {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
                    </p>
                  ) : (
                    <p className="text-[10px] text-[#5C4033]/42">Interval exceeds time left</p>
                  )}
                </div>
              )}
              <button
                onClick={() => {
                  if (hasEndDate && autoTotal && autoTotal > 0) { setTotalCases(autoTotal); go('askPerType'); }
                  else { go('askOverrideTotal'); }
                }}
                disabled={!valid || !ok}
                className="gt-cta"
              >
                {hasEndDate ? 'Looks good' : 'Continue'}
              </button>
            </div>
          </div>
        );
      }

      case 'askOverrideTotal': return (
        <div>
          <div className="mb-4">
            <h3 className="mb-1">Add a total case milestone?</h3>
            <p className="text-[10.5px] text-[#5C4033]/38 leading-relaxed">Optional. A lifetime target separate from your cadence.</p>
          </div>
          <OptionList options={[
            { label: 'Yes, add a total', onClick: () => go('enterTotal') },
            { label: 'Cadence goal is enough', sub: 'Keep it simple', onClick: () => finish(false) },
          ]} />
        </div>
      );

      case 'enterTotal': return (
        <div>
          <div className="mb-4">
            <h3 className="mb-1">How many cases in total?</h3>
          </div>
          <div className="flex flex-col gap-2.5">
            <IntInput
              value={totalCases} onChange={setTotalCases}
              placeholder="e.g. 50" className="w-full text-center text-sm font-semibold"
            />
            <button
              onClick={() => go('askPerType')}
              disabled={!(typeof totalCases === 'number' && totalCases > 0)}
              className="gt-cta"
            >
              Continue
            </button>
          </div>
        </div>
      );

      case 'askPerType': return (
        <div>
          <div className="mb-4">
            <h3 className="mb-1">Break it down by case type?</h3>
            <p className="text-[10.5px] text-[#5C4033]/38 leading-relaxed">Distribute {effectiveTotal} cases across categories.</p>
          </div>
          <OptionList options={[
            { label: 'Yes, allocate by type', sub: `Split ${effectiveTotal} cases across 6 types`, onClick: () => go('enterPerType') },
            { label: 'One overall goal is enough', sub: 'Keep it simple', onClick: () => finish(false) },
          ]} />
        </div>
      );

      case 'enterPerType': {
        const pct = effectiveTotal > 0 ? Math.min(100, Math.round((allocated / effectiveTotal) * 100)) : 0;
        return (
          <div>
            <div className="mb-3">
              <h3 className="mb-1">Distribute your {effectiveTotal} cases</h3>
            </div>

            {/* Allocation bar */}
            <div className="mb-4 -mt-1">
              <div className="flex justify-between mb-1.5">
                <span className="text-[9px] uppercase tracking-wider font-semibold text-[#5C4033]/32">Allocated</span>
                <span className={`text-[10px] font-semibold ${
                  isOver ? 'text-amber-600/75' : remaining === 0 ? 'text-[#3D5A35]' : 'text-[#5C4033]/38'
                }`}>
                  {allocated} / {effectiveTotal}
                  {remaining === 0 && !isOver && <span className="font-normal ml-1 opacity-70">· done</span>}
                  {isOver && <span className="font-normal ml-1 opacity-70">· over limit</span>}
                  {!isOver && remaining > 0 && <span className="font-normal ml-1 opacity-70">· {remaining} left</span>}
                </span>
              </div>
              <div className="h-[3px] bg-[#5C4033]/7 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${isOver ? 'bg-amber-400/60' : 'bg-[#3D5A35]'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* Type grid */}
            <div className="grid grid-cols-2 gap-2">
              {CASE_TYPES.map(type => {
                const val    = perType[type];
                const numVal = typeof val === 'number' ? val : 0;
                const off    = remaining === 0 && !numVal;
                return (
                  <div key={type} className={`flex flex-col gap-1 transition-opacity duration-200 ${off ? 'opacity-25 pointer-events-none' : ''}`}>
                    <label className="text-[9px] uppercase tracking-wider font-semibold text-[#5C4033]/38 truncate">{type}</label>
                    <input
                      type="number" min={0} step={1} placeholder="0" disabled={off} value={val ?? ''}
                      onKeyDown={e => (e.key === '.' || e.key === ',') && e.preventDefault()}
                      onChange={e => {
                        const n    = e.target.value === '' ? undefined : Math.max(0, Math.floor(+e.target.value));
                        const next = { ...perType, [type]: n } as Partial<Record<CaseType, number | ''>>;
                        const sum  = Object.values(next).reduce<number>((s, v) => s + (typeof v === 'number' && v > 0 ? v : 0), 0);
                        if (effectiveTotal > 0 && sum > effectiveTotal) return;
                        setPerType(next);
                      }}
                      className="gt-input text-center text-sm"
                    />
                  </div>
                );
              })}
            </div>
            <button onClick={() => finish(true)} disabled={isOver || allocated === 0 || saving} className="gt-cta mt-4">
              {saving ? 'Saving…' : 'Save Goals'}
            </button>
          </div>
        );
      }

      // DONE — GTF dashboard
      case 'done': return savedConfig ? (() => {
        const totalDone = entries.length;
        const doneByType: Record<string, number> = {};
        entries.forEach((c: any) => { doneByType[c.type] = (doneByType[c.type] || 0) + 1; });

        // ── TGR calculation ──
        let tgr: number | null = null;
        let daysRemaining = 0;
        if (savedConfig.hasEndDate && savedConfig.endDate && savedConfig.totalCases > 0 && entries.length > 0) {
          const endObj = parseDDMMYYYY(savedConfig.endDate);
          if (endObj) {
            const earliest = entries.reduce((m: string, c: any) => c.date < m ? c.date : m, entries[0].date);
            const startObj = new Date(earliest + 'T00:00:00');
            const today = new Date(); today.setHours(0, 0, 0, 0);
            daysRemaining = Math.max(0, Math.round((endObj.getTime() - today.getTime()) / 86400000));
            const totalDays = Math.max(1, Math.round((endObj.getTime() - startObj.getTime()) / 86400000));
            const elapsed = Math.max(0, Math.round((today.getTime() - startObj.getTime()) / 86400000));
            const goalPct = totalDone / savedConfig.totalCases;
            tgr = goalPct > 0 ? (elapsed / totalDays) / goalPct : 10;
          }
        }

        const zone: Zone = tgr === null ? 'focused'
          : tgr < 0.8 ? 'cruising' : tgr < 1.2 ? 'focused' : tgr < 1.5 ? 'high' : 'critical';
        const meta = ZONE_META[zone];
        const insight = generateGTFInsight(tgr, totalDone, savedConfig, doneByType);
        const completionPct = savedConfig.totalCases > 0
          ? Math.min(100, Math.round((totalDone / savedConfig.totalCases) * 100)) : 0;
        const perTypeEntries = savedConfig.hasPerType
          ? (Object.entries(savedConfig.perType) as [string, number][]).filter(([, v]) => v > 0)
          : [];

        return (
          <div className="flex flex-col gap-4">
            {/* Actions */}
            <div className="flex items-center justify-end gap-2">
              <button onClick={startEdit}
                className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold text-[#3D5A35]/60 hover:text-[#3D5A35] transition-colors">
                <Settings2 className="w-2.5 h-2.5" /> Edit
              </button>
              <span className="text-[#5C4033]/25 text-[10px]">·</span>
              <button onClick={reset}
                className="text-[9px] uppercase tracking-wider font-semibold text-[#5C4033]/35 hover:text-[#5C4033]/65 transition-colors">
                Reset
              </button>
            </div>

            {/* Overall progress + deadline */}
            {savedConfig.totalCases > 0 && (
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[10px] text-[#5C4033]/60">{totalDone} of {savedConfig.totalCases} cases</span>
                  <div className="flex items-baseline gap-2">
                    {savedConfig.hasEndDate && (
                      <span className="text-[9px] text-[#5C4033]/45">
                        {daysRemaining > 0 ? `${daysRemaining}d left` : 'due'}
                      </span>
                    )}
                    <span className="text-[10px] font-semibold" style={{ color: meta.color }}>{completionPct}%</span>
                  </div>
                </div>
                <div className="h-[2px] bg-[#5C4033]/6 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                       style={{ width: `${completionPct}%`, backgroundColor: meta.color, opacity: 0.6 }} />
                </div>
              </div>
            )}

            {/* TGR Gauge — only when deadline is set */}
            {tgr !== null && (
              <div className="max-w-[148px] mx-auto w-full">
                <TGRGauge tgr={tgr} zone={zone} />
              </div>
            )}

            {/* Strategy insight — with AI generating animation */}
            <div className="border-t border-[#5C4033]/6 pt-3">
              <div className="flex items-center gap-1.5 mb-2.5">
                <Sparkles className="w-2.5 h-2.5 shrink-0" style={{ color: meta.color, opacity: 0.8 }} />
                <span className="text-[8px] uppercase tracking-[0.12em] font-semibold"
                      style={{ color: meta.color }}>Strategy</span>
                <div className="ml-auto flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${insightReady ? '' : 'animate-pulse'}`}
                        style={{ backgroundColor: insightReady ? meta.color : '#C4A882' }} />
                  <span className="text-[8px] uppercase tracking-[0.1em] font-semibold text-[#5C4033]/35">
                    {insightReady ? 'Ready' : 'Thinking'}
                  </span>
                </div>
              </div>

              {!insightReady ? (
                <div className="flex flex-col gap-2 py-0.5">
                  <div className="flex items-end gap-[3px] h-[18px]">
                    {[0.5, 0.75, 1, 0.85, 0.65, 0.8, 0.55].map((h, i) => (
                      <div key={i} className="w-[2px] rounded-full"
                           style={{
                             height: `${h * 16}px`,
                             backgroundColor: meta.color,
                             opacity: 0.5,
                             animation: `_wv 1.1s ease-in-out ${i * 90}ms infinite alternate`,
                           }} />
                    ))}
                  </div>
                  <p className="text-[10px] font-medium text-[#5C4033]/38 tracking-wide"
                     style={{ opacity: insightVerbVisible ? 1 : 0, transition: 'opacity 180ms ease' }}>
                    {GTF_VERBS[insightVerbIdx]}…
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[#5C4033]/70 leading-relaxed"
                   style={{ animation: '_ci 0.4s ease forwards' }}>
                  {insight}
                </p>
              )}
            </div>

            {/* Per-type grid */}
            {perTypeEntries.length > 0 && (
              <div className="border-t border-[#5C4033]/6 pt-3 grid grid-cols-3 gap-x-3 gap-y-3">
                {perTypeEntries.map(([type, target]) => {
                  const done = doneByType[type] || 0;
                  const pct = target > 0 ? Math.min(100, (done / target) * 100) : 0;
                  const barColor = pct >= 100 ? '#3D5A35' : pct < 20 ? '#C47A6A' : '#C4A882';
                  return (
                    <div key={type} className="flex flex-col gap-1">
                      <span className="text-[8px] font-semibold text-[#5C4033]/38 truncate">{type.split(' ')[0]}</span>
                      <div className="h-[2px] bg-[#5C4033]/7 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                             style={{ width: `${pct}%`, backgroundColor: barColor, opacity: 0.75 }} />
                      </div>
                      <span className="text-[8px] font-semibold text-[#3B2F2F]/35">{done}/{target}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Cadence */}
            {savedConfig.hasRecurring && savedConfig.recurringCount > 0 && (
              <div className="border-t border-[#5C4033]/6 pt-2">
                <p className="text-[9px] text-[#5C4033]/50">
                  Cadence: {savedConfig.recurringCount} {savedConfig.recurringCount === 1 ? 'case' : 'cases'} /{' '}
                  {savedConfig.recurringEvery} {savedConfig.recurringEvery === 1 ? savedConfig.recurringUnit.slice(0, -1) : savedConfig.recurringUnit}
                </p>
              </div>
            )}
          </div>
        );
      })() : null;

      default: return null;
    }
  };

  return (
    <div className="glass-card p-5 relative flex flex-col group/tracker">
      <style>{`
        @keyframes _gt_fwd  { from { opacity: 0; transform: translateX(12px);  } to { opacity: 1; transform: translateX(0); } }
        @keyframes _gt_bwd  { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes _gt_glow { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.9; } }
        @keyframes _wv { from { transform: scaleY(0.35); opacity: 0.25; } to { transform: scaleY(1); opacity: 0.65; } }
        @keyframes _ci { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes _gt_lock_float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes _gt_lock_pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes _gt_ring  { 0%{transform:scale(1);opacity:0.35} 70%{transform:scale(2.2);opacity:0} 100%{transform:scale(2.2);opacity:0} }
        @keyframes _gt_ring2 { 0%{transform:scale(1);opacity:0.2}  70%{transform:scale(2.6);opacity:0} 100%{transform:scale(2.6);opacity:0} }
        .gt-fwd { animation: _gt_fwd 0.22s ease forwards; }
        .gt-bwd { animation: _gt_bwd 0.22s ease forwards; }
        .gt-input {
          background: transparent;
          border: 1px solid rgba(92,64,51,0.13); border-radius: 10px;
          padding: 7px 10px; font-size: 12px; color: #3B2F2F;
          font-family: inherit; transition: border-color 0.15s; outline: none;
        }
        .gt-input:focus { border-color: rgba(92,64,51,0.33); }
        .gt-input:disabled { opacity: 0.25; cursor: not-allowed; }
        .gt-input::placeholder { color: rgba(92,64,51,0.26); }
        .gt-input[type=number]::-webkit-outer-spin-button,
        .gt-input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .gt-input[type=number] { -moz-appearance: textfield; }
        .gt-cta {
          width: 100%; background: #3D5A35; color: #fff8f0;
          border-radius: 10px; padding: 9px; font-size: 12px; font-weight: 600;
          transition: background 0.15s, opacity 0.15s; cursor: pointer;
        }
        .gt-cta:hover:not(:disabled) { background: #2e4428; }
        .gt-cta:disabled { opacity: 0.22; cursor: not-allowed; }
      `}</style>

      {/* Persistent header row — z-10 keeps it above the lock overlay */}
      <div className="relative z-10 flex items-center justify-between mb-3">
        <div className="eyebrow !mb-0 flex items-center">
          <Target className="w-3 h-3 mr-2 text-[#3D5A35]" />
          THE TRACKER
        </div>
        {gtfZone && (
          <div className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full border"
               style={{ borderColor: `${ZONE_META[gtfZone].color}40`, backgroundColor: `${ZONE_META[gtfZone].color}12` }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                  style={{ backgroundColor: ZONE_META[gtfZone].color }} />
            <span className="text-[8px] uppercase tracking-[0.1em] font-semibold"
                  style={{ color: ZONE_META[gtfZone].color }}>
              {ZONE_META[gtfZone].label}
            </span>
          </div>
        )}
      </div>

      {/* Progress bar — below header, no collision */}
      {phase !== 'done' && (
        <div className="h-[2px] bg-[#5C4033]/10 rounded-full mb-4 overflow-hidden">
          <div
            className="h-full bg-[#3D5A35]/55 rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${stepProgress(phase)}%`,
              animation: phase === 'welcome' ? '_gt_glow 2s ease infinite' : 'none',
            }}
          />
        </div>
      )}

      {/* Back / Cancel */}
      {history.length > 0 && phase !== 'done' && (
        <div className="flex items-center justify-between mb-3">
          <button onClick={back}
            className="flex items-center gap-1 text-[10px] text-[#5C4033]/30 hover:text-[#5C4033]/60 transition-colors font-medium"
          >
            <ChevronLeft className="w-3 h-3" /> Back
          </button>
          {isEditing && (
            <button onClick={cancelEdit}
              className="text-[10px] text-[#5C4033]/28 hover:text-[#5C4033]/55 transition-colors font-medium"
            >
              Cancel edit
            </button>
          )}
        </div>
      )}

      {/* Step content with directional slide */}
      {configLoading ? (
        <div className="flex flex-col gap-2.5 py-2 animate-pulse" aria-hidden>
          <div className="h-3 w-2/3 rounded-full bg-[#5C4033]/8" />
          <div className="h-8 w-full rounded-xl bg-[#5C4033]/6" />
          <div className="h-8 w-full rounded-xl bg-[#5C4033]/6" />
        </div>
      ) : (
        <div key={animKey} className={dir === 'fwd' ? 'gt-fwd' : 'gt-bwd'}>
          {renderStep()}
        </div>
      )}

      {saveError && (
        <p className="mt-2 text-[10px] font-medium text-[#B85C5C]">{saveError}</p>
      )}

      {/* Building trail — two-tone pills of confirmed decisions */}
      {buildingTrail.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[#5C4033]/6 flex flex-wrap gap-1.5">
          {buildingTrail.map(chip => (
            <div key={chip.label} className="flex items-center gap-1 px-2.5 py-[3px] rounded-md border border-[#5C4033]/10 bg-[#D9D0C4]/18 text-[8px]">
              <span className="text-[#5C4033]/45 font-semibold uppercase tracking-wide">{chip.label}</span>
              <span className="text-[#5C4033]/25">·</span>
              <span className="font-medium text-[#3B2F2F]/65">{chip.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Lock overlay — starts below the header row so "THE TRACKER" stays visible */}
      {isLocked && (
        <div
          className="absolute left-0 right-0 bottom-0 z-[5] flex flex-col items-center justify-center text-center px-6 gap-3 transition-all duration-400"
          style={{
            top: '44px',
            backdropFilter: lockHovered ? 'blur(52px) saturate(2.4)' : 'blur(36px) saturate(2.0)',
            WebkitBackdropFilter: lockHovered ? 'blur(52px) saturate(2.4)' : 'blur(36px) saturate(2.0)',
            background: lockHovered ? 'rgba(255,248,240,0.92)' : 'rgba(255,248,240,0.82)',
            borderRadius: '0 0 inherit inherit',
          }}
          onMouseEnter={() => setLockHovered(true)}
          onMouseLeave={() => setLockHovered(false)}
        >
          <div className="relative flex items-center justify-center" style={{ width: '40px', height: '40px' }}>
            <span className="absolute inset-0 rounded-full border border-[#3D5A35]/20"
              style={{ animation: '_gt_ring2 3.4s cubic-bezier(0.215,0.61,0.355,1) 0.6s infinite' }} />
            <span className="absolute inset-0 rounded-full border border-[#3D5A35]/30"
              style={{ animation: '_gt_ring 2.8s cubic-bezier(0.215,0.61,0.355,1) infinite' }} />
            <LockKeyhole
              className="relative z-10 transition-all duration-400"
              style={{
                width: lockHovered ? '18px' : '15px',
                height: lockHovered ? '18px' : '15px',
                color: lockHovered ? 'rgba(61,90,53,0.85)' : 'rgba(61,90,53,0.55)',
                animation: '_gt_lock_float 3s ease-in-out infinite, _gt_lock_pulse 3s ease-in-out infinite',
              }}
            />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <p
              className="font-semibold tracking-[0.1em] uppercase transition-all duration-400"
              style={{
                fontSize: lockHovered ? '11px' : '10px',
                color: lockHovered ? 'rgba(61,90,53,0.9)' : 'rgba(61,90,53,0.65)',
              }}
            >
              Coming Soon
            </p>
            <div
              className="h-px bg-[#3D5A35]/20 transition-all duration-500"
              style={{ width: lockHovered ? '52px' : '28px' }}
            />
            <p
              className="text-[9.5px] leading-relaxed transition-all duration-400"
              style={{
                color: 'rgba(92,64,51,0.5)',
                opacity: lockHovered ? 1 : 0.6,
                transform: lockHovered ? 'translateY(0)' : 'translateY(2px)',
              }}
            >
              We&apos;re building something here.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoalTracker;
