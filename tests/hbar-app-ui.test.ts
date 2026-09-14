import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  HBAR_APP_UI_CATEGORIES,
  HBAR_APP_UI_CATEGORY_COUNTS,
  HBAR_APP_UI_VARIANT_EXPORTS,
  HBAR_APP_UI_VARIANT_SPECS,
  createHbarAppUiVariantSpec,
  getHbarAppUiVariant,
  listHbarAppUiVariants,
} from '../packages/hbar-app-ui/src/index'

describe('hbar-app-ui registry', () => {
  test('contains every documented category and exactly 300 variants', () => {
    expect(HBAR_APP_UI_CATEGORIES).toHaveLength(38)
    expect(HBAR_APP_UI_VARIANT_SPECS).toHaveLength(300)
    expect(listHbarAppUiVariants()).toHaveLength(300)
    expect(Object.keys(HBAR_APP_UI_VARIANT_EXPORTS)).toHaveLength(300)
    expect(new Set(Object.values(HBAR_APP_UI_VARIANT_EXPORTS)).size).toBe(300)
    expect(new Set(listHbarAppUiVariants().map((entry) => entry.component)).size).toBe(300)
    expect(HBAR_APP_UI_CATEGORIES.reduce((total, category) => total + HBAR_APP_UI_CATEGORY_COUNTS[category], 0)).toBe(300)
  })

  test('keeps IDs unique and category counts aligned with the registry', () => {
    const ids = new Set(HBAR_APP_UI_VARIANT_SPECS.map((spec) => spec.id))
    expect(ids.size).toBe(300)
    for (const category of HBAR_APP_UI_CATEGORIES) {
      expect(HBAR_APP_UI_VARIANT_SPECS.filter((spec) => spec.category === category)).toHaveLength(HBAR_APP_UI_CATEGORY_COUNTS[category])
    }
  })

  test('returns a stable entry and rejects invalid variants', () => {
    const entry = getHbarAppUiVariant('agent-activity', 1)
    expect(entry.spec.id).toBe('hbar-app-ui-agent-activity-1')
    expect(entry.spec.entry).toBe(entry.spec.id)
    expect(entry.spec.behavior.length).toBeGreaterThan(0)
    expect(entry.spec.observation.length).toBeGreaterThan(0)
    expect(entry.spec.visualValidation).toHaveLength(3)
    expect(entry.component).toBeFunction()
    expect(() => createHbarAppUiVariantSpec('agent-activity', 0)).toThrow(RangeError)
    expect(() => createHbarAppUiVariantSpec('agent-activity', 8)).toThrow(RangeError)
  })

  test('keeps a distinct profile and observable markup for every variant', () => {
    for (const category of HBAR_APP_UI_CATEGORIES) {
      const entries = listHbarAppUiVariants().filter((entry) => entry.spec.category === category)
      expect(new Set(entries.map((entry) => entry.spec.profile.key)).size).toBe(entries.length)
      expect(new Set(entries.map((entry) => entry.spec.profile.scenario)).size).toBe(entries.length)
      const markup = entries.map((entry) => renderToStaticMarkup(createElement(entry.component, { onAction: () => undefined })))
      expect(new Set(markup).size).toBe(entries.length)
    }
  })
})
