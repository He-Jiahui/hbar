import { expect, test } from '@playwright/test'
import { mountLumenFixture } from './support/lumen-controls-fixture'

for (const theme of ['dark', 'light'] as const) {
  test(`adaptive toolbar preserves complete controls and actions in ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1088, height: 700 })
    await mountLumenFixture(page, 'tests/fixtures/workbench-compositions-browser.tsx', {
      theme,
      locale: 'zh-CN',
      styles: 'body { margin:0; font-family:system-ui; } .composition-fixture { padding:16px; gap:16px; }',
    })
    await expect(page.getByRole('button', { name: '选择完整模型名称', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '选择完整模型名称', exact: true }).click()
    for (const width of [320, 768, 1088, 1440, 1920]) {
      await page.setViewportSize({ width, height: 700 })
      await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible()
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.setViewportSize({ width: 320, height: 700 })
    await expect(page.getByRole('button', { name: '选择完整模型名称', exact: true })).toContainText('· 1')
    await page.getByRole('button', { name: '更多操作', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '更多操作', exact: true })).toBeVisible()
    const action = page.getByRole('dialog').getByRole('button', { name: '自动批准工具操作', exact: true })
    await action.click()
    await expect(page.getByRole('status')).toHaveText('自动批准工具操作')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '更多操作', exact: true })).toBeFocused()
    await page.getByRole('button', { name: '更多操作', exact: true }).click()
    await expect(page.getByRole('dialog').getByRole('button', { name: '自动批准工具操作', exact: true })).toContainText(
      '· 1',
    )
    await page.keyboard.press('Escape')
    const flow = await page.getByTestId('clipped').evaluate((element) => ({
      overflow: getComputedStyle(element).overflow,
      nowrap: getComputedStyle(element).whiteSpace,
      text: element.textContent,
    }))
    expect(flow.overflow).toBe('hidden')
    expect(flow.nowrap).toBe('nowrap')
    expect(flow.text).not.toContain('…')
  })
}
