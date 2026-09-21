import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiCardProvider,
  selectHbarAppUiCardItem,
  uniqueHbarAppUiCardItems,
  type HbarAppUiCardContent,
} from '../packages/hbar-app-ui/src/index'
import { createHbarAppUiCardLocalizedFixtures, HBAR_APP_UI_CARD_FIXTURES } from './fixtures/hbar-app-ui-card-fixtures'

function render(variant: number, content: HbarAppUiCardContent = HBAR_APP_UI_CARD_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiCardProvider, {
      content,
      children: createElement(getHbarAppUiVariant('card', variant).component, {}),
    }),
  )
}

describe('hbar-app-ui card surfaces', () => {
  test('renders eleven distinct Lumen card workflows from host content', () => {
    const values = Array.from({ length: 11 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(11)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="card"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })

  test('renders localized copy exclusively from the host contract', () => {
    const value = render(3, createHbarAppUiCardLocalizedFixtures())
    expect(value).toContain('开始使用')
    expect(value).toContain('已完成 2/4')
    expect(value).not.toContain('Get started')
  })

  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiCardItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiCardItem(items, 'missing')).toBe(items[0])
  })

  test('honors attendee overflow and empty plan boundaries', () => {
    const content: HbarAppUiCardContent = {
      ...HBAR_APP_UI_CARD_FIXTURES,
      agenda: {
        ...HBAR_APP_UI_CARD_FIXTURES.agenda!,
        maximumVisibleAttendees: 1,
      },
      plans: {
        ...HBAR_APP_UI_CARD_FIXTURES.plans!,
        plans: [],
      },
    }
    expect(render(4, content)).toContain('+4')
    expect(render(5, content)).toContain('No plans available')
  })
})
