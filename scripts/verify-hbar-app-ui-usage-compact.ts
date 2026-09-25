import { expect, type Page } from '@playwright/test'

export async function verifyUsageCompact(page: Page, baseUrl: string): Promise<void> {
  const url = (fixture = '') =>
    `${baseUrl}/?variant=hbar-app-ui-ai-usage-8&mode=isolated&theme=light&usageFixture=${fixture}`
  for (const width of [1192, 670, 640, 639, 356, 286]) {
    await page.setViewportSize({ width, height: 760 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Plan usage', exact: true })).toBeInViewport()
    await expect(page.getByRole('button')).toHaveCount(2)
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '92')
    await expect(page.locator('.lumen-usage-widget-meter')).toHaveCount(3)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  }
  for (const [width, x] of [
    [1086, 333],
    [670, 125],
    [356, 24],
  ]) {
    await page.setViewportSize({ width: width!, height: 480 })
    expect(
      await page.locator('.lumen-usage-compact-widget').evaluate((e) => {
        const r = e.getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height }
      }),
    ).toEqual({ x, y: 23.25, width: width === 356 ? 308 : 420, height: 433.5 })
    expect(await page.locator('.lumen-usage-widget-value').evaluate((e) => e.getBoundingClientRect().height)).toBe(32)
  }
  const before = await page.locator('.lumen-usage-compact-widget').innerText()
  const details = page.getByRole('button', { name: 'Details', exact: true })
  const idleColor = await details.evaluate((e) => getComputedStyle(e).color)
  await details.hover()
  await expect.poll(() => details.evaluate((e) => getComputedStyle(e).color)).not.toBe(idleColor)
  await page.getByRole('button', { name: 'Details', exact: true }).click()
  await page.getByRole('button', { name: 'Upgrade', exact: true }).press('Space')
  expect(await page.locator('.lumen-usage-compact-widget').innerText()).toBe(before)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.setViewportSize({ width: 286, height: 320 })
  await page.getByRole('button', { name: 'Details', exact: true }).press('Enter')
  await expect(page.getByRole('button', { name: 'Details', exact: true })).toBeInViewport()
  await page.getByRole('button', { name: 'Upgrade', exact: true }).focus()
  await expect(page.getByRole('button', { name: 'Upgrade', exact: true })).toBeInViewport()
  for (const fixture of ['localized', 'empty', 'overflow', 'disabled']) {
    await page.goto(url(fixture), { waitUntil: 'networkidle' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    if (fixture === 'empty') {
      await expect(page.getByText('No additional usage meters', { exact: true })).toBeVisible()
      await expect(page.locator('.lumen-usage-widget-sparkline')).toHaveAttribute('title', 'No usage trend available')
    }
    if (fixture === 'overflow') {
      await expect(page.locator('.lumen-usage-widget-meter')).toHaveCount(7)
      await expect(page.locator('.lumen-usage-widget-sparkline > span')).toHaveCount(32)
      expect(
        await page.locator('.lumen-usage-widget-sparkline').evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
      ).toBe(true)
    }
    if (fixture === 'disabled') {
      await expect(page.getByRole('button', { name: 'Details', exact: true })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Upgrade', exact: true })).toBeDisabled()
    } else {
      await page.getByRole('button').last().press('Enter')
      await expect(page.getByRole('button').last()).toBeInViewport()
    }
    if (fixture === 'localized')
      await expect(page.getByRole('button', { name: 'Erweitern', exact: true })).toBeVisible()
  }
  console.log(
    JSON.stringify({
      usageCompact: 'passed',
      widths: [1192, 670, 640, 639, 356, 286],
      shortHeight: 320,
      capacity: { meters: 7, trend: 32 },
      locales: ['en', 'de'],
    }),
  )
}
