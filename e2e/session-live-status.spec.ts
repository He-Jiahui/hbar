import { expect, test } from '@playwright/test'
import { createRunCommandClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const prefix = 'hbar-session-live-status-'
async function cleanupFixture(root: string) {
  const exact = resolve(root)
  if (dirname(exact) !== resolve(tmpdir()) || !basename(exact).startsWith(prefix))
    throw new Error('Refusing to remove an unowned live-status fixture')
  await rm(exact, { recursive: true, force: true })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`real Host current Run stays visible at the bottom through approval, queuing and session switch: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(60_000)
    const root = await mkdtemp(join(tmpdir(), prefix))
    const context = await browser.newContext({ locale, colorScheme: 'light', viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const runs = createRunCommandClient(host.client)
      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      const originalSession = page.getByRole('button', {
        name: copy.shell.openSession(host.ready.sessionTitle),
        exact: true,
      })
      await originalSession.click()
      const status = page.locator('[data-session-live-status]')
      await expect(status).toHaveCount(0)
      const original = await runs.execute(
        'run.submit',
        {
          sessionId: host.ready.sessionId,
          modelId: 'local-fixture',
          input: {
            text: '/tool write_file {"path":"unapproved-live-status.txt","text":"never approve"}',
            images: [],
            approval: 'ask',
          },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect(status).toHaveAttribute('data-session-live-status', original.operationId)
      await expect(status).toHaveAttribute('data-run-status', 'waiting_approval')
      await expect(status).toContainText(copy.session.liveStatus.statusLabel('waiting_approval'))
      expect(await status.evaluate((element) => element.closest('.lumen-conversation-messages') === null)).toBe(true)
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await expect(status).toBeVisible()
        expect(await status.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
        await page.screenshot({ path: info.outputPath(`live-status-${locale}-${width}.png`) })
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await showSidebar.isVisible()) await showSidebar.click()
      const queued = await runs.execute(
        'run.submit',
        {
          sessionId: host.ready.sessionId,
          modelId: 'local-fixture',
          input: { text: 'Queued local fixture', images: [], approval: 'ask' },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: queued.operationId })).status)
        .toBe('queued')
      await expect(status).toHaveAttribute('data-session-live-status', original.operationId)
      const other = await createWorkspaceSessionCommandClient(host.client).execute(
        'session.create',
        {
          workspaceId: host.ready.workspaceId,
          title: 'Independent status fixture session',
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await page.getByRole('button', { name: copy.shell.openSession(other.title), exact: true }).click()
      await expect(status).toHaveCount(0)
      const currentTitle = (await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).session
        .title
      await page.getByRole('button', { name: copy.shell.openSession(currentTitle), exact: true }).click()
      await expect(status).toHaveAttribute('data-session-live-status', original.operationId)
      const composer = page.locator('.lumen-prompt-composer')
      await composer.getByRole('button', { name: copy.session.prompt.stop, exact: true }).click()
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: original.operationId })).status)
        .toBe('cancelled')
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: queued.operationId })).status)
        .toBe('completed')
      await expect(status).toHaveCount(0)
      expect(errors).toEqual([])
    } finally {
      try {
        await context.close()
      } finally {
        try {
          if (host) await stopWebSessionHost(host)
        } finally {
          await cleanupFixture(root)
        }
      }
    }
  })
}
