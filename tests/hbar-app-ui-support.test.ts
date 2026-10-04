import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiSupportProvider,
  selectHbarAppUiSupportItem,
  uniqueHbarAppUiSupportItems,
  type HbarAppUiSupportContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiSupportLocalizedFixtures,
  HBAR_APP_UI_SUPPORT_FIXTURES,
} from './fixtures/hbar-app-ui-support-fixtures'

function render(variant: number, content: HbarAppUiSupportContent = HBAR_APP_UI_SUPPORT_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiSupportProvider, {
      content,
      children: createElement(getHbarAppUiVariant('support', variant).component, {}),
    }),
  )
}

describe('hbar-app-ui support surfaces', () => {
  test('renders five distinct Lumen support workflows from host content', () => {
    const values = Array.from({ length: 5 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(5)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="support"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })

  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiSupportLocalizedFixtures())
    expect(value).toContain('需要什么帮助')
    expect(value).toContain('账户与访问')
    expect(value).not.toContain('How can we help')
  })

  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiSupportItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiSupportItem(items, 'missing')).toBe(items[0])
  })

  test('honors empty support records and explicit capacity strategies', () => {
    const content: HbarAppUiSupportContent = {
      ...HBAR_APP_UI_SUPPORT_FIXTURES,
      help: { ...HBAR_APP_UI_SUPPORT_FIXTURES.help!, topics: [] },
      requests: { ...HBAR_APP_UI_SUPPORT_FIXTURES.requests!, requests: [] },
    }
    expect(render(1, content)).toContain('No help topics')
    expect(render(5, content)).toContain('No requests match')
    expect(render(1)).toContain('data-hbar-app-ui-list-strategy="content-grown"')
    expect(render(5)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })
})
