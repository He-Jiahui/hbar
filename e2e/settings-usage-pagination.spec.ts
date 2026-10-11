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

test('localized pagination keeps complete labels in its own scroll row across theme, width and text scale', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000)
  await mount(page)
  const english = getShellCopy('en-US').settingsUsage
  await page.getByRole('navigation').getByRole('button', { name: english.next, exact: true }).click()
  for (const locale of ['zh-CN', 'en-US'] as const) {
    const labels = getShellCopy(locale).settingsUsage
    for (const mode of ['light', 'dark'] as const) {
      await page.evaluate(({ locale, mode }) => window.hbarUsagePaginationFixture.render(locale, true, mode), {
        locale,
        mode,
      })
      for (const width of [320, 390, 900, 1440]) {
        for (const scale of [100, 125]) {
          await page.setViewportSize({ width, height: 700 })
          await page.evaluate((value) => {
            document.documentElement.style.fontSize = `${value}%`
          }, scale)
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
          await page.screenshot({ path: testInfo.outputPath(`pagination-${locale}-${mode}-${width}-${scale}.png`) })
          const reading = await next.evaluate((element) => {
            const label = element.querySelector<HTMLElement>('[data-text-context="control.label"]')
            if (!label || !element.parentElement) throw new Error('Missing real pagination label or owner')
            const range = document.createRange()
            range.selectNodeContents(label)
            return {
              labelWidth: label.getBoundingClientRect().width,
              textWidth: range.getBoundingClientRect().width,
              whiteSpace: getComputedStyle(label).whiteSpace,
              ownerWidth: element.parentElement.clientWidth,
              ownerContent: element.parentElement.scrollWidth,
              ownerOverflow: getComputedStyle(element.parentElement).overflowX,
            }
          })
          expect(reading.labelWidth).toBeGreaterThanOrEqual(reading.textWidth - 1)
          expect(reading.whiteSpace).toBe('nowrap')
          expect(reading.ownerContent).toBeGreaterThan(reading.ownerWidth)
          expect(reading.ownerOverflow).toBe('auto')
          await expect(pager.getByRole('status')).toBeInViewport()
          const actions = pager.getByRole('group', { name: labels.models, exact: true })
          await actions.evaluate((element) => {
            element.scrollLeft = 0
          })
          await actions.focus()
          await expect(actions).toBeFocused()
          await page.keyboard.press('ArrowRight')
          await expect.poll(() => actions.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
          await next.focus()
          await expect(next).toBeFocused()
        }
      }
    }
  }
  const labels = getShellCopy('en-US').settingsUsage
  const pager = page.getByRole('navigation', { name: labels.models })
  await pager.getByRole('button', { name: labels.next.repeat(20), exact: true }).press('Enter')
  await expect(pager.getByRole('status')).toHaveText(labels.page(17, 17, 17))
  await expect(pager.getByRole('button', { name: labels.next.repeat(20), exact: true })).toBeDisabled()
  await pager.getByRole('button', { name: labels.previous.repeat(20), exact: true }).press('Enter')
  await expect(pager.getByRole('status')).toHaveText(labels.page(9, 16, 17))
})
