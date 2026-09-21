import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiAppDialogProvider,
  selectHbarAppUiAppDialogItem,
  uniqueHbarAppUiAppDialogItems,
  type HbarAppUiAppDialogContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiAppDialogLocalizedFixtures,
  HBAR_APP_UI_APP_DIALOG_FIXTURES,
} from './fixtures/hbar-app-ui-app-dialog-fixtures'

function render(variant: number, content: HbarAppUiAppDialogContent = HBAR_APP_UI_APP_DIALOG_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiAppDialogProvider, {
      content,
      children: createElement(getHbarAppUiVariant('app-dialog', variant).component, {}),
    }),
  )
}

describe('hbar-app-ui app dialog surfaces', () => {
  test('renders seven distinct Lumen dialog workflows from host content', () => {
    const values = Array.from({ length: 7 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(7)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="app-dialog"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })

  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiAppDialogLocalizedFixtures())
    expect(value).toContain('应用方案变更')
    expect(value).toContain('规模版')
    expect(value).not.toContain('Apply plan change')
  })

  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiAppDialogItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiAppDialogItem(items, 'missing')).toBe(items[0])
  })

  test('honors empty dialog records and explicit capacity strategies', () => {
    const content: HbarAppUiAppDialogContent = {
      ...HBAR_APP_UI_APP_DIALOG_FIXTURES,
      plan: { ...HBAR_APP_UI_APP_DIALOG_FIXTURES.plan!, rows: [] },
      menu: { ...HBAR_APP_UI_APP_DIALOG_FIXTURES.menu!, items: [] },
    }
    expect(render(1, content)).toContain('No plan changes')
    expect(render(7, content)).toContain('No actions')
    expect(render(1)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(render(7)).toContain('data-hbar-app-ui-list-strategy="content-grown"')
  })
})
