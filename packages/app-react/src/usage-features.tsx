import { LumenFrame } from '@lumen/app-ui'
import type { UsageBudgetRuntime, UsageRequestsRuntime } from '@hbar/app-runtime'
import { HbarUsageBudget, type HbarUsageBudgetLabels } from './usage-budget'
import { HbarUsageRequests, type HbarUsageRequestsLabels } from './usage-requests'

export interface HbarUsageFeaturesLabels {
  readonly requests: HbarUsageRequestsLabels
  readonly budget: HbarUsageBudgetLabels
}

export interface HbarUsageFeaturesProps {
  /** The owning Status surface controls visibility; hidden panels must not query Host. */
  readonly visible: boolean
  readonly requests?: UsageRequestsRuntime | undefined
  readonly budget?: UsageBudgetRuntime | undefined
  readonly labels: HbarUsageFeaturesLabels
  readonly onOpenRequest?: (target: { readonly sessionId: string; readonly runId: string | null; readonly usageId: string }) => void
}

/** Composes the two usage capabilities inside one visible Status panel. */
export function HbarUsageFeatures({ visible, requests, budget, labels, onOpenRequest }: HbarUsageFeaturesProps) {
  if (!visible || (!requests && !budget)) return null
  return (
    <LumenFrame as="section" className="hbar-usage-features">
      {requests ? <HbarUsageRequests runtime={requests} labels={labels.requests} onOpenRequest={onOpenRequest} /> : null}
      {budget ? <HbarUsageBudget runtime={budget} labels={labels.budget} /> : null}
    </LumenFrame>
  )
}
