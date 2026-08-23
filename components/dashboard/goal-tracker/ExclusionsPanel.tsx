'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { FILTER_TYPES } from '@/lib/constants';
import type { GoalConfig } from '@/lib/firebase/schema';
import type { CountedSession } from '@/lib/goalTracker/sessionCounts';

interface ExclusionsPanelProps {
  config: GoalConfig
  countedSessions: CountedSession[]
  /** Pre-filter candidate set — excluded sessions only exist here, so this is
   *  what makes them un-excludable. Falls back to countedSessions when absent. */
  candidateSessions?: CountedSession[]
  onSave: (patch: Partial<GoalConfig>) => Promise<void>
  onClose: () => void
}

/**
 * Exclusions settings (§5) — lives in one place, minimal by design. Three
 * controls: count-unrated toggle, type-exclude checkboxes (hidden entirely
 * when hasPerType is true — mutually exclusive by construction, a per-type
 * target of 0 already achieves the same effect), and a single-session
 * exclude list. Any change here recomputes the whole goal retroactively —
 * that "recompute" is free: subscribeGoalCounts re-fires on the new config,
 * and engine.ts's pure functions re-derive from the new counted set on the
 * next render. No explicit migration step.
 */
export default function ExclusionsPanel({ config, countedSessions, candidateSessions, onSave, onClose }: ExclusionsPanelProps) {
  const [countMode, setCountMode] = useState(config.countMode)
  const [excludedTypes, setExcludedTypes] = useState<string[]>(config.excludedTypes)
  const [excludedSessionIds, setExcludedSessionIds] = useState<string[]>(config.excludedSessionIds)
  const [saving, setSaving] = useState(false)

  // Render the PRE-filter candidate list: an excluded session disappears from
  // `countedSessions`, so listing only those would trap it as permanently
  // excluded. Newest first for scannability.
  const listableSessions = useMemo(() => {
    const source = (candidateSessions?.length ? candidateSessions : countedSessions)
      ?? []
    return [...source].sort((a, b) => b.completedAtMs - a.completedAtMs)
  }, [candidateSessions, countedSessions])

  const toggleType = (type: string) => {
    setExcludedTypes((prev) => (prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]))
  }

  const toggleSession = (sessionId: string) => {
    setExcludedSessionIds((prev) =>
      prev.includes(sessionId) ? prev.filter((id) => id !== sessionId) : [...prev, sessionId],
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave({ countMode, excludedTypes, excludedSessionIds })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="eyebrow !mb-0">What counts</span>
        <button onClick={onClose} className="text-[#5C4033]/40 hover:text-[#5C4033]/70 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Count unrated cases toggle */}
      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <div>
          <p className="text-[11px] font-medium text-[#3B2F2F]">Count unrated cases?</p>
          <p className="text-[9px] text-[#5C4033]/45 mt-0.5">
            {countMode === 'completed' ? 'Any finished session counts.' : 'Only cases with a rating count.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCountMode(countMode === 'completed' ? 'rated' : 'completed')}
          className="relative w-9 h-5 rounded-full shrink-0 transition-colors"
          style={{ background: countMode === 'completed' ? '#3D5A35' : 'rgba(92,64,51,0.15)' }}
        >
          <span
            className="absolute top-[2px] w-4 h-4 rounded-full bg-white shadow transition-transform"
            style={{ transform: countMode === 'completed' ? 'translateX(18px)' : 'translateX(2px)' }}
          />
        </button>
      </label>

      {/* Type-exclude checkboxes — hidden entirely when per-type split is active */}
      {!config.hasPerType && (
        <div>
          <p className="text-[9px] uppercase tracking-[0.1em] font-semibold text-[#5C4033]/40 mb-2">
            Exclude case types
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {FILTER_TYPES.map((type) => (
              <label key={type} className="flex items-center gap-2 text-[11px] text-[#3B2F2F]/75 cursor-pointer">
                <input
                  type="checkbox"
                  checked={excludedTypes.includes(type)}
                  onChange={() => toggleType(type)}
                  className="accent-[#3D5A35]"
                />
                {type}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Single-case exclude list — shows ALL candidates, including ones
          already excluded (so they can be un-excluded) */}
      {listableSessions.length > 0 && (
        <div>
          <p className="text-[9px] uppercase tracking-[0.1em] font-semibold text-[#5C4033]/40 mb-2">
            Exclude a single case
          </p>
          <div className="max-h-[140px] overflow-y-auto flex flex-col gap-1">
            {listableSessions.map((s) => (
              <label key={s.sessionId} className="flex items-center gap-2 text-[10px] text-[#3B2F2F]/65 cursor-pointer px-1 py-1 rounded hover:bg-[#D9D0C4]/15">
                <input
                  type="checkbox"
                  checked={excludedSessionIds.includes(s.sessionId)}
                  onChange={() => toggleSession(s.sessionId)}
                  className="accent-[#3D5A35]"
                />
                {s.caseType} &middot; {new Date(s.completedAtMs).toLocaleDateString()}
                {!countedSessions.some((c) => c.sessionId === s.sessionId) && (
                  <span className="text-[8.5px] text-[#5C4033]/35 italic ml-auto pl-2 shrink-0">excluded</span>
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      <button onClick={handleSave} disabled={saving} className="gt-cta mt-1">
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  )
}
