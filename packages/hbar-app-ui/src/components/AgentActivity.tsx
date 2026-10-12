import { LumenAgentActivity, LumenAgentActivityProvider as HbarAppUiAgentActivityProvider, selectLumenAgentActivityItem as selectHbarAppUiAgentActivityItem, uniqueLumenAgentActivityItems as uniqueHbarAppUiAgentActivityItems, type LumenAgentActivityContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'

/** Compatibility props retained while the implementation lives in @lumen/app-ui. */
export type HbarAppUiAgentActivityProps = HbarAppUiVariantProps & {
  readonly agentActivityContent?: LumenAgentActivityContent | undefined
}

export { HbarAppUiAgentActivityProvider, selectHbarAppUiAgentActivityItem, uniqueHbarAppUiAgentActivityItems }

export type { LumenAgentActivityAttempt as HbarAppUiAgentActivityAttempt, LumenAgentActivityContent as HbarAppUiAgentActivityContent, LumenAgentActivityDeploymentContent as HbarAppUiAgentActivityDeploymentContent, LumenAgentActivityDeploymentStep as HbarAppUiAgentActivityDeploymentStep, LumenAgentActivityFailureContent as HbarAppUiAgentActivityFailureContent, LumenAgentActivityHistoryContent as HbarAppUiAgentActivityHistoryContent, LumenAgentActivityHistoryRow as HbarAppUiAgentActivityHistoryRow, LumenAgentActivityInput as HbarAppUiAgentActivityInput, LumenAgentActivityListStrategy as HbarAppUiAgentActivityListStrategy, LumenAgentActivityLiveContent as HbarAppUiAgentActivityLiveContent, LumenAgentActivityLiveStep as HbarAppUiAgentActivityLiveStep, LumenAgentActivityLogContent as HbarAppUiAgentActivityLogContent, LumenAgentActivityLogEntry as HbarAppUiAgentActivityLogEntry, LumenAgentActivityLogFilter as HbarAppUiAgentActivityLogFilter, LumenAgentActivityLogLevel as HbarAppUiAgentActivityLogLevel, LumenAgentActivityNestedChild as HbarAppUiAgentActivityNestedChild, LumenAgentActivityNestedContent as HbarAppUiAgentActivityNestedContent, LumenAgentActivityNestedGroup as HbarAppUiAgentActivityNestedGroup, LumenAgentActivityOutput as HbarAppUiAgentActivityOutput, LumenAgentActivityProviderProps as HbarAppUiAgentActivityProviderProps, LumenAgentActivityState as HbarAppUiAgentActivityState, LumenAgentActivityWorker as HbarAppUiAgentActivityWorker, LumenAgentActivityWorkersContent as HbarAppUiAgentActivityWorkersContent } from '@lumen/app-ui/catalog'

/** Thin legacy-contract adapter; rendering, interaction state, and styling are Lumen-owned. */
export function AgentActivity({ spec, onAction, agentActivityContent, className }: HbarAppUiAgentActivityProps) {
  return (
    <LumenAgentActivity
      variant={spec.variant}
      variantId={spec.id}
      content={agentActivityContent}
      className={className}
      density={spec.density}
      surface={spec.profile.surface}
      state={spec.profile.initialState}
      visualMode={spec.profile.visualMode}
      onAction={
        onAction
          ? ({ actionId, value }) =>
              onAction(
                value === undefined
                  ? {
                      variantId: spec.id,
                      actionId,
                    }
                  : {
                      variantId: spec.id,
                      actionId,
                      value,
                    },
              )
          : undefined
      }
    />
  )
}
