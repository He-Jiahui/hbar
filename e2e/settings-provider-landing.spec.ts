import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`global Settings starts at Providers and remembers its category without retargeting a session: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-provider-landing-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.evaluate(() => localStorage.setItem('hbar:web:last-global-settings-group', 'unknown-section'))
      await page.reload()
      const sidebarSettings = page.getByRole('button', { name: copy.shell.settings, exact: true })
      await sidebarSettings.click()
      const providerLabel = copy.settings.resolve('i18n:settings.groups.providers')
      const modelLabel = copy.settings.resolve('i18n:settings.groups.model')
      const groups = page.getByRole('navigation', { name: copy.settings.groups, exact: true })
      const providers = groups.getByRole('button', { name: providerLabel, exact: true })
      await expect(providers).toHaveAttribute('aria-current', 'page')
      await expect(page.locator('.hbar-app-react-provider-list')).toBeVisible()
      await expect(page.getByRole('button', { name: copy.providers.list.add, exact: true })).toBeVisible()
      expect(await groups.getByRole('button').allTextContents()).toEqual([
        providerLabel,
        copy.appearance.group,
        modelLabel,
        copy.settings.resolve('i18n:settings.groups.session'),
        copy.settings.resolve('i18n:settings.groups.extensions'),
        copy.diagnostics.title,
      ])
      await providers.focus()
      await expect(providers).toBeFocused()
      await page.screenshot({ path: `artifacts/desktop-experience/provider-landing-${locale}-1440.png` })
      await page.setViewportSize({ width: 320, height: 720 })
      const mobileGroups = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
      await expect(mobileGroups).toBeVisible()
      await expect(mobileGroups).toHaveValue('providers')
      expect(
        await mobileGroups
          .locator('option')
          .evaluateAll((options: Element[]) => options.map((option) => option.getAttribute('value'))),
      ).toEqual(['providers', 'appearance', 'model', 'session', 'extensions', 'diagnostics'])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/desktop-experience/provider-landing-${locale}-320.png` })
      await mobileGroups.selectOption('appearance')
      await expect(page.locator('.hbar-web-appearance-settings')).toBeVisible()
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await page.reload()
      await page.setViewportSize({ width: 1440, height: 900 })
      await sidebarSettings.click()
      await expect(groups.getByRole('button', { name: copy.appearance.group, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      )
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      await page.getByRole('button', { name: copy.session.tools.settings, exact: true }).click()
      await expect(groups.getByRole('button', { name: modelLabel, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      )
      await expect(page.getByRole('combobox', { name: copy.settings.scopes })).toHaveValue('session')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
