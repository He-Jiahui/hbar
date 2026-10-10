import { expect, test } from '@playwright/test'
import { mountLumenFixture } from './support/lumen-controls-fixture'

for (const theme of ['light', 'dark'] as const) {
  test(`composer keeps mandatory actions, IME and overflow controls working in ${theme}`, async ({ page }) => {
    await mountLumenFixture(page, 'tests/fixtures/adaptive-composer-browser.tsx', {
      theme,
      locale: 'zh-CN',
      styles: 'body {margin:0} .composer-fixture {padding:16px;display:flex;flex-direction:column;gap:16px;} ',
    })
    const editor = page.getByRole('textbox', { name: '提示词' })
    await editor.fill('保留完整输入，兼容中文 IME。')
    await editor.evaluate((element) => {
      element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }))
    })
    await expect(page.getByRole('status')).toHaveText('')
    for (const width of [320, 768, 1088, 1440, 1920]) {
      await page.setViewportSize({ width, height: 600 })
      await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible()
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await page.setViewportSize({ width: 320, height: 600 })
    await page.getByRole('button', { name: '更多输入操作', exact: true }).click()
    await expect(
      page
        .getByRole('dialog', { name: '更多输入操作', exact: true })
        .getByRole('button', { name: '自动批准工具执行与文件写入', exact: true }),
    ).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('保留完整输入，兼容中文 IME。')
    await expect(page.getByRole('button', { name: '停止', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '发送', exact: true })).toHaveCount(0)
    await editor.fill('新消息进入队列')
    await expect(page.getByRole('button', { name: '排队发送', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '显示模型控制', exact: true }).click()
    await expect(page.getByRole('dialog', { name: '更多输入操作', exact: true })).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: '完整模型与推理设置 · 0', exact: true }).click()
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1440, height: 600 })
    await expect(page.getByRole('button', { name: '完整模型与推理设置 · 1', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '停止', exact: true }).click()
    await expect(page.getByRole('button', { name: '发送', exact: true })).toBeVisible()
  })
}
