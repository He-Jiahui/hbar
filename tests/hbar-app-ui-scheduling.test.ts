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
