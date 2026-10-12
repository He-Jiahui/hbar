import { useMemo, useRef, type ReactNode } from 'react'
import { useStore } from 'zustand'
import { LumenFormsProvider, useLumenFormsContent, type LumenForms9ViewModel, type LumenFormsContent } from '@lumen/app-ui/catalog'
import type { HbarAppUiVariantProps } from 'hbar-app-ui/catalog'
import type { Forms9PreviewFixture } from './forms9PreviewFixtures'
import { FORMS9_DAY_ORDER, createForms9PreviewStore, type Forms9DayId } from './forms9PreviewStore'

function findDayId(value: string): Forms9DayId | undefined {
  return FORMS9_DAY_ORDER.find((dayId) => dayId === value)
}

type FormsForm9PreviewHostProps = HbarAppUiVariantProps & {
  readonly content: LumenFormsContent
  readonly referenceFixture: Forms9PreviewFixture
  readonly children: ReactNode
}

export function FormsForm9PreviewHost(props: FormsForm9PreviewHostProps) {
  if (props.spec.category !== 'forms' || props.spec.variant !== 9) return props.children
  return <FormsForm9PreviewHostOwner key={props.spec.id} {...props} />
}

function FormsForm9PreviewHostOwner({
  content,
  spec,
  onAction,
  referenceFixture,
  children,
}: FormsForm9PreviewHostProps) {
  const parentContent = useLumenFormsContent()
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction
  const store = useMemo(() => createForms9PreviewStore(referenceFixture.storeSeed), [referenceFixture])
  const state = useStore(store)

  const preview = referenceFixture.contentFor(state)
  const notify = (actionId: string, value?: string) => {
    const handler = onActionRef.current
    if (!handler) return
    handler(value === undefined ? { variantId: spec.id, actionId } : { variantId: spec.id, actionId, value })
  }
  const notifyIfChanged = (actionId: string, changed: boolean, value?: string) => {
    if (changed) notify(actionId, value)
  }

  const weeklyOpeningHoursReference: LumenForms9ViewModel = {
    content: preview,
    onTimeZoneChange(timeZoneId) {
      notifyIfChanged('select-opening-hours-time-zone', store.getState().setTimeZoneId(timeZoneId), timeZoneId)
    },
    onDayOpenChange(dayId, isOpen) {
      const typedDayId = findDayId(dayId)
      if (!typedDayId) return
      notifyIfChanged(
        'toggle-opening-hours-day',
        store.getState().setDayOpen(typedDayId, isOpen),
        dayId + ':' + (isOpen ? 'open' : 'closed'),
      )
    },
    onIntervalMinuteChange(dayId, intervalId, edge, minuteOfDay) {
      const typedDayId = findDayId(dayId)
      if (!typedDayId) return
      notifyIfChanged(
        'edit-opening-hours-time-range',
        store.getState().setIntervalMinute(typedDayId, intervalId, edge, minuteOfDay),
        dayId + ':' + intervalId + ':' + edge + ':' + minuteOfDay,
      )
    },
    onCopyMondayToWeekdays() {
      notifyIfChanged('copy-opening-hours-monday-to-weekdays', store.getState().copyMondayToWeekdays())
    },
    onPublicHolidaysChange(accept) {
      notifyIfChanged(
        'toggle-public-holiday-bookings',
        store.getState().setAcceptBookingsOnPublicHolidays(accept),
        accept ? 'enabled' : 'disabled',
      )
    },
    onAddTimeRangeRequest(dayId) {
      const typedDayId = findDayId(dayId)
      if (!typedDayId) return
      const request = store.getState().requestAddTimeRange(typedDayId)
      if (request) notify('request-add-opening-hours-time-range', dayId)
    },
    onRemoveTimeRangeRequest(dayId, intervalId) {
      const typedDayId = findDayId(dayId)
      if (!typedDayId) return
      const request = store.getState().requestRemoveTimeRange(typedDayId, intervalId)
      if (request) notify('request-remove-opening-hours-time-range', dayId + ':' + intervalId)
    },
    onResetDraft() {
      notifyIfChanged('reset-opening-hours-draft-locally', store.getState().resetDraftLocally())
    },
    onSaveHoursRequest(_draft) {
      const request = store.getState().requestSaveHours()
      if (request?.kind === 'save-hours') notify('request-save-opening-hours')
    },
  }

  return (
    <LumenFormsProvider content={{ ...(parentContent ?? content), weeklyOpeningHoursReference }}>
      {children}
    </LumenFormsProvider>
  )
}
