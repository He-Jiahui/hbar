import { expect, test } from '@playwright/test'
import { createRunCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function cleanupFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-session-activity-'))
    throw new Error('Refusing cleanup outside the owned Activity fixture')
  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 })
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`session Activity shows Host active runs and preserves their source: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-session-activity-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317), sessionCount: 2 })
      const sessionId = host.ready.sessionId
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const copy = getShellCopy(locale)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      const activity = page.getByRole('button', { name: copy.session.tools.activity, exact: true })
      await expect(activity).toBeVisible()
      await activity.click()
      const pane = page.locator('.hbar-session-activity-workspace')
      await expect(pane).toBeVisible()
      await expect(pane.getByText(copy.activity.empty, { exact: true })).toBeVisible()
      await expect(pane.getByRole('listitem')).toHaveCount(0)
      await pane.getByRole('button', { name: copy.activity.close, exact: true }).click()

      const text = `/tool write_file ${JSON.stringify({ path: 'activity-confirmed.txt', text: 'confirmed' })}`
      const runs = createRunCommandClient(host.client)
      const accepted = await runs.execute(
        'run.submit',
        { sessionId, modelId: 'local-fixture', input: { text, images: [], approval: 'ask' } },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
        .toBe('waiting_approval')
      await activity.click()
      await expect(pane.getByRole('listitem')).toHaveCount(1)
      await expect(pane.getByRole('listitem')).toContainText(copy.activity.status('waiting_approval'))
      expect((await runs.execute('session.activeOperations', { sessionId })).items[0]?.operationId).toBe(
        accepted.operationId,
      )
      await page.screenshot({ path: testInfo.outputPath(`activity-${locale}-1440.png`) })
      await page.setViewportSize({ width: 320, height: 720 })
      await expect(pane).toBeVisible()
      await expect(pane.getByRole('button', { name: copy.activity.close, exact: true })).toBeInViewport()
      await expect(pane.getByRole('listitem')).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`activity-${locale}-320.png`) })

      await pane.getByRole('button', { name: copy.activity.close, exact: true }).click()
      const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await showSidebar.isVisible()) await showSidebar.click()
      await page.getByRole('button', { name: copy.shell.openSession('Session 001'), exact: true }).click()
      await activity.click()
      await expect(pane.getByText(copy.activity.empty, { exact: true })).toBeVisible()
      await expect(pane.getByRole('listitem')).toHaveCount(0)
      await pane.getByRole('button', { name: copy.activity.close, exact: true }).click()
      if (await showSidebar.isVisible()) await showSidebar.click()
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      await activity.click()
      await expect(pane.getByRole('listitem')).toHaveCount(1)
      await pane.getByRole('button', { name: copy.activity.close, exact: true }).click()

      await page
        .getByRole('region', { name: copy.session.decisions.approval, exact: true })
        .getByRole('button', { name: copy.session.decisions.allow, exact: true })
        .click()
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status)
        .toBe('completed')
      await activity.click()
      await pane.getByRole('button', { name: copy.activity.refresh, exact: true }).click()
      await expect(pane.getByText(copy.activity.empty, { exact: true })).toBeVisible()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanupFixture(root)
    }
  })
}
