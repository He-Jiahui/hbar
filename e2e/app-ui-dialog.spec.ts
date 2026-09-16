import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test('shared app-ui dialog contains keyboard focus, closes with Escape and restores the trigger', async ({
  page,
  context,
}) => {
  const fixture = JSON.parse(await readFile('.dev/e2e.json', 'utf8')) as { url: string; token: string }
  await context.request.post(`${fixture.url}/auth/token`, { data: { token: fixture.token } })
  await page.goto(fixture.url)
  const trigger = page.getByRole('button', { name: '添加工作区', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '添加工作区', exact: true })
  await expect(dialog).toHaveClass(/hbar-app-ui-native-dialog/)
  await expect(dialog.getByRole('textbox', { name: '目录路径', exact: true })).toBeFocused()
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press('Tab')
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true)
  }
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await trigger.click()
  await page.setViewportSize({ width: 320, height: 740 })
  await expect(dialog).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: 'artifacts/app-ui-integration/dialog-mobile.png' })
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(dialog).toHaveCount(0)
})

test('dialog close copy follows the host locale and the light theme keeps header contrast', async ({
  page,
  context,
}) => {
  const fixture = JSON.parse(await readFile('.dev/e2e.json', 'utf8')) as { url: string; token: string }
  await context.addInitScript(() =>
    localStorage.setItem(
      'hbar.workbench.v1',
      JSON.stringify({ version: 6, state: { theme: 'light', locale: 'en-US' } }),
    ),
  )
  await context.request.post(`${fixture.url}/auth/token`, { data: { token: fixture.token } })
  await page.goto(fixture.url)
  await page.getByRole('button', { name: 'Add workspace', exact: true }).click()
  const dialog = page.locator('.hbar-app-ui-native-dialog')
  await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeVisible()
  const colors = await dialog
    .locator('header')
    .evaluate((element) => ({
      color: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
    }))
  expect(colors.color).not.toBe(colors.background)
  await page.screenshot({ path: 'artifacts/app-ui-integration/dialog-light.png' })
  await page.mouse.click(0, 0)
  await expect(dialog).toHaveCount(0)
})
