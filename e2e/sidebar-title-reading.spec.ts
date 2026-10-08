import { expect, test, type Locator } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { completeLine } from './support/single-line-layout'
import { removeOwnedTempDirectory } from './support/owned-temp-directory'

async function wrappingTitle(locator: Locator) {
  expect(await locator.count()).toBeGreaterThan(0)
  for (const title of await locator.all()) {
    expect(await title.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('normal')
    expect(await title.evaluate((node) => getComputedStyle(node).textOverflow)).not.toBe('ellipsis')
    expect(await title.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  }
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`complete session and navigation labels stay within owned panes ${locale}`, async ({ browser }, info) => {
    test.setTimeout(90_000)
    const root = await realpath(await mkdtemp(join(tmpdir(), 'hbar-single-line-navigation-')))
    const context = await browser.newContext({ locale, colorScheme: 'dark', viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const title =
        locale === 'zh-CN'
          ? '用于验证完整会话名称与自然换行'.repeat(6)
          : 'Complete session title with natural line wrapping '.repeat(2)
      await createWorkspaceSessionCommandClient(host.client).execute('session.rename', {
        sessionId: host.ready.sessionId,
        title,
      })
      const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(origin)
      const project = page.getByRole('treeitem', { name: host.ready.workspaceName, exact: true })
      await project.focus()
      if ((await project.getAttribute('aria-expanded')) === 'false') await project.press('ArrowRight')
      const session = page.getByRole('treeitem', { name: title, exact: true })
      await session.click()
      await expect(page.getByRole('tab', { name: title, exact: true })).toBeVisible()
      await wrappingTitle(page.locator('.hbar-workspace-tab-title'))
      const navigation = page
        .locator('.hbar-app-react-project-tree .hbar-app-react-session-label .hbar-sidebar-title')
        .first()
      await expect(navigation).toHaveText(title)
      await wrappingTitle(navigation)
      await completeLine(page.locator('.hbar-web-feature-navigation > button'))
      const pane = page.locator('.lumen-app-sidebar-content')
      await session.focus()
      await expect(session).toHaveAttribute('aria-selected', 'true')
      expect(await pane.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
      for (const width of [1440, 1100, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        const tabsVisible = await page.locator('.hbar-workspace-tab-title').first().isVisible()
        if (tabsVisible) await wrappingTitle(page.locator('.hbar-workspace-tab-title'))
        const mobileTitle = page.locator('.hbar-app-react-shell-header-active-title')
        const mobileVisible = await mobileTitle.isVisible()
        expect(tabsVisible || mobileVisible).toBe(true)
        if (mobileVisible) {
          await expect(mobileTitle).toHaveText(title)
          const styles = await mobileTitle.evaluate((node) => ({
            whiteSpace: getComputedStyle(node).whiteSpace,
            textOverflow: getComputedStyle(node).textOverflow,
            scrollable: node.scrollWidth > node.clientWidth,
            overflow: getComputedStyle(node).overflowX,
          }))
          expect(styles).toMatchObject({ whiteSpace: 'normal', scrollable: false })
          expect(styles.textOverflow).not.toBe('ellipsis')
        }
        const copy = getShellCopy(locale)
        const reveal = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
        if (width < 768 && (await reveal.isVisible())) {
          await reveal.click()
          await wrappingTitle(navigation)
          await completeLine(page.locator('.hbar-web-feature-navigation > button'))
          await page.getByRole('button', { name: copy.shell.hideSidebar, exact: true }).click()
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: info.outputPath(`navigation-${width}.png`) })
      }
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedTempDirectory(root, 'hbar-single-line-navigation-')
    }
  })
}
