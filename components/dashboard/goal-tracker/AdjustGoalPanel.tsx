'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import CalendarPicker from '@/components/ui/CalendarPicker';
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

/**
 * Lightweight in-place edit for a goal that fell short of its deadline —
 * lets the user push the deadline back, adjust the total, or both,
 * independently. Exists because the full step-by-step wizard (startEdit)
 * always re-enters at the date step and won't let you past it without
 * picking a new future date, even if all you wanted to touch was the total.
 */
export default function AdjustGoalPanel({ config, onSave, onClose }: AdjustGoalPanelProps) {
  const [totalCases, setTotalCases] = useState<number | ''>(config.totalCases || '');
  const [newEndDateISO, setNewEndDateISO] = useState(''); // empty = keep the current (expired) deadline
  const [saving, setSaving] = useState(false);

  const validTotal = typeof totalCases === 'number' && totalCases > 0;

  const handleSave = async () => {
    if (!validTotal) return;
    setSaving(true);
    try {
      const patch: Partial<GoalConfig> = {};
      if (totalCases !== config.totalCases) patch.totalCases = totalCases;
      if (newEndDateISO) {
        const [y, m, d] = newEndDateISO.split('-');
        patch.endDate = `${d}/${m}/${y}`;
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

      <div className="flex flex-col gap-1.5">
        <label className="text-[9px] uppercase tracking-[0.1em] font-semibold text-[#5C4033]/40">
          Deadline
        </label>
        <p className="text-[10px] text-[#5C4033]/45 leading-relaxed">
          Currently {config.endDate} (passed). Pick a new date to extend it, or leave this as-is to just adjust the total.
        </p>
        <CalendarPicker
          value={newEndDateISO}
          onChange={setNewEndDateISO}
          label="Pick a new deadline (optional)"
          minDate={getTomorrowISO()}
        />
      </div>

      <button onClick={handleSave} disabled={!validTotal || saving} className="gt-cta mt-1">
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}
