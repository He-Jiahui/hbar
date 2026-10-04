import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getHbarAppUiVariant,
  HbarAppUiOnboardingProvider,
  selectHbarAppUiOnboardingItem,
  uniqueHbarAppUiOnboardingItems,
  type HbarAppUiOnboardingContent,
} from '../packages/hbar-app-ui/src/index'
import {
  createHbarAppUiOnboardingLocalizedFixtures,
  HBAR_APP_UI_ONBOARDING_FIXTURES,
} from './fixtures/hbar-app-ui-onboarding-fixtures'

function render(variant: number, content: HbarAppUiOnboardingContent = HBAR_APP_UI_ONBOARDING_FIXTURES) {
  return renderToStaticMarkup(
    createElement(HbarAppUiOnboardingProvider, {
      content,
      children: createElement(getHbarAppUiVariant('onboarding', variant).component, {}),
    }),
  )
}

describe('hbar-app-ui onboarding surfaces', () => {
  test('renders seven distinct Lumen onboarding workflows from host content', () => {
    const values = Array.from({ length: 7 }, (_, index) => render(index + 1))
    expect(new Set(values).size).toBe(7)
    values.forEach((value, index) => {
      expect(value).toContain('data-lumen-component="onboarding"')
      expect(value).toContain(`data-lumen-variant="${index + 1}"`)
      expect(value).not.toContain('lucide')
      expect(value).not.toContain('hbar-app-ui-button')
    })
  })

  test('renders localized copy exclusively from the host contract', () => {
    const value = render(1, createHbarAppUiOnboardingLocalizedFixtures())
    expect(value).toContain('设置个人资料')
    expect(value).toContain('目录预览')
    expect(value).not.toContain('Your teammates will see')
  })

  test('deduplicates IDs and recovers stale selections deterministically', () => {
    const items = [
      { id: 'first', label: 'First' },
      { id: 'first', label: 'Duplicate' },
      { id: 'second', label: 'Second' },
    ]
    expect(uniqueHbarAppUiOnboardingItems(items)).toEqual([
      { id: 'first', label: 'First' },
      { id: 'second', label: 'Second' },
    ])
    expect(selectHbarAppUiOnboardingItem(items, 'missing')).toBe(items[0])
  })

  test('honors empty and bounded checklist states', () => {
    const content: HbarAppUiOnboardingContent = {
      ...HBAR_APP_UI_ONBOARDING_FIXTURES,
      checklist: {
        ...HBAR_APP_UI_ONBOARDING_FIXTURES.checklist!,
        tasks: [],
        initialCompletedCount: 99,
      },
      steps: {
        ...HBAR_APP_UI_ONBOARDING_FIXTURES.steps!,
        initialCompletedCount: 99,
      },
    }
    expect(render(3, content)).toContain('No checklist tasks')
    expect((render(2, content).match(/>Complete<\/small>/g) ?? []).length).toBe(6)
  })
})
