import { expect, test } from '@playwright/test'
const baseUrl = `http://127.0.0.1:${process.env.HBAR_APP_UI_PREVIEW_PORT ?? 5180}`

test('workspace components preserve category search, variant selection, viewports and local action history', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${baseUrl}/?variant=hbar-app-ui-prompt-input-1`)
  await expect(page.locator('[data-hbar-app-ui-component="hbar-app-ui-prompt-input-1"]').first()).toBeVisible()
  await page
    .getByRole('group', { name: 'Preview viewport' })
    .getByRole('button', { name: 'mobile', exact: true })
    .click()
  await expect(page.locator('.hbar-app-ui-preview-frame-mobile')).toBeVisible()
  await page.getByRole('button', { name: 'Use light theme' }).click()
  await expect(page.locator('.hbar-app-ui-preview')).toHaveAttribute('data-hbar-app-ui-theme', 'light')
  await page
    .locator('.hbar-app-ui-preview-variant-list')
    .getByRole('button', { name: /Prompt Input 2(?:\s|$)/ })
    .click()
  await expect(page).toHaveURL(/variant=hbar-app-ui-prompt-input-2/)
  await expect(page.locator('[data-hbar-app-ui-component="hbar-app-ui-prompt-input-2"]').first()).toBeVisible()
  await page.locator('.hbar-app-ui-preview-scenario button').first().click()
  await expect(page.locator('.hbar-app-ui-preview-events li')).toHaveCount(1)
  await page.getByRole('textbox', { name: 'Search components', exact: true }).fill('no component matches this query')
  await expect(page.getByText('No matching components.', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await expect(page.locator('.hbar-app-ui-preview-category-list button')).toHaveCount(38)
  await page.getByRole('button', { name: 'Reset preview', exact: true }).click()
  await expect(page.locator('.hbar-app-ui-preview')).toHaveAttribute('data-hbar-app-ui-theme', 'dark')
  await expect(page.locator('.hbar-app-ui-preview-events li')).toHaveCount(0)
  expect(errors).toEqual([])
})
test('localized workspace labels remain usable at narrow widths', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 960 })
  await page.goto(`${baseUrl}/?variant=hbar-app-ui-prompt-input-1&locale=zh-CN`)
  await expect(page.getByRole('textbox', { name: '搜索组件', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '重置预览', exact: true })).toBeVisible()
  await page.getByRole('group', { name: '预览尺寸' }).getByRole('button', { name: '手机', exact: true }).click()
  await expect(page.locator('.hbar-app-ui-preview-frame-mobile')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
test('fullscreen failures are reported next to the initiating action', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLElement.prototype.requestFullscreen = () => Promise.reject(new Error('Unavailable in fixture'))
  })
  await page.goto(`${baseUrl}/?variant=hbar-app-ui-card-1`)
  await page.getByRole('button', { name: 'Enter fullscreen', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Fullscreen is unavailable. Try again.')
})
