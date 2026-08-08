import type { GoalConfig } from '@/lib/firebase/schema'
import type { GoalCountResult } from '@/lib/goalTracker/sessionCounts'
import type { GoalState } from '@/lib/goalTracker/engine'

/** Shared props every Flow{N} component receives from the GoalTracker orchestrator. */
export interface FlowRenderProps {
  config: GoalConfig
  counts: GoalCountResult
  onEdit: () => void
  onReset: () => void
  onShowExclusions: () => void
  /** Opens the lightweight fell-short adjust panel (change total and/or deadline independently, no forced wizard walk-through). */
  onQuickAdjust: () => void
  /** Reported up so the orchestrator can pass it to AskTrackerButton for redundancy context. */
  onStateResolved: (state: GoalState) => void
}
