import { expect, test } from '@playwright/test'
import { createRunCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`queued card removal never stops the active Run: ${locale}`, async ({ browser }, testInfo) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-queued-remove-e2e-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const target = host
      const sessionId = host.ready.sessionId
      const runs = createRunCommandClient(host.client)
      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const active = await runs.execute(
        'run.submit',
        {
          sessionId,
          modelId: 'local-fixture',
          input: {
            text: '/tool write_file {"path":"must-not-write.txt","text":"should not be written"}',
            images: [],
            approval: 'ask',
          },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await target.client.call('session.snapshot', { sessionId })).approvals.length)
        .toBe(1)
      const queued = await runs.execute(
        'run.submit',
        { sessionId, modelId: 'local-fixture', input: { text: '待发消息 — please verify the diff first', images: [] } },
        { idempotencyKey: crypto.randomUUID() },
      )
      const card = page.locator('.hbar-queued-user-run').filter({ hasText: 'please verify the diff first' })
      await expect(card).toBeVisible()
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await expect(card).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
        await page.screenshot({ path: testInfo.outputPath(`queued-remove-before-${locale}-${width}.png`) })
      }
      await card.getByRole('button', { name: copy.session.queuedUserRuns.remove(1) }).click()
      await expect(card).toHaveCount(0)
      expect((await runs.execute('operation.get', { operationId: queued.operationId })).status).toBe('cancelled')
      expect((await runs.execute('operation.get', { operationId: active.operationId })).status).toBe('waiting_approval')
      const events = await host.client.call('session.snapshot', { sessionId, limit: 40 })
      expect(events.runs.find((run) => run.id === queued.operationId)?.status).toBe('cancelled')
      expect(events.messages.some((message) => message.runId === queued.operationId)).toBe(false)
      expect(errors).toEqual([])
      await page.screenshot({ path: testInfo.outputPath(`queued-remove-after-${locale}-320.png`) })
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
