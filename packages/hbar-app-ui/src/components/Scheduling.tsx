import {
  LumenScheduling,
  LumenSchedulingProvider as HbarAppUiSchedulingProvider,
  type LumenSchedulingContent,
} from '@lumen/app-ui'
import type { HbarAppUiVariantProps } from '../types'

export type HbarAppUiSchedulingProps = HbarAppUiVariantProps & {
  readonly schedulingContent?: LumenSchedulingContent | undefined
}

export { HbarAppUiSchedulingProvider }
export {
  selectLumenSchedulingItem as selectHbarAppUiSchedulingItem,
  uniqueLumenSchedulingItems as uniqueHbarAppUiSchedulingItems,
  useLumenSchedulingContent as useHbarAppUiSchedulingContent,
} from '@lumen/app-ui'
export type {
  LumenSchedulingAvailabilityReferenceContent as HbarAppUiSchedulingAvailabilityReferenceContent,
  LumenSchedulingAvailabilityReferenceDay as HbarAppUiSchedulingAvailabilityReferenceDay,
  LumenSchedulingAvailabilityReferenceInterval as HbarAppUiSchedulingAvailabilityReferenceInterval,
  LumenSchedulingDeadlineReferenceContent as HbarAppUiSchedulingDeadlineReferenceContent,
  LumenSchedulingDeadlineReferenceDay as HbarAppUiSchedulingDeadlineReferenceDay,
  LumenSchedulingDeadlineReferencePreset as HbarAppUiSchedulingDeadlineReferencePreset,
  LumenSchedulingRangeReferenceContent as HbarAppUiSchedulingRangeReferenceContent,
  LumenSchedulingFormReferenceContent as HbarAppUiSchedulingFormReferenceContent,
  LumenSchedulingMonthReferenceContent as HbarAppUiSchedulingMonthReferenceContent,
  LumenSchedulingMonthReferenceDay as HbarAppUiSchedulingMonthReferenceDay,
  LumenSchedulingMonthReferenceEvent as HbarAppUiSchedulingMonthReferenceEvent,
  LumenSchedulingAction as HbarAppUiSchedulingAction,
  LumenSchedulingAgendaEvent as HbarAppUiSchedulingAgendaEvent,
  LumenSchedulingAttendee as HbarAppUiSchedulingAttendee,
  LumenSchedulingAvailabilityContent as HbarAppUiSchedulingAvailabilityContent,
  LumenSchedulingAvailabilityDay as HbarAppUiSchedulingAvailabilityDay,
  LumenSchedulingBookingContent as HbarAppUiSchedulingBookingContent,
  LumenSchedulingChoice as HbarAppUiSchedulingChoice,
  LumenSchedulingContent as HbarAppUiSchedulingContent,
  LumenSchedulingDeadlineContent as HbarAppUiSchedulingDeadlineContent,
  LumenSchedulingDeadlineDay as HbarAppUiSchedulingDeadlineDay,
  LumenSchedulingFormContent as HbarAppUiSchedulingFormContent,
  LumenSchedulingListStrategy as HbarAppUiSchedulingListStrategy,
  LumenSchedulingMonthContent as HbarAppUiSchedulingMonthContent,
  LumenSchedulingMonthDay as HbarAppUiSchedulingMonthDay,
  LumenSchedulingProviderProps as HbarAppUiSchedulingProviderProps,
  LumenSchedulingTimelineContent as HbarAppUiSchedulingTimelineContent,
  LumenSchedulingTimelineEvent as HbarAppUiSchedulingTimelineEvent,
  LumenSchedulingTimeRangeContent as HbarAppUiSchedulingTimeRangeContent,
} from '@lumen/app-ui'

export function Scheduling({ spec, onAction, schedulingContent, className }: HbarAppUiSchedulingProps) {
  return (
    <LumenScheduling
      variant={spec.variant}
      variantId={spec.id}
      content={schedulingContent}
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
