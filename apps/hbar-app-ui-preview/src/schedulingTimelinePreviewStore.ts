import { createStore } from 'zustand/vanilla'
import type {
  HbarAppUiSchedulingTimelineReferenceContent,
  HbarAppUiSchedulingTimelineReferenceEvent,
} from 'hbar-app-ui/catalog'
import { uniqueSchedulingPreviewItems } from './schedulingPreviewModel'

interface TimelinePreviewState {
  readonly activeDayId: string
  readonly view: 'day' | 'week'
  readonly selectedEventId: string
  readonly events: readonly HbarAppUiSchedulingTimelineReferenceEvent[]
  readonly nextId: number
  readonly navigate: (direction: -1 | 1) => void
  readonly today: () => void
  readonly setView: (view: 'day' | 'week') => void
  readonly setDay: (id: string) => void
  readonly select: (id: string) => void
  readonly edit: (event: HbarAppUiSchedulingTimelineReferenceEvent) => void
  readonly create: (dayId: string, startMinutes: number, durationMinutes: number) => void
  readonly remove: (id: string) => void
  readonly close: () => void
  readonly reset: (content: HbarAppUiSchedulingTimelineReferenceContent | undefined) => void
}

export function offsetTimelineDate(id: string, days: number): string {
  const date = new Date(`${id}T00:00:00Z`)
  if (!validTimelineDate(id) || !Number.isFinite(days)) return id
  date.setUTCDate(date.getUTCDate() + days)
  if (!Number.isFinite(date.getTime())) return id
  return date.toISOString().slice(0, 10)
}

function validTimelineDate(id: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(id)) return false
  const date = new Date(`${id}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === id
}
function mondayOf(id: string): string {
  return offsetTimelineDate(id, -((new Date(`${id}T00:00:00Z`).getUTCDay() + 6) % 7))
}
function projectedDays(content: HbarAppUiSchedulingTimelineReferenceContent | undefined, activeDayId: string) {
  if (!content || !validTimelineDate(activeDayId)) return []
  const initialDay = validTimelineDate(content.activeDayId)
    ? content.activeDayId
    : content.days.find((day) => validTimelineDate(day.id))?.id
  if (!initialDay) return []
  const offset = Math.round(
    (new Date(mondayOf(activeDayId)).getTime() - new Date(mondayOf(initialDay)).getTime()) / 86400000,
  )
  return uniqueSchedulingPreviewItems(content.days)
    .filter((day) => validTimelineDate(day.id))
    .map((day) => {
      const id = offsetTimelineDate(day.id, offset)
      return { ...day, id, date: String(new Date(id).getUTCDate()), isToday: id === content.activeDayId }
    })
}
function validEvent(
  content: HbarAppUiSchedulingTimelineReferenceContent | undefined,
  event: HbarAppUiSchedulingTimelineReferenceEvent,
): boolean {
  return (
    !!content &&
    !!event.id.trim() &&
    validTimelineDate(event.dayId) &&
    Number.isFinite(event.startMinutes) &&
    Number.isFinite(event.durationMinutes) &&
    event.durationMinutes > 0 &&
    event.startMinutes >= content.startMinutes &&
    event.startMinutes + event.durationMinutes <= content.endMinutes
  )
}
function initialTimeline(content: HbarAppUiSchedulingTimelineReferenceContent | undefined) {
  const events = uniqueSchedulingPreviewItems(content?.events ?? []).filter((event) => validEvent(content, event))
  const activeDayId = validTimelineDate(content?.activeDayId ?? '')
    ? content!.activeDayId
    : (content?.days.find((day) => validTimelineDate(day.id))?.id ?? '')
  return {
    activeDayId,
    view: content?.view ?? 'week',
    selectedEventId: events.some((event) => event.id === content?.selectedEventId) ? content!.selectedEventId : '',
    events,
    nextId: 0,
  }
}

export function createSchedulingTimelinePreviewStore(content: HbarAppUiSchedulingTimelineReferenceContent | undefined) {
  let seed = content
  return createStore<TimelinePreviewState>((set, get) => ({
    ...initialTimeline(content),
    navigate: (direction) => {
      if (direction === -1 || direction === 1)
        set((state) => ({
          activeDayId: offsetTimelineDate(state.activeDayId, direction * (state.view === 'week' ? 7 : 1)),
          selectedEventId: '',
        }))
    },
    today: () => set({ activeDayId: initialTimeline(seed).activeDayId, selectedEventId: '' }),
    setView: (view) => {
      if (view === 'day' || view === 'week') set({ view })
    },
    setDay: (id) => {
      if (projectedDays(seed, get().activeDayId).some((day) => day.id === id)) set({ activeDayId: id, view: 'day' })
    },
    select: (id) => {
      if (
        get().events.some(
          (event) =>
            event.id === id &&
            (get().view === 'day'
              ? event.dayId === get().activeDayId
              : projectedDays(seed, get().activeDayId).some((day) => day.id === event.dayId)),
        )
      )
        set({ selectedEventId: id })
    },
    edit: (event) => {
      if (validEvent(seed, event) && get().events.some((item) => item.id === event.id))
        set((state) => ({ events: state.events.map((item) => (item.id === event.id ? { ...event } : item)) }))
    },
    create: (dayId, startMinutes, durationMinutes) => {
      let nextId = get().nextId
      while (get().events.some((event) => event.id === `new-${nextId}`)) nextId++
      const event = { id: `new-${nextId}`, dayId, startMinutes, durationMinutes, title: seed?.labels.newTitle ?? '' }
      if (
        !seed ||
        !(dayId === get().activeDayId || projectedDays(seed, get().activeDayId).some((day) => day.id === dayId)) ||
        !validEvent(seed, event)
      )
        return
      set((state) => ({ events: [...state.events, event], selectedEventId: event.id, nextId: nextId + 1 }))
    },
    remove: (id) => {
      if (get().events.some((event) => event.id === id))
        set((state) => ({
          events: state.events.filter((item) => item.id !== id),
          selectedEventId: state.selectedEventId === id ? '' : state.selectedEventId,
        }))
    },
    close: () => set({ selectedEventId: '' }),
    reset: (next) => {
      seed = next
      set(initialTimeline(next))
    },
  }))
}

export function timelinePreviewProjection(
  content: HbarAppUiSchedulingTimelineReferenceContent,
  state: TimelinePreviewState,
): HbarAppUiSchedulingTimelineReferenceContent {
  const days = projectedDays(content, state.activeDayId)
  const active = days.find((day) => day.id === state.activeDayId)
  const dayLabel =
    content.days.find(
      (day) => validTimelineDate(day.id) && new Date(day.id).getUTCDay() === new Date(state.activeDayId).getUTCDay(),
    )?.label ??
    (validTimelineDate(state.activeDayId)
      ? new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(new Date(state.activeDayId))
      : undefined)
  const activeDay =
    active ??
    (days.length && dayLabel
      ? { id: state.activeDayId, label: dayLabel, date: String(new Date(state.activeDayId).getUTCDate()) }
      : undefined)
  return {
    ...content,
    days: state.view === 'day' ? (activeDay ? [activeDay] : []) : days,
    events: state.events,
    view: state.view,
    activeDayId: state.activeDayId,
    selectedEventId: state.selectedEventId,
    heading:
      state.view === 'day'
        ? activeDay
          ? content.labels.dayHeading(activeDay)
          : content.labels.emptyDays
        : content.labels.weekHeading(days),
    labels: {
      ...content.labels,
      previous: content.labels.navigation(state.view, -1),
      next: content.labels.navigation(state.view, 1),
    },
    onNavigate: state.navigate,
    onToday: state.today,
    onViewChange: state.setView,
    onDayChange: state.setDay,
    onEventSelect: state.select,
    onEventChange: state.edit,
    onEventCreate: state.create,
    onEventDelete: state.remove,
    onEditorClose: state.close,
  }
}
