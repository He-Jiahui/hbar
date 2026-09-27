import {createStore} from 'zustand/vanilla'
import type {HbarAppUiSchedulingTimelineReferenceContent, HbarAppUiSchedulingTimelineReferenceEvent} from 'hbar-app-ui/catalog'

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
  if (!Number.isFinite(date.getTime())) return id
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function createSchedulingTimelinePreviewStore(content: HbarAppUiSchedulingTimelineReferenceContent | undefined) {
  let seed = content
  return createStore<TimelinePreviewState>((set, get) => ({
    activeDayId: content?.activeDayId ?? '', view: content?.view ?? 'week', selectedEventId: content?.selectedEventId ?? '', events: content?.events ?? [], nextId: 0,
    navigate: (direction) => set((state) => ({activeDayId: offsetTimelineDate(state.activeDayId, direction * (state.view === 'week' ? 7 : 1)), selectedEventId: ''})),
    today: () => set({activeDayId: seed?.activeDayId ?? '', selectedEventId: ''}),
    setView: (view) => set({view}), setDay: (id) => set({activeDayId: id, view: 'day'}),
    select: (id) => set({selectedEventId: id}),
    edit: (event) => set((state) => ({events: state.events.map((item) => item.id === event.id ? event : item)})),
    create: (dayId, startMinutes, durationMinutes) => {
      if (!seed || !dayId) return
      const id = `new-${get().nextId}`
      set((state) => ({events: [...state.events, {id, dayId, startMinutes, durationMinutes, title: seed?.labels.newTitle ?? ''}], selectedEventId: id, nextId: state.nextId + 1}))
    },
    remove: (id) => set((state) => ({events: state.events.filter((item) => item.id !== id), selectedEventId: ''})), close: () => set({selectedEventId: ''}),
    reset: (next) => {seed = next;set({activeDayId: next?.activeDayId ?? '', view: next?.view ?? 'week', selectedEventId: next?.selectedEventId ?? '', events: next?.events ?? [], nextId: 0})},
  }))
}

export function timelinePreviewProjection(content: HbarAppUiSchedulingTimelineReferenceContent, state: TimelinePreviewState): HbarAppUiSchedulingTimelineReferenceContent {
  const date = new Date(`${state.activeDayId}T00:00:00Z`)
  const monday = offsetTimelineDate(state.activeDayId, -(date.getUTCDay() + 6) % 7)
  const initialMonday = content.days[0]?.id ?? content.activeDayId
  const offset = Math.round((new Date(monday).getTime() - new Date(initialMonday).getTime()) / 86400000)
  const days = content.days.map((day) => {const id = offsetTimelineDate(day.id, offset);return {...day, id, date: String(new Date(id).getUTCDate()), isToday: id === content.activeDayId}})
  const active = days.find((day) => day.id === state.activeDayId) ?? {...content.days[0], id: state.activeDayId, label: new Intl.DateTimeFormat('en-US', {weekday: 'short', timeZone: 'UTC'}).format(date), date: String(date.getUTCDate())}
  return {...content, days: state.view === 'day' ? [active] : days, events: state.events, view: state.view, activeDayId: state.activeDayId, selectedEventId: state.selectedEventId,
    heading: state.view === 'day' ? content.labels.dayHeading(active) : content.labels.weekHeading(days),
    labels: {...content.labels, previous: content.labels.navigation(state.view, -1), next: content.labels.navigation(state.view, 1)},
    onNavigate: state.navigate, onToday: state.today, onViewChange: state.setView, onDayChange: state.setDay,
    onEventSelect: state.select, onEventChange: state.edit, onEventCreate: state.create, onEventDelete: state.remove, onEditorClose: state.close,
  }
}
