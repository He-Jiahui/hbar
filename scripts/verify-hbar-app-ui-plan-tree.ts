import { expect, type Page } from '@playwright/test'

export async function verifyPlanTree(page: Page, baseUrl: string): Promise<void> {
  const url = (fixture?: string) =>
    `${baseUrl}/?variant=hbar-app-ui-agent-plan-3&mode=isolated${fixture ? `&agentPlanFixture=${fixture}` : ''}`
  for (const width of [1192, 320]) {
    await page.setViewportSize({ width, height: 640 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const card = await page.locator('.lumen-plan-tree-card').boundingBox()
    const padding = width === 1192 ? 24 : 16
    expect(card).not.toBeNull()
    expect(card?.x).toBeCloseTo(padding, 0)
    expect(card?.y).toBeCloseTo(padding + 36, 0)
    expect(card?.height).toBeCloseTo(640 - padding * 2 - 36, 0)
  }
  const prepare = page.getByRole('button', { name: 'Prepare the data 3 of 3', exact: true })
  await prepare.press('Enter')
  await expect(prepare).toHaveAttribute('aria-expanded', 'false')
  await expect(prepare).toBeFocused()
  await expect(page.getByText('Load the source files', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Write the migration file', { exact: true })).toBeVisible()
  await prepare.press('Space')
  await expect(page.getByText('Load the source files', { exact: true })).toBeVisible()
  const ship = page.getByRole('button', { name: 'Ship the change 0 of 3', exact: true })
  await ship.press('Enter')
  await expect(ship).toHaveAttribute('aria-expanded', 'true')
  await expect(ship).toBeFocused()
  await expect(page.getByText('Publish the registry payloads', { exact: true })).toHaveCount(1)
  const retry = page.getByRole('button', { name: 'Retry', exact: true })
  await retry.press('Space')
  await expect(retry).toHaveCount(0)
  await expect(page.locator('[data-step-id="verify-counts"]')).toHaveAttribute('data-state', 'running')
  await expect(page.getByText('5 of 13 done', { exact: true })).toBeVisible()
  await expect(page.locator('[data-step-id="drop-legacy"]')).toHaveAttribute('data-state', 'queued')

  await page.setViewportSize({ width: 286, height: 420 })
  await page.goto(url('overflow'), { waitUntil: 'networkidle' })
  const headerBefore = await page.locator('.lumen-plan-tree-heading').boundingBox()
  const scroll = page.locator('.lumen-plan-tree-list')
  const overflow = await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    return { moved: element.scrollTop > 0, scrollable: element.scrollHeight > element.clientHeight }
  })
  expect(overflow).toEqual({ moved: true, scrollable: true })
  await expect(page.getByText('Additional plan step 18', { exact: true })).toBeInViewport()
  expect(await page.locator('.lumen-plan-tree-heading').boundingBox()).toEqual(headerBefore)
  await expect(page.locator('.lumen-plan-tree-edge-overlay.is-top')).toHaveAttribute('data-visible', 'true')

  await page.goto(url('localized'), { waitUntil: 'networkidle' })
  const germanRetry = page.getByRole('button', { name: 'Erneut versuchen', exact: true })
  await germanRetry.scrollIntoViewIfNeeded()
  const retryBox = await germanRetry.boundingBox()
  expect(retryBox?.x).toBeGreaterThanOrEqual(0)
  expect((retryBox?.x ?? 0) + (retryBox?.width ?? 0)).toBeLessThanOrEqual(286)
  await germanRetry.press('Enter')
  await expect(page.getByText('Wird ausgeführt', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  console.log(
    JSON.stringify({
      planTree: 'passed',
      desktopAndNarrow: true,
      independentDisclosure: true,
      retryState: true,
      overflow,
      localizedShortPane: true,
    }),
  )
}
