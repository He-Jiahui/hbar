import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
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
      form: {
        ...HBAR_APP_UI_SCHEDULING_FIXTURES.form!,
        initialAttendeeIds: ['avery', 'mina'],
        maximumAttendees: 1,
      },
      deadline: {
        ...HBAR_APP_UI_SCHEDULING_FIXTURES.deadline!,
        slots: [],
      },
    }
    const form = render(3, constrained)
    expect(form).toContain('Avery Chen')
    expect(form).not.toContain('Mina Patel')
    expect(form).toContain('Attendee limit reached')
    expect(render(4, constrained)).toContain('No time slots available')
  })
})
