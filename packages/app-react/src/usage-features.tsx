import { LumenFrame } from '@lumen/app-ui'
import type { UsageBudgetRuntime, UsageRequestsRuntime } from '@hbar/app-runtime'
import {
  usageScopeSchema,
  usageFiltersSchema,
  usageExportInputSchema,
  type UsageExportInput,
} from '@hbar/contracts/commands/usage'
import type { UsageFilters, UsageScope } from '@hbar/contracts/commands/usage'
import { useEffect } from 'react'
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
  readonly scope?: UsageScope | undefined
  readonly filters?: UsageFilters | undefined
  readonly range?: Pick<UsageExportInput, 'from' | 'to'> | undefined
  readonly onOpenRequest?: (target: {
    readonly workspaceId: string
    readonly sessionId: string
    readonly runId: string | null
    readonly usageId: string
  }) => void | Promise<void>
}

/** Composes the two usage capabilities inside one visible Status panel. */
export function HbarUsageFeatures({
  visible,
  requests,
  budget,
  labels,
  onOpenRequest,
  scope,
  filters,
  range,
}: HbarUsageFeaturesProps) {
  const scopeKey = JSON.stringify(scope)
  const filterKey = JSON.stringify(filters)
  const rangeKey = JSON.stringify(range)
  useEffect(() => {
    if (visible && requests && scopeKey) {
      const selectedScope = usageScopeSchema.parse(JSON.parse(scopeKey))
      const selectedFilters = filterKey ? usageFiltersSchema.parse(JSON.parse(filterKey)) : undefined
      const selectedRange = rangeKey
        ? usageExportInputSchema.pick({ from: true, to: true }).parse(JSON.parse(rangeKey))
        : undefined
      void requests.setScope(selectedScope, selectedFilters, selectedRange).catch(() => undefined)
    }
  }, [visible, requests, scopeKey, filterKey, rangeKey])
  useEffect(() => {
    if (visible && budget) void budget.refresh().catch(() => undefined)
  }, [visible, budget])
  if (!visible || (!requests && !budget)) return null
  return (
    <LumenFrame as="section" className="hbar-usage-features">
      {requests ? (
        <HbarUsageRequests
          managed
          runtime={requests}
          labels={labels.requests}
          {...(onOpenRequest ? { onOpenRequest } : {})}
        />
      ) : null}
      {budget ? <HbarUsageBudget runtime={budget} labels={labels.budget} /> : null}
    </LumenFrame>
  )
}
