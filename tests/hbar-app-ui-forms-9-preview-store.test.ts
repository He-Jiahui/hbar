import { describe, expect, test } from 'bun:test'
import {
  FORMS9_DAY_ORDER,
  canRequestForms9IntervalRemoval,
  createForms9PreviewStore,
  findForms9Overlaps,
  forms9DayMinutes,
  forms9WeeklyMinutes,
  isForms9DraftDirty,
} from '../apps/hbar-app-ui-preview/src/forms9PreviewStore'
import { createForms9PreviewFixture } from '../apps/hbar-app-ui-preview/src/forms9PreviewFixtures'

function dayAt(days: Parameters<typeof forms9WeeklyMinutes>[0]['days'], dayId: (typeof FORMS9_DAY_ORDER)[number]) {
  const day = days.find((item) => item.id === dayId)
  if (!day) throw new RangeError('Missing Forms9 test day: ' + dayId)
  return day
}

describe('Forms 9 preview store', () => {
  test('projects the source-shaped seven-day schedule, stable IDs, and derived 49-hour total', () => {
    const fixture = createForms9PreviewFixture()
    const store = createForms9PreviewStore(fixture.storeSeed)
    const content = fixture.contentFor(store.getState())

    expect(content.days.map((day) => day.id)).toEqual([...FORMS9_DAY_ORDER])
    expect(content.days.map((day) => day.label)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ])
    expect(content.days.map((day) => day.durationMinutes)).toEqual([540, 540, 540, 600, 480, 240, 0])
    expect(content.days.map((day) => day.durationLabel)).toEqual(['9 h', '9 h', '9 h', '10 h', '8 h', '4 h', '0 h'])
    expect(content.days.map((day) => day.intervals.map((item) => item.id))).toEqual([
      ['monday-morning', 'monday-afternoon'],
      ['tuesday-morning', 'tuesday-afternoon'],
      ['wednesday-morning', 'wednesday-afternoon'],
      ['thursday-morning', 'thursday-afternoon'],
      ['friday-morning', 'friday-afternoon'],
      ['saturday-single'],
      [],
    ])
    expect(content.days[0]?.intervals.map((item) => [item.startLabel, item.endLabel])).toEqual([
      ['8:00 AM', '12:00 PM'],
      ['1:00 PM', '6:00 PM'],
    ])
    expect(content.days[6]?.isOpen).toBe(false)
    expect(content.weeklyTotalMinutes).toBe(49 * 60)
    expect(content.weeklyTotalLabel).toBe('49 h')
    expect(content.timeZoneId).toBe('america-chicago')
    expect(content.timeZoneOptions).toEqual({
      completeness: 'partial',
      items: [{ id: 'america-chicago', label: 'Chicago (GMT-06:00)' }],
    })
    expect(content.timeOptions).toEqual({
      completeness: 'partial',
      items: [
        { minuteOfDay: 480, label: '8:00 AM' },
        { minuteOfDay: 540, label: '9:00 AM' },
        { minuteOfDay: 720, label: '12:00 PM' },
        { minuteOfDay: 780, label: '1:00 PM' },
        { minuteOfDay: 1020, label: '5:00 PM' },
        { minuteOfDay: 1080, label: '6:00 PM' },
        { minuteOfDay: 1140, label: '7:00 PM' },
      ],
    })
    expect(content.dayCollection).toEqual({
      kind: 'pane-scroll',
      dayCount: 7,
      intervalCapacityEvidence: 'not-observed',
    })
    expect(content.overlapEvidence).toBe('source-docs-mention-rule-behavior-unobserved')
    expect(content.isDirty).toBe(false)
    expect(content.canRequestSave).toBe(false)
    expect(content.canResetLocalDraft).toBe(false)
  })

  test('copies Monday interval values to weekdays while retaining target day and interval identities', () => {
    const fixture = createForms9PreviewFixture()
    const store = createForms9PreviewStore(fixture.storeSeed)
    const beforeIds = store
      .getState()
      .draft.days.map((day) => [day.id, day.isOpen, ...day.intervals.map((item) => item.id)])
    const actions = store.getState()

    expect(actions.copyMondayToWeekdays()).toBe(true)
    const after = store.getState()
    expect(
      after.draft.days
        .filter((day) => day.id !== 'monday' && day.id !== 'saturday' && day.id !== 'sunday')
        .map((day) => day.intervals.map((item) => item.endMinute - item.startMinute)),
    ).toEqual([
      [240, 300],
      [240, 300],
      [240, 300],
      [240, 300],
    ])
    expect(after.draft.days.map((day) => [day.id, day.isOpen, ...day.intervals.map((item) => item.id)])).toEqual(
      beforeIds,
    )
    expect(forms9WeeklyMinutes(after.draft)).toBe(49 * 60)
    expect(isForms9DraftDirty(after)).toBe(true)
    expect(fixture.contentFor(after).canRequestSave).toBe(true)
    expect(actions.copyMondayToWeekdays()).toBe(false)
  })

  test('leaves unequal weekday interval collections untouched when copy behavior is not observed', () => {
    const fixture = createForms9PreviewFixture()
    const seed = {
      ...fixture.storeSeed,
      days: fixture.storeSeed.days.map((day) =>
        day.id === 'thursday'
          ? {
              ...day,
              intervals: [...day.intervals, { id: 'thursday-extra', startMinute: 20 * 60, endMinute: 21 * 60 }],
            }
          : day,
      ),
    }
    const store = createForms9PreviewStore(seed)
    const initialDraft = store.getState().draft

    expect(store.getState().copyMondayToWeekdays()).toBe(false)
    expect(store.getState().draft).toEqual(initialDraft)
  })

  test('closing Monday derives 40 hours without deleting its draft intervals', () => {
    const fixture = createForms9PreviewFixture()
    const store = createForms9PreviewStore(fixture.storeSeed)
    const actions = store.getState()
    const mondayBefore = dayAt(store.getState().draft.days, 'monday')

    expect(actions.setDayOpen('monday', false)).toBe(true)
    const mondayAfter = dayAt(store.getState().draft.days, 'monday')
    expect(mondayAfter.isOpen).toBe(false)
    expect(mondayAfter.intervals).toEqual(mondayBefore.intervals)
    expect(forms9WeeklyMinutes(store.getState().draft)).toBe(40 * 60)
    expect(fixture.contentFor(store.getState()).weeklyTotalLabel).toBe('40 h')
    expect(isForms9DraftDirty(store.getState())).toBe(true)
    expect(actions.setDayOpen('monday', false)).toBe(false)
    expect(actions.setDayOpen('unknown-day' as (typeof FORMS9_DAY_ORDER)[number], true)).toBe(false)
  })

  test('tracks holiday booking as a draft toggle without changing the weekly total', () => {
    const fixture = createForms9PreviewFixture()
    const store = createForms9PreviewStore(fixture.storeSeed)
    const actions = store.getState()

    expect(actions.setAcceptBookingsOnPublicHolidays(true)).toBe(true)
    expect(fixture.contentFor(store.getState()).acceptBookingsOnPublicHolidays).toBe(true)
    expect(forms9WeeklyMinutes(store.getState().draft)).toBe(49 * 60)
    expect(isForms9DraftDirty(store.getState())).toBe(true)
    expect(actions.setAcceptBookingsOnPublicHolidays(true)).toBe(false)
  })

  test('restores a locally edited draft to its baseline without asserting a source Reset result', () => {
    const fixture = createForms9PreviewFixture()
    const store = createForms9PreviewStore(fixture.storeSeed)
    const actions = store.getState()

    expect(actions.setDayOpen('monday', false)).toBe(true)
    expect(actions.setAcceptBookingsOnPublicHolidays(true)).toBe(true)
    expect(actions.resetDraftLocally()).toBe(true)
    expect(store.getState().draft).toEqual(store.getState().baseline)
    expect(isForms9DraftDirty(store.getState())).toBe(false)
    expect(forms9WeeklyMinutes(store.getState().draft)).toBe(49 * 60)
    expect(actions.resetDraftLocally()).toBe(false)
  })

  test('returns typed Add/Remove/Save requests without locally applying unobserved host results', () => {
    const fixture = createForms9PreviewFixture()
    const store = createForms9PreviewStore(fixture.storeSeed)
    const actions = store.getState()
    const initialSundayCount = dayAt(store.getState().draft.days, 'sunday').intervals.length
    const addRequest = actions.requestAddTimeRange('sunday')

    expect(addRequest).toEqual({ kind: 'add-time-range', dayId: 'sunday' })
    expect(dayAt(store.getState().draft.days, 'sunday').intervals).toHaveLength(initialSundayCount)
    expect(actions.requestAddTimeRange('unknown-day' as (typeof FORMS9_DAY_ORDER)[number])).toBeNull()
    expect(actions.requestRemoveTimeRange('saturday', 'saturday-single')).toBeNull()
    expect(canRequestForms9IntervalRemoval(dayAt(store.getState().draft.days, 'saturday'), 'saturday-single')).toBe(
      false,
    )

    const removeRequest = actions.requestRemoveTimeRange('monday', 'monday-morning')
    expect(removeRequest).toEqual({
      kind: 'remove-time-range',
      dayId: 'monday',
      intervalId: 'monday-morning',
    })
    expect(actions.requestRemoveTimeRange('monday', 'missing-interval')).toBeNull()
    expect(dayAt(store.getState().draft.days, 'monday').intervals).toHaveLength(2)
    expect(actions.requestSaveHours()).toBeNull()

    actions.setAcceptBookingsOnPublicHolidays(true)
    const saveRequest = actions.requestSaveHours()
    expect(saveRequest).toMatchObject({
      kind: 'save-hours',
      draft: { acceptBookingsOnPublicHolidays: true },
    })
    if (saveRequest?.kind !== 'save-hours') throw new Error('Expected a typed save-hours request.')
    actions.setDayOpen('monday', false)
    expect(saveRequest.draft.days[0]?.isOpen).toBe(true)
    expect(dayAt(store.getState().draft.days, 'monday').isOpen).toBe(false)
  })

  test('accepts only a fixed ordered seven-day seed and rejects duplicate or invalid interval IDs', () => {
    const fixture = createForms9PreviewFixture()
    const seed = fixture.storeSeed
    expect(seed.days).toHaveLength(7)
    expect(seed.days.map((day) => day.id)).toEqual([...FORMS9_DAY_ORDER])

    expect(() => createForms9PreviewStore({ ...seed, days: seed.days.slice(0, 6) })).toThrow(
      'The weekly schedule must contain exactly seven days.',
    )
    expect(() => createForms9PreviewStore({ ...seed, days: [...seed.days, dayAt(seed.days, 'sunday')] })).toThrow(
      'The weekly schedule must contain exactly seven days.',
    )
    expect(() =>
      createForms9PreviewStore({
        ...seed,
        days: seed.days.map((day, index) => (index === 1 ? { ...day, id: 'monday' } : day)),
      }),
    ).toThrow('Weekly schedule days must use the stable Monday-to-Sunday order.')
    expect(() =>
      createForms9PreviewStore({
        ...seed,
        days: seed.days.map((day, index) =>
          index === 1 ? { ...day, intervals: [day.intervals[0]!, day.intervals[0]!] } : day,
        ),
      }),
    ).toThrow('Time interval for tuesday IDs must be unique.')
    expect(() =>
      createForms9PreviewStore({
        ...seed,
        days: seed.days.map((day, index) =>
          index === 0 ? { ...day, intervals: [{ ...day.intervals[0]!, startMinute: 1440 }] } : day,
        ),
      }),
    ).toThrow('Time interval minutes must be between 00:00 and 23:59.')
  })

  test('does not impose an unobserved time-range capacity on a host-provided day', () => {
    const fixture = createForms9PreviewFixture()
    const seed = {
      ...fixture.storeSeed,
      days: fixture.storeSeed.days.map((day) =>
        day.id === 'monday'
          ? {
              ...day,
              intervals: Array.from({ length: 8 }, (_, index) => ({
                id: 'monday-range-' + index,
                startMinute: index * 60,
                endMinute: index * 60 + 30,
              })),
            }
          : day,
      ),
    }
    const content = fixture.contentFor(createForms9PreviewStore(seed).getState())

    expect(content.days[0]?.intervals).toHaveLength(8)
    expect(content.dayCollection.intervalCapacityEvidence).toBe('not-observed')
  })

  test('rejects stale edit targets and invalid time values without changing the draft', () => {
    const fixture = createForms9PreviewFixture()
    const store = createForms9PreviewStore(fixture.storeSeed)
    const actions = store.getState()
    const initialDraft = store.getState().draft

    expect(actions.setIntervalMinute('monday', 'missing-interval', 'startMinute', 9 * 60)).toBe(false)
    expect(actions.setIntervalMinute('monday', 'monday-morning', 'startMinute', 24 * 60)).toBe(false)
    expect(actions.setIntervalMinute('monday', 'monday-morning', 'startMinute', 8 * 60)).toBe(false)
    expect(actions.setTimeZoneId('   ')).toBe(false)
    expect(store.getState().draft).toEqual(initialDraft)
  })

  test('detects same-day overlaps without manufacturing copy or save gating', () => {
    const fixture = createForms9PreviewFixture()
    const seed = {
      ...fixture.storeSeed,
      days: fixture.storeSeed.days.map((day) =>
        day.id === 'monday'
          ? {
              ...day,
              intervals: [
                { id: 'first', startMinute: 8 * 60, endMinute: 12 * 60 },
                { id: 'second', startMinute: 11 * 60, endMinute: 13 * 60 },
              ],
            }
          : day,
      ),
    }
    const store = createForms9PreviewStore(seed)

    expect(findForms9Overlaps(store.getState().draft.days)).toEqual([
      { dayId: 'monday', firstIntervalId: 'first', secondIntervalId: 'second' },
    ])
    expect(store.getState().requestSaveHours()).toBeNull()
    store.getState().setAcceptBookingsOnPublicHolidays(true)
    expect(store.getState().requestSaveHours()?.kind).toBe('save-hours')
  })

  test('supplies localized host copy and supports a deliberately long translation', () => {
    const fixture = createForms9PreviewFixture('de')
    const store = createForms9PreviewStore(fixture.storeSeed)
    const content = fixture.contentFor(store.getState())

    expect(content.copy.pageTitle).toBe('Öffnungszeiten')
    expect(content.copy.pageDescription.length).toBeGreaterThan(100)
    expect(content.copy.dayLabels.monday).toBe('Montag')
    expect(content.copy.openDaySwitchLabel('Montag')).toBe('Montag geöffnet')
    expect(content.copy.formatWeeklyTotal(49 * 60)).toBe('49 Std.')
    expect(content.copy.formatDayDuration(90)).toBe('1,5 Std.')
    expect(content.copy.formatTime(8 * 60 + 30)).toBe('08:30')
    expect(content.days[0]?.label).toBe('Montag')
    expect(content.weeklyTotalLabel).toBe('49 Std.')
  })

  test('reports per-day minutes from open rows only', () => {
    const fixture = createForms9PreviewFixture()
    const store = createForms9PreviewStore(fixture.storeSeed)
    const days = store.getState().draft.days

    expect(forms9DayMinutes(dayAt(days, 'monday'))).toBe(9 * 60)
    expect(forms9DayMinutes(dayAt(days, 'sunday'))).toBe(0)
  })
})
