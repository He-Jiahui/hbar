import {createStore} from 'zustand/vanilla'
import type {HbarAppUiSchedulingBookingReferenceContent} from 'hbar-app-ui/catalog'

export function createSchedulingBookingPreviewStore(content: HbarAppUiSchedulingBookingReferenceContent | undefined) {
  return createStore<{
    readonly dayId: string
    readonly timeId: string
    readonly setDay: (id: string) => void
    readonly setTime: (id: string) => void
    readonly reset: (content: HbarAppUiSchedulingBookingReferenceContent | undefined) => void
  }>((set) => ({
    dayId: content?.dayId ?? '', timeId: content?.timeId ?? '',
    setDay: (dayId) => set({dayId}), setTime: (timeId) => set({timeId}),
    reset: (next) => set({dayId: next?.dayId ?? '', timeId: next?.timeId ?? ''}),
  }))
}
