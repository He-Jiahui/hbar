import { LumenAgentApproval, LumenAgentApprovalProvider as HbarAppUiAgentApprovalProvider, selectLumenAgentApprovalItem as selectHbarAppUiAgentApprovalItem, uniqueLumenAgentApprovalItems as uniqueHbarAppUiAgentApprovalItems, type LumenAgentApprovalContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiAgentApprovalProps = HbarAppUiVariantProps & {
  readonly agentApprovalContent?: LumenAgentApprovalContent | undefined
}

export { HbarAppUiAgentApprovalProvider, selectHbarAppUiAgentApprovalItem, uniqueHbarAppUiAgentApprovalItems }

export type { LumenAgentApprovalChange as HbarAppUiAgentApprovalChange, LumenAgentApprovalContent as HbarAppUiAgentApprovalContent, LumenAgentApprovalCostContent as HbarAppUiAgentApprovalCostContent, LumenAgentApprovalCostMetric as HbarAppUiAgentApprovalCostMetric, LumenAgentApprovalDiffContent as HbarAppUiAgentApprovalDiffContent, LumenAgentApprovalHistoryContent as HbarAppUiAgentApprovalHistoryContent, LumenAgentApprovalHistoryEntry as HbarAppUiAgentApprovalHistoryEntry, LumenAgentApprovalHistoryFilter as HbarAppUiAgentApprovalHistoryFilter, LumenAgentApprovalInlineContent as HbarAppUiAgentApprovalInlineContent, LumenAgentApprovalListStrategy as HbarAppUiAgentApprovalListStrategy, LumenAgentApprovalPermissionContent as HbarAppUiAgentApprovalPermissionContent, LumenAgentApprovalProviderProps as HbarAppUiAgentApprovalProviderProps, LumenAgentApprovalQueueContent as HbarAppUiAgentApprovalQueueContent, LumenAgentApprovalQueueItem as HbarAppUiAgentApprovalQueueItem, LumenAgentApprovalScope as HbarAppUiAgentApprovalScope, LumenAgentApprovalState as HbarAppUiAgentApprovalState } from '@lumen/app-ui/catalog'

/** Thin legacy-contract adapter; approval rendering and state are Lumen-owned. */
export function AgentApproval({ spec, onAction, agentApprovalContent, className }: HbarAppUiAgentApprovalProps) {
  return (
    <LumenAgentApproval
      variant={spec.variant}
      variantId={spec.id}
      content={agentApprovalContent}
      className={className}
      density={spec.density}
      surface={spec.profile.surface}
      state={spec.profile.initialState}
      visualMode={spec.profile.visualMode}
      onAction={
        onAction
          ? ({ actionId, value }) =>
              onAction(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
          : undefined
      }
    />
  )
}
