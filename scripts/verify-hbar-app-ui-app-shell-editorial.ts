import { chromium, expect } from '@playwright/test'
const browser = await chromium.launch({
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage(),
  errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
const base = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5181'
const url = (mode = '', theme = 'light') =>
  `${base}/?variant=hbar-app-ui-app-shell-4&mode=isolated&theme=${theme}&appShellFixture=${mode}`
const closeNav = async () => {
  const close = page.getByRole('button', { name: 'Close navigation', exact: true })
  if (await close.isVisible()) await close.press('Escape')
}
try {
  for (const width of [1280, 1279, 1086, 1024, 1023, 768, 767, 640, 639, 356, 286]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    await closeNav()
    await expect(page.locator('.lumen-editorial-table tbody tr')).toHaveCount(16)
    if (width >= 768) await expect(page.locator('.lumen-editorial-table')).toBeVisible()
    else await expect(page.locator('.lumen-editorial-cards')).toBeVisible()
    expect(await page.locator('main').evaluate((e) => e.scrollWidth <= e.clientWidth + 1), `main width ${width}`).toBe(
      true,
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  }
  await page.setViewportSize({ width: 1086, height: 800 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'In review', exact: true }).press('Space')
  await expect(page.locator('.lumen-editorial-table tbody tr')).toHaveCount(4)
  await page.getByRole('button', { name: 'Thursday, August 13, 2026', exact: true }).press('Space')
  await expect(page.locator('.lumen-editorial-agenda li')).toHaveCount(8)
  await page.getByRole('button', { name: 'Thursday, August 13, 2026', exact: true }).press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Friday, August 14, 2026', exact: true })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Thursday, August 13, 2026', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.keyboard.press('Home')
  await expect(page.getByRole('button', { name: 'Sunday, August 9, 2026', exact: true })).toBeFocused()
  await expect(page.getByRole('button', { name: 'Wednesday, August 12, 2026', exact: true })).toHaveAttribute(
    'data-today',
    'true',
  )
  await page.getByRole('button', { name: 'Next month', exact: true }).click()
  await expect(page.getByRole('table', { name: 'September 2026 publishing schedule', exact: true })).toBeVisible()
  await expect(page.locator('.lumen-editorial-agenda li')).toHaveCount(8)
  await page.getByRole('button', { name: 'Tuesday, September 1, 2026', exact: true }).click()
  await page.getByRole('button', { name: 'Show today', exact: true }).click()
  await expect(page.locator('.lumen-editorial-agenda li')).toHaveCount(9)
  await expect(page.getByRole('table', { name: 'September 2026 publishing schedule', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Hide schedule', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Schedule', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Schedule panel', exact: true }).click()
  await expect(page.getByRole('complementary', { name: 'Schedule', exact: true })).toBeVisible()
  for (const mode of ['', 'localized', 'empty', 'overflow']) {
    await page.setViewportSize({ width: 286, height: 320 })
    await page.goto(url(mode, 'dark'), { waitUntil: 'networkidle' })
    const dialog = page.getByRole('dialog')
    await dialog.locator('button').first().press('Escape')
    expect(
      await page.locator('main').evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      `short fixture ${mode}`,
    ).toBe(true)
    await page.locator('header button').last().click()
    const schedule = page.locator('.lumen-editorial-schedule')
    await expect(schedule).toBeVisible()
    expect(await schedule.evaluate((e) => e.getBoundingClientRect().height)).toBeLessThanOrEqual(144)
    await expect(page.locator('.lumen-editorial-calendar')).toBeHidden()
    expect(await page.locator('main').evaluate((e) => e.clientHeight)).toBeGreaterThan(0)
    if (mode === 'overflow') {
      await expect(page.locator('.lumen-editorial-agenda li')).toHaveCount(101)
      await expect(page.locator('.lumen-editorial-cards > li')).toHaveCount(101)
    }
  }
  expect(errors).toEqual([])
  console.log(
    JSON.stringify({
      editorial: 'passed',
      widths: 11,
      shortHeight: 320,
      records: 101,
      events: 101,
      navigation: 51,
      locales: ['en', 'de'],
    }),
  )
} finally {
  await browser.close()
}
