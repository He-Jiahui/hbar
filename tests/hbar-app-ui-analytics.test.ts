import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiAnalyticsProvider,
  selectHbarAppUiAnalyticsItem,
  uniqueHbarAppUiAnalyticsItems,
  type HbarAppUiAnalyticsContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiAnalyticsLocalizedFixtures,
  HBAR_APP_UI_ANALYTICS_FIXTURES,
} from './fixtures/hbar-app-ui-analytics-fixtures'

function render(variant: number, content: HbarAppUiAnalyticsContent = HBAR_APP_UI_ANALYTICS_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiAnalyticsProvider, {
      content,
      children: createElement(getHbarAppUiVariant('analytics', variant).component, {}),
    }),
  )
}

describe('hbar-app-ui analytics surfaces', () => {
  test('renders sixteen distinct Lumen analytics workflows from host content', () => {
    const values = Array.from({ length: 16 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(16)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="analytics"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })

  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiAnalyticsLocalizedFixtures())
    expect(value).toContain('指标趋势')
    expect(value).toContain('吞吐量')
    expect(value).not.toContain('Metric strip')
  })

  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiAnalyticsItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiAnalyticsItem(items, 'missing')).toBe(items[0])
  })

  test('honors empty charts and explicit capacity strategies', () => {
    const content: HbarAppUiAnalyticsContent = {
      ...HBAR_APP_UI_ANALYTICS_FIXTURES,
      donut: { ...HBAR_APP_UI_ANALYTICS_FIXTURES.donut!, items: [] },
      cohort: { ...HBAR_APP_UI_ANALYTICS_FIXTURES.cohort!, cohorts: [] },
    }
    expect(render(5, content)).toContain('No breakdown data')
    expect(render(11, content)).toContain('No cohorts')
    expect(render(6)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(render(8)).toContain('data-hbar-app-ui-list-strategy="content-grown"')
  })
})
