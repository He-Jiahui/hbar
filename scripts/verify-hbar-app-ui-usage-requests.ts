import { expect, type Page } from '@playwright/test'

export async function verifyUsageRequests(page: Page, baseUrl: string): Promise<void> {
  const url = (fixture = '') => `${baseUrl}/?variant=hbar-app-ui-ai-usage-7&mode=isolated&usageFixture=${fixture}`
  for (const width of [1192, 670, 640, 639, 356, 286]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Request log', exact: true })).toBeInViewport()
    await expect(page.locator('.lumen-usage-request-trigger')).toHaveCount(8)
    await expect(page.locator('[aria-expanded="true"]')).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    if (width >= 640) await expect(page.locator('.lumen-usage-request-columns')).toBeVisible()
    else await expect(page.locator('.lumen-usage-request-columns')).toBeHidden()
  }
  await page.setViewportSize({ width: 1086, height: 640 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  expect(
    await page
      .locator('.lumen-usage-request-trigger')
      .first()
      .evaluate((e) => {
        const r = e.getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height }
      }),
  ).toEqual({ x: 139, y: 161.25, width: 808, height: 39.5 })
  await page.setViewportSize({ width: 670, height: 640 })
  expect(
    await page
      .locator('.lumen-usage-request-trigger')
      .first()
      .evaluate((e) => {
        const r = e.getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height }
      }),
  ).toEqual({ x: 38, y: 161.25, width: 594, height: 39.5 })
  await page.setViewportSize({ width: 1086, height: 640 })
  await page.getByRole('tab', { name: 'Capped', exact: true }).click()
  await expect(page.getByText('Last 1 calls · $0.5884 billed', { exact: true })).toBeVisible()
  await expect(page.getByText('Truncated at max tokens', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'Errors', exact: true }).click()
  await expect(page.locator('[aria-expanded="true"]')).toHaveCount(0)
  await page.getByRole('button', { name: /14:30:31/ }).press('Space')
  await expect(page.getByText('Upstream timeout', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'All', exact: true }).press('Enter')
  await expect(page.locator('.lumen-usage-request-trigger')).toHaveCount(8)
  await expect(page.getByText('Upstream timeout', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /14:32:08/ }).click()
  await expect(page.locator('[aria-expanded="true"]')).toHaveCount(1)
  await expect(page.getByText('Completed', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 286, height: 320 })
  await page.getByRole('button', { name: /14:32:08/ }).press('Enter')
  await expect(page.locator('[aria-expanded="true"]')).toHaveCount(0)
  await page.getByRole('button', { name: /14:29:47/ }).focus()
  await expect(page.getByRole('button', { name: /14:29:47/ })).toBeInViewport()
  for (const fixture of ['empty', 'overflow', 'localized']) {
    await page.goto(url(fixture), { waitUntil: 'networkidle' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    if (fixture === 'empty')
      await expect(page.getByText('No requests match this filter.', { exact: true })).toBeVisible()
    if (fixture === 'overflow') {
      await expect(page.locator('.lumen-usage-request-trigger')).toHaveCount(50)
      await page.getByRole('button', { name: 'Next', exact: true }).click()
      await expect(page.getByText('Page 2 of 4', { exact: true })).toBeVisible()
      await expect(page.locator('[data-request-id="request-50"]')).toBeAttached()
      await page.getByRole('button', { name: 'Next', exact: true }).click()
      await page.getByRole('button', { name: 'Next', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
      await page.getByRole('tab', { name: 'Errors', exact: true }).click()
      await expect(page.locator('.lumen-usage-request-trigger')).toHaveCount(25)
    }
    if (fixture === 'localized') {
      await page.getByRole('button', { name: /14:32:08/ }).press('Enter')
      await expect(page.getByText('Abgeschlossen', { exact: true })).toBeAttached()
    }
  }
  console.log(
    JSON.stringify({
      usageRequests: 'passed',
      widths: [1192, 670, 640, 639, 356, 286],
      shortHeight: 320,
      pageSize: 50,
      inventory: 200,
      locales: ['en', 'de'],
    }),
  )
}
