import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

test('narrow touch model picker shows choices before requesting the keyboard', async ({ browser }) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-model-touch-'))
  let host: WebSessionHost | undefined
  const contexts = []
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
    const copy = getShellCopy('en-US')
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    for (const hasTouch of [false, true]) {
      const context = await browser.newContext({
        locale: 'en-US',
        viewport: { width: 1440, height: 900 },
        hasTouch,
        isMobile: hasTouch,
      })
      contexts.push(context)
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      await page.setViewportSize({ width: 320, height: 900 })
      const trigger = page.locator('.hbar-composer-model-trigger')
      await trigger.click()
      const popup = page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })
      const search = popup.getByRole('searchbox', { name: copy.session.modelPicker.search, exact: true })
      await expect(popup).toBeVisible()
      await expect(popup.getByRole('option').first()).toBeVisible()
      if (hasTouch) await expect(search).not.toBeFocused()
      else await expect(search).toBeFocused()
      await search.click()
      await expect(search).toBeFocused()
      await search.fill('fixture')
      await expect(popup.getByRole('option').first()).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(321)
    }
  } finally {
    for (const context of contexts) await context.close()
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
