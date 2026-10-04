import { expect, type Page } from '@playwright/test'

export async function verifyPlanSummary(page: Page, baseUrl: string): Promise<void> {
  const url = (fixture?: string) =>
    `${baseUrl}/?variant=hbar-app-ui-agent-plan-6&mode=isolated${fixture ? `&agentPlanFixture=${fixture}` : ''}`
  for (const width of [1192, 768, 640, 639, 356, 286]) {
    await page.setViewportSize({ width, height: 640 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const boxes = await page
      .locator('.lumen-plan-summary-metrics > div')
      .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().y))
    expect(new Set(boxes).size).toBe(1)
    await expect(page.locator('.lumen-plan-summary-footer > p')).toBeVisible({ visible: width >= 640 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    const heading = await page.locator('.lumen-plan-summary-heading').boundingBox()
    const footer = await page.locator('.lumen-plan-summary-footer').boundingBox()
    const pane = page.locator('.lumen-plan-summary-scroll')
    await pane.hover()
    await page.mouse.wheel(0, 1800)
    await expect(page.getByText('Verify in staging', { exact: true })).toBeInViewport()
    expect(await page.locator('.lumen-plan-summary-heading').boundingBox()).toEqual(heading)
    expect(await page.locator('.lumen-plan-summary-footer').boundingBox()).toEqual(footer)
  }
  await page.setViewportSize({ width: 286, height: 320 })
  await page.goto(url('overflow'), { waitUntil: 'networkidle' })
  await page.locator('.lumen-plan-summary-scroll').hover()
  await page.mouse.wheel(0, 3000)
  await expect(page.getByText('Additional plan step 18', { exact: true })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Run plan', exact: true })).toBeInViewport()
  await page.goto(url('localized'), { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Plan bearbeiten', exact: true }).click()
  const input = page.getByRole('textbox', { name: 'Vollständiges Ziel des Ausführungsplans bearbeiten', exact: true })
  await expect(input).toBeFocused()
  await input.fill('  Ein ausführliches neues Ziel  ')
  await page.getByRole('button', { name: 'Änderungen speichern', exact: true }).click()
  await expect(page.getByText('Ein ausführliches neues Ziel', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Plan ausführen', exact: true }).press('Enter')
  await expect(page.getByRole('button', { name: 'Ausführung stoppen', exact: true })).toBeInViewport()
  await page.getByRole('button', { name: 'Ausführung stoppen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Plan bearbeiten', exact: true })).toBeEnabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  console.log(
    JSON.stringify({
      planSummary: 'passed',
      widths: [1192, 768, 640, 639, 356, 286],
      shortHost: true,
      overflowRows: 22,
      longGermanDraft: true,
      keyboardRun: true,
    }),
  )
}
