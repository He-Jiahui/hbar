import { expect, test } from '@playwright/test'
import { createExtensionCommandClient, createRunCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const envelope = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    params: z
      .object({
        commandId: z.string().optional(),
        input: z.object({ id: z.string().optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
function parse(message: string | Buffer) {
  try {
    return envelope.safeParse(JSON.parse(String(message)))
  } catch {
    return null
  }
}

for (const locale of ['en-US', 'zh-CN'] as const)
  test(`plugin detail activation uses one owner and real Host facts: ${locale}`, async ({ browser }, info) => {
    test.setTimeout(180_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-plugin-actions-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    let releaseAck: (() => void) | undefined
    let releaseWrite: (() => void) | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 44955) })
      const target = host
      const extensions = createExtensionCommandClient(host.client)
      for (const id of ['action-a', 'action-b']) {
        const source = join(root, id)
        await mkdir(source)
        await writeFile(
          join(source, 'package.json'),
          JSON.stringify({
            name: id,
            version: '1.0.0',
            type: 'module',
            hbar: { apiVersion: '^1.0.0', scope: 'global', host: './index.js' },
          }),
        )
        await writeFile(
          join(source, 'index.js'),
          `export default { manifest: { id: 'fixture', name: '${id} — 长名称与原目标识别', version: '1', apiVersion: '^1.0.0', description: 'A temporary real Host activation fixture.', scope: 'host', permissions: [] }, apply() {} }`,
        )
        await extensions.execute('plugin.install', { path: source })
      }
      const pluginA = await extensions.execute('plugin.inspect', { id: 'action-a' })
      const pluginB = await extensions.execute('plugin.inspect', { id: 'action-b' })
      const required = (await extensions.execute('plugin.list', {})).find((plugin) => plugin.required)
      if (!pluginA || !pluginB || !required) throw new Error('Real fixture plugin facts are missing')
      const copy = getShellCopy(locale)
      const labels = copy.extensions
      const actions = labels.detail.actions
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 44957}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const captureDir = join(
        process.cwd(),
        'artifacts',
        'desktop-entry-matrix',
        'extensions-action',
        'screenshots',
        locale,
      )
      await mkdir(captureDir, { recursive: true })
      const shot = async (name: string) => {
        const path = join(captureDir, name)
        await page.screenshot({ path })
        await info.attach(name, { path, contentType: 'image/png' })
      }
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      let fault: 'none' | 'delayAck' | 'lateUnknown' = 'none'
      let readFailure = false
      let writes = 0
      const heldReplies = new Map<string, 'delayAck' | 'drop'>()
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((message) => {
          const parsed = parse(message)
          if (parsed?.success && readFailure && parsed.data.params?.commandId === 'plugin.inspect') {
            readFailure = false
            socket.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: parsed.data.id,
                error: { code: -32603, message: 'Read failure fixture', data: 'DISCONNECTED' },
              }),
            )
            return
          }
          if (parsed?.success && ['plugin.enable', 'plugin.disable'].includes(parsed.data.params?.commandId ?? '')) {
            writes++
            const id = parsed.data.id
            if (fault === 'delayAck') {
              heldReplies.set(String(id), 'delayAck')
              fault = 'none'
            } else if (fault === 'lateUnknown') {
              heldReplies.set(String(id), 'drop')
              releaseWrite = () => server.send(message)
              fault = 'none'
              socket.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  error: { code: -32603, message: 'Lost response fixture', data: 'RESULT_UNKNOWN' },
                }),
              )
              return
            }
          }
          server.send(message)
        })
        server.onMessage((message) => {
          const parsed = parse(message)
          const id = parsed?.success ? String(parsed.data.id) : ''
          const disposition = heldReplies.get(id)
          if (disposition) {
            heldReplies.delete(id)
            if (disposition === 'delayAck') releaseAck = () => socket.send(message)
            return
          }
          socket.send(message)
        })
      })
      await page.goto(base)
      // Finish an actual session navigation before opening Settings; don't race startup restore.
      await page.getByRole('button', { name: copy.shell.openSession(target.ready.sessionTitle), exact: true }).click()
      await expect(page.getByRole('heading', { name: target.ready.sessionTitle, exact: true, level: 1 })).toBeVisible()
      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await page
        .getByRole('navigation', { name: copy.settings.groups })
        .getByRole('button', { name: copy.settings.resolve('i18n:settings.groups.extensions'), exact: true })
        .click()
      const workspace = page.locator('.hbar-app-react-extension-workspace')
      const detail = workspace.locator('.hbar-app-react-plugin-detail')
      const filter = workspace.getByRole('textbox', { name: labels.filter, exact: true })
      const open = async (id: string, name: string) => {
        await filter.fill(id)
        await workspace.getByRole('button', { name: labels.inspect(name), exact: true }).focus()
        await page.keyboard.press('Enter')
        await expect(detail.getByRole('heading', { name, exact: true })).toBeVisible()
      }
      const back = async () => {
        await detail.getByRole('button', { name: labels.detail.back, exact: true }).focus()
        await page.keyboard.press('Enter')
      }
      await open('action-a', pluginA.name)
      await expect(detail).toContainText(labels.detail.installScope.global)
      await expect(detail).toContainText(actions.scope)
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await expect(detail.getByRole('button', { name: actions.disable, exact: true })).toBeVisible()
        expect(await detail.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await shot(`detail-action-${locale}-${width}.png`)
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      await detail.getByRole('button', { name: actions.disable, exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(detail).toContainText(actions.confirmed)
      expect((await extensions.execute('plugin.inspect', { id: 'action-a' }))?.status).toBe('disabled')
      await expect(detail.getByRole('button', { name: actions.enable, exact: true })).toBeVisible()
      await back()
      await expect(filter).toHaveValue('action-a')
      await expect(workspace.getByRole('button', { name: labels.inspect(pluginA.name), exact: true })).toBeFocused()
      await open('action-a', pluginA.name)
      await detail.getByRole('button', { name: actions.enable, exact: true }).click()
      await expect
        .poll(async () => (await extensions.execute('plugin.inspect', { id: 'action-a' }))?.status)
        .toBe('active')
      await expect(detail).toContainText(actions.confirmed)

      // The Host genuinely has an approval-blocked Run, not a fake pending flag.
      const runs = createRunCommandClient(target.client)
      const run = await runs.execute(
        'run.submit',
        {
          sessionId: target.ready.sessionId,
          modelId: 'local-fixture',
          input: { text: '/tool write_file {"path":"busy-proof.txt","text":"fixture"}', images: [], approval: 'ask' },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: run.operationId })).status)
        .toBe('waiting_approval')
      await detail.getByRole('button', { name: actions.disable, exact: true }).click()
      await expect(detail.getByRole('alert')).toHaveText(actions.error('BUSY'))
      await shot(`detail-host-busy-${locale}-1440.png`)
      expect((await extensions.execute('plugin.inspect', { id: 'action-a' }))?.status).toBe('active')
      await runs.execute('operation.cancel', { operationId: run.operationId })
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: run.operationId })).status)
        .toBe('cancelled')

      fault = 'delayAck'
      await detail.getByRole('button', { name: actions.disable, exact: true }).click()
      await expect(detail.getByRole('button', { name: actions.pending, exact: true })).toBeDisabled()
      await shot(`detail-pending-${locale}-1440.png`)
      await expect.poll(() => Boolean(releaseAck)).toBe(true)
      await back()
      await open('action-b', pluginB.name)
      releaseAck?.()
      releaseAck = undefined
      await expect(detail.getByRole('heading', { name: pluginB.name, exact: true })).toBeVisible()
      await expect(detail.getByRole('button', { name: actions.disable, exact: true })).toBeVisible()
      expect((await extensions.execute('plugin.inspect', { id: 'action-a' }))?.status).toBe('disabled')

      // The request has not reached Host yet: observing "active" cannot prove it will never arrive.
      fault = 'lateUnknown'
      await detail.getByRole('button', { name: actions.disable, exact: true }).click()
      await expect(detail).toContainText(actions.unknown)
      const count = writes
      await expect(detail.getByRole('button', { name: actions.disable, exact: true })).toHaveCount(0)
      await detail.getByRole('button', { name: actions.readCurrent, exact: true }).click()
      await expect(detail.getByRole('heading', { name: pluginB.name, exact: true })).toBeVisible()
      expect((await extensions.execute('plugin.inspect', { id: 'action-b' }))?.status).toBe('active')
      await expect(detail).toContainText(actions.unknown)
      expect(writes).toBe(count)
      readFailure = true
      await detail.getByRole('button', { name: actions.readCurrent, exact: true }).click()
      await expect(detail.getByRole('alert')).toContainText('DISCONNECTED')
      await expect(detail).toContainText(actions.unknown)
      await expect(detail.getByRole('button', { name: actions.readCurrent, exact: true })).toBeEnabled()
      await shot(`detail-unknown-read-failure-${locale}-1440.png`)
      await detail.getByRole('button', { name: actions.readCurrent, exact: true }).click()
      await expect(detail.getByRole('heading', { name: pluginB.name, exact: true })).toBeVisible()
      releaseWrite?.()
      releaseWrite = undefined
      await expect
        .poll(async () => (await extensions.execute('plugin.inspect', { id: 'action-b' }))?.status)
        .toBe('disabled')
      await detail.getByRole('button', { name: actions.readCurrent, exact: true }).click()
      await expect(detail).toContainText(actions.unknown)
      await expect(detail.getByRole('button', { name: actions.enable, exact: true })).toHaveCount(0)
      await expect(detail).not.toContainText(actions.confirmed)
      expect(writes).toBe(count)
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await shot(`detail-unknown-${locale}-${width}.png`)
      }
      await back()
      await open(required.id, required.name)
      await expect(detail).toContainText(labels.detail.required)
      await expect(detail.getByRole('button', { name: actions.disable, exact: true })).toHaveCount(0)
      await shot(`detail-required-${locale}-320.png`)
      expect(errors).toEqual([])
    } finally {
      releaseAck?.()
      releaseWrite?.()
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
