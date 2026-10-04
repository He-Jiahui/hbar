import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`composer removes decorative beams but retains focus and send: ${locale}`, async ({ browser }) => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-composer-boundary-'))
    const context = await browser.newContext({ locale, colorScheme: 'light', viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(`${base()}/apps/web/`)
      const copy = getShellCopy(locale)
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      const form = page.locator('form.lumen-prompt-composer-surface')
      await expect(form).toHaveAttribute('data-boundary', 'none')
      await expect(form.locator(':scope > [data-edge]')).toHaveCount(0)
      const input = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await input.focus()
      const composerTypography = await input.evaluate((element) => {
        const editor = element.closest('.cm-scroller')
        const composer = element.closest('.lumen-prompt-composer')
        return {
          editor: editor ? getComputedStyle(editor).fontFamily : null,
          composer: composer ? getComputedStyle(composer).fontFamily : null,
        }
      })
      expect(composerTypography.editor).toBe(composerTypography.composer)
      const focus = await form.evaluate((element) => {
        const style = getComputedStyle(element)
        return { width: parseFloat(style.outlineWidth), style: style.outlineStyle, color: style.outlineColor }
      })
      expect(focus.width).toBeGreaterThanOrEqual(1)
      expect(focus.style).toBe('solid')
      expect(focus.color).not.toBe('rgba(0, 0, 0, 0)')
      await page.screenshot({ path: `artifacts/desktop-experience/composer-boundary-${locale}-light-1440.png` })

      await page.emulateMedia({ colorScheme: 'dark' })
      await expect(page.locator('html')).toHaveAttribute('data-lumen-mode', 'dark')
      await page.setViewportSize({ width: 390, height: 844 })
      await expect(form).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/desktop-experience/composer-boundary-${locale}-dark-390.png` })

      await page.setViewportSize({ width: 320, height: 720 })
      await page.emulateMedia({ colorScheme: 'dark', forcedColors: 'active' })
      await input.focus()
      await expect(form).toHaveAttribute('data-boundary', 'none')
      await expect(form.locator(':scope > [data-edge]')).toHaveCount(0)
      expect(
        await form.evaluate((element) => parseFloat(getComputedStyle(element).outlineWidth)),
      ).toBeGreaterThanOrEqual(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      await page.screenshot({ path: `artifacts/desktop-experience/composer-boundary-${locale}-contrast-320.png` })
      await page.emulateMedia({ colorScheme: 'light', forcedColors: 'none' })
      await input.fill('Composer boundary keeps the original session draft')
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expect(page.getByText('Received: Composer boundary keeps the original session draft')).toBeVisible()
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
