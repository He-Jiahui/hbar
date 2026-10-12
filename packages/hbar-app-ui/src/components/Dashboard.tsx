import { LumenDashboard, LumenDashboardProvider as HbarAppUiDashboardProvider, type LumenDashboardContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiDashboardProps = HbarAppUiVariantProps & {
  readonly dashboardContent?: LumenDashboardContent | undefined
}
export { HbarAppUiDashboardProvider }
export { selectLumenDashboardItem as selectHbarAppUiDashboardItem, uniqueLumenDashboardItems as uniqueHbarAppUiDashboardItems, useLumenDashboardContent as useHbarAppUiDashboardContent } from '@lumen/app-ui/catalog'
export type { LumenDashboardAction as HbarAppUiDashboardAction, LumenDashboardActivity as HbarAppUiDashboardActivity, LumenDashboardBreakdown as HbarAppUiDashboardBreakdown, LumenDashboardChoice as HbarAppUiDashboardChoice, LumenDashboardComparisonContent as HbarAppUiDashboardComparisonContent, LumenDashboardContent as HbarAppUiDashboardContent, LumenDashboardCoverageContent as HbarAppUiDashboardCoverageContent, LumenDashboardDeliveryContent as HbarAppUiDashboardDeliveryContent, LumenDashboardExplorerContent as HbarAppUiDashboardExplorerContent, LumenDashboardListStrategy as HbarAppUiDashboardListStrategy, LumenDashboardMeasure as HbarAppUiDashboardMeasure, LumenDashboardMetric as HbarAppUiDashboardMetric, LumenDashboardModule as HbarAppUiDashboardModule, LumenDashboardObjective as HbarAppUiDashboardObjective, LumenDashboardOperationsContent as HbarAppUiDashboardOperationsContent, LumenDashboardOverviewContent as HbarAppUiDashboardOverviewContent, LumenDashboardPayoutContent as HbarAppUiDashboardPayoutContent, LumenDashboardPoint as HbarAppUiDashboardPoint, LumenDashboardProjectContent as HbarAppUiDashboardProjectContent, LumenDashboardProviderProps as HbarAppUiDashboardProviderProps, LumenDashboardQuota as HbarAppUiDashboardQuota, LumenDashboardScorecardContent as HbarAppUiDashboardScorecardContent, LumenDashboardService as HbarAppUiDashboardService, LumenDashboardServiceDetail as HbarAppUiDashboardServiceDetail, LumenDashboardServiceDetailContent as HbarAppUiDashboardServiceDetailContent, LumenDashboardTeam as HbarAppUiDashboardTeam, LumenDashboardThroughputContent as HbarAppUiDashboardThroughputContent, LumenDashboardUsageContent as HbarAppUiDashboardUsageContent, LumenDashboardWidget as HbarAppUiDashboardWidget, LumenDashboardWidgetsContent as HbarAppUiDashboardWidgetsContent, LumenDashboardWorklogContent as HbarAppUiDashboardWorklogContent, LumenDashboardWorklogPerson as HbarAppUiDashboardWorklogPerson } from '@lumen/app-ui/catalog'

export function Dashboard({ spec, onAction, dashboardContent, className }: HbarAppUiDashboardProps) {
  return (
    <LumenDashboard
      variant={spec.variant}
      variantId={spec.id}
      content={dashboardContent}
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
