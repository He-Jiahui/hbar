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
    expect(value).toContain('2026 年 9 月')
    expect(value).not.toContain('Month view beside day agenda')
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
