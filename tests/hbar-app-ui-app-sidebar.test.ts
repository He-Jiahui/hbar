import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiAppSidebarProvider,
  selectHbarAppUiAppSidebarItem,
  uniqueHbarAppUiAppSidebarItems,
  type HbarAppUiAppSidebarContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiAppSidebarLocalizedFixtures,
  HBAR_APP_UI_APP_SIDEBAR_FIXTURES,
} from './fixtures/hbar-app-ui-app-sidebar-fixtures'

function render(variant: number, content: HbarAppUiAppSidebarContent = HBAR_APP_UI_APP_SIDEBAR_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiAppSidebarProvider, {
      content,
      children: createElement(getHbarAppUiVariant('app-sidebar', variant).component, {}),
    }),
  )
}
describe('hbar-app-ui app sidebar surfaces', () => {
  test('renders seven distinct Lumen sidebar workflows from host content', () => {
    const values = Array.from({ length: 7 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(7)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="app-sidebar"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })
  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiAppSidebarLocalizedFixtures())
    expect(value).toContain('子午线')
    expect(value).toContain('指挥中心')
    expect(value).not.toContain('Meridian')
  })
  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiAppSidebarItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiAppSidebarItem(items, 'missing')).toBe(items[0])
  })
  test('honors empty navigation and explicit pane capacity', () => {
    const content: HbarAppUiAppSidebarContent = { ...HBAR_APP_UI_APP_SIDEBAR_FIXTURES, groups: [] }
    expect(render(1, content)).toContain('No navigation items')
    expect(render(1)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })
})
