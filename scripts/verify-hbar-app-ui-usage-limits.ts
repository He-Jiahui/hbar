import { expect, type Page } from '@playwright/test'

export async function verifyUsageLimits(page: Page, baseUrl: string): Promise<void> {
  const url = (fixture = '') => `${baseUrl}/?variant=hbar-app-ui-ai-usage-3&mode=isolated&usageFixture=${fixture}`
  for (const width of [1192, 670, 640, 639, 356, 286]) {
    await page.setViewportSize({ width, height: 600 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Rate limits', exact: true })).toBeInViewport()
    await expect(page.getByRole('progressbar')).toHaveCount(4)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    expect(
      await page.locator('.lumen-usage-rate-value-row').evaluateAll((rows) =>
        rows.every((row) => {
          const name = row.firstElementChild!.getBoundingClientRect(),
            value = row.lastElementChild!.getBoundingClientRect()
          return name.right + 10 <= value.left
        }),
      ),
    ).toBe(true)
  }
  await page.setViewportSize({ width: 1192, height: 600 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  const progress = page.getByRole('progressbar')
  const footer = page.locator('.lumen-usage-rate-footer')
  expect(
    await footer.evaluate((e) => {
      const description = e.firstElementChild!.getBoundingClientRect(),
        action = e.lastElementChild!.getBoundingClientRect()
      return description.right < action.left && description.top >= action.top && description.bottom <= action.bottom
    }),
  ).toBe(true)
  expect(await footer.locator('button').evaluate((e) => getComputedStyle(e).fontSize)).toBe('13px')
  expect(await footer.locator('button').evaluate((e) => e.getBoundingClientRect().height)).toBe(32)
  expect(
    await page.getByRole('tab', { name: 'Tier 1', exact: true }).evaluate((e) => e.getBoundingClientRect().height),
  ).toBe(28)
  await page.getByRole('tab', { name: 'Tier 2', exact: true }).click()
  await expect(page.getByText('All limits within range', { exact: true })).toBeVisible()
  await expect(progress.nth(0)).toHaveAttribute('aria-valuenow', '21')
  await expect(page.locator('.lumen-usage-rate-value').nth(1)).toHaveText('148,000 / 1,600,000 tok')
  await page.getByRole('tab', { name: 'Tier 3', exact: true }).press('Enter')
  await expect(page.getByText('Highest tier. Contact us for a bespoke ceiling.', { exact: true })).toBeVisible()
  await expect(progress.nth(2)).toHaveAttribute('aria-valuenow', '5')
  const before = await page.locator('.lumen-usage-rate-panel').innerText()
  await page.getByRole('button', { name: 'Request an increase', exact: true }).click()
  expect(await page.locator('.lumen-usage-rate-panel').innerText()).toBe(before)
  await page.setViewportSize({ width: 286, height: 320 })
  await page.getByRole('tab', { name: 'Tier 1', exact: true }).press('Space')
  await expect(page.getByText('1 limit near capacity', { exact: true })).toBeInViewport()
  await page.getByRole('button', { name: 'Request an increase', exact: true }).focus()
  await expect(page.getByRole('button', { name: 'Request an increase', exact: true })).toBeInViewport()
  await page.goto(url('overflow'), { waitUntil: 'networkidle' })
  await expect(progress).toHaveCount(13)
  await page.getByRole('button', { name: 'Request an increase', exact: true }).focus()
  await expect(page.getByRole('button', { name: 'Request an increase', exact: true })).toBeInViewport()
  expect(await page.locator('.lumen-usage-rate-stage').evaluate((e) => e.scrollTop > 0)).toBe(true)
  await page.goto(url('empty'), { waitUntil: 'networkidle' })
  await expect(page.getByText('No limits configured', { exact: true })).toBeVisible()
  for (const width of [1192, 286]) {
    await page.setViewportSize({ width, height: 600 })
    await page.goto(url('localized'), { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: 'Stufe 3', exact: true }).press('Enter')
    await expect(
      page.getByText('Höchste Stufe. Kontaktieren Sie uns für individuelle Grenzen.', { exact: true }),
    ).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  }
  console.log(
    JSON.stringify({
      usageLimits: 'passed',
      widths: [1192, 670, 640, 639, 356, 286],
      shortHeight: 320,
      contentRows: 13,
      locales: ['en', 'de'],
    }),
  )
}
