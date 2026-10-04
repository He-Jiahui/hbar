import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  applyHbarAppUiAppearance,
  DEFAULT_HBAR_APP_UI_APPEARANCE,
  HBAR_APP_UI_APPEARANCE_KEYS,
  HBAR_APP_UI_SIZES,
  readHbarAppUiSize,
  resolveHbarAppUiAppearance,
} from '../packages/hbar-app-ui/src/appearance'

test('appearance sizes are bounded to the shared s, m, and l scale', () => {
  expect(HBAR_APP_UI_SIZES).toEqual(['s', 'm', 'l'])
  expect(readHbarAppUiSize('s')).toBe('s')
  expect(readHbarAppUiSize('m')).toBe('m')
  expect(readHbarAppUiSize('l')).toBe('l')
  expect(readHbarAppUiSize('compact')).toBeNull()
  expect(readHbarAppUiSize(2)).toBeNull()
  expect(readHbarAppUiSize({ size: 'm' })).toBeNull()
})

test('appearance resolves persisted preferences without accepting arbitrary CSS values', () => {
  expect(
    resolveHbarAppUiAppearance({
      [HBAR_APP_UI_APPEARANCE_KEYS.controlSize]: 's',
      [HBAR_APP_UI_APPEARANCE_KEYS.textSize]: 'l',
      [HBAR_APP_UI_APPEARANCE_KEYS.cornerSize]: 'm',
    }),
  ).toEqual({ controlSize: 's', textSize: 'l', cornerSize: 'm' })

  expect(
    resolveHbarAppUiAppearance({
      [HBAR_APP_UI_APPEARANCE_KEYS.controlSize]: '37px',
      [HBAR_APP_UI_APPEARANCE_KEYS.textSize]: 'calc(1rem * 4)',
      [HBAR_APP_UI_APPEARANCE_KEYS.cornerSize]: null,
    }),
  ).toEqual(DEFAULT_HBAR_APP_UI_APPEARANCE)
})

test('appearance applies validated values as root data attributes', () => {
  const root = { dataset: {} as Record<string, string> }
  applyHbarAppUiAppearance(root, { controlSize: 'l', textSize: 's', cornerSize: 'm' })
  expect(root.dataset).toEqual({
    hbarAppUiControlSize: 'l',
    hbarAppUiTextSize: 's',
    hbarAppUiCornerSize: 'm',
  })
})

test('token stylesheet maps every appearance size to shared semantic variables', () => {
  const tokens = readFileSync(fileURLToPath(new URL('../packages/hbar-app-ui/src/tokens.css', import.meta.url)), 'utf8')
  for (const size of HBAR_APP_UI_SIZES) {
    expect(tokens).toContain(`--hbar-app-ui-font-size-${size}:`)
    expect(tokens).toContain(`--hbar-app-ui-control-height-${size}:`)
    expect(tokens).toContain(`--hbar-app-ui-control-padding-inline-${size}:`)
    expect(tokens).toContain(`--hbar-app-ui-radius-${size}:`)
    expect(tokens).toContain(`[data-hbar-app-ui-control-size='${size}']`)
    expect(tokens).toContain(`[data-hbar-app-ui-text-size='${size}']`)
    expect(tokens).toContain(`[data-hbar-app-ui-corner-size='${size}']`)
  }
  expect(tokens).toContain('--hbar-app-ui-control-min: var(--hbar-app-ui-control-height)')
  expect(tokens).toContain('--hbar-app-ui-control-radius: var(--hbar-app-ui-component-radius)')
})
