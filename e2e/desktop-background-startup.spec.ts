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
      const webAccess = page.getByRole('combobox', {
        name: copy.settings.resolve('i18n:settings.backend.webAccess.label'),
        exact: true,
      })
      const webPort = page.getByRole('textbox', {
        name: copy.settings.resolve('i18n:settings.backend.webPort.label'),
        exact: true,
      })
      const retryFields = [
        { name: 'backend.transientRetries', key: 'transientRetries', initial: '2', saved: '4' },
        { name: 'backend.repairRetries', key: 'repairRetries', initial: '3', saved: '0' },
        { name: 'backend.retryDelayMs', key: 'retryDelayMs', initial: '1000', saved: '250' },
      ].map((field) => ({
        ...field,
        control: page.getByRole('textbox', {
          name: copy.settings.resolve(`i18n:settings.backend.${field.key}.label`),
          exact: true,
        }),
      }))
      await selectLumenOption(webAccess, 'string:lan')
      await webPort.fill('46377')
      for (const field of retryFields) {
        await expect(field.control).toHaveValue(field.initial)
        await field.control.fill(field.saved)
      }
      await page
        .locator('.hbar-app-react-settings-footer')
        .getByRole('button', { name: copy.settings.save, exact: true })
        .click()
      const settings = createSettingsCommandClient(host.client)
      await expect
        .poll(async () => {
          const { resolution } = await settings.execute('settings.get', { scope: { kind: 'global' } })
          return [
            'desktop.startupMode',
            'backend.webAccess',
            'backend.webPort',
            ...retryFields.map((field) => field.name),
          ].map((name) => resolution.reports[`f:${name}`]?.effectiveValue)
        })
        .toEqual(['background', 'lan', 46377, 4, 0, 250])
      await expect(page.getByText(copy.general.web.current([host.url]), { exact: true })).toBeVisible()
      await mkdir('artifacts/backend-autonomy', { recursive: true })
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await control.scrollIntoViewIfNeeded()
        await expect(control).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/backend-autonomy/startup-${locale}-${width}.png`, fullPage: true })
        await webPort.scrollIntoViewIfNeeded()
        await page.screenshot({ path: `artifacts/backend-autonomy/web-access-${locale}-${width}.png`, fullPage: true })
        for (const field of retryFields) {
          await field.control.scrollIntoViewIfNeeded()
          await expect(field.control).toBeVisible()
          await expect(field.control).toHaveValue(field.saved)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        }
        await page.screenshot({
          path: `artifacts/backend-autonomy/retry-settings-${locale}-${width}.png`,
          fullPage: true,
        })
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      await page.reload()
      await open()
      await expect(control).toHaveAttribute('data-value', 'string:background')
      await expect(webAccess).toHaveAttribute('data-value', 'string:lan')
      await expect(webPort).toHaveValue('46377')
      for (const field of retryFields) await expect(field.control).toHaveValue(field.saved)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(nativeSmokeFixtureRoot(root), { recursive: true, force: true })
    }
  })
