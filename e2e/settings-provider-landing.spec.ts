import { expect, test, type Locator } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { expectLumenValue, selectLumenOption } from './support/lumen-controls'
import { openSessionTool } from './support/session-tools-menu'

async function removeOwnedFixture(root: string): Promise<void> {
  const target = resolve(root)
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hbar-provider-landing-'))
    throw new Error('Refusing to remove an unexpected settings fixture path')
  await rm(target, { recursive: true, force: true })
}

async function expectLumenOptions(control: Locator, expected: readonly string[]): Promise<void> {
  await control.click()
  await expect(control).toHaveAttribute('aria-expanded', 'true')
  const listboxId = await control.getAttribute('aria-controls')
  if (!listboxId) throw new Error('Settings group control is missing its listbox')
  const listbox = control.page().locator(`[id=${JSON.stringify(listboxId)}]`)
  await expect(listbox).toBeVisible()
  await expect
    .poll(() =>
      listbox
        .getByRole('option')
        .evaluateAll((options) => options.map((option) => option.getAttribute('data-value') ?? '')),
    )
    .toEqual(expected)
  await control.page().keyboard.press('Escape')
  await expect(control).toHaveAttribute('aria-expanded', 'false')
}

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
      const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      const ensureSidebar = async () => {
        await expect(sidebarSettings.or(showSidebar)).toBeVisible()
        if (!(await sidebarSettings.isVisible())) await showSidebar.click()
      }
      await ensureSidebar()
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
        copy.general.group,
        copy.appearance.group,
        modelLabel,
        copy.settings.resolve('i18n:settings.groups.session'),
        copy.settings.resolve('i18n:settings.groups.sandbox'),
        copy.settings.resolve('i18n:settings.groups.skills'),
        copy.settings.resolve('i18n:settings.groups.extensions'),
        copy.settingsUsage.title,
        copy.diagnostics.title,
      ])
      await providers.focus()
      await expect(providers).toBeFocused()
      await page.screenshot({ path: `artifacts/desktop-experience/provider-landing-${locale}-1440.png` })
      await page.setViewportSize({ width: 320, height: 720 })
      const mobileGroups = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
      await expect(mobileGroups).toBeVisible()
      await expectLumenValue(mobileGroups, 'providers')
      await expectLumenOptions(mobileGroups, [
        'providers',
        'general',
        'appearance',
        'model',
        'session',
        'sandbox',
        'skills',
        'extensions',
        'usage',
        'diagnostics',
      ])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/desktop-experience/provider-landing-${locale}-320.png` })
      await selectLumenOption(mobileGroups, 'appearance')
      await expect(page.locator('.hbar-web-appearance-settings')).toBeVisible()
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await page.reload()
      await page.setViewportSize({ width: 1440, height: 900 })
      await ensureSidebar()
      await sidebarSettings.click()
      await expect(groups.getByRole('button', { name: copy.appearance.group, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      )
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await ensureSidebar()
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await openSessionTool(page, copy.session.tools, 'settings')
      await expect(groups.getByRole('button', { name: modelLabel, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      )
      await expectLumenValue(page.getByRole('combobox', { name: copy.settings.scopes }), 'session')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await removeOwnedFixture(root)
    }
  })
}
