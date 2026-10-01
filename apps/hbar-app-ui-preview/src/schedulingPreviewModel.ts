import { createStore, type StoreApi } from 'zustand/vanilla'
import type {
  HbarAppUiSchedulingAvailabilityReferenceDay,
  HbarAppUiSchedulingChoice,
  HbarAppUiSchedulingContent,
} from 'hbar-app-ui/catalog'

export type SchedulingPreviewVariant = 1 | 2 | 3 | 4 | 5
export interface SchedulingPreviewScope {
  readonly variant: SchedulingPreviewVariant
  readonly ownerId: string
}
export type SchedulingPreviewFlow =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'month'
      readonly dayId: string
      readonly monthId: string
      readonly yearId: string
      readonly filterId: string
    }
  | { readonly kind: 'range'; readonly startId: string; readonly endId: string; readonly durationId: string }
  | {
      readonly kind: 'form'
      readonly name: string
      readonly attendeeQuery: string
      readonly attendeeIds: readonly string[]
      readonly date: string
      readonly startId: string
      readonly endId: string
      readonly meetingLink: string
      readonly notes: string
    }
  | {
      readonly kind: 'deadline'
      readonly presetId: string
      readonly monthId: string
      readonly dayId: string
      readonly timeId: string
    }
  | {
      readonly kind: 'availability'
      readonly timezoneId: string
      readonly days: readonly HbarAppUiSchedulingAvailabilityReferenceDay[]
      readonly nextId: number
    }
type ChoiceField =
  | 'dayId'
  | 'monthId'
  | 'yearId'
  | 'filterId'
  | 'startId'
  | 'endId'
  | 'durationId'
  | 'presetId'
  | 'timeId'
  | 'timezoneId'
type DraftField = 'name' | 'attendeeQuery' | 'date' | 'meetingLink' | 'notes'
export interface SchedulingPreviewState {
  readonly scope: SchedulingPreviewScope
  readonly flow: SchedulingPreviewFlow
  readonly choose: (scope: SchedulingPreviewScope, field: ChoiceField, id: string) => boolean
  readonly draft: (scope: SchedulingPreviewScope, field: DraftField, value: string) => boolean
  readonly removeAttendee: (scope: SchedulingPreviewScope, id: string) => boolean
  readonly toggleDay: (scope: SchedulingPreviewScope, id: string, enabled: boolean) => boolean
  readonly addInterval: (scope: SchedulingPreviewScope, dayId: string) => boolean
  readonly removeInterval: (scope: SchedulingPreviewScope, dayId: string, intervalId: string) => boolean
  readonly changeInterval: (
    scope: SchedulingPreviewScope,
    dayId: string,
    intervalId: string,
    field: 'startId' | 'endId',
    timeId: string,
  ) => boolean
}
export type SchedulingPreviewStoreApi = StoreApi<SchedulingPreviewState>
export function uniqueSchedulingPreviewItems<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (!item.id.trim() || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}
export function schedulingPreviewChoice(items: readonly HbarAppUiSchedulingChoice[], id: string): string {
  const options = uniqueSchedulingPreviewItems(items).filter((item) => !item.disabled)
  return options.some((item) => item.id === id) ? id : (options[0]?.id ?? '')
}
function choices(
  input: HbarAppUiSchedulingContent,
  kind: SchedulingPreviewFlow['kind'],
  field: ChoiceField,
): readonly HbarAppUiSchedulingChoice[] {
  switch (kind) {
    case 'month': {
      const content = input.referenceMonth
      if (!content) return []
      if (field === 'dayId') return uniqueSchedulingPreviewItems(content.days).filter((day) => day.selectable)
      if (field === 'monthId') return content.months
      if (field === 'yearId') return content.years
      if (field === 'filterId') return content.filters
      return []
    }
    case 'range': {
      const content = input.referenceRange
      if (!content) return []
      if (field === 'startId') return content.starts
      if (field === 'endId') return content.ends
      return field === 'durationId' ? content.durations : []
    }
    case 'form': {
      const content = input.referenceForm
      if (!content) return []
      return field === 'startId' ? content.starts : field === 'endId' ? content.ends : []
    }
    case 'deadline': {
      const content = input.referenceDeadline
      if (!content) return []
      if (field === 'dayId') return uniqueSchedulingPreviewItems(content.days).filter((day) => day.selectable)
      if (field === 'presetId') return content.presets
      if (field === 'monthId') return content.months
      return field === 'timeId' ? content.times : []
    }
    case 'availability':
      return field === 'timezoneId' ? (input.referenceAvailability?.timezones ?? []) : []
    case 'empty':
      return []
  }
}
function initialFlow(input: HbarAppUiSchedulingContent, variant: SchedulingPreviewVariant): SchedulingPreviewFlow {
  const select = (kind: SchedulingPreviewFlow['kind'], field: ChoiceField, id: string) =>
    schedulingPreviewChoice(choices(input, kind, field), id)
  switch (variant) {
    case 1: {
      const content = input.referenceMonth
      return content
        ? {
            kind: 'month',
            dayId: select('month', 'dayId', content.activeDayId),
            monthId: select('month', 'monthId', content.monthId),
            yearId: select('month', 'yearId', content.yearId),
            filterId: select('month', 'filterId', content.filterId),
          }
        : { kind: 'empty' }
    }
    case 2: {
      const content = input.referenceRange
      return content
        ? {
            kind: 'range',
            startId: select('range', 'startId', content.startId),
            endId: select('range', 'endId', content.endId),
            durationId: select('range', 'durationId', content.durationId),
          }
        : { kind: 'empty' }
    }
    case 3: {
      const content = input.referenceForm
      return content
        ? {
            kind: 'form',
            name: content.name,
            attendeeQuery: content.attendeeQuery,
            attendeeIds: uniqueSchedulingPreviewItems(content.attendees).map((item) => item.id),
            date: content.date,
            startId: select('form', 'startId', content.startId),
            endId: select('form', 'endId', content.endId),
            meetingLink: content.meetingLink,
            notes: content.notes,
          }
        : { kind: 'empty' }
    }
    case 4: {
      const content = input.referenceDeadline
      return content
        ? {
            kind: 'deadline',
            presetId: select('deadline', 'presetId', content.presetId),
            monthId: select('deadline', 'monthId', content.monthId),
            dayId: select('deadline', 'dayId', content.dayId),
            timeId: select('deadline', 'timeId', content.timeId),
          }
        : { kind: 'empty' }
    }
    case 5: {
      const content = input.referenceAvailability
      return content
        ? {
            kind: 'availability',
            timezoneId: select('availability', 'timezoneId', content.timezoneId),
            days: uniqueSchedulingPreviewItems(content.days).map((day) => ({
              ...day,
              intervals: uniqueSchedulingPreviewItems(day.intervals).map((interval) => ({
                ...interval,
                startId: schedulingPreviewChoice(content.times, interval.startId),
                endId: schedulingPreviewChoice(content.times, interval.endId),
              })),
            })),
            nextId: 0,
          }
        : { kind: 'empty' }
    }
  }
}
export function createSchedulingPreviewStore(
  input: HbarAppUiSchedulingContent,
  scope: SchedulingPreviewScope,
): SchedulingPreviewStoreApi {
  return createStore<SchedulingPreviewState>((set, get) => {
    const updateAvailability = (
      candidate: SchedulingPreviewScope,
      dayId: string,
      change: (
        day: HbarAppUiSchedulingAvailabilityReferenceDay,
        flow: Extract<SchedulingPreviewFlow, { kind: 'availability' }>,
      ) => HbarAppUiSchedulingAvailabilityReferenceDay | undefined,
      increment = false,
    ): boolean => {
      const flow = get().flow
      if (candidate !== scope || flow.kind !== 'availability') return false
      const day = flow.days.find((item) => item.id === dayId)
      const next = day && change(day, flow)
      if (!next) return false
      set({
        flow: {
          ...flow,
          days: flow.days.map((item) => (item.id === dayId ? next : item)),
          nextId: flow.nextId + Number(increment),
        },
      })
      return true
    }
    const intervalDefaults = (startId: string) => ({
      startId: schedulingPreviewChoice(input.referenceAvailability?.times ?? [], startId),
      endId: schedulingPreviewChoice(input.referenceAvailability?.times ?? [], '17:00'),
    })
    return {
      scope,
      flow: initialFlow(input, scope.variant),
      choose: (candidate, field, id) => {
        const flow = get().flow
        if (
          candidate !== scope ||
          !(field in flow) ||
          !uniqueSchedulingPreviewItems(choices(input, flow.kind, field)).some(
            (item) => item.id === id && !item.disabled,
          )
        )
          return false
        set({ flow: { ...flow, [field]: id } })
        return true
      },
      draft: (candidate, field, value) => {
        const flow = get().flow
        if (candidate !== scope || flow.kind !== 'form') return false
        set({ flow: { ...flow, [field]: value } })
        return true
      },
      removeAttendee: (candidate, id) => {
        const flow = get().flow
        if (candidate !== scope || flow.kind !== 'form' || !flow.attendeeIds.includes(id)) return false
        set({ flow: { ...flow, attendeeIds: flow.attendeeIds.filter((item) => item !== id) } })
        return true
      },
      toggleDay: (candidate, id, enabled) =>
        updateAvailability(
          candidate,
          id,
          (day, flow) => {
            if (day.enabled === enabled) return undefined
            return {
              ...day,
              enabled,
              intervals: enabled ? [{ id: `${id}-enabled-${flow.nextId}`, ...intervalDefaults('09:00') }] : [],
            }
          },
          true,
        ),
      addInterval: (candidate, id) => {
        const flow = get().flow
        if (candidate !== scope || flow.kind !== 'availability') return false
        const day = flow.days.find((item) => item.id === id)
        if (!day?.enabled) return false
        let nextId = flow.nextId
        while (day.intervals.some((interval) => interval.id === `${id}-new-${nextId}`)) nextId++
        const interval = { id: `${id}-new-${nextId}`, ...intervalDefaults('13:00') }
        set({
          flow: {
            ...flow,
            nextId: nextId + 1,
            days: flow.days.map((item) =>
              item.id === id ? { ...item, intervals: [...item.intervals, interval] } : item,
            ),
          },
        })
        return true
      },
      removeInterval: (candidate, id, intervalId) =>
        updateAvailability(candidate, id, (day) => {
          if (
            !day.enabled ||
            day.intervals.length <= 1 ||
            !day.intervals.some((interval) => interval.id === intervalId)
          )
            return undefined
          return { ...day, intervals: day.intervals.filter((interval) => interval.id !== intervalId) }
        }),
      changeInterval: (candidate, id, intervalId, field, timeId) =>
        updateAvailability(candidate, id, (day) => {
          if (
            !day.enabled ||
            !day.intervals.some((interval) => interval.id === intervalId) ||
            !uniqueSchedulingPreviewItems(input.referenceAvailability?.times ?? []).some(
              (time) => time.id === timeId && !time.disabled,
            )
          )
            return undefined
          return {
            ...day,
            intervals: day.intervals.map((interval) =>
              interval.id === intervalId ? { ...interval, [field]: timeId } : interval,
            ),
          }
        }),
    }
  })
}
