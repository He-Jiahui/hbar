import { expect, test } from 'bun:test'
import { DEFAULT_THEME_PROFILE, normalizeThemeProfile, themeProfileSchema } from '@hbar/contracts'

test('default theme uses neutral non-purple tokens and validates', () => {
  expect(themeProfileSchema.parse(DEFAULT_THEME_PROFILE)).toEqual(DEFAULT_THEME_PROFILE)
  expect(DEFAULT_THEME_PROFILE.colors.primary).not.toMatch(/8b7dff|b19eef/i)
  expect(DEFAULT_THEME_PROFILE.surface.backgroundOpacity).toBeGreaterThan(0)
})

test('invalid theme profiles fall back to the safe default', () => {
  expect(normalizeThemeProfile({ mode: 'custom' })).toEqual(DEFAULT_THEME_PROFILE)
  expect(() => themeProfileSchema.parse({ ...DEFAULT_THEME_PROFILE, colors: { ...DEFAULT_THEME_PROFILE.colors, primary: 'purple' } })).toThrow()
})
