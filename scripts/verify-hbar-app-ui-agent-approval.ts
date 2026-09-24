import { chromium, expect } from '@playwright/test'
import { verifyQueueApproval } from './verify-hbar-app-ui-agent-approval-queue'
import { verifyPermissionApproval } from './verify-hbar-app-ui-agent-approval-permission'
import { verifyCostApproval } from './verify-hbar-app-ui-agent-approval-cost'
import {
  HBAR_APP_UI_AGENT_APPROVAL_FIXTURES,
  createHbarAppUiAgentApprovalLocalizedFixtures,
} from '../tests/fixtures/hbar-app-ui-agent-approval-fixtures'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5180'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const inlineOnly = process.argv.includes('--inline-only')
const diffOnly = process.argv.includes('--diff-only')
const queueOnly = process.argv.includes('--queue-only')
const permissionOnly = process.argv.includes('--permission-only')
const costOnly = process.argv.includes('--cost-only')
type AgentApprovalFixture = 'overflow' | 'localized'
type GeometryBox = Readonly<{ x: number; y: number; width: number; height: number }>
type GeometryExpectation = Readonly<{
  readonly selector: string
  readonly name: string
  readonly expected: GeometryBox
}>
type GeometryViewport = Readonly<{
  readonly name: 'desktop' | 'mobile'
  readonly width: number
  readonly height: number
  readonly expectations: readonly GeometryExpectation[]
}>

function previewUrl(variant: number, fixture?: AgentApprovalFixture): string {
  const parameters = new URLSearchParams({ variant: `hbar-app-ui-agent-approval-${variant}`, mode: 'isolated' })
  if (fixture) parameters.set('agentApprovalFixture', fixture)
  return `${baseUrl}/?${parameters.toString()}`
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function boxDifference(actual: GeometryBox, expected: GeometryBox): number {
  return Math.max(
    Math.abs(actual.x - expected.x),
    Math.abs(actual.y - expected.y),
    Math.abs(actual.width - expected.width),
    Math.abs(actual.height - expected.height),
  )
}

async function measuredBox(locator: import('@playwright/test').Locator): Promise<GeometryBox> {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return { x: box.x, y: box.y, width: box.width, height: box.height }
  })
}

async function verifyReferenceGeometry(page: import('@playwright/test').Page): Promise<Record<string, number>> {
  /* These values are observations from the captured reference iframe. They are
       assertions only: the implementation remains a flex/normal-flow layout. */
  const layouts: Readonly<Record<number, readonly GeometryViewport[]>> = {
    1: [
      {
        name: 'desktop',
        width: 1192,
        height: 481,
        expectations: [
          {
            name: 'request card',
            selector: '.hbar-app-ui-agent-approval-request-card',
            expected: { x: 212, y: 255.5, width: 768, height: 157.125 },
          },
        ],
      },
      {
        name: 'mobile',
        width: 320,
        height: 481,
        expectations: [
          {
            name: 'request card',
            selector: '.hbar-app-ui-agent-approval-request-card',
            expected: { x: 16, y: 363.75, width: 288, height: 259.375 },
          },
        ],
      },
    ],
    2: [
      {
        name: 'desktop',
        width: 1192,
        height: 561,
        expectations: [
          {
            name: 'diff card',
            selector: '.hbar-app-ui-agent-approval-diff-card',
            expected: { x: 260, y: 144.5, width: 672, height: 327 },
          },
        ],
      },
      {
        name: 'mobile',
        width: 320,
        height: 561,
        expectations: [
          {
            name: 'diff card',
            selector: '.hbar-app-ui-agent-approval-diff-card',
            expected: { x: 16, y: 96.75, width: 288, height: 422.5 },
          },
        ],
      },
    ],
    3: [
      {
        name: 'desktop',
        width: 1192,
        height: 641,
        expectations: [
          {
            name: 'featured queue item',
            selector: '.hbar-app-ui-agent-approval-queue-featured',
            expected: { x: 24, y: 64, width: 1144, height: 155.125 },
          },
          {
            name: 'first queue row',
            selector: '.hbar-app-ui-agent-approval-queue-compact-row',
            expected: { x: 24, y: 225.125, width: 1144, height: 40 },
          },
        ],
      },
      {
        name: 'mobile',
        width: 320,
        height: 641,
        expectations: [
          {
            name: 'featured queue item',
            selector: '.hbar-app-ui-agent-approval-queue-featured',
            expected: { x: 16, y: 64, width: 288, height: 179.125 },
          },
          {
            name: 'first queue row',
            selector: '.hbar-app-ui-agent-approval-queue-compact-row',
            expected: { x: 16, y: 249.125, width: 288, height: 40 },
          },
        ],
      },
    ],
    4: [
      {
        name: 'desktop',
        width: 1192,
        height: 561,
        expectations: [
          {
            name: 'permission card',
            selector: '.hbar-app-ui-agent-approval-card',
            expected: { x: 260, y: 76, width: 672, height: 428.5 },
          },
        ],
      },
      {
        name: 'mobile',
        width: 320,
        height: 561,
        expectations: [
          {
            name: 'permission card',
            selector: '.hbar-app-ui-agent-approval-card',
            expected: { x: 16, y: 72, width: 288, height: 630 },
          },
        ],
      },
    ],
    5: [
      {
        name: 'desktop',
        width: 1192,
        height: 561,
        expectations: [
          {
            name: 'cost card',
            selector: '.hbar-app-ui-agent-approval-card',
            expected: { x: 340, y: 56, width: 512, height: 448 },
          },
        ],
      },
      {
        name: 'mobile',
        width: 320,
        height: 561,
        expectations: [
          {
            name: 'cost card',
            selector: '.hbar-app-ui-agent-approval-card',
            expected: { x: 16, y: -22, width: 288, height: 604 },
          },
        ],
      },
    ],
    6: [
      {
        name: 'desktop',
        width: 1192,
        height: 641,
        expectations: [
          {
            name: 'history search',
            selector: '.hbar-app-ui-agent-approval-search',
            expected: { x: 24, y: 64, width: 320, height: 32 },
          },
          {
            name: 'first history row',
            selector: '.hbar-app-ui-agent-approval-history-pane > ul > li',
            expected: { x: 24, y: 112, width: 1144, height: 57.5 },
          },
        ],
      },
      {
        name: 'mobile',
        width: 320,
        height: 641,
        expectations: [
          {
            name: 'history search',
            selector: '.hbar-app-ui-agent-approval-search',
            expected: { x: 16, y: 56, width: 288, height: 32 },
          },
          {
            name: 'first history row',
            selector: '.hbar-app-ui-agent-approval-history-pane > ul > li',
            expected: { x: 16, y: 144, width: 288, height: 57.5 },
          },
        ],
      },
    ],
  }
  const geometryChecks: Record<string, number> = {}

  for (const [variantText, viewports] of Object.entries(layouts)) {
    const variant = Number(variantText)
    if (inlineOnly && variant !== 1) continue
    if (diffOnly && variant !== 2) continue
    if (queueOnly && variant !== 3) continue
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto(previewUrl(variant), { waitUntil: 'networkidle' })
      for (const expectation of viewport.expectations) {
        const actual = await measuredBox(page.locator(expectation.selector).first())
        const difference = boxDifference(actual, expectation.expected)
        const key = `agent-approval-${variant}-${viewport.name}-${expectation.name}`
        geometryChecks[key] = Number(difference.toFixed(3))
        assert(difference <= 2.5, `${key} drifted ${difference.toFixed(3)}px from captured reference geometry`)
      }
    }
  }

  return geometryChecks
}

async function waitForPreview(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // A locally started preview can need a short interval before binding.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Preview is not reachable at ${baseUrl}`)
}

async function ensurePreview(): Promise<ReturnType<typeof Bun.spawn> | undefined> {
  try {
    await waitForPreview()
    return undefined
  } catch {
    const server = Bun.spawn(['bun', 'run', 'app-ui:preview', '--', '--host', '127.0.0.1'], {
      stdout: 'ignore',
      stderr: 'ignore',
    })
    await waitForPreview()
    return server
  }
}

async function inspectScrollable(
  locator: import('@playwright/test').Locator,
): Promise<{ readonly scrollable: boolean; readonly moved: boolean }> {
  return locator.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    return { scrollable: element.scrollHeight > element.clientHeight, moved: element.scrollTop > 0 }
  })
}

async function settledTextContrast(locator: import('@playwright/test').Locator): Promise<number> {
  return locator.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    )
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')
    if (!context) return 0
    const fill = (color: string) => {
      context.fillStyle = color
      context.fillRect(0, 0, 1, 1)
    }
    const luminance = () => {
      const pixel = context.getImageData(0, 0, 1, 1).data
      const channels = [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0].map((value) => {
        const normalized = value / 255
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
      })
      return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722
    }
    const ancestors: Element[] = []
    for (let current: Element | null = element; current; current = current.parentElement) ancestors.push(current)
    fill('#fff')
    for (const ancestor of ancestors.reverse()) fill(getComputedStyle(ancestor).backgroundColor)
    const background = luminance()
    fill(getComputedStyle(element).color)
    const foreground = luminance()
    return (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05)
  })
}

async function verifyInlineApproval(page: import('@playwright/test').Page): Promise<void> {
  const content = HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.inline
  const localized = createHbarAppUiAgentApprovalLocalizedFixtures().inline
  assert(content && localized, 'Missing host inline approval fixtures')
  for (const width of [1086, 670, 356, 286]) {
    await page.setViewportSize({ width, height: 480 })
    for (const theme of ['dark', 'light']) {
      await page.goto(`${previewUrl(1)}&theme=${theme}`, { waitUntil: 'networkidle' })
      const topShade = page.locator('.hbar-app-ui-agent-approval-scroll-overlay.is-top')
      const bottomShade = page.locator('.hbar-app-ui-agent-approval-scroll-overlay.is-bottom')
      await expect(topShade).toHaveAttribute('data-visible', 'false')
      await expect(bottomShade).toHaveAttribute('data-visible', width <= 356 ? 'true' : 'false')
      const show = page.getByRole('button', { name: content.labels.showRequest, exact: true })
      assert((await show.getAttribute('aria-expanded')) === 'false', 'Request must start collapsed')
      assert((await page.locator('pre').count()) === 0, 'Collapsed request still rendered payload')
      for (const label of [content.labels.showRequest, content.labels.reject, content.labels.approve]) {
        const button = page.getByRole('button', { name: label, exact: true })
        await button.hover()
        assert((await settledTextContrast(button)) >= 4.5, `${theme} ${label} hover lost readable contrast`)
      }
      await show.press('Enter')
      const hide = page.getByRole('button', { name: content.labels.hideRequest, exact: true })
      assert((await hide.getAttribute('aria-expanded')) === 'true', 'Request did not open on Enter')
      assert((await page.locator('pre').textContent()) === content.requestText, 'Request changed the host payload')
      await page.locator('pre').focus()
      assert(
        await page.locator('pre').evaluate((element) => document.activeElement === element),
        'Request payload is missing its keyboard focus entry',
      )
      await expect(topShade).toHaveAttribute('data-visible', 'true')
      await hide.press('Escape')
      assert(
        (await hide.getAttribute('aria-expanded')) === 'true',
        'Escape incorrectly dismisses this inline disclosure',
      )
      for (let index = 0; index < 3; index += 1) await page.keyboard.press('Tab')
      assert(
        await page.locator('pre').evaluate((element) => document.activeElement === element),
        'Tab order did not reach the request payload after both decision buttons',
      )
      if (width <= 356) {
        const payloadScroll = await page.locator('pre').evaluate((element) => {
          element.scrollLeft = element.scrollWidth
          return { moved: element.scrollLeft > 0, preformatted: getComputedStyle(element).whiteSpace === 'pre' }
        })
        assert(
          payloadScroll.preformatted && (width > 286 || payloadScroll.moved),
          'Overflowing request payload must scroll horizontally inside its own frame',
        )
        const pane = await inspectScrollable(page.locator('.hbar-app-ui-agent-approval-inline'))
        assert(pane.scrollable && pane.moved, 'Narrow approval content must scroll inside its bounded pane')
        await expect(bottomShade).toHaveAttribute('data-visible', 'false')
      }
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Inline approval overflowed the outer page',
      )
      await hide.press('Space')
      assert((await page.locator('pre').count()) === 0, 'Space did not collapse request')
      for (const expanded of [false, true]) {
        for (const decision of ['approved', 'rejected'] as const) {
          await page.goto(`${previewUrl(1)}&theme=${theme}`, { waitUntil: 'networkidle' })
          if (expanded) await page.getByRole('button', { name: content.labels.showRequest, exact: true }).click()
          const button = page.getByRole('button', {
            name: decision === 'approved' ? content.labels.approve : content.labels.reject,
            exact: true,
          })
          await button.hover()
          await button.press(decision === 'approved' ? 'Enter' : 'Space')
          const outcome = content.outcomes[decision]
          assert(
            (await page.getByRole('region', { name: content.requestTitle }).count()) === 0,
            'Decision did not replace the entire approval card',
          )
          assert((await page.getByRole('button').count()) === 0, 'Decision left active approval actions behind')
          await expect(bottomShade).toHaveAttribute('data-visible', 'false')
          assert(
            (await page.getByText(outcome.summary, { exact: true }).count()) === 1,
            'Missing visible decision summary',
          )
          const resultRow = await page.locator('.hbar-app-ui-agent-approval-inline-result').evaluate((element) => {
            const summary = element.querySelector('p')
            return {
              height: element.getBoundingClientRect().height,
              whiteSpace: summary && getComputedStyle(summary).whiteSpace,
            }
          })
          assert(
            resultRow.whiteSpace === 'nowrap' && Math.abs(resultRow.height - 23.5) < 1,
            'Decision row must keep the source single-line ellipsis and timestamp alignment',
          )
          assert(
            (await page.locator('[aria-live="polite"]').textContent()) === outcome.announcement,
            'Missing nonvisual decision announcement',
          )
          assert(
            (await page.locator('.hbar-app-ui-agent-approval-inline-follow-up').count()) === (outcome.followUp ? 1 : 0),
            'Decision follow-up did not match host outcome',
          )
        }
      }
    }
  }
  await page.setViewportSize({ width: 286, height: 480 })
  await page.goto(previewUrl(1, 'localized'), { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: localized.labels.showRequest, exact: true }).click()
  assert(
    await page.getByRole('button', { name: localized.labels.hideRequest, exact: true }).isVisible(),
    'Localized disclosure label missing',
  )
  await page.getByRole('button', { name: localized.labels.approve, exact: true }).click()
  assert(
    (await page.getByText(localized.outcomes.approved.summary, { exact: true }).count()) === 1,
    'Localized decision feedback missing',
  )
  assert(
    (await page.getByText(localized.outcomes.approved.followUp ?? '', { exact: true }).count()) === 1,
    'Localized follow-up missing',
  )
}

async function verifyDiffApproval(page: import('@playwright/test').Page): Promise<void> {
  const content = HBAR_APP_UI_AGENT_APPROVAL_FIXTURES.diff
  const localized = createHbarAppUiAgentApprovalLocalizedFixtures().diff
  assert(content && localized, 'Missing host diff fixtures')
  const labels = {
    approved: content.labels.approve,
    rejected: content.labels.reject,
    'always-allow': content.labels.alwaysAllow,
  }
  for (const width of [1086, 670, 356, 286]) {
    await page.setViewportSize({ width, height: 560 })
    for (const theme of ['dark', 'light']) {
      const url = `${previewUrl(2)}&theme=${theme}`
      await page.goto(url, { waitUntil: 'networkidle' })
      await expect(page.getByRole('banner')).toHaveCount(1)
      await expect(page.locator('dl > div')).toHaveCount(3)
      await expect(page.locator('pre')).toHaveCount(0)
      const show = page.getByRole('button', { name: content.labels.showDiff, exact: true })
      await expect(show).toHaveAttribute('aria-expanded', 'false')
      for (const name of [content.labels.showDiff, ...Object.values(labels)]) {
        const button = page.getByRole('button', { name, exact: true })
        await button.hover()
        assert((await settledTextContrast(button)) >= 4.5, `${theme} ${name} hover lost contrast`)
      }
      await show.press('Enter')
      const hide = page.getByRole('button', { name: content.labels.hideDiff, exact: true })
      await expect(hide).toHaveAttribute('aria-expanded', 'true')
      await expect(page.locator('dl > div')).toHaveCount(3)
      assert((await page.locator('pre').textContent()) === content.diffText, 'Diff payload changed host data')
      await hide.press('Escape')
      await expect(page.locator('pre')).toHaveCount(1)
      for (let index = 0; index < 4; index += 1) await page.keyboard.press('Tab')
      assert(
        await page.locator('pre').evaluate((element) => document.activeElement === element),
        'Expanded diff is missing its Tab entry after the three decisions',
      )
      await page.locator('pre').press('End')
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Diff expanded beyond outer page',
      )
      await hide.press('Space')
      await expect(page.locator('pre')).toHaveCount(0)
      await expect(page.locator('dl > div')).toHaveCount(3)
      for (const expanded of [false, true]) {
        for (const decision of ['approved', 'rejected', 'always-allow'] as const) {
          await page.goto(url, { waitUntil: 'networkidle' })
          if (expanded) await page.getByRole('button', { name: content.labels.showDiff, exact: true }).click()
          await page
            .getByRole('button', { name: labels[decision], exact: true })
            .press(decision === 'approved' ? 'Enter' : 'Space')
          const outcome = content.outcomes[decision]
          await expect(page.getByRole('region', { name: content.title })).toHaveCount(1)
          await expect(page.locator('dl > div')).toHaveCount(3)
          await expect(page.getByRole('button')).toHaveCount(0)
          await expect(page.locator('pre')).toHaveCount(0)
          await expect(page.locator('.hbar-app-ui-agent-approval-diff-status')).toHaveText(outcome.status)
          await expect(page.locator('.hbar-app-ui-agent-approval-diff-result')).toHaveText(outcome.summary)
          await expect(page.locator('[aria-live="polite"]')).toHaveText(outcome.announcement)
          assert(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            'Diff outcome overflowed outer page',
          )
        }
      }
    }
  }
  await page.setViewportSize({ width: 286, height: 560 })
  await page.goto(previewUrl(2, 'localized'), { waitUntil: 'networkidle' })
  const localizedButtons = await page.getByRole('button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect()
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
    }),
  )
  assert(
    localizedButtons.every((box, index) =>
      localizedButtons
        .slice(index + 1)
        .every(
          (other) =>
            Math.min(box.right, other.right) <= Math.max(box.left, other.left) ||
            Math.min(box.bottom, other.bottom) <= Math.max(box.top, other.top),
        ),
    ),
    'Long localized actions overlap another hit target',
  )
  await page.getByRole('button', { name: localized.labels.showDiff, exact: true }).click()
  await expect(page.getByRole('button', { name: localized.labels.hideDiff, exact: true })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await page.getByRole('button', { name: localized.labels.alwaysAllow, exact: true }).click()
  await expect(page.locator('.hbar-app-ui-agent-approval-diff-result')).toHaveText(
    localized.outcomes['always-allow'].summary,
  )
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Long localized result overflowed the page',
  )
  await page.goto(previewUrl(2, 'overflow'), { waitUntil: 'networkidle' })
  await expect(page.locator('dl > div')).toHaveCount(13)
  const pane = await inspectScrollable(page.locator('.hbar-app-ui-agent-approval-diff-scroll'))
  assert(pane.scrollable && pane.moved, 'Over-bound diff rows must grow inside the pane scroll owner')
  await page.getByRole('button', { name: content.labels.approve, exact: true }).click()
  await expect(page.locator('dl > div')).toHaveCount(13)
  await expect(page.locator('.hbar-app-ui-agent-approval-diff-result')).toHaveText(content.outcomes.approved.summary)
}

async function run(): Promise<void> {
  const server = await ensurePreview()
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1192, height: 640 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  try {
    if (costOnly) {
      await verifyCostApproval(page, baseUrl)
      assert(pageErrors.length === 0, `Cost preview errors: ${pageErrors.join(' | ')}`)
      return
    }
    if (permissionOnly) {
      await verifyPermissionApproval(page, baseUrl)
      assert(pageErrors.length === 0, `Permission preview errors: ${pageErrors.join(' | ')}`)
      return
    }
    const geometryChecks = await verifyReferenceGeometry(page)
    if (queueOnly) {
      await verifyQueueApproval(page, baseUrl)
      assert(pageErrors.length === 0, `Queue approval preview errors: ${pageErrors.join(' | ')}`)
      console.log(
        JSON.stringify({
          queueMixedDecisionJourneys: 2,
          layoutBoundaries: ['desktop-dark', 'stress-light'],
          localizedHostCopy: true,
          geometryChecks,
          pageErrors,
        }),
      )
      return
    }
    if (!diffOnly) await verifyInlineApproval(page)
    if (!inlineOnly) await verifyDiffApproval(page)
    if (diffOnly) {
      assert(pageErrors.length === 0, `Diff approval preview errors: ${pageErrors.join(' | ')}`)
      console.log(
        JSON.stringify({
          diffDisclosureAndThreeDecisions: true,
          pairedCanvasSizes: 4,
          themes: 2,
          localizedHostCopy: true,
          geometryChecks,
          pageErrors,
        }),
      )
      return
    }
    if (inlineOnly) {
      assert(pageErrors.length === 0, `Inline approval preview errors: ${pageErrors.join(' | ')}`)
      console.log(
        JSON.stringify({
          inlineDisclosureAndDecisions: true,
          pairedCanvasSizes: 4,
          themes: 2,
          localizedHostCopy: true,
          geometryChecks,
          pageErrors,
        }),
      )
      return
    }
    await page.setViewportSize({ width: 1192, height: 640 })

    await page.goto(previewUrl(1), { waitUntil: 'networkidle' })
    const inlineToggle = page.getByRole('button', { name: 'Show request', exact: true })
    assert((await inlineToggle.getAttribute('aria-expanded')) === 'false', 'Inline approval did not start collapsed')
    await inlineToggle.click()
    assert(
      (await page.getByRole('button', { name: 'Hide request', exact: true }).getAttribute('aria-expanded')) === 'true',
      'Inline approval request did not toggle',
    )
    await page.getByRole('button', { name: 'Delete 12 projects', exact: true }).click()

    await page.goto(previewUrl(2), { waitUntil: 'networkidle' })
    const diffToggle = page.getByRole('button', { name: 'Show diff', exact: true })
    assert(
      (await diffToggle.getAttribute('aria-expanded')) === 'false',
      'Diff approval did not start with its payload collapsed',
    )
    await diffToggle.click()
    assert(
      (await page.getByRole('button', { name: 'Hide diff', exact: true }).getAttribute('aria-expanded')) === 'true',
      'Diff approval did not reveal its payload',
    )
    assert((await page.locator('dl > div').count()) === 3, 'Diff disclosure hid the summary rows')
    await page.getByRole('button', { name: 'Approve', exact: true }).click()

    await page.goto(previewUrl(3), { waitUntil: 'networkidle' })
    const queueApprove = page.getByRole('button', { name: 'Approve', exact: true }).first()
    await queueApprove.click()
    await expect(page.locator('header')).toContainText('2 waiting')
    await expect(page.locator('[data-hbar-app-ui-item-id="refund"]')).toHaveAttribute(
      'data-hbar-app-ui-state',
      'approved',
    )

    await page.goto(previewUrl(4), { waitUntil: 'networkidle' })
    const scope = page.locator('label').filter({ hasText: 'Read customer records' }).locator('input[type="checkbox"]')
    assert(await scope.isChecked(), 'Permission scope did not use host-provided checked state')
    await scope.uncheck()
    assert(!(await scope.isChecked()), 'Permission scope did not toggle')
    await page.getByRole('button', { name: 'Approve', exact: true }).click()

    await page.goto(previewUrl(5), { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Approve', exact: true }).click()
    assert(
      await page.getByRole('button', { name: 'Approve', exact: true }).isDisabled(),
      'Cost approval did not settle the decision',
    )

    await page.goto(previewUrl(6), { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: 'Skipped', exact: true }).click()
    assert(
      (await page.locator('.hbar-app-ui-agent-approval-history-pane > ul > li').count()) === 3,
      'Approval history filter did not narrow entries',
    )
    const search = page.getByRole('textbox', { name: 'Search history', exact: true })
    await search.fill('production API token')
    assert(
      (await page.getByText('Rotated the production API token', { exact: true }).count()) === 1,
      'Approval history search did not preserve host content',
    )

    const overflowChecks: Record<string, { readonly scrollable: boolean; readonly moved: boolean }> = {}
    const overflowSelectors = [
      [2, '.hbar-app-ui-agent-approval-diff-scroll'],
      [3, '.hbar-app-ui-agent-approval-queue-pane'],
      [4, '.hbar-app-ui-agent-approval-centered-body'],
      [6, '.hbar-app-ui-agent-approval-history-pane'],
    ] as const
    for (const [variant, selector] of overflowSelectors) {
      await page.goto(previewUrl(variant, 'overflow'), { waitUntil: 'networkidle' })
      const result = await inspectScrollable(page.locator(selector))
      overflowChecks[`agent-approval-${variant}`] = result
      assert(result.scrollable && result.moved, `Agent approval ${variant} did not expose declared overflow behavior`)
    }

    await page.setViewportSize({ width: 320, height: 640 })
    const narrowOverflow: Record<string, boolean> = {}
    for (let variant = 1; variant <= 6; variant += 1) {
      await page.goto(previewUrl(variant, variant === 1 || variant === 6 ? 'localized' : undefined), {
        waitUntil: 'networkidle',
      })
      const noHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      )
      narrowOverflow[`agent-approval-${variant}`] = noHorizontalOverflow
      assert(noHorizontalOverflow, `Narrow agent-approval-${variant} layout overflowed horizontally`)
    }

    await page.goto(previewUrl(1, 'localized'), { waitUntil: 'networkidle' })
    assert(
      (await page
        .getByText('Zwölf archivierte Projekte und ihre Build-Historie dauerhaft löschen', { exact: true })
        .count()) === 1,
      'Localized inline approval copy was not rendered from the host bundle',
    )
    await page.goto(previewUrl(6, 'localized'), { waitUntil: 'networkidle' })
    assert(
      (await page.getByText('Genehmigungsverlauf für diesen Arbeitsbereich', { exact: true }).count()) === 1,
      'Localized approval history copy was not rendered from the host bundle',
    )

    assert(pageErrors.length === 0, `Agent approval preview reported page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({
        inlineToggle: true,
        diffDisclosure: true,
        queueDecision: true,
        permissionScope: true,
        costDecision: true,
        historyFilterSearch: true,
        overflowChecks,
        narrowOverflow,
        localizedHostCopy: true,
        geometryChecks,
        pageErrors: pageErrors.length,
      }),
    )
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
