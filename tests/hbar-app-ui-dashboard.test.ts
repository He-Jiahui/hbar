import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiDashboardProvider,
  selectHbarAppUiDashboardItem,
  uniqueHbarAppUiDashboardItems,
  type HbarAppUiDashboardContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiDashboardLocalizedFixtures,
  HBAR_APP_UI_DASHBOARD_FIXTURES,
} from './fixtures/hbar-app-ui-dashboard-fixtures'

function render(variant: number, content: HbarAppUiDashboardContent = HBAR_APP_UI_DASHBOARD_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiDashboardProvider, {
      content,
      children: createElement(getHbarAppUiVariant('dashboard', variant).component, {}),
    }),
  )
}

describe('hbar-app-ui dashboard surfaces', () => {
  test('renders fourteen distinct Lumen dashboard workflows from host content', () => {
    const values = Array.from({ length: 14 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(14)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="dashboard"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })

  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiDashboardLocalizedFixtures())
    expect(value).toContain('运营总览')
    expect(value).toContain('活跃运行')
    expect(value).not.toContain('Operations overview')
  })

  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiDashboardItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiDashboardItem(items, 'missing')).toBe(items[0])
  })

  test('honors empty boards and explicit capacity strategies', () => {
    const content: HbarAppUiDashboardContent = {
      ...HBAR_APP_UI_DASHBOARD_FIXTURES,
      overview: { ...HBAR_APP_UI_DASHBOARD_FIXTURES.overview!, metrics: [] },
      operations: { ...HBAR_APP_UI_DASHBOARD_FIXTURES.operations!, services: [], incidents: [] },
    }
    expect(render(1, content)).toContain('No metrics')
    expect(render(4, content)).toContain('No services')
    expect(render(4, content)).toContain('No incidents')
    expect(render(2)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(render(3)).toContain('data-hbar-app-ui-list-strategy="content-grown"')
  })
})
