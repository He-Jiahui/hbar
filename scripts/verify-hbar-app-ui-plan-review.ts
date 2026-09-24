import { expect, type Page } from '@playwright/test'

export async function verifyPlanReview(page: Page, baseUrl: string) {
  const url = (fixture?: string) =>
    `${baseUrl}/?${new URLSearchParams({ variant: 'hbar-app-ui-agent-plan-2', mode: 'isolated', ...(fixture ? { agentPlanFixture: fixture } : {}) })}`
  const root = page.locator('.lumen-plan-review')
  const rows = root.locator('li')
  const input = root.getByRole('textbox', { name: 'Add a step', exact: true })
  const geometry = []
  for (const width of [1192, 320]) {
    await page.setViewportSize({ width, height: 640 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const box = await root.locator('.lumen-plan-review-card').boundingBox()
    expect(box).not.toBeNull()
    const padding = width === 1192 ? 24 : 16
    expect(Math.abs(box!.x - padding)).toBeLessThan(1)
    expect(Math.abs(box!.y - (padding + 36))).toBeLessThan(1)
    expect(Math.abs(box!.height - (640 - 2 * padding - 132))).toBeLessThan(1)
    await expect(rows).toHaveCount(9)
    await expect(rows.last()).toBeInViewport()
    geometry.push({ width, box })
  }
  await page.setViewportSize({ width: 1192, height: 640 })
  await page.goto(url(), { waitUntil: 'networkidle' })
  await expect(root.getByRole('button', { name: 'Add', exact: true })).toBeDisabled()
  const firstDown = root.getByRole('button', { name: 'Move Read the billing contract notes down', exact: true })
  await firstDown.click()
  await expect(firstDown).toBeFocused()
  await expect(rows.nth(1)).toHaveAttribute('data-step-id', 'contract-notes')
  await expect(root.locator('[aria-live]')).toHaveText('Read the billing contract notes moved to position 2 of 9.')
  await root.getByRole('button', { name: 'Skip Read the billing contract notes', exact: true }).click()
  await expect(root.locator('header > span')).toHaveText('7 to run · 2 skipped')
  await root.getByRole('button', { name: 'Restore Read the billing contract notes', exact: true }).press('Space')
  await input.fill('  Confirm renewal  ')
  await input.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true })
  await expect(rows).toHaveCount(9)
  await input.press('Enter')
  await expect(rows).toHaveCount(10)
  await expect(input).toHaveValue('')
  await expect(input).toBeFocused()
  await expect(root.locator('[aria-live]')).toHaveText('Confirm renewal added to the end of the plan.')
  const titles = await root.locator('.lumen-plan-review-title').allTextContents()
  await root.getByRole('button', { name: 'Start 9 steps', exact: true }).click()
  await expect(root.locator('li button:not(:disabled)')).toHaveCount(0)
  await expect(input).toBeDisabled()
  await root.getByRole('button', { name: 'Stop', exact: true }).press('Space')
  await expect(input).toBeEnabled()
  expect(await root.locator('.lumen-plan-review-title').allTextContents()).toEqual(titles)
  await expect(rows.first().getByRole('button').first()).toBeDisabled()
  await expect(rows.last().getByRole('button').nth(1)).toBeDisabled()
  for (const fixture of ['overflow', 'localized']) {
    await page.setViewportSize({ width: 286, height: 420 })
    await page.goto(url(fixture), { waitUntil: 'networkidle' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    const footer = await root.locator('footer').boundingBox()
    if (fixture === 'overflow') {
      await expect(rows).toHaveCount(27)
      const scroll = root.locator('.lumen-plan-review-scroll')
      await scroll.evaluate((element) => {
        element.scrollTop = element.scrollHeight
      })
      expect(await scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
      await expect(rows.last()).toBeInViewport()
      expect(await root.locator('footer').boundingBox()).toEqual(footer)
    } else {
      const add = root.getByRole('button', { name: 'Hinzufügen', exact: true })
      const box = await add.boundingBox()
      expect(box!.x + box!.width).toBeLessThanOrEqual(270.5)
      await root.getByRole('button', { name: '8 Schritte starten', exact: true }).click()
      await root.getByRole('button', { name: 'Ausführung stoppen', exact: true }).press('Space')
    }
  }
  console.log(
    JSON.stringify({
      review: {
        geometry,
        targetFocusPreserved: true,
        inputAndRunRecovery: true,
        imeSafe: true,
        scrollableRows: 27,
        localizedActionsReachable: true,
      },
    }),
  )
}
