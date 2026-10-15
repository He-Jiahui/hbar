import { expect, test } from '@playwright/test'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createSettingsCommandClient } from '@hbar/client'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { nativeSmokeFixtureRoot } from '../scripts/desktop-smoke-fixture'
import { selectLumenOption } from './support/lumen-controls'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['zh-CN', 'en-US'] as const)
  test(`desktop startup is saved in Host settings and survives reload: ${locale}`, async ({ browser }) => {
    const root = nativeSmokeFixtureRoot(await mkdtemp(join(tmpdir(), 'hbar-native-')))
    const context = await browser.newContext({ locale })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4327) })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = getShellCopy(locale)
      const label = copy.settings.resolve('i18n:settings.desktop.startupMode.label')
      await page.goto(base)
      const open = async () => {
        await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
        await page
          .getByRole('navigation', { name: copy.settings.groups })
          .getByRole('button', { name: copy.general.group, exact: true })
          .click()
      }
      await open()
      const control = page.getByRole('combobox', { name: label, exact: true })
      await expect(control).toHaveAttribute('data-value', 'string:client')
      await selectLumenOption(control, 'string:background')
      await page
        .locator('.hbar-app-react-settings-footer')
        .getByRole('button', { name: copy.settings.save, exact: true })
        .click()
      const settings = createSettingsCommandClient(host.client)
      await expect
        .poll(
          async () =>
            (await settings.execute('settings.get', { scope: { kind: 'global' } })).resolution.reports[
              'f:desktop.startupMode'
            ]?.effectiveValue,
        )
        .toBe('background')
      await mkdir('artifacts/backend-autonomy', { recursive: true })
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await control.scrollIntoViewIfNeeded()
        await expect(control).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/backend-autonomy/startup-${locale}-${width}.png`, fullPage: true })
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      await page.reload()
      await open()
      await expect(control).toHaveAttribute('data-value', 'string:background')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(nativeSmokeFixtureRoot(root), { recursive: true, force: true })
    }
  })
