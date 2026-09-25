import { expect, type Page } from '@playwright/test'

export async function verifyUsageBudget(page: Page, baseUrl: string): Promise<void> {
  const url = (fixture = '') => `${baseUrl}/?variant=hbar-app-ui-ai-usage-5&mode=isolated&usageFixture=${fixture}`
  for (const width of [1192, 670, 640, 639, 356, 286]) {
    await page.setViewportSize({ width, height: 760 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Budget and alerts', exact: true })).toBeInViewport()
    await expect(page.getByRole('switch')).toHaveCount(2)
    await expect(page.getByRole('slider', { name: 'Monthly cap', exact: true })).toHaveValue('2500')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  }
  await page.setViewportSize({ width: 1192, height: 760 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  await page.setViewportSize({ width: 356, height: 560 })
  expect(
    await page
      .locator('.lumen-usage-budget-panel')
      .evaluate((e) => ({ y: e.getBoundingClientRect().y, height: e.getBoundingClientRect().height })),
  ).toEqual({ y: 13.75, height: 532.5 })
  await page.setViewportSize({ width: 1192, height: 760 })
  const slider = page.getByRole('slider', { name: 'Monthly cap', exact: true }),
    progress = page.getByRole('progressbar', { name: 'Budget consumed', exact: true })
  await slider.press('End')
  await expect(slider).toHaveValue('10000')
  await expect(progress).toHaveAttribute('aria-valuenow', '18')
  await expect(page.getByText('Projected $2,613 at current pace, within budget.', { exact: true })).toBeVisible()
  await slider.press('Home')
  await expect(slider).toHaveValue('500')
  await expect(progress).toHaveAttribute('aria-valuenow', '100')
  await slider.fill('2500')
  await slider.press('ArrowRight')
  await expect(slider).toHaveValue('2750')
  await expect(progress).toHaveAttribute('aria-valuenow', '67')
  await page.getByRole('button', { name: '50% of cap', exact: true }).click()
  await expect(page.getByRole('button', { name: '75% of cap', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '75% of cap', exact: true }).press('Space')
  await expect(page.getByRole('button', { name: '50% of cap', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: '75% of cap', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('switch', { name: 'Pause requests at 100%', exact: true }).click()
  await expect(page.getByRole('switch', { name: 'Weekly spend digest', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await page.setViewportSize({ width: 286, height: 320 })
  await page.getByRole('switch', { name: 'Weekly spend digest', exact: true }).press('Enter')
  await expect(page.getByRole('switch', { name: 'Weekly spend digest', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.getByRole('switch', { name: 'Weekly spend digest', exact: true })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Save budget', exact: true })).toHaveCount(0)
  for (const fixture of ['empty', 'overflow', 'localized']) {
    await page.goto(url(fixture), { waitUntil: 'networkidle' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    if (fixture === 'empty') {
      await expect(page.getByText('No alert thresholds', { exact: true })).toBeVisible()
      await expect(page.getByRole('switch')).toHaveCount(0)
    } else {
      await page.getByRole('switch').last().focus()
      await expect(page.getByRole('switch').last()).toBeInViewport()
    }
    if (fixture === 'overflow') {
      await expect(page.getByRole('switch')).toHaveCount(9)
      await expect(page.locator('[aria-pressed]')).toHaveCount(7)
    }
  }
  await page.setViewportSize({ width: 1192, height: 760 })
  await page.goto(url('localized'), { waitUntil: 'networkidle' })
  await expect(page.getByRole('slider', { name: 'Monatliche Budgetobergrenze', exact: true })).toBeVisible()
  console.log(
    JSON.stringify({
      usageBudget: 'passed',
      widths: [1192, 670, 640, 639, 356, 286],
      shortHeight: 320,
      overBound: { thresholds: 7, settings: 9 },
      locales: ['en', 'de'],
    }),
  )
}
