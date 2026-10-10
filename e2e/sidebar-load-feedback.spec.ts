import { expect, test, type Page } from '@playwright/test'
import { createAgentCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { selectSidebarOrganization } from './support/sidebar-organization-menu'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const rpcShape = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    params: z
      .object({
        commandId: z.string().optional(),
        input: z
          .object({ workspaceId: z.string().optional(), parentSessionId: z.string().optional() })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

async function showSidebar(page: Page, locale: ShellLocale) {
  const labels = getShellCopy(locale).shell
  const sidebar = page.getByRole('complementary', { name: labels.projectsAndSessions, exact: true })
  const expanded = page.locator('[data-hbar-sidebar-expanded]')
  if ((await expanded.getAttribute('data-hbar-sidebar-expanded')) === 'false')
    await page.getByRole('button', { name: labels.showSidebar, exact: true }).click()
  await expect(expanded).toHaveAttribute('data-hbar-sidebar-expanded', 'true')
  await expect(sidebar).toBeVisible()
  return sidebar
}

async function cleanupFixture(root: string) {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-sidebar-load-feedback-'))
    throw new Error('Refusing unexpected sidebar load fixture cleanup')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`sidebar keeps project, roster, child and time load failures below the whole tree: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(100_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-sidebar-load-feedback-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 44867) })
      const first = host.ready
      const directory = createWorkspaceSessionCommandClient(host.client)
      const agents = createAgentCommandClient(host.client)
      const otherPath = join(root, 'Other project — 其他工程')
      await mkdir(otherPath)
      const other = await directory.execute('workspace.create', { path: otherPath })
      const otherSession = await directory.execute(
        'session.create',
        {
          workspaceId: other.id,
          title: 'Other retained session — 另一条保留会话',
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      const child = await agents.execute(
        'agent.create',
        {
          parentSessionId: first.sessionId,
          objective: 'Respond with the fixture result',
          title: 'Child with a failed list read — 子会话读取恢复',
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(
          async () =>
            (await agents.execute('agent.result.get', { parentSessionId: first.sessionId, agentId: child.agentId }))
              .status,
        )
        .toBe('completed')

      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 44869}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: first.token } })).ok()).toBe(true)
      const page = await context.newPage()
      page.setDefaultTimeout(15_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const failedReads = new Set<string>()
      const rejectedIds = new Set<string | number>()
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((message) => {
          if (typeof message === 'string') {
            const parsed = rpcShape.safeParse(JSON.parse(message))
            if (parsed.success && parsed.data.id !== undefined && parsed.data.params?.commandId) {
              const { commandId, input } = parsed.data.params
              const target = input?.workspaceId ?? input?.parentSessionId ?? 'global'
              if (failedReads.has(`${commandId}:${target}`)) rejectedIds.add(parsed.data.id)
            }
          }
          server.send(message)
        })
        server.onMessage((message) => {
          if (typeof message === 'string') {
            const parsed = rpcShape.safeParse(JSON.parse(message))
            if (parsed.success && parsed.data.id !== undefined && rejectedIds.delete(parsed.data.id)) {
              socket.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: parsed.data.id,
                  error: { code: -32603, message: 'Isolated failed sidebar read', data: 'STORAGE_CLOSED' },
                }),
              )
              return
            }
          }
          socket.send(message)
        })
      })
      await page.clock.install()
      await page.goto(base)
      let sidebar = await showSidebar(page, locale)
      const tree = () => sidebar.getByRole('tree')
      const footer = () => sidebar.locator('[data-sidebar-load-feedback]')
      const project = (workspaceId: string) => tree().locator(`[data-workspace-id="${workspaceId}"]`)
      const feedback = (workspaceId: string) =>
        footer().locator(`[data-sidebar-feedback-workspace-id="${workspaceId}"]`)
      const parent = () => tree().getByRole('treeitem', { name: first.sessionTitle, exact: true })
      const firstProject = tree().getByRole('treeitem', { name: first.workspaceName, exact: true })
      if ((await firstProject.getAttribute('aria-expanded')) === 'false') await firstProject.click()
      await expect(parent()).toBeVisible()
      failedReads.add(`session.agentChildren.list:${first.sessionId}`)
      await expect(parent()).toHaveAttribute('aria-expanded', 'false')
      await parent().focus()
      await page.keyboard.press('ArrowRight')
      await expect(footer().locator(`[data-agent-feedback-session-id="${first.sessionId}"]`)).toBeVisible()
      const otherProject = tree().getByRole('treeitem', { name: other.name, exact: true })
      if ((await otherProject.getAttribute('aria-expanded')) === 'false') await otherProject.click()
      await expect(project(other.id).locator(`[data-session-id="${otherSession.id}"]`)).toBeVisible()
      await parent().click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(first.sessionTitle)
      const order = await tree()
        .locator('[data-sidebar-level="project"]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-workspace-id')))
      const refreshProject = async (name: string) => {
        await sidebar.getByTitle(copy.shell.workspaceActions(name), { exact: true }).click()
        await page.getByRole('menuitem', { name: copy.shell.roster.refreshWorkspace(name), exact: true }).click()
      }
      for (const workspaceId of [first.workspaceId, other.id]) {
        failedReads.add(`session.list:${workspaceId}`)
        failedReads.add(`session.sidebar.list:${workspaceId}`)
      }
      await refreshProject(first.workspaceName)
      await refreshProject(other.name)
      await expect(footer().locator(`[data-agent-feedback-session-id="${first.sessionId}"]`)).toBeVisible()
      for (const workspaceId of [first.workspaceId, other.id]) {
        await expect(feedback(workspaceId).getByRole('alert')).toHaveCount(2)
        await expect(feedback(workspaceId)).toContainText(copy.shell.roster.failure('STORAGE_CLOSED'))
        await expect(feedback(workspaceId)).toContainText(copy.shell.error('STORAGE_CLOSED'))
      }
      failedReads.add('workspace.sidebar.list:global')
      await sidebar.getByRole('button', { name: copy.shell.roster.refreshExpanded, exact: true }).click()
      await expect(footer().locator(':scope > [role="alert"]')).toContainText(copy.shell.error('STORAGE_CLOSED'))

      for (const width of [1440, 768, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await page.clock.runFor(100)
        sidebar = await showSidebar(page, locale)
        await tree().evaluate((node) => node.parentElement?.scrollTo({ top: 0 }))
        expect(await tree().evaluate((node) => node.clientHeight >= node.scrollHeight - 1)).toBe(true)
        await expect(parent()).toBeInViewport()
        await expect(tree().getByRole('alert')).toHaveCount(0)
        expect(
          await tree()
            .locator('[data-sidebar-level="project"]')
            .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-workspace-id'))),
        ).toEqual(order)
        await expect(project(first.workspaceId).locator(`[data-session-id="${first.sessionId}"]`)).toBeVisible()
        await expect(project(other.id).locator(`[data-session-id="${otherSession.id}"]`)).toBeVisible()
        expect(
          await footer().evaluate((node) => {
            const list = node.parentElement?.querySelector('.hbar-app-react-project-tree')
            return Boolean(
              list &&
              list.parentElement === node.parentElement &&
              list.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING &&
              list.getBoundingClientRect().bottom <= node.getBoundingClientRect().top,
            )
          }),
        ).toBe(true)
        expect(await sidebar.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/sidebar-load-feedback/tree-${locale}-${width}.png` })
        await footer().scrollIntoViewIfNeeded()
        await page.screenshot({ path: `artifacts/sidebar-load-feedback/failures-${locale}-${width}.png` })
      }

      await page.setViewportSize({ width: 1440, height: 960 })
      sidebar = await showSidebar(page, locale)
      failedReads.delete(`session.sidebar.list:${first.workspaceId}`)
      await feedback(first.workspaceId).getByRole('button', { name: copy.shell.sort.refresh, exact: true }).click()
      await expect(feedback(first.workspaceId).getByRole('alert')).toHaveCount(1)
      await expect(feedback(other.id).getByRole('alert')).toHaveCount(2)
      failedReads.delete(`session.list:${first.workspaceId}`)
      await feedback(first.workspaceId).getByRole('button', { name: copy.shell.roster.retry, exact: true }).click()
      await expect(feedback(first.workspaceId)).toHaveCount(0)
      await expect(feedback(other.id).getByRole('alert')).toHaveCount(2)
      failedReads.delete(`session.agentChildren.list:${first.sessionId}`)
      const childFeedback = footer().locator(`[data-agent-feedback-session-id="${first.sessionId}"]`)
      await childFeedback.getByRole('button', { name: copy.shell.agentTree.retry, exact: true }).click()
      await expect(childFeedback).toHaveCount(0)
      await expect(tree().locator(`[data-session-id="${child.sessionId}"]`)).toBeVisible()
      failedReads.clear()
      await feedback(other.id).getByRole('button', { name: copy.shell.roster.retry, exact: true }).click()
      await footer()
        .locator(':scope > [role="alert"]')
        .getByRole('button', { name: copy.shell.sort.refresh, exact: true })
        .click()
      await expect(footer()).toBeHidden()
      await expect(parent()).toHaveAttribute('aria-selected', 'true')

      await selectSidebarOrganization(page, copy.shell.sort, 'time')
      sidebar = page.getByRole('complementary', { name: copy.shell.sort.time.title, exact: true })
      await expect(tree().locator(`[data-session-id="${first.sessionId}"]`)).toBeVisible()
      failedReads.add('session.activity.global.list:global')
      await sidebar.getByRole('button', { name: copy.shell.roster.refreshExpanded, exact: true }).click()
      await expect(footer().getByRole('alert')).toContainText(copy.shell.error('STORAGE_CLOSED'))
      await expect(tree().getByRole('alert')).toHaveCount(0)
      await expect(tree().locator(`[data-session-id="${first.sessionId}"]`)).toBeVisible()
      failedReads.clear()
      await footer().getByRole('button', { name: copy.shell.sort.refresh, exact: true }).click()
      await expect(footer()).toBeHidden()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanupFixture(root)
    }
  })
}
