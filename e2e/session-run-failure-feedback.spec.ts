import { expect, test } from '@playwright/test'
import { createRunCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { openSessionTool } from './support/session-tools-menu'

const rpcEnvelope = z
  .object({
    params: z
      .object({
        commandId: z.string().optional(),
        input: z
          .object({ sessionId: z.string().optional(), operationId: z.string().optional() })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

async function removeFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-run-failure-feedback-'))
    throw new Error('Unexpected run failure fixture cleanup path')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`run history belongs only to status and interruption feedback disappears on recovery: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-run-failure-feedback-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        sessionCount: 2,
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const client = host.client
      const directory = createWorkspaceSessionCommandClient(client)
      const sessions = await directory.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 20 })
      const first = sessions.items.find((item) => item.title === 'Session 001')
      const second = sessions.items.find((item) => item.title === 'Session 002')
      if (!first || !second) throw new Error('Run failure fixture requires two sessions')
      const runs = createRunCommandClient(client)
      const failed = await runs.execute(
        'run.submit',
        { sessionId: first.id, modelId: 'local-fixture', input: { text: '/fail', images: [] } },
        { idempotencyKey: crypto.randomUUID() },
      )
      const snapshot = (sessionId: string) => client.call('session.snapshot', { sessionId })
      await expect
        .poll(async () => (await snapshot(first.id)).runs.find((run) => run.id === failed.operationId)?.status)
        .toBe('failed')
      const failedSnapshot = await snapshot(first.id)
      const failedRun = failedSnapshot.runs.find((run) => run.id === failed.operationId)
      if (!failedRun || failedRun.status !== 'failed' || !failedRun.error)
        throw new Error('Fixture failed Run did not retain a visible error')

      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      const retryRequests: Array<{ sessionId: string; operationId: string }> = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.routeWebSocket('**/rpc', (socket) => {
        const server = socket.connectToServer()
        socket.onMessage((message) => {
          if (typeof message === 'string') {
            const envelope = rpcEnvelope.safeParse(JSON.parse(message))
            if (
              envelope.success &&
              envelope.data.params?.commandId === 'run.retry' &&
              envelope.data.params.input?.sessionId &&
              envelope.data.params.input.operationId
            )
              retryRequests.push({
                sessionId: envelope.data.params.input.sessionId,
                operationId: envelope.data.params.input.operationId,
              })
          }
          server.send(message)
        })
        server.onMessage((message) => socket.send(message))
      })
      await page.goto(base)
      const select = async (title: string) => {
        const entry = page.getByRole('treeitem', { name: title, exact: true })
        const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
        if (await showSidebar.isVisible()) await showSidebar.click()
        await expect(entry).toBeVisible()
        await entry.click()
        await expect(page.getByRole('tab', { name: title, exact: true })).toHaveAttribute('aria-selected', 'true')
      }
      await select(first.title)
      const conversation = page.locator('.hbar-app-react-session-workspace')
      const notice = conversation.locator('.hbar-session-interruption-notice')
      await expect(notice).toContainText(copy.session.interruption.status.failed)
      await expect(conversation.locator('.hbar-session-run-activity')).toHaveCount(0)
      await expect(conversation).not.toContainText(failedRun.error)
      await notice.getByRole('button', { name: copy.session.interruption.openStatus, exact: true }).click()
      const monitoring = page.locator('.hbar-app-react-session-monitoring')
      const activity = monitoring.locator('.hbar-session-run-activity')
      const failure = activity.locator(`[data-run-id="${failed.operationId}"]`)
      await expect(monitoring).toBeVisible()
      await expect(failure).toHaveAttribute('data-status', 'failed')
      await expect(failure).toContainText(failedRun.error)
      // Viewing an already open status pane must keep it open.
      await notice.getByRole('button', { name: copy.session.interruption.openStatus, exact: true }).click()
      await expect(monitoring).toBeVisible()

      const retry = failure.getByRole('button', { name: copy.session.runs.retryLabel, exact: true })
      await expect(retry).toBeVisible()
      const beforeRetry = (await snapshot(first.id)).runs.length
      await retry.click()
      await expect.poll(() => retryRequests.length).toBe(1)
      expect(retryRequests).toEqual([{ sessionId: first.id, operationId: failed.operationId }])
      await expect.poll(async () => (await snapshot(first.id)).runs.length).toBe(beforeRetry + 1)
      await expect
        .poll(async () => (await snapshot(first.id)).runs.filter((run) => run.status === 'failed').length)
        .toBe(2)

      const continuation = await runs.execute(
        'run.submit',
        {
          sessionId: first.id,
          modelId: 'local-fixture',
          input: { text: '/slow', images: [] },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect(page.locator('[data-session-live-status]')).toHaveAttribute('data-run-status', 'running')
      await expect(notice).toHaveCount(0)
      await expect(conversation.locator('.hbar-session-run-activity')).toHaveCount(0)
      await expect(conversation).not.toContainText(failedRun.error)
      const past = activity.locator('.hbar-session-run-history > .hbar-lumen-disclosure-trigger')
      await expect(past).toHaveAttribute('aria-expanded', 'false')
      await expect(failure).toBeHidden()
      await past.click()
      await expect(failure).toBeVisible()
      await expect(failure).toContainText(failedRun.error)
      await page.screenshot({ path: info.outputPath('clean-conversation-with-status-history.png') })
      await past.click()
      await runs.execute('operation.cancel', { operationId: continuation.operationId })
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: continuation.operationId })).status)
        .toBe('cancelled')
      await page.reload()
      await expect(page.getByRole('tab', { name: first.title, exact: true })).toHaveAttribute('aria-selected', 'true')
      await openSessionTool(page, copy.session.tools, 'monitoring')
      await expect(monitoring).toBeVisible()
      await expect(notice).toHaveCount(0)
      await expect(conversation.locator('.hbar-session-run-activity')).toHaveCount(0)
      await expect(past).toHaveAttribute('aria-expanded', 'false')

      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByRole('button', { name: copy.monitoring.close, exact: true }).click()
      await expect(conversation.locator('.hbar-session-run-activity')).toHaveCount(0)
      await page.screenshot({ path: info.outputPath('recovered-conversation-narrow.png') })

      await page.setViewportSize({ width: 1440, height: 900 })
      await select(second.title)
      await expect(page.locator('.hbar-app-react-session-workspace .hbar-session-run-activity')).toHaveCount(0)
      await expect(notice).toHaveCount(0)
      await expect(page.locator(`[data-run-id="${failed.operationId}"]`)).toHaveCount(0)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeFixture(root)
    }
  })
}
