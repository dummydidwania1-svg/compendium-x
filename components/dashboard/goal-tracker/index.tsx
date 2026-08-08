import { resolveFlow } from '@/lib/goalTracker/engine'
import type { FlowRenderProps } from './types'
import Flow1TotalDeadline from './Flow1TotalDeadline'
import Flow2TotalNoDeadline from './Flow2TotalNoDeadline'
import Flow3CadenceDeadline from './Flow3CadenceDeadline'
import Flow4CadenceHabit from './Flow4CadenceHabit'
import Flow5CadenceWithTotal from './Flow5CadenceWithTotal'

const FLOW_COMPONENTS = {
  1: Flow1TotalDeadline,
  2: Flow2TotalNoDeadline,
  3: Flow3CadenceDeadline,
  4: Flow4CadenceHabit,
  5: Flow5CadenceWithTotal,
} as const

/** Dispatches to the correct Flow{N} component based on the goal's config. */
export default function FlowRenderer(props: FlowRenderProps) {
  const flow = resolveFlow(props.config)
  const Component = FLOW_COMPONENTS[flow]
  return <Component {...props} />
}

export type { FlowRenderProps } from './types'
export { default as ExclusionsPanel } from './ExclusionsPanel'
export { default as AdjustGoalPanel } from './AdjustGoalPanel'
export { default as AskTrackerButton } from './AskTrackerButton'
export { default as FreshVsPastStep } from './wizardSteps/FreshVsPastStep'
