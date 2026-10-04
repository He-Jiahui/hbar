import { expect, test, type Locator, type Page } from '@playwright/test'
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

async function selectedChoiceContrast(choice: Locator): Promise<{ alpha: number; ratio: number }> {
  return choice.evaluate((element) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Canvas contrast measurement unavailable')
    const luminance = (color: string) => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      const [red = 0, green = 0, blue = 0, alpha = 0] = context.getImageData(0, 0, 1, 1).data
      const channel = (value: number) => {
        const unit = value / 255
        return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
      }
      return { value: channel(red) * 0.2126 + channel(green) * 0.7152 + channel(blue) * 0.0722, alpha }
    }
    const style = getComputedStyle(element)
    const background = luminance(style.backgroundColor)
    const ink = luminance(style.color)
    return {
      alpha: background.alpha,
      ratio: (Math.max(background.value, ink.value) + 0.05) / (Math.min(background.value, ink.value) + 0.05),
    }
  })
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
      const controlSize = form.locator('#hbar-appearance-controlSize')
      await expect(form.locator('.hbar-web-appearance-control')).toHaveCount(5)
      await expect(form.locator('[data-edge]')).toHaveCount(0)
      await controlSize.focus()
      expect(
        await controlSize.evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth)),
      ).toBeGreaterThanOrEqual(1)
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
      await expect(choice('light')).toHaveAttribute('data-lumen-variant', 'contained')
      await expect(choice('system')).toHaveAttribute('data-lumen-variant', 'outlined')
      await expect(choice('dark')).toHaveAttribute('data-lumen-variant', 'outlined')
      await page.mouse.move(0, 0)
      await expect.poll(async () => (await selectedChoiceContrast(choice('light'))).alpha).toBe(255)
      await expect.poll(async () => (await selectedChoiceContrast(choice('light'))).ratio).toBeGreaterThanOrEqual(4.5)
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

      await controlSize.focus()
      await controlSize.scrollIntoViewIfNeeded()
      await page.emulateMedia({ forcedColors: 'active' })
      expect(await controlSize.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid')
      expect(
        await controlSize.evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth)),
      ).toBeGreaterThanOrEqual(1)
      await page.screenshot({ path: `artifacts/reference-ux-v2/appearance-control-contrast-${locale}-320.png` })
      await page.emulateMedia({ forcedColors: 'none' })

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
