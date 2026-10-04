import { expect, type Page } from '@playwright/test'

export async function verifyPlanActual(page: Page, baseUrl: string): Promise<void> {
  const url = (fixture?: string) =>
    `${baseUrl}/?variant=hbar-app-ui-agent-plan-4&mode=isolated${fixture ? `&agentPlanFixture=${fixture}` : ''}`
  for (const width of [1192, 768, 320, 286]) {
    await page.setViewportSize({ width, height: 480 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const padding = width >= 640 ? 24 : 16
    const card = await page.locator('.lumen-plan-actual-card').boundingBox()
    expect(card?.x).toBeCloseTo(padding, 0)
    expect(card?.y).toBeCloseTo(padding + 128, 0)
    const metricTops = await page
      .locator('[data-metric-id]')
      .evaluateAll((elements) => elements.map((e) => e.getBoundingClientRect().top))
    expect(new Set(metricTops).size).toBe(1)
    expect(await page.getByRole('columnheader').count()).toBe(width >= 640 ? 5 : 4)
    const columns = await page.locator('.lumen-plan-actual-table').evaluate((table) => {
      const first = table.querySelector('thead th')
      const style = first ? getComputedStyle(first) : null
      const width = first?.getBoundingClientRect().width ?? 0
      return {
        firstFraction: width / table.getBoundingClientRect().width,
        tableWidth: table.getBoundingClientRect().width,
        firstTextWidth: width - parseFloat(style?.paddingLeft ?? '0') - parseFloat(style?.paddingRight ?? '0'),
        headerHeight: table.querySelector('thead')?.getBoundingClientRect().height ?? 0,
        rowHeights: [...table.querySelectorAll('tbody tr')].map((row) => row.getBoundingClientRect().height),
      }
    })
    // No overflow alone is insufficient: fixed numeric columns can squeeze the step column to zero.
    const expectedFraction = width >= 640 ? 0.38 : Math.min(0.38, (columns.tableWidth - 3 * 56) / columns.tableWidth)
    expect(columns.firstFraction).toBeCloseTo(expectedFraction, 2)
    expect(columns.firstTextWidth).toBeGreaterThan(49)
    expect(columns.headerHeight).toBeCloseTo(36, 0)
    for (const height of columns.rowHeights) expect(height).toBeCloseTo(44, 0)
    await expect(page.getByRole('progressbar')).toHaveCount(0)
    await expect(page.locator('[data-hbar-app-ui-component] button')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    expect(await page.locator('.lumen-plan-actual-scroll').evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(
      true,
    )
  }
  await page.setViewportSize({ width: 1192, height: 480 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  const row = page.locator('tbody tr').first()
  const beforeText = await row.innerText()
  const before = await row.evaluate((e) => getComputedStyle(e).backgroundColor)
  await row.hover()
  expect(await row.evaluate((e) => getComputedStyle(e).backgroundColor)).not.toBe(before)
  expect(await row.innerText()).toBe(beforeText)
  const geometry = await page
    .locator('[data-row-id="contract-notes"] .lumen-plan-actual-duration-bar')
    .evaluate((e) => {
      const width = e.getBoundingClientRect().width
      const fill = e.querySelector('rect')?.getBoundingClientRect().width ?? 0
      const marker = e.querySelector('line')?.getBoundingClientRect().left ?? 0
      return { actual: fill / width, planned: (marker - e.getBoundingClientRect().left) / width }
    })
  expect(geometry.actual).toBeCloseTo(3 / 11, 3)
  expect(geometry.planned).toBeCloseTo(2 / 11, 3)

  await page.setViewportSize({ width: 286, height: 320 })
  await page.goto(url('overflow'), { waitUntil: 'networkidle' })
  const header = await page.locator('.lumen-plan-actual-heading').boundingBox()
  const metrics = await page.locator('.lumen-plan-actual-metrics').boundingBox()
  const scrolling = await page.locator('.lumen-plan-actual-scroll').evaluate((e) => {
    e.scrollTop = e.scrollHeight
    return e.scrollTop > 0
  })
  expect(scrolling).toBe(true)
  await expect(page.getByRole('rowheader', { name: 'Additional plan step 18', exact: true })).toBeInViewport()
  expect(await page.locator('.lumen-plan-actual-heading').boundingBox()).toEqual(header)
  expect(await page.locator('.lumen-plan-actual-metrics').boundingBox()).toEqual(metrics)

  await page.goto(url('localized'), { waitUntil: 'networkidle' })
  await expect(page.getByText('Tatsächliche Gesamtdauer', { exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Tatsächlich', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  expect(await page.locator('.lumen-plan-actual-scroll').evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true)
  console.log(
    JSON.stringify({
      planActual: 'passed',
      widths: [1192, 768, 320, 286],
      independentRatios: geometry,
      passiveHover: true,
      overflowRows: 23,
      localizedShortPane: true,
    }),
  )
}
