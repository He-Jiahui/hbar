import { expect, test, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { expectLumenValue, selectLumenChoice, selectLumenOption } from './support/lumen-controls'
import { openSessionTool } from './support/session-tools-menu'

async function selectGroup(page: Page, locale: ShellLocale, id: string, label: string) {
  const copy = getShellCopy(locale)
  const mobile = page.getByRole('combobox', { name: copy.settings.groups, exact: true })
  if (await mobile.isVisible()) {
    await mobile.focus()
    await selectLumenOption(mobile, id)
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
  test(`global Settings shortcut keeps the conversation and focus: ${locale}`, async ({ browser }, testInfo) => {
    const root = await mkdtemp(join(tmpdir(), 'hbar-settings-shortcut-'))
    const context = await browser.newContext({ locale })
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317) })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      await page.goto(base)
      await page.getByRole('button', { name: copy.shell.openSession(host.ready.sessionTitle), exact: true }).click()
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = `Settings shortcut draft — ${locale}`
      await prompt.fill(draft)
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 900 })
        await prompt.focus()
        await page.keyboard.press('Control+Comma')
        const pageBoundary = page.locator('.hbar-settings-page-focus')
        await expect(pageBoundary).toBeFocused()
        await expect(pageBoundary).toHaveAccessibleName(copy.settings.pageTitle)
        await expect(
          page.locator('.hbar-app-react-settings-workspace').getByRole('heading', {
            name: copy.settings.pageTitle,
            exact: true,
          }),
        ).toBeVisible()
        await page.screenshot({ path: testInfo.outputPath(`settings-shortcut-${locale}-${width}.png`) })
        await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
        await expectComposerText(prompt, draft)
      }
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
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
      const thinking = page.getByRole('radiogroup', {
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
        const mobileOpener = page.locator('.hbar-mobile-header-menu-trigger')
        const openedFromMobileHeader = await mobileOpener.isVisible()
        await openSessionTool(page, copy.session.tools, 'settings')
        await expect(pageBoundary).toBeFocused()
        await expect(pageBoundary).toHaveAccessibleName(copy.settings.pageTitle)
        await expectLumenValue(scope, 'session')
        const level = viewport.width === 390 ? 'high' : 'low'
        await selectLumenChoice(thinking, `string:${level}`)
        await expect(thinking).toHaveAttribute('data-value', `string:${level}`)

        await selectGroup(page, locale, 'providers', copy.settings.resolve('i18n:settings.groups.providers'))
        await expect(page.getByText(copy.settings.hostScope, { exact: true })).toBeVisible()
        await expect(scope).toHaveCount(0)
        await selectGroup(page, locale, 'appearance', copy.appearance.group)
        await expect(page.getByText(copy.settings.clientScope, { exact: true })).toBeVisible()
        await expect(scope).toHaveCount(0)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.screenshot({ path: `artifacts/desktop-experience/settings-context-${locale}-${viewport.width}.png` })
        await selectGroup(page, locale, 'model', modelLabel)
        await expectLumenValue(scope, 'session')
        await expect(thinking).toHaveAttribute('data-value', `string:${level.toLowerCase()}`)
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
        // The responsive header stays mounted outside the content boundary.
        // Restore its real opener; desktop session-tool rows are unmounted
        // by Settings and therefore fall back to the named session region.
        if (openedFromMobileHeader) await expect(mobileOpener).toBeFocused()
        else await expect(pageBoundary).toBeFocused()
        await expect(pageBoundary).toHaveAccessibleName(host.ready.sessionTitle)
        await expectComposerText(prompt, draft)
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
        await expectComposerText(prompt, draft)
      }
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) await stopWebSessionHost(host)
      await rm(root, { recursive: true, force: true })
    }
  })
}
