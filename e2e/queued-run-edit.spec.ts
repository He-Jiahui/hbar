import { expect, test } from '@playwright/test'
import { createRunCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`queued message edits in place at desktop and narrow width: ${locale}`, async ({ browser }, testInfo) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-queued-edit-e2e-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const sessionId = host.ready.sessionId
      const runs = createRunCommandClient(host.client)
      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
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
        .poll(async () => (await host!.client.call('session.snapshot', { sessionId })).approvals.length)
        .toBe(1)
      const original = 'Queued text with a full tail '.repeat(20)
      const queued = await runs.execute(
        'run.submit',
        {
          sessionId,
          modelId: 'local-fixture',
          input: { text: original, images: [] },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      const card = page.locator('.hbar-queued-user-run').first()
      await expect(card).toBeVisible()
      await expect(card).toContainText(original.slice(0, 60))
      await card.getByRole('button', { name: copy.session.queuedUserRuns.edit(1) }).click()
      const input = card.getByRole('textbox', { name: copy.session.queuedUserRuns.editInput(1) })
      await expect(input).toHaveValue(original)
      await input.fill('  ')
      await expect(card.getByRole('button', { name: copy.session.queuedUserRuns.saveEdit })).toBeDisabled()
      await input.fill('Edit cancelled')
      await input.press('Escape')
      await expect(card.getByRole('textbox')).toHaveCount(0)
      expect(
        (await host.client.call('session.snapshot', { sessionId })).runs.find((run) => run.id === queued.operationId)
          ?.input.text,
      ).toBe(original)
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await card.getByRole('button', { name: copy.session.queuedUserRuns.edit(1) }).click()
        await expect(input).toHaveValue(original)
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
        await page.screenshot({ path: testInfo.outputPath(`queued-edit-${locale}-${width}.png`) })
        if (width === 1440) await input.press('Escape')
      }
      await input.fill('Edited queued message')
      await input.press('Enter')
      await expect(card).toContainText('Edited queued message')
      await expect(card.getByRole('textbox')).toHaveCount(0)
      expect(
        (await host.client.call('session.snapshot', { sessionId })).runs.find((run) => run.id === queued.operationId)
          ?.input.text,
      ).toBe('Edited queued message')
      expect((await runs.execute('operation.get', { operationId: active.operationId })).status).toBe('waiting_approval')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
