import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { chatSearchCopy } from '../apps/web/src/chat-search-copy'
import { globalFeatureCopy } from '../apps/web/src/global-feature-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function removeFixture(root: string, prefix: string): Promise<void> {
  const exact = resolve(root)
  if (dirname(exact) !== resolve(tmpdir()) || !basename(exact).startsWith(prefix))
    throw new Error('Refusing to remove an unowned sidebar fixture')
  await rm(exact, { recursive: true, force: true })
}

test('collapsed desktop rail keeps real navigation direct and narrow screens retain the drawer', async ({
  browser,
}, info) => {
  test.setTimeout(60_000)
  const prefix = 'hbar-sidebar-rail-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } })
  const copy = getShellCopy('zh-CN')
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(base)
    const originalSession = page
      .getByRole('treeitem', { name: host.ready.sessionTitle, exact: true })
      .and(page.locator(`[data-tree-node-id="session:${host.ready.sessionId}"]`))
    await originalSession.click()
    const composer = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    const draft = '折叠导航后仍能直接找功能，并保留原会话输入。'
    await composer.fill(draft)
    await page.getByRole('button', { name: copy.shell.hideSidebar, exact: true }).click()
    const rail = page.locator('.hbar-app-react-sidebar-rail')
    await expect(rail).toBeVisible()
    await expect(rail.getByRole('button', { name: copy.shell.showSidebar, exact: true })).toBeFocused()
    await expect(page.getByRole('separator', { name: copy.sidebarLayout.resize, exact: true })).toHaveCount(0)
    await expect
      .poll(async () => {
        const railBounds = await rail.boundingBox()
        const mainBounds = await page.locator('.lumen-app-frame').boundingBox()
        return railBounds && mainBounds ? mainBounds.x - railBounds.x - railBounds.width : Number.NEGATIVE_INFINITY
      })
      .toBeGreaterThanOrEqual(-1)
    await page.screenshot({ path: info.outputPath('collapsed-rail-1440.png') })

    // Existing real entrances remain in the same rail; no preliminary Show.
    const settings = rail.getByRole('button', { name: copy.shell.settings, exact: true })
    await settings.focus()
    await page.keyboard.press('Enter')
    await expect(settings).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
    await expect(settings).toBeFocused()
    await expectComposerText(composer, draft)
    await expect(rail.getByRole('button', { name: copy.shell.extensionsAndSkills, exact: true })).toHaveCount(0)

    const search = rail.getByRole('button', { name: copy.shell.searchChats, exact: true })
    await search.click()
    const searchCopy = chatSearchCopy('zh-CN')
    const searchDialog = page.getByRole('dialog', { name: searchCopy.search, exact: true })
    await expect(searchDialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(searchDialog).toHaveCount(0)
    await expect(search).toBeFocused()
    await expectComposerText(composer, draft)
    await rail.getByRole('button', { name: globalFeatureCopy('zh-CN').navigation, exact: true }).click()
    await page.getByRole('menuitem', { name: copy.shell.status, exact: true }).click()
    await expect(page.getByRole('heading', { name: copy.status.title, exact: true })).toBeVisible()
    await page.getByRole('button', { name: copy.status.close, exact: true }).click()
    await expectComposerText(composer, draft)

    await rail.getByRole('button', { name: copy.shell.newSession, exact: true }).click()
    const projectPicker = page.getByRole('dialog', { name: copy.shell.chooseWorkspace, exact: true })
    await expect(projectPicker).toBeVisible()
    await projectPicker
      .getByRole('button', { name: copy.shell.createSessionInWorkspace(host.ready.workspaceName), exact: true })
      .click()
    await expect(page.getByRole('tab')).toHaveCount(2)
    await expectComposerText(composer, '')
    await rail.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
    await expect(rail).toHaveCount(0)
    await originalSession.click()
    await expectComposerText(composer, draft)
    await expect(page.getByRole('separator', { name: copy.sidebarLayout.resize, exact: true })).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.locator('[data-hbar-sidebar-expanded]')).toHaveAttribute('data-hbar-sidebar-expanded', 'false')
    await expect(rail).toHaveCount(0)
    await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
    await expect(page.getByRole('button', { name: copy.shell.hideSidebar, exact: true })).toBeVisible()
    await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
    await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
    await expectComposerText(composer, draft)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: info.outputPath('drawer-return-390.png') })
    expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)
    expect(errors).toEqual([])
  } finally {
    try {
      await context.close()
    } finally {
      try {
        if (host) await stopWebSessionHost(host)
      } finally {
        await removeFixture(root, prefix)
      }
    }
  }
})
