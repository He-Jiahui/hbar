import { expect, test, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { expectLumenValue, selectLumenOption } from './support/lumen-controls'

async function selectGroup(page: Page, locale: ShellLocale, id: string, label: string) {
  const copy = getShellCopy(locale)
  const mobile = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
  if (await mobile.isVisible()) await selectLumenOption(mobile, id)
  else
    await page
      .getByRole('navigation', { name: copy.settings.groups })
      .getByRole('button', { name: label, exact: true })
      .click()
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`appearance keeps a device draft across categories and session return with honest recovery: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-appearance-recovery-'))
    const context = await browser.newContext({ locale, colorScheme: 'dark', viewport: { width: 1440, height: 960 } })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.addInitScript(() => {
        const read = Storage.prototype.getItem
        Storage.prototype.getItem = function guardedRead(key: string) {
          if (key.endsWith(':preferences') && read.call(this, 'hbar:e2e:blockPrefsRead') === '1')
            throw new DOMException('Preference read unavailable', 'SecurityError')
          return read.call(this, key)
        }
      })
      await page.goto(base)
      await page.getByTitle(copy.shell.workspaceActions(host.ready.workspaceName), { exact: true }).waitFor()
      const expand = page.getByRole('button', {
        name: copy.shell.expandWorkspace(host.ready.workspaceName),
        exact: true,
      })
      if (await expand.isVisible()) await expand.click()
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const originalDraft = 'Keep the source session draft while changing appearance — 保持会话归属'
      await prompt.fill(originalDraft)
      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await selectGroup(page, locale, 'appearance', copy.appearance.group)
      const form = page.locator('.hbar-web-appearance-settings')
      const theme = form.getByRole('radiogroup', { name: copy.appearance.theme.label })
      const themeChoice = (value: 'system' | 'light' | 'dark') =>
        theme.getByRole('radio', { name: copy.appearance.theme[value], exact: true })
      const control = form.getByRole('combobox', { name: copy.appearance.controlSize.label })
      await themeChoice('light').click()
      await selectLumenOption(control, 'l')
      await expect(form.getByRole('region', { name: copy.appearance.preview.title })).toHaveAttribute(
        'data-lumen-mode',
        'light',
      )
      await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', 'dark')
      await selectGroup(page, locale, 'model', copy.settings.resolve('i18n:settings.groups.model'))
      await selectGroup(page, locale, 'appearance', copy.appearance.group)
      await expect(themeChoice('light')).toHaveAttribute('aria-checked', 'true')
      await expectLumenValue(control, 'l')
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await expectComposerText(prompt, originalDraft)
      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await selectGroup(page, locale, 'appearance', copy.appearance.group)
      await expect(themeChoice('light')).toHaveAttribute('aria-checked', 'true')
      await expectLumenValue(control, 'l')
      await page.screenshot({ path: `artifacts/reference-ux-v2/appearance-draft-${locale}-1440.png` })
      await form.getByRole('button', { name: copy.appearance.discard, exact: true }).click()
      await expect(themeChoice('system')).toHaveAttribute('aria-checked', 'true')
      await expectLumenValue(control, 'm')
      await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', 'dark')

      await themeChoice('light').click()
      await selectLumenOption(control, 'l')
      await form.getByRole('button', { name: copy.appearance.save, exact: true }).click()
      await expect(form.getByText(copy.appearance.saved, { exact: true })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', 'light')
      await expect(page.locator('html')).toHaveAttribute('data-lumen-control-size', 'l')
      await page.setViewportSize({ width: 320, height: 720 })
      await expect(themeChoice('light')).toHaveAttribute('aria-checked', 'true')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)

      // The first preference key commits; the next write loses its result. Reconciliation is read-only.
      await page.evaluate(() => {
        const write = Storage.prototype.setItem
        let failed = false
        Storage.prototype.setItem = function interruptedWrite(key: string, value: string) {
          if (!failed && key.endsWith(':preferences') && value.includes('"appearance.controlSize":"m"')) {
            failed = true
            throw new DOMException('Preference write interrupted', 'QuotaExceededError')
          }
          return write.call(this, key, value)
        }
      })
      await themeChoice('dark').click()
      await selectLumenOption(control, 'm')
      await form.getByRole('button', { name: copy.appearance.save, exact: true }).click()
      await expect(form.getByText(copy.appearance.unknown, { exact: true })).toBeVisible()
      await expect(form.getByRole('button', { name: copy.appearance.save, exact: true })).toBeDisabled()
      await expect(themeChoice('dark')).toBeDisabled()
      await form.getByRole('button', { name: copy.appearance.check, exact: true }).click()
      await expect(form.getByText(copy.appearance.partial(1, 2), { exact: true })).toBeVisible()
      await expect(themeChoice('dark')).toBeDisabled()
      await expect(themeChoice('dark')).toHaveAttribute('aria-checked', 'true')
      await expectLumenValue(control, 'm')
      await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', 'dark')
      await expect(page.locator('html')).toHaveAttribute('data-lumen-control-size', 'l')
      await page.screenshot({ path: `artifacts/reference-ux-v2/appearance-partial-${locale}-320.png`, fullPage: true })
      const continueDraft = form.getByRole('button', { name: copy.appearance.continueDraft, exact: true })
      await form.locator('footer').evaluate((element) => element.scrollIntoView({ block: 'end' }))
      await expect(continueDraft).toBeInViewport()
      await expect(form.getByRole('button', { name: copy.appearance.discard, exact: true })).toBeInViewport()
      const actionBounds = await continueDraft.boundingBox()
      if (!actionBounds) throw new Error('Appearance recovery action has no visible bounds')
      expect(actionBounds.y + actionBounds.height).toBeLessThanOrEqual(720)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/reference-ux-v2/appearance-recovery-actions-${locale}-320.png` })
      await continueDraft.click()
      await form.getByRole('button', { name: copy.appearance.save, exact: true }).click()
      await expect(form.getByText(copy.appearance.saved, { exact: true })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-lumen-control-size', 'm')

      await page.evaluate(() => localStorage.setItem('hbar:e2e:blockPrefsRead', '1'))
      await page.setViewportSize({ width: 1440, height: 960 })
      await page.reload()
      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await selectGroup(page, locale, 'appearance', copy.appearance.group)
      await expect(form.getByText(copy.appearance.restoreError('PERSISTENCE_FAILED'))).toBeVisible()
      await expect(form.getByRole('button', { name: copy.appearance.save, exact: true })).toBeDisabled()
      await expect(form.getByRole('button', { name: copy.appearance.reset, exact: true })).toBeDisabled()
      await expect(themeChoice('dark')).toBeDisabled()
      await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', 'dark')
      await page.evaluate(() => localStorage.removeItem('hbar:e2e:blockPrefsRead'))
      await form.getByRole('button', { name: copy.appearance.check, exact: true }).click()
      await expect(themeChoice('dark')).toHaveAttribute('aria-checked', 'true')
      await expectLumenValue(control, 'm')
      await expect(form.getByText(copy.appearance.restoreError('PERSISTENCE_FAILED'))).toHaveCount(0)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
