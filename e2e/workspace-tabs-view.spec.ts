import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { z } from 'zod'
import { workspaceTabsCopy } from '../apps/web/src/workspace-tabs-copy'

let bundle: { code: string; css: string } | undefined
async function mount(page: Page) {
  const executable =
    process.platform === 'win32'
      ? (process.env.PATH ?? '')
          .split(delimiter)
          .flatMap((directory) => [join(directory, 'bun.exe'), join(directory, 'node_modules/bun/bin/bun.exe')])
          .find(existsSync)
      : 'bun'
  if (!executable) throw new Error('Bun is unavailable for the tabs fixture build')
  bundle ??= z.object({ code: z.string().min(1), css: z.string().min(1) }).parse(
    JSON.parse(
      execFileSync(executable, ['tests/fixtures/build-workspace-tabs.ts'], {
        encoding: 'utf8',
        timeout: 60_000,
        maxBuffer: 12 * 1024 * 1024,
      }),
    ),
  )
  await page.setContent('<html data-lumen-mode="light"><head></head><body><div id="fixture-root"></div></body></html>')
  await page.addStyleTag({
    content: `${bundle.css}\n*{box-sizing:border-box}body{margin:0;font-family:system-ui;background:var(--lumen-contrast)}main{min-inline-size:0}section{display:flex;flex-direction:column;gap:1rem;padding:1rem}output{overflow-wrap:anywhere}`,
  })
  await page.addScriptTag({ content: bundle.code })
}
const copy = workspaceTabsCopy((zh) => zh)
test('workspace tabs expose native selection, anchored original-item menus, scoped close and keyboard/drag reordering', async ({
  page,
}, testInfo) => {
  await mount(page)
  const tabs = page.getByRole('tab')
  await expect(tabs).toHaveCount(4)
  await tabs.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('End')
  await expect(tabs.last()).toBeFocused()
  await page.keyboard.press('Home')
  await expect(tabs.first()).toBeFocused()
  await page.keyboard.press('Alt+Shift+ArrowRight')
  await expect(page.getByLabel('Fixture order')).toHaveText('tab-1,tab-0,tab-2,tab-3')
  await page.getByRole('tab', { name: '执行中的会话 — Running conversation', exact: true }).click({ button: 'right' })
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('tabs-menu.png') })
  await menu.getByRole('menuitem', { name: copy.tabs.action('right'), exact: true }).click()
  await expect(page.getByLabel('Fixture event')).toHaveText(
    JSON.stringify({ action: 'close', id: 'tab-1', scope: 'right' }),
  )
  await page.getByRole('tab', { name: '工作台来源 — Workbench source', exact: true }).focus()
  await page.keyboard.press('Shift+F10')
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tab', { name: '工作台来源 — Workbench source', exact: true })).toBeFocused()
  await page.keyboard.press('Delete')
  await expect(page.getByLabel('Fixture event')).toHaveText(
    JSON.stringify({ action: 'close', id: 'tab-2', scope: 'one' }),
  )
  await tabs.first().dragTo(tabs.last(), { targetPosition: { x: 10, y: 15 } })
  await expect(page.getByLabel('Fixture order')).toHaveText('tab-0,tab-2,tab-1,tab-3')
  await page.getByRole('tab', { name: '执行中的会话 — Running conversation', exact: true }).click({ button: 'right' })
  await page.getByRole('button', { name: 'Remove original target', exact: true }).click()
  await expect(page.getByRole('tab', { name: '执行中的会话 — Running conversation', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Toggle busy', exact: true }).click()
  await expect(tabs.first()).toBeDisabled()
})
test('workspace tabs keep the active tab and close action visible while respecting manual overflow scrolling at 320px', async ({
  page,
}, testInfo) => {
  await mount(page)
  await page.getByRole('button', { name: '32 tabs', exact: true }).click()
  await expect(page.getByRole('tab')).toHaveCount(32)
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.getByRole('button', { name: 'Select last', exact: true }).click()
    const active = page.getByRole('tab', { selected: true })
    await expect(active).toHaveText('32 — 长名称会话与状态不会丢失')
    const strip = page.getByRole('tablist')
    await expect
      .poll(() =>
        active.evaluate((el) => {
          const item = el.parentElement
          const rail = el.closest('[role=tablist]')
          const close = item?.querySelector('.hbar-workspace-tab-close')
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
    await page.screenshot({ path: testInfo.outputPath(`tabs-overflow-${width}.png`) })
    const before = await strip.evaluate((el) => el.scrollLeft)
    await page.getByRole('button', { name: copy.tabs.scrollLeft, exact: true }).click()
    await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeLessThan(before - 10)
    await expect(page.getByRole('tab', { selected: true })).toHaveText('32 — 长名称会话与状态不会丢失')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
    const firstClose = page.getByRole('button', { name: copy.tabs.close('1 — 长名称会话与状态不会丢失'), exact: true })
    await firstClose.focus()
    await expect
      .poll(() =>
        firstClose.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          const bounds = element.closest('[role=tablist]')!.getBoundingClientRect()
          return rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1
        }),
      )
      .toBe(true)
    await expect(page.getByRole('tab', { selected: true })).toHaveText('32 — 长名称会话与状态不会丢失')
    // A true selection change, not a repeated callback with the same active ID, reclaims reveal ownership.
    await page.getByRole('tab').first().focus()
    await page.keyboard.press('Home')
  }
})
test('controlled close dialog uses a three-way choice and never offers stop replay while outcome is unknown', async ({
  page,
}, testInfo) => {
  await mount(page)
  await page.getByRole('button', { name: 'choice', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: copy.close.keepRunning, exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: copy.close.stopAndClose, exact: true }).click()
  await expect(dialog.getByRole('status')).toHaveText(copy.close.status('stopping'))
  await expect(dialog.getByRole('button', { name: copy.close.stopAndClose, exact: true })).toHaveCount(0)
  await page.reload()
  await mount(page)
  await page.setViewportSize({ width: 320, height: 900 })
  await page.getByRole('button', { name: 'unknown', exact: true }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: copy.close.recheck, exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: copy.close.stopAndClose, exact: true })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('tabs-close-unknown-320.png') })
  await dialog.getByRole('button', { name: copy.close.recheck, exact: true }).click()
  await expect(dialog.getByRole('status')).toHaveText(copy.close.status('checking'))
  await page.reload()
  await mount(page)
  await page.getByRole('button', { name: 'Locale', exact: true }).click()
  const english = workspaceTabsCopy((_zh, en) => en)
  await page.getByRole('button', { name: 'choice', exact: true }).click()
  dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('button', { name: english.close.keepRunning, exact: true })).toBeVisible()
  expect(
    await dialog.locator('.lumen-dialog-body').evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('tabs-close-choice-en-320.png') })
  await dialog.getByRole('button', { name: english.close.keepRunning, exact: true }).click()
  await expect(page.getByLabel('Fixture event')).toHaveText('keep')
  await expect(dialog).not.toBeVisible()
})
