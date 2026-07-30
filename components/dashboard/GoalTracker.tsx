'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Settings2, Target, LockKeyhole } from 'lucide-react';
import { deleteDoc, onSnapshot, serverTimestamp, setDoc, addDoc } from 'firebase/firestore';
import CalendarPicker from '@/components/ui/CalendarPicker';
import { goalDoc, goalHistoryCol } from '@/lib/firebase/collections';
import type { GoalConfig } from '@/lib/firebase/schema';
import { useDashboard } from './DashboardContext';
import { subscribeGoalCounts, type GoalCountResult } from '@/lib/goalTracker/sessionCounts';
import { computeStreak, parseDMY, resolveFlow, startOfDay, type CadenceUnit, type GoalState } from '@/lib/goalTracker/engine';
import FlowRenderer, { ExclusionsPanel, AskTrackerButton, FreshVsPastStep } from './goal-tracker';

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
  | 'askOverrideTotal' | 'enterTotal' | 'freshVsPast' | 'askPerType' | 'enterPerType' | 'done';

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

function getTodayDMY(): string {
  const t = new Date();
  return `${String(t.getDate()).padStart(2, '0')}/${String(t.getMonth() + 1).padStart(2, '0')}/${t.getFullYear()}`;
}

function getTomorrowISO(): string {
  const t = new Date(); t.setDate(t.getDate() + 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

function stepProgress(p: Phase): number {
  return ({
    welcome: 6, enterDate: 18, askRecurring: 30, enterRecurring: 44,
    askOverrideTotal: 54, enterTotal: 60, freshVsPast: 70, askPerType: 80, enterPerType: 90, done: 100,
  } as Record<Phase, number>)[p] ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

export const OptionList = ({ options }: {
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
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const GoalTracker = ({ isLocked }: { isLocked: boolean }) => {
  const { user } = useDashboard();
  const [lockHovered, setLockHovered] = useState(false);
  const [phase, setPhase]         = useState<Phase>('welcome');
  const [history, setHistory]     = useState<Phase[]>([]);
  const [dir, setDir]             = useState<'fwd' | 'bwd'>('fwd');
  const [animKey, setAnimKey]     = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [showExclusions, setShowExclusions] = useState(false);

  const [hasEndDate, setHasEndDate]     = useState<boolean | null>(null);
  const [endDate, setEndDate]           = useState('');      // DD/MM/YYYY
  const [hasRecurring, setHasRecurring] = useState<boolean | null>(null);
  const [rCount, setRCount]             = useState<number | ''>('');
  const [rEvery, setREvery]             = useState<number | ''>('');
  const [rUnit, setRUnit]               = useState<'days' | 'weeks' | 'months'>('weeks');
  const [totalCases, setTotalCases]     = useState<number | ''>('');
  const [countPastCases, setCountPastCases] = useState(false);
  const [perType, setPerType]           = useState<Partial<Record<CaseType, number | ''>>>({});
  const [savedConfig, setSavedConfig]   = useState<GoalConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [saving, setSaving]             = useState(false);
  const [saveError, setSaveError]       = useState('');

  // Live session-based progress (replaces the old evaluation-based `entries`
  // pipeline — count source is completed sessions, per §2 of the locked spec).
  const [counts, setCounts] = useState<GoalCountResult>({ countedSessions: [], done: 0, doneByType: {} });
  const [resolvedState, setResolvedState] = useState<GoalState>('zero');

  useEffect(() => {
    if (!user || !savedConfig) {
      setCounts({ countedSessions: [], done: 0, doneByType: {} });
      return;
    }
    const unsubscribe = subscribeGoalCounts(user.uid, savedConfig, setCounts);
    return () => unsubscribe();
  }, [user, savedConfig]);

  // Rough pre-count of past sessions, for the freshVsPast wizard step's "N
  // would count" preview — a lightweight one-shot subscription against the
  // in-progress wizard fields rather than the saved config (which doesn't
  // exist yet at this point in the flow).
  const [pastCasesPreview, setPastCasesPreview] = useState(0);
  useEffect(() => {
    if (!user || phase !== 'freshVsPast') return;
    const unsubscribe = subscribeGoalCounts(
      user.uid,
      {
        startDate: '01/01/1970',
        countPastCases: true,
        countMode: 'completed',
        excludedTypes: [],
        excludedSessionIds: [],
      },
      (result) => setPastCasesPreview(result.done),
    );
    return () => unsubscribe();
  }, [user, phase]);

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
  const startEdit = useCallback(() => {
    if (!savedConfig) return;
    setHasEndDate(savedConfig.hasEndDate);
    setEndDate(savedConfig.endDate);
    setHasRecurring(savedConfig.hasRecurring);
    setRCount(savedConfig.recurringCount || '');
    setREvery(savedConfig.recurringEvery || '');
    setRUnit(savedConfig.recurringUnit);
    setTotalCases(savedConfig.totalCases || '');
    setCountPastCases(savedConfig.countPastCases);
    setPerType({ ...savedConfig.perType } as Partial<Record<CaseType, number | ''>>);
    setHistory([]); setIsEditing(true);
    setDir('bwd'); setAnimKey(k => k + 1); setPhase('welcome');
  }, [savedConfig]);
  const cancelEdit = () => {
    setIsEditing(false); setHistory([]);
    setDir('fwd'); setAnimKey(k => k + 1); setPhase('done');
  };

  /** Archives the current goal into goalHistory before it's cleared — feeds the AI insight's cross-goal axis. */
  const archiveCurrentGoal = useCallback(async () => {
    if (!user || !savedConfig) return;
    try {
      const start = parseDMY(savedConfig.startDate);
      const today = startOfDay(new Date());
      let finalStreak = 0;
      let bestStreak = 0;
      if (savedConfig.goalKind === 'cadence' && start) {
        const streak = computeStreak(
          counts.countedSessions.map((s) => new Date(s.completedAtMs)),
          { unit: savedConfig.recurringUnit as CadenceUnit, every: savedConfig.recurringEvery, count: savedConfig.recurringCount },
          start,
          today,
        );
        finalStreak = streak.currentStreak;
        bestStreak = streak.bestStreak;
      }
      const completed = savedConfig.totalCases > 0 && counts.done >= savedConfig.totalCases;
      const daysToComplete = completed && start ? Math.round((today.getTime() - start.getTime()) / 86400000) : undefined;
      const fellShortBy = !completed && savedConfig.totalCases > 0 ? Math.max(0, savedConfig.totalCases - counts.done) : undefined;

      await addDoc(goalHistoryCol(user.uid), {
        config: { ...savedConfig },
        completed,
        finalDone: counts.done,
        finalStreak,
        bestStreak,
        daysToComplete,
        fellShortBy,
        closedAt: serverTimestamp(),
      });
    } catch {
      // Best-effort — losing one history entry shouldn't block the reset itself.
    }
  }, [user, savedConfig, counts]);

  const reset = async () => {
    await archiveCurrentGoal();
    setSavedConfig(null);
    setHasEndDate(null); setEndDate(''); setHasRecurring(null);
    setRCount(''); setREvery(''); setRUnit('weeks');
    setTotalCases(''); setCountPastCases(false); setPerType({}); setHistory([]);
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
    const goalKind: GoalConfig['goalKind'] = hasRecurring ? 'cadence' : 'flat';
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
      startDate: isEditing && savedConfig ? savedConfig.startDate : getTodayDMY(),
      countPastCases,
      countMode: isEditing && savedConfig ? savedConfig.countMode : 'completed',
      excludedTypes: isEditing && savedConfig ? savedConfig.excludedTypes : [],
      excludedSessionIds: isEditing && savedConfig ? savedConfig.excludedSessionIds : [],
      goalKind,
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
      const createdAtPatch = isEditing && savedConfig?.createdAt ? {} : { createdAt: serverTimestamp() };
      await setDoc(goalDoc(user.uid), { ...cfg, ...createdAtPatch, updatedAt: serverTimestamp() });
      setSavedConfig(cfg);
      setIsEditing(false);
      go('done');
    } catch {
      setSaveError("Couldn't save your goal. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleExclusionsSave = async (patch: Partial<GoalConfig>) => {
    if (!user) return;
    await setDoc(goalDoc(user.uid), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
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
                  if (hasEndDate && autoTotal && autoTotal > 0) { setTotalCases(autoTotal); go('freshVsPast'); }
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
              onClick={() => go('freshVsPast')}
              disabled={!(typeof totalCases === 'number' && totalCases > 0)}
              className="gt-cta"
            >
              Continue
            </button>
          </div>
        </div>
      );

      case 'freshVsPast': return (
        <FreshVsPastStep
          pastCasesCount={pastCasesPreview}
          OptionList={OptionList}
          onChoose={(choice: boolean) => { setCountPastCases(choice); go('askPerType'); }}
        />
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

      // DONE — dispatches to the flow-specific renderer
      case 'done': return savedConfig ? (
        showExclusions ? (
          <ExclusionsPanel
            config={savedConfig}
            countedSessions={counts.countedSessions}
            onSave={handleExclusionsSave}
            onClose={() => setShowExclusions(false)}
          />
        ) : (
          <>
            <FlowRenderer
              config={savedConfig}
              counts={counts}
              onEdit={startEdit}
              onReset={reset}
              onShowExclusions={() => setShowExclusions(true)}
              onStateResolved={setResolvedState}
            />
            <div className="border-t border-[#5C4033]/6 pt-3 mt-1 flex justify-center">
              <AskTrackerButton goalState={resolvedState} />
            </div>
          </>
        )
      ) : null;

      default: return null;
    }
  };

  return (
    <div className="glass-card p-5 relative flex flex-col group/tracker">
      <style>{`
        @keyframes _gt_fwd  { from { opacity: 0; transform: translateX(12px);  } to { opacity: 1; transform: translateX(0); } }
        @keyframes _gt_bwd  { from { opacity: 0; transform: translateX(-12px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes _gt_glow { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.9; } }
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
