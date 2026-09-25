import { expect, type Page } from '@playwright/test'

export async function verifyUsageOverage(page: Page, baseUrl: string): Promise<void> {
  const url = (fixture = '') => `${baseUrl}/?variant=hbar-app-ui-ai-usage-6&mode=isolated&usageFixture=${fixture}`
  for (const width of [1192, 670, 640, 639, 356, 286]) {
    await page.setViewportSize({ width, height: 760 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'You are over your included tokens', exact: true })).toBeInViewport()
    await expect(page.getByRole('radio')).toHaveCount(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    const boxes = await page
      .getByRole('radio')
      .evaluateAll((elements) =>
        elements.map((e) => ({ x: e.getBoundingClientRect().x, y: e.getBoundingClientRect().y })),
      )
    if (width >= 640) expect(boxes[0]!.y).toBe(boxes[1]!.y)
    else expect(boxes[0]!.x).toBe(boxes[1]!.x)
  }
  await page.setViewportSize({ width: 1192, height: 760 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  for (const [width, y, cardWidth, height] of [
    [1086, 266, 294, 141],
    [670, 257, 277, 159],
  ]) {
    await page.setViewportSize({ width: width!, height: 560 })
    const geometry = await page.getByRole('radio').evaluateAll((elements) =>
      elements.map((e) => {
        const r = e.getBoundingClientRect()
        return { y: r.y, width: r.width, height: r.height }
      }),
    )
    expect(geometry).toEqual([
      { y, width: cardWidth, height },
      { y, width: cardWidth, height },
    ])
    const titleOffsets = await page
      .getByRole('radio')
      .evaluateAll((elements) =>
        elements.map((e) => (e.firstElementChild?.getBoundingClientRect().y ?? 0) - e.getBoundingClientRect().y),
      )
    expect(titleOffsets).toEqual(width === 670 ? [22, 13] : [13, 13])
  }
  await page.setViewportSize({ width: 1192, height: 760 })
  const scale = page.getByRole('radio', { name: /Scale/ }),
    enterprise = page.getByRole('radio', { name: /Enterprise/ })
  await enterprise.click()
  await expect(enterprise).toHaveAttribute('aria-checked', 'true')
  await expect(scale).toHaveAttribute('aria-checked', 'false')
  await scale.press('Space')
  await expect(scale).toHaveAttribute('aria-checked', 'true')
  await enterprise.press('Enter')
  await expect(enterprise).toHaveAttribute('aria-checked', 'true')
  const text = await page.locator('.lumen-usage-overage-panel').innerText()
  await page.getByRole('button', { name: 'Upgrade', exact: true }).click()
  await page.getByRole('button', { name: 'Stay on overage', exact: true }).click()
  expect(await page.locator('.lumen-usage-overage-panel').innerText()).toBe(text)
  await page.setViewportSize({ width: 286, height: 320 })
  await scale.press('Space')
  await expect(scale).toBeInViewport()
  await page.getByRole('button', { name: 'Upgrade', exact: true }).focus()
  await expect(page.getByRole('button', { name: 'Upgrade', exact: true })).toBeInViewport()
  for (const fixture of ['empty', 'overflow', 'localized']) {
    await page.goto(url(fixture), { waitUntil: 'networkidle' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    if (fixture === 'empty') {
      await expect(page.getByText('No available plans', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Upgrade', exact: true })).toBeDisabled()
    } else {
      await page.getByRole('radio').last().press('Enter')
      await expect(page.getByRole('radio').last()).toHaveAttribute('aria-checked', 'true')
      await expect(page.getByRole('radio').last()).toBeInViewport({ ratio: 0.3 })
    }
    if (fixture === 'overflow') {
      await expect(page.getByRole('radio')).toHaveCount(7)
      await expect(page.locator('.lumen-usage-overage-plan li')).toHaveCount(49)
    }
  }
  console.log(
    JSON.stringify({
      usageOverage: 'passed',
      widths: [1192, 670, 640, 639, 356, 286],
      shortHeight: 320,
      capacity: { plans: 7, benefits: 7 },
      locales: ['en', 'de'],
    }),
  )
}
