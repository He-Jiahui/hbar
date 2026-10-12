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
import { createMessageScope } from './messages'
import {
  createHbarUsageBudgetMessages,
  HbarUsageBudgetMessageScope,
  HbarUsageBudgetView,
  type HbarUsageBudgetLabels,
  type HbarUsageBudgetMessages,
} from './usage-budget'
import {
  createHbarUsageRequestsMessages,
  HbarUsageRequestsMessageScope,
  HbarUsageRequestsView,
  type HbarUsageRequestsLabels,
  type HbarUsageRequestsMessages,
} from './usage-requests'

export interface HbarUsageFeaturesLabels {
  readonly requests: HbarUsageRequestsLabels
  readonly budget: HbarUsageBudgetLabels
}
export interface HbarUsageFeaturesMessages {
  readonly requests: HbarUsageRequestsMessages
  readonly budget: HbarUsageBudgetMessages
}
export const HbarUsageFeaturesMessageScope = createMessageScope<HbarUsageFeaturesMessages>()

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
  return (
    <HbarUsageFeaturesMessageScope.Provider
      messages={{
        requests: createHbarUsageRequestsMessages(labels.requests),
        budget: createHbarUsageBudgetMessages(labels.budget),
      }}
    >
      <HbarUsageFeaturesContent
        visible={visible}
        requests={requests}
        budget={budget}
        {...(onOpenRequest ? { onOpenRequest } : {})}
        scope={scope}
        filters={filters}
        range={range}
      />
    </HbarUsageFeaturesMessageScope.Provider>
  )
}

function HbarUsageFeaturesContent({
  visible,
  requests,
  budget,
  onOpenRequest,
  scope,
  filters,
  range,
}: Omit<HbarUsageFeaturesProps, 'labels'>) {
  const { t } = HbarUsageFeaturesMessageScope.useMessages()
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
        <HbarUsageRequestsMessageScope.Provider messages={t('requests')}>
          <HbarUsageRequestsView managed runtime={requests} {...(onOpenRequest ? { onOpenRequest } : {})} />
        </HbarUsageRequestsMessageScope.Provider>
      ) : null}
      {budget ? (
        <HbarUsageBudgetMessageScope.Provider messages={t('budget')}>
          <HbarUsageBudgetView runtime={budget} />
        </HbarUsageBudgetMessageScope.Provider>
      ) : null}
    </LumenFrame>
  )
}
