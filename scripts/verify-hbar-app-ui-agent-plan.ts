import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { chromium, expect, type Page } from '@playwright/test'
import {
  createHbarAppUiAgentPlanLocalizedFixtures as createRawLocalizedPlanFixtures,
  HBAR_APP_UI_AGENT_PLAN_FIXTURES as RAW_AGENT_PLAN_FIXTURES,
} from '../tests/fixtures/hbar-app-ui-agent-plan-fixtures'
import { createPlanPreviewCopy, projectPlanPreviewCopy } from '../apps/hbar-app-ui-preview/src/planPreviewCopy'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const artifactDirectory = resolve('artifacts/agent-plan-core-review')
const HBAR_APP_UI_AGENT_PLAN_FIXTURES = projectPlanPreviewCopy(RAW_AGENT_PLAN_FIXTURES, false)
const LOCALIZED_AGENT_PLAN_FIXTURES = projectPlanPreviewCopy(createRawLocalizedPlanFixtures(), true)
const previewCopy = createPlanPreviewCopy(false)
const diagnostics: string[] = []
const completedChecks: string[] = []

type PlanFixture = 'localized' | 'overflow'

function requireValue<T>(value: T | null | undefined, label: string): T {
  if (value === undefined || value === null) throw new Error(`Missing plan fixture data: ${label}`)
  return value
}

function previewUrl(variant: number, fixture?: PlanFixture): string {
  const query = new URLSearchParams({
    variant: `hbar-app-ui-agent-plan-${variant}`,
    mode: 'isolated',
  })
  if (fixture) query.set('agentPlanFixture', fixture)
  return `${baseUrl}/?${query.toString()}`
}

async function openVariant(page: Page, variant: number, fixture?: PlanFixture): Promise<void> {
  await page.goto(previewUrl(variant, fixture), { waitUntil: 'domcontentloaded' })
  await expect(page.locator(`.hbar-app-ui-agent-plan-variant-${variant}`)).toBeVisible()
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
  completedChecks.push(`${context}: no horizontal page overflow`)
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
      // The verifier only connects to an already-running preview; it never starts or stops one.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200))
  }
  throw new Error(`Preview is not reachable at ${baseUrl}; start it separately before running this verifier.`)
}

async function verifyStructures(page: Page): Promise<void> {
  const structures: readonly [number, string][] = [
    [1, '.hbar-app-ui-agent-plan-checklist-pane'],
    [2, '.lumen-plan-review'],
    [3, '.lumen-plan-tree-card'],
    [4, '.lumen-plan-actual-card'],
    [5, '.lumen-plan-board-columns'],
    [6, '.lumen-plan-summary-scroll'],
  ]
  await page.setViewportSize({ width: 1365, height: 820 })

  for (const [variant, selector] of structures) {
    await openVariant(page, variant)
    const root = page.locator(`.hbar-app-ui-agent-plan-variant-${variant}`)
    await expect(root.locator(selector)).toBeVisible()
    switch (variant) {
      case 1: {
        const checklist = requireValue(HBAR_APP_UI_AGENT_PLAN_FIXTURES.checklist, 'checklist')
        await expect(root.locator('.hbar-app-ui-agent-plan-checklist-pane ol > li')).toHaveCount(checklist.steps.length)
        const running = requireValue(
          checklist.steps.find((step) => step.state === 'running'),
          'running step',
        )
        await expect(root.getByText(running.title, { exact: true })).toBeVisible()
        break
      }
      case 2: {
        const editable = requireValue(HBAR_APP_UI_AGENT_PLAN_FIXTURES.editable, 'editable plan')
        await expect(root.locator('.lumen-plan-review-scroll > ol > li')).toHaveCount(editable.steps.length)
        await expect(root.getByRole('textbox', { name: editable.labels.addPlaceholder })).toBeVisible()
        await expect(root.getByRole('button', { name: editable.labels.start(8), exact: true })).toBeVisible()
        break
      }
      case 3: {
        const tree = requireValue(HBAR_APP_UI_AGENT_PLAN_FIXTURES.tree, 'plan tree')
        await expect(root.locator('.lumen-plan-tree-group')).toHaveCount(tree.groups.length)
        await expect(root.getByRole('button', { name: tree.labels.retry, exact: true })).toBeVisible()
        break
      }
      case 4: {
        const actual = requireValue(HBAR_APP_UI_AGENT_PLAN_FIXTURES.actual, 'plan actual')
        await expect(root.getByRole('table', { name: actual.labels.description })).toBeVisible()
        await expect(root.locator('.lumen-plan-actual-table tbody tr')).toHaveCount(actual.rows.length)
        await expect(root.locator('.lumen-plan-actual-metrics > div')).toHaveCount(actual.metrics.length)
        await expect(root.getByRole('button')).toHaveCount(0)
        break
      }
      case 5: {
        const board = requireValue(HBAR_APP_UI_AGENT_PLAN_FIXTURES.board, 'plan board')
        await expect(root.locator('.lumen-plan-board-column')).toHaveCount(board.sections.length)
        await expect(root.getByRole('listitem')).toHaveCount(
          board.sections.reduce((count, section) => count + section.items.length, 0),
        )
        await expect(root.getByRole('button')).toHaveCount(0)
        break
      }
      case 6: {
        const summary = requireValue(HBAR_APP_UI_AGENT_PLAN_FIXTURES.summary, 'plan summary')
        await expect(root.getByText(summary.goal, { exact: true })).toBeVisible()
        await expect(root.locator('.lumen-plan-summary-metrics > div')).toHaveCount(summary.metrics.length)
        await expect(root.locator('.lumen-plan-summary-tools li')).toHaveCount(summary.tools.length)
        await expect(root.locator('.lumen-plan-summary-breakdown > li')).toHaveCount(summary.breakdown.length)
        await expect(root.getByRole('button', { name: summary.labels.edit, exact: true })).toBeVisible()
        await expect(root.getByRole('button', { name: summary.labels.run, exact: true })).toBeVisible()
        break
      }
    }
    completedChecks.push(`variant ${variant}: primary structure and supplied data`)
    await checkNoHorizontalOverflow(page, `variant ${variant} structure`)
  }
}

async function verifyChecklistPause(page: Page): Promise<string> {
  const checklist = requireValue(HBAR_APP_UI_AGENT_PLAN_FIXTURES.checklist, 'checklist')
  const running = requireValue(
    checklist.steps.find((step) => step.state === 'running'),
    'running checklist step',
  )
  const runningIndex = checklist.steps.findIndex((step) => step.id === running.id)
  await page.setViewportSize({ width: 1365, height: 820 })
  await openVariant(page, 1)
  const root = page.locator('.hbar-app-ui-agent-plan-variant-1')
  const activeRow = root.locator('.hbar-app-ui-agent-plan-checklist-pane ol > li').nth(runningIndex)
  const progress = checklist.labels.progress(2, 7)
  await root.getByRole('button', { name: checklist.labels.stop, exact: true }).click()
  await expect(root.getByRole('button', { name: checklist.labels.resume, exact: true })).toBeVisible()
  await expect(activeRow).toHaveAttribute('data-state', 'paused')
  await expect(activeRow.getByText(checklist.labels.paused, { exact: true })).toBeVisible()
  await expect(root.locator('.hbar-app-ui-agent-plan-checklist-announcement')).toHaveText(
    checklist.labels.pausedOn(running.title),
  )
  await expect(root.locator('.hbar-app-ui-agent-plan-progress')).toContainText(progress)
  await expect(root.locator('.lumen-agent-plan-preview-notice[role="status"]')).toHaveText(previewCopy.notice)
  completedChecks.push('variant 1: Pause preview keeps the active step and progress; no real task is paused')
  await checkNoHorizontalOverflow(page, 'paused checklist')
  const screenshot = await capture(page, 'plan-1-paused-preview.png')

  await root.getByRole('button', { name: checklist.labels.resume, exact: true }).click()
  await expect(root.getByRole('button', { name: checklist.labels.stop, exact: true })).toBeVisible()
  await expect(activeRow).toHaveAttribute('data-state', 'running')
  await expect(root.locator('.hbar-app-ui-agent-plan-progress')).toContainText(progress)
  await checkNoHorizontalOverflow(page, 'resumed checklist')
  completedChecks.push('variant 1: Resume preview restores the same active step without changing progress')
  return screenshot
}

async function verifyPlanReview(page: Page): Promise<void> {
  const editable = requireValue(HBAR_APP_UI_AGENT_PLAN_FIXTURES.editable, 'editable plan')
  const title = 'Confirm the renewal fallback example'
  await page.setViewportSize({ width: 1365, height: 820 })
  await openVariant(page, 2)
  const root = page.locator('.hbar-app-ui-agent-plan-variant-2')
  const draft = root.getByRole('textbox', { name: editable.labels.addPlaceholder })
  await draft.fill(title)
  await root.getByRole('button', { name: editable.labels.add, exact: true }).click()
  await expect(root.locator('.lumen-plan-review-scroll > ol > li')).toHaveCount(editable.steps.length + 1)
  await expect(root.locator('.lumen-plan-review-scroll')).toContainText(title)
  await expect(root.locator('.lumen-plan-review-announcement')).toHaveText(editable.labels.added(title))
  await expect(root.locator('.lumen-plan-review > header')).toContainText(editable.labels.summaryCounts(9, 1))
  await expect(root.getByRole('button', { name: editable.labels.start(9), exact: true })).toBeVisible()
  await expect(root.locator('.lumen-agent-plan-preview-notice[role="status"]')).toHaveText(previewCopy.notice)
  await checkNoHorizontalOverflow(page, 'editable plan local add')
  completedChecks.push('variant 2: host-owned plan draft add is visible and remains a preview-only edit')
}

async function verifyTreeRetry(page: Page): Promise<void> {
  const tree = requireValue(HBAR_APP_UI_AGENT_PLAN_FIXTURES.tree, 'plan tree')
  const failedGroup = requireValue(
    tree.groups.find((group) => group.items.some((item) => item.state === 'failed')),
    'failed group',
  )
  const failedStep = requireValue(
    failedGroup.items.find((item) => item.state === 'failed'),
    'failed step',
  )
  const queuedStep = requireValue(
    failedGroup.items.find((item) => item.state === 'queued'),
    'neighboring queued step',
  )
  await page.setViewportSize({ width: 1365, height: 820 })
  await openVariant(page, 3)
  const root = page.locator('.hbar-app-ui-agent-plan-variant-3')
  const target = root.locator(`[data-group-id="${failedGroup.id}"] [data-step-id="${failedStep.id}"]`)
  await root.getByRole('button', { name: tree.labels.retry, exact: true }).click()
  await expect(target).toHaveAttribute('data-state', 'running')
  await expect(target).toContainText(previewCopy.retryRequested)
  await expect(target.getByRole('button', { name: tree.labels.retry, exact: true })).toHaveCount(0)
  await expect(root.locator(`[data-group-id="${failedGroup.id}"] [data-step-id="${queuedStep.id}"]`)).toHaveAttribute(
    'data-state',
    'queued',
  )
  await expect(root.getByText(tree.labels.progress(5, 13), { exact: true })).toBeVisible()
  await expect(root.locator('.lumen-agent-plan-preview-notice[role="status"]')).toHaveText(previewCopy.notice)
  await checkNoHorizontalOverflow(page, 'plan tree retry request')
  completedChecks.push('variant 3: retry targets only the failed step; preview label and plan facts remain explicit')
}

async function verifyActualAndBoard(page: Page): Promise<void> {
  const actual = requireValue(HBAR_APP_UI_AGENT_PLAN_FIXTURES.actual, 'plan actual')
  await page.setViewportSize({ width: 1365, height: 820 })
  await openVariant(page, 4)
  const actualRoot = page.locator('.hbar-app-ui-agent-plan-variant-4')
  await expect(actualRoot.getByRole('table', { name: actual.labels.description })).toBeVisible()
  await expect(actualRoot.locator('.lumen-plan-actual-table tbody tr')).toHaveCount(actual.rows.length)
  await expect(actualRoot.getByRole('button')).toHaveCount(0)
  await checkNoHorizontalOverflow(page, 'actual duration table')
  completedChecks.push('variant 4: actual durations are passive table data; no invented action controls')

  const board = requireValue(HBAR_APP_UI_AGENT_PLAN_FIXTURES.board, 'plan board')
  await openVariant(page, 5)
  const boardRoot = page.locator('.hbar-app-ui-agent-plan-variant-5')
  await expect(boardRoot.locator('.lumen-plan-board-column')).toHaveCount(board.sections.length)
  await expect(boardRoot.getByRole('listitem')).toHaveCount(
    board.sections.reduce((count, section) => count + section.items.length, 0),
  )
  await expect(boardRoot.getByRole('button')).toHaveCount(0)
  await checkNoHorizontalOverflow(page, 'plan board data')
  completedChecks.push('variant 5: three-phase board remains passive supplied data')
}

async function verifyNarrowBoard(page: Page): Promise<string> {
  const board = requireValue(HBAR_APP_UI_AGENT_PLAN_FIXTURES.board, 'plan board')
  await page.setViewportSize({ width: 320, height: 560 })
  await openVariant(page, 5)
  const root = page.locator('.hbar-app-ui-agent-plan-variant-5')
  const columns = root.locator('.lumen-plan-board-column')
  await expect(columns).toHaveCount(board.sections.length)
  const verticalFlow = await columns.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return { top: rect.top, bottom: rect.bottom }
    }),
  )
  if (
    verticalFlow.some((box, index) => {
      const previous = verticalFlow[index - 1]
      return index > 0 && previous !== undefined && box.top < previous.bottom
    })
  )
    throw new Error(`Narrow board columns did not stack in document order: ${JSON.stringify(verticalFlow)}`)
  await expect(root.locator('.lumen-plan-board-column h3')).toHaveCount(board.sections.length)
  await checkNoHorizontalOverflow(page, 'narrow stacked plan board')
  completedChecks.push('variant 5: narrow board stacks its three passive phases in reading order')
  return capture(page, 'plan-5-mobile-stacked-board.png')
}

async function verifyBoardPaneOverflow(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1365, height: 820 })
  await openVariant(page, 5, 'overflow')
  const boardPane = page.locator('.lumen-plan-board-columns')
  const overflow = await boardPane.evaluate((element) => {
    const scrollable = element.scrollHeight > element.clientHeight
    element.scrollTop = element.scrollHeight
    return { scrollable, moved: element.scrollTop > 0 }
  })
  if (!overflow.scrollable || !overflow.moved) {
    throw new Error(`Board pane did not expose its declared scroll boundary: ${JSON.stringify(overflow)}`)
  }
  await checkNoHorizontalOverflow(page, 'over-bound plan board pane')
  completedChecks.push('variant 5: over-bound board remains reachable in its owned scroll pane')
}

async function verifySummaryFlow(page: Page): Promise<void> {
  const summary = requireValue(HBAR_APP_UI_AGENT_PLAN_FIXTURES.summary, 'plan summary')
  const interaction = requireValue(summary.interaction, 'summary interaction')
  await page.setViewportSize({ width: 1365, height: 820 })
  await openVariant(page, 6)
  let root = page.locator('.hbar-app-ui-agent-plan-variant-6')
  await root.getByRole('button', { name: summary.labels.edit, exact: true }).click()
  const goal = root.getByRole('textbox', { name: interaction.labels.goalInput })
  await goal.fill('audit sample')
  await root.getByRole('button', { name: interaction.labels.save, exact: true }).click()
  await expect(root.getByText('audit sample', { exact: true })).toBeVisible()
  await expect(root.getByRole('button', { name: summary.labels.run, exact: true })).toBeVisible()
  await expect(root.locator('.lumen-agent-plan-preview-notice[role="status"]')).toHaveText(previewCopy.notice)
  completedChecks.push('variant 6: source-confirmed goal edit and save stay in the local preview')

  await openVariant(page, 6)
  root = page.locator('.hbar-app-ui-agent-plan-variant-6')
  await root.getByRole('button', { name: summary.labels.edit, exact: true }).click()
  const originalGoal = root.getByRole('textbox', { name: interaction.labels.goalInput })
  await originalGoal.fill('draft to discard')
  await root.getByRole('button', { name: interaction.labels.cancel, exact: true }).click()
  await expect(root.getByText(summary.goal, { exact: true })).toBeVisible()
  await expect(root.getByRole('textbox', { name: interaction.labels.goalInput })).toHaveCount(0)
  completedChecks.push('variant 6: Cancel discards the unsaved summary draft')

  await openVariant(page, 6)
  root = page.locator('.hbar-app-ui-agent-plan-variant-6')
  await root.getByRole('button', { name: summary.labels.run, exact: true }).click()
  await expect(root.locator('.lumen-plan-summary-footer')).toContainText(previewCopy.running(1, 10))
  await expect(root.getByRole('button', { name: interaction.labels.stop, exact: true })).toBeVisible()
  await expect(root.locator('.lumen-agent-plan-preview-notice[role="status"]')).toHaveText(previewCopy.notice)
  await checkNoHorizontalOverflow(page, 'summary local run preview')
  await root.getByRole('button', { name: interaction.labels.stop, exact: true }).click()
  await expect(root.getByRole('button', { name: summary.labels.edit, exact: true })).toBeVisible()
  await expect(root.getByRole('button', { name: summary.labels.run, exact: true })).toBeVisible()
  await expect(root.locator('.lumen-plan-summary-footer')).toContainText(summary.labels.review)
  completedChecks.push('variant 6: Run/Stop preserve the source state shape while the Host says no work started')
}

async function verifyLocalizedSummary(page: Page): Promise<string> {
  const summary = requireValue(LOCALIZED_AGENT_PLAN_FIXTURES.summary, 'localized plan summary')
  await page.setViewportSize({ width: 320, height: 640 })
  await openVariant(page, 6, 'localized')
  const root = page.locator('.hbar-app-ui-agent-plan-variant-6')
  await expect(root.getByRole('heading', { name: summary.labels.title })).toBeVisible()
  await expect(root.getByText(summary.goal, { exact: true })).toBeVisible()
  await expect(root.locator('.lumen-plan-summary-tools li')).toHaveCount(summary.tools.length)
  await checkNoHorizontalOverflow(page, 'localized narrow plan summary')
  completedChecks.push('variant 6: long German summary content remains reachable without horizontal overflow')
  return capture(page, 'plan-6-mobile-localized-summary.png')
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
    const screenshots: string[] = [await verifyChecklistPause(page)]
    await verifyPlanReview(page)
    await verifyTreeRetry(page)
    await verifyActualAndBoard(page)
    screenshots.push(await verifyNarrowBoard(page))
    await verifyBoardPaneOverflow(page)
    await verifySummaryFlow(page)
    screenshots.push(await verifyLocalizedSummary(page))
    if (diagnostics.length > 0) throw new Error(`Browser diagnostics:\n${diagnostics.join('\n')}`)

    const report = {
      baseUrl,
      checks: completedChecks,
      screenshots: screenshots.map((path) => basename(path)),
      diagnostics,
    }
    writeFileSync(resolve(artifactDirectory, 'verification-report.json'), `${JSON.stringify(report, null, 2)}\n`)
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
  process.exitCode = 1
})
