import { expect, test } from '@playwright/test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { cleanupOwnedModelFixture } from './support/model-fixture-cleanup'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`new session keeps a centered welcome until its first submission: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-empty-hero-'))
    const context = await browser.newContext({ locale })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        budgetAutoContinue: false,
      })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.newSession, exact: true }).click()
      const projectPicker = page.getByRole('dialog', { name: copy.shell.chooseWorkspace, exact: true })
      if (await projectPicker.isVisible())
        await projectPicker
          .getByRole('button', { name: copy.shell.createSessionInWorkspace(host.ready.workspaceName), exact: true })
          .click()
      const hero = page.locator('.hbar-app-react-session-empty-hero')
      await expect(hero.getByRole('heading', { name: copy.session.emptyHero.title })).toBeVisible()
      await expect(hero).toContainText(copy.session.emptyHero.description)
      const mark = hero.locator('.hbar-app-react-session-empty-mark')
      await expect(mark).toBeVisible()
      expect(await mark.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain(
        copy.session.emptyHero.markUrl,
      )
      expect((await context.request.get(`${base}${copy.session.emptyHero.markUrl}`)).ok()).toBe(true)
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      for (const viewport of [
        { width: 1440, height: 900 },
        { width: 900, height: 760 },
        { width: 390, height: 720 },
        { width: 320, height: 560 },
      ]) {
        await page.setViewportSize(viewport)
        await expect(hero).toBeVisible()
        await expect(prompt).toBeInViewport()
        expect(
          await mark.evaluate((element) => {
            const area = element.closest('.lumen-conversation-messages')?.getBoundingClientRect()
            const bounds = element.getBoundingClientRect()
            return Boolean(area && bounds.top >= area.top - 1 && bounds.bottom <= area.bottom + 1)
          }),
        ).toBe(true)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        if (viewport.width >= 900) {
          const centered = await hero.evaluate((element) => {
            const area = element.closest('.lumen-conversation-messages')?.getBoundingClientRect()
            const bounds = element.getBoundingClientRect()
            return area ? Math.abs((bounds.left + bounds.right) / 2 - (area.left + area.right) / 2) <= 2 : false
          })
          expect(centered).toBe(true)
        }
        await page.screenshot({ path: `artifacts/desktop-experience/empty-hero-${locale}-${viewport.width}.png` })
      }
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.locator('.hbar-composer-model-trigger').click()
      await expect(hero).toBeVisible()
      await page
        .getByRole('dialog', { name: copy.session.modelPicker.title, exact: true })
        .getByRole('option')
        .first()
        .click()
      await expect(hero).toBeVisible()
      await prompt.fill('Begin the first verified turn.')
      await expect(hero).toBeVisible()
      const send = page.getByRole('button', { name: copy.session.prompt.send, exact: true })
      await expect(send).toBeEnabled()
      await send.click()
      await expect(hero).toHaveCount(0)
      await expectComposerText(prompt, '')
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await cleanupOwnedModelFixture(root, 'hbar-empty-hero-')
    }
  })
}
