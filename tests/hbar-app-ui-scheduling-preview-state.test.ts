import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getHbarAppUiVariant, HbarAppUiSchedulingProvider } from '../packages/hbar-app-ui/src/index'
import {
  createSchedulingPreviewStore,
  type SchedulingPreviewScope,
  type SchedulingPreviewVariant,
} from '../apps/hbar-app-ui-preview/src/schedulingPreviewModel'
import { projectSchedulingPreview } from '../apps/hbar-app-ui-preview/src/schedulingPreviewProjection'
import {
  createSchedulingTimelinePreviewStore,
  timelinePreviewProjection,
} from '../apps/hbar-app-ui-preview/src/schedulingTimelinePreviewStore'
import { createSchedulingBookingPreviewStore } from '../apps/hbar-app-ui-preview/src/schedulingBookingPreviewStore'
import {
  createHbarAppUiSchedulingLocalizedFixtures,
  HBAR_APP_UI_SCHEDULING_FIXTURES as input,
} from './fixtures/hbar-app-ui-scheduling-fixtures'

function owner(variant: SchedulingPreviewVariant, content = input) {
  const scope: SchedulingPreviewScope = { variant, ownerId: `scheduling-${variant}` }
  const store = createSchedulingPreviewStore(content, scope)
  return { scope, store, state: store.getState(), project: () => projectSchedulingPreview(content, store) }
}
describe('active Scheduling preview owners', () => {
  test('only the active rich and legacy contracts are projected; empty input and foreign owners are inert', () => {
    const variants = [1, 2, 3, 4, 5] as const
    const keys = [
      ['month', 'referenceMonth'],
      ['timeRange', 'referenceRange'],
      ['form', 'referenceForm'],
      ['deadline', 'referenceDeadline'],
      ['availability', 'referenceAvailability'],
    ]
    for (const variant of variants) {
      const { scope, store, state, project } = owner(variant)
      expect(Object.keys(project())).toEqual(keys[variant - 1]!)
      expect(state.choose({ ...scope }, 'dayId', '11')).toBe(false)
      expect(store.getState().flow).toBe(state.flow)
      const empty = createSchedulingPreviewStore({}, scope)
      expect(empty.getState().flow).toEqual({ kind: 'empty' })
      expect(empty.getState().draft(scope, 'notes', 'ignored')).toBe(false)
    }
  })
  test('month choices retain the fixed source agenda and reject adjacent days and unrelated fields', () => {
    const { scope, store, state, project } = owner(1)
    expect(state.choose(scope, 'dayId', '11')).toBe(true)
    expect(state.choose(scope, 'monthId', 'April')).toBe(true)
    expect(state.choose(scope, 'filterId', 'Needs reply')).toBe(true)
    expect(state.choose(scope, 'dayId', 'previous-31')).toBe(false)
    expect(state.choose(scope, 'durationId', '1 hour')).toBe(false)
    expect(store.getState().flow).toMatchObject({
      kind: 'month',
      dayId: '11',
      monthId: 'April',
      yearId: '2026',
      filterId: 'Needs reply',
    })
    expect(project().referenceMonth?.events).toBe(input.referenceMonth!.events)
  })
  test('range permits crossed times and Custom without inventing validation or recalculation', () => {
    const { scope, store, state } = owner(2)
    expect(state.choose(scope, 'startId', '10:30')).toBe(true)
    expect(state.choose(scope, 'endId', '09:30')).toBe(true)
    expect(state.choose(scope, 'durationId', 'Custom')).toBe(true)
    expect(state.choose(scope, 'startId', 'unknown')).toBe(false)
    expect(store.getState().flow).toEqual({ kind: 'range', startId: '10:30', endId: '09:30', durationId: 'Custom' })
  })
  test('form edits and removals are ID-bound, localized, and retained independently', () => {
    const localized = createHbarAppUiSchedulingLocalizedFixtures()
    const content = {
      ...localized,
      referenceForm: {
        ...localized.referenceForm!,
        attendees: [
          localized.referenceForm!.attendees[0]!,
          localized.referenceForm!.attendees[0]!,
          localized.referenceForm!.attendees[1]!,
        ],
      },
    }
    const { scope, state, project } = owner(3, content)
    const removed = content.referenceForm.attendees[0]!.id
    expect(state.removeAttendee(scope, removed)).toBe(true)
    expect(state.removeAttendee(scope, removed)).toBe(false)
    expect(state.draft(scope, 'name', '跨区域平台团队会议与长文案')).toBe(true)
    expect(state.draft(scope, 'notes', 'Long context '.repeat(40))).toBe(true)
    expect(state.choose(scope, 'startId', '11:00')).toBe(true)
    expect(project().referenceForm?.attendees).toHaveLength(1)
    expect(project().referenceForm?.endId).toBe('10:00')
    const html = renderToStaticMarkup(
      createElement(HbarAppUiSchedulingProvider, {
        content: project(),
        children: createElement(getHbarAppUiVariant('scheduling', 3).component),
      }),
    )
    expect(html).toContain('跨区域平台团队会议与长文案')
    expect(html).toContain('Long context')
    expect(html).not.toContain(`data-hbar-app-ui-target="${removed}"`)
    expect(input.referenceForm!.attendees).toHaveLength(2)
  })
  test('deadline presets remain independent from day and time, including No date', () => {
    const { scope, state, project } = owner(4)
    expect(state.choose(scope, 'presetId', 'none')).toBe(true)
    expect(project().referenceDeadline?.dayId).toBe('30')
    expect(state.choose(scope, 'dayId', '15')).toBe(true)
    expect(state.choose(scope, 'timeId', '09:30')).toBe(true)
    expect(state.choose(scope, 'monthId', 'May 2026')).toBe(true)
    expect(state.choose(scope, 'dayId', 'next-1')).toBe(false)
    expect(project().referenceDeadline).toMatchObject({
      presetId: 'none',
      monthId: 'May 2026',
      dayId: '15',
      timeId: '09:30',
    })
  })
  test('availability reset/remove boundaries reject obsolete interval callbacks and keep source defaults', () => {
    const { scope, state, project } = owner(5)
    const old = project().referenceAvailability!
    expect(state.toggleDay(scope, 'tuesday', false)).toBe(true)
    expect(state.addInterval(scope, 'tuesday')).toBe(false)
    expect(state.toggleDay(scope, 'tuesday', true)).toBe(true)
    old.onIntervalStartChange?.('tuesday', 'tue-1', '08:00')
    const day = project().referenceAvailability!.days.find((item) => item.id === 'tuesday')!
    expect(day.intervals).toHaveLength(1)
    expect(day.intervals[0]).toMatchObject({ startId: '09:00', endId: '17:00' })
    expect(state.removeInterval(scope, 'tuesday', day.intervals[0]!.id)).toBe(false)
    expect(state.addInterval(scope, 'tuesday')).toBe(true)
    const added = project()
      .referenceAvailability!.days.find((item) => item.id === 'tuesday')!
      .intervals.at(-1)!
    expect(added).toMatchObject({ startId: '13:00', endId: '17:00' })
    expect(state.changeInterval(scope, 'tuesday', added.id, 'startId', '18:00')).toBe(true)
    expect(state.changeInterval(scope, 'tuesday', added.id, 'endId', '07:00')).toBe(true)
    expect(state.changeInterval(scope, 'tuesday', added.id, 'endId', 'missing')).toBe(false)
    expect(state.removeInterval(scope, 'tuesday', added.id)).toBe(true)
    expect(state.changeInterval(scope, 'tuesday', added.id, 'endId', '17:00')).toBe(false)
  })
  test('availability adds skip occupied IDs without reusing a removed new interval', () => {
    const reference = input.referenceAvailability!
    const monday = reference.days[0]!
    const content = {
      ...input,
      referenceAvailability: {
        ...reference,
        days: [
          {
            ...monday,
            intervals: [
              { ...monday.intervals[0]!, id: 'monday-new-0' },
              { ...monday.intervals[0]!, id: 'monday-new-1' },
            ],
          },
          { ...monday, label: 'Duplicate' },
        ],
      },
    }
    const { scope, state, project } = owner(5, content)
    expect(project().referenceAvailability?.days).toHaveLength(1)
    expect(state.addInterval(scope, 'monday')).toBe(true)
    expect(project().referenceAvailability!.days[0]!.intervals.at(-1)?.id).toBe('monday-new-2')
    expect(state.removeInterval(scope, 'monday', 'monday-new-2')).toBe(true)
    expect(state.addInterval(scope, 'monday')).toBe(true)
    expect(project().referenceAvailability!.days[0]!.intervals.at(-1)?.id).toBe('monday-new-3')
    expect(state.changeInterval(scope, 'monday', 'monday-new-2', 'startId', '08:00')).toBe(false)
  })
  test('booking guards disabled/missing IDs while retaining an independent time choice', () => {
    const store = createSchedulingBookingPreviewStore(input.referenceBooking)
    store.getState().setTime('09:30')
    store.getState().setDay('2026-06-08')
    store.getState().setDay('2026-06-11')
    store.getState().setTime('missing')
    expect(store.getState()).toMatchObject({ dayId: '2026-06-08', timeId: '09:30' })
    store.getState().reset({ ...input.referenceBooking!, days: [], dayId: 'missing', times: [] })
    store.getState().setTime('10:00')
    expect(store.getState()).toMatchObject({ dayId: '', timeId: '' })
  })
  test('timeline CRUD skips existing IDs, keeps another selection, and ignores stale removed targets', () => {
    const seed = {
      ...input.referenceTimeline!,
      events: [{ ...input.referenceTimeline!.events[0]!, id: 'new-0' }, ...input.referenceTimeline!.events],
    }
    const store = createSchedulingTimelinePreviewStore(seed)
    store.getState().create('2026-06-10', 540, 60)
    expect(store.getState().selectedEventId).toBe('new-1')
    store.getState().remove('standup')
    expect(store.getState().selectedEventId).toBe('new-1')
    const event = store.getState().events.find((item) => item.id === 'new-1')!
    store.getState().edit({ ...event, title: 'Core appointment', durationMinutes: 120 })
    expect(store.getState().events.at(-1)?.title).toBe('Core appointment')
    store.getState().remove(event.id)
    store.getState().edit(event)
    store.getState().select('missing')
    store.getState().create('bad-date', 540, 60)
    expect(store.getState().selectedEventId).toBe('')
    expect(store.getState().events.some((item) => item.id === event.id)).toBe(false)
  })
  test('timeline projection is independent of day order, handles empty dates, and retains week/day navigation', () => {
    const seed = { ...input.referenceTimeline!, days: [...input.referenceTimeline!.days].reverse() }
    const store = createSchedulingTimelinePreviewStore(seed)
    store.getState().navigate(-1)
    expect(timelinePreviewProjection(seed, store.getState()).days.map((day) => day.id)).toEqual([
      '2026-06-05',
      '2026-06-04',
      '2026-06-03',
      '2026-06-02',
      '2026-06-01',
    ])
    store.getState().today()
    store.getState().setDay('2026-06-09')
    expect(timelinePreviewProjection(seed, store.getState()).heading).toBe('Tuesday, 9 June 2026')
    store.getState().setDay('invalid')
    expect(store.getState().activeDayId).toBe('2026-06-09')
    const empty = { ...seed, days: [], events: [], activeDayId: 'invalid', view: 'day' as const }
    store.getState().reset(empty)
    expect(timelinePreviewProjection(empty, store.getState()).days).toEqual([])
    expect(timelinePreviewProjection(empty, store.getState()).heading).toBe('No days')
  })
})
