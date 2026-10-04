import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium, expect, type Page } from '@playwright/test'
import {
  createHbarAppUiAgentApprovalLocalizedFixtures as createRawLocalizedApprovalFixtures,
  HBAR_APP_UI_AGENT_APPROVAL_FIXTURES as RAW_AGENT_APPROVAL_FIXTURES,
} from '../tests/fixtures/hbar-app-ui-agent-approval-fixtures'
import {
  createApprovalPreviewCopy,
  projectApprovalPreviewCopy,
} from '../apps/hbar-app-ui-preview/src/approvalPreviewCopy'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const artifactDirectory = resolve('artifacts/agent-approval-core-review')
const diagnostics: string[] = []
const HBAR_APP_UI_AGENT_APPROVAL_FIXTURES = projectApprovalPreviewCopy(RAW_AGENT_APPROVAL_FIXTURES, false)
const LOCALIZED_AGENT_APPROVAL_FIXTURES = projectApprovalPreviewCopy(createRawLocalizedApprovalFixtures(), true)
const previewCopy = createApprovalPreviewCopy(false)
const localizedPreviewCopy = createApprovalPreviewCopy(true)
let checks = 0

function requireValue<T>(value: T | null | undefined, label: string): T {
  if (value === undefined || value === null) throw new Error(`Missing approval fixture data: ${label}`)
  return value
}

function previewUrl(variant: number, fixture?: 'localized' | 'overflow'): string {
  const query = new URLSearchParams({
    variant: `hbar-app-ui-agent-approval-${variant}`,
    mode: 'isolated',
  })
  if (fixture) query.set('agentApprovalFixture', fixture)
  return `${baseUrl}/?${query.toString()}`
}

async function openVariant(page: Page, variant: number, fixture?: 'localized' | 'overflow'): Promise<void> {
  await page.goto(previewUrl(variant, fixture), { waitUntil: 'domcontentloaded' })
  await expect(page.locator(`.hbar-app-ui-agent-approval-variant-${variant}`)).toBeVisible()
  checks += 1
}

async function checkNoHorizontalOverflow(page: Page, context: string): Promise<void> {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  if (Math.max(widths.document, widths.body) > widths.viewport + 1) {
    throw new Error(`${context} introduced horizontal page overflow: ${JSON.stringify(widths)}`)
  }
  checks += 1
}

async function capture(page: Page, name: string): Promise<string> {
  const filePath = resolve(artifactDirectory, name)
  await page.screenshot({ path: filePath, fullPage: true })
  return filePath
}

async function waitForPreview(): Promise<void> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // The verifier never starts or stops the user's preview server.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200))
  }
  throw new Error(`Preview is not reachable at ${baseUrl}; start it separately before running this verifier.`)
}

async function verifyStructures(page: Page): Promise<void> {
  const structures: readonly [number, string][] = [
    [1, '.hbar-app-ui-agent-approval-inline'],
    [2, '.hbar-app-ui-agent-approval-diff'],
    [3, '.hbar-app-ui-agent-approval-queue'],
    [4, '.hbar-app-ui-agent-approval-permission'],
    [5, '.hbar-app-ui-agent-approval-cost-card'],
    [6, '.hbar-app-ui-agent-approval-history'],
  ]

  await page.setViewportSize({ width: 1365, height: 820 })
  for (const [variant, structure] of structures) {
    await openVariant(page, variant)
    await expect(page.locator(structure)).toBeVisible()
    checks += 1
    switch (variant) {
      case 1: {
        const inline = requireValue(HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.inline, 'inline')
        await expect(page.getByText(inline.requestTitle, { exact: true })).toBeVisible()
        break
      }
      case 2: {
        const diff = requireValue(HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.diff, 'diff')
        await expect(page.getByText(diff.title, { exact: true })).toBeVisible()
        await expect(page.locator('.hbar-app-ui-agent-approval-change-list > div')).toHaveCount(3)
        break
      }
      case 3: {
        const queue = requireValue(HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.queue, 'queue')
        await expect(page.getByText(requireValue(queue.pending[0], 'first queue request').title)).toBeVisible()
        break
      }
      case 4: {
        const permission = requireValue(HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.permission, 'permission')
        await expect(page.getByRole('checkbox')).toHaveCount(3)
        await expect(page.getByText(permission.requestTitle, { exact: true })).toBeVisible()
        break
      }
      case 5: {
        const cost = requireValue(HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.cost, 'cost')
        await expect(page.locator('.hbar-app-ui-agent-approval-cost-metrics > div')).toHaveCount(3)
        await expect(page.getByText(cost.projectedValue, { exact: true })).toBeVisible()
        break
      }
      case 6: {
        const history = requireValue(HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.history, 'history')
        await expect(page.getByRole('textbox', { name: history.labels.searchLabel })).toBeVisible()
        await expect(page.locator('.hbar-app-ui-agent-approval-history-pane li')).toHaveCount(8)
        break
      }
    }
    await checkNoHorizontalOverflow(page, `approval ${variant} structure`)
  }
}

async function verifyInlineAndDiff(page: Page): Promise<void> {
  const inline = requireValue(HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.inline, 'inline')
  await openVariant(page, 1)
  await page.getByRole('button', { name: inline.labels.showRequest, exact: true }).click()
  await expect(page.locator('.hbar-app-ui-agent-approval-inline-request')).toHaveText(inline.requestText)
  await page.getByRole('button', { name: inline.labels.approve, exact: true }).click()
  await expect(page.getByText(inline.outcomes.approved.summary, { exact: true })).toBeVisible()
  if (inline.outcomes.approved.followUp) {
    await expect(page.getByText(inline.outcomes.approved.followUp, { exact: true })).toBeVisible()
  }
  await expect(page.locator('.lumen-agent-approval-preview-notice[role="status"]')).toHaveText(previewCopy.notice)
  await checkNoHorizontalOverflow(page, 'inline approval result')

  const diff = requireValue(HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.diff, 'diff')
  await openVariant(page, 2)
  await page.getByRole('button', { name: diff.labels.showDiff, exact: true }).click()
  await expect(page.locator('.hbar-app-ui-agent-approval-diff-payload')).toHaveText(diff.diffText)
  await page.getByRole('button', { name: diff.labels.alwaysAllow, exact: true }).click()
  await expect(page.locator('.hbar-app-ui-agent-approval-diff-result')).toContainText(
    diff.outcomes['always-allow'].summary,
  )
  await expect(page.locator('.lumen-agent-approval-preview-notice[role="status"]')).toHaveText(previewCopy.notice)
  await checkNoHorizontalOverflow(page, 'diff approval result')
}

async function verifyQueue(page: Page): Promise<void> {
  const queue = requireValue(HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.queue, 'queue')
  const first = requireValue(queue.pending[0], 'first queue request')
  const next = requireValue(queue.pending[1], 'next queue request')
  await openVariant(page, 3)
  const firstRow = page.locator(`[data-hbar-app-ui-item-id="${first.id}"]`)
  await firstRow.getByRole('button', { name: queue.labels.approve, exact: true }).click()
  await expect(firstRow).toHaveAttribute('data-hbar-app-ui-state', 'approved')
  await expect(
    page.locator(`[data-hbar-app-ui-item-id="${next.id}"] .hbar-app-ui-agent-approval-queue-featured`),
  ).toBeVisible()
  await expect(page.locator('[aria-live="polite"]')).toContainText(queue.outcomes.approved.announcement)
  await expect(page.locator('.lumen-agent-approval-preview-notice[role="status"]')).toHaveText(previewCopy.notice)
  await checkNoHorizontalOverflow(page, 'approval queue progression')

  await openVariant(page, 3, 'overflow')
  const pane = page.locator('.hbar-app-ui-agent-approval-queue-pane')
  const overflow = await pane.evaluate((element) => {
    const scrollable = element.scrollHeight > element.clientHeight
    element.scrollTop = element.scrollHeight
    return { scrollable, moved: element.scrollTop > 0 }
  })
  if (!overflow.scrollable || !overflow.moved) throw new Error('Queue pane overflow did not remain reachable')
  checks += 1
  await checkNoHorizontalOverflow(page, 'over-bound queue pane')
}

async function verifyPermission(page: Page): Promise<string> {
  const permission = requireValue(HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.permission, 'permission')
  await page.setViewportSize({ width: 390, height: 720 })
  await openVariant(page, 4)
  const scopes = page.getByRole('checkbox')
  await expect(scopes).toHaveCount(3)
  await scopes.nth(0).uncheck()
  await expect(scopes.nth(0)).not.toBeChecked()
  await expect(scopes.nth(1)).toBeChecked()
  await page.getByRole('button', { name: permission.labels.approve, exact: true }).click()
  await expect(page.locator('.hbar-app-ui-agent-approval-permission-result')).toContainText(
    permission.outcomes.approved.summary(2, 3),
  )
  await expect(page.locator('.lumen-agent-approval-preview-notice[role="status"]')).toHaveText(previewCopy.notice)
  await checkNoHorizontalOverflow(page, 'permission scope decision')

  const localized = requireValue(LOCALIZED_AGENT_APPROVAL_FIXTURES.permission, 'localized permission')
  await page.setViewportSize({ width: 390, height: 720 })
  await openVariant(page, 4, 'localized')
  await expect(page.getByText(localized.requestTitle, { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: localized.labels.showRequest, exact: true })).toBeVisible()
  await page.getByRole('button', { name: localized.labels.reject, exact: true }).click()
  await expect(page.locator('.hbar-app-ui-agent-approval-permission-result')).toContainText(
    requireValue(localized.outcomes.rejected, 'localized rejected outcome').summary(3, 3),
  )
  await expect(page.locator('.lumen-agent-approval-preview-notice[role="status"]')).toHaveText(
    localizedPreviewCopy.notice,
  )
  await checkNoHorizontalOverflow(page, 'localized permission')
  return capture(page, 'approval-4-localized-narrow.png')
}

async function verifyCost(page: Page): Promise<string> {
  const cost = requireValue(HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.cost, 'cost')
  await page.setViewportSize({ width: 320, height: 560 })
  await openVariant(page, 5)
  await expect(page.locator('.hbar-app-ui-agent-approval-cost-metrics > div')).toHaveCount(3)
  await expect(page.getByText(cost.projectedValue, { exact: true })).toBeVisible()
  const approve = page.getByRole('button', { name: cost.labels.approve, exact: true })
  await approve.scrollIntoViewIfNeeded()
  await expect(approve).toBeVisible()
  await checkNoHorizontalOverflow(page, 'narrow cost card')
  const screenshot = await capture(page, 'approval-5-narrow-cost.png')
  await page.getByRole('button', { name: cost.labels.showRequest, exact: true }).click()
  await expect(page.locator('.hbar-app-ui-agent-approval-cost-payload')).toHaveText(cost.requestText)
  await page.getByRole('button', { name: cost.labels.approve, exact: true }).click()
  await expect(page.locator('.hbar-app-ui-agent-approval-cost-result')).toContainText(cost.outcomes.approved.summary)
  await expect(page.locator('.lumen-agent-approval-preview-notice[role="status"]')).toHaveText(previewCopy.notice)
  await checkNoHorizontalOverflow(page, 'cost decision')
  return screenshot
}

async function verifyHistory(page: Page): Promise<string> {
  const history = requireValue(HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.history, 'history')
  const search = page.getByRole('textbox', { name: history.labels.searchLabel })
  await openVariant(page, 6)
  const skipped = requireValue(
    history.filters.find((filter) => filter.id === 'skipped'),
    'skipped filter',
  )
  await page.getByRole('button', { name: skipped.label, exact: true }).click()
  await expect(page.locator('.hbar-app-ui-agent-approval-history-pane li')).toHaveCount(3)
  await search.fill('billing-retention-policy.ts')
  await expect(page.locator('.hbar-app-ui-agent-approval-history-pane li')).toHaveCount(1)
  await expect(page.getByText('Changed the invoice retention window to 45 days', { exact: true })).toBeVisible()
  await search.fill('no-approval-matches-this-query')
  await expect(page.getByText(history.labels.emptyTitle, { exact: true })).toBeVisible()
  const clear = page.getByRole('button', { name: history.labels.clearFilters, exact: true })
  await expect(clear).toBeVisible()
  await clear.click()
  await expect(page.locator('.hbar-app-ui-agent-approval-history-pane li')).toHaveCount(8)
  await expect(search).toHaveValue('')
  const allFilter = requireValue(
    history.filters.find((filter) => filter.id === 'all'),
    'all filter',
  )
  await expect(page.getByRole('button', { name: allFilter.label, exact: true })).toHaveAttribute('aria-pressed', 'true')
  let downloadEvents = 0
  page.on('download', () => {
    downloadEvents += 1
  })
  await page.getByRole('button', { name: history.labels.export, exact: true }).click()
  await expect(page.locator('.lumen-agent-approval-preview-notice[role="status"]')).toHaveText(previewCopy.exportNotice)
  await expect(page.locator('.hbar-app-ui-agent-approval-history-pane li')).toHaveCount(8)
  if (downloadEvents !== 0) throw new Error('History export intent unexpectedly created a browser download')
  await checkNoHorizontalOverflow(page, 'history filter and clear')
  const screenshot = await capture(page, 'approval-6-history-restored.png')

  const localized = requireValue(LOCALIZED_AGENT_APPROVAL_FIXTURES.history, 'localized history')
  await openVariant(page, 6, 'localized')
  await expect(page.getByRole('heading', { name: localized.labels.title })).toBeVisible()
  await expect(page.getByRole('textbox', { name: localized.labels.searchLabel })).toHaveAttribute(
    'placeholder',
    localized.searchPlaceholder,
  )
  await page.getByRole('button', { name: localized.labels.export, exact: true }).click()
  await expect(page.locator('.lumen-agent-approval-preview-notice[role="status"]')).toHaveText(
    localizedPreviewCopy.exportNotice,
  )
  await expect(page.locator('.hbar-app-ui-agent-approval-history-pane li')).toHaveCount(8)
  await checkNoHorizontalOverflow(page, 'localized approval history')
  return screenshot
}

async function main(): Promise<void> {
  await waitForPreview()
  mkdirSync(artifactDirectory, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage()
  page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(`console.error: ${message.text()}`)
  })

  try {
    await verifyStructures(page)
    await verifyInlineAndDiff(page)
    await verifyQueue(page)
    const screenshots = [await verifyPermission(page), await verifyCost(page), await verifyHistory(page)]
    if (diagnostics.length > 0) throw new Error(`Browser diagnostics:\n${diagnostics.join('\n')}`)
    console.log(JSON.stringify({ baseUrl, checks, screenshots, diagnostics }, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
  process.exitCode = 1
})
