import { chromium, expect } from '@playwright/test'

const base = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5181'
const browser = await chromium.launch({
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
const url = (mode = '', theme = 'light') =>
  `${base}/?variant=hbar-app-ui-app-shell-1&mode=isolated&theme=${theme}&appShellFixture=${mode}`
try {
  for (const width of [1192, 1024, 1023, 768, 767, 670, 640, 639, 356, 286]) {
    await page.setViewportSize({ width, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    if (width < 1024) {
      await expect(page.getByRole('dialog', { name: 'Navigation', exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Close navigation', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeFocused()
    } else await expect(page.getByRole('dialog')).toBeHidden()
    await expect(page.locator('tbody tr')).toHaveCount(14)
    if (width >= 768) await expect(page.getByRole('table')).toBeVisible()
    else await expect(page.locator('.lumen-sidebar-record-cards')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    expect(await page.locator('main').evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true)
  }
  await page.setViewportSize({ width: 1086, height: 720 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  const shipments = page.getByRole('button', { name: 'Shipments', exact: true })
  const dispatch = page.getByRole('link', { name: 'Dispatch board', exact: true })
  const idleBackground = await dispatch.evaluate((e) => getComputedStyle(e).backgroundColor)
  await dispatch.hover()
  await expect.poll(() => dispatch.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(idleBackground)
  await shipments.click()
  await expect(shipments).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('link', { name: 'Awaiting pickup', exact: true })).toBeHidden()
  await shipments.press('Space')
  await expect(shipments).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('searchbox').fill('Kettleworth')
  await expect(page.locator('tbody tr')).toHaveCount(14)
  await page.getByRole('link', { name: 'Awaiting pickup', exact: true }).click()
  await expect(page.getByRole('link', { name: 'In transit', exact: true })).toHaveAttribute('aria-current', 'page')
  const account = page.getByRole('button', { name: 'Devon Okafor Dispatch lead', exact: true })
  await account.click()
  await expect(page.getByRole('menuitem', { name: 'Account settings', exact: true })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('menuitem', { name: 'Sign out', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(account).toBeFocused()
  await account.click()
  await page.getByRole('menuitem', { name: 'Account settings', exact: true }).click()
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(account).toBeFocused()
  await page.getByRole('button', { name: 'Book shipment', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.setViewportSize({ width: 286, height: 320 })
  for (const mode of ['', 'localized', 'empty', 'overflow']) {
    await page.goto(url(mode, 'dark'), { waitUntil: 'networkidle' })
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.lumen-sidebar-account')).toBeInViewport()
    const nav = dialog.getByRole('navigation')
    if (mode !== 'empty') expect(await nav.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true)
    await dialog.locator('.lumen-sidebar-brand button').press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(await page.locator('main').evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true)
    if (mode === 'overflow') await expect(page.locator('.lumen-sidebar-record-cards > li')).toHaveCount(101)
    await page.locator('.lumen-sidebar-open').click()
    await expect(page.getByRole('dialog')).toBeVisible()
  }
  expect(errors).toEqual([])
  console.log(
    JSON.stringify({
      appShellSidebar: 'passed',
      widths: [1192, 1024, 1023, 768, 767, 670, 640, 639, 356, 286],
      shortHeight: 320,
      records: 101,
      navigation: 51,
      locales: ['en', 'de'],
    }),
  )
} finally {
  await browser.close()
}
