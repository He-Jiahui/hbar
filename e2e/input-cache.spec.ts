import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { z } from 'zod'
import { inputCacheCopy } from '../apps/web/src/input-cache-copy'

let bundle: { code: string; css: string } | undefined
async function mount(page: Page) {
  const executable =
    process.platform === 'win32'
      ? (process.env.PATH ?? '')
          .split(delimiter)
          .flatMap((directory) => [join(directory, 'bun.exe'), join(directory, 'node_modules/bun/bin/bun.exe')])
          .find(existsSync)
      : 'bun'
  if (!executable) throw new Error('Bun is unavailable for the cache fixture')
  bundle ??= z.object({ code: z.string().min(1), css: z.string().min(1) }).parse(
    JSON.parse(
      execFileSync(executable, ['tests/fixtures/build-input-cache.ts'], {
        encoding: 'utf8',
        timeout: 60_000,
        maxBuffer: 16 * 1024 * 1024,
      }),
    ),
  )
  await page.setContent('<html><head></head><body><div id="fixture-root"></div></body></html>')
  await page.addStyleTag({ content: `${bundle.css}\n*{box-sizing:border-box}body{margin:0;font:14px system-ui}` })
  await page.addScriptTag({ content: bundle.code })
  await expect(page.locator('.hbar-input-cache')).toBeVisible()
}

test('cache metrics retain actual values, keyboard inspection and current report ownership', async ({ page }) => {
  await mount(page)
  const labels = inputCacheCopy('zh-CN')
  await expect(page.getByRole('status')).toHaveText(labels.status.healthy)
  await expect(page.locator('dd').first()).toHaveText(labels.percent(0.9075))
  await page.locator('[data-cache-bucket]').first().focus()
  await expect(page.locator('[aria-live="polite"]')).toHaveText(labels.bucket(0, 60_000, 0, 100_000, 0))
  await page.evaluate(() =>
    window.hbarInputCacheFixture.render({ locale: 'zh-CN', mode: 'light', count: 12, lastRate: 0.89 }),
  )
  await expect(page.getByRole('status')).toHaveText(labels.status['below-minimum'])
  await expect(page.locator('[aria-live="polite"]')).toHaveText(labels.window(0, 720_000))
  for (const count of [0, 1, 120, 121, 500]) {
    await page.evaluate(
      (count) => window.hbarInputCacheFixture.render({ locale: 'zh-CN', mode: 'light', count }),
      count,
    )
    await expect
      .poll(() => page.locator('[data-cache-bucket]').count())
      .toBe(Math.ceil(count / Math.max(1, Math.ceil(count / 120))))
  }
  await page.evaluate(() => window.hbarInputCacheFixture.render({ locale: 'zh-CN', mode: 'light', count: 0 }))
  await expect(page.getByText(labels.empty, { exact: true })).toBeVisible()
  await expect(page.locator('svg')).toHaveCount(0)
})

test('cache visualization remains readable across locale, theme and narrow panes', async ({ page }, testInfo) => {
  await mount(page)
  for (const locale of ['zh-CN', 'en-US'] as const)
    for (const mode of ['light', 'dark'] as const)
      for (const width of [320, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await page.evaluate((options) => window.hbarInputCacheFixture.render(options), {
          locale,
          mode,
          count: 12,
          longLabels: width === 320,
        })
        await expect(page.getByRole('status')).toHaveText(inputCacheCopy(locale).status.healthy)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        const chart = page.locator('.hbar-input-cache-chart')
        await expect(chart).toBeVisible()
        await expect(page.locator('.hbar-input-cache-target')).toHaveAttribute('d', 'M0 7H320')
        await page.screenshot({ path: testInfo.outputPath(`cache-${locale}-${mode}-${width}.png`), fullPage: true })
      }
})
