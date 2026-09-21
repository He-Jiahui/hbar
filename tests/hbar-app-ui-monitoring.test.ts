import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiMonitoringProvider,
  selectHbarAppUiMonitoringItem,
  uniqueHbarAppUiMonitoringItems,
  type HbarAppUiMonitoringContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiMonitoringLocalizedFixtures,
  HBAR_APP_UI_MONITORING_FIXTURES,
} from './fixtures/hbar-app-ui-monitoring-fixtures'

function render(variant: number, content: HbarAppUiMonitoringContent = HBAR_APP_UI_MONITORING_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiMonitoringProvider, {
      content,
      children: createElement(getHbarAppUiVariant('monitoring', variant).component, {}),
    }),
  )
}

describe('hbar-app-ui monitoring surfaces', () => {
  test('renders ten distinct Lumen monitoring workflows from host content', () => {
    const values = Array.from({ length: 10 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(10)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="monitoring"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })

  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiMonitoringLocalizedFixtures())
    expect(value).toContain('平台健康')
    expect(value).toContain('事件动态')
    expect(value).not.toContain('KPI deltas')
  })

  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiMonitoringItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiMonitoringItem(items, 'missing')).toBe(items[0])
  })

  test('honors empty feeds and bounded operational records', () => {
    const content: HbarAppUiMonitoringContent = {
      ...HBAR_APP_UI_MONITORING_FIXTURES,
      health: { ...HBAR_APP_UI_MONITORING_FIXTURES.health!, incidents: [] },
      logs: { ...HBAR_APP_UI_MONITORING_FIXTURES.logs!, lines: [] },
    }
    expect(render(1, content)).toContain('No incidents')
    expect(render(5, content)).toContain('No log entries')
  })
})
