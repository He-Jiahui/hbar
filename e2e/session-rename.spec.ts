import { expect, test } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { z } from 'zod'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { lumenMenuForTrigger } from './support/lumen-controls'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const rpcShape = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    method: z.string().optional(),
    params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
  })
  .passthrough()

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`inline session rename is local, keyboard accessible, recoverable and target-bound: ${locale}`, async ({
    browser,
  }) => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-inline-rename-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const directory = createWorkspaceSessionCommandClient(host.client)
      const other = await directory.execute(
        'session.create',
        { workspaceId: host.ready.workspaceId, title: 'Other session — 保留焦点' },
        { idempotencyKey: crypto.randomUUID() },
      )
      const copy = getShellCopy(locale)
      const labels = copy.shell.renameEditor
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      let responseMode: 'normal' | 'unknown' | 'hold' = 'normal'
      let renameRequestId: string | number | undefined
      let renameWrites = 0
      let releaseReply: (() => void) | null = null
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((message) => {
          if (typeof message === 'string') {
            const parsed = rpcShape.safeParse(JSON.parse(message))
            if (parsed.success && parsed.data.params?.commandId === 'session.rename') {
              renameRequestId = parsed.data.id
              renameWrites += 1
            }
          }
          server.send(message)
        })
        server.onMessage((message) => {
          if (typeof message === 'string') {
            const parsed = rpcShape.safeParse(JSON.parse(message))
            if (parsed.success && renameRequestId !== undefined && parsed.data.id === renameRequestId) {
              renameRequestId = undefined
              if (responseMode === 'unknown') {
                socket.send(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    id: parsed.data.id,
                    error: { code: -32603, message: 'Fixture dropped an accepted result', data: 'CONNECTION_CLOSED' },
                  }),
                )
                return
              }
              if (responseMode === 'hold') {
                releaseReply = () => socket.send(message)
                return
              }
            }
          }
          socket.send(message)
        })
      })
      await page.goto(base)
      const row = page.locator(`[data-session-id="${host.ready.sessionId}"]`)
      await row.locator('.hbar-app-react-session-target').click()
      const otherRow = page.locator(`[data-session-id="${other.id}"]`)
      const begin = async () => {
        const trigger = row.locator('.lumen-action-menu-trigger')
        await trigger.focus()
        await page.keyboard.press('Enter')
        const menu = await lumenMenuForTrigger(trigger)
        await menu.getByRole('menuitem', { name: copy.shell.renameSession, exact: true }).click()
      }
      const input = row.getByRole('textbox', { name: labels.title, exact: true })
      await begin()
      await expect(input).toBeFocused()
      await input.fill('Discard this draft')
      await page.keyboard.press('Escape')
      await expect(input).toHaveCount(0)
      await expect(row.locator('.hbar-app-react-session-target')).toBeFocused()
      expect(renameWrites).toBe(0)
      await expect(page.getByRole('dialog')).toHaveCount(0)

      await begin()
      await input.fill('  ')
      await page.keyboard.press('Enter')
      await expect(row.getByRole('alert')).toHaveText(labels.error('TITLE_REQUIRED'))
      const longTitle =
        '说明这是原项目中的当前会话 — Keep original workspace and target, even while navigating elsewhere'
      await input.fill(longTitle)
      await expect(input).toHaveAttribute('maxlength', '160')
      await otherRow.locator('.hbar-app-react-session-target').click()
      await expect(input).toHaveValue(longTitle)
      expect(renameWrites).toBe(0) // Blur is not an implicit save.
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 844 })
        const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
        if (width < 1024) {
          await expect(show).toBeVisible()
          await show.click()
        }
        await expect(input).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        for (const action of [labels.save, labels.cancel]) {
          const box = await row.getByRole('button', { name: action, exact: true }).boundingBox()
          expect(box).not.toBeNull()
          if (box) expect(box.x + box.width).toBeLessThanOrEqual(width + 1)
        }
        await page.screenshot({ path: `artifacts/session-rename/inline-${locale}-${width}.png` })
        if (width < 1024) await page.getByRole('button', { name: copy.shell.hideSidebar, exact: true }).first().click()
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await show.isVisible()) await show.click()
      await input.focus()
      await page.keyboard.press('Enter')
      await expect(input).toHaveCount(0)
      await expect(row.locator('.hbar-app-react-session-target')).toBeFocused()
      await expect(row).toContainText(longTitle)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(other.title)
      expect(renameWrites).toBe(1)

      await begin()
      await input.fill('My conflicting draft')
      await directory.execute('session.rename', {
        sessionId: host.ready.sessionId,
        title: 'Changed on another device',
        expectedTitle: longTitle,
      })
      await input.press('Enter')
      await expect(row.getByRole('alert')).toHaveText(labels.error('VERSION_CONFLICT'))
      await expect(input).toHaveValue('My conflicting draft')
      await input.press('Escape')
      await expect(row).toContainText('Changed on another device')
      expect(renameWrites).toBe(1)

      await begin()
      await input.fill('Accepted with unknown response')
      responseMode = 'unknown'
      await input.press('Enter')
      await expect(row.getByRole('alert')).toHaveText(labels.unknown)
      await expect(input).toBeDisabled()
      await expect(row.getByRole('button', { name: labels.cancel, exact: true })).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(input).toBeVisible()
      responseMode = 'normal'
      await row.getByRole('button', { name: labels.reconcile, exact: true }).click()
      await expect(input).toHaveCount(0)
      await expect(row).toContainText('Accepted with unknown response')
      expect(renameWrites).toBe(2)

      await begin()
      await input.fill('A delayed accepted title')
      responseMode = 'hold'
      await input.press('Enter')
      await expect.poll(() => releaseReply !== null).toBe(true)
      await otherRow.locator('.hbar-app-react-session-target').click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await prompt.focus()
      if (releaseReply) (releaseReply as () => void)()
      await expect(input).toHaveCount(0)
      await expect(prompt).toBeFocused()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(other.title)
      await expect(row).toContainText('A delayed accepted title')
      expect(renameWrites).toBe(3)

      await begin()
      await input.fill('Archived target keeps its rename draft')
      await directory.execute('session.archive', { sessionId: host.ready.sessionId, archived: true })
      // A live archive can detach the row between the ACK and this keystroke.
      // Dispatch to the actual focus owner once, rather than retrying Enter
      // against a row that may already have moved into readonly recovery.
      await page.keyboard.press('Enter')
      const recovery = page.getByRole('group', { name: labels.form('A delayed accepted title'), exact: true })
      await expect(recovery).toBeVisible()
      await expect(recovery.getByRole('textbox', { name: labels.title, exact: true })).toHaveValue(
        'Archived target keeps its rename draft',
      )
      await expect(recovery.getByRole('textbox', { name: labels.title, exact: true })).toHaveAttribute('readonly', '')
      await expect(recovery.getByRole('alert')).toHaveText(labels.error('STALE_TARGET'))
      await page.screenshot({ path: `artifacts/session-rename/recovery-${locale}-1440.png` })
      await page.setViewportSize({ width: 320, height: 844 })
      await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
      await expect(recovery).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/session-rename/recovery-${locale}-320.png` })
      await recovery.getByRole('button', { name: labels.cancel, exact: true }).click()
      await expect(recovery).toHaveCount(0)
      expect(
        (await host.client.call('session.snapshot', { sessionId: host.ready.sessionId, limit: 1 })).session.archived,
      ).toBe(true)
      await page.getByRole('button', { name: copy.shell.hideSidebar, exact: true }).first().click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(other.title)
      expect(renameWrites).toBe(3)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
