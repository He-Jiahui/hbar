import { chromium, expect } from '@playwright/test'

const base = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5181'
const browser = await chromium.launch({
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage()
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
const url = (fixture = '', theme = 'dark') =>
  `${base}/?variant=hbar-app-ui-notifications-3&mode=isolated&theme=${theme}&notificationsFixture=${fixture}`
const root = page.locator('[data-hbar-app-ui-component="hbar-app-ui-notifications-3"]')
const reset = root.getByRole('button', { name: 'Reset', exact: true })
const save = root.getByRole('button', { name: 'Save preferences', exact: true })

try {
  for (const width of [1086, 670, 356, 286]) {
    await page.setViewportSize({ width, height: width === 286 ? 320 : 680 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    await expect(root.getByRole('banner')).toContainText('14 of 21 deliveries enabled')
    await expect(root.getByRole('listitem')).toHaveCount(7)
    await expect(root.getByRole('switch')).toHaveCount(22)
    await expect(root.getByRole('contentinfo')).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    const matrix = root.locator('.lumen-preferences-matrix-viewport')
    const body = root.locator('.lumen-notifications-preferences')
    expect(await body.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true)
    expect(await matrix.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(width <= 356)
  }

  await page.setViewportSize({ width: 1086, height: 680 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  const collaboration = root.locator('[data-hbar-app-ui-region="collaboration"]')
  await collaboration.locator('[data-hbar-app-ui-action="group:collaboration:in-app"]').click()
  await expect(root.getByRole('banner')).toContainText('11 of 21 deliveries enabled')
  await expect(collaboration.locator('[data-hbar-app-ui-action="group:collaboration:in-app"]')).toHaveText('All')
  await collaboration.locator('[data-hbar-app-ui-action="group:collaboration:in-app"]').click()
  await expect(root.getByRole('banner')).toContainText('14 of 21 deliveries enabled')
  await root.getByRole('switch', { name: 'Assigned to you: Push' }).click()
  await expect(root.getByRole('banner')).toContainText('15 of 21 deliveries enabled')
  await expect(save).toBeEnabled()
  await root.getByRole('switch', { name: 'Quiet hours', exact: true }).click()
  await expect(root.getByRole('button', { name: 'Mon', exact: true })).toHaveCount(0)
  await root.getByRole('switch', { name: 'Quiet hours', exact: true }).click()
  await root.getByRole('button', { name: 'Mon', exact: true }).press('Space')
  await expect(root.getByRole('button', { name: 'Mon', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await reset.click()
  await expect(root.getByRole('banner')).toContainText('14 of 21 deliveries enabled')
  await expect(root.getByRole('switch', { name: 'Assigned to you: Push' })).toHaveAttribute('aria-checked', 'false')
  await expect(root.getByRole('button', { name: 'Mon', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(save).toBeDisabled()

  await page.goto(url('retry'), { waitUntil: 'networkidle' })
  await root.getByRole('switch', { name: 'Assigned to you: Push' }).click()
  await save.click()
  await expect(root.getByRole('contentinfo')).toContainText('Could not save preferences. Try again.')
  await expect(save).toBeEnabled()
  await save.click()
  await expect(root.getByRole('contentinfo')).toContainText('All changes saved')
  await expect(save).toBeDisabled()

  await page.goto(url('unavailable'), { waitUntil: 'networkidle' })
  await root.getByRole('switch', { name: 'Assigned to you: Push' }).click()
  await expect(root.getByRole('contentinfo')).toContainText('Saving is unavailable')
  await expect(save).toBeDisabled()

  await page.setViewportSize({ width: 286, height: 320 })
  for (const [fixture, expected] of [
    ['empty', 0],
    ['one', 1],
    ['duplicate', 7],
    ['overflow', 81],
  ] as const) {
    await page.goto(url(fixture, 'light'), { waitUntil: 'networkidle' })
    await expect(root.getByRole('listitem')).toHaveCount(expected)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    if (fixture === 'overflow') {
      await root.getByRole('switch', { name: 'Event 80: Email' }).press('Space')
      await expect(root.getByRole('switch', { name: 'Event 80: Email' })).toHaveAttribute('aria-checked', 'true')
    }
  }
  await page.goto(url('localized', 'light'), { waitUntil: 'networkidle' })
  await expect(root.getByRole('heading', { name: 'Benachrichtigungseinstellungen' })).toBeVisible()
  await expect(root.getByRole('switch', { name: /Erwähnungen und Antworten in gemeinsam/ })).toHaveCount(3)
  await expect(root.getByRole('contentinfo')).toContainText('Zurücksetzen')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  expect(errors).toEqual([])
  console.log(
    JSON.stringify({
      preferences: 'passed',
      widths: [1086, 670, 356, 286],
      shortHeight: 320,
      capacity: 81,
      locale: 'de',
    }),
  )
} finally {
  await browser.close()
}
