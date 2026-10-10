import { expect, test } from '@playwright/test'
import { mountLumenFixture } from './support/lumen-controls-fixture'

test('desktop projection preserves local editor state, focus, selection and scroll through geometry and pane changes', async ({
  page,
}) => {
  await mountLumenFixture(page, 'tests/fixtures/flex-layout-continuity-browser.tsx', { locale: 'zh-CN' })
  const editor = page.getByRole('textbox', { name: '调整窗口后保留的本地草稿', exact: true })
  const draft = '不持久化的本地草稿 — resizing must keep this mounted input'
  await editor.fill(draft)
  const instanceId = await page.locator('.continuity-pane').getAttribute('data-instance-id')
  if (!instanceId) throw new Error('The original pane instance must be observable')
  await page.locator('.continuity-scroll').evaluate((element) => {
    element.scrollTop = 500
  })
  await editor.evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) throw new Error('Expected a real input')
    element.setSelectionRange(5, 17)
  })
  for (const width of [1360, 1200, 960, 900, 783, 390, 320, 1440]) {
    await page.setViewportSize({ width, height: 960 })
    await expect(editor).toHaveValue(draft)
    await expect(editor).toBeFocused()
    await expect(page.locator('.continuity-pane')).toHaveAttribute('data-instance-id', instanceId)
    expect(
      await editor.evaluate((element) =>
        element instanceof HTMLInputElement ? [element.selectionStart, element.selectionEnd] : null,
      ),
    ).toEqual([5, 17])
    expect(await page.locator('.continuity-scroll').evaluate((element) => element.scrollTop)).toBe(500)
  }
  for (const name of ['切换左侧栏', '切换工具栏', '切换左侧栏', '切换工具栏']) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(editor).toHaveValue(draft)
    await expect(page.locator('.continuity-pane')).toHaveAttribute('data-instance-id', instanceId)
  }
  await page.getByRole('button', { name: '打开新的工作区视图', exact: true }).click()
  await expect(editor).toHaveValue('')
  await expect(page.locator('.continuity-pane')).not.toHaveAttribute('data-instance-id', instanceId)
  await page.getByRole('button', { name: '验证自适应外壳切换', exact: true }).click()
  await editor.fill(draft)
  const persistentId = await page.locator('.continuity-pane').getAttribute('data-instance-id')
  if (!persistentId) throw new Error('The persistent pane instance must be observable')
  await editor.evaluate((element) => {
    if (!(element instanceof HTMLInputElement)) throw new Error('Expected a real input')
    element.setSelectionRange(5, 17)
  })
  await page.locator('.continuity-scroll').evaluate((element) => {
    element.scrollTop = 500
  })
  for (const width of [1200, 900, 783, 390, 320, 1440]) {
    await page.setViewportSize({ width, height: 960 })
    await expect(editor).toHaveValue(draft)
    await expect(editor).toBeFocused()
    await expect(page.locator('.continuity-pane')).toHaveAttribute('data-instance-id', persistentId)
    expect(
      await editor.evaluate((element) =>
        element instanceof HTMLInputElement ? [element.selectionStart, element.selectionEnd] : null,
      ),
    ).toEqual([5, 17])
    expect(await page.locator('.continuity-scroll').evaluate((element) => element.scrollTop)).toBe(500)
  }
  const outside = page.getByRole('button', { name: '切换工具栏', exact: true })
  await outside.click()
  await page.setViewportSize({ width: 900, height: 960 })
  await expect(outside).toBeFocused()
  await expect(editor).toHaveValue(draft)
  await expect(page.locator('.continuity-pane')).toHaveAttribute('data-instance-id', persistentId)
})
