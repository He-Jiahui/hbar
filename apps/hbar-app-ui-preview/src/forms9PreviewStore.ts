import { createStore } from 'zustand/vanilla'

export const FORMS9_DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

export type Forms9DayId = (typeof FORMS9_DAY_ORDER)[number]
export type Forms9IntervalEdge = 'startMinute' | 'endMinute'

export interface Forms9TimeInterval {
  readonly id: string
  readonly startMinute: number
  readonly endMinute: number
}

export interface Forms9Day {
  readonly id: Forms9DayId
  readonly isOpen: boolean
  readonly intervals: readonly Forms9TimeInterval[]
}

export interface Forms9PreviewDraft {
  readonly timeZoneId: string
  readonly days: readonly Forms9Day[]
  readonly acceptBookingsOnPublicHolidays: boolean
}

export interface Forms9PreviewStoreSeed extends Forms9PreviewDraft {}

export type Forms9HostRequest =
  | { readonly kind: 'add-time-range'; readonly dayId: Forms9DayId }
  | { readonly kind: 'remove-time-range'; readonly dayId: Forms9DayId; readonly intervalId: string }
  | { readonly kind: 'save-hours'; readonly draft: Forms9PreviewDraft }

export interface Forms9Overlap {
  readonly dayId: Forms9DayId
  readonly firstIntervalId: string
  readonly secondIntervalId: string
}

export interface Forms9PreviewStoreState {
  readonly baseline: Forms9PreviewDraft
  readonly draft: Forms9PreviewDraft
  readonly setTimeZoneId: (timeZoneId: string) => boolean
  readonly setDayOpen: (dayId: Forms9DayId, isOpen: boolean) => boolean
  readonly setIntervalMinute: (
    dayId: Forms9DayId,
    intervalId: string,
    edge: Forms9IntervalEdge,
    minuteOfDay: number,
  ) => boolean
  readonly copyMondayToWeekdays: () => boolean
  readonly setAcceptBookingsOnPublicHolidays: (accept: boolean) => boolean
  /** Locally restore the preview's initial draft; source Reset outcome was not observed. */
  readonly resetDraftLocally: () => boolean
  readonly requestAddTimeRange: (dayId: Forms9DayId) => Forms9HostRequest | null
  readonly requestRemoveTimeRange: (dayId: Forms9DayId, intervalId: string) => Forms9HostRequest | null
  readonly requestSaveHours: () => Forms9HostRequest | null
}

const WEEKDAY_IDS: readonly Forms9DayId[] = ['tuesday', 'wednesday', 'thursday', 'friday']

function assertUniqueIds(items: readonly { readonly id: string }[], label: string): void {
  const ids = items.map((item) => item.id)
  if (ids.some((id) => !id.trim())) throw new RangeError(label + ' IDs must not be empty.')
  if (new Set(ids).size !== ids.length) throw new RangeError(label + ' IDs must be unique.')
}

function isMinuteOfDay(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value < 24 * 60
}

function assertSeed(seed: Forms9PreviewStoreSeed): void {
  if (!seed.timeZoneId.trim()) throw new RangeError('A time-zone ID is required.')
  if (seed.days.length !== FORMS9_DAY_ORDER.length) {
    throw new RangeError('The weekly schedule must contain exactly seven days.')
  }

  const intervalIds: { readonly id: string }[] = []
  seed.days.forEach((day, index) => {
    if (day.id !== FORMS9_DAY_ORDER[index]) {
      throw new RangeError('Weekly schedule days must use the stable Monday-to-Sunday order.')
    }
    if (typeof day.isOpen !== 'boolean') throw new RangeError('Each day must declare its open state.')
    assertUniqueIds(day.intervals, 'Time interval for ' + day.id)
    for (const interval of day.intervals) {
      if (!isMinuteOfDay(interval.startMinute) || !isMinuteOfDay(interval.endMinute)) {
        throw new RangeError('Time interval minutes must be between 00:00 and 23:59.')
      }
      intervalIds.push(interval)
    }
  })
  assertUniqueIds(intervalIds, 'Time interval')
}

function cloneDay(day: Forms9Day): Forms9Day {
  return { ...day, intervals: day.intervals.map((interval) => ({ ...interval })) }
}

function cloneDraft(draft: Forms9PreviewDraft): Forms9PreviewDraft {
  return {
    timeZoneId: draft.timeZoneId,
    days: draft.days.map(cloneDay),
    acceptBookingsOnPublicHolidays: draft.acceptBookingsOnPublicHolidays,
  }
}

function draftsEqual(left: Forms9PreviewDraft, right: Forms9PreviewDraft): boolean {
  return (
    left.timeZoneId === right.timeZoneId &&
    left.acceptBookingsOnPublicHolidays === right.acceptBookingsOnPublicHolidays &&
    left.days.length === right.days.length &&
    left.days.every((day, index) => {
      const otherDay = right.days[index]
      return (
        otherDay !== undefined &&
        day.id === otherDay.id &&
        day.isOpen === otherDay.isOpen &&
        day.intervals.length === otherDay.intervals.length &&
        day.intervals.every((interval, intervalIndex) => {
          const otherInterval = otherDay.intervals[intervalIndex]
          return (
            otherInterval !== undefined &&
            interval.id === otherInterval.id &&
            interval.startMinute === otherInterval.startMinute &&
            interval.endMinute === otherInterval.endMinute
          )
        })
      )
    })
  )
}

function intervalDurationMinutes(interval: Forms9TimeInterval): number {
  return interval.endMinute > interval.startMinute ? interval.endMinute - interval.startMinute : 0
}

export function forms9DayMinutes(day: Forms9Day): number {
  return day.isOpen ? day.intervals.reduce((total, interval) => total + intervalDurationMinutes(interval), 0) : 0
}

export function forms9WeeklyMinutes(draft: Forms9PreviewDraft): number {
  return draft.days.reduce((total, day) => total + forms9DayMinutes(day), 0)
}

export function isForms9DraftDirty(state: Pick<Forms9PreviewStoreState, 'baseline' | 'draft'>): boolean {
  return !draftsEqual(state.baseline, state.draft)
}

export function canRequestForms9IntervalRemoval(day: Forms9Day, intervalId: string): boolean {
  return day.intervals.length > 1 && day.intervals.some((interval) => interval.id === intervalId)
}

/**
 * Detects same-day overlaps, matching the source documentation's stated rule.
 * No source error copy, save gating, or recovery behavior is inferred here.
 */
export function findForms9Overlaps(days: readonly Forms9Day[]): readonly Forms9Overlap[] {
  const overlaps: Forms9Overlap[] = []
  for (const day of days) {
    if (!day.isOpen) continue
    for (let firstIndex = 0; firstIndex < day.intervals.length; firstIndex += 1) {
      const first = day.intervals[firstIndex]
      if (!first || first.endMinute <= first.startMinute) continue
      for (let secondIndex = firstIndex + 1; secondIndex < day.intervals.length; secondIndex += 1) {
        const second = day.intervals[secondIndex]
        if (!second || second.endMinute <= second.startMinute) continue
        if (first.startMinute < second.endMinute && second.startMinute < first.endMinute) {
          overlaps.push({
            dayId: day.id,
            firstIntervalId: first.id,
            secondIntervalId: second.id,
          })
        }
      }
    }
  }
  return overlaps
}

function dayById(days: readonly Forms9Day[], dayId: Forms9DayId): Forms9Day | undefined {
  return days.find((day) => day.id === dayId)
}

export function createForms9PreviewStore(seed: Forms9PreviewStoreSeed) {
  assertSeed(seed)
  const baseline = cloneDraft(seed)

  return createStore<Forms9PreviewStoreState>((set, get) => ({
    baseline,
    draft: cloneDraft(baseline),
    setTimeZoneId: (timeZoneId) => {
      if (!timeZoneId.trim()) return false
      const state = get()
      if (state.draft.timeZoneId === timeZoneId) return false
      set({ draft: { ...state.draft, timeZoneId } })
      return true
    },
    setDayOpen: (dayId, isOpen) => {
      const state = get()
      const day = dayById(state.draft.days, dayId)
      if (!day || day.isOpen === isOpen) return false
      set({
        draft: {
          ...state.draft,
          days: state.draft.days.map((item) => (item.id === dayId ? { ...item, isOpen } : item)),
        },
      })
      return true
    },
    setIntervalMinute: (dayId, intervalId, edge, minuteOfDay) => {
      if (!isMinuteOfDay(minuteOfDay)) return false
      const state = get()
      const day = dayById(state.draft.days, dayId)
      const interval = day?.intervals.find((item) => item.id === intervalId)
      if (!day || !interval || interval[edge] === minuteOfDay) return false
      set({
        draft: {
          ...state.draft,
          days: state.draft.days.map((item) =>
            item.id === dayId
              ? {
                  ...item,
                  intervals: item.intervals.map((current) =>
                    current.id === intervalId ? { ...current, [edge]: minuteOfDay } : current,
                  ),
                }
              : item,
          ),
        },
      })
      return true
    },
    copyMondayToWeekdays: () => {
      const state = get()
      const monday = dayById(state.draft.days, 'monday')
      if (!monday?.isOpen) return false
      if (
        WEEKDAY_IDS.some((dayId) => {
          const targetDay = dayById(state.draft.days, dayId)
          return !targetDay || targetDay.intervals.length !== monday.intervals.length
        })
      ) {
        return false
      }
      const weekdays = new Set<Forms9DayId>(WEEKDAY_IDS)
      const days = state.draft.days.map((day) => {
        if (!weekdays.has(day.id)) return day
        const intervals = day.intervals.map((targetInterval, index) => {
          const sourceInterval = monday.intervals[index]
          return sourceInterval
            ? {
                ...targetInterval,
                startMinute: sourceInterval.startMinute,
                endMinute: sourceInterval.endMinute,
              }
            : targetInterval
        })
        return { ...day, intervals }
      })
      const draft = { ...state.draft, days }
      if (draftsEqual(state.draft, draft)) return false
      set({ draft })
      return true
    },
    setAcceptBookingsOnPublicHolidays: (accept) => {
      const state = get()
      if (state.draft.acceptBookingsOnPublicHolidays === accept) return false
      set({
        draft: { ...state.draft, acceptBookingsOnPublicHolidays: accept },
      })
      return true
    },
    resetDraftLocally: () => {
      const state = get()
      if (!isForms9DraftDirty(state)) return false
      set({ draft: cloneDraft(state.baseline) })
      return true
    },
    requestAddTimeRange: (dayId) => {
      if (!dayById(get().draft.days, dayId)) return null
      return { kind: 'add-time-range', dayId }
    },
    requestRemoveTimeRange: (dayId, intervalId) => {
      const day = dayById(get().draft.days, dayId)
      if (!day || !canRequestForms9IntervalRemoval(day, intervalId)) return null
      return { kind: 'remove-time-range', dayId, intervalId }
    },
    requestSaveHours: () => {
      const state = get()
      if (!isForms9DraftDirty(state)) return null
      return { kind: 'save-hours', draft: cloneDraft(state.draft) }
    },
  }))
}
