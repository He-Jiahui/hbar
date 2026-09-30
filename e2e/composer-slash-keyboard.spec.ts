import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`an exact local slash uses the configured send key while partial entries still complete: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(120_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-composer-slash-keyboard-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base())
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const menu = page.getByRole('listbox', { name: copy.session.slash.menu })
      const runs = async () =>
        (await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId, limit: 100 })).runs.filter(
          (run) => run.input.source === 'user',
        )

      await prompt.fill('/mo')
      await expect(menu.getByRole('option')).toHaveCount(1)
      await prompt.press('Enter')
      await expectComposerText(prompt, '/model ')
      await expect(page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })).toHaveCount(0)
      expect(await runs()).toHaveLength(0)

      await prompt.fill('/model')
      await prompt.press('Tab')
      await expectComposerText(prompt, '/model ')
      await expect(page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })).toHaveCount(0)
      expect(await runs()).toHaveLength(0)

      await prompt.fill('/model')
      await prompt.press('Enter')
      const picker = page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })
      await expect(picker).toBeVisible()
      await expect(picker).toHaveCount(1)
      await expect(menu).toBeHidden()
      await expect(picker.getByRole('searchbox', { name: copy.session.modelPicker.search })).toBeFocused()
      await expectComposerText(prompt, '')
      expect(await runs()).toHaveLength(0)
      await page.screenshot({ path: testInfo.outputPath(`exact-picker-${locale}-1440.png`) })
      await picker.getByRole('button', { name: copy.session.modelPicker.close, exact: true }).click()

      const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await showSidebar.isVisible()) await showSidebar.click()
      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      const groups = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
      if (await groups.isVisible()) await groups.selectOption({ label: copy.general.group })
      else await page.getByRole('button', { name: copy.general.group, exact: true }).click()
      const sending = page.locator('.hbar-web-general-sending')
      await expect(sending).toBeVisible()
      const modifier = sending
        .getByText(copy.general.sending.options.modifierEnter.label, { exact: true })
        .locator('..')
      await expect(modifier).toHaveAttribute('aria-pressed', 'false')
      await modifier.click()
      await expect(modifier).toHaveAttribute('aria-pressed', 'true')
      await expect(sending.getByText(copy.general.sending.saved, { exact: true })).toBeVisible()
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()

      await prompt.focus()
      await prompt.fill('/model')
      await prompt.press('Control+Enter')
      await expect(picker).toBeVisible()
      await expect(picker).toHaveCount(1)
      await expect(picker.getByRole('searchbox', { name: copy.session.modelPicker.search })).toBeFocused()
      expect(await runs()).toHaveLength(0)
      await page.screenshot({ path: testInfo.outputPath(`modifier-picker-${locale}-1440.png`) })
      await picker.getByRole('button', { name: copy.session.modelPicker.close, exact: true }).click()
      if (locale === 'zh-CN') {
        await page.setViewportSize({ width: 320, height: 760 })
        await prompt.focus()
        await prompt.fill('/model')
        await prompt.press('Control+Enter')
        await expect(picker).toBeVisible()
        await expect(picker.getByRole('searchbox', { name: copy.session.modelPicker.search })).toBeFocused()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: testInfo.outputPath('modifier-picker-zh-CN-320.png') })
        await picker.getByRole('button', { name: copy.session.modelPicker.close, exact: true }).click()
        await page.setViewportSize({ width: 1440, height: 960 })
      }

      await prompt.focus()
      await prompt.fill('Shift+Enter preserves a newline')
      await prompt.press('Shift+Enter')
      await expectComposerText(prompt, 'Shift+Enter preserves a newline\n')
      await prompt.dispatchEvent('compositionstart', { data: '中' })
      await prompt.dispatchEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        ctrlKey: true,
        isComposing: true,
        bubbles: true,
        cancelable: true,
      })
      await prompt.dispatchEvent('compositionend', { data: '中' })
      await expectComposerText(prompt, 'Shift+Enter preserves a newline\n')
      expect(await runs()).toHaveLength(0)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
