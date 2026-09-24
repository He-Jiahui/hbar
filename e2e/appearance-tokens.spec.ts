import { expect, test } from '@playwright/test'
import type { HbarAppUiSize } from '../packages/hbar-app-ui/src/appearance'
import { mountButtonFixture } from './support/button-fixture'
const fixtureStyles = `
  * { box-sizing: border-box; }
  html { min-block-size: 100%; background: var(--hbar-app-ui-bg); }
  body { min-block-size: 100%; margin: 0; background: var(--lumen-frost); color: var(--lumen-ink); font-family: system-ui, sans-serif; font-size: var(--lumen-font-size); line-height: 1.5; }
  .button-fixture { display: flex; max-inline-size: 68rem; min-inline-size: 0; flex-direction: column; gap: 1rem; margin-inline: auto; padding: 2rem; }
  .button-fixture-header, .button-fixture-card { display: flex; min-inline-size: 0; flex-direction: column; gap: 1rem; }
  .button-fixture-card { padding: 1rem; border: var(--hbar-app-ui-divider) solid var(--hbar-app-ui-border); border-radius: var(--hbar-app-ui-component-radius); background: var(--hbar-app-ui-surface-0); }
  .button-fixture-header :is(p, h1, span), .button-fixture-card h2 { margin: 0; }
  .button-fixture-section-heading, .button-fixture-row { display: flex; min-inline-size: 0; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem; }
  .button-fixture-row { justify-content: flex-start; }
  .button-fixture-long-label { max-inline-size: 18rem; }
`

const expectations: Readonly<
  Record<
    HbarAppUiSize,
    { readonly height: number; readonly fontSize: number; readonly paddingToken: number; readonly radius: number }
  >
> = {
  s: { height: 30, fontSize: 13, paddingToken: 10, radius: 4 },
  m: { height: 36, fontSize: 14, paddingToken: 12, radius: 6 },
  l: { height: 42, fontSize: 16, paddingToken: 14, radius: 8 },
}

test('global appearance attributes resolve to measured component geometry', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1024, height: 900 })

  for (const size of ['s', 'm', 'l'] as const) {
    await mountButtonFixture(page, { theme: 'light', size, styles: fixtureStyles })

    const button = page.getByTestId('default-button')
    await expect(button).toBeVisible()
    const measured = await button.evaluate((element) => {
      const style = getComputedStyle(element)
      const resolveLength = (name: string) => {
        const probe = document.createElement('span')
        probe.style.position = 'absolute'
        probe.style.visibility = 'hidden'
        probe.style.inlineSize = `var(${name})`
        document.body.append(probe)
        const value = Number.parseFloat(getComputedStyle(probe).inlineSize)
        probe.remove()
        return value
      }
      return {
        height: element.getBoundingClientRect().height,
        fontSize: Number.parseFloat(style.fontSize),
        radius: Number.parseFloat(style.borderTopLeftRadius),
        controlToken: resolveLength('--lumen-control-size'),
        paddingToken: resolveLength('--lumen-control-padding-inline'),
        textToken: resolveLength('--lumen-font-size'),
        radiusToken: resolveLength('--lumen-radius-control'),
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }
    })

    expect(measured.height).toBeGreaterThanOrEqual(expectations[size].height)
    expect(measured.height - expectations[size].height).toBeLessThanOrEqual(1)
    expect(measured.fontSize).toBe(expectations[size].fontSize)
    expect(measured.radius).toBe(expectations[size].radius)
    expect(measured.controlToken).toBe(expectations[size].height)
    expect(measured.paddingToken).toBe(expectations[size].paddingToken)
    expect(measured.textToken).toBe(expectations[size].fontSize)
    expect(measured.radiusToken).toBe(expectations[size].radius)
    expect(measured.documentWidth).toBeLessThanOrEqual(measured.viewportWidth)

    await page.screenshot({ path: `artifacts/ui-redesign/appearance-tokens/${size}.png`, fullPage: true })
  }

  expect(errors).toEqual([])
})
