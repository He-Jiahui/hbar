import { expect, test } from '@playwright/test'
import { createConfigurationCommandClient, createRunCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const rpc = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    method: z.string().optional(),
    params: z.unknown().optional(),
  })
  .passthrough()
const invocation = z.object({ commandId: z.string(), input: z.unknown() }).passthrough()

async function cleanupFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-proposal-mode-exit-'))
    throw new Error('Refusing cleanup outside the owned proposal fixture')
  await rm(target, { recursive: true, force: true })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`uncertain Plan exit pauses proposal implementation until Host confirmation: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-proposal-mode-exit-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        budgetAutoContinue: false,
      })
      const selectedHost = host
      const sessionId = host.ready.sessionId
      const configuration = createConfigurationCommandClient(host.client)
      await configuration.execute('mode.set', { sessionId, mode: 'plan' })
      const runs = createRunCommandClient(host.client)
      const accepted = await runs.execute(
        'run.submit',
        {
          sessionId,
          modelId: 'local-fixture',
          input: {
            text: `Plan review context\n\n<proposed_plan>\n# Verify mode exit\n\n1. Implement one change.\n</proposed_plan>\n\nAwait implementation.`,
            images: [],
            mode: 'plan',
          },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
        .toBe('completed')
      const snapshot = await host.client.call('session.snapshot', { sessionId })
      const session = await host.client.call('session.get', { sessionId })
      const message = snapshot.messages.find((item) => item.runId === accepted.operationId && item.role === 'assistant')
      if (!session || !message) throw new Error('The proposal fixture did not produce a session and assistant message')

      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const modeRequests = new Set<string | number>()
      let modeWrites = 0
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((data) => {
          if (typeof data === 'string') {
            const parsed = rpc.safeParse(JSON.parse(data))
            const call =
              parsed.success && parsed.data.method === 'command.execute'
                ? invocation.safeParse(parsed.data.params)
                : null
            if (call?.success && call.data.commandId === 'mode.set' && parsed.success && parsed.data.id !== undefined) {
              modeRequests.add(parsed.data.id)
              modeWrites += 1
            }
          }
          server.send(data)
        })
        server.onMessage((data) => {
          if (typeof data === 'string') {
            const parsed = rpc.safeParse(JSON.parse(data))
            if (parsed.success && parsed.data.id !== undefined && modeRequests.delete(parsed.data.id)) {
              socket.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id: parsed.data.id,
                  error: { code: -32603, message: 'Owned fixture loses Plan exit ACK', data: 'RESULT_UNKNOWN' },
                }),
              )
              return
            }
          }
          socket.send(data)
        })
      })
      const copy = getShellCopy(locale)
      await page.goto(base)
      await page.getByRole('treeitem', { name: session.title, exact: true }).click()
      const proposal = page.locator(`[data-message-id="${message.id}"] .hbar-proposed-plan`)
      await expect(proposal).toBeVisible()
      await proposal.getByRole('button', { name: copy.session.proposedPlan.implement, exact: true }).click()
      await expect(proposal.getByRole('status')).toHaveText(copy.session.proposedPlan.unknownPlanExit)
      await expect(proposal.getByRole('alert')).toHaveCount(0)
      const recheck = proposal.getByRole('button', { name: copy.session.proposedPlan.reconcilePlanExit, exact: true })
      await page.locator('.lumen-conversation-messages').hover()
      await page.mouse.wheel(0, -2_000)
      await recheck.scrollIntoViewIfNeeded()
      await expect(recheck).toBeInViewport()
      await page.screenshot({ path: testInfo.outputPath(`proposal-mode-unknown-${locale}-1440.png`) })
      await page.setViewportSize({ width: 320, height: 720 })
      await page.locator('.lumen-conversation-messages').hover()
      await page.mouse.wheel(0, -2_000)
      await recheck.scrollIntoViewIfNeeded()
      await expect(recheck).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`proposal-mode-unknown-${locale}-320.png`) })
      await page.setViewportSize({ width: 1440, height: 900 })
      expect(modeWrites).toBe(1)
      expect((await configuration.execute('mode.get', { sessionId })).mode).toBe('default')
      expect((await host.client.call('session.snapshot', { sessionId })).runs).toHaveLength(1)
      await recheck.click()
      await expect(proposal.getByRole('status')).toHaveText(copy.session.proposedPlan.accepted)
      await expect
        .poll(async () => (await selectedHost.client.call('session.snapshot', { sessionId })).runs.length)
        .toBe(2)
      const after = await host.client.call('session.snapshot', { sessionId })
      const implementation = after.runs.find((run) => run.id !== accepted.operationId)
      expect(implementation?.input).toMatchObject({ mode: 'default', source: 'user' })
      expect(modeWrites).toBe(1)
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanupFixture(root)
    }
  })
}
