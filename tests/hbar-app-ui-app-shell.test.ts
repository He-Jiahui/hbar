import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiAppShellProvider,
  selectHbarAppUiAppShellItem,
  uniqueHbarAppUiAppShellItems,
  type HbarAppUiAppShellContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiAppShellLocalizedFixtures,
  HBAR_APP_UI_APP_SHELL_FIXTURES,
} from './fixtures/hbar-app-ui-app-shell-fixtures'

function render(variant: number, content: HbarAppUiAppShellContent = HBAR_APP_UI_APP_SHELL_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiAppShellProvider, {
      content,
      children: createElement(getHbarAppUiVariant('app-shell', variant).component, {}),
    }),
  )
}

describe('hbar-app-ui app shell surfaces', () => {
  test('renders nine distinct Lumen shell workflows from host content', () => {
    const values = Array.from({ length: 9 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(9)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="app-shell"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })
  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiAppShellLocalizedFixtures())
    expect(value).toContain('光栅工作台')
    expect(value).toContain('发票对账')
    expect(value).not.toContain('hbar workspace')
  })
  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiAppShellItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiAppShellItem(items, 'missing')).toBe(items[0])
  })
  test('honors empty shell records and explicit pane capacity', () => {
    const content: HbarAppUiAppShellContent = { ...HBAR_APP_UI_APP_SHELL_FIXTURES, records: [], messages: [] }
    expect(render(1, content)).toContain('No workspace records')
    expect(render(9, content)).toContain('Nothing to show')
    expect(render(5)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
  })
})
