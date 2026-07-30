import type { GoalState } from '@/lib/goalTracker/engine'

/**
 * Locked state-color language (§6): green family = good/hit/complete,
 * sage-amber = slightly behind, amber = behind/missed, red = at-risk/fell
 * short, neutral grey = just-started/evergreen no-judgment states.
 */
const STATE_META: Record<GoalState, { label: string; color: string }> = {
  zero: { label: 'Just started', color: '#8a7a68' },
  ahead: { label: 'Ahead', color: '#3D5A35' },
  onTrack: { label: 'On track', color: '#3D5A35' },
  slightlyBehind: { label: 'Slightly behind', color: '#9a8a3a' },
  behind: { label: 'Behind', color: '#c08329' },
  atRisk: { label: 'At risk', color: '#b23a30' },
  completeEarly: { label: 'Complete', color: '#3D5A35' },
  fellShort: { label: 'Fell short', color: '#b23a30' },
  inProgress: { label: 'In progress', color: '#8a7a68' },
  complete: { label: 'Complete', color: '#3D5A35' },
  periodOpenOnPace: { label: 'On pace', color: '#3D5A35' },
  periodOpenAtRisk: { label: 'Slipping', color: '#c08329' },
  periodHit: { label: 'Hit', color: '#3D5A35' },
  periodMissed: { label: 'Missed last week', color: '#c08329' },
}

export function stateColor(state: GoalState): string {
  return STATE_META[state].color
}

export default function StateChip({ state }: { state: GoalState }) {
  const meta = STATE_META[state]
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full border"
      style={{ borderColor: `${meta.color}40`, backgroundColor: `${meta.color}12` }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
      <span className="text-[8px] uppercase tracking-[0.1em] font-semibold" style={{ color: meta.color }}>
        {meta.label}
      </span>
    </div>
  )
}
