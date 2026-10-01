import { createStore } from 'zustand/vanilla'
import type { HbarAppUiSchedulingBookingReferenceContent } from 'hbar-app-ui/catalog'
import { schedulingPreviewChoice, uniqueSchedulingPreviewItems } from './schedulingPreviewModel'

export function createSchedulingBookingPreviewStore(content: HbarAppUiSchedulingBookingReferenceContent | undefined) {
  let seed = content
  const initial = (input: HbarAppUiSchedulingBookingReferenceContent | undefined) => ({
    dayId: schedulingPreviewChoice(input?.days.map((day) => ({ ...day, label: day.date })) ?? [], input?.dayId ?? ''),
    timeId: schedulingPreviewChoice(input?.times ?? [], input?.timeId ?? ''),
  })
  return createStore<{
    readonly dayId: string
    readonly timeId: string
    readonly setDay: (id: string) => void
    readonly setTime: (id: string) => void
    readonly reset: (content: HbarAppUiSchedulingBookingReferenceContent | undefined) => void
  }>((set, get) => ({
    ...initial(content),
    setDay: (dayId) => {
      if (uniqueSchedulingPreviewItems(seed?.days ?? []).some((day) => day.id === dayId && !day.disabled))
        set({ dayId })
    },
    setTime: (timeId) => {
      if (
        get().dayId &&
        uniqueSchedulingPreviewItems(seed?.times ?? []).some((time) => time.id === timeId && !time.disabled)
      )
        set({ timeId })
    },
    reset: (next) => {
      seed = next
      set(initial(next))
    },
  }))
}
