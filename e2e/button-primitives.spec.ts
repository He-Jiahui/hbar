import { expect, test } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { delimiter, join } from 'node:path'

function resolveBun() {
  if (process.platform !== 'win32') return 'bun'
  const executable = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((directory) => [join(directory, 'bun.exe'), join(directory, 'node_modules', 'bun', 'bin', 'bun.exe')])
    .find(existsSync)
  if (!executable) throw new Error('Bun executable is unavailable for the button fixture')
  return executable
}

function renderFixture() {
  return execFileSync(resolveBun(), ['tests/fixtures/render-button-primitives.tsx'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  })
}

const tokens = readFileSync('packages/hbar-app-ui/src/tokens.css', 'utf8')
const theme = readFileSync('packages/hbar-app-ui/src/theme.css', 'utf8').replace("@import './tokens.css';", '')
const primitives = readFileSync('packages/hbar-app-ui/src/primitives.css', 'utf8')
const fixtureStyles = `
  * { box-sizing: border-box; }
  html { min-block-size: 100%; background: var(--hbar-app-ui-bg); }
  body { min-block-size: 100%; margin: 0; background: var(--hbar-app-ui-bg); color: var(--hbar-app-ui-text); font-family: var(--hbar-app-ui-font); }
  .button-fixture { display: flex; max-inline-size: 68rem; min-inline-size: 0; flex-direction: column; gap: 1rem; margin-inline: auto; padding: 2rem; }
  .button-fixture-header { display: flex; min-inline-size: 0; flex-direction: column; gap: .25rem; padding-block: .5rem 1rem; }
  .button-fixture-header p, .button-fixture-header h1, .button-fixture-header span, .button-fixture-card h2 { margin: 0; }
  .button-fixture-header p { color: var(--hbar-app-ui-subtle); font-size: .75rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .button-fixture-header h1 { font-size: 1.75rem; line-height: 1.2; }
  .button-fixture-header span, .button-fixture-section-heading span { color: var(--hbar-app-ui-subtle); }
  .button-fixture-card { display: flex; min-inline-size: 0; flex-direction: column; gap: 1rem; padding: 1rem; border: var(--hbar-app-ui-divider) solid var(--hbar-app-ui-border); border-radius: .75rem; background: var(--hbar-app-ui-surface-0); }
  .button-fixture-section-heading { display: flex; min-inline-size: 0; align-items: baseline; justify-content: space-between; gap: 1rem; }
  .button-fixture-section-heading h2 { font-size: 1rem; }
  .button-fixture-section-heading span { font-size: .75rem; text-align: end; }
  .button-fixture-row { display: flex; min-inline-size: 0; flex-wrap: wrap; align-items: center; gap: .75rem; }
  .button-fixture-long-label { max-inline-size: 18rem; }
  @media (max-width: 30rem) {
    .button-fixture { padding: 1rem; }
    .button-fixture-section-heading { flex-direction: column; align-items: flex-start; gap: .25rem; }
    .button-fixture-section-heading span { text-align: start; }
    .button-fixture-long-label { max-inline-size: 100%; }
  }
`

test('button primitives keep their hierarchy and boundaries across themes and narrow screens', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  for (const viewport of [
    { name: 'desktop-1024', width: 1024, height: 900 },
    { name: 'mobile-320', width: 320, height: 900 },
  ] as const) {
    for (const colorScheme of ['dark', 'light'] as const) {
      await page.setViewportSize(viewport)
      await page.setContent(`<!doctype html>
        <html lang="en" data-hbar-app-ui-theme="${colorScheme}">
          <head><meta name="viewport" content="width=device-width,initial-scale=1" /><style>${tokens}\n${theme}\n${primitives}\n${fixtureStyles}</style></head>
          <body>${renderFixture()}</body>
        </html>`)

      await expect(page.getByRole('heading', { name: 'Button system' })).toBeVisible()
      await expect(page.getByRole('button')).toHaveCount(15)
      await expect(page.getByRole('button', { name: 'Open settings' })).toHaveAttribute('title', 'Open settings')
      await expect(page.getByRole('button', { name: 'Run unavailable' })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Selected session' })).toHaveAttribute('aria-pressed', 'true')

      const measurements = await page.evaluate(() => {
        const box = (testId: string) => {
          const element = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)
          if (!element) throw new Error(`Missing ${testId}`)
          const rect = element.getBoundingClientRect()
          return {
            width: rect.width,
            height: rect.height,
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
          }
        }
        return {
          small: box('s-button'),
          medium: box('m-button'),
          large: box('l-button'),
          defaultButton: box('default-button'),
          smallIcon: box('s-icon-button'),
          mediumIcon: box('m-icon-button'),
          largeIcon: box('l-icon-button'),
          long: box('long-button'),
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        }
      })

      expect(measurements.small.height).toBe(32)
      expect(measurements.medium.height).toBe(36)
      expect(measurements.large.height).toBe(44)
      expect(measurements.defaultButton.height).toBe(36)
      expect(Math.abs(measurements.smallIcon.width - measurements.smallIcon.height)).toBeLessThanOrEqual(1)
      expect(Math.abs(measurements.mediumIcon.width - measurements.mediumIcon.height)).toBeLessThanOrEqual(1)
      expect(Math.abs(measurements.largeIcon.width - measurements.largeIcon.height)).toBeLessThanOrEqual(1)
      expect(measurements.smallIcon.height).toBe(32)
      expect(measurements.mediumIcon.height).toBe(36)
      expect(measurements.largeIcon.height).toBe(44)
      expect(measurements.long.scrollWidth).toBeLessThanOrEqual(measurements.long.clientWidth)
      expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.viewportWidth)

      await page.getByRole('heading', { name: 'Button system' }).focus()
      await page.keyboard.press('Tab')
      const focusedButton = page.locator(':focus')
      await expect(focusedButton).toHaveAttribute('data-testid', 's-button')
      const focusStyle = await focusedButton.evaluate((element) => {
        const style = getComputedStyle(element)
        return { outlineStyle: style.outlineStyle, outlineWidth: Number.parseFloat(style.outlineWidth) }
      })
      expect(focusStyle.outlineStyle).toBe('solid')
      expect(focusStyle.outlineWidth).toBeGreaterThanOrEqual(1)

      await page.screenshot({
        path: `artifacts/ui-redesign/buttons/after/${colorScheme}-${viewport.name}.png`,
        fullPage: true,
      })
    }
  }

  expect(errors).toEqual([])
})
