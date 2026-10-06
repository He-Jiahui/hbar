import { expect, test, type Page } from '@playwright/test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSystemCommandClient } from '@hbar/client'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { openSessionTool } from './support/session-tools-menu'
import { selectLumenOption } from './support/lumen-controls'

async function selectDiagnostics(page: Page, locale: ShellLocale) {
  const copy = getShellCopy(locale)
  const mobile = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
  if (await mobile.isVisible()) await selectLumenOption(mobile, 'diagnostics')
  else
    await page
      .getByRole('navigation', { name: copy.settings.groups })
      .getByRole('button', { name: copy.diagnostics.title, exact: true })
      .click()
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`settings diagnostics reads the real Host and remains usable when disconnected: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-system-diagnostics-'))
    const context = await browser.newContext({ locale })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const diagnosis = await createSystemCommandClient(host.client).execute('system.diagnose', {})
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      const workspace = page.getByTitle(copy.shell.workspaceActions(host.ready.workspaceName), { exact: true })
      await workspace.waitFor({ state: 'attached' })
      const expand = page.getByRole('treeitem', { expanded: false, name: host.ready.workspaceName })
      if (await expand.isVisible()) await expand.click()
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await mkdir('artifacts/system-diagnostics', { recursive: true })
      for (const viewport of [
        { width: 1440, height: 960 },
        { width: 320, height: 720 },
      ]) {
        await page.setViewportSize(viewport)
        await openSessionTool(page, copy.session.tools, 'settings')
        await selectDiagnostics(page, locale)
        const region = page.getByRole('region', { name: copy.diagnostics.title })
        await expect(region.getByRole('heading', { name: copy.diagnostics.title })).toBeVisible()
        const hostRegion = region.getByRole('region', { name: copy.diagnostics.host })
        await expect(hostRegion.getByRole('heading', { name: copy.diagnostics.host })).toBeVisible()
        await expect(hostRegion.getByText(diagnosis.host.version, { exact: true })).toBeVisible()
        await expect(hostRegion.getByText(diagnosis.host.platform, { exact: true })).toBeVisible()
        await expect(
          hostRegion.getByText(copy.diagnostics.number(diagnosis.host.protocol), { exact: true }),
        ).toBeVisible()
        const refresh = region.getByRole('button', { name: copy.diagnostics.refresh, exact: true })
        await refresh.click()
        await expect(refresh).toBeEnabled()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/system-diagnostics/${locale}-${viewport.width}.png` })
        if (viewport.width === 320) {
          // Visual stress fixture only: this text is not presented as a Host diagnostic fact.
          await region
            .locator('.hbar-system-diagnostics-value')
            .first()
            .locator('span')
            .first()
            .evaluate((element) => {
              element.textContent = `Very-long-localized-label-${'诊断diagnostics'.repeat(40)}`
            })
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          await page.screenshot({ path: `artifacts/system-diagnostics/${locale}-320-long.png` })
        }
        await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      }
      await openSessionTool(page, copy.session.tools, 'settings')
      await selectDiagnostics(page, locale)
      await expect(page.getByRole('region', { name: copy.diagnostics.title })).toBeVisible()
      await stopWebSessionHost(host)
      host = undefined
      await expect(page.getByText(copy.diagnostics.unavailable, { exact: true })).toBeVisible({ timeout: 20_000 })
      const refresh = page.getByRole('button', { name: copy.diagnostics.refresh, exact: true })
      await expect(refresh).toBeDisabled()
      await expect(page.getByText(diagnosis.host.version, { exact: true })).toBeVisible()
      await page.screenshot({ path: `artifacts/system-diagnostics/${locale}-offline.png` })
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
