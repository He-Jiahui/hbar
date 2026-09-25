import { chromium, expect } from '@playwright/test'
const base = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5181'
const browser = await chromium.launch({
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
const url = (mode = '', theme = 'light') =>
  `${base}/?variant=hbar-app-ui-app-shell-3&mode=isolated&theme=${theme}&appShellFixture=${mode}`
try {
  for (const width of [1086, 1024, 1023, 768, 767, 640, 639, 356, 286]) {
    await page.setViewportSize({ width, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    if (width < 1024) {
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.getByRole('button', { name: 'Close navigation', exact: true }).press('Escape')
    }
    if (width >= 768) await expect(page.getByRole('table')).toBeVisible()
    else await expect(page.locator('.lumen-contracts-cards')).toBeVisible()
    await expect(page.locator('tbody tr')).toHaveCount(14)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `document width ${width}`,
    ).toBe(true)
    expect(await page.locator('main').evaluate((e) => e.scrollWidth <= e.clientWidth + 1), `main width ${width}`).toBe(
      true,
    )
  }
  await page.setViewportSize({ width: 1086, height: 720 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  expect(await page.locator('.lumen-contracts-sidebar').evaluate((e) => e.getBoundingClientRect().width)).toBe(56)
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).press('Space')
  expect(await page.locator('.lumen-contracts-sidebar').evaluate((e) => e.getBoundingClientRect().width)).toBe(256)
  await page.getByRole('radio', { name: 'Signed', exact: true }).click()
  await expect(page.locator('tbody tr')).toHaveCount(7)
  await page.getByRole('radio', { name: 'Needs attention', exact: true }).click()
  await expect(page.locator('tbody tr')).toHaveCount(3)
  await page.getByRole('searchbox').fill('missing-result')
  await expect(page.getByRole('table')).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear search', exact: true }).click()
  await expect(page.locator('tbody tr')).toHaveCount(14)
  await expect(page.getByRole('radio', { name: 'All', exact: true })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('radio', { name: 'All', exact: true }).press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'Signed', exact: true })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('searchbox').fill('missing-result')
  await page.getByRole('searchbox').press('Escape')
  await expect(page.getByRole('searchbox')).toHaveAttribute('type', 'text')
  await expect(page.locator('tbody tr')).toHaveCount(7)
  const account = page.getByRole('button', { name: 'Amara Okafor, account menu', exact: true })
  await account.click()
  await page.keyboard.press('End')
  await expect(page.getByRole('menuitem', { name: 'Sign out', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(account).toBeFocused()
  await page.setViewportSize({ width: 286, height: 320 })
  for (const mode of ['', 'localized', 'empty', 'overflow']) {
    await page.goto(url(mode, 'dark'), { waitUntil: 'networkidle' })
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await dialog.locator('button').first().press('Escape')
    expect(
      await page.locator('main').evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      `short fixture ${mode}`,
    ).toBe(true)
    if (mode === 'overflow') await expect(page.locator('.lumen-contracts-cards > li')).toHaveCount(101)
  }
  await page.goto(url(), { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Close navigation', exact: true }).click()
  await page.getByRole('button', { name: 'Search contracts', exact: true }).click()
  await page.getByRole('searchbox').fill('Kestrel')
  await expect(page.locator('.lumen-contracts-cards > li')).toHaveCount(2)
  await page.getByRole('button', { name: 'Close search', exact: true }).click()
  await expect(page.locator('.lumen-contracts-cards > li')).toHaveCount(2)
  await page.getByRole('button', { name: 'Search contracts', exact: true }).click()
  await expect(page.getByRole('searchbox')).toHaveValue('Kestrel')
  await page.getByRole('searchbox').press('Escape')
  await expect(page.locator('.lumen-contracts-cards > li')).toHaveCount(14)
  await expect(page.getByRole('searchbox')).toBeVisible()
  await page.setViewportSize({ width: 768, height: 720 })
  await expect(page.locator('.lumen-contracts-mobile-search')).toBeHidden()
  await expect(page.getByRole('searchbox')).toHaveCount(1)
  expect(errors).toEqual([])
  console.log(
    JSON.stringify({
      contracts: 'passed',
      widths: [1086, 1024, 1023, 768, 767, 640, 639, 356, 286],
      shortHeight: 320,
      records: 101,
      navigation: 51,
      locales: ['en', 'de'],
    }),
  )
} finally {
  await browser.close()
}
