import { expect, test, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function openAppearance(page: Page, locale: ShellLocale) {
  const copy = getShellCopy(locale)
  await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
  const mobile = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
  if (await mobile.isVisible()) await mobile.selectOption('appearance')
  else
    await page
      .getByRole('navigation', { name: copy.settings.groups })
      .getByRole('button', { name: copy.appearance.group, exact: true })
      .click()
}

async function contrastSamples(page: Page): Promise<{ background: string; alpha: number; ratios: number[] }> {
  return page.locator('.hbar-web-appearance-preview').evaluate((preview) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('Canvas contrast measurement unavailable')
    const pixel = (color: string): number[] => {
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
      return Array.from(context.getImageData(0, 0, 1, 1).data)
    }
    const luminance = (rgb: number[]) => {
      const channel = (value: number) => {
        const unit = value / 255
        return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4
      }
      return channel(rgb[0] ?? 0) * 0.2126 + channel(rgb[1] ?? 0) * 0.7152 + channel(rgb[2] ?? 0) * 0.0722
    }
    const background = getComputedStyle(preview).backgroundColor
    const alpha = pixel(background)[3] ?? 0
    const nodes = Array.from(preview.querySelectorAll('h3, header p, label, input, select, button'))
    if (nodes.length < 6) throw new Error(`Preview text/control samples missing: ${nodes.length}`)
    const ratios = nodes.map((node) => {
      const stack: Element[] = []
      for (let current: Element | null = node; current && current !== preview; current = current.parentElement)
        stack.unshift(current)
      context.clearRect(0, 0, 1, 1)
      context.fillStyle = background
      context.fillRect(0, 0, 1, 1)
      for (const element of stack) {
        context.fillStyle = getComputedStyle(element).backgroundColor
        context.fillRect(0, 0, 1, 1)
      }
      const surface = Array.from(context.getImageData(0, 0, 1, 1).data)
      const ink = pixel(getComputedStyle(node).color)
      const darker = Math.min(luminance(surface), luminance(ink))
      const lighter = Math.max(luminance(surface), luminance(ink))
      return (lighter + 0.05) / (darker + 0.05)
    })
    return { background, alpha, ratios }
  })
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`unsaved appearance preview remains opaque and legible across opposite themes: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-appearance-contrast-'))
    if (!resolve(root).startsWith(`${resolve(tmpdir())}\\hbar-appearance-contrast-`))
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
      await openAppearance(page, locale)
      const form = page.locator('.hbar-web-appearance-settings')
      const theme = form.getByRole('radiogroup', { name: copy.appearance.theme.label })
      const preview = form.getByRole('region', { name: copy.appearance.preview.title })
      const controlSize = form.getByRole('combobox', { name: copy.appearance.controlSize.label })
      const textSize = form.getByRole('combobox', { name: copy.appearance.textSize.label })
      const cornerSize = form.getByRole('combobox', { name: copy.appearance.cornerSize.label })

      for (const [systemTheme, draftTheme, width, height] of [
        ['dark', 'light', 1440, 960],
        ['light', 'dark', 320, 720],
      ] as const) {
        await page.emulateMedia({ colorScheme: systemTheme })
        await page.setViewportSize({ width, height })
        await theme.getByRole('radio', { name: copy.appearance.theme[draftTheme], exact: true }).click()
        await expect(preview).toHaveAttribute('data-lumen-mode', draftTheme)
        await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', systemTheme)
        for (const size of ['s', 'm', 'l'] as const) {
          await controlSize.selectOption(size)
          await textSize.selectOption(size)
          await cornerSize.selectOption(size)
          await expect(preview).toHaveAttribute('data-lumen-control-size', size)
          await expect(preview).toHaveAttribute('data-lumen-text-size', size)
          await expect(preview).toHaveAttribute('data-lumen-corner-size', size)
          // Lumen color transitions take 180ms; measure the settled rendered color, not an intermediate frame.
          await expect.poll(async () => (await contrastSamples(page)).ratios.every((ratio) => ratio >= 4.5)).toBe(true)
          const measured = await contrastSamples(page)
          expect(measured.alpha).toBe(255)
          expect(measured.background).toBe(draftTheme === 'light' ? 'rgb(245, 245, 245)' : 'rgb(9, 9, 9)')
          expect(Math.min(...measured.ratios)).toBeGreaterThanOrEqual(4.5)
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        }
        await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', systemTheme)
        await preview.evaluate((element) => element.scrollIntoView({ block: 'center' }))
        await expect(preview).toBeInViewport()
        await page.screenshot({ path: `artifacts/reference-ux-v2/appearance-contrast-${locale}-${width}.png` })
      }

      // Synthetic long copy tests layout capacity; it is not a published cc-haha label or product translation.
      await preview.locator('header p').evaluate((element) => {
        element.textContent = 'LongUnbrokenPreviewDescriptionForResponsiveLayout'.repeat(7)
      })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await preview.evaluate((element) => element.scrollIntoView({ block: 'center' }))
      await expect(preview).toBeInViewport()
      await page.screenshot({ path: `artifacts/reference-ux-v2/appearance-contrast-${locale}-long-fixture-320.png` })
      await expect(form.getByRole('button', { name: copy.appearance.save, exact: true })).toBeEnabled()
      await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', 'light')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
