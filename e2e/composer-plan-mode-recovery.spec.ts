import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const envelope = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
  })
  .passthrough()

test('lost Host mode.set reply stays unknown until read-only reconciliation; switching sessions preserves targets', async ({
  browser,
}) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-durable-plan-recovery-'))
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  const copy = getShellCopy('en-US')
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, sessionCount: 2, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const sessions = await createWorkspaceSessionCommandClient(host.client).execute('session.list', {
      workspaceId: host.ready.workspaceId,
      limit: 100,
    })
    const original = sessions.items.find((session) => session.title === 'Session 001')?.id
    if (!original) throw new Error('First fixture session is missing')
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    let writes = 0
    let dropReply = true
    const requestIds = new Set<string | number>()
    await page.routeWebSocket('**/rpc', (socket) => {
      const server = socket.connectToServer()
      socket.onMessage((message) => {
        if (typeof message === 'string') {
          const parsed = envelope.safeParse(JSON.parse(message))
          if (parsed.success && parsed.data.params?.commandId === 'mode.set' && parsed.data.id !== undefined) {
            writes++
            requestIds.add(parsed.data.id)
          }
        }
        server.send(message)
      })
      server.onMessage((message) => {
        if (typeof message === 'string') {
          const parsed = envelope.safeParse(JSON.parse(message))
          if (parsed.success && parsed.data.id !== undefined && requestIds.delete(parsed.data.id) && dropReply) {
            dropReply = false
            socket.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: parsed.data.id,
                error: { code: -32603, message: 'Lost accepted reply', data: 'RESULT_UNKNOWN' },
              }),
            )
            return
          }
        }
        socket.send(message)
      })
    })
    await page.goto(base)
    await page.getByRole('treeitem', { name: 'Session 001', exact: true }).click()
    const picker = page.locator('.hbar-composer-permission-picker')
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await expect(prompt).toHaveAttribute('contenteditable', 'true')
    await prompt.fill('This draft remains when mode confirmation is lost.')
    await picker
      .getByRole('button', {
        name: copy.session.permissionPicker.trigger(
          copy.session.permissionPicker.inheritedTrigger(copy.session.permissionPicker.options.ask.label),
        ),
      })
      .click()
    await picker.getByRole('menuitemradio', { name: copy.session.permissionPicker.plan.label }).click()
    await expect(picker.getByText(copy.session.permissionPicker.plan.unknown)).toBeVisible()
    await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeDisabled()
    await expectComposerText(prompt, 'This draft remains when mode confirmation is lost.')
    expect(await host.client.call('mode.get', { sessionId: original })).toEqual({ mode: 'plan' })
    expect(writes).toBe(1)
    await picker.getByRole('button', { name: copy.session.permissionPicker.plan.recheck }).click()
    await expect(
      picker.getByRole('button', {
        name: copy.session.permissionPicker.trigger(copy.session.permissionPicker.plan.label),
      }),
    ).toBeVisible()
    expect(writes).toBe(1)
    await page.getByRole('treeitem', { name: 'Session 002', exact: true }).click()
    await expect(
      picker.getByRole('button', {
        name: copy.session.permissionPicker.trigger(
          copy.session.permissionPicker.inheritedTrigger(copy.session.permissionPicker.options.ask.label),
        ),
      }),
    ).toBeVisible()
    await page.getByRole('tab', { name: 'Session 001', exact: true }).click()
    await expect(
      picker.getByRole('button', {
        name: copy.session.permissionPicker.trigger(copy.session.permissionPicker.plan.label),
      }),
    ).toBeVisible()
    await expectComposerText(prompt, 'This draft remains when mode confirmation is lost.')
    expect(writes).toBe(1)
    await host.client.call('mode.set', { sessionId: original, mode: 'default' })
    await expect(
      picker.getByRole('button', {
        name: copy.session.permissionPicker.trigger(
          copy.session.permissionPicker.inheritedTrigger(copy.session.permissionPicker.options.ask.label),
        ),
      }),
    ).toBeVisible()
    await expectComposerText(prompt, 'This draft remains when mode confirmation is lost.')
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
