import { chromium, expect, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { createUsagePreviewCopy } from '../apps/hbar-app-ui-preview/src/usagePreviewCopy'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const artifactDirectory = resolve('artifacts/ai-usage-core-review')
const copy = createUsagePreviewCopy(false)
const localizedCopy = createUsagePreviewCopy(true)
const checks: string[] = []
const diagnostics: string[] = []

type UsageFixture = 'localized' | 'overflow'

function variantUrl(variant: number, fixture?: UsageFixture): string {
  const query = new URLSearchParams({
    variant: `hbar-app-ui-ai-usage-${variant}`,
    mode: 'isolated',
    theme: 'light',
  })
  if (fixture) query.set('usageFixture', fixture)
  return `${baseUrl}/?${query.toString()}`
}

async function openVariant(page: Page, variant: number, fixture?: UsageFixture): Promise<void> {
  await page.goto(variantUrl(variant, fixture), { waitUntil: 'domcontentloaded' })
  await expect(page.locator(`[data-lumen-variant="${variant}"]`)).toBeVisible()
}

async function checkHorizontalOverflow(page: Page, context: string): Promise<void> {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  if (Math.max(widths.document, widths.body) > widths.viewport + 1) {
    throw new Error(`${context} introduced horizontal overflow: ${JSON.stringify(widths)}`)
  }
  checks.push(`${context}: no horizontal overflow`)
}

async function expectPreviewNotice(page: Page, message: string): Promise<void> {
  await expect(page.locator('.lumen-usage-preview-notice[role="status"]')).toHaveText(message)
}

async function capture(page: Page, name: string): Promise<string> {
  const path = resolve(artifactDirectory, name)
  await page.screenshot({ path, fullPage: true })
  return path
}

async function waitForExistingPreview(): Promise<void> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // This verifier only connects to a preview started by its owner.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200))
  }
  throw new Error(`Preview is not reachable at ${baseUrl}; start it separately before verification.`)
}

async function verifyStructures(page: Page): Promise<void> {
  const structures = [
    async () => {
      await openVariant(page, 1)
      const root = page.locator('.lumen-usage-overview')
      await expect(root.getByRole('tablist', { name: copy.range })).toBeVisible()
      await expect(root.locator('.lumen-usage-overview-bar')).toHaveCount(7)
    },
    async () => {
      await openVariant(page, 2)
      const root = page.locator('.lumen-usage-model-table')
      await expect(root.getByRole('tablist', { name: 'Sort by' })).toBeVisible()
      await expect(root.locator('.lumen-usage-model-table-row')).toHaveCount(6)
    },
    async () => {
      await openVariant(page, 3)
      const root = page.locator('.lumen-usage-rate-panel')
      await expect(root.getByRole('tablist', { name: 'Usage tier' })).toBeVisible()
      await expect(root.getByRole('progressbar')).toHaveCount(4)
    },
    async () => {
      await openVariant(page, 4)
      const root = page.locator('.lumen-usage-member-list')
      await expect(root.getByRole('searchbox', { name: 'Search members' })).toBeVisible()
      await expect(root.locator('[data-member-id]')).toHaveCount(7)
    },
    async () => {
      await openVariant(page, 5)
      const root = page.locator('.lumen-usage-budget-panel')
      await expect(root.getByRole('slider', { name: 'Monthly cap' })).toBeVisible()
      await expect(root.getByRole('switch')).toHaveCount(2)
    },
    async () => {
      await openVariant(page, 6)
      const root = page.locator('.lumen-usage-overage-panel')
      await expect(root.getByRole('radiogroup', { name: 'Plan' })).toBeVisible()
      await expect(root.getByRole('radio')).toHaveCount(2)
    },
    async () => {
      await openVariant(page, 7)
      const root = page.locator('.lumen-usage-request-table')
      await expect(root.getByRole('tablist', { name: 'Filter' })).toBeVisible()
      await expect(root.locator('.lumen-usage-request-trigger')).toHaveCount(8)
      await expect(root.locator('.lumen-usage-request-trigger[aria-expanded="true"]')).toHaveCount(1)
    },
    async () => {
      await openVariant(page, 8)
      const root = page.locator('.lumen-usage-compact-widget')
      await expect(root.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '92')
      await expect(root.locator('.lumen-usage-widget-meter')).toHaveCount(3)
      await expect(root.locator('.lumen-usage-widget-sparkline > span')).toHaveCount(12)
    },
  ] as const

  await page.setViewportSize({ width: 1280, height: 800 })
  for (const [index, verify] of structures.entries()) {
    await verify()
    await checkHorizontalOverflow(page, `variant ${index + 1} structure`)
    checks.push(`variant ${index + 1}: expected core structure is present`)
  }
}

async function verifyOverviewRangeAndHover(page: Page): Promise<string> {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openVariant(page, 1)
  const root = page.locator('.lumen-usage-overview')
  const detail = root.locator('.lumen-usage-overview-detail')
  await root.getByRole('button', { name: 'Mon: 5.7M tokens', exact: true }).hover()
  await expect(detail).toHaveText('Mon · 5.7M · $36.30')
  await root.getByRole('tab', { name: '30d', exact: true }).click()
  await expect(root.getByRole('tab', { name: '30d', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(root.locator('.lumen-usage-overview-bar')).toHaveCount(4)
  await expect(root.locator('.lumen-usage-overview-metrics')).toContainText('$1,033')
  await root.getByRole('button', { name: 'W1: 31M tokens', exact: true }).hover()
  await expect(detail).toHaveText('W1 · 31M · $199')
  await checkHorizontalOverflow(page, 'overview range and hover')
  checks.push('variant 1: range selection swaps the supplied period data and hover shows its point details')
  return capture(page, 'usage-1-range-hover.png')
}

async function verifyModelSort(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openVariant(page, 2)
  const root = page.locator('.lumen-usage-model-table')
  const rows = root.locator('.lumen-usage-model-table-row')
  await root.getByRole('tab', { name: 'Requests', exact: true }).click()
  await expect(rows.first()).toHaveAttribute('data-model-id', 'ember-mini')
  await expect(rows).toHaveCount(6)
  await checkHorizontalOverflow(page, 'model sorting')
  checks.push('variant 2: changing the sort orders the same supplied six model records')
}

async function verifyLimitTierAndRequestIntent(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openVariant(page, 3)
  const root = page.locator('.lumen-usage-rate-panel')
  await root.getByRole('tab', { name: 'Tier 2', exact: true }).click()
  await expect(root.locator('.lumen-usage-rate-value').nth(1)).toContainText('1,600,000 tok')
  await expectPreviewNotice(page, copy.notice)
  const factsBeforeRequest = await root.innerText()
  await root.getByRole('button', { name: 'Request an increase', exact: true }).click()
  await expectPreviewNotice(page, copy.requestNotice)
  expect(await root.innerText()).toBe(factsBeforeRequest)
  await checkHorizontalOverflow(page, 'rate tier and increase request intent')
  checks.push('variant 3: tier data updates locally; increase is recorded only as a preview request')
}

async function verifyMemberQueryAndClear(page: Page): Promise<string> {
  await page.setViewportSize({ width: 320, height: 640 })
  await openVariant(page, 4, 'localized')
  const root = page.locator('.lumen-usage-member-list')
  const search = root.getByRole('searchbox', { name: 'Mitglieder suchen', exact: true })
  await expect(root.getByRole('heading', { name: 'Nutzung nach Mitglied', exact: true })).toBeVisible()
  await search.fill('Sofia')
  await expect(root.locator('[data-member-id]')).toHaveCount(1)
  await expect(root.locator('[data-member-id]').first()).toHaveAttribute('data-member-id', 'sofia')
  await search.fill('')
  await expect(root.locator('[data-member-id]')).toHaveCount(7)
  await expect(search).toBeVisible()
  await checkHorizontalOverflow(page, 'localized narrow member query and clear')
  checks.push('variant 4: long German member content remains searchable and clearing restores the full list')
  return capture(page, 'usage-4-mobile-members-de.png')
}

async function verifyBudgetSlider(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openVariant(page, 5)
  const root = page.locator('.lumen-usage-budget-panel')
  const slider = root.getByRole('slider', { name: 'Monthly cap', exact: true })
  await slider.press('End')
  await expect(slider).toHaveValue('10000')
  await expect(root.locator('.lumen-usage-budget-cap-row')).toContainText('$10,000')
  await expect(root.getByRole('progressbar', { name: 'Budget consumed' })).toHaveAttribute('aria-valuenow', '18')
  await expect(root.locator('.lumen-usage-budget-forecast')).toContainText('within budget')
  await expectPreviewNotice(page, copy.notice)
  await checkHorizontalOverflow(page, 'budget slider preview')
  checks.push('variant 5: the native cap slider updates forecast locally without a save or billing action')
}

async function verifyOveragePlanIntent(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openVariant(page, 6)
  const root = page.locator('.lumen-usage-overage-panel')
  const enterprise = root.getByRole('radio', { name: /Enterprise/ })
  await enterprise.click()
  await expect(enterprise).toHaveAttribute('aria-checked', 'true')
  await expectPreviewNotice(page, copy.notice)
  const factsBeforeUpgrade = await root.innerText()
  await root.getByRole('button', { name: 'Upgrade', exact: true }).click()
  await expectPreviewNotice(page, copy.requestNotice)
  await expect(enterprise).toHaveAttribute('aria-checked', 'true')
  expect(await root.innerText()).toBe(factsBeforeUpgrade)
  await checkHorizontalOverflow(page, 'overage plan and upgrade intent')
  checks.push('variant 6: plan selection is local; Upgrade records intent without changing billing facts')
}

async function verifyRequestDisclosure(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openVariant(page, 7)
  const root = page.locator('.lumen-usage-request-table')
  await root.getByRole('tab', { name: 'Capped', exact: true }).click()
  await expect(root.locator('.lumen-usage-request-trigger')).toHaveCount(1)
  await expect(root.getByText('Last 1 calls · $0.5884 billed', { exact: true })).toBeVisible()
  const request = root.locator('.lumen-usage-request-trigger').first()
  await expect(request).toHaveAttribute('aria-expanded', 'true')
  await expect(root.locator('.lumen-usage-request-details')).toContainText('Truncated at max tokens')
  await request.click()
  await expect(request).toHaveAttribute('aria-expanded', 'false')
  await expect(root.locator('.lumen-usage-request-details')).toHaveCount(0)
  await request.click()
  await expect(request).toHaveAttribute('aria-expanded', 'true')
  await expect(root.locator('.lumen-usage-request-details')).toContainText('req_8f2183')
  await checkHorizontalOverflow(page, 'request filtering and disclosure')
  checks.push('variant 7: capped filtering and request-detail disclosure expose only the selected log facts')
}

async function verifyCompactUpgrade(page: Page): Promise<string> {
  await page.setViewportSize({ width: 320, height: 640 })
  await openVariant(page, 8, 'localized')
  const root = page.locator('.lumen-usage-compact-widget')
  await expect(root.getByRole('heading', { name: 'Nutzung des Teamkontingents', exact: true })).toBeVisible()
  await expect(root.locator('.lumen-usage-widget-meter')).toHaveCount(3)
  const factsBeforeUpgrade = await root.innerText()
  await root.getByRole('button', { name: 'Erweitern', exact: true }).click()
  await expectPreviewNotice(page, localizedCopy.requestNotice)
  expect(await root.innerText()).toBe(factsBeforeUpgrade)
  await checkHorizontalOverflow(page, 'localized narrow compact upgrade intent')
  checks.push('variant 8: long German compact content wraps; upgrade remains an intent-only action')
  return capture(page, 'usage-8-mobile-compact-de.png')
}

async function verifyChartOverflowPane(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openVariant(page, 1, 'overflow')
  const root = page.locator('.lumen-usage-overview')
  const pane = root.locator('.lumen-usage-overview-plot')
  const scroll = await pane.evaluate((element) => {
    const overflow = element.scrollWidth > element.clientWidth
    const maxScroll = element.scrollWidth - element.clientWidth
    element.scrollLeft = maxScroll
    return { overflow, maxScroll, scrollLeft: element.scrollLeft }
  })
  if (!scroll.overflow || scroll.maxScroll <= 0 || scroll.scrollLeft <= 0) {
    throw new Error(`The chart did not expose its declared horizontal scroll boundary: ${JSON.stringify(scroll)}`)
  }
  await expect(root.getByRole('button', { name: 'Day 32: 5.7M tokens', exact: true })).toBeVisible()
  await checkHorizontalOverflow(page, 'over-bound chart scroll region')
  checks.push('variant 1: the 32-point chart remains reachable in its declared horizontal scroll region')
}

async function main(): Promise<void> {
  await waitForExistingPreview()
  await mkdir(artifactDirectory, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage()
  page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(`console.error: ${message.text()}`)
  })
  const screenshots: string[] = []

  try {
    await verifyStructures(page)
    screenshots.push(await verifyOverviewRangeAndHover(page))
    await verifyModelSort(page)
    await verifyLimitTierAndRequestIntent(page)
    screenshots.push(await verifyMemberQueryAndClear(page))
    await verifyBudgetSlider(page)
    await verifyOveragePlanIntent(page)
    await verifyRequestDisclosure(page)
    screenshots.push(await verifyCompactUpgrade(page))
    await verifyChartOverflowPane(page)
    if (diagnostics.length > 0) throw new Error(`Browser diagnostics:\n${diagnostics.join('\n')}`)

    const report = {
      baseUrl,
      checks,
      screenshots: screenshots.map((path) => basename(path)),
      diagnostics,
    }
    await writeFile(resolve(artifactDirectory, 'verification-report.json'), `${JSON.stringify(report, null, 2)}\n`)
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
  process.exitCode = 1
})
