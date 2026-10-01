import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = resolve('artifacts/filtering-core-review')
const checks: string[] = []
const diagnostics: string[] = []
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
async function open(page: Page, variant: number, fixture?: string): Promise<Locator> {
  const query = new URLSearchParams({ variant: `hbar-app-ui-filtering-${variant}`, mode: 'isolated' })
  if (fixture) query.set('filteringFixture', fixture)
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded' })
  const root = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-filtering-${variant}"]`)
  await expect(root.locator('[data-reference-kind]')).toBeVisible()
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `Filtering${variant} page overflow`,
  )
  checks.push(`Filtering${variant}${fixture ? ` ${fixture}` : ''}: natural structure without page horizontal overflow`)
  return root
}
async function main() {
  assert((await fetch(baseUrl)).ok, 'Existing production preview unavailable; no automatic server start')
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1192, height: 760 } })
  page.on('pageerror', (error) => diagnostics.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(message.text())
  })
  try {
    const catalog = await open(page, 1)
    await catalog.getByRole('checkbox', { name: 'Dinnerware 5', exact: true }).check()
    await expect(catalog.locator('[data-row-id]')).toHaveCount(5)
    await catalog.getByRole('checkbox', { name: /^Kilnhouse / }).check()
    await expect(catalog.locator('[data-row-id]')).toHaveCount(2)
    await catalog.getByRole('combobox', { name: 'Sort pieces', exact: true }).selectOption('price-asc')
    await expect(catalog.locator('[data-row-id]').first()).toHaveAttribute('data-row-id', 'ridge-side')
    await catalog.getByRole('button', { name: 'Reset', exact: true }).click()
    await expect(catalog.locator('[data-row-id]')).toHaveCount(18)
    checks.push('Catalog category/maker intersection and sorting update the same collection; Reset restores all pieces')
    const bikes = await open(page, 2)
    await bikes.getByRole('checkbox', { name: '48 cm 0', exact: true }).check()
    await expect(bikes.getByRole('button', { name: 'No bikes match', exact: true })).toBeDisabled()
    await bikes.getByRole('button', { name: 'Reset', exact: true }).click()
    await bikes.getByRole('checkbox', { name: '51 cm 5', exact: true }).check()
    await bikes.getByRole('button', { name: 'Show 5 results', exact: true }).click()
    await expect(bikes.getByRole('status').last()).toContainText('no external')
    await bikes.getByRole('button', { name: 'Filters', exact: true }).click()
    await expect(bikes.getByRole('checkbox', { name: '51 cm 5', exact: true })).toBeChecked()
    checks.push(
      'Bike zero-result disables application; local Apply/reopen preserves draft without inventing bike records',
    )
    const deals = await open(page, 3)
    await expect(deals.locator('tbody>tr')).toHaveCount(14)
    await deals.getByRole('button', { name: 'All deals', exact: true }).click()
    await expect(deals.locator('tbody>tr')).toHaveCount(18)
    await expect(deals.locator('.lumen-filtering-reference-heading')).toContainText('$688,500')
    await deals.getByRole('button', { name: 'Add filter', exact: true }).click()
    await deals.getByRole('menuitem', { name: 'Owner', exact: true }).click()
    await deals.getByRole('combobox', { name: 'Owner', exact: true }).selectOption('Raj Patel')
    await deals.getByRole('textbox', { name: 'Search deals', exact: true }).fill('Meridian')
    await expect(deals.locator('tbody>tr')).toHaveCount(1)
    await expect(deals.locator('tbody>tr')).toContainText('Meridian expansion')
    await page.screenshot({ path: resolve(output, 'filtering-deals-desktop.png'), fullPage: true })
    checks.push('Clearing captured initial conditions reveals all four hidden deals; added owner rule intersects query')
    const logs = await open(page, 4)
    await logs.getByRole('button', { name: 'Error 5', exact: true }).click()
    await expect(logs.locator('[data-row-id]')).toHaveCount(5)
    await logs.getByRole('textbox', { name: 'Filter messages', exact: true }).fill('gateway')
    await expect(logs.locator('[data-row-id]')).toHaveCount(1)
    checks.push('Log severity/query filters recompute rows and matched volume within the supplied snapshot')
    const flights = await open(page, 8)
    await flights.getByRole('switch', { name: 'Carry-on included', exact: true }).check()
    await expect(flights.locator('[data-row-id]')).toHaveCount(9)
    await flights.getByRole('radio', { name: 'Nonstop only 7', exact: true }).check()
    await expect(flights.locator('[data-row-id]')).toHaveCount(7)
    await flights.getByRole('button', { name: 'Select', exact: true }).first().click()
    await expect(flights.getByRole('status').last()).toContainText('flight-8')
    checks.push('Captured carry-on subset intersects stops; selected fare reports its exact ID, not a booked flight')
    const assets = await open(page, 7)
    await assets
      .locator('summary')
      .filter({ hasText: /^Orientation/ })
      .click()
    await assets.getByRole('checkbox', { name: 'Portrait', exact: true }).check()
    await expect(assets.locator('[data-row-id]')).toHaveCount(4)
    await assets.getByRole('button', { name: 'Compact grid', exact: true }).click()
    await expect(assets.locator('[data-reference-kind]')).toHaveClass(/is-compact/)
    checks.push('Asset dimensions drive orientation; density changes card flow without losing records')
    await page.setViewportSize({ width: 390, height: 844 })
    const candidates = await open(page, 6, 'localized')
    await candidates.getByRole('button', { name: '筛选条件', exact: true }).click()
    const skill = candidates.getByRole('textbox', { name: 'Add a required skill', exact: true })
    await skill.fill('TypeScript')
    await skill.press('Enter')
    await candidates.getByRole('switch', { name: 'Remote only', exact: true }).check()
    await expect(candidates.locator('[data-row-id]')).toHaveCount(4)
    await candidates.getByRole('button', { name: '筛选条件', exact: true }).click()
    await page.screenshot({ path: resolve(output, 'filtering-candidates-localized-narrow.png'), fullPage: true })
    checks.push('Narrow long localized heading and in-flow Filters disclosure preserve skill/remote results')
    const restaurants = await open(page, 9)
    await restaurants.getByRole('button', { name: 'Pizza 2', exact: true }).click()
    await restaurants.getByRole('button', { name: '4.5+', exact: true }).click()
    await expect(restaurants.locator('[data-row-id]')).toHaveCount(1)
    await expect(restaurants.locator('[data-row-id]')).toContainText('Crust & Coal')
    await page.screenshot({ path: resolve(output, 'filtering-restaurants-narrow.png'), fullPage: true })
    checks.push('Cuisine/rating intersection works in narrow horizontal cuisine navigation')
    await page.setViewportSize({ width: 1192, height: 760 })
    const overflow = await open(page, 1, 'overflow')
    await expect(overflow.locator('[data-row-id]')).toHaveCount(81)
    const pane = overflow.locator('.lumen-filtering-reference-collection')
    assert(
      await pane.evaluate((node) => node.scrollHeight > node.clientHeight),
      'Eighty-one cards must own pane scroll',
    )
    await overflow.locator('[data-row-id]').last().scrollIntoViewIfNeeded()
    await expect(overflow.locator('[data-row-id]').last()).toBeInViewport()
    checks.push('Capacity eighty-one: final card remains reachable in pane-owned scrolling')
    assert(diagnostics.length === 0, `Browser errors: ${diagnostics.join('; ')}`)
    await writeFile(
      resolve(output, 'report.json'),
      JSON.stringify(
        {
          standard: 'distinct core mechanisms and representative natural flow; no button/theme/viewport matrix',
          checks,
          diagnostics,
        },
        null,
        2,
      ),
    )
    console.log(`Filtering practical verification passed: ${checks.length} records, ${diagnostics.length} diagnostics`)
  } finally {
    await browser.close()
  }
}
await main()
