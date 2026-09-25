import { expect, test, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function chooseGroup(page: Page, locale: ShellLocale, id: string, label: string) {
  const copy = getShellCopy(locale)
  const mobile = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
  if (await mobile.isVisible()) await mobile.selectOption(id)
  else
    await page
      .getByRole('navigation', { name: copy.settings.groups })
      .getByRole('button', { name: label, exact: true })
      .click()
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`appearance theme choices are visible, keyboard operable and remain an explicit draft: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-appearance-choices-'))
    if (!resolve(root).startsWith(`${resolve(tmpdir())}\\hbar-appearance-choices-`))
      throw new Error('Refusing to use a temporary root outside the expected prefix')
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
      await page.goto(base)
      await page.getByTitle(copy.shell.workspaceActions(host.ready.workspaceName), { exact: true }).waitFor()
      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await chooseGroup(page, locale, 'appearance', copy.appearance.group)
      const form = page.locator('.hbar-web-appearance-settings')
      const choices = form.getByRole('radiogroup', { name: copy.appearance.theme.label })
      const choice = (value: 'system' | 'light' | 'dark') =>
        choices.getByRole('radio', { name: copy.appearance.theme[value], exact: true })
      const preview = form.getByRole('region', { name: copy.appearance.preview.title })
      await expect(choices.getByRole('radio')).toHaveCount(3)
      for (const value of ['system', 'light', 'dark'] as const) await expect(choice(value)).toBeVisible()
      await expect(choice('system')).toHaveAttribute('aria-checked', 'true')
      await expect(choice('system')).toHaveAttribute('tabindex', '0')

      await choice('system').focus()
      await page.keyboard.press('ArrowRight')
      await expect(choice('light')).toBeFocused()
      await expect(choice('light')).toHaveAttribute('aria-checked', 'true')
      await expect(preview).toHaveAttribute('data-lumen-mode', 'light')
      await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', 'dark')
      await page.keyboard.press('End')
      await expect(choice('dark')).toBeFocused()
      await expect(choice('dark')).toHaveAttribute('aria-checked', 'true')
      await page.keyboard.press('Home')
      await expect(choice('system')).toBeFocused()
      await page.keyboard.press('ArrowLeft')
      await expect(choice('dark')).toBeFocused()
      await choice('light').click()
      await expect(form.getByText(copy.appearance.unsaved, { exact: true })).toBeVisible()
      await expect
        .poll(() => choice('light').evaluate((element) => getComputedStyle(element).backgroundColor))
        .toBe('rgb(238, 238, 238)')
      await page.screenshot({ path: `artifacts/reference-ux-v2/appearance-choice-${locale}-1440.png` })

      await chooseGroup(page, locale, 'model', copy.settings.resolve('i18n:settings.groups.model'))
      await chooseGroup(page, locale, 'appearance', copy.appearance.group)
      await expect(choice('light')).toHaveAttribute('aria-checked', 'true')
      await page.setViewportSize({ width: 320, height: 720 })
      await choices.evaluate((element) => element.scrollIntoView({ block: 'center' }))
      await expect(choices).toBeInViewport()
      await expect(choice('light')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/reference-ux-v2/appearance-choice-${locale}-320.png` })

      await form.getByRole('button', { name: copy.appearance.save, exact: true }).click()
      await expect(form.getByText(copy.appearance.saved, { exact: true })).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', 'light')
      await page.setViewportSize({ width: 1440, height: 960 })
      await page.reload()
      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await chooseGroup(page, locale, 'appearance', copy.appearance.group)
      await expect(choice('light')).toHaveAttribute('aria-checked', 'true')
      await choice('dark').click()
      await expect(preview).toHaveAttribute('data-lumen-mode', 'dark')
      await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', 'light')
      await form.getByRole('button', { name: copy.appearance.discard, exact: true }).click()
      await expect(choice('light')).toHaveAttribute('aria-checked', 'true')
      await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', 'light')

      // A synthetic long translated choice exercises wrapping without adding unsupported product options.
      await page.setViewportSize({ width: 320, height: 720 })
      await choice('system').evaluate((element) => {
        element.textContent = 'LongUnbrokenAppearanceChoiceForNarrowSettings'.repeat(5)
      })
      await choices.evaluate((element) => element.scrollIntoView({ block: 'center' }))
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/reference-ux-v2/appearance-choice-${locale}-long-fixture-320.png` })
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
