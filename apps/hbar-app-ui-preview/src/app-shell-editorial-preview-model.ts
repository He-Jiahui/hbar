import { createStore } from 'zustand/vanilla'
import type { LumenAppShellEditorialContent, LumenEditorialDay } from '@lumen/app-ui'
import type { EditorialPreviewFixture } from '../../../tests/fixtures/hbar-app-ui-app-shell-editorial-fixtures'

function utcDate(id: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(id)) return null
  const date = new Date(`${id}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === id ? date : null
}
function isValidId(id: string): boolean {
  return id.trim().length > 0
}
function stableValidItems<T extends { readonly id: string }>(items: readonly T[]): T[] {
  return [...new Map(items.filter((item) => isValidId(item.id)).map((item) => [item.id, item])).values()]
}
export function createAppShellEditorialPreviewStore() {
  return createStore<{
    readonly filterId: string
    readonly selectedDate: string
    readonly monthId: string
    readonly setFilter: (id: string) => void
    readonly setDate: (id: string) => void
    readonly setMonth: (id: string) => void
  }>((set) => ({
    filterId: 'all',
    selectedDate: '2026-08-12',
    monthId: '2026-08-01',
    setFilter: (filterId) => {
      if (isValidId(filterId)) set({ filterId })
    },
    setDate: (selectedDate) => {
      if (isValidId(selectedDate)) set({ selectedDate })
    },
    setMonth: (monthId) => {
      if (isValidId(monthId)) set({ monthId })
    },
  }))
}
export function projectAppShellEditorialPreview(
  state: ReturnType<ReturnType<typeof createAppShellEditorialPreviewStore>['getState']>,
  content: EditorialPreviewFixture,
): LumenAppShellEditorialContent {
  const inventory = stableValidItems(content.inventory)
  const agenda = stableValidItems(content.agenda)
  const filters = stableValidItems(content.filters)
  const sections = stableValidItems(content.sections).map((section) => ({
    ...section,
    links: stableValidItems(section.links),
  }))
  const navigationIds = new Set(sections.flatMap((section) => section.links.map((link) => link.id)))
  const selected = utcDate(state.selectedDate),
    monthDate = utcDate(state.monthId)
  const validFilter = filters.some((filter) => filter.id === state.filterId)
  const dateFormatter = new Intl.DateTimeFormat(content.locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
  const month = monthDate ? content.formatMonth(monthDate) : ''
  const eventDates = new Set(agenda.map((event) => event.date))
  const days: LumenEditorialDay[] = monthDate
    ? Array.from({ length: 42 }, (_, index) => {
        const date = new Date(
            Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth(), 1 - monthDate.getUTCDay() + index),
          ),
          id = date.toISOString().slice(0, 10)
        return {
          id,
          label: dateFormatter.format(date),
          day: String(date.getUTCDate()),
          inMonth: date.getUTCMonth() === monthDate.getUTCMonth(),
          isToday: id === content.todayId,
          hasEvents: eventDates.has(id),
        }
      })
    : []
  const weekdays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 7, 2 + index))
    return {
      id: String(index),
      short: new Intl.DateTimeFormat(content.locale, { weekday: 'narrow', timeZone: 'UTC' }).format(date),
      label: new Intl.DateTimeFormat(content.locale, { weekday: 'long', timeZone: 'UTC' }).format(date),
    }
  })
  return {
    ...content,
    sections,
    filters,
    filterId: validFilter ? state.filterId : null,
    stories: validFilter
      ? inventory.filter((story) => state.filterId === 'all' || story.category === state.filterId)
      : [],
    month,
    calendarCaption: content.formatCalendarCaption(month),
    weekdays,
    weeks: Array.from({ length: days.length / 7 }, (_, index) => days.slice(index * 7, index * 7 + 7)),
    selectedDate: selected ? state.selectedDate : null,
    events: selected ? agenda.filter((event) => event.date >= state.selectedDate) : [],
    labels: {
      ...content.labels,
      emptyScheduleDetail: selected ? content.formatEmptySchedule(selected) : content.labels.emptyScheduleDetail,
    },
    onFilter: (id) => {
      if (isValidId(id) && filters.some((filter) => filter.id === id)) {
        state.setFilter(id)
        content.onFilter(id)
      }
    },
    onNavigate: (id) => {
      if (isValidId(id) && navigationIds.has(id)) content.onNavigate(id)
    },
    onDate: (id) => {
      if (days.some((day) => day.id === id)) {
        state.setDate(id)
        content.onDate(id)
      }
    },
    onMonth: (direction) => {
      if (monthDate) {
        const next = new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + direction, 1))
        if (next.getUTCFullYear() >= 1000 && next.getUTCFullYear() <= 9999) {
          state.setMonth(next.toISOString().slice(0, 10))
          content.onMonth(direction)
        }
      }
    },
    onToday: () => {
      if (utcDate(content.todayId)) {
        state.setDate(content.todayId)
        content.onToday()
      }
    },
    onEvent: (id) => {
      if (isValidId(id) && agenda.some((event) => event.id === id)) content.onEvent(id)
    },
  }
}
