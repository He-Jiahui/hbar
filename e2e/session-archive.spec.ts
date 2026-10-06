import { expect, test } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { lumenMenuForTrigger } from './support/lumen-controls'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const rpcShape = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
  })
  .passthrough()

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`archive and restore preserve history, navigation and unknown targets: ${locale}`, async ({ browser }) => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-session-archive-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317), historyCount: 2 })
      const commands = createWorkspaceSessionCommandClient(host.client)
      const title =
        '需要可恢复归档的原会话 — Preserve every historical message and the original target across navigation'
      await commands.execute('session.rename', { sessionId: host.ready.sessionId, title })
      const other = await commands.execute(
        'session.create',
        { workspaceId: host.ready.workspaceId, title: 'Other session — 焦点不变' },
        { idempotencyKey: crypto.randomUUID() },
      )
      const copy = getShellCopy(locale)
      const labels = copy.shell.archive
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      let mode: 'normal' | 'hold' | 'unknown' = 'normal'
      let requestId: string | number | undefined
      let writes = 0
      let release: (() => void) | null = null
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((message) => {
          if (typeof message === 'string') {
            const parsed = rpcShape.safeParse(JSON.parse(message))
            if (parsed.success && parsed.data.params?.commandId === 'session.archive') {
              requestId = parsed.data.id
              writes += 1
            }
          }
          server.send(message)
        })
        server.onMessage((message) => {
          if (typeof message === 'string') {
            const parsed = rpcShape.safeParse(JSON.parse(message))
            if (parsed.success && requestId !== undefined && parsed.data.id === requestId) {
              requestId = undefined
              if (mode === 'hold') {
                release = () => socket.send(message)
                return
              }
              if (mode === 'unknown') {
                socket.send(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    id: parsed.data.id,
                    error: {
                      code: -32603,
                      message: 'Fixture lost accepted archive response',
                      data: 'CONNECTION_CLOSED',
                    },
                  }),
                )
                return
              }
            }
          }
          socket.send(message)
        })
      })
      await page.goto(base)
      const row = page.locator(`[data-session-id="${host.ready.sessionId}"]`)
      const otherRow = page.locator(`[data-session-id="${other.id}"]`)
      await row.locator('.hbar-app-react-session-target').click()
      const begin = async () => {
        const trigger = row.locator('.lumen-action-menu-trigger')
        await trigger.focus()
        await page.keyboard.press('Enter')
        const menu = await lumenMenuForTrigger(trigger)
        await menu.getByRole('menuitem', { name: copy.shell.archiveSession, exact: true }).click()
      }
      await begin()
      const confirmation = row.getByRole('group', { name: labels.confirmTitle(title), exact: true })
      await expect(confirmation).toContainText(labels.description)
      await expect(confirmation.getByRole('button', { name: labels.cancel, exact: true })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(confirmation).toHaveCount(0)
      await expect(row.locator('.hbar-app-react-session-target')).toBeFocused()
      expect(writes).toBe(0)
      await begin()
      await page.getByRole('treeitem', { expanded: true, name: host.ready.workspaceName, exact: true }).click()
      const collapsedRecovery = page.getByRole('group', { name: labels.confirmTitle(title), exact: true })
      await expect(collapsedRecovery).toBeVisible()
      await expect(row).toHaveCount(0)
      await collapsedRecovery.getByRole('button', { name: labels.cancel, exact: true }).click()
      await expect(collapsedRecovery).toHaveCount(0)
      expect(writes).toBe(0)
      await page.getByRole('treeitem', { expanded: false, name: host.ready.workspaceName, exact: true }).click()
      await begin()
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 844 })
        if (width < 1024) await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
        await expect(confirmation).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/session-archive/confirm-${locale}-${width}.png` })
        if (width < 1024) await page.getByRole('button', { name: copy.shell.hideSidebar, exact: true }).first().click()
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await show.isVisible()) await show.click()
      mode = 'hold'
      await confirmation.getByRole('button', { name: labels.confirm, exact: true }).click()
      await expect.poll(() => release !== null).toBe(true)
      await otherRow.locator('.hbar-app-react-session-target').click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(other.title)
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await prompt.focus()
      await expect(prompt).toBeFocused()
      if (release) (release as () => void)()
      mode = 'normal'
      await expect(row).toHaveCount(0)
      await expect(prompt).toBeFocused()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(other.title)
      await expect(page.getByText(labels.archived(title), { exact: true })).toBeVisible()
      await page.getByRole('button', { name: labels.dismiss, exact: true }).click()
      const openArchived = async () => {
        const trigger = page.getByTitle(copy.shell.workspaceActions(host!.ready.workspaceName), { exact: true })
        await trigger.click()
        const menu = await lumenMenuForTrigger(trigger)
        await menu.getByRole('menuitem', { name: labels.openList(host!.ready.workspaceName), exact: true }).click()
      }
      await openArchived()
      const list = page.getByRole('region', { name: labels.listTitle(host.ready.workspaceName), exact: true })
      await expect(list.getByRole('button', { name: labels.restoreSession(title), exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(other.title)
      mode = 'unknown'
      await list.getByRole('button', { name: labels.restoreSession(title), exact: true }).click()
      await expect(list.getByRole('alert')).toHaveText(labels.unknown)
      await list.getByRole('button', { name: labels.close, exact: true }).click()
      await expect(list).toHaveCount(0)
      const recovery = page.getByRole('group', { name: labels.restoreTitle(title), exact: true })
      await expect(recovery.getByRole('alert')).toHaveText(labels.unknown)
      await expect(recovery.getByRole('button', { name: labels.cancel, exact: true })).toHaveCount(0)
      mode = 'normal'
      await recovery.getByRole('button', { name: labels.reconcile, exact: true }).click()
      await expect(row).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(other.title)
      await expect(recovery).toContainText(labels.restored(title))
      const snapshot = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId, limit: 10 })
      expect(snapshot.session.archived).toBe(false)
      expect(snapshot.messages).toHaveLength(2)
      expect(writes).toBe(2)
      await recovery.getByRole('button', { name: labels.dismiss, exact: true }).click()
      const otherTrigger = otherRow.locator('.lumen-action-menu-trigger')
      await otherTrigger.click()
      const otherMenu = await lumenMenuForTrigger(otherTrigger)
      await otherMenu.getByRole('menuitem', { name: copy.shell.archiveSession, exact: true }).click()
      await otherRow.getByRole('button', { name: labels.confirm, exact: true }).click()
      await expect(otherRow).toHaveCount(0)
      await expect(page.getByRole('heading', { name: copy.preSession.hero.title, exact: true })).toBeVisible()
      await page.getByRole('button', { name: labels.dismiss, exact: true }).click()
      await openArchived()
      await list.getByRole('button', { name: labels.restoreSession(other.title), exact: true }).click()
      await expect(otherRow).toBeVisible()
      await expect(page.getByRole('heading', { name: copy.preSession.hero.title, exact: true })).toBeVisible()
      await page.screenshot({ path: `artifacts/session-archive/restored-${locale}-1440.png` })
      expect(writes).toBe(4)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}

test('an empty first archived page still exposes the next bounded project page', async ({ browser }) => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-archive-pages-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317), sessionCount: 101 })
    const all = await host.client.call('session.list', {
      workspaceId: host.ready.workspaceId,
      includeArchived: true,
      limit: 200,
    })
    const last = all.items.at(-1)
    if (!last) throw new Error('Fixture lacks its final session')
    await createWorkspaceSessionCommandClient(host.client).execute('session.archive', {
      sessionId: last.id,
      archived: true,
    })
    const copy = getShellCopy('en-US')
    const labels = copy.shell.archive
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    await page.goto(base)
    const trigger = page.getByTitle(copy.shell.workspaceActions(host.ready.workspaceName), { exact: true })
    await trigger.click()
    const menu = await lumenMenuForTrigger(trigger)
    await menu.getByRole('menuitem', { name: labels.openList(host.ready.workspaceName), exact: true }).click()
    const list = page.getByRole('region', { name: labels.listTitle(host.ready.workspaceName), exact: true })
    await expect(list).toContainText(labels.emptyPage)
    await expect(list).not.toContainText(labels.empty)
    await list.getByRole('button', { name: labels.nextPage, exact: true }).click()
    await expect(list.locator('[data-archived-session-id]')).toHaveCount(1)
    await expect(list.getByRole('button', { name: labels.restoreSession(last.title), exact: true })).toBeVisible()
    await expect(list).toContainText(labels.page(2))
    await page.screenshot({ path: 'artifacts/session-archive/pagination-second-page.png' })
    await list.getByRole('button', { name: labels.firstPage, exact: true }).click()
    await expect(list).toContainText(labels.page(1))
    await expect(list).toContainText(labels.emptyPage)
    await list.getByRole('button', { name: labels.close, exact: true }).click()
    await expect(list).toHaveCount(0)
    await expect(page.getByTitle(copy.shell.workspaceActions(host.ready.workspaceName), { exact: true })).toBeFocused()
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
