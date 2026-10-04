import { expect, test } from '@playwright/test'
import { createSandboxCommandClient } from '@hbar/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`sandbox Settings remains reachable after loading and persists edits: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-sandbox-entry-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const sandbox = createSandboxCommandClient(host.client)
      const copy = getShellCopy(locale)
      const labels = copy.sandbox
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      const settings = page.getByRole('button', { name: copy.shell.settings, exact: true })
      await expect(settings.or(showSidebar)).toBeVisible()
      if (!(await settings.isVisible())) await showSidebar.click()
      await settings.click()
      await expect(page.locator('.hbar-app-react-provider-list')).toBeVisible()
      const groups = page.getByRole('navigation', { name: copy.settings.groups, exact: true })
      await groups.getByRole('button', { name: labels.title, exact: true }).click()
      const panel = page.locator('.hbar-sandbox-profiles')
      await expect(panel).toBeVisible()
      await expect(panel.locator('.hbar-sandbox-profiles-item')).toHaveCount(2)
      await panel.getByRole('button', { name: labels.create, exact: true }).click()
      await panel.getByRole('textbox', { name: labels.fields.id, exact: true }).fill('entry-profile')
      const name = locale === 'zh-CN' ? '沙盒入口保存与恢复' : 'Sandbox entry save and restore'
      await panel.getByRole('textbox', { name: labels.fields.name, exact: true }).fill(name)
      await panel.getByRole('combobox', { name: labels.fields.network, exact: true }).selectOption('disabled')
      await panel.getByRole('button', { name: labels.save, exact: true }).click()
      await expect(panel.getByText(labels.saved, { exact: true })).toBeVisible()
      const saved = await sandbox.execute('sandbox.get', { id: 'entry-profile' })
      expect(saved?.profile.name).toBe(name)
      expect(saved?.profile.extends).toBe(':workspace-write')
      expect(saved?.resolved?.network.enabled).toBe(false)
      await page.reload()
      await expect(settings.or(showSidebar)).toBeVisible()
      if (!(await settings.isVisible())) await showSidebar.click()
      await settings.click()
      await expect(panel).toBeVisible()
      await panel.locator('.hbar-sandbox-profiles-item').filter({ hasText: name }).click()
      await expect(panel.getByRole('textbox', { name: labels.fields.name, exact: true })).toHaveValue(name)
      await expect(panel.getByRole('combobox', { name: labels.fields.network, exact: true })).toHaveValue('disabled')
      await page.setViewportSize({ width: 320, height: 844 })
      await expect(page.getByRole('combobox', { name: copy.settings.groups, exact: true })).toHaveValue('sandbox')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/ui-repair/sandbox-${locale}-320.png` })
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
