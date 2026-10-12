import { LumenMonitoring, LumenMonitoringProvider as HbarAppUiMonitoringProvider, type LumenMonitoringContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiMonitoringProps = HbarAppUiVariantProps & {
  readonly monitoringContent?: LumenMonitoringContent | undefined
}
export { HbarAppUiMonitoringProvider }
export { selectLumenMonitoringItem as selectHbarAppUiMonitoringItem, uniqueLumenMonitoringItems as uniqueHbarAppUiMonitoringItems, useLumenMonitoringContent as useHbarAppUiMonitoringContent } from '@lumen/app-ui/catalog'
export type { LumenMonitoringAction as HbarAppUiMonitoringAction, LumenMonitoringAlert as HbarAppUiMonitoringAlert, LumenMonitoringAlertsContent as HbarAppUiMonitoringAlertsContent, LumenMonitoringChoice as HbarAppUiMonitoringChoice, LumenMonitoringContent as HbarAppUiMonitoringContent, LumenMonitoringEndpoint as HbarAppUiMonitoringEndpoint, LumenMonitoringEvent as HbarAppUiMonitoringEvent, LumenMonitoringFleetContent as HbarAppUiMonitoringFleetContent, LumenMonitoringHealthContent as HbarAppUiMonitoringHealthContent, LumenMonitoringIncidentContent as HbarAppUiMonitoringIncidentContent, LumenMonitoringListStrategy as HbarAppUiMonitoringListStrategy, LumenMonitoringLiveContent as HbarAppUiMonitoringLiveContent, LumenMonitoringLogLine as HbarAppUiMonitoringLogLine, LumenMonitoringLogsContent as HbarAppUiMonitoringLogsContent, LumenMonitoringMetric as HbarAppUiMonitoringMetric, LumenMonitoringNode as HbarAppUiMonitoringNode, LumenMonitoringObjective as HbarAppUiMonitoringObjective, LumenMonitoringProviderProps as HbarAppUiMonitoringProviderProps, LumenMonitoringQueueContent as HbarAppUiMonitoringQueueContent, LumenMonitoringResponseContent as HbarAppUiMonitoringResponseContent, LumenMonitoringRun as HbarAppUiMonitoringRun, LumenMonitoringSeriesPoint as HbarAppUiMonitoringSeriesPoint, LumenMonitoringService as HbarAppUiMonitoringService, LumenMonitoringServiceDay as HbarAppUiMonitoringServiceDay, LumenMonitoringSloContent as HbarAppUiMonitoringSloContent, LumenMonitoringTimelineItem as HbarAppUiMonitoringTimelineItem, LumenMonitoringUptimeContent as HbarAppUiMonitoringUptimeContent } from '@lumen/app-ui/catalog'

export function Monitoring({ spec, onAction, monitoringContent, className }: HbarAppUiMonitoringProps) {
  return (
    <LumenMonitoring
      variant={spec.variant}
      variantId={spec.id}
      content={monitoringContent}
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
