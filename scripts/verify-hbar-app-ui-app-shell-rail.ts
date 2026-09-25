import { chromium, expect } from '@playwright/test'

const base = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5181'
const browser = await chromium.launch({
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
const url = (mode = '', theme = 'light') =>
  `${base}/?variant=hbar-app-ui-app-shell-2&mode=isolated&theme=${theme}&appShellFixture=${mode}`
try {
  for (const width of [1086, 1024, 1023, 670, 640, 639, 356, 286]) {
    await page.setViewportSize({ width, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    if (width < 1024) {
      await expect(page.getByRole('dialog', { name: 'Navigation', exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Close navigation', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused()
    } else await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.locator('[data-record-id]')).toHaveCount(11)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    expect(await page.locator('main').evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true)
  }
  await page.setViewportSize({ width: 1086, height: 720 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Dispatch', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Load board')
  await expect(page.getByRole('navigation', { name: 'Dispatch', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Assign driver', exact: true })).toBeVisible()
  const workspace = page.getByRole('button', { name: 'K Kestrel Freight 24 members', exact: true })
  await workspace.click()
  await expect(page.getByRole('menuitemradio', { name: 'Kestrel Freight 24 members', exact: true })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('menuitem', { name: 'Add workspace', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(workspace).toBeFocused()
  await workspace.click()
  await page.getByRole('menuitemradio', { name: 'Kestrel Freight Europe 9 members', exact: true }).click()
  await expect(page.getByRole('button', { name: 'K Kestrel Freight Europe 9 members', exact: true })).toBeFocused()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Load board')
  await page.getByRole('link', { name: 'Needs a driver 9', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Load board 61', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('button', { name: 'Assign driver', exact: true }).click()
  await page.locator('[data-record-id]').first().getByRole('button').click()
  await page.getByRole('button', { name: 'Marta Kowalczyk, dispatch manager', exact: true }).click()
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.setViewportSize({ width: 286, height: 320 })
  for (const mode of ['', 'localized', 'empty', 'empty-records', 'overflow']) {
    await page.goto(url(mode, 'dark'), { waitUntil: 'networkidle' })
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.lumen-rail-avatar')).toBeInViewport()
    if (mode === '') {
      await dialog.getByRole('button', { name: 'Fleet', exact: true }).click()
      await expect(dialog).toBeVisible()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fleet')
    }
    await dialog.locator('.lumen-rail-close').press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(await page.locator('main').evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true)
    if (mode === 'overflow') await expect(page.locator('[data-record-id]')).toHaveCount(101)
    await page.locator('.lumen-rail-open').click()
    await expect(page.getByRole('dialog')).toBeVisible()
  }
  expect(errors).toEqual([])
  console.log(
    JSON.stringify({
      appShellRail: 'passed',
      widths: [1086, 1024, 1023, 670, 640, 639, 356, 286],
      shortHeight: 320,
      records: 101,
      navigation: 51,
      locales: ['en', 'de'],
    }),
  )
} finally {
  await browser.close()
}
