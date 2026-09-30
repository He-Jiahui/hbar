import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

type PaywallVariant = 1 | 2 | 3 | 4 | 5 | 6 | 7
type FixtureKey = 'paywall3Fixture' | 'paywall7Fixture'

interface RouteOptions {
  readonly isolated?: boolean
  readonly fixture?: readonly [FixtureKey, string]
}

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const output = 'artifacts/paywall-reference-core-review'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function url(variant: PaywallVariant, options: RouteOptions = {}): string {
  const parameters = new URLSearchParams({ variant: `hbar-app-ui-paywall-${variant}`, theme: 'light' })
  if (options.isolated !== false) parameters.set('mode', 'isolated')
  if (options.fixture) parameters.set(options.fixture[0], options.fixture[1])
  return `${baseUrl}/?${parameters}`
}

async function waitForPreview(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return
    } catch {
      // The production preview may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Paywall preview is not reachable at ${baseUrl}`)
}

async function openVariant(page: Page, variant: PaywallVariant, options: RouteOptions = {}): Promise<Locator> {
  await page.goto(url(variant, options), { waitUntil: 'networkidle' })
  const panel = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-paywall-${variant}"]`)
  await expect(panel).toHaveCount(1)
  return panel
}

async function expectNoPageOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}

await waitForPreview()
await mkdir(output, { recursive: true })

const browser = await chromium.launch({ headless: true, executablePath })
const page = await browser.newPage({ viewport: { width: 1086, height: 760 } })
const browserErrors: string[] = []
page.on('pageerror', (error) => browserErrors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') browserErrors.push(message.text())
})

try {
  // Mount each source structure once; targeted state and narrow-flow checks follow below.
  const structures: readonly {
    readonly variant: PaywallVariant
    readonly selector: string
    readonly count: number
  }[] = [
    { variant: 1, selector: '.hbar-app-ui-paywall-article', count: 1 },
    { variant: 2, selector: '[data-paywall2-feature-id]', count: 3 },
    { variant: 3, selector: '[data-paywall3-plan-id]', count: 3 },
    { variant: 4, selector: '[data-paywall4-meter-id]', count: 3 },
    { variant: 5, selector: '[data-paywall5-row-id]', count: 4 },
    { variant: 6, selector: '[data-paywall6-segment-id][data-used="true"]', count: 3 },
    { variant: 7, selector: '[data-paywall7-recipient-id]', count: 2 },
  ]

  for (const structure of structures) {
    const panel = await openVariant(page, structure.variant)
    await expect(panel.locator(structure.selector)).toHaveCount(structure.count)
    await expectNoPageOverflow(page)

    if (structure.variant === 1) {
      await page.screenshot({ path: `${output}/article-lock-desktop.png`, fullPage: true })
    }
  }

  // Billing period remains a controlled preview choice; it changes both plan prices and notes.
  const plans = await openVariant(page, 3)
  const pro = plans.locator('[data-paywall3-plan-id="pro"]')
  const scale = plans.locator('[data-paywall3-plan-id="scale"]')
  const proAction = pro.getByRole('button', { name: 'Choose Pro', exact: true })
  await expect(pro.getByText('$19', { exact: true })).toHaveCount(1)
  await expect(scale.getByText('$54', { exact: true })).toHaveCount(1)
  await expect(plans.locator('[data-paywall3-period-note]')).toHaveText(
    'Yearly billing saves 20 percent and is charged once per year.',
  )
  await expect(proAction).toHaveAttribute('data-lumen-variant', 'solid')
  await expect(proAction).toHaveAttribute('data-tone', 'primary')
  await page.screenshot({ path: `${output}/plans-desktop.png`, fullPage: true })

  await plans.getByRole('tab', { name: 'Monthly', exact: true }).click()
  await expect(pro.getByText('$24', { exact: true })).toHaveCount(1)
  await expect(scale.getByText('$68', { exact: true })).toHaveCount(1)
  await expect(plans.locator('[data-paywall3-period-note]')).toHaveText(
    'Monthly billing, cancel before the next renewal.',
  )
  await plans.getByRole('tab', { name: 'Yearly', exact: true }).press('Enter')
  await expect(pro.getByText('$19', { exact: true })).toHaveCount(1)
  await expect(scale.getByText('$54', { exact: true })).toHaveCount(1)
  await expect(plans.locator('[data-paywall3-period-note]')).toHaveText(
    'Yearly billing saves 20 percent and is charged once per year.',
  )

  // One narrow plan-list check: cards wrap into a vertical flow without page overflow.
  await page.setViewportSize({ width: 320, height: 560 })
  const wrappingPlans = await plans.locator('[data-paywall3-plan-id]').evaluateAll((cards) => {
    const bounds = cards.map((card) => card.getBoundingClientRect())
    return (
      bounds.length === 3 &&
      bounds.every((rect, index) => {
        const previous = bounds[index - 1]
        return (
          rect.left >= 0 &&
          rect.right <= window.innerWidth + 1 &&
          (index === 0 || (previous !== undefined && rect.top >= previous.bottom))
        )
      })
    )
  })
  expect(wrappingPlans).toBe(true)
  await expectNoPageOverflow(page)

  // Native email validation prevents an invalid Enter; one valid Enter produces only a host request.
  const reader = await openVariant(page, 6, { isolated: false })
  const readerUrl = page.url()
  const email = reader.getByRole('textbox', { name: 'Email address', exact: true })
  const readerEvents = page.locator('.hbar-app-ui-preview-events li')
  expect(await email.getAttribute('required')).toBeNull()
  await email.fill('not-an-address')
  expect(await email.evaluate((element) => (element as HTMLInputElement).validity.typeMismatch)).toBe(true)
  await email.press('Enter')
  await expect(readerEvents).toHaveCount(0)

  await email.fill('reader@example.invalid')
  await email.press('Enter')
  await expect(readerEvents).toHaveCount(1)
  await expect(readerEvents.first().locator('code')).toHaveText('request-keep-reading')
  await expect(readerEvents.first()).toContainText('reader@example.invalid')
  await expect(readerEvents.first()).toContainText('delivery-and-subscription-unverified')
  await expect(email).toHaveValue('reader@example.invalid')
  await expect(reader.locator('[data-paywall6-segment-id][data-used="true"]')).toHaveCount(3)
  expect(page.url()).toBe(readerUrl)

  // Edit one admin-request note and verify the exact targets and note in the local event inspector.
  const adminGate = await openVariant(page, 7, { isolated: false })
  const adminGateUrl = page.url()
  const note = adminGate.getByRole('textbox', { name: 'Why do you need it?', exact: true })
  const submittedNote = 'Local request fixture, not a delivered message.'
  await note.fill(submittedNote)
  await expect(note).toHaveValue(submittedNote)
  await adminGate.locator('[data-paywall7-send]').click()

  const adminEvent = page.locator('.hbar-app-ui-preview-events li').filter({ hasText: 'request-admin-upgrade' })
  await expect(adminEvent).toHaveCount(1)
  const adminEventText = await adminEvent.innerText()
  expect(adminEventText).toContain(submittedNote)
  expect(adminEventText).toContain('priya-nandakumar')
  expect(adminEventText).toContain('marcus-bell')
  expect(adminEventText).toContain('delivery-and-upgrade-unverified')
  await expect(note).toHaveValue(submittedNote)
  await expect(adminGate.getByText('Northwind is on Pro · you do not manage billing', { exact: true })).toHaveCount(1)
  expect(page.url()).toBe(adminGateUrl)

  // One long-copy narrow sample verifies the note and send action remain reachable.
  await page.setViewportSize({ width: 320, height: 520 })
  const longAdminGate = await openVariant(page, 7, {
    fixture: ['paywall7Fixture', 'long'],
  })
  const longNote = longAdminGate.locator('textarea')
  expect((await longNote.inputValue()).length).toBeGreaterThan(80)
  const sendRequest = longAdminGate.locator('[data-paywall7-send]')
  await sendRequest.scrollIntoViewIfNeeded()
  await expect(sendRequest).toBeInViewport()
  await expectNoPageOverflow(page)
  await page.screenshot({ path: `${output}/admin-request-long-copy-narrow.png`, fullPage: true })

  expect(browserErrors).toEqual([])
  console.log(
    'Paywall 1–7 practical core passed: seven source structures, controlled plan-period prices and notes, native email validation and one request-only Enter intent, retained admin note with stable target IDs, and two narrow-flow checks. No exhaustive theme/viewport/button matrix or external subscription, sign-in, or delivery is claimed.',
  )
} finally {
  await browser.close()
}
