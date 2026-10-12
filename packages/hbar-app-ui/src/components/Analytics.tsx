import { LumenAnalytics, LumenAnalyticsProvider as HbarAppUiAnalyticsProvider, type LumenAnalyticsContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiAnalyticsProps = HbarAppUiVariantProps & {
  readonly analyticsContent?: LumenAnalyticsContent | undefined
}
export { HbarAppUiAnalyticsProvider }
export { selectLumenAnalyticsItem as selectHbarAppUiAnalyticsItem, uniqueLumenAnalyticsItems as uniqueHbarAppUiAnalyticsItems, useLumenAnalyticsContent as useHbarAppUiAnalyticsContent } from '@lumen/app-ui/catalog'
export type { LumenAnalyticsAction as HbarAppUiAnalyticsAction, LumenAnalyticsAreaContent as HbarAppUiAnalyticsAreaContent, LumenAnalyticsBulletContent as HbarAppUiAnalyticsBulletContent, LumenAnalyticsBulletItem as HbarAppUiAnalyticsBulletItem, LumenAnalyticsCandle as HbarAppUiAnalyticsCandle, LumenAnalyticsCandlesContent as HbarAppUiAnalyticsCandlesContent, LumenAnalyticsCardsContent as HbarAppUiAnalyticsCardsContent, LumenAnalyticsChoice as HbarAppUiAnalyticsChoice, LumenAnalyticsCohort as HbarAppUiAnalyticsCohort, LumenAnalyticsCohortContent as HbarAppUiAnalyticsCohortContent, LumenAnalyticsComboContent as HbarAppUiAnalyticsComboContent, LumenAnalyticsContent as HbarAppUiAnalyticsContent, LumenAnalyticsDonutContent as HbarAppUiAnalyticsDonutContent, LumenAnalyticsDonutItem as HbarAppUiAnalyticsDonutItem, LumenAnalyticsFunnelContent as HbarAppUiAnalyticsFunnelContent, LumenAnalyticsFunnelStage as HbarAppUiAnalyticsFunnelStage, LumenAnalyticsGoal as HbarAppUiAnalyticsGoal, LumenAnalyticsGoalsContent as HbarAppUiAnalyticsGoalsContent, LumenAnalyticsGroupedContent as HbarAppUiAnalyticsGroupedContent, LumenAnalyticsHeatCell as HbarAppUiAnalyticsHeatCell, LumenAnalyticsHeatmapContent as HbarAppUiAnalyticsHeatmapContent, LumenAnalyticsListStrategy as HbarAppUiAnalyticsListStrategy, LumenAnalyticsMetric as HbarAppUiAnalyticsMetric, LumenAnalyticsPoint as HbarAppUiAnalyticsPoint, LumenAnalyticsProviderProps as HbarAppUiAnalyticsProviderProps, LumenAnalyticsRangeContent as HbarAppUiAnalyticsRangeContent, LumenAnalyticsRankedContent as HbarAppUiAnalyticsRankedContent, LumenAnalyticsRankedItem as HbarAppUiAnalyticsRankedItem, LumenAnalyticsRankingContent as HbarAppUiAnalyticsRankingContent, LumenAnalyticsRankingItem as HbarAppUiAnalyticsRankingItem, LumenAnalyticsScatterContent as HbarAppUiAnalyticsScatterContent, LumenAnalyticsScatterPoint as HbarAppUiAnalyticsScatterPoint, LumenAnalyticsSeries as HbarAppUiAnalyticsSeries, LumenAnalyticsStackedContent as HbarAppUiAnalyticsStackedContent } from '@lumen/app-ui/catalog'

export function Analytics({ spec, onAction, analyticsContent, className }: HbarAppUiAnalyticsProps) {
  return (
    <LumenAnalytics
      variant={spec.variant}
      variantId={spec.id}
      content={analyticsContent}
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
