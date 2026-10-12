import { LumenAgentPlan, LumenAgentPlanProvider as HbarAppUiAgentPlanProvider, selectLumenAgentPlanItem as selectHbarAppUiAgentPlanItem, uniqueLumenAgentPlanItems as uniqueHbarAppUiAgentPlanItems, type LumenAgentPlanContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiAgentPlanProps = HbarAppUiVariantProps & {
  readonly agentPlanContent?: LumenAgentPlanContent | undefined
}

export { HbarAppUiAgentPlanProvider, selectHbarAppUiAgentPlanItem, uniqueHbarAppUiAgentPlanItems }

export type { LumenAgentPlanActualContent as HbarAppUiAgentPlanActualContent, LumenAgentPlanActualMetric as HbarAppUiAgentPlanActualMetric, LumenAgentPlanActualRow as HbarAppUiAgentPlanActualRow, LumenAgentPlanBoardContent as HbarAppUiAgentPlanBoardContent, LumenAgentPlanBoardSection as HbarAppUiAgentPlanBoardSection, LumenAgentPlanBreakdownRow as HbarAppUiAgentPlanBreakdownRow, LumenAgentPlanChecklistContent as HbarAppUiAgentPlanChecklistContent, LumenAgentPlanContent as HbarAppUiAgentPlanContent, LumenAgentPlanEditableContent as HbarAppUiAgentPlanEditableContent, LumenAgentPlanGroup as HbarAppUiAgentPlanGroup, LumenAgentPlanListStrategy as HbarAppUiAgentPlanListStrategy, LumenAgentPlanProviderProps as HbarAppUiAgentPlanProviderProps, LumenAgentPlanState as HbarAppUiAgentPlanState, LumenAgentPlanStep as HbarAppUiAgentPlanStep, LumenAgentPlanSummaryContent as HbarAppUiAgentPlanSummaryContent, LumenAgentPlanSummaryMetric as HbarAppUiAgentPlanSummaryMetric, LumenAgentPlanTreeContent as HbarAppUiAgentPlanTreeContent } from '@lumen/app-ui/catalog'

/** Thin legacy-contract adapter; planning rendering, interaction state, and styling are Lumen-owned. */
export function AgentPlan({ spec, onAction, agentPlanContent, className }: HbarAppUiAgentPlanProps) {
  return (
    <LumenAgentPlan
      variant={spec.variant}
      variantId={spec.id}
      content={agentPlanContent}
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
                  ? { variantId: spec.id, actionId }
                  : { variantId: spec.id, actionId, value },
              )
          : undefined
      }
    />
  )
}
