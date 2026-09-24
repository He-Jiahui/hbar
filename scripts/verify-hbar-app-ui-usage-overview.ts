import { expect, type Page } from '@playwright/test'

export async function verifyUsageOverview(page: Page, baseUrl: string): Promise<void> {
  const url = (fixture = '') => `${baseUrl}/?variant=hbar-app-ui-ai-usage-1&mode=isolated&usageFixture=${fixture}`
  for (const width of [1192, 640, 639, 356, 286]) {
    await page.setViewportSize({ width, height: 480 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const positions = await page
      .locator('.lumen-usage-overview-metrics > div')
      .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().y))
    expect(new Set(positions).size).toBe(width >= 640 ? 1 : 2)
    expect(
      await page
        .locator('.lumen-usage-overview-bar > span')
        .evaluateAll((es) => es.every((e) => e.scrollWidth <= e.clientWidth + 1)),
    ).toBe(true)
    await expect(page.getByRole('heading', { name: 'Token usage', exact: true })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  }
  await page.setViewportSize({ width: 1192, height: 640 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  const detail = page.locator('.lumen-usage-overview-detail')
  await page.getByRole('button', { name: 'Mon: 5.7M tokens', exact: true }).hover()
  await expect(detail).toHaveText('Mon · 5.7M · $36.30')
  await page.getByRole('heading').hover()
  await expect(detail).toHaveText('Hover a bar for detail')
  await page.getByRole('button', { name: 'Sun: 2.6M tokens', exact: true }).focus()
  await expect(detail).toHaveText('Sun · 2.6M · $16.20')
  await page.getByRole('tab', { name: '30d', exact: true }).press('Enter')
  await expect(page.locator('.lumen-usage-overview-bar')).toHaveCount(4)
  await expect(page.locator('.lumen-usage-overview-metrics')).toContainText('$1,033')
  await expect(detail).toHaveText('Hover a bar for detail')
  await page.getByRole('button', { name: 'W1: 31M tokens', exact: true }).hover()
  await expect(detail).toHaveText('W1 · 31M · $199')
  await page.getByRole('tab', { name: '90d', exact: true }).press('Space')
  await expect(page.locator('.lumen-usage-overview-bar')).toHaveCount(3)
  await expect(page.locator('.lumen-usage-overview-metrics')).toContainText('$2,305')
  await page.setViewportSize({ width: 286, height: 320 })
  await page.goto(url('overflow'), { waitUntil: 'networkidle' })
  await expect(page.locator('.lumen-usage-overview-bar')).toHaveCount(32)
  await page.getByRole('button', { name: 'Day 32: 5.7M tokens', exact: true }).focus()
  await expect(page.getByRole('button', { name: 'Day 32: 5.7M tokens', exact: true })).toBeInViewport()
  expect(await page.locator('.lumen-usage-overview-plot').evaluate((e) => e.scrollLeft > 0)).toBe(true)
  await expect(detail).toHaveText('Day 32 · 5.7M · $36.30')
  await page.goto(url('empty'), { waitUntil: 'networkidle' })
  await expect(page.getByText('No token usage in this range', { exact: true })).toBeVisible()
  for (const width of [1192, 286]) {
    await page.setViewportSize({ width, height: 480 })
    await page.goto(url('localized'), { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Token-Nutzung', exact: true })).toBeInViewport()
    await page.getByRole('tab', { name: '90d Abrechnungszeitraum', exact: true }).press('Enter')
    await expect(page.locator('.lumen-usage-overview-bar')).toHaveCount(3)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  }
  console.log(
    JSON.stringify({
      usageOverview: 'passed',
      widths: [1192, 640, 639, 356, 286],
      shortHost: 320,
      overflowPoints: 32,
      locales: ['en', 'de'],
    }),
  )
}
