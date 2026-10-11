import { expect, test } from '@playwright/test'
import { createAgentCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { workspaceTabsCopy } from '../apps/web/src/workspace-tabs-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { openSessionTool } from './support/session-tools-menu'
import { removeOwnedFixtureDirectory } from './support/owned-fixture-directory'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
const childTitle = 'Isolated review child with a long title'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`real Host child Agent opens its existing Session tab and returns to its original parent: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-agent-child-return-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const created = await createAgentCommandClient(host.client).execute(
        'agent.create',
        {
          parentSessionId: host.ready.sessionId,
          objective: 'Review the current workbench',
          modelId: 'local-fixture',
          title: childTitle,
          approval: 'deny',
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      expect(created.parentSessionId).toBe(host.ready.sessionId)
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = getShellCopy(locale)
      const tabs = workspaceTabsCopy((zh, en) => (locale === 'zh-CN' ? zh : en))
      await page.goto(base())
      // The first project expands after its Host sidebar snapshot. Wait for the
      // owned row instead of racing an Expand label that becomes Collapse.
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await openSessionTool(page, copy.session.tools, 'agents')
      await page.getByRole('button', { name: copy.agents.showDetails(created.objective), exact: true }).click()
      await expect(page.getByRole('button', { name: copy.agents.openSession, exact: true })).toBeVisible()
      await page.getByRole('button', { name: copy.agents.openSession, exact: true }).click()
      const childTab = page.getByRole('tab', { name: childTitle, exact: true })
      await expect(childTab).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('.hbar-app-react-agent-workspace')).toHaveCount(0)
      const back = page.getByRole('button', { name: copy.agents.returnToParent(host.ready.sessionTitle), exact: true })
      await expect(back).toBeVisible()
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-agent-child-${locale}-${width}.png` })
      }
      await back.click()
      await expect(page.locator('.hbar-app-react-shell-header-active-title')).toHaveText(host.ready.sessionTitle)
      const mobileTrigger = page.locator('.hbar-mobile-header-menu-trigger')
      await mobileTrigger.click()
      const mobileTabs = page
        .locator('.hbar-mobile-header-menu-content')
        .getByRole('region', { name: tabs.tabs.tabs, exact: true })
      const currentParent = mobileTabs.getByRole('button').filter({ hasText: host.ready.sessionTitle }).first()
      await expect(currentParent).toHaveAttribute('aria-current', 'page')
      await expect(mobileTabs.getByRole('button').filter({ hasText: childTitle }).first()).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(mobileTrigger).toBeFocused()
      await page.setViewportSize({ width: 1440, height: 900 })
      const parentTab = page.getByRole('tab', { name: host.ready.sessionTitle, exact: true })
      await expect(parentTab).toHaveAttribute('aria-selected', 'true')
      await parentTab.focus()
      await expect(parentTab).toBeFocused()
      await expect(childTab).toBeVisible()
      await childTab.click()
      await expect(back).toBeVisible()
      await page.getByRole('button', { name: tabs.tabs.close(host.ready.sessionTitle), exact: true }).click()
      await expect(parentTab).toHaveCount(0)
      await expect(childTab).toHaveAttribute('aria-selected', 'true')
      await expect(back).toHaveCount(0)
      await page.reload()
      await expect(childTab).toHaveAttribute('aria-selected', 'true')
      await expect(back).toHaveCount(0)
      const directory = createWorkspaceSessionCommandClient(host.client)
      expect((await directory.execute('session.get', { sessionId: host.ready.sessionId }))?.id).toBe(
        host.ready.sessionId,
      )
      expect((await directory.execute('session.get', { sessionId: created.sessionId }))?.id).toBe(created.sessionId)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedFixtureDirectory(root, 'hbar-agent-child-return-')
    }
  })
}

test('a lost Agent read stays in the original detail and an explicit retry opens the child', async ({ browser }) => {
  test.setTimeout(120_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-agent-child-unknown-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 900 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const created = await createAgentCommandClient(host.client).execute(
      'agent.create',
      {
        parentSessionId: host.ready.sessionId,
        objective: 'Inspect a lost read',
        modelId: 'local-fixture',
        title: 'Recoverable child',
        approval: 'deny',
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const copy = getShellCopy('en-US')
    const envelope = z
      .object({
        id: z.union([z.string(), z.number()]).optional(),
        params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
      })
      .passthrough()
    const faultReads = new Set<string | number>()
    let injectFailure = true
    await page.routeWebSocket('**/rpc', (socket) => {
      const server = socket.connectToServer()
      socket.onMessage((message) => {
        if (typeof message === 'string') {
          const parsed = envelope.safeParse(JSON.parse(message))
          if (parsed.success && parsed.data.params?.commandId === 'agent.result.get' && parsed.data.id !== undefined)
            faultReads.add(parsed.data.id)
        }
        server.send(message)
      })
      server.onMessage((message) => {
        if (typeof message === 'string') {
          const parsed = envelope.safeParse(JSON.parse(message))
          if (parsed.success && parsed.data.id !== undefined && faultReads.delete(parsed.data.id) && injectFailure) {
            socket.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: parsed.data.id,
                error: { code: -32603, message: 'Fixture lost Agent read', data: 'DISCONNECTED' },
              }),
            )
            return
          }
        }
        socket.send(message)
      })
    })
    await page.goto(base())
    const expand = page.getByRole('treeitem', { expanded: false, name: host.ready.workspaceName, exact: true })
    if (await expand.isVisible()) await expand.click()
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    await openSessionTool(page, copy.session.tools, 'agents')
    await page.getByRole('button', { name: copy.agents.showDetails(created.objective), exact: true }).click()
    await page.getByRole('button', { name: copy.agents.openSession, exact: true }).click()
    await expect(page.locator('.hbar-app-react-agent-detail').getByRole('alert')).toContainText(
      copy.agents.openSessionError('DISCONNECTED'),
    )
    await expect(page.getByRole('tab', { name: host.ready.sessionTitle, exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.getByRole('tab', { name: 'Recoverable child', exact: true })).toHaveCount(0)
    injectFailure = false
    await page.getByRole('button', { name: copy.agents.openSession, exact: true }).click()
    await expect(page.getByRole('tab', { name: 'Recoverable child', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await removeOwnedFixtureDirectory(root, 'hbar-agent-child-unknown-')
  }
})
