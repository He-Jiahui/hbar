import { expect, test } from '@playwright/test'
import { mountLumenFixture } from './support/lumen-controls-fixture'

for (const theme of ['dark', 'light'] as const) {
  test(`tool keeps its state and reading position between split and drawer in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 700 })
    await mountLumenFixture(page, 'tests/fixtures/workbench-drawer-browser.tsx', {
      theme,
      locale: 'zh-CN',
      styles:
        'html, body, #fixture-root { height:100%; } body { margin:0; font-family:system-ui; } .fixture-tool { display:flex; flex:1; min-height:0; flex-direction:column; gap:8px; padding:16px; } .fixture-tool-scroll { flex:1; min-height:0; overflow:auto; }',
    })
    await expect(page.locator('[data-lumen-shell="app"]')).toHaveAttribute('data-tool-presentation', 'split')
    await page.getByRole('button', { name: '面板计数 0', exact: true }).click()
    await page.getByRole('textbox', { name: '面板草稿' }).fill('输入与 IME 草稿')
    await page.getByTestId('tool-scroll').evaluate((element) => {
      element.scrollTop = 300
    })
    await expect.poll(() => page.getByTestId('tool-scroll').evaluate((element) => element.scrollTop)).toBe(300)
    for (const width of [768, 320, 1088, 1440]) {
      await page.setViewportSize({ width, height: 700 })
      await expect(page.locator('[data-lumen-shell="app"]')).toHaveAttribute(
        'data-tool-presentation',
        width < 840 ? 'drawer' : 'split',
      )
      await expect(page.getByRole('button', { name: '面板计数 1', exact: true })).toBeVisible()
      await expect(page.getByRole('textbox', { name: '面板草稿' })).toHaveValue('输入与 IME 草稿')
      await expect
        .poll(() => page.getByTestId('tool-scroll').evaluate((element) => element.scrollTop))
        .toBeGreaterThanOrEqual(299)
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.getByRole('button', { name: '关闭工具', exact: true }).click()
    await page.setViewportSize({ width: 768, height: 700 })
    await page.getByRole('button', { name: '打开工具', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '会话状态', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '打开工具', exact: true })).toBeFocused()
    await page.getByRole('button', { name: '打开工具', exact: true }).click()
    await page.mouse.click(12, 300)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
}
