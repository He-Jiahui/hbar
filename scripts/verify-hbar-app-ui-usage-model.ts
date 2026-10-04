import { expect, type Page } from '@playwright/test'
export async function verifyUsageModel(page: Page, baseUrl: string): Promise<void> {
  const url = (fixture = '') => `${baseUrl}/?variant=hbar-app-ui-ai-usage-2&mode=isolated&usageFixture=${fixture}`
  for (const width of [1192, 768, 670, 640, 639, 356, 286]) {
    await page.setViewportSize({ width, height: 560 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    await expect(page.locator('.lumen-usage-model-columns')).toBeVisible({ visible: width >= 640 })
    await expect(page.locator('.lumen-usage-model-summary').first()).toBeVisible({ visible: width < 640 })
    await expect(page.getByRole('heading', { name: 'Spend by model', exact: true })).toBeInViewport()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    if (width >= 640)
      expect(
        await page.locator('.lumen-usage-model-table-row').evaluateAll((rows) =>
          rows.every((row) => {
            const share = row.querySelector('.lumen-usage-model-share')!.getBoundingClientRect()
            const cost = row.querySelector('.lumen-usage-model-desktop-cost > span')!.getBoundingClientRect()
            return cost.left >= share.right + 7
          }),
        ),
      ).toBe(true)
  }
  await page.setViewportSize({ width: 1192, height: 560 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  const rows = page.locator('.lumen-usage-model-table-row')
  await page.getByRole('tab', { name: 'Requests', exact: true }).click()
  await expect(rows.first()).toHaveAttribute('data-model-id', 'ember-mini')
  await expect(rows.first()).toContainText('$42.60')
  expect(
    await rows
      .first()
      .locator('.lumen-usage-model-share > div')
      .evaluate((e) => e.getAttribute('style')),
  ).toContain('100%')
  await page.getByRole('tab', { name: 'Tokens', exact: true }).press('Enter')
  await expect(rows.first()).toHaveAttribute('data-model-id', 'atlas-long')
  await page.getByRole('tab', { name: 'Cost', exact: true }).press('Space')
  await expect(rows.first()).toHaveAttribute('data-model-id', 'atlas-pro')
  await page.setViewportSize({ width: 286, height: 320 })
  await page.goto(url('overflow'), { waitUntil: 'networkidle' })
  await expect(rows).toHaveCount(50)
  const initial = await rows.first().getAttribute('data-model-id')
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await expect(page.getByText('Page 2 of 4', { exact: true })).toBeInViewport()
  expect(await rows.first().getAttribute('data-model-id')).not.toBe(initial)
  await page.getByRole('button', { name: 'Previous page', exact: true }).click()
  await expect(rows.first()).toHaveAttribute('data-model-id', initial!)
  await page.goto(url('empty'), { waitUntil: 'networkidle' })
  await expect(page.getByText('No model usage in this billing period', { exact: true })).toBeVisible()
  for (const width of [1192, 286]) {
    await page.setViewportSize({ width, height: 560 })
    await page.goto(url('localized'), { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: 'Tokenanzahl', exact: true }).press('Enter')
    await expect(rows.first()).toHaveAttribute('data-model-id', 'atlas-long')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  }
  console.log(
    JSON.stringify({
      usageModel: 'passed',
      widths: [1192, 768, 670, 640, 639, 356, 286],
      pagedRecords: 200,
      pageSize: 50,
      locales: ['en', 'de'],
    }),
  )
}
