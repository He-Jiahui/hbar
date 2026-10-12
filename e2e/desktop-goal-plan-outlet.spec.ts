import { expect, test, type ConsoleMessage } from '@playwright/test'
import { mountLumenFixture } from './support/lumen-controls-fixture'

for (const theme of ['dark', 'light'] as const) {
  test(`production desktop Goal/Plan outlet stays in one right aside and drawer owns one modal in ${theme}`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = []
    let extraErrors = 0
    const recordError = (message: string) => {
      if (errors.length < 32) errors.push(message.slice(0, 2_000))
      else extraErrors += 1
    }
    // Install observers before mounting so startup failures remain visible.
    const onPageError = (error: Error) => recordError(error.message)
    const onConsoleError = (message: ConsoleMessage) => {
      if (message.type() === 'error') recordError(message.text())
    }
    page.on('pageerror', onPageError)
    page.on('console', onConsoleError)
    try {
      await page.setViewportSize({ width: 1440, height: 760 })
      await mountLumenFixture(page, 'tests/fixtures/desktop-goal-plan-outlet-browser.tsx', {
        theme,
        locale: 'zh-CN',
        styles:
          'html, body, #fixture-root { height:100%; } body { margin:0; overflow:hidden; } #fixture-root { display:flex; flex-direction:column; min-height:0; } [data-lumen-shell="app"] { min-height:0; flex:1; } [data-lumen-shell="app"] { height:100%; } .goal-plan-tool { display:flex; flex:1; min-height:0; flex-direction:column; gap:8px; padding:16px; } .goal-plan-scroll { flex:1; min-height:0; overflow:auto; }',
      })
      await expect(page.locator('[data-hbar-layout-adapter=flexlayout]')).toHaveCount(1)
      await expect(page.getByRole('region', { name: '目标与计划工具' })).toHaveCount(1)
      const splitGeometry = await page.getByRole('region', { name: '目标与计划工具' }).evaluate((node) => {
        const rect = (element: Element | null) => {
          if (!element) return null
          const bounds = element.getBoundingClientRect()
          return { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom }
        }
        return {
          tool: rect(node),
          aside: rect(node.closest('aside')),
          adapter: rect(node.closest('[data-hbar-layout-adapter="flexlayout"]')),
          main: rect(document.querySelector('[data-testid="workspace-content"]')),
        }
      })
      await testInfo.attach('split-pane-geometry', {
        body: JSON.stringify(splitGeometry),
        contentType: 'application/json',
      })
      if (!splitGeometry.tool || !splitGeometry.aside || !splitGeometry.adapter || !splitGeometry.main)
        throw new Error('Goal/Plan must be owned by the desktop adapter right aside alongside the main pane')
      // Compare pane ownership and bounds; screenshot coordinates are not a layout contract.
      expect(splitGeometry.aside.left).toBeGreaterThanOrEqual(splitGeometry.main.right - 1)
      expect(splitGeometry.tool.left).toBeGreaterThanOrEqual(splitGeometry.aside.left - 1)
      expect(splitGeometry.tool.right).toBeLessThanOrEqual(splitGeometry.aside.right + 1)
      expect(splitGeometry.tool.top).toBeGreaterThanOrEqual(splitGeometry.aside.top - 1)
      expect(splitGeometry.tool.bottom).toBeLessThanOrEqual(splitGeometry.aside.bottom + 1)
      expect(splitGeometry.aside.top).toBeGreaterThanOrEqual(splitGeometry.adapter.top - 1)
      expect(splitGeometry.aside.bottom).toBeLessThanOrEqual(splitGeometry.adapter.bottom + 1)
      expect(splitGeometry.tool.bottom - splitGeometry.tool.top).toBeGreaterThan(0)
      await page.getByRole('textbox', { name: '目标草稿' }).fill('保留我的编辑草稿')
      await page.getByTestId('goal-plan-scroll').evaluate((element) => {
        element.scrollTop = 420
      })
      await expect.poll(() => page.getByTestId('goal-plan-scroll').evaluate((element) => element.scrollTop)).toBe(420)
      const input = page.getByRole('textbox', { name: '目标草稿' })
      await input.focus()
      await page.setViewportSize({ width: 320, height: 760 })
      await expect(page.locator('[data-hbar-layout-adapter=flexlayout]')).toHaveCount(1)
      await expect(page.getByRole('dialog', { name: '目标与计划' })).toHaveCount(1)
      await expect(page.getByRole('region', { name: '目标与计划工具' })).toHaveCount(1)
      await expect(page.getByRole('textbox', { name: '目标草稿' })).toHaveValue('保留我的编辑草稿')
      const dialog = page.getByRole('dialog', { name: '目标与计划' })
      await expect(dialog).toBeFocused() // modal focusBehavior='surface' focuses the dialog owner first
      await page.keyboard.press('Tab')
      await expect(page.getByRole('button', { name: '关闭目标与计划' })).toBeFocused()
      await page.keyboard.press('Tab')
      await expect(page.getByRole('textbox', { name: '目标草稿' })).toBeFocused()
      await expect
        .poll(() => page.getByTestId('goal-plan-scroll').evaluate((element) => element.scrollTop))
        .toBeGreaterThanOrEqual(419)
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`goal-plan-desktop-qa-${theme}-drawer.png`), fullPage: true })
      await page.setViewportSize({ width: 1440, height: 760 })
      await expect(page.locator('[data-hbar-layout-adapter=flexlayout]')).toHaveCount(1)
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(page.getByRole('textbox', { name: '目标草稿' })).toHaveValue('保留我的编辑草稿')
      await expect
        .poll(() => page.getByTestId('goal-plan-scroll').evaluate((element) => element.scrollTop))
        .toBeGreaterThanOrEqual(419)
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`goal-plan-desktop-qa-${theme}-split.png`), fullPage: true })
      await expect(page.getByRole('alert')).toHaveCount(0)
      expect(errors).toEqual([])
      expect(extraErrors).toBe(0)
    } finally {
      page.off('pageerror', onPageError)
      page.off('console', onConsoleError)
      await testInfo.attach('bounded-browser-errors', {
        body: JSON.stringify({ errors, extraErrors }),
        contentType: 'application/json',
      })
    }
  })
}
