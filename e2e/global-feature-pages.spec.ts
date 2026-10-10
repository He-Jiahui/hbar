import { expect, test, type Page } from '@playwright/test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { globalFeatureCopy, globalFeaturePageIds } from '../apps/web/src/global-feature-copy'
import { notificationCopy } from '../apps/web/src/notification-copy'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { openSessionTool } from './support/session-tools-menu'
import { expectComposerText } from './support/composer-text'
import { lumenMenuForTrigger } from './support/lumen-controls'
import { openComposerTemplates } from './support/composer-templates-menu'

async function showNavigation(page: Page, locale: ShellLocale) {
  const toggle = page.getByRole('button', { name: getShellCopy(locale).shell.showSidebar, exact: true })
  if ((page.viewportSize()?.width ?? 1440) < 1024)
    await expect(page.locator('.hbar-app-react-shell-content')).toHaveAttribute('data-hbar-sidebar-expanded', 'false')
  if (await toggle.isVisible()) await toggle.click()
  await expect(page.locator('.hbar-app-react-sidebar-brand-actions')).toBeInViewport()
}

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`global pages replace the conversation and recover its draft and session tools: ${locale}`, async ({
    browser,
  }, testInfo) => {
    test.setTimeout(100_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-global-pages-'))
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } })
    const labels = globalFeatureCopy(locale)
    const copy = getShellCopy(locale)
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
        goalAutoContinue: false,
      })
      const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
      await context.addInitScript((language) => localStorage.setItem('hbar:web:language', language), locale)
      expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      page.setDefaultTimeout(10_000)
      const pageErrors: string[] = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      await page.goto(origin)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const prompt = page
        .locator('.hbar-app-react-session-workspace')
        .getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = '保留会话草稿 — Keep the original unsent draft'
      await prompt.fill(draft)
      for (const width of [1440, 960, 320]) {
        await page.setViewportSize({ width, height: 900 })
        for (const pageId of globalFeaturePageIds.filter((id) => id !== 'onboarding')) {
          if (pageId === 'prompt-templates') await openComposerTemplates(page, copy.session.addMenu)
          else {
            await showNavigation(page, locale)
            if (pageId === 'run-board') {
              const project = page.locator(`section[data-workspace-id="${host.ready.workspaceId}"]`).first()
              const trigger = project.locator(':scope > .lumen-tree-row .lumen-action-menu-trigger')
              await trigger.click()
              const menu = await lumenMenuForTrigger(trigger)
              await menu.getByRole('menuitem', { name: copy.shell.workspaceRunBoard, exact: true }).click()
            } else {
              const entry =
                pageId === 'notifications'
                  ? page.locator('.hbar-app-react-sidebar-brand-actions .hbar-web-notification-page-button')
                  : page.getByRole('button', { name: copy.shell.schedules, exact: true })
              await entry.focus()
              await entry.press('Enter')
            }
          }
          const feature = page.locator(`[data-global-page="${pageId}"]`)
          await expect(feature).toBeVisible()
          await expect(feature).toBeInViewport()
          await expect(
            feature
              .locator('.hbar-web-global-page-header')
              .getByRole('heading', { name: labels.titles[pageId], exact: true }),
          ).toBeVisible()
          await expect(
            feature
              .locator('.hbar-web-global-page-body')
              .getByRole('heading', {
                name: pageId === 'notifications' ? notificationCopy(locale).title : labels.titles[pageId],
                exact: true,
              })
              .first(),
          ).toBeVisible()
          await expect(prompt).toHaveCount(0)
          await expect(page.locator('.hbar-web-tool-outlet')).toHaveCount(0)
          await expect(page.getByRole('dialog')).toHaveCount(0)
          const sessionTabs = page.locator('.hbar-workspace-tabs-region')
          if (width >= 1024) await expect(sessionTabs.getByRole('tab')).toHaveCount(1)
          await expect(sessionTabs.getByRole('tab', { selected: true })).toHaveCount(0)
          const region = page.getByRole('region', { name: labels.titles[pageId], exact: true })
          await expect(region).toBeFocused()
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
          ).toBe(true)
          if (pageId === 'schedules')
            await page.screenshot({ path: testInfo.outputPath(`global-schedules-${width}.png`) })
          if (pageId === 'notifications')
            await page.screenshot({ path: testInfo.outputPath(`global-notifications-${width}.png`) })
          const back = feature.getByRole('button', { name: labels.back, exact: true })
          await back.focus()
          await page.keyboard.press('Enter')
          await expect(feature).toHaveCount(0)
          await expect(prompt).toBeVisible()
          await expectComposerText(prompt, draft)
        }
      }
      await page.setViewportSize({ width: 1440, height: 900 })
      await openSessionTool(page, copy.session.tools, 'monitoring')
      await expect(page.locator('.hbar-web-tool-outlet')).toBeVisible()
      await openComposerTemplates(page, copy.session.addMenu)
      await expect(page.locator('[data-global-page="prompt-templates"]')).toBeVisible()
      await expect(page.locator('.hbar-web-tool-outlet')).toHaveCount(0)
      // Switching global pages retains the original conversation return target.
      await page.getByRole('button', { name: labels.titles.schedules, exact: true }).click()
      await page.getByRole('button', { name: labels.back, exact: true }).click()
      await expect(page.locator('.hbar-web-tool-outlet')).toBeVisible()
      await expectComposerText(prompt, draft)
      expect(pageErrors).toEqual([])
    } finally {
      try {
        await context.close()
      } finally {
        if (host) await stopWebSessionHost(host)
        if (
          basename(root).startsWith('hbar-global-pages-') &&
          dirname(await realpath(root)) === (await realpath(tmpdir()))
        )
          await rm(root, { recursive: true, force: true })
      }
    }
  })
}
