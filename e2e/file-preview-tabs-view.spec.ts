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
  if (!executable) throw new Error('Bun is unavailable for the preview fixture build')
  bundle ??= z.object({ code: z.string().min(1), css: z.string().min(1) }).parse(
    JSON.parse(
      execFileSync(executable, ['tests/fixtures/build-file-preview-tabs.ts'], {
        encoding: 'utf8',
        timeout: 60_000,
        maxBuffer: 12 * 1024 * 1024,
      }),
    ),
  )
  await page.setContent('<html data-lumen-mode="light"><head></head><body><div id="fixture-root"></div></body></html>')
  await page.addStyleTag({
    content: `${bundle.css}\n*{box-sizing:border-box}body{margin:0;font-family:system-ui}main{min-inline-size:0}section{display:flex;gap:.5rem;padding:.5rem;flex-wrap:wrap}output{display:block;overflow-wrap:anywhere}`,
  })
  await page.addScriptTag({ content: bundle.code })
}
test('bounded host data scrolls at 32 and 33 entries without clipping translated labels or the root viewport', async ({
  page,
}, info) => {
  await mount(page)
  for (const count of [0, 1, 4, 32, 33]) {
    await page.getByRole('button', { name: `${count} previews`, exact: true }).click()
    await expect(page.getByRole('tab')).toHaveCount(count)
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    const tabs = page.getByRole('tab')
    await tabs.first().focus()
    await page.keyboard.press('Home')
    await page.keyboard.press('End')
    await expect(tabs.last()).toBeFocused()
    await expect(tabs.last()).toHaveAttribute('aria-selected', 'true')
    const strip = page.getByRole('tablist')
    expect(await strip.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    await expect
      .poll(() =>
        tabs.last().evaluate((element) => {
          const item = element.parentElement
          const rail = element.closest('[role=tablist]')
          const close = item?.querySelector('.hbar-file-preview-close')
          if (!item || !rail || !close) return false
          const rect = item.getBoundingClientRect()
          const action = close.getBoundingClientRect()
          const bounds = rail.getBoundingClientRect()
          return (
            rect.right > bounds.left &&
            rect.left < bounds.right &&
            action.left >= bounds.left - 1 &&
            action.right <= bounds.right + 1
          )
        }),
      )
      .toBe(true)
    const before = await strip.evaluate((element) => element.scrollLeft)
    await strip.evaluate((element) => {
      element.scrollLeft = 0
    })
    await expect.poll(() => strip.evaluate((element) => element.scrollLeft)).toBeLessThan(before)
    await expect(tabs.last()).toHaveAttribute('aria-selected', 'true')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
    await page.screenshot({ path: info.outputPath(`preview-tabs-overflow-${width}.png`) })
  }
})
test('keyboard menu captures UUID scopes through a same-path replacement; stale and duplicate selections remain explicit', async ({
  page,
}, info) => {
  await mount(page)
  await page.getByRole('button', { name: 'Duplicate ID', exact: true }).click()
  await expect(page.getByRole('tab')).toHaveCount(4)
  await page.getByRole('button', { name: 'Missing active', exact: true }).click()
  await expect(page.getByRole('tab', { selected: true })).toHaveCount(0)
  const tabs = page.getByRole('tab')
  await tabs.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(tabs.nth(1)).toBeFocused()
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Shift+F10')
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await page.keyboard.press('End')
  await expect(menu.getByRole('menuitem').last()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(tabs.nth(1)).toBeFocused()
  await page.keyboard.press('Shift+F10')
  await page.keyboard.press('Control+Shift+R')
  await expect(page.getByLabel('Fixture identities')).toContainText('reopened-0')
  await page.screenshot({ path: info.outputPath('preview-captured-menu-zh.png') })
  await menu.getByRole('menuitem', { name: getShellCopy('zh-CN').files.previews.action('left'), exact: true }).click()
  await expect(page.getByLabel('Fixture event')).toHaveText('["preview-0"]')
  await expect(page.getByRole('tab')).toHaveCount(4)
  await expect(page.getByLabel('Fixture identities')).toContainText('reopened-0')
  await page.getByRole('button', { name: 'Locale', exact: true }).click()
  await expect(page.getByRole('tablist')).toHaveAccessibleName(getShellCopy('en-US').files.previews.tabs)
  await tabs.last().focus()
  await page.keyboard.press('Delete')
  await expect(page.getByLabel('Fixture event')).toHaveText('["preview-3"]')
})
