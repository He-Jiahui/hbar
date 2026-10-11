import { expect, test } from '@playwright/test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { globalFeatureCopy } from '../apps/web/src/global-feature-copy'
import { lumenMenuForTrigger } from './support/lumen-controls'
import { removeOwnedFixtureDirectory } from './support/owned-fixture-directory'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`secondary pages remain discoverable with full labels and nearby dismissal: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(90_000)
    const prefix = 'hbar-global-navigation-'
    const root = await mkdtemp(join(tmpdir(), prefix))
    const context = await browser.newContext({ locale, colorScheme: locale === 'zh-CN' ? 'dark' : 'light' })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4361),
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4359}`
      expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await page.goto(origin)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const copy = getShellCopy(locale)
      const pages = globalFeatureCopy(locale)
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: width === 320 ? 720 : 960 })
        const showSidebar = async () => {
          if (
            (await page.locator('[data-hbar-sidebar-expanded]').getAttribute('data-hbar-sidebar-expanded')) !== 'true'
          )
            await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
        }
        for (const id of ['run-board', 'prompt-templates', 'onboarding'] as const) {
          await showSidebar()
          const trigger = page.getByRole('button', { name: pages.navigation, exact: true })
          await trigger.click()
          const menu = await lumenMenuForTrigger(trigger)
          await expect(menu.getByRole('menuitem')).toHaveCount(3)
          await menu.getByRole('menuitem', { name: pages.titles[id], exact: true }).click()
          const surface = page.locator(`[data-global-page="${id}"]`)
          await expect(surface).toBeVisible()
          await expect(surface.getByRole('heading', { name: pages.titles[id], exact: true }).first()).toBeVisible()
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
          await surface.screenshot({ path: info.outputPath(`${id}-${locale}-${width}.png`) })
          await surface.getByRole('button', { name: pages.back, exact: true }).click()
          await expect(
            page.getByRole('heading', { level: 1, name: host.ready.sessionTitle, exact: true }),
          ).toBeVisible()
        }
        await showSidebar()
        const trigger = page.getByRole('button', { name: pages.navigation, exact: true })
        await trigger.click()
        await page.keyboard.press('Escape')
        await expect(trigger).toHaveAttribute('aria-expanded', 'false')
        await expect(trigger).toBeFocused()
        await trigger.click()
        await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
        await expect(trigger).toHaveAttribute('aria-expanded', 'false')
      }
      expect(errors).toEqual([])
    } finally {
      try {
        await context.close()
      } finally {
        if (host) await stopWebSessionHost(host)
        await removeOwnedFixtureDirectory(root, prefix)
      }
    }
  })
}
