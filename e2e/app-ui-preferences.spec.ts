import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('real preferences apply immediately, survive reload and remain usable on narrow screens', async ({
  page,
  context,
}) => {
  const fixture = JSON.parse(await readFile('.dev/e2e.json', 'utf8')) as { url: string; token: string }
  await context.request.post(`${fixture.url}/auth/token`, { data: { token: fixture.token } })
  await page.goto(fixture.url)
  await page.getByRole('button', { name: '设置', exact: true }).first().click()
  await page.getByRole('button', { name: '外观', exact: true }).click()
  const preferences = page.locator('.hbar-app-ui-preferences').filter({ visible: true })
  await expect(preferences).toBeVisible()
  await preferences.getByRole('radio', { name: '浅色', exact: true }).check()
  await preferences.getByRole('combobox', { name: '语言', exact: true }).selectOption('en-US')
  await expect(preferences.getByRole('radio', { name: 'Light', exact: true })).toBeChecked()
  await expect(preferences.getByRole('combobox', { name: 'Language', exact: true })).toHaveValue('en-US')
  await expect(preferences.getByRole('button')).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: 'Appearance', exact: true }).click()
  await expect(preferences.getByRole('radio', { name: 'Light', exact: true })).toBeChecked()
  await expect(preferences.getByRole('combobox', { name: 'Language', exact: true })).toHaveValue('en-US')
  await page.setViewportSize({ width: 320, height: 740 })
  await page.getByRole('button', { name: 'Settings', exact: true }).filter({ visible: true }).first().click()
  await page.getByRole('button', { name: 'Appearance', exact: true }).filter({ visible: true }).click()
  await expect(page.getByRole('button', { name: 'Appearance', exact: true }).filter({ visible: true })).toHaveClass(
    'selected',
  )
  await expect(preferences).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'artifacts/app-ui-integration/preferences-mobile.png' })
  await preferences.getByRole('radio', { name: 'Dark', exact: true }).check()
  await preferences.getByRole('combobox', { name: 'Language', exact: true }).selectOption('zh-CN')
  await expect(preferences.getByRole('radio', { name: '深色', exact: true })).toBeChecked()
})
