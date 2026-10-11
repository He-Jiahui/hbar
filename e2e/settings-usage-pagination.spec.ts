import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'

let bundle: { code: string; css: string } | undefined
async function mount(page: Page) {
  const executable =
    process.platform === 'win32'
      ? (process.env.PATH ?? '')
          .split(delimiter)
          .flatMap((directory) => [join(directory, 'bun.exe'), join(directory, 'node_modules/bun/bin/bun.exe')])
          .find(existsSync)
      : 'bun'
  if (!executable) throw new Error('Bun is unavailable for the settings usage fixture')
  bundle ??= z.object({ code: z.string().min(1), css: z.string().min(1) }).parse(
    JSON.parse(
      execFileSync(executable, ['tests/fixtures/build-settings-usage-pagination.ts'], {
        encoding: 'utf8',
        timeout: 60_000,
        maxBuffer: 16 * 1024 * 1024,
      }),
    ),
  )
  await page.setContent('<html data-lumen-mode="light"><head></head><body><div id="fixture-root"></div></body></html>')
  await page.addStyleTag({ content: `${bundle.css}\n*{box-sizing:border-box}body{margin:0;font:14px system-ui}` })
  await page.addScriptTag({ content: bundle.code })
  await expect(page.locator('.hbar-settings-usage-model-row:visible')).toHaveCount(8)
}

test('model pagination binds visible records and keyboard actions to the current report without new Host queries', async ({
  page,
}) => {
  await mount(page)
  const labels = getShellCopy('en-US').settingsUsage
  const rows = page.locator('.hbar-settings-usage-model-row:visible')
  const pager = page.getByRole('navigation', { name: labels.models })
  const previous = pager.getByRole('button', { name: labels.previous, exact: true })
  const next = pager.getByRole('button', { name: labels.next, exact: true })
  const requests = await page.evaluate(() => window.hbarUsagePaginationFixture.requests())
  await expect(previous).toBeDisabled()
  await expect(pager.getByRole('status')).toHaveText(labels.page(1, 8, 17))
  await next.focus()
  await page.keyboard.press('Enter')
  await expect(rows.first()).toContainText(labels.model('provider', 'model-8'))
  await expect(pager.getByRole('status')).toHaveText(labels.page(9, 16, 17))
  await page.keyboard.press('Enter')
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText(labels.model('provider', 'model-16'))
  await expect(next).toBeDisabled()
  await expect(pager.getByRole('status')).toHaveText(labels.page(17, 17, 17))
  await previous.click()
  await expect(rows).toHaveCount(8)
  expect(await page.evaluate(() => window.hbarUsagePaginationFixture.requests())).toBe(requests)
  await page.evaluate(() => window.hbarUsagePaginationFixture.replace(9))
  await expect(rows.first()).toContainText(labels.model('provider', 'model-0'))
  await expect(pager.getByRole('status')).toHaveText(labels.page(1, 8, 9))
  await next.click()
  await expect(rows.first()).toContainText(labels.model('provider', 'model-8'))
  await page.evaluate(() => window.hbarUsagePaginationFixture.replace(1))
  await expect(rows).toHaveCount(1)
  await expect(rows.first()).toContainText(labels.model('provider', 'model-0'))
  await expect(pager).toHaveCount(0)
  await page.evaluate(() => window.hbarUsagePaginationFixture.replace(0))
  await expect(rows).toHaveCount(0)
  await expect(page.getByText(labels.noModels, { exact: true })).toBeVisible()
})

test('localized pagination stays reachable at 320px with long host labels and keeps the selected page', async ({
  page,
}, testInfo) => {
  await mount(page)
  const english = getShellCopy('en-US').settingsUsage
  await page.getByRole('navigation').getByRole('button', { name: english.next, exact: true }).click()
  for (const locale of ['zh-CN', 'en-US'] as const) {
    const labels = getShellCopy(locale).settingsUsage
    await page.evaluate((value) => window.hbarUsagePaginationFixture.render(value, true), locale)
    await page.setViewportSize({ width: 320, height: 700 })
    const pager = page.getByRole('navigation', { name: labels.models })
    await expect(pager.getByRole('status')).toHaveText(labels.page(9, 16, 17))
    const next = pager.getByRole('button', { name: labels.next.repeat(20), exact: true })
    await next.scrollIntoViewIfNeeded()
    const geometry = await page.evaluate(() => ({
      width: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll<HTMLElement>('*')]
        .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 20)
        .map((element) => ({
          tag: element.tagName,
          className: element.className,
          width: element.getBoundingClientRect().width,
          minimum: getComputedStyle(element).minInlineSize,
          overflow: getComputedStyle(element).overflowX,
          whiteSpace: getComputedStyle(element).whiteSpace,
        })),
    }))
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), {
        message: JSON.stringify(geometry),
      })
      .toBe(true)
    await next.focus()
    await expect(next).toBeFocused()
    await page.screenshot({ path: testInfo.outputPath(`pagination-${locale}-320.png`) })
  }
})
