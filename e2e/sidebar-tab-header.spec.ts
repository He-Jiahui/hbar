import { expect, test, type Page } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { workspaceTabsCopy } from '../apps/web/src/workspace-tabs-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function removeFixture(root: string): Promise<void> {
  const exact = await realpath(root)
  if (dirname(exact) !== (await realpath(tmpdir())) || !basename(exact).startsWith('hbar-sidebar-tab-header-'))
    throw new Error('Refusing cleanup outside the owned sidebar header fixture')
  await rm(exact, { recursive: true, force: true })
}

async function expectInlineHeader(page: Page, locale: ShellLocale): Promise<void> {
  const bar = page.locator('.hbar-workspace-tabs-bar')
  const reveal = bar.getByRole('button', { name: getShellCopy(locale).shell.showSidebar, exact: true })
  await expect(reveal).toBeVisible()
  await expect(page.locator('.hbar-app-react-shell-header, .lumen-desktop-shell-header')).toHaveCount(0)
  const barBox = await bar.boundingBox()
  const revealBox = await reveal.boundingBox()
  const stripBox = await bar.getByRole('tablist').boundingBox()
  if (!barBox || !revealBox || !stripBox) throw new Error('Tab header regions must be measurable')
  expect(revealBox.x + revealBox.width).toBeLessThanOrEqual(stripBox.x + 1)
  expect(revealBox.y).toBeGreaterThanOrEqual(barBox.y)
  expect(revealBox.y + revealBox.height).toBeLessThanOrEqual(barBox.y + barBox.height + 1)
  const contentBox = await page.locator('.hbar-workspace-tabs-content').boundingBox()
  if (!contentBox) throw new Error('The core content must remain measurable')
  expect(contentBox.y).toBeCloseTo(barBox.y + barBox.height + 1, 0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`collapsed sidebar reveal shares the tab row and preserves content, focus and drafts: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-sidebar-tab-header-'))
    const context = await browser.newContext({ locale, viewport: { width: 783, height: 900 }, colorScheme: 'dark' })
    const copy = getShellCopy(locale)
    const tabsCopy = workspaceTabsCopy((zh, en) => (locale === 'zh-CN' ? zh : en))
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        sessionCount: 2,
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const commands = createWorkspaceSessionCommandClient(host.client)
      const title =
        locale === 'zh-CN'
          ? '原会话：Rust/WASM 完整制作与验收——足够长的页签不能遮住展开侧栏按钮'
          : 'Original Rust/WASM verification — a long tab must keep sidebar reveal reachable'
      await commands.execute('session.rename', { sessionId: host.ready.sessionId, title })
      const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      page.setDefaultTimeout(10_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(origin)
      const original = page.getByRole('treeitem', { name: title, exact: true })
      if (!(await original.isVisible()))
        await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
      await original.click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = '原会话的未发送草稿 — keep the original draft'
      await prompt.fill(draft)
      await page.screenshot({ path: info.outputPath('collapsed-783.png') })
      await writeFile(
        info.outputPath('collapsed-783-geometry.json'),
        JSON.stringify(
          await page.evaluate(() =>
            ['.hbar-app-react-shell-header', '.hbar-workspace-tabs-bar', '.hbar-workspace-tabs-content'].map(
              (selector) => {
                const element = document.querySelector(selector)
                const rect = element?.getBoundingClientRect()
                return { selector, present: Boolean(element), y: rect?.y, height: rect?.height }
              },
            ),
          ),
          null,
          2,
        ),
      )
      await expectInlineHeader(page, locale)
      for (const width of [900, 783]) {
        await page.setViewportSize({ width, height: 900 })
        await expectInlineHeader(page, locale)
        const reveal = page.locator('.hbar-workspace-tabs-bar').getByRole('button', {
          name: copy.shell.showSidebar,
          exact: true,
        })
        await reveal.focus()
        await page.keyboard.press('Enter')
        const hide = page.getByRole('button', { name: copy.shell.hideSidebar, exact: true })
        await expect(hide).toBeFocused()
        await page.keyboard.press('Enter')
        await expect(reveal).toBeFocused()
        await expectComposerText(prompt, draft)
      }
      await page.setViewportSize({ width: 1440, height: 900 })
      const rail = page.locator('.hbar-app-react-sidebar-rail')
      await expect(rail.getByRole('button', { name: copy.shell.showSidebar, exact: true })).toBeVisible()
      await expect(page.locator('[data-hbar-sidebar-reveal="tabs"]')).toHaveCount(0)
      await expect(page.locator('.hbar-app-react-shell-header, .lumen-desktop-shell-header')).toHaveCount(0)
      await page.screenshot({ path: info.outputPath('collapsed-rail-1440.png') })
      await page.setViewportSize({ width: 783, height: 900 })
      await page.getByRole('button', { name: tabsCopy.tabs.close(title), exact: true }).click()
      await expect(page.getByRole('tab')).toHaveCount(0)
      const emptyReveal = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      await expect(emptyReveal).toBeVisible()
      await expect(page.locator('.hbar-workspace-tabs-bar').getByRole('button')).toHaveCount(1)
      await emptyReveal.click()
      await original.click()
      await expectComposerText(prompt, draft)
      await expectInlineHeader(page, locale)
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 })
        await expect(page.locator('.hbar-app-react-shell-header')).toBeVisible()
        await expect(page.locator('[data-hbar-sidebar-reveal="tabs"]')).toHaveCount(0)
        await expect(page.locator('.hbar-mobile-header-menu-trigger')).toBeVisible()
        await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
        await page.getByRole('button', { name: copy.shell.hideSidebar, exact: true }).click()
        await expectComposerText(prompt, draft)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: info.outputPath(`compact-${width}.png`) })
      }
      expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeFixture(root)
    }
  })
}
