import { expect, test } from '@playwright/test'
import { createNotificationCommandClient, createRunCommandClient } from '@hbar/client'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { notificationCopy } from '../apps/web/src/notification-copy'
import { removeOwnedFixtureDirectory } from './support/owned-fixture-directory'
import { startWebSessionHost, stopWebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`notification preferences retain their draft through live updates and confirmed saves: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(60_000)
    const prefix = 'hbar-notification-preferences-live-'
    const root = await mkdtemp(join(tmpdir(), prefix))
    const host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
      goalAutoContinue: false,
      budgetAutoContinue: false,
    })
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    const copy = notificationCopy(locale)
    const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    try {
      await context.addInitScript((language) => localStorage.setItem('hbar:web:language', language), locale)
      expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(origin)
      await page.getByRole('button', { name: copy.bell(0), exact: true }).click()
      await page.getByRole('button', { name: copy.preferencesTab, exact: true }).click()
      const toggleName = copy.toggle(copy.eventKinds['run.completed'], copy.inApp)
      const toggle = page.getByRole('switch', { name: toggleName, exact: true })
      const save = page.getByRole('button', { name: copy.save, exact: true })
      await expect(toggle).toBeChecked()
      await toggle.click()
      await expect(toggle).not.toBeChecked()
      await expect(save).toBeEnabled()
      const runs = createRunCommandClient(host.client)
      const receipt = await runs.execute(
        'run.submit',
        {
          sessionId: host.ready.sessionId,
          modelId: 'local-fixture',
          input: { text: 'preferences live update', images: [] },
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(async () => (await runs.execute('operation.get', { operationId: receipt.operationId })).status)
        .toBe('completed')
      await expect(page.getByRole('button', { name: copy.bell(1), exact: true })).toBeVisible()
      await expect(toggle).not.toBeChecked()
      await expect(save).toBeEnabled()
      await page.screenshot({ path: testInfo.outputPath('preferences-unsaved-live-1440.png') })
      await save.click()
      const notifications = createNotificationCommandClient(host.client)
      await expect.poll(async () => (await notifications.preferences())['run.completed'].inApp).toBe(false)
      await page.reload()
      await page.getByRole('button', { name: copy.bell(1), exact: true }).click()
      await page.getByRole('button', { name: copy.preferencesTab, exact: true }).click()
      await expect(page.getByRole('switch', { name: toggleName, exact: true })).not.toBeChecked()
      await page.screenshot({ path: testInfo.outputPath('preferences-saved-1440.png') })
      await page.setViewportSize({ width: 320, height: 800 })
      await expect(page.getByRole('switch', { name: toggleName, exact: true })).not.toBeChecked()
      await page.screenshot({ path: testInfo.outputPath('preferences-saved-320.png') })
      expect(errors).toEqual([])
    } finally {
      await context.close()
      await stopWebSessionHost(host)
      await removeOwnedFixtureDirectory(root, prefix)
    }
  })
}
