import { expect, type Page } from '@playwright/test'

export async function verifyPlanBoard(page: Page, baseUrl: string): Promise<void> {
  const url = (fixture?: string) =>
    `${baseUrl}/?variant=hbar-app-ui-agent-plan-5&mode=isolated${fixture ? `&agentPlanFixture=${fixture}` : ''}`
  for (const width of [1192, 1024, 1023, 768, 320, 286]) {
    await page.setViewportSize({ width, height: 560 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const boxes = await page.locator('.lumen-plan-board-column').evaluateAll((elements) =>
      elements.map((e) => {
        const r = e.getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height }
      }),
    )
    expect(boxes).toHaveLength(3)
    expect(new Set(boxes.map((box) => box.y)).size).toBe(width >= 1024 ? 1 : 3)
    expect(boxes[0]?.y).toBeCloseTo(width >= 640 ? 60 : 52, 0)
    expect(boxes[0]?.height).toBeCloseTo(width >= 1024 ? 476 : 480.5, 0)
    await expect(page.locator('[data-step-id]')).toHaveCount(21)
    await expect(
      page.locator('[data-hbar-app-ui-component] button,[data-hbar-app-ui-component] [draggable]'),
    ).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  }
  await page.setViewportSize({ width: 1192, height: 320 })
  await page.goto(url('overflow'), { waitUntil: 'networkidle' })
  const lists = page.locator('.lumen-plan-board-list-frame ol')
  const header = await page.locator('.lumen-plan-board-heading').boundingBox()
  const heading = await page.locator('.lumen-plan-board-column h3').first().boundingBox()
  await lists.first().hover()
  await page.mouse.wheel(0, 2500)
  await expect.poll(() => lists.first().evaluate((e) => e.scrollTop)).toBeGreaterThan(0)
  await expect(lists.first().getByText('Additional plan step 18', { exact: true })).toBeInViewport()
  expect(await lists.nth(1).evaluate((e) => e.scrollTop)).toBe(0)
  expect(await lists.nth(2).evaluate((e) => e.scrollTop)).toBe(0)
  expect(await page.locator('.lumen-plan-board-heading').boundingBox()).toEqual(header)
  expect(await page.locator('.lumen-plan-board-column h3').first().boundingBox()).toEqual(heading)

  await page.setViewportSize({ width: 286, height: 320 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  const narrowHeader = await page.locator('.lumen-plan-board-heading').boundingBox()
  const board = page.locator('.lumen-plan-board-columns')
  await board.hover()
  await page.mouse.wheel(0, 2500)
  await expect(page.getByText('Summarize the handoff', { exact: true })).toBeInViewport()
  expect(await page.locator('.lumen-plan-board-heading').boundingBox()).toEqual(narrowHeader)
  expect(
    await page
      .locator('.lumen-plan-board-list-frame ol')
      .evaluateAll((elements) => elements.every((e) => e.scrollTop === 0)),
  ).toBe(true)
  await page.goto(url('localized'), { waitUntil: 'networkidle' })
  await expect(page.getByText('9 von 21 abgeschlossen', { exact: true })).toBeVisible()
  await expect(
    page.getByText('Die Abrechnungsvereinbarung vollständig und nachvollziehbar untersuchen', { exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await page.locator('.lumen-plan-board-columns').hover()
  await page.mouse.wheel(0, 500)
  await expect(page.getByText('Wird ausgeführt', { exact: true })).toBeInViewport()
  const card = page.locator('[data-step-id="renewal-test"]')
  const before = await card.evaluate((e) => ({ text: e.textContent, bg: getComputedStyle(e).backgroundColor }))
  await card.hover()
  expect(await card.evaluate((e) => ({ text: e.textContent, bg: getComputedStyle(e).backgroundColor }))).toEqual(before)
  console.log(
    JSON.stringify({
      planBoard: 'passed',
      widths: [1192, 1024, 1023, 768, 320, 286],
      columnScrollIndependent: true,
      stackEndVisible: true,
      overflowRowsPerColumn: 25,
      longGermanCopy: true,
      passiveCards: true,
    }),
  )
}
