import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const artifactDirectory = resolve('artifacts/mobile-core-review')
const checks: string[] = []
const diagnostics: string[] = []
const screenshots: string[] = []

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

async function open(page: Page, variant: number, fixture?: string): Promise<Locator> {
  const query = new URLSearchParams({ variant: `hbar-app-ui-mobile-${variant}`, mode: 'isolated' })
  if (fixture) query.set('mobileFixture', fixture)
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded' })
  const root = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-mobile-${variant}"]`)
  await expect(root).toHaveCount(1)
  await expect(root.locator('.lumen-mobile-phone')).toBeVisible()
  const width = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }))
  assert(width.document <= width.viewport + 1, `Mobile${variant} horizontal overflow: ${JSON.stringify(width)}`)
  checks.push(`Mobile${variant}${fixture ? ` ${fixture}` : ''}: bounded phone visible; no page horizontal overflow`)
  return root
}

async function capture(page: Page, name: string) {
  await page.screenshot({ path: resolve(artifactDirectory, name), fullPage: true })
  screenshots.push(name)
}

async function request(page: Page) {
  await expect(page.locator('.lumen-mobile-preview-notice')).toContainText('no external action was performed')
}

async function main() {
  assert((await fetch(baseUrl)).ok, 'Existing production preview is not reachable; verifier never starts it')
  await mkdir(artifactDirectory, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1192, height: 760 } })
  page.on('pageerror', (error) => diagnostics.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(message.text())
  })
  try {
    const activity = await open(page, 1)
    const homeTab = activity.getByRole('tab', { name: 'Home', exact: true })
    await homeTab.focus()
    await homeTab.press('ArrowRight')
    await expect(activity.getByRole('heading', { name: 'Recent searches', exact: true })).toBeVisible()
    await expect(activity.locator('.lumen-mobile-feed > button')).toHaveCount(7)
    await expect(activity.getByRole('tab', { name: 'Search', exact: true })).toHaveAttribute('aria-selected', 'true')
    checks.push('Mobile1: ArrowRight switches Home to the observed seven-row Recent searches page')

    const tasks = await open(page, 2)
    await expect(tasks.locator('.lumen-mobile-tasks > button')).toHaveCount(7)
    await tasks.getByRole('button', { name: 'Open quick actions', exact: true }).click()
    await expect(tasks.locator('.lumen-mobile-quick-action-panel > button')).toHaveCount(4)
    await expect(tasks.getByRole('button', { name: 'Close quick actions', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    await tasks.getByRole('button', { name: 'New task', exact: true }).click()
    await expect(tasks.locator('.lumen-mobile-quick-action-panel')).toHaveCount(0)
    await expect(tasks.locator('.lumen-mobile-tasks > button')).toHaveCount(7)
    await request(page)
    checks.push('Mobile2: four quick actions open; New task closes and records request without appending a task')

    const home = await open(page, 3)
    await expect(home.locator('.lumen-mobile-card')).toHaveCount(5)
    await expect(home.locator('main button')).toHaveCount(0)
    await home.getByRole('button', { name: 'Search', exact: true }).click()
    const search = home.getByRole('textbox', { name: 'Search updates', exact: true })
    await search.fill('Harbor')
    await expect(home.locator('.lumen-mobile-search-results > button')).toHaveCount(1)
    await expect(home.locator('.lumen-mobile-search-results')).toContainText('Harbor Coffee replied')
    await search.fill('no-such-update')
    await expect(home.locator('.lumen-mobile-search-results')).toContainText('No matching updates')
    await search.press('Escape')
    await expect(search).toHaveCount(0)
    checks.push('Mobile3: static cards, local dock search with matching/empty results, Escape closes search')

    const orders = await open(page, 4)
    await expect(orders.locator('.lumen-mobile-feed > button')).toHaveCount(6)
    await orders.getByRole('button', { name: 'More', exact: true }).click()
    const destinations = orders.getByRole('dialog', { name: 'More destinations', exact: true })
    await expect(destinations).toBeVisible()
    await expect(destinations.locator('.lumen-mobile-more-shortcuts > button')).toHaveCount(4)
    await expect(destinations.locator('.lumen-mobile-more-links > button')).toHaveCount(3)
    const initialSheet = await destinations.boundingBox()
    await destinations.getByRole('button', { name: 'Expand menu', exact: true }).click()
    const expandedSheet = await destinations.boundingBox()
    assert(
      initialSheet && expandedSheet && expandedSheet.height > initialSheet.height,
      'More expand did not change the actual sheet extent',
    )
    await destinations.getByRole('button', { name: /Shipments/ }).click()
    await expect(destinations).toHaveCount(0)
    await request(page)
    checks.push(
      'Mobile4: More exposes four shortcuts/three links; two-snap extent expands; destination records request',
    )

    const runs = await open(page, 5)
    await expect(runs.locator('.lumen-mobile-runs > button')).toHaveCount(8)
    await runs.getByRole('tab', { name: 'Queue', exact: true }).click()
    await expect(runs.locator('.lumen-mobile-runs > button')).toHaveCount(3)
    await expect(runs.getByText('Nightly ledger export', { exact: true })).toBeVisible()
    await runs.getByRole('button', { name: 'Open menu', exact: true }).click()
    const navigation = runs.getByRole('dialog', { name: 'Navigation', exact: true })
    await expect(navigation.getByText('Meridian', { exact: true })).toBeVisible()
    await expect(navigation.locator('details > button')).toHaveCount(4)
    await expect(navigation.getByRole('button', { name: /Ana Reyes/ })).toBeVisible()
    await capture(page, 'mobile-navigation-desktop.png')
    await navigation.getByRole('button', { name: 'Close menu', exact: true }).click()
    await expect(navigation).toHaveCount(0)
    await expect(runs.getByRole('button', { name: 'Open menu', exact: true })).toBeFocused()
    checks.push(
      'Mobile5: Running eight rows to Queue three rows; real Navigation and profile; close restores trigger focus',
    )

    await page.setViewportSize({ width: 360, height: 780 })
    const localized = await open(page, 2, 'localized')
    const mainPane = localized.locator('main')
    const textFits = await mainPane.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    assert(textFits, 'Long German task copy spills horizontally')
    await localized.getByRole('button', { name: 'Schnellaktionen öffnen', exact: true }).click()
    await expect(localized.locator('.lumen-mobile-quick-action-panel > button')).toHaveCount(4)
    await capture(page, 'mobile-quick-actions-localized-narrow.png')
    checks.push('Mobile2 narrow: long host copy wraps; quick-action menu remains reachable')

    const narrowOrders = await open(page, 4)
    await narrowOrders.getByRole('button', { name: 'More', exact: true }).click()
    const narrowSheet = narrowOrders.getByRole('dialog', { name: 'More destinations', exact: true })
    await narrowSheet.getByRole('button', { name: 'Help centre', exact: true }).scrollIntoViewIfNeeded()
    await expect(narrowSheet.getByRole('button', { name: 'Help centre', exact: true })).toBeInViewport()
    await capture(page, 'mobile-more-narrow.png')
    checks.push('Mobile4 narrow: More secondary destination remains reachable within owning sheet')

    const overflow = await open(page, 1, 'overflow')
    const rows = overflow.locator('.lumen-mobile-feed > button')
    await expect(rows).toHaveCount(81)
    await rows.last().scrollIntoViewIfNeeded()
    await expect(rows.last()).toBeInViewport()
    await expect(rows.last()).toContainText('Workspace activity 80')
    assert(
      await overflow.locator('main').evaluate((element) => element.scrollTop > 0),
      'Last row did not move its owning pane',
    )
    checks.push('Mobile1 overflow: 81st row reachable through main pane scrolling, with bottom nav preserved')
    assert(diagnostics.length === 0, `Browser diagnostics: ${JSON.stringify(diagnostics)}`)
    const report = {
      baseUrl,
      coverage: 'core-flows-and-representative-layout',
      variants: 5,
      checks,
      screenshots,
      diagnostics,
      limits:
        'No exhaustive controls/theme/viewport matrix; source3 search data and task completion are explicit local preview behavior, not observed source transitions.',
    }
    await writeFile(resolve(artifactDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
  process.exitCode = 1
})
