import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {groupLumenTimelineIntervals, snapLumenTimelineMinutes} from '@lumen/app-ui'
import {createSchedulingBookingPreviewStore} from '../apps/hbar-app-ui-preview/src/schedulingBookingPreviewStore'
import {createSchedulingTimelinePreviewStore, timelinePreviewProjection} from '../apps/hbar-app-ui-preview/src/schedulingTimelinePreviewStore'
import {
  getHbarAppUiVariant,
  HbarAppUiSchedulingProvider,
  selectHbarAppUiSchedulingItem,
  uniqueHbarAppUiSchedulingItems,
  type HbarAppUiSchedulingContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiSchedulingLocalizedFixtures,
  createHbarAppUiSchedulingOverflowFixtures,
  HBAR_APP_UI_SCHEDULING_FIXTURES,
} from './fixtures/hbar-app-ui-scheduling-fixtures'

function render(variant: number, content: HbarAppUiSchedulingContent = HBAR_APP_UI_SCHEDULING_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiSchedulingProvider, {
      content,
      children: createElement(getHbarAppUiVariant('scheduling', variant).component, {}),
    }),
  )
}

describe('hbar-app-ui scheduling surfaces', () => {
  test('booking reference preserves a passive person summary, eight day radios, nine independent time radios and inline confirmation', () => {
    const value = render(7)
    expect(value).toContain('Jonas Vieira')
    expect(value).toContain('Intro call')
    expect(value.match(/role="radio"/g)?.length).toBe(17)
    expect(value.match(/<dt/g)?.length).toBe(3)
    expect(value).toContain('role="radiogroup" aria-label="Available days"')
    expect(value).toContain('role="radiogroup" aria-label="Available times"')
    expect(value).toContain('Times on June 10')
    expect(value).toContain('June 10 at <span>10:00</span>')
    expect(value).toContain('>Confirm</button>')
    expect(value).not.toContain('role="dialog"')
    const legacy = render(7, {booking: HBAR_APP_UI_SCHEDULING_FIXTURES.booking!})
    expect(legacy).toContain('Available')
    expect(legacy).not.toContain('lumen-scheduling-booking-card')
  })

  test('booking day/time remain separate controlled choices, including a disabled-day fallback and reordered localization', () => {
    const reference = HBAR_APP_UI_SCHEDULING_FIXTURES.referenceBooking!
    const chosen = render(7, {referenceBooking: {...reference, dayId: '2026-06-08', timeId: '09:30'}})
    expect(chosen).toContain('Times on June 8')
    expect(chosen).toContain('June 8 at <span>09:30</span>')
    expect(chosen).toContain('data-hbar-app-ui-action="select-time" data-hbar-app-ui-target="14:00"')
    const stale = render(7, {referenceBooking: {...reference, dayId: '2026-06-11', timeId: 'missing'}})
    expect(stale).toContain('Times on June 8')
    expect(stale).toContain('June 8 at <span>09:00</span>')
    expect(stale).toContain('data-hbar-app-ui-target="2026-06-11"')
    const localized = render(7, createHbarAppUiSchedulingLocalizedFixtures())
    expect(localized).toContain('初次介绍与跨区域团队协作会议')
    expect(localized).toContain('6 月 10 日可选时间')
    expect(localized).toContain('aria-label="可选日期"')
    expect(localized).not.toContain('Pick a day')
  })

  test('booking capacities keep empty, one, bound and over-bound Host records without truncating stable IDs', () => {
    const content = HBAR_APP_UI_SCHEDULING_FIXTURES.referenceBooking!
    for (const count of [0, 1, 8, 9]) {
      const days = Array.from({length: count}, (_, index) => ({id: `date-${index}`, weekday: `D${index}`, date: String(index + 1), availability: 'Free'}))
      const value = render(7, {referenceBooking: {...content, days, dayId: 'missing'}})
      expect((value.match(/data-hbar-app-ui-action="select-day"/g) ?? []).length).toBe(count)
      if (!count) expect(value).toContain('No available days')
    }
    for (const count of [0, 1, 9, 10]) {
      const times = Array.from({length: count}, (_, index) => ({id: `slot-${index}`, label: `Slot ${index + 1}`}))
      const value = render(7, {referenceBooking: {...content, times, timeId: 'missing'}})
      expect((value.match(/data-hbar-app-ui-action="select-time"/g) ?? []).length).toBe(count)
      if (!count) expect(value).toContain('No times available')
    }
    const duplicate = render(7, {referenceBooking: {...content, days: [content.days[0]!, content.days[0]!], times: [content.times[0]!, content.times[0]!]}})
    expect(duplicate.match(/data-hbar-app-ui-action="select-day"/g)?.length).toBe(1)
    expect(duplicate.match(/data-hbar-app-ui-action="select-time"/g)?.length).toBe(1)
    const overflow = render(7, createHbarAppUiSchedulingOverflowFixtures())
    expect(overflow.match(/data-hbar-app-ui-action="select-day"/g)?.length).toBe(9)
    expect(overflow.match(/data-hbar-app-ui-action="select-time"/g)?.length).toBe(10)
  })

  test('booking preview store changes only the selected ID and resets to Host data', () => {
    const content = HBAR_APP_UI_SCHEDULING_FIXTURES.referenceBooking!
    const store = createSchedulingBookingPreviewStore(content)
    store.getState().setDay('2026-06-08')
    expect(store.getState().dayId).toBe('2026-06-08')
    expect(store.getState().timeId).toBe('10:00')
    store.getState().setTime('09:30')
    expect(store.getState().dayId).toBe('2026-06-08')
    store.getState().reset(content)
    expect([store.getState().dayId, store.getState().timeId]).toEqual(['2026-06-10', '10:00'])
  })
  test('timeline reference exposes native week/day buttons, temporal events and source-shaped passive footer', () => {
    const value = render(6)
    expect(value).toContain('<h1>8 – 12 June 2026</h1>')
    expect(value.match(/data-hbar-app-ui-action="select-day"/g)?.length).toBe(5)
    expect(value.match(/data-hbar-app-ui-action="select-event"/g)?.length).toBe(11)
    expect(value).toContain('aria-selected="true">Week')
    expect(value).toContain('Drag on the grid to block out time.')
    expect(value).not.toContain('style="inset')
    expect(value).not.toContain('role="dialog"')
    const legacy = render(6, {timeline: HBAR_APP_UI_SCHEDULING_FIXTURES.timeline!})
    expect(legacy).toContain('Workspace review')
    expect(legacy).not.toContain('lumen-scheduling-timeline-reference-layout')
  })

  test('temporal collision lanes use connected intervals, stable IDs, quarter-hour snaps and valid bounds', () => {
    const item = (id: string, startMinutes: number, durationMinutes: number) => ({id, startMinutes, durationMinutes})
    const groups = groupLumenTimelineIntervals([item('a', 540, 60), item('b', 570, 60), item('c', 600, 60), item('d', 660, 30), item('a', 600, 45), item('invalid', NaN, 10), item('outside', 400, 30), item('zero', 720, 0)], 480, 1080)
    expect(groups.map((group) => [group.startMinutes, group.endMinutes, group.lanes.map((lane) => lane.map((event) => event.id))])).toEqual([[540, 660, [['a', 'c'], ['b']]], [660, 690, [['d']]]])
    expect(snapLumenTimelineMinutes(589, 480, 1080)).toBe(585)
    expect(snapLumenTimelineMinutes(400, 480, 1080)).toBe(480)
    expect(snapLumenTimelineMinutes(1200, 480, 1080)).toBe(1080)
    expect(groupLumenTimelineIntervals([], 480, 1080)).toEqual([])
  })

  test('controlled timeline editor and day view preserve original IDs and all non-overflow records', () => {
    const content = HBAR_APP_UI_SCHEDULING_FIXTURES.referenceTimeline!
    const value = render(6, {referenceTimeline: {...content, view: 'day', activeDayId: '2026-06-09', selectedEventId: 'vendor', events: [...content.events].reverse()}})
    expect(value.match(/data-hbar-app-ui-action="select-day"/g)?.length).toBe(1)
    expect(value.match(/data-hbar-app-ui-action="select-event"/g)?.length).toBe(3)
    expect(value).toContain('aria-label="Event title"')
    expect(value).toContain('value="Vendor call"')
    expect(value).toContain('June 9 · 10:30 am · 1 h')
    expect(value).toContain('aria-label="Delete event"')
    expect(value).toContain('aria-label="Close editor"')
    expect(value).not.toContain('Drag on the grid')
    const stale = render(6, {referenceTimeline: {...content, selectedEventId: 'missing'}})
    expect(stale).not.toContain('aria-label="Event title"')
    const localized = render(6, createHbarAppUiSchedulingLocalizedFixtures())
    expect(localized).toContain('区域平台与产品负责人协作同步会议')
    expect(localized).toContain('在时间轴空白处拖动')
    expect(localized).not.toContain('Drag on the grid')
  })

  test('timeline capacity keeps empty, one, normal, boundary-plus-one and duplicate day/event IDs explicit', () => {
    const content = HBAR_APP_UI_SCHEDULING_FIXTURES.referenceTimeline!
    for (const count of [0, 1, 5, 6]) {
      const days = Array.from({length: count}, (_, index) => ({id: `day-${index}`, label: `Day ${index}`, date: String(index + 1)}))
      const value = render(6, {referenceTimeline: {...content, days}})
      expect((value.match(/data-hbar-app-ui-action="select-day"/g) ?? []).length).toBe(count)
      if (!count) expect(value).toContain('No days')
    }
    for (const count of [0, 1, 11, 12]) {
      const events = Array.from({length: count}, (_, index) => ({...content.events[0]!, id: `event-${index}`, startMinutes: 480 + index * 30}))
      const value = render(6, {referenceTimeline: {...content, events}})
      expect((value.match(/data-hbar-app-ui-action="select-event"/g) ?? []).length).toBe(count)
    }
    const duplicate = render(6, {referenceTimeline: {...content, days: [content.days[0]!, content.days[0]!], events: [content.events[0]!, content.events[0]!]}})
    expect(duplicate.match(/data-hbar-app-ui-action="select-day"/g)?.length).toBe(1)
    expect(duplicate.match(/data-hbar-app-ui-action="select-event"/g)?.length).toBe(1)
    const overflow = render(6, createHbarAppUiSchedulingOverflowFixtures())
    expect(overflow.match(/data-hbar-app-ui-action="select-day"/g)?.length).toBe(6)
    expect(overflow.match(/data-hbar-app-ui-action="select-event"/g)?.length).toBe(12)
  })

  test('timeline Host mutation keeps independent navigation, view, selection, CRUD and retained edits', () => {
    const content = HBAR_APP_UI_SCHEDULING_FIXTURES.referenceTimeline!
    const store = createSchedulingTimelinePreviewStore(content)
    store.getState().navigate(-1)
    expect(timelinePreviewProjection(content, store.getState()).heading).toBe('1 – 5 June 2026')
    store.getState().today()
    store.getState().setDay('2026-06-09')
    expect(timelinePreviewProjection(content, store.getState()).heading).toBe('Tuesday, 9 June 2026')
    store.getState().navigate(1)
    expect(store.getState().activeDayId).toBe('2026-06-10')
    store.getState().create('2026-06-10', 540, 60)
    expect(store.getState().selectedEventId).toBe('new-0')
    store.getState().edit({...store.getState().events.at(-1)!, title: '', durationMinutes: 120})
    store.getState().close()
    expect(store.getState().events.at(-1)?.title).toBe('')
    expect(store.getState().events.at(-1)?.durationMinutes).toBe(120)
    store.getState().remove('vendor')
    expect(store.getState().events.find((event) => event.id === 'vendor')).toBeUndefined()
    expect(store.getState().events.find((event) => event.id === 'nadia')).toBeDefined()
    store.getState().reset(content)
    expect(store.getState().events).toEqual(content.events)
  })
  test('availability reference preserves seven switches, native times, disabled boundaries and Host day count', () => {
    const value = render(5)
    expect(value.match(/role="switch"/g)?.length).toBe(7)
    expect(value.match(/aria-checked="true"/g)?.length).toBe(5)
    expect(value.match(/<select/g)?.length).toBe(13)
    expect(value.match(/data-hbar-app-ui-action="remove-interval"/g)?.length).toBe(6)
    expect(value).toContain('Bookable hours on 5 days. Holidays are excluded automatically.')
    expect(value).toContain('aria-label="Remove interval from Monday" disabled=""')
    expect(value).toContain('aria-label="Add interval to Saturday" disabled=""')
    expect(value).toContain('aria-label="Copy Saturday to other days" disabled=""')
    expect(value).toContain('value="Europe/Lisbon" selected=""')
    expect(value).toContain('Changes apply to new bookings only.')
    expect(value).not.toContain('type="time"')
    expect(value).not.toContain('role="dialog"')
  })

  test('availability controlled intervals and non-default copy retain original mutation targets', () => {
    const content = HBAR_APP_UI_SCHEDULING_FIXTURES.referenceAvailability!
    const value = render(5, {referenceAvailability: {...content, timezoneId: 'Europe/Berlin', days: content.days.map((day) => day.id === 'tuesday'
      ? {...day, intervals: [{id: 'tue-2', startId: '18:00', endId: '07:00'}]} : day)}})
    expect(value).toContain('data-hbar-app-ui-interval="tue-2"')
    expect(value).not.toContain('data-hbar-app-ui-interval="tue-1"')
    expect(value).toContain('value="18:00" selected=""')
    expect(value).toContain('value="07:00" selected=""')
    expect(value).not.toContain('aria-invalid')
    const localized = render(5, createHbarAppUiSchedulingLocalizedFixtures())
    expect(localized).toContain('每周有 5 天可预约。区域节假日将被自动排除')
    expect(localized).toContain('aria-label="移除星期二的时段"')
    expect(localized).toContain('data-hbar-app-ui-target="tuesday:tue-2"')
    expect(localized).not.toContain('Weekly availability')
  })

  test('availability collections preserve empty, one, normal, bound-plus-one and deduplicated Host records', () => {
    const content = HBAR_APP_UI_SCHEDULING_FIXTURES.referenceAvailability!
    for (const count of [0, 1, 7, 8]) {
      const days = Array.from({length: count}, (_, index) => ({...content.days[0]!, id: `day-${index}`}))
      const value = render(5, {referenceAvailability: {...content, days}})
      expect((value.match(/role="switch"/g) ?? []).length).toBe(count)
      expect(value).toContain(`Bookable hours on ${count} days.`)
      if (!count) expect(value).toContain('No days available')
    }
    for (const count of [0, 1, 2, 3]) {
      const intervals = Array.from({length: count}, (_, index) => ({id: `i-${index}`, startId: 'missing', endId: 'missing'}))
      const value = render(5, {referenceAvailability: {...content, days: [{...content.days[0]!, intervals}]}})
      expect((value.match(/data-hbar-app-ui-interval=/g) ?? []).length).toBe(count)
      if (count) expect(value).toContain('value="07:00" selected=""')
      else expect(value).toContain('No intervals')
    }
    for (const count of [0, 1, 8, 9]) {
      const times = Array.from({length: count}, (_, index) => ({id: `time-${index}`, label: `Time ${index}`}))
      const value = render(5, {referenceAvailability: {...content, times, days: [content.days[0]!]}})
      if (count) expect(value).toContain('value="time-0" selected=""')
      else expect(value).toContain('No times')
    }
    for (const count of [0, 1, 3, 4]) {
      const timezones = Array.from({length: count}, (_, index) => ({id: `zone-${index}`, label: `Zone ${index}`}))
      const value = render(5, {referenceAvailability: {...content, timezones, timezoneId: 'missing'}})
      if (count) expect(value).toContain('value="zone-0" selected=""')
      else expect(value).toContain('No timezones')
    }
    const duplicateDay = {...content.days[0]!, intervals: [content.days[0]!.intervals[0]!, content.days[0]!.intervals[0]!]}
    const duplicate = render(5, {referenceAvailability: {...content, days: [duplicateDay, duplicateDay], times: [content.times[0]!, content.times[0]!], timezones: [content.timezones[0]!, content.timezones[0]!]}})
    expect(duplicate.match(/role="switch"/g)?.length).toBe(1)
    expect(duplicate.match(/data-hbar-app-ui-interval=/g)?.length).toBe(1)
    expect(duplicate.match(/<option/g)?.length).toBe(3)
    const overflow = render(5, createHbarAppUiSchedulingOverflowFixtures())
    expect(overflow.match(/role="switch"/g)?.length).toBe(8)
    expect(overflow.match(/data-hbar-app-ui-interval=/g)?.length).toBe(24)
    expect(overflow).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })

  test('legacy availability still has its independent native time inputs', () => {
    const value = render(5, {availability: HBAR_APP_UI_SCHEDULING_FIXTURES.availability!})
    expect(value).toContain('type="time"')
    expect(value).toContain('Save availability')
    expect(value).not.toContain('lumen-scheduling-availability-card')
  })

  test('deadline reference preserves independent preset, month, calendar, radio and footer states', () => {
    const value = render(4)
    expect(value).toContain('Times shown in <span>Europe/Bucharest</span>')
    expect(value.match(/data-hbar-app-ui-action="select-preset"/g)?.length).toBe(5)
    expect(value.match(/data-hbar-app-ui-action="select-day"/g)?.length).toBe(30)
    expect(value.match(/role="radio"/g)?.length).toBe(20)
    expect(value).toContain('role="radiogroup" aria-label="Available times"')
    expect(value).toContain('Due <span>June 30, 10:00</span>')
    expect(value).toContain('value="June 2026" selected=""')
    expect(value).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(value).not.toContain('role="dialog"')
  })

  test('controlled deadline choices preserve separate Host IDs and summary data', () => {
    const content = HBAR_APP_UI_SCHEDULING_FIXTURES.referenceDeadline!
    const value = render(4, {referenceDeadline: {...content, presetId: 'none', monthId: 'May 2026', dayId: '15', timeId: '09:30', presets: [...content.presets].reverse()}})
    expect(value).toContain('data-hbar-app-ui-target="none"')
    expect(value).toContain('value="May 2026" selected=""')
    expect(value).toContain('data-hbar-app-ui-target="15"')
    expect(value).toContain('aria-checked="true" data-hbar-app-ui-action="select-time" data-hbar-app-ui-target="09:30"')
    expect(value).toContain('Tuesday, 15')
    expect(value).toContain('Due <span>June 15, 09:30</span>')
    expect(value).not.toContain('Due <span>May 15')
    const localized = render(4, createHbarAppUiSchedulingLocalizedFixtures())
    expect(localized).toContain('显示时区：<span>欧洲／布加勒斯特</span>')
    expect(localized).toContain('今天的跨区域协作截止日期')
    expect(localized).toContain('aria-label="月份"')
    expect(localized).toContain('截止日期 <span>六月30日 10:00</span>')
  })

  test('deadline capacity, duplicate and stale IDs are bounded without losing reachable records', () => {
    const content = HBAR_APP_UI_SCHEDULING_FIXTURES.referenceDeadline!
    for (const count of [0, 1, 5, 6]) {
      const presets = Array.from({length: count}, (_, index) => ({id: `p-${index}`, label: `Preset ${index}`, detail: 'Value', icon: 'today' as const}))
      const value = render(4, {referenceDeadline: {...content, presets, presetId: 'stale'}})
      expect((value.match(/data-hbar-app-ui-action="select-preset"/g) ?? []).length).toBe(count)
      if (count) expect(value).toContain('data-hbar-app-ui-target="p-0"')
      else expect(value).toContain('No presets')
    }
    for (const count of [0, 1, 35, 36]) {
      const days = Array.from({length: count}, (_, index) => ({id: `day-${index}`, label: String(index + 1), selectable: true}))
      const value = render(4, {referenceDeadline: {...content, days, dayId: 'stale'}})
      expect((value.match(/data-hbar-app-ui-action="select-day"/g) ?? []).length).toBe(count)
      if (count) expect(value).toContain('Due <span>June 1, 10:00</span>')
      else expect(value).toContain('No dates')
    }
    for (const count of [0, 1, 20, 21]) {
      const times = Array.from({length: count}, (_, index) => ({id: `t-${index}`, label: `Time ${index}`}))
      const value = render(4, {referenceDeadline: {...content, times, timeId: 'stale'}})
      expect((value.match(/role="radio"/g) ?? []).length).toBe(count)
      if (count) expect(value).toContain('Due <span>June 30, Time 0</span>')
      else expect(value).toContain('No times')
    }
    for (const count of [0, 1, 3, 4]) {
      const months = Array.from({length: count}, (_, index) => ({id: `m-${index}`, label: `Month ${index}`}))
      const value = render(4, {referenceDeadline: {...content, months, monthId: 'stale'}})
      if (count) expect(value).toContain('value="m-0" selected=""')
      else { expect(value).toContain('No months'); expect(value).toContain('disabled=""') }
    }
    const duplicate = render(4, {referenceDeadline: {...content, presets: [content.presets[0]!, content.presets[0]!], days: [content.days[1]!, content.days[1]!], times: [content.times[0]!, content.times[0]!], months: [content.months[0]!, content.months[0]!], monthId: 'stale'}})
    expect(duplicate.match(/data-hbar-app-ui-action="select-preset"/g)?.length).toBe(1)
    expect(duplicate.match(/data-hbar-app-ui-action="select-day"/g)?.length).toBe(1)
    expect(duplicate.match(/role="radio"/g)?.length).toBe(1)
    expect(duplicate).toContain('value="May 2026" selected=""')
    const overflow = render(4, createHbarAppUiSchedulingOverflowFixtures())
    expect(overflow.match(/data-hbar-app-ui-action="select-preset"/g)?.length).toBe(6)
    expect(overflow.match(/data-hbar-app-ui-action="select-day"/g)?.length).toBe(43)
    expect(overflow.match(/role="radio"/g)?.length).toBe(21)
    expect(overflow).toContain('data-hbar-app-ui-target="slot-20"')
  })

  test('legacy deadline remains independently available without opt-in', () => {
    const value = render(4, {deadline: HBAR_APP_UI_SCHEDULING_FIXTURES.deadline!})
    expect(value).toContain('Deadline picker')
    expect(value).toContain('September 2026')
    expect(value).not.toContain('lumen-scheduling-deadline-card')
  })

  test('reference form preserves field order, native control types and enabled source no-op footer', () => {
    const value = render(3)
    expect(value).toContain('New schedule')
    expect(value.match(/type="text"/g)?.length).toBe(4)
    expect(value.match(/<select/g)?.length).toBe(2)
    expect(value.match(/data-hbar-app-ui-action="remove-attendee"/g)?.length).toBe(2)
    expect(value).toContain('aria-label="Add attendee"')
    expect(value).toContain('placeholder="Add someone"')
    expect(value).toContain('value="10 June 2026"')
    expect(value).toContain('rows="3"')
    expect(value).not.toContain('type="date"')
    expect(value).not.toContain('type="time"')
    expect(value).not.toContain('type="file"')
    expect(value).not.toContain('disabled=""')
    expect(value.indexOf('placeholder="Weekly platform sync"')).toBeLessThan(value.indexOf('data-hbar-app-ui-region="form-attendees"'))
    expect(value.indexOf('form-attachments')).toBeLessThan(value.indexOf('placeholder="Paste a room link"'))
  })

  test('controlled form drafts and mutated records retain host values, labels and original IDs', () => {
    const content = HBAR_APP_UI_SCHEDULING_FIXTURES.referenceForm!
    const value = render(3, {referenceForm: {...content, name: 'Host draft', attendeeQuery: 'Nora', date: '14 July 2026',
      startId: '11:00', endId: '08:30', meetingLink: 'https://example.com/room', notes: 'Read the brief', attendees: [...content.attendees].reverse()}})
    expect(value).toContain('value="Host draft"')
    expect(value).toContain('value="Nora"')
    expect(value).toContain('value="14 July 2026"')
    expect(value).toContain('value="11:00" selected=""')
    expect(value).toContain('value="08:30" selected=""')
    expect(value).toContain('Read the brief')
    expect(value).toContain('data-hbar-app-ui-target="marta"')
    expect(value).not.toContain('aria-invalid')
    const localized = render(3, createHbarAppUiSchedulingLocalizedFixtures())
    expect(localized).toContain('邀请的跨区域产品与运营同事')
    expect(localized).toContain('placeholder="每周平台研发团队与区域运营负责人同步会议"')
    expect(localized).toContain('aria-label="移除Marta Rey"')
    expect(localized).not.toContain('New schedule')
  })

  test('form capacity and native option boundaries preserve empty, normal, duplicate and over-bound inputs', () => {
    const content = HBAR_APP_UI_SCHEDULING_FIXTURES.referenceForm!
    for (const count of [0, 1, 2, 3]) {
      const attendees = Array.from({length: count}, (_, index) => ({id: `p-${index}`, name: `Person ${index}`, initials: 'P'}))
      const value = render(3, {referenceForm: {...content, attendees}})
      expect((value.match(/data-hbar-app-ui-action="remove-attendee"/g) ?? []).length).toBe(count)
      expect(value).toContain('aria-label="Add attendee"')
    }
    const duplicate = render(3, {referenceForm: {...content, attendees: [content.attendees[0]!, content.attendees[0]!]}})
    expect(duplicate.match(/data-hbar-app-ui-target="marta"/g)?.length).toBe(1)
    for (const count of [0, 1, 6, 7]) {
      const starts = Array.from({length: count}, (_, index) => ({id: `time-${index}`, label: String(index)}))
      const value = render(3, {referenceForm: {...content, starts, ends: starts, startId: 'stale', endId: 'stale'}})
      if (count) expect(value).toContain('value="time-0" selected=""')
      else expect(value.match(/disabled=""/g)?.length).toBe(2)
    }
    const overflow = render(3, createHbarAppUiSchedulingOverflowFixtures())
    expect(overflow.match(/data-hbar-app-ui-action="remove-attendee"/g)?.length).toBe(7)
    expect(overflow).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })

  test('legacy scheduling form remains independently available without referenceForm', () => {
    const value = render(3, {form: HBAR_APP_UI_SCHEDULING_FIXTURES.form!})
    expect(value).toContain('Schedule a run')
    expect(value).toContain('type="date"')
    expect(value).not.toContain('lumen-scheduling-form-card')
  })

  test('renders seven distinct Lumen workflows from host content', () => {
    const values = Array.from({ length: 7 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(7)
    values.forEach((value, index) => {
      expect(value).toContain(`data-lumen-component="scheduling"`)
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })

  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiSchedulingLocalizedFixtures())
    expect(value).toContain('日程')
    expect(value).toContain('跨区域平台与产品协作日程')
    expect(value).toContain('aria-label="月份"')
    expect(value).toContain('全部事件')
    expect(value).not.toContain('Month view beside day agenda')
  })

  test('month reference preserves thirty date actions, adjacent passive dates and six complete event articles', () => {
    const value = render(1)
    expect(value.match(/data-hbar-app-ui-action="select-day"/g)?.length).toBe(30)
    expect(value.match(/<article/g)?.length).toBe(6)
    expect(value.match(/<select/g)?.length).toBe(3)
    expect(value.match(/aria-pressed="true"/g)?.length).toBe(1)
    expect(value).toContain('Wednesday, June 10')
    expect(value).toContain('6 events · 3 need a reply')
    expect(value).toContain('Support escalation sync')
    expect(value).toContain('Main hall')
    expect(value).not.toContain('role="grid"')
    expect(value).not.toContain('role="tab"')
  })

  test('legacy month remains independently available without opting into the reference surface', () => {
    const value = render(1, {month: createHbarAppUiSchedulingLocalizedFixtures().month!})
    expect(value).toContain('2026 年 9 月')
    expect(value).not.toContain('lumen-scheduling-month-reference-layout')
  })

  test('range reference uses a person header, associated native selects, ten radios and an inline summary', () => {
    const value = render(2)
    expect(value).toContain('Anna Neary')
    expect(value).toContain('Head of Operations')
    expect(value.match(/role="radio"/g)?.length).toBe(10)
    expect(value.match(/<select/g)?.length).toBe(2)
    expect(value.match(/aria-checked="true"/g)?.length).toBe(1)
    expect(value).toContain('role="radiogroup" aria-label="Duration"')
    expect(value).toContain('Blocks <span class="lumen-scheduling-range-summary-value">1 hour</span> on the shared calendar')
    expect(value).toContain('>Cancel</button>')
    expect(value).toContain('>Apply</button>')
    expect(value).not.toContain('aria-pressed')
    expect(value).not.toContain('role="dialog"')
    expect(value).not.toContain('<h2')
  })

  test('legacy time range remains available without the reference opt-in', () => {
    const value = render(2, {timeRange: HBAR_APP_UI_SCHEDULING_FIXTURES.timeRange!})
    expect(value).toContain('Time range')
    expect(value).toContain('Use 60 min')
    expect(value).not.toContain('lumen-scheduling-range-card')
  })

  test('controlled range choices keep their original IDs and do not calculate or validate a time interval', () => {
    const content = HBAR_APP_UI_SCHEDULING_FIXTURES.referenceRange!
    const value = render(2, {referenceRange: {...content, startId: '10:30', endId: '09:30', durationId: 'Custom', durations: [...content.durations].reverse()}})
    expect(value).toContain('value="10:30" selected=""')
    expect(value).toContain('value="09:30" selected=""')
    expect(value).toContain('aria-checked="true" data-hbar-app-ui-action="select-duration" data-hbar-app-ui-target="Custom"')
    expect(value).toContain('>Custom</span> on the shared calendar')
    expect(value).not.toContain('aria-invalid')
    const localized = render(2, createHbarAppUiSchedulingLocalizedFixtures())
    expect(localized).toContain('跨区域运营、产品和共享日程负责人')
    expect(localized).toContain('由跨区域团队协商的自定义持续时间')
    expect(localized).toContain('在跨区域团队共享日历中保留')
    expect(localized).not.toContain('Blocks ')
  })

  test('range capacity handles empty, boundary, over-bound, duplicate, stale and disabled Host choices', () => {
    const content = HBAR_APP_UI_SCHEDULING_FIXTURES.referenceRange!
    for (const count of [0, 1, 10, 11]) {
      const durations = Array.from({length: count}, (_, index) => ({id: `d-${index}`, label: `Duration ${index + 1}`}))
      const value = render(2, {referenceRange: {...content, durations, durationId: 'missing'}})
      expect((value.match(/role="radio"/g) ?? []).length).toBe(count)
      if (count) expect(value).toContain('aria-checked="true" data-hbar-app-ui-action="select-duration" data-hbar-app-ui-target="d-0"')
      else expect(value).toContain('No durations')
    }
    for (const count of [0, 1, 5, 6]) {
      const starts = Array.from({length: count}, (_, index) => ({id: `s-${index}`, label: `Start ${index + 1}`}))
      const ends = Array.from({length: count}, (_, index) => ({id: `e-${index}`, label: `End ${index + 1}`}))
      const value = render(2, {referenceRange: {...content, starts, ends, startId: 'missing', endId: 'missing'}})
      if (count) {expect(value).toContain('value="s-0" selected=""');expect(value).toContain('value="e-0" selected=""')}
      else {expect(value).toContain('No start times');expect(value).toContain('No end times')}
    }
    const duplicate = render(2, {referenceRange: {...content, durations: [{id: 'original', label: 'Original', disabled: true}, {id: 'original', label: 'Duplicate'}], durationId: 'missing'}})
    expect(duplicate.match(/role="radio"/g)?.length).toBe(1)
    expect(duplicate).toContain('disabled="" data-hbar-app-ui-action="select-duration" data-hbar-app-ui-target="original"')
    expect(duplicate).not.toContain('Duplicate')
    const overflow = render(2, createHbarAppUiSchedulingOverflowFixtures())
    expect(overflow.match(/role="radio"/g)?.length).toBe(11)
    expect(overflow).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })

  test('Host day changes and native choices remain independent without fabricated event filtering', () => {
    const content = HBAR_APP_UI_SCHEDULING_FIXTURES.referenceMonth!
    const value = render(1, {referenceMonth: {...content, activeDayId: '11', monthId: 'April', yearId: '2027', filterId: 'Needs reply', days: [...content.days].reverse()}})
    expect(value).toContain('Wednesday, June 11')
    expect(value).toContain('value="April" selected=""')
    expect(value).toContain('value="2027" selected=""')
    expect(value).toContain('value="Needs reply" selected=""')
    expect(value.match(/<article/g)?.length).toBe(6)
  })

  test('calendar and agenda capacity, duplicates, empty records and stale selections remain explicit', () => {
    const content = HBAR_APP_UI_SCHEDULING_FIXTURES.referenceMonth!
    for (const count of [0, 1, 35, 42, 43]) {
      const days = Array.from({length: count}, (_, index) => ({id: String(index + 1), label: String(index + 1), selectable: true}))
      const value = render(1, {referenceMonth: {...content, days, activeDayId: 'missing'}})
      expect((value.match(/data-hbar-app-ui-action="select-day"/g) ?? []).length).toBe(count)
      if (count) expect(value).toContain('Wednesday, June 1')
      else expect(value).toContain('No dates available')
    }
    for (const count of [0, 1, 6, 7]) {
      const events = Array.from({length: count}, (_, index) => ({...content.events[0]!, id: String(index)}))
      expect((render(1, {referenceMonth: {...content, events}}).match(/<article/g) ?? []).length).toBe(count)
    }
    const value = render(1, {referenceMonth: {...content, days: [content.days[0]!, content.days[0]!, content.days[1]!], events: [content.events[0]!, content.events[0]!], months: [content.months[0]!, content.months[0]!], monthId: 'missing'}})
    expect(value.match(/<article/g)?.length).toBe(1)
    expect(value.match(/data-hbar-app-ui-action="select-day"/g)?.length).toBe(1)
    expect(value).toContain('value="April" selected=""')
    const overflow = render(1, createHbarAppUiSchedulingOverflowFixtures())
    expect(overflow.match(/<article/g)?.length).toBe(7)
    expect(overflow).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(render(1, {referenceMonth: {...content, events: [], months: [], years: [], filters: [], days: []}})).toContain('No events')
    for (const count of [0, 1, 3, 4]) {
      const participants = Array.from({length: count}, (_, index) => ({id: String(index), initials: `P${index}`}))
      const markup = render(1, {referenceMonth: {...content, events: [{...content.events[0]!, participants}]}})
      expect((markup.match(/>P\d</g) ?? []).length).toBe(count)
    }
  })

  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiSchedulingItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiSchedulingItem(items, 'missing')).toBe(items[0])
  })

  test('enforces attendee capacity and renders empty slot boundaries', () => {
    const constrained: HbarAppUiSchedulingContent = {
      ...HBAR_APP_UI_SCHEDULING_FIXTURES,
      referenceForm: undefined,
      form: {
        ...HBAR_APP_UI_SCHEDULING_FIXTURES.form!,
        initialAttendeeIds: ['avery', 'mina'],
        maximumAttendees: 1,
      },
      deadline: {
        ...HBAR_APP_UI_SCHEDULING_FIXTURES.deadline!,
        slots: [],
      },
      referenceDeadline: undefined,
    }
    const form = render(3, constrained)
    expect(form).toContain('Avery Chen')
    expect(form).not.toContain('Mina Patel')
    expect(form).toContain('Attendee limit reached')
    expect(render(4, constrained)).toContain('No time slots available')
  })
})
