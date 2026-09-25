import { expect, test, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function selectGroup(page: Page, locale: ShellLocale, id: string, label: string) {
  const copy = getShellCopy(locale)
  const mobile = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
  if (await mobile.isVisible()) {
    await mobile.focus()
    await mobile.selectOption(id)
    await expect(mobile).toBeFocused()
  } else {
    const button = page
      .getByRole('navigation', { name: copy.settings.groups })
      .getByRole('button', { name: label, exact: true })
    await button.focus()
    await page.keyboard.press('Enter')
    await expect(button).toBeFocused()
  }
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`settings groups keep real scope, drafts and page keyboard focus: ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-settings-context-'))
    const context = await browser.newContext({ locale })
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
      await page
        .getByTitle(copy.shell.workspaceActions(host.ready.workspaceName), { exact: true })
        .waitFor({ state: 'attached' })
      const expand = page.getByRole('button', {
        name: copy.shell.expandWorkspace(host.ready.workspaceName),
        exact: true,
      })
      if (await expand.isVisible()) await expand.click()
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = 'Keep the conversation draft while visiting settings — 返回不丢失输入'
      await prompt.fill(draft)
      const pageBoundary = page.locator('.hbar-settings-page-focus')
      const scope = page.getByRole('combobox', { name: copy.settings.scopes, exact: true })
      const thinking = page.getByRole('combobox', {
        name: locale === 'zh-CN' ? '思考等级' : 'Thinking level',
        exact: true,
      })
      const modelLabel = copy.settings.resolve('i18n:settings.groups.model')

      for (const viewport of [
        { width: 1440, height: 960 },
        { width: 390, height: 844 },
        { width: 320, height: 720 },
      ]) {
        await page.setViewportSize(viewport)
        const model = page.getByRole('button', { name: copy.session.tools.settings, exact: true })
        await model.focus()
        await page.keyboard.press('Enter')
        await expect(pageBoundary).toBeFocused()
        await expect(pageBoundary).toHaveAccessibleName(copy.settings.pageTitle)
        await expect(scope).toHaveValue('session')
        const level = viewport.width === 390 ? (locale === 'zh-CN' ? '高' : 'High') : locale === 'zh-CN' ? '低' : 'Low'
        await thinking.click()
        await page.getByRole('option', { name: level, exact: true }).click()
        await expect(thinking).toHaveValue(level)

        await selectGroup(page, locale, 'providers', copy.settings.resolve('i18n:settings.groups.providers'))
        await expect(page.getByText(copy.settings.hostScope, { exact: true })).toBeVisible()
        await expect(scope).toHaveCount(0)
        await selectGroup(page, locale, 'appearance', copy.appearance.group)
        await expect(page.getByText(copy.settings.clientScope, { exact: true })).toBeVisible()
        await expect(scope).toHaveCount(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/desktop-experience/settings-context-${locale}-${viewport.width}.png` })
        await selectGroup(page, locale, 'model', modelLabel)
        await expect(scope).toHaveValue('session')
        await expect(thinking).toHaveValue(level)
        const save = page.getByRole('button', { name: copy.settings.save, exact: true })
        await expect(save).toBeEnabled()
        await save.focus()
        await page.keyboard.press('Enter')
        await expect(page.getByText(copy.settings.saved, { exact: true })).toBeVisible()
        // Save/group/scope updates are not whole-page navigation and must not steal focus.
        await expect(pageBoundary).not.toBeFocused()
        const back = page.getByRole('button', { name: copy.settings.back, exact: true })
        await back.focus()
        await page.keyboard.press('Enter')
        await expect(pageBoundary).toBeFocused()
        await expect(pageBoundary).toHaveAccessibleName(host.ready.sessionTitle)
        await expect(prompt).toHaveValue(draft)
      }

      // Persistent desktop sidebar triggers regain focus; hidden narrow ones do not.
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 960 })
        const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
        await expect(show).toBeVisible()
        await show.click()
        const settings = page.getByRole('button', { name: copy.shell.settings, exact: true })
        await settings.focus()
        await page.keyboard.press('Enter')
        await expect(pageBoundary).toBeFocused()
        await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
        if (width === 1440) await expect(settings).toBeFocused()
        else await expect(pageBoundary).toBeFocused()
        await expect(prompt).toHaveValue(draft)
      }
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
