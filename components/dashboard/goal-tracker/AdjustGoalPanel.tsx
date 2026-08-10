'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import CalendarPicker from '@/components/ui/CalendarPicker';
import { resolveFlow } from '@/lib/goalTracker/engine';
import type { GoalConfig } from '@/lib/firebase/schema';

interface AdjustGoalPanelProps {
  config: GoalConfig
  onSave: (patch: Partial<GoalConfig>) => Promise<void>
  onClose: () => void
}

function getTomorrowISO(): string {
  const t = new Date(); t.setDate(t.getDate() + 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

const CADENCE_UNITS: Array<'days' | 'weeks' | 'months'> = ['days', 'weeks', 'months'];

/**
 * Lightweight in-place edit for a goal — lets the user change cadence,
 * total, and/or deadline independently, without the full step-by-step
 * wizard (startEdit) forcing a re-entry at the date step first. Reused both
 * for a goal that fell short of its deadline and as the "Adjust my goal"
 * call-to-action alongside an AI insight (e.g. easing a slipping cadence).
 *
 * Fields shown are flow-dependent:
 *  - Total cases only shown when it's actually read for display (Flow 1/2/5).
 *    Flow 3 (cadence + deadline) always recomputes its displayed total from
 *    cadence + dates via deriveImpliedTotal — editing the stored totalCases
 *    directly would be a silent no-op there, so the field is hidden and
 *    cadence/deadline are the real levers instead.
 *  - Deadline only shown when the goal has one (Flow 1/3).
 *  - Cadence only shown for cadence goals (Flow 3/4/5).
 */
export default function AdjustGoalPanel({ config, onSave, onClose }: AdjustGoalPanelProps) {
  const flow = resolveFlow(config);
  // Flow 3's total is always recomputed from cadence+dates (never read from
  // storage) and Flow 4 has no total concept at all (pure habit, no total
  // bar ever) — showing the field there would either be a silent no-op or
  // force a value the goal was never meant to have.
  const showTotal = flow !== 3 && flow !== 4;
  const showDeadline = config.hasEndDate;
  const showCadence = config.goalKind === 'cadence';

  const [totalCases, setTotalCases] = useState<number | ''>(config.totalCases || '');
  const [newEndDateISO, setNewEndDateISO] = useState(''); // empty = keep the current deadline
  const [rCount, setRCount] = useState<number | ''>(config.recurringCount || '');
  const [rEvery, setREvery] = useState<number | ''>(config.recurringEvery || '');
  const [rUnit, setRUnit] = useState<'days' | 'weeks' | 'months'>(config.recurringUnit);
  const [saving, setSaving] = useState(false);

  const validTotal = !showTotal || (typeof totalCases === 'number' && totalCases > 0);
  const validCadence = !showCadence || (typeof rCount === 'number' && rCount > 0 && typeof rEvery === 'number' && rEvery > 0);
  const cadenceChanged = showCadence && (rCount !== config.recurringCount || rEvery !== config.recurringEvery || rUnit !== config.recurringUnit);

  const handleSave = async () => {
    if (!validTotal || !validCadence) return;
    setSaving(true);
    try {
      const patch: Partial<GoalConfig> = {};
      if (showTotal && totalCases !== config.totalCases) patch.totalCases = totalCases as number;
      if (showDeadline && newEndDateISO) {
        const [y, m, d] = newEndDateISO.split('-');
        patch.endDate = `${d}/${m}/${y}`;
      }
      if (cadenceChanged) {
        patch.recurringCount = rCount as number;
        patch.recurringEvery = rEvery as number;
        patch.recurringUnit = rUnit;
      }
      if (Object.keys(patch).length > 0) await onSave(patch);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="eyebrow !mb-0">Adjust goal</span>
        <button onClick={onClose} className="text-[#5C4033]/40 hover:text-[#5C4033]/70 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {showCadence && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] uppercase tracking-[0.1em] font-semibold text-[#5C4033]/40">
            Cadence
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#5C4033]/50 shrink-0">Practice</span>
            <input
              type="number" min={1} step={1} value={rCount}
              onKeyDown={(e) => (e.key === '.' || e.key === ',') && e.preventDefault()}
              onChange={(e) => setRCount(e.target.value === '' ? '' : Math.max(1, Math.floor(+e.target.value)))}
              className="gt-input w-14 text-center"
            />
            <span className="text-[11px] text-[#5C4033]/50 shrink-0">cases every</span>
            <input
              type="number" min={1} step={1} value={rEvery}
              onKeyDown={(e) => (e.key === '.' || e.key === ',') && e.preventDefault()}
              onChange={(e) => setREvery(e.target.value === '' ? '' : Math.max(1, Math.floor(+e.target.value)))}
              className="gt-input w-14 text-center"
            />
            <div className="flex rounded-lg overflow-hidden border border-[#5C4033]/12 shrink-0">
              {CADENCE_UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setRUnit(u)}
                  className={`px-2 py-[6px] text-[9px] font-bold uppercase tracking-widest transition-colors ${
                    rUnit === u ? 'bg-[#3B2F2F] text-[#F0EBE3]' : 'text-[#5C4033]/35 hover:bg-[#D9D0C4]/30'
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          {cadenceChanged && (
            <p className="text-[9.5px] text-[#5C4033]/45 leading-relaxed">
              Changing your cadence recalculates past periods under the new schedule — your streak may shift.
            </p>
          )}
        </div>
      )}

      {showTotal && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] uppercase tracking-[0.1em] font-semibold text-[#5C4033]/40">
            Total cases
          </label>
          <input
            type="number" min={1} step={1} value={totalCases}
            onKeyDown={(e) => (e.key === '.' || e.key === ',') && e.preventDefault()}
            onChange={(e) => setTotalCases(e.target.value === '' ? '' : Math.max(1, Math.floor(+e.target.value)))}
            className="gt-input text-center text-sm font-semibold"
          />
        </div>
      )}

      {showDeadline && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] uppercase tracking-[0.1em] font-semibold text-[#5C4033]/40">
            Deadline
          </label>
          <p className="text-[10px] text-[#5C4033]/45 leading-relaxed">
            Currently {config.endDate}. Pick a new date to push it back, or leave this as-is.
          </p>
          <CalendarPicker
            value={newEndDateISO}
            onChange={setNewEndDateISO}
            label="Pick a new deadline (optional)"
            minDate={getTomorrowISO()}
          />
        </div>
      )}

      <button onClick={handleSave} disabled={!validTotal || !validCadence || saving} className="gt-cta mt-1">
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}
