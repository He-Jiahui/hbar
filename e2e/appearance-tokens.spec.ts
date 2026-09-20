import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { HbarAppUiSize } from '../packages/hbar-app-ui/src/appearance'

function resolveBun(): string {
  if (process.platform !== 'win32') return 'bun'
  const executable = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((directory) => [join(directory, 'bun.exe'), join(directory, 'node_modules', 'bun', 'bin', 'bun.exe')])
    .find(existsSync)
  if (!executable) throw new Error('Bun executable is unavailable for the appearance fixture')
  return executable
}

function renderFixture(): string {
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
  body { min-block-size: 100%; margin: 0; background: var(--hbar-app-ui-bg); color: var(--hbar-app-ui-text); font-family: var(--hbar-app-ui-font); font-size: var(--hbar-app-ui-text-body-size); line-height: var(--hbar-app-ui-text-line-height); }
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
  s: { height: 32, fontSize: 12, paddingToken: 8, radius: 4 },
  m: { height: 36, fontSize: 13, paddingToken: 12, radius: 6 },
  l: { height: 44, fontSize: 14, paddingToken: 16, radius: 8 },
}

test('global appearance attributes resolve to measured component geometry', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.setViewportSize({ width: 1024, height: 900 })

  for (const size of ['s', 'm', 'l'] as const) {
    await page.setContent(`<!doctype html>
      <html lang="en" data-hbar-app-ui-theme="light" data-hbar-app-ui-control-size="${size}" data-hbar-app-ui-text-size="${size}" data-hbar-app-ui-corner-size="${size}">
        <head><meta name="viewport" content="width=device-width,initial-scale=1" /><style>${tokens}\n${theme}\n${primitives}\n${fixtureStyles}</style></head>
        <body>${renderFixture()}</body>
      </html>`)

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
        controlToken: resolveLength('--hbar-app-ui-control-height'),
        paddingToken: resolveLength('--hbar-app-ui-control-padding-inline'),
        textToken: resolveLength('--hbar-app-ui-text-body-size'),
        radiusToken: resolveLength('--hbar-app-ui-component-radius'),
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
