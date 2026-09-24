import { expect, test } from '@playwright/test'
import { mountButtonFixture } from './support/button-fixture'
const fixtureStyles = `
  * { box-sizing: border-box; }
  html { min-block-size: 100%; background: var(--hbar-app-ui-bg); }
  body { min-block-size: 100%; margin: 0; background: var(--lumen-frost); color: var(--lumen-ink); font-family: system-ui, sans-serif; font-size: var(--lumen-font-size); }
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
      await mountButtonFixture(page, { theme: colorScheme, styles: fixtureStyles })

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

      expect(measurements.small.height).toBe(30)
      expect(measurements.medium.height).toBe(36)
      expect(measurements.large.height).toBe(42)
      expect(measurements.defaultButton.height).toBe(36)
      expect(Math.abs(measurements.smallIcon.width - measurements.smallIcon.height)).toBeLessThanOrEqual(1)
      expect(Math.abs(measurements.mediumIcon.width - measurements.mediumIcon.height)).toBeLessThanOrEqual(1)
      expect(Math.abs(measurements.largeIcon.width - measurements.largeIcon.height)).toBeLessThanOrEqual(1)
      expect(measurements.smallIcon.height).toBe(30)
      expect(measurements.mediumIcon.height).toBe(36)
      expect(measurements.largeIcon.height).toBe(42)
      expect(measurements.long.scrollWidth).toBeLessThanOrEqual(measurements.long.clientWidth)
      expect(measurements.documentWidth).toBeLessThanOrEqual(measurements.viewportWidth)

      await page.getByRole('heading', { name: 'Button system' }).focus()
      await page.keyboard.press('Tab')
      const focusedButton = page.locator(':focus')
      await expect(focusedButton).toHaveAttribute('data-testid', 's-button')
      const lamp = focusedButton.locator('[data-edge="bottom"]')
      await expect(lamp).toBeVisible()
      const beam = lamp.locator(':scope > span')
      await expect
        .poll(() => beam.evaluate((element) => Number(getComputedStyle(element).opacity)))
        .toBeGreaterThan(0.6)
      await expect
        .poll(() =>
          lamp.evaluate((element) => {
            const beam = element.firstElementChild
            return beam ? beam.getBoundingClientRect().width / element.getBoundingClientRect().width : 0
          }),
        )
        .toBeGreaterThan(0.65)

      await page.screenshot({
        path: `artifacts/ui-redesign/buttons/after/${colorScheme}-${viewport.name}.png`,
        fullPage: true,
      })
    }
  }

  expect(errors).toEqual([])
})
