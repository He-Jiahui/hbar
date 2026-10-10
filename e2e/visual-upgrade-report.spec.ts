import { expect, test } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { visualUpgradeReportCopy } from '../tests/fixtures/visual-upgrade-report-copy'
import { bunExecutable, stopOwnedWebSessionHostChild } from './support/web-session-host'
import { selectLumenOption } from './support/lumen-controls'

let server: ChildProcess
const origin = 'http://127.0.0.1:5198'
test.beforeAll(async () => {
  server = spawn(
    bunExecutable(),
    [
      'node_modules/vite/bin/vite.js',
      'preview',
      '--config',
      'apps/hbar-app-ui-preview/vite.config.ts',
      '--host',
      '127.0.0.1',
      '--port',
      '5198',
      '--strictPort',
    ],
    { stdio: 'pipe', windowsHide: true },
  )
  await expect
    .poll(() =>
      fetch(`${origin}/visual-report.html`)
        .then((response) => response.ok)
        .catch(() => false),
    )
    .toBe(true)
})
test.afterAll(async () => {
  if (server) await stopOwnedWebSessionHostChild(server)
})

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`real evidence comparison handles capacity, selection and failed reads: ${locale}`, async ({ page }, info) => {
    const copy = visualUpgradeReportCopy(locale)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${origin}/visual-report.html?locale=${locale}&theme=dark`)
    await expect(page.getByRole('heading', { name: copy.title, exact: true })).toBeVisible()
    await expect(page.locator('.visual-report-image')).toHaveCount(2)
    for (const width of [1440, 768, 320]) {
      await page.setViewportSize({ width, height: 960 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
      await selectLumenOption(page.getByRole('combobox', { name: copy.family, exact: true }), 'session-monitoring')
      await expect(page.locator('.visual-report-image')).toHaveCount(2)
      await expect
        .poll(() =>
          page
            .locator('.visual-report-image')
            .evaluateAll((images) =>
              images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0),
            ),
        )
        .toBe(true)
      await selectLumenOption(page.getByRole('combobox', { name: copy.width, exact: true }), '320')
      await expect(page.locator('.visual-report-image').first()).toHaveAttribute(
        'src',
        /-320\/session-monitoring\.png$/,
      )
      await selectLumenOption(page.getByRole('combobox', { name: copy.family, exact: true }), 'conversation')
      await selectLumenOption(page.getByRole('combobox', { name: copy.width, exact: true }), '1920')
      await selectLumenOption(page.getByRole('combobox', { name: copy.family, exact: true }), 'settings-appearance')
      await expect(page.getByRole('combobox', { name: copy.width, exact: true })).toContainText('1440')
      await page.screenshot({ path: info.outputPath(`comparison-${locale}-${width}.png`), fullPage: true })
    }
    await page.route('**/visual-upgrade/index.json', (route) => route.fulfill({ status: 503, body: '{}' }))
    await page.reload()
    await expect(page.getByRole('alert')).toHaveText(copy.failed)
    await page.unroute('**/visual-upgrade/index.json')
    await page.getByRole('button', { name: copy.retry, exact: true }).click()
    await expect(page.locator('.visual-report-image')).toHaveCount(2)
    expect(errors).toEqual([])
  })
}
