import { expect, type Page } from '@playwright/test'

export async function verifyUsageMembers(page: Page, baseUrl: string): Promise<void> {
  const url = (fixture = '') => `${baseUrl}/?variant=hbar-app-ui-ai-usage-4&mode=isolated&usageFixture=${fixture}`
  for (const width of [1192, 670, 640, 639, 356, 286]) {
    await page.setViewportSize({ width, height: 760 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Usage by member', exact: true })).toBeInViewport()
    await expect(page.locator('[data-member-id]')).toHaveCount(7)
    expect(await page.locator('.lumen-usage-member-capacity').first().isVisible()).toBe(width >= 640)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    expect(
      await page.locator('.lumen-usage-member-row').evaluateAll((rows) =>
        rows.every((row) => {
          const name = row.children[1]!.getBoundingClientRect(),
            cost = row.lastElementChild!.getBoundingClientRect()
          return name.right + 10 <= cost.left && name.width >= 0
        }),
      ),
    ).toBe(true)
  }
  await page.setViewportSize({ width: 1192, height: 760 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  const search = page.getByRole('searchbox', { name: 'Search members', exact: true })
  expect(await search.evaluate((e) => e.getBoundingClientRect().height)).toBe(32)
  expect(
    await page.locator('.lumen-usage-member-search-content').evaluate((e) => e.getBoundingClientRect().width),
  ).toBe(224)
  await page.getByRole('tab', { name: 'Platform', exact: true }).click()
  await expect(page.getByText('$614 across 3 seats this month.', { exact: true })).toBeVisible()
  await search.fill('Sofia')
  await expect(page.locator('[data-member-id]')).toHaveCount(1)
  await expect(page.getByText('$203 across 1 seat this month.', { exact: true })).toBeVisible()
  await search.fill('audit sample')
  await expect(page.getByText('No members match', { exact: true })).toBeVisible()
  await expect(page.getByText('Try a different name or clear the team filter.', { exact: true })).toBeVisible()
  await search.fill('')
  await expect(page.locator('[data-member-id]')).toHaveCount(3)
  await page.setViewportSize({ width: 286, height: 320 })
  await page.getByRole('tab', { name: 'All teams', exact: true }).press('Enter')
  await expect(page.locator('[data-member-id]')).toHaveCount(7)
  await expect(page.getByText('$1,217 across 7 seats this month.', { exact: true })).toBeInViewport()
  await page.getByRole('tab', { name: 'Research', exact: true }).focus()
  await expect(page.getByRole('tab', { name: 'Research', exact: true })).toBeInViewport()
  await page.goto(url('overflow'), { waitUntil: 'networkidle' })
  await expect(page.locator('[data-member-id]')).toHaveCount(50)
  await page.getByRole('button', { name: 'Next members', exact: true }).click()
  await expect(page.getByText('Page 2 of 4', { exact: true })).toBeVisible()
  await search.fill('Sofia')
  await expect(page.locator('[data-member-id]')).toHaveCount(29)
  await expect(page.getByRole('button', { name: 'Next members', exact: true })).toHaveCount(0)
  await page.goto(url('empty'), { waitUntil: 'networkidle' })
  await expect(page.getByText('No members match', { exact: true })).toBeVisible()
  for (const width of [1192, 286]) {
    await page.setViewportSize({ width, height: 760 })
    await page.goto(url('localized'), { waitUntil: 'networkidle' })
    await expect(page.getByRole('searchbox', { name: 'Mitglieder suchen', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.getByRole('tab', { name: 'Arbeitsgruppe Research', exact: true }).press('Enter')
    await expect(page.locator('[data-member-id]')).toHaveCount(2)
  }
  console.log(
    JSON.stringify({
      usageMembers: 'passed',
      widths: [1192, 670, 640, 639, 356, 286],
      shortHeight: 320,
      totalRows: 200,
      pageSize: 50,
      locales: ['en', 'de'],
    }),
  )
}
