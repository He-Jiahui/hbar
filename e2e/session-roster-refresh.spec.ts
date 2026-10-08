import { expect, test, type Page } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const rpcShape = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    params: z
      .object({
        commandId: z.string().optional(),
        input: z.object({ workspaceId: z.string().optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 44869}`
async function showSidebar(page: Page, locale: ShellLocale) {
  const shell = getShellCopy(locale).shell
  const sidebar = page.getByRole('complementary', { name: shell.projectsAndSessions, exact: true })
  if (!(await sidebar.isVisible())) await page.getByRole('button', { name: shell.showSidebar, exact: true }).click()
  await expect(sidebar).toBeVisible()
  return sidebar
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`sidebar roster refresh reconciles two real Clients without taking navigation or drafts: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(100_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-roster-refresh-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 44867),
        sessionCount: 101,
      })
      const commands = createWorkspaceSessionCommandClient(host.client)
      const initial = await commands.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 200 })
      const later = initial.items.at(-1)
      const archiveTarget = initial.items.find((item) => item.id !== later?.id && item.id !== host?.ready.sessionId)
      if (!later || !archiveTarget) throw new Error('Fixture needs distinct paged and archive targets')
      const otherPath = join(root, 'Another project — 其他工程')
      await mkdir(otherPath)
      const otherWorkspace = await commands.execute('workspace.create', { path: otherPath })
      const otherSession = await commands.execute(
        'session.create',
        { workspaceId: otherWorkspace.id, title: 'Unrelated active session — 草稿不得丢失' },
        { idempotencyKey: crypto.randomUUID() },
      )
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      let queryMode: 'normal' | 'fail' | 'hold' = 'normal'
      let targetWorkspace = host.ready.workspaceId
      let release: (() => void) | undefined
      let disconnectBrowser: (() => Promise<void>) | undefined
      const held = new Set<string | number>()
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        disconnectBrowser = () => socket.close({ code: 1012, reason: 'Isolated roster reconnect fixture' })
        socket.onMessage((message) => {
          if (typeof message === 'string') {
            const parsed = rpcShape.safeParse(JSON.parse(message))
            if (
              parsed.success &&
              parsed.data.id !== undefined &&
              parsed.data.params?.commandId === 'session.list' &&
              parsed.data.params.input?.workspaceId === targetWorkspace &&
              queryMode !== 'normal'
            )
              held.add(parsed.data.id)
          }
          server.send(message)
        })
        server.onMessage((message) => {
          if (typeof message === 'string') {
            const parsed = rpcShape.safeParse(JSON.parse(message))
            if (parsed.success && parsed.data.id !== undefined && held.delete(parsed.data.id)) {
              if (queryMode === 'fail') {
                socket.send(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    id: parsed.data.id,
                    error: { code: -32603, message: 'Fixture offline read', data: 'CONNECTION_CLOSED' },
                  }),
                )
                return
              }
              if (queryMode === 'hold') {
                release = () => socket.send(message)
                return
              }
            }
          }
          socket.send(message)
        })
      })
      await page.clock.install()
      await page.goto(base())
      let sidebar = await showSidebar(page, locale)
      const project = () => sidebar.locator(`[data-workspace-id="${host?.ready.workspaceId}"]`)
      const otherProject = () => sidebar.locator(`[data-workspace-id="${otherWorkspace.id}"]`)
      const expand = async (name: string) => {
        await sidebar.getByTitle(copy.shell.workspaceActions(name), { exact: true }).waitFor()
        const button = sidebar.getByRole('treeitem', { expanded: false, name: name, exact: true })
        if (await button.count()) await button.click()
      }
      await expand(host.ready.workspaceName)
      // Initial automatic refresh may already have merged later pages. The original paging cursor stays available.
      const more = project().getByRole('button', { name: copy.shell.loadMore, exact: true })
      await expect(more).toBeVisible()
      await more.click()
      await expect(project().locator(`[data-session-id="${later.id}"]`)).toBeVisible()
      await expand(otherWorkspace.name)
      await otherProject().getByRole('treeitem', { name: otherSession.title, exact: true }).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(otherSession.title)
      await expect(otherProject().locator(`[data-session-id="${otherSession.id}"]`)).toHaveAttribute(
        'data-selected',
        'true',
      )
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await prompt.fill('Keep the original draft — 保留原会话输入')
      await expectComposerText(prompt, 'Keep the original draft — 保留原会话输入')
      const refreshProject = async (name: string) => {
        await sidebar.getByTitle(copy.shell.workspaceActions(name), { exact: true }).click()
        await page.getByRole('menuitem', { name: copy.shell.roster.refreshWorkspace(name), exact: true }).click()
      }
      const created = await commands.execute(
        'session.create',
        { workspaceId: host.ready.workspaceId, title: 'External new — 新会话' },
        { idempotencyKey: crypto.randomUUID() },
      )
      const changedTitle = 'Externally renamed later-page session — 后页重命名不应消失'
      await commands.execute('session.rename', { sessionId: later.id, title: changedTitle, expectedTitle: later.title })
      await commands.execute('session.archive', { sessionId: archiveTarget.id, archived: true })
      await refreshProject(host.ready.workspaceName)
      await expect(project().locator(`[data-session-id="${created.id}"]`)).toContainText(created.title)
      await expect(project().locator(`[data-session-id="${later.id}"]`)).toContainText(changedTitle)
      await expect(project().locator(`[data-session-id="${archiveTarget.id}"]`)).toHaveCount(0)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(otherSession.title)
      await expectComposerText(prompt, 'Keep the original draft — 保留原会话输入')
      await expect(otherProject().locator(`[data-session-id="${otherSession.id}"]`)).toHaveAttribute(
        'data-selected',
        'true',
      )
      await expect(project()).toContainText(copy.shell.roster.refreshed)

      queryMode = 'fail'
      await refreshProject(host.ready.workspaceName)
      await expect(project().getByRole('alert')).toContainText(copy.shell.roster.failure('CONNECTION_CLOSED'))
      await expect(project().locator(`[data-session-id="${later.id}"]`)).toContainText(changedTitle)
      await expectComposerText(prompt, 'Keep the original draft — 保留原会话输入')
      await page.screenshot({ path: `artifacts/session-roster-refresh/error-${locale}-1440.png` })
      queryMode = 'normal'
      await project().getByRole('button', { name: copy.shell.roster.retry, exact: true }).click()
      await expect(project().getByRole('alert')).toHaveCount(0)

      // Focus auto refresh observes external rename without selecting its target.
      await commands.execute('session.rename', {
        sessionId: created.id,
        title: 'Focus updated — 焦点刷新结果',
        expectedTitle: created.title,
      })
      await page.clock.fastForward(5001)
      await page.evaluate(() => window.dispatchEvent(new Event('focus')))
      await expect(project().locator(`[data-session-id="${created.id}"]`)).toContainText('Focus updated')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(otherSession.title)
      await expectComposerText(prompt, 'Keep the original draft — 保留原会话输入')

      // A hidden document does not poll; becoming visible and the foreground timer refresh independently.
      await commands.execute('session.rename', {
        sessionId: created.id,
        title: 'Visibility updated — 可见性刷新',
        expectedTitle: 'Focus updated — 焦点刷新结果',
      })
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await page.clock.fastForward(30_001)
      await expect(project().locator(`[data-session-id="${created.id}"]`)).toContainText('Focus updated')
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
        document.dispatchEvent(new Event('visibilitychange'))
      })
      await expect(project().locator(`[data-session-id="${created.id}"]`)).toContainText('Visibility updated')
      await expect(sidebar.getByRole('button', { name: copy.shell.roster.refreshExpanded, exact: true })).toBeEnabled()
      await commands.execute('session.rename', {
        sessionId: created.id,
        title: 'Timer updated — 前台定时刷新',
        expectedTitle: 'Visibility updated — 可见性刷新',
      })
      await page.clock.fastForward(30_001)
      await expect(project().locator(`[data-session-id="${created.id}"]`)).toContainText('Timer updated')

      // Hold A's read, switch the active session, then deliver A. Its facts remain A-owned.
      queryMode = 'hold'
      await refreshProject(host.ready.workspaceName)
      await expect.poll(() => release !== undefined).toBe(true)
      await project().locator(`[data-session-id="${later.id}"] .hbar-app-react-session-target`).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(changedTitle)
      queryMode = 'normal'
      release?.()
      release = undefined
      await expect(project().locator('[data-roster-workspace-id]')).toContainText(copy.shell.roster.refreshed)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(changedTitle)
      await otherProject().locator(`[data-session-id="${otherSession.id}"] .hbar-app-react-session-target`).click()
      await expectComposerText(prompt, 'Keep the original draft — 保留原会话输入')

      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: width >= 1000 ? 960 : 844 })
        sidebar = await showSidebar(page, locale)
        const refresh = sidebar.getByRole('button', { name: copy.shell.roster.refreshExpanded, exact: true })
        await expect(refresh).toBeVisible()
        await refresh.focus()
        await page.keyboard.press('Enter')
        await expect(refresh).toBeEnabled()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        const box = await refresh.boundingBox()
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width + 1)
        if (width <= 900) expect(box?.width).toBeGreaterThanOrEqual(44)
        await page.screenshot({ path: `artifacts/session-roster-refresh/roster-${locale}-${width}.png` })
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      sidebar = await showSidebar(page, locale)
      await commands.execute('session.rename', {
        sessionId: created.id,
        title: 'Reconnect updated — 重连后核对',
        expectedTitle: 'Timer updated — 前台定时刷新',
      })
      await disconnectBrowser?.()
      await expect(sidebar.getByRole('button', { name: copy.shell.roster.refreshExpanded, exact: true })).toBeDisabled()
      await page.getByRole('button', { name: copy.shell.reconnect, exact: true }).click()
      await expect(project().locator(`[data-session-id="${created.id}"]`)).toContainText('Reconnect updated')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(otherSession.title)
      await expectComposerText(prompt, 'Keep the original draft — 保留原会话输入')
      // Refreshing an externally archived active session must not clear it or its draft.
      targetWorkspace = otherWorkspace.id
      await commands.execute('session.archive', { sessionId: otherSession.id, archived: true })
      await refreshProject(otherWorkspace.name)
      await expect(otherProject().locator(`[data-session-id="${otherSession.id}"]`)).toHaveCount(0)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(otherSession.title)
      await expectComposerText(prompt, 'Keep the original draft — 保留原会话输入')
      await stopWebSessionHost(host)
      host = undefined
      await expect(sidebar.getByRole('button', { name: copy.shell.roster.refreshExpanded, exact: true })).toBeDisabled()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
