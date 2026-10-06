import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`usage opens beside composer without hiding the conversation or reloading facts: ${locale}`, async ({
    browser,
  }) => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-usage-entry-'))
    const context = await browser.newContext({ locale })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const copy = getShellCopy(locale)
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      const calls: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('websocket', (socket) => socket.on('framesent', (event) => calls.push(String(event.payload))))
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await prompt.fill('Unsaved prompt preserved while inspecting usage — 未发送草稿')
      const trigger = page.locator('.hbar-session-usage-trigger')
      await expect(trigger).toContainText(copy.session.usage.budgetPercent(0))
      const reads = () => calls.filter((call) => /usage\.query|session\.getBudget|session\.getModel/.test(call)).length
      const before = reads()
      const dialog = page.getByRole('dialog', { name: copy.session.usage.title, exact: true })
      await expect(dialog).not.toBeVisible()
      await expect(page.locator('.hbar-app-react-session-footer > .lumen-inline-usage-surface')).toHaveCount(0)
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: width <= 390 ? 844 : 960 })
        await trigger.focus()
        await page.keyboard.press('Enter')
        await expect(dialog).toBeVisible()
        await expect(dialog.getByText(copy.session.usage.description, { exact: true })).toBeVisible()
        await expect(dialog.getByRole('button', { name: copy.session.usage.monitor })).toBeVisible()
        const bounds = await dialog.boundingBox()
        expect(bounds).not.toBeNull()
        expect(bounds!.x).toBeGreaterThanOrEqual(0)
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1)
        expect(bounds!.y).toBeGreaterThanOrEqual(0)
        expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
        for (const metric of await dialog.locator('.lumen-compact-metrics > div').all()) {
          const metricBounds = await metric.boundingBox()
          expect(metricBounds!.x).toBeGreaterThanOrEqual(bounds!.x)
          expect(metricBounds!.x + metricBounds!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width + 1)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/reference-ux-v2/hbar-usage-${locale}-${width}.png` })
        await dialog.getByRole('button', { name: copy.session.usage.close }).focus()
        await page.keyboard.press('Escape')
        await expect(dialog).not.toBeVisible()
        await expect(trigger).toBeFocused()
        await expectComposerText(prompt, 'Unsaved prompt preserved while inspecting usage — 未发送草稿')
        await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeVisible()
      }
      expect(reads()).toBe(before)
      await trigger.click()
      await dialog.getByRole('button', { name: copy.session.usage.monitor }).click()
      await expect(dialog).not.toBeVisible()
      await expect(page.locator('.hbar-app-react-session-monitoring')).toBeVisible()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
