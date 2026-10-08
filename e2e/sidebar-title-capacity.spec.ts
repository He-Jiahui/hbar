import { expect, test } from '@playwright/test'
import { getShellCopy } from '../apps/web/src/shell-copy'
import type { SidebarTitleCapacityInput } from '../tests/fixtures/sidebar-title-capacity-browser'
import { mountLumenFixture } from './support/lumen-controls-fixture'

for (const locale of ['en-US', 'zh-CN'] as const)
  for (const mode of ['light', 'dark'] as const)
    test(`sidebar owns complete workspace title reading ${locale} ${mode}`, async ({ page }, info) => {
      test.setTimeout(90_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      await mountLumenFixture(page, 'tests/fixtures/sidebar-title-capacity-browser.tsx', { locale, theme: mode })
      const labels = getShellCopy(locale).shell
      const name = (locale === 'zh-CN' ? '项目名称完整换行逐段阅读' : 'Complete workspace title reading ')
        .repeat(500)
        .slice(0, 4000)
      const input: SidebarTitleCapacityInput = { locale, mode, names: [name], selected: 'project:0' }
      await page.evaluate((value) => window.setSidebarTitleCapacity(value), input)
      const pane = page.getByRole('region', { name: labels.projectsAndSessions, exact: true })
      const title = pane.locator('.hbar-sidebar-title').first()
      for (const width of [1440, 1100, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 })
        await expect(title).toHaveText(name)
        expect(await title.evaluate((node) => getComputedStyle(node).whiteSpace)).toBe('normal')
        expect(await title.evaluate((node) => getComputedStyle(node).textOverflow)).not.toBe('ellipsis')
        expect(await pane.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
        await expect(pane).toHaveAttribute('tabindex', '0')
        await pane.focus()
        await page.keyboard.press('Home')
        if (await pane.evaluate((node) => node.scrollHeight > node.clientHeight + 1)) {
          await page.keyboard.press('PageDown')
          await expect.poll(() => pane.evaluate((node) => node.scrollTop)).toBeGreaterThan(0)
          await page.keyboard.press('End')
        }
        await expect
          .poll(() =>
            title.evaluate((node) => {
              const text = node.firstChild
              const reader = node.closest('.lumen-app-sidebar-content')
              if (!text || !reader) return false
              const range = document.createRange()
              range.setStart(text, Math.max(0, (text.textContent?.length ?? 0) - 1))
              range.setEnd(text, text.textContent?.length ?? 0)
              const last = range.getBoundingClientRect()
              const owner = reader.getBoundingClientRect()
              return (
                last.top >= owner.top - 1 &&
                last.bottom <= owner.bottom + 1 &&
                last.left >= owner.left - 1 &&
                last.right <= owner.right + 1
              )
            }),
          )
          .toBe(true)
        await expect(page.getByRole('button', { name: labels.settings, exact: true })).toBeVisible()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        if (width === 320) await page.screenshot({ path: info.outputPath(`${locale}-${mode}-4000.png`) })
      }
      expect(await page.evaluate(() => window.canRenderSidebarWorkspaceName('a'.repeat(4000)))).toBe(true)
      expect(await page.evaluate(() => window.canRenderSidebarWorkspaceName('a'.repeat(4001)))).toBe(false)
      await page.evaluate((value) => window.setSidebarTitleCapacity(value), { ...input, names: [], selected: null })
      await expect(pane.getByText(labels.noWorkspaces, { exact: true })).toBeVisible()
      await page.evaluate((value) => window.setSidebarTitleCapacity(value), {
        ...input,
        names: [name, labels.brand],
        selected: 'missing',
      })
      await expect(pane.getByRole('treeitem', { selected: true })).toHaveCount(0)
      const original = pane.getByRole('button', { name: labels.createSessionInWorkspace(name), exact: true })
      await original.focus()
      await page.keyboard.press('Enter')
      expect(await page.evaluate(() => window.sidebarTitleCapacityActions())).toEqual(['new:0'])
      await page.getByRole('button', { name: labels.settings, exact: true }).click()
      expect(await page.evaluate(() => window.sidebarTitleCapacityActions())).toEqual(['new:0', 'settings'])
      expect(errors).toEqual([])
    })
