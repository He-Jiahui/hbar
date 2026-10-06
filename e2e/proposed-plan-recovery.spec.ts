import { expect, test, type Locator, type Page, type WebSocketRoute } from '@playwright/test'
import {
  createConfigurationCommandClient,
  createRunCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { runAcceptedSchema, submitRunInputSchema } from '@hbar/contracts/commands/run'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const rpcSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    method: z.string().optional(),
    params: z.unknown().optional(),
    result: z.unknown().optional(),
  })
  .passthrough()
const invocationSchema = z
  .object({
    commandId: z.string(),
    input: z.unknown(),
    idempotencyKey: z.string().optional(),
  })
  .passthrough()
const receiptSchema = z.object({
  commandId: z.literal('run.submit'),
  sessionId: z.string(),
  idempotencyKey: z.string(),
})
type ReceiptFault = 'hold' | 'null' | 'normal'

/** The actual Host executes every request. Only this browser's reply/connection
 * is faulted; the persisted receipt and the independently connected Client remain real. */
async function receiptBoundary(page: Page) {
  const commands: string[] = []
  const writes: Array<{ sessionId: string; key: string; text: string; mode: string | undefined }> = []
  const receipts: Array<z.output<typeof receiptSchema>> = []
  const accepted: Array<z.output<typeof runAcceptedSchema>> = []
  const transportErrors: string[] = []
  const pending = new Map<string | number, 'submit' | ReceiptFault>()
  const connections = new Set<{ socket: WebSocketRoute; server: WebSocketRoute }>()
  let fault: ReceiptFault = 'normal'
  let offline = false
  let lost = false
  let held: { release: (failure?: boolean) => void } | null = null
  await page.routeWebSocket('**/rpc', (socket) => {
    if (offline) {
      void socket.close({ code: 1013, reason: 'Owned proposal fixture is offline' }).catch((error: unknown) => {
        transportErrors.push(String(error))
      })
      return
    }
    const server = socket.connectToServer()
    const connection = { socket, server }
    connections.add(connection)
    socket.onClose(() => {
      connections.delete(connection)
      void server.close().catch((error: unknown) => {
        transportErrors.push(String(error))
      })
    })
    server.onClose(() => {
      connections.delete(connection)
      void socket.close().catch((error: unknown) => {
        transportErrors.push(String(error))
      })
    })
    socket.onMessage((message) => {
      if (typeof message === 'string') {
        const parsed = rpcSchema.safeParse(JSON.parse(message))
        if (parsed.success) {
          const rpc = parsed.data
          const invocation = rpc.method === 'command.execute' ? invocationSchema.parse(rpc.params) : null
          const command = invocation?.commandId ?? rpc.method
          if (command) commands.push(command)
          if (command === 'run.submit' && invocation && rpc.id !== undefined) {
            const input = submitRunInputSchema.parse(invocation.input)
            if (!invocation.idempotencyKey) throw new Error('Proposal request has no idempotency key')
            writes.push({
              sessionId: input.sessionId,
              key: invocation.idempotencyKey,
              text: input.input.text,
              mode: input.input.mode,
            })
            pending.set(rpc.id, 'submit')
          }
          if (command === 'command.getReceipt' && rpc.id !== undefined) {
            receipts.push(receiptSchema.parse(rpc.params))
            pending.set(rpc.id, fault)
          }
        }
      }
      server.send(message)
    })
    server.onMessage((message) => {
      if (typeof message === 'string') {
        const parsed = rpcSchema.safeParse(JSON.parse(message))
        if (parsed.success && parsed.data.id !== undefined) {
          const { id, result } = parsed.data
          const kind = pending.get(id)
          pending.delete(id)
          if (kind === 'submit' && !lost) {
            accepted.push(runAcceptedSchema.parse(result))
            lost = true
            socket.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id,
                error: { code: -32603, message: 'Owned fixture loses accepted ACK', data: 'RESULT_UNKNOWN' },
              }),
            )
            return
          }
          if (kind === 'hold') {
            held = {
              release: (failure = false) =>
                socket.send(
                  failure
                    ? JSON.stringify({
                        jsonrpc: '2.0',
                        id,
                        error: { code: -32603, message: 'Private fixture error must not appear', data: 'READ_FAILED' },
                      })
                    : message,
                ),
            }
            return
          }
          if (kind === 'null') {
            socket.send(JSON.stringify({ jsonrpc: '2.0', id, result: null }))
            return
          }
        }
      }
      socket.send(message)
    })
  })
  return {
    commands,
    writes,
    receipts,
    accepted,
    transportErrors,
    setFault(value: ReceiptFault) {
      fault = value
    },
    isHeld: () => held !== null,
    release(failure = false) {
      if (!held) throw new Error('No actual Host receipt reply is held')
      const current = held
      held = null
      current.release(failure)
    },
    async setOffline(value: boolean) {
      offline = value
      if (value)
        for (const connection of [...connections]) {
          await connection.socket.close({ code: 1012, reason: 'Owned proposal reconnect fixture' })
          await connection.server.close()
          connections.delete(connection)
        }
    },
  }
}

async function cleanup(root: string) {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-proposed-plan-recovery-'))
    throw new Error('Refusing cleanup outside the owned proposal fixture')
  await rm(target, { recursive: true, force: true })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`unknown proposal only reads its original receipt through checking, failure, null and reconnect: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(150_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-proposed-plan-recovery-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
      })
      const ownedHost = host
      const sessionId = host.ready.sessionId
      const copy = getShellCopy(locale)
      const labels = copy.session.proposedPlan
      const sessions = createWorkspaceSessionCommandClient(host.client)
      const other = await sessions.execute(
        'session.create',
        {
          workspaceId: host.ready.workspaceId,
          title: 'Other B — 独立草稿',
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await createConfigurationCommandClient(host.client).execute('mode.set', { sessionId, mode: 'plan' })
      const runs = createRunCommandClient(host.client)
      const markdown = `# Receipt-owned proposal — ${locale}\n\n1. Preserve the independent composer draft.\n2. Verify the same request without replay.`
      const seed = await runs.execute(
        'run.submit',
        {
          sessionId,
          modelId: 'local-fixture',
          input: {
            text: `Receipt recovery context — ${locale}\n\n<proposed_plan>\n${markdown}\n</proposed_plan>\n\nReview the original request.`,
            mode: 'plan',
            images: [],
          },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: seed.operationId })).status)
        .toBe('completed')
      const snapshot = await host.client.call('session.snapshot', { sessionId })
      const originalSession = await host.client.call('session.get', { sessionId })
      if (!originalSession) throw new Error('The original proposal session disappeared')
      const message = snapshot.messages.find((item) => item.runId === seed.operationId && item.role === 'assistant')
      if (!message) throw new Error('The real Demo planning Run did not produce a proposal')
      const baseline = {
        mode: await host.client.call('mode.get', { sessionId }),
        permission: await host.client.call('permission.get', {}),
        goal: await host.client.call('goal.get', { sessionId }),
        progress: await host.client.call('plan.get', { sessionId }),
      }
      expect(baseline.mode).toEqual({ mode: 'plan' })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const boundary = await receiptBoundary(page)
      await page.goto(base)
      if (process.env.HBAR_E2E_EXPECT_ASSET)
        await expect(page.locator('script[src*="/assets/index-"]')).toHaveAttribute(
          'src',
          `/assets/${process.env.HBAR_E2E_EXPECT_ASSET}`,
        )
      const select = async (title: string) => {
        const entry = page.getByRole('treeitem', { name: title, exact: true })
        const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
        await expect.poll(async () => (await entry.isVisible()) || (await show.isVisible())).toBe(true)
        if (await show.isVisible()) await show.click()
        await entry.click()
        await expect(page.getByRole('tab', { name: title, exact: true })).toHaveAttribute('aria-selected', 'true')
      }
      await select(originalSession.title)
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = `Original unsent A draft — 原稿不发送 ${locale}`
      const attachmentName = 'original-plan-draft-原附件.txt'
      await expect(prompt).toBeEditable()
      await prompt.fill(draft)
      await page.locator('.hbar-composer-attachment-target input[type=file]').setInputFiles({
        name: attachmentName,
        mimeType: 'text/plain',
        buffer: Buffer.from('Never belongs to the detached proposal Run'),
      })
      const attachment = page.locator('.lumen-attachment-chip').filter({ hasText: attachmentName })
      await expect(attachment).toBeVisible()
      const proposal = page.locator(`.hbar-proposed-plan[data-proposal-message="${message.id}"]`)
      await expect(proposal.locator('.hbar-proposed-plan-scope')).toHaveText(labels.scope)
      const implement = proposal.getByRole('button', { name: labels.implement, exact: true })
      const planning = proposal.getByRole('button', { name: labels.continuePlanning, exact: true })
      const check = proposal.getByRole('button', { name: labels.reconcile, exact: true })
      const preserve = async () => {
        await expectComposerText(prompt, draft)
        await expect(attachment).toBeVisible()
        expect(await ownedHost.client.call('mode.get', { sessionId })).toEqual({ mode: 'default' })
      }
      const stateBounds = async (target: Locator) => {
        await expect(target).toBeInViewport({ timeout: 500 })
        const measured = await target.evaluate((element) => {
          const box = element.getBoundingClientRect()
          const pane = element.closest('.lumen-conversation-messages')?.getBoundingClientRect()
          if (!pane) throw new Error('The proposal status is not owned by the message viewport')
          const clip = {
            left: Math.max(pane.left, 0),
            top: Math.max(pane.top, 0),
            right: Math.min(pane.right, innerWidth),
            bottom: Math.min(pane.bottom, innerHeight),
          }
          return { box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom }, clip }
        })
        const geometry = JSON.stringify(measured)
        // Scroll snapping and fractional pane borders may leave a sub-2px edge
        // outside the clip without hiding the control or its text.
        expect(measured.box.left, geometry).toBeGreaterThanOrEqual(measured.clip.left - 2)
        expect(measured.box.top, geometry).toBeGreaterThanOrEqual(measured.clip.top - 2)
        expect(measured.box.right, geometry).toBeLessThanOrEqual(measured.clip.right + 1)
        expect(measured.box.bottom, geometry).toBeLessThanOrEqual(measured.clip.bottom + 1)
        return measured
      }
      const capture = async (phase: string) => {
        const busy = copy.session.proposedPlanAvailability('busy')
        if (!busy) throw new Error('The Host copy omitted the active-run explanation')
        // The original write is unknown, not an active Run: the independent
        // Host has already confirmed that operation completed before these phases.
        await expect(proposal).not.toContainText(busy)
        for (const width of [1440, 320]) {
          await page.setViewportSize({ width, height: 960 })
          // Explicit user scrolling leaves follow-latest before inspecting an
          // older source card. A new live row must not be mistaken for that card.
          await page.locator('.lumen-conversation-messages').hover()
          await page.mouse.wheel(0, -2_000)
          await proposal.scrollIntoViewIfNeeded()
          await page.screenshot({ path: testInfo.outputPath(`${phase}-scope-${locale}-${width}.png`) })
          // Disconnect notices and responsive composer wrapping can change the
          // pane after the viewport resize. Re-seek the real target and require
          // the full measured intersection; never sleep or accept a clipped state.
          await expect(async () => {
            await proposal.getByRole('status').scrollIntoViewIfNeeded()
            if (phase === 'read-failed') await proposal.getByRole('alert').scrollIntoViewIfNeeded()
            await stateBounds(proposal.getByRole('status'))
            if (phase !== 'accepted') await stateBounds(check)
            if (phase === 'read-failed') await stateBounds(proposal.getByRole('alert'))
          }).toPass({ timeout: 10_000 })
          const state = await stateBounds(proposal.getByRole('status'))
          const control = phase !== 'accepted' ? await stateBounds(check) : null
          const alert = phase === 'read-failed' ? await stateBounds(proposal.getByRole('alert')) : null
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          await writeFile(
            testInfo.outputPath(`${phase}-state-${locale}-${width}.json`),
            JSON.stringify({ phase, locale, width, state, control, alert }, null, 2),
          )
          await page.screenshot({ path: testInfo.outputPath(`${phase}-state-${locale}-${width}.png`) })
        }
      }
      await implement.click()
      await expect(proposal.getByRole('status')).toHaveText(labels.unknown)
      await expect(check).toBeEnabled()
      await expect(implement).toBeDisabled()
      await expect(planning).toBeDisabled()
      expect(boundary.writes).toHaveLength(1)
      expect(boundary.accepted).toHaveLength(1)
      const acceptedRun = boundary.accepted[0]
      if (!acceptedRun) throw new Error('The actual accepted Run receipt is missing')
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: acceptedRun.operationId })).status)
        .toBe('completed')
      await preserve()
      await capture('unknown')

      boundary.setFault('hold')
      await check.click()
      await expect.poll(boundary.isHeld).toBe(true)
      await expect(check).toBeDisabled()
      await expect(proposal.getByRole('status')).toHaveText(labels.checking)
      await capture('checking')
      await check.dispatchEvent('click')
      expect(boundary.receipts).toHaveLength(1)
      boundary.release(true)
      await expect(proposal.getByRole('status')).toHaveText(labels.unknown)
      await expect(proposal.getByRole('alert')).toBeVisible()
      await expect(proposal.getByRole('alert')).toHaveText(labels.error('READ_FAILED'))
      await expect(proposal.getByRole('alert')).not.toContainText('READ_FAILED')
      await expect(proposal).not.toContainText('Private fixture error')
      await expect(check).toBeEnabled()
      await preserve()
      await capture('read-failed')

      boundary.setFault('null')
      await check.click()
      await expect.poll(() => boundary.receipts.length).toBe(2)
      await expect(check).toBeEnabled()
      await expect(proposal.getByRole('status')).toHaveText(labels.unknown)
      await expect(implement).toBeDisabled()
      await expect(planning).toBeDisabled()
      await expect(proposal.getByRole('alert')).toHaveCount(0)
      await preserve()
      await capture('null-still-unknown')

      await boundary.setOffline(true)
      await expect(check).toBeDisabled()
      await expect(proposal.getByRole('status')).toHaveText(labels.unknown)
      await capture('offline')
      expect(boundary.receipts).toHaveLength(2)
      await boundary.setOffline(false)
      await expect(check).toBeEnabled({ timeout: 30_000 })
      await select(other.title)
      await prompt.fill('Independent B draft — 独立B草稿')
      await expect(page.locator('.hbar-proposed-plan')).toHaveCount(0)
      await select(originalSession.title)
      await preserve()
      await expect(proposal.getByRole('status')).toHaveText(labels.unknown)

      boundary.setFault('hold')
      await check.click()
      await expect.poll(boundary.isHeld).toBe(true)
      await expect(proposal.getByRole('status')).toHaveText(labels.checking)
      // A deliberate focus move while the exact read is pending must win over
      // accepted-card fallback. The other locale covers fallback from the removed button.
      if (locale === 'zh-CN') await prompt.focus()
      boundary.release()
      await expect(proposal.getByRole('status')).toHaveText(labels.accepted)
      await expect(proposal.getByRole('button')).toHaveCount(0)
      await expect(proposal.getByRole('textbox')).toHaveCount(0)
      if (locale === 'zh-CN') await expect(prompt).toBeFocused()
      else await expect(proposal).toBeFocused()
      await preserve()
      await capture('accepted')
      expect(boundary.writes).toHaveLength(1)
      expect(boundary.receipts).toHaveLength(3)
      const request = boundary.writes[0]
      if (!request) throw new Error('The browser did not submit the proposal')
      expect(boundary.receipts).toEqual(
        Array.from({ length: 3 }, () => ({ commandId: 'run.submit', sessionId, idempotencyKey: request.key })),
      )
      expect(request).toMatchObject({ sessionId, mode: 'default' })
      expect(request.text).toContain(markdown)
      expect(request.text).not.toContain(draft)
      const actual = await host.client.call('session.snapshot', { sessionId })
      expect(actual.runs).toHaveLength(2)
      const implementation = actual.runs.find((run) => run.id === boundary.accepted[0]?.operationId)
      expect(implementation?.input).toMatchObject({ mode: 'default', images: [], files: [], source: 'user' })
      expect(await host.client.call('permission.get', {})).toEqual(baseline.permission)
      expect(await host.client.call('goal.get', { sessionId })).toEqual(baseline.goal)
      expect(await host.client.call('plan.get', { sessionId })).toEqual(baseline.progress)
      expect(boundary.commands.filter((command) => command === 'mode.set')).toHaveLength(1)
      expect((await host.client.call('session.snapshot', { sessionId: other.id })).runs).toHaveLength(0)
      expect(
        boundary.commands.filter((command) => ['run.retry', 'goal.create', 'goal.set', 'goal.clear'].includes(command)),
      ).toEqual([])
      expect(errors).toEqual([])
      expect(boundary.transportErrors).toEqual([])
      await writeFile(
        testInfo.outputPath('facts.json'),
        JSON.stringify(
          {
            locale,
            asset: process.env.HBAR_E2E_EXPECT_ASSET,
            seedRun: seed.operationId,
            browserWrites: boundary.writes,
            receiptReads: boundary.receipts,
            exactAccepted: boundary.accepted,
            totalARuns: actual.runs.length,
            totalBRuns: 0,
            pageErrors: errors,
          },
          null,
          2,
        ),
      )
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanup(root)
    }
  })
}
