import { expect, type Page } from '@playwright/test'

export async function verifyPlanChecklist(page: Page, baseUrl: string) {
  const url = (fixture?: string) =>
    `${baseUrl}/?${new URLSearchParams({ variant: 'hbar-app-ui-agent-plan-1', mode: 'isolated', ...(fixture ? { agentPlanFixture: fixture } : {}) })}`
  const pane = page.locator('.hbar-app-ui-agent-plan-checklist-pane')
  const list = pane.locator('ol')
  const details = pane.locator('.hbar-app-ui-agent-plan-step-detail')
  const live = page.locator('[aria-live="polite"]')
  const geometry = []
  for (const width of [1192, 320]) {
    await page.setViewportSize({ width, height: 560 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const box = await pane.boundingBox()
    const padding = width === 1192 ? 24 : 16
    expect(box).not.toBeNull()
    expect(Math.abs(box!.x - padding)).toBeLessThan(1)
    expect(Math.abs(box!.y - (padding + 44))).toBeLessThan(1)
    expect(Math.abs(box!.width - (width - padding * 2))).toBeLessThan(1)
    geometry.push({ width, box })
  }
  await page.setViewportSize({ width: 1192, height: 560 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  const first = list.getByRole('button').nth(0)
  const running = list.getByRole('button').nth(2)
  const runningDot = running.locator('.hbar-app-ui-agent-plan-checklist-status > span').first()
  expect(await runningDot.evaluate((element) => getComputedStyle(element).animationDuration)).toBe('2s')
  await first.click()
  await expect(first).toHaveAttribute('aria-expanded', 'true')
  await expect(running).toHaveAttribute('aria-expanded', 'false')
  await expect(details).toHaveCount(1)
  await expect(live).toHaveText('Working on Patch the tier lookup.')
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await expect(live).toHaveText('Paused on Patch the tier lookup.')
  expect(await runningDot.evaluate((element) => getComputedStyle(element).animationName)).toBe('none')
  await expect(first).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('button', { name: 'Resume', exact: true }).press('Space')
  await expect(live).toHaveText('Working on Patch the tier lookup.')
  await first.press('Enter')
  await expect(details).toHaveCount(0)
  for (const fixture of ['localized', 'overflow']) {
    await page.setViewportSize({ width: 286, height: 420 })
    await page.goto(url(fixture), { waitUntil: 'networkidle' })
    const header = page.locator('.hbar-app-ui-agent-plan-checklist-heading')
    const before = await header.boundingBox()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    if (fixture === 'localized') {
      const stop = page.getByRole('button', { name: 'Ausführung stoppen', exact: true })
      await stop.click()
      const resume = page.getByRole('button', { name: 'Ausführung fortsetzen', exact: true })
      await expect(resume).toBeVisible()
      const bounds = await resume.boundingBox()
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(270.5)
      await resume.press('Space')
    } else {
      await expect(list.locator('li')).toHaveCount(25)
      await list.evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
      expect(await list.evaluate((element) => element.scrollTop > 0)).toBe(true)
      await expect(list.getByRole('button').last()).toBeInViewport()
      expect(await header.boundingBox()).toEqual(before)
    }
  }
  console.log(
    JSON.stringify({
      checklist: {
        geometry,
        disclosureAndRunIndependent: true,
        localizedControlReachable: true,
        overCapacityRows: 25,
        pageHeight: 420,
      },
    }),
  )
}
