import { describe, expect, test } from 'bun:test'
import { HBAR_APP_UI_VARIANT_SPECS } from '../packages/hbar-app-ui/src/specs'
import { HBAR_APP_UI_CATEGORIES, HBAR_APP_UI_CATEGORY_COUNTS } from '../packages/hbar-app-ui/src/types'
import { REACTBITS_PRO_THEMES, REACTBITS_PRO_VIEWPORTS } from '../scripts/reactbits-pro-audit'

describe('React Bits Pro visual audit contract', () => {
  test('keeps the full 38-category and 300-variant matrix explicit', () => {
    expect(HBAR_APP_UI_CATEGORIES).toHaveLength(38)
    expect(HBAR_APP_UI_VARIANT_SPECS).toHaveLength(300)
    expect(new Set(HBAR_APP_UI_VARIANT_SPECS.map((spec) => spec.id)).size).toBe(300)
    expect(Object.values(HBAR_APP_UI_CATEGORY_COUNTS).reduce((total, count) => total + count, 0)).toBe(300)
  })

  test('defines eight static source/local combinations per variant', () => {
    expect(REACTBITS_PRO_VIEWPORTS).toHaveLength(4)
    expect(REACTBITS_PRO_THEMES).toEqual(['dark', 'light'])
    expect(REACTBITS_PRO_VIEWPORTS.map((viewport) => `${viewport.width}x${viewport.height}`)).toEqual([
      '1440x900',
      '1024x768',
      '390x844',
      '320x720',
    ])
    expect(REACTBITS_PRO_VIEWPORTS.length * REACTBITS_PRO_THEMES.length).toBe(8)
  })
})
