import { chromium, expect } from '@playwright/test'
const browser = await chromium.launch({
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--disable-lcd-text'],
})
const page = await browser.newPage(),
  errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
const base = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5181'
const url = (mode = '') => `${base}/?variant=hbar-app-ui-app-shell-7&mode=isolated&theme=light&appShellFixture=${mode}`
try {
  for (const width of [1280, 1086, 1024, 1023, 768, 767, 640, 639, 356, 286]) {
    await page.setViewportSize({ width, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    if (width < 1024) await expect(page.getByRole('dialog', { name: 'Navigation', exact: true })).toBeVisible()
    else await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `overflow at ${width}`,
    ).toBe(true)
  }
  await page.setViewportSize({ width: 1086, height: 720 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Project: Payments API', exact: true }).press('Space')
  await page.getByRole('menu').press('ArrowDown')
  await page.getByRole('menu').press('Enter')
  await expect(page.locator('tbody tr').first()).toContainText('ledger-core-primary')
  await page.getByRole('button', { name: 'Environment: Production', exact: true }).press('Space')
  await page.getByRole('menu').press('ArrowDown')
  await page.getByRole('menu').press('Enter')
  await expect(page.locator('tbody tr')).toHaveCount(13)
  await expect(page.getByRole('button', { name: 'System status: operational', exact: true })).toBeVisible()
  await page.getByRole('searchbox').fill('zzzaudit')
  await expect(page.locator('tbody tr')).toHaveCount(13)
  await page.getByRole('button', { name: 'Data', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Backups', exact: true })).toBeHidden()
  await expect(page.locator('a', { hasText: 'Backups' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Organisation: Northwind Labs', exact: true }).press('Space')
  await page.getByRole('menu').press('End')
  await page.getByRole('menu').press('Escape')
  await expect(page.getByRole('button', { name: 'Organisation: Northwind Labs', exact: true })).toBeFocused()
  for (const mode of ['', 'localized', 'empty', 'one', 'boundary', 'overflow']) {
    await page.setViewportSize({ width: 286, height: 320 })
    await page.goto(url(mode), { waitUntil: 'networkidle' })
    const drawer = page.getByRole('dialog')
    await drawer.locator('button').first().press('Escape')
    await expect(drawer).toHaveCount(0)
    if (mode === 'overflow') {
      const pane = page.locator('.lumen-scope-records')
      expect(await pane.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
      await page.locator('.lumen-scope-cards li').last().scrollIntoViewIfNeeded()
      await expect(page.locator('.lumen-scope-cards li').last()).toBeInViewport()
    }
    await page
      .getByRole('button', {
        name: mode === 'localized' ? 'Organisation und Projekt' : 'Organisation and project',
        exact: true,
      })
      .press('Space')
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    expect(
      await menu.evaluate((element) => {
        const r = element.getBoundingClientRect()
        return r.x >= 0 && r.right <= innerWidth + 1
      }),
      `menu containment ${mode}`,
    ).toBe(true)
    await menu.press('Escape')
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `fixture overflow ${mode}`,
    ).toBe(true)
  }
  expect(errors).toEqual([])
  console.log(JSON.stringify({ status: 'passed', widths: 10, shortHeight: 320, records: 101, fixtures: 6, errors }))
} finally {
  await browser.close()
}
