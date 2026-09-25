import { expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`slash completion stays separate from local action, preserving session and attachments: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-composer-slash-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317), sessionCount: 2 })
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

      await prompt.fill('/')
      await expect(menu.getByRole('option')).toHaveCount(2)
      await prompt.dispatchEvent('compositionstart', { data: '中' })
      await prompt.dispatchEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        isComposing: true,
        bubbles: true,
        cancelable: true,
      })
      await expectComposerText(prompt, '/')
      await prompt.dispatchEvent('compositionend', { data: '中' })
      await expect(menu.getByRole('option', { name: copy.session.slash.select('/model') })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await prompt.press('ArrowDown')
      await expect(menu.getByRole('option', { name: copy.session.slash.select('/settings') })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await prompt.press('Enter')
      await expect(menu).toHaveCount(0)
      await expectComposerText(prompt, '/settings ')
      await expect(page.getByRole('combobox', { name: copy.settings.scopes })).toHaveCount(0)
      await prompt.press('Enter')
      await expect(page.getByRole('combobox', { name: copy.settings.scopes })).toHaveValue('session')
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await expectComposerText(prompt, '')

      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 800 })
        await prompt.fill('/mo')
        await expect(menu.getByRole('option')).toHaveCount(1)
        await expect(menu.getByRole('option')).toBeInViewport()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/reference-ux-v2/slash-${locale}-${width}.png` })
        await prompt.press('Escape')
        await expect(menu).toHaveCount(0)
      }
      await prompt.fill('/model')
      await prompt.press('Tab')
      await expectComposerText(prompt, '/model ')
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).evaluate((element) => {
        if (!(element instanceof HTMLButtonElement)) throw new Error('Send is not a button')
        element.click()
        element.click()
      })
      const picker = page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })
      await expect(picker).toBeVisible()
      await expect(picker).toHaveCount(1)
      await expect(picker.getByRole('searchbox', { name: copy.session.modelPicker.search })).toBeFocused()
      await expectComposerText(prompt, '')
      await picker.getByRole('button', { name: copy.session.modelPicker.close, exact: true }).click()

      await page.locator('.hbar-composer-attachment-target input[type="file"]').setInputFiles({
        name: 'slash-attachment.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('retain attachment'),
      })
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'slash-attachment.txt' })).toBeVisible()
      await prompt.fill('/settings ')
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expect(page.getByText(copy.session.slash.attachmentsBlocked, { exact: true })).toBeVisible()
      await expectComposerText(prompt, '/settings ')
      await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'slash-attachment.txt' })).toBeVisible()
      await expect(page.getByRole('combobox', { name: copy.settings.scopes })).toHaveCount(0)
      await page
        .locator('.lumen-attachment-chip')
        .filter({ hasText: 'slash-attachment.txt' })
        .getByRole('button')
        .click()
      await page.getByRole('button', { name: copy.session.prompt.send, exact: true }).click()
      await expect(page.getByRole('combobox', { name: copy.settings.scopes })).toHaveValue('session')
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await expectComposerText(prompt, '')

      await page.setViewportSize({ width: 1440, height: 960 })
      const showSidebar = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
      if (await showSidebar.isVisible()) await showSidebar.click()
      await prompt.fill('/settings')
      await page.getByRole('button', { name: copy.shell.openSession('Session 001'), exact: true }).click()
      const other = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await expectComposerText(other, '')
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      await expectComposerText(prompt, '/settings')
      await prompt.fill('/compact')
      await expect(menu).toHaveCount(0)
      await prompt.press('Enter')
      await expect
        .poll(async () =>
          (await host!.client.call('session.snapshot', { sessionId: host!.ready.sessionId, limit: 20 })).runs.some(
            (run) => run.input.source === 'user' && run.input.text === '/compact',
          ),
        )
        .toBe(true)
      await expect(page.getByRole('combobox', { name: copy.settings.scopes })).toHaveCount(0)
      await expect(page.getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })).toHaveCount(0)
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
