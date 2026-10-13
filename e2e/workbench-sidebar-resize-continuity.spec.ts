import { expect, test, type Browser } from '@playwright/test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { openSessionTool } from './support/session-tools-menu'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
const hostPort = Number(process.env.HBAR_E2E_HOST_PORT ?? 4317)
const fixturePrefix = 'hbar-sidebar-resize-continuity-'

async function removeFixture(root: string): Promise<void> {
  const target = await realpath(root)
  if (dirname(target) !== (await realpath(tmpdir())) || !basename(target).startsWith(fixturePrefix))
    throw new Error('Refusing to remove data outside the owned sidebar resize fixture')
  await rm(target, { recursive: true, force: true })
}

async function startFixture(browser: Browser, locale: ShellLocale) {
  const root = await mkdtemp(join(tmpdir(), fixturePrefix))
  const context = await browser.newContext({ locale, viewport: { width: 900, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: hostPort, sessionCount: 1 })
    const response = await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })
    expect(response.ok()).toBe(true)
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.goto(origin)
    return { context, host, page, pageErrors, copy: getShellCopy(locale), root }
  } catch (error) {
    await context.close()
    if (host) {
      const captured = host
      await stopWebSessionHost(captured)
      await expect.poll(() => captured.child.exitCode !== null || captured.child.signalCode !== null).toBe(true)
    }
    await removeFixture(root)
    throw error
  }
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`saving a tool pane width preserves the user's closed sidebar: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const fixture = await startFixture(browser, locale)
    const { context, host, page, pageErrors, copy } = fixture
    try {
      const sidebarState = page.locator('[data-hbar-sidebar-expanded]')
      const session = page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true })
      const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      await expect.poll(async () => (await session.isVisible()) || (await showSidebar.isVisible())).toBe(true)
      if (await showSidebar.isVisible()) await showSidebar.click()
      await expect(session).toBeVisible()
      await session.click()
      if (await showSidebar.isVisible()) await showSidebar.click()
      await expect(sidebarState).toHaveAttribute('data-hbar-sidebar-expanded', 'true')

      const hideSidebar = page.getByRole('button', { name: copy.shell.hideSidebar, exact: true })
      await expect(hideSidebar).toBeVisible()
      await hideSidebar.click()
      await expect(sidebarState).toHaveAttribute('data-hbar-sidebar-expanded', 'false')

      await openSessionTool(page, copy.session.tools, 'files')
      const filesOwner = page.locator('.hbar-app-react-file-workspace:not(.hbar-app-react-file-workbench)')
      await expect(filesOwner).toBeVisible()
      const separator = page.getByRole('separator', { name: copy.toolLayout.resize, exact: true })
      await expect(separator).toBeVisible()
      const readWidth = async (attribute: 'aria-valuenow' | 'aria-valuemin' | 'aria-valuemax' = 'aria-valuenow') => {
        const raw = await separator.getAttribute(attribute)
        if (raw === null || !Number.isFinite(Number(raw))) throw new Error('Tool pane width is not available')
        return Number(raw)
      }
      const before = await readWidth()
      const minimum = await readWidth('aria-valuemin')
      const maximum = await readWidth('aria-valuemax')
      expect(maximum).toBeGreaterThan(minimum)
      expect(before).toBeGreaterThanOrEqual(minimum)
      expect(before).toBeLessThanOrEqual(maximum)
      await separator.focus()
      await page.keyboard.press(before > minimum ? 'ArrowRight' : 'ArrowLeft')
      await expect.poll(() => readWidth()).not.toBe(before)
      await expect(separator).toHaveAttribute('data-resize-status', 'idle')
      await expect(sidebarState).toHaveAttribute('data-hbar-sidebar-expanded', 'false')

      const afterKeyboard = await readWidth()
      const handle = await separator.boundingBox()
      if (!handle) throw new Error('The visible tool pane separator has no hit area')
      await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
      await page.mouse.down()
      const dragDelta = afterKeyboard > (minimum + maximum) / 2 ? 32 : -32
      await page.mouse.move(handle.x + handle.width / 2 + dragDelta, handle.y + handle.height / 2, { steps: 3 })
      await page.mouse.up()
      await expect.poll(() => readWidth()).not.toBe(afterKeyboard)
      expect(await readWidth()).toBeGreaterThanOrEqual(minimum)
      expect(await readWidth()).toBeLessThanOrEqual(maximum)
      await expect(separator).toHaveAttribute('data-resize-status', 'idle')
      await expect(sidebarState).toHaveAttribute('data-hbar-sidebar-expanded', 'false')

      const closeTool = filesOwner.getByRole('button', { name: copy.files.close, exact: true })
      await closeTool.click()
      await expect(filesOwner).toHaveCount(0)
      await expect(sidebarState).toHaveAttribute('data-hbar-sidebar-expanded', 'false')
      expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toEqual([])
      expect(pageErrors).toEqual([])
    } finally {
      await context.close()
      await stopWebSessionHost(host)
      await expect.poll(() => host.child.exitCode !== null || host.child.signalCode !== null).toBe(true)
      await removeFixture(fixture.root)
    }
  })
}
