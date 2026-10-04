import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiFormsProvider,
  selectHbarAppUiFormsItem,
  uniqueHbarAppUiFormsItems,
  type HbarAppUiFormsContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiFormsLocalizedFixtures,
  HBAR_APP_UI_FORMS_FIXTURES,
} from './fixtures/hbar-app-ui-forms-fixtures'

function render(variant: number, content: HbarAppUiFormsContent = HBAR_APP_UI_FORMS_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiFormsProvider, {
      content,
      children: createElement(getHbarAppUiVariant('forms', variant).component, {}),
    }),
  )
}

describe('hbar-app-ui form workflow surfaces', () => {
  test('renders twelve distinct Lumen form workflows from host content', () => {
    const values = Array.from({ length: 12 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(12)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="forms"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })

  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiFormsLocalizedFixtures())
    expect(value).toContain('创建记录')
    expect(value).toContain('保存记录')
    expect(value).not.toContain('Create record')
  })

  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiFormsItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiFormsItem(items, 'missing')).toBe(items[0])
  })

  test('honors empty repeatable rows and explicit capacity strategies', () => {
    const content: HbarAppUiFormsContent = {
      ...HBAR_APP_UI_FORMS_FIXTURES,
      booking: { ...HBAR_APP_UI_FORMS_FIXTURES.booking!, items: [] },
      quote: { ...HBAR_APP_UI_FORMS_FIXTURES.quote!, sections: [] },
    }
    expect(render(3, content)).toContain('No line items')
    expect(render(12, content)).toContain('No quote sections')
    expect(render(3)).toContain('data-hbar-app-ui-list-strategy="pane-scroll"')
    expect(render(12)).toContain('data-hbar-app-ui-list-strategy="content-grown"')
  })
})
