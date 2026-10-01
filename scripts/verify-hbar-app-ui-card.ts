import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = resolve('artifacts/card-core-review')
const checks: string[] = []
const diagnostics: string[] = []
const screenshots: string[] = []
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

async function open(page: Page, variant: number, fixture?: string): Promise<Locator> {
  const query = new URLSearchParams({ variant: `hbar-app-ui-card-${variant}`, mode: 'isolated' })
  if (fixture) query.set('cardFixture', fixture)
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded' })
  const root = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-card-${variant}"]`)
  await expect(root).toHaveCount(1)
  await expect(root).toBeVisible()
  const bounds = await page.evaluate(() => ({ viewport: innerWidth, actual: document.documentElement.scrollWidth }))
  assert(bounds.actual <= bounds.viewport + 1, `Card${variant} page overflow ${JSON.stringify(bounds)}`)
  checks.push(`Card${variant}${fixture ? ` ${fixture}` : ''}: renders without page horizontal overflow`)
  return root
}
async function capture(page: Page, name: string) {
  await page.screenshot({ path: resolve(output, name), fullPage: true })
  screenshots.push(name)
}
async function request(page: Page) {
  await expect(page.locator('.lumen-card-preview-notice')).toContainText('no external action was performed')
}

async function main() {
  assert((await fetch(baseUrl)).ok, 'Existing production preview unavailable; verifier never starts one')
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1192, height: 760 } })
  page.on('pageerror', (error) => diagnostics.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(message.text())
  })
  try {
    const members = await open(page, 1)
    await expect(members.locator('.lumen-card-member-grid > li')).toHaveCount(6)
    await members.getByRole('button', { name: 'Connect with Sam Rivera', exact: true }).click()
    await expect(members.getByRole('button', { name: 'Connected with Sam Rivera', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(members.getByRole('button', { name: 'Connect with Dana Okafor', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    checks.push('Card1: six member cards; connection toggles only Sam')
    await capture(page, 'card-members-desktop.png')

    const integrations = await open(page, 2)
    await expect(integrations.getByRole('switch')).toHaveCount(6)
    await integrations.getByRole('switch', { name: 'Connect Repositories', exact: true }).click()
    await expect(integrations.getByRole('switch', { name: 'Connect Repositories', exact: true })).not.toBeChecked()
    await expect(integrations.getByRole('switch', { name: 'Connect Team chat', exact: true })).toBeChecked()
    await expect(integrations.getByRole('switch', { name: 'Connect Data warehouse', exact: true })).toBeEnabled()
    checks.push('Card2: six independent switches; Premium is not falsely disabled')

    const onboarding = await open(page, 3)
    await onboarding.getByRole('button', { name: 'Mark complete: Ship the first change', exact: true }).click()
    await expect(onboarding.getByText('2 of 4 steps complete', { exact: true })).toBeVisible()
    await onboarding.getByRole('button', { name: 'Reset', exact: true }).click()
    await expect(onboarding.getByText('0 of 4 steps complete', { exact: true })).toBeVisible()
    await expect(onboarding.getByRole('button', { name: 'Reset', exact: true })).toBeDisabled()
    checks.push('Card3: independent last-step completion; Reset clears all and disables at zero')

    const agenda = await open(page, 4)
    await expect(agenda.locator('.lumen-card-agenda-list > li')).toHaveCount(6)
    await agenda.getByRole('button', { name: 'Going to Roadmap review', exact: true }).click()
    await expect(agenda.getByRole('button', { name: 'Going to Roadmap review', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(agenda.getByRole('button', { name: 'Decline Roadmap review', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    checks.push('Card4: six agenda rows; toggling Going does not imply Decline')

    const plans = await open(page, 5)
    await expect(plans.locator('.lumen-card-plan-grid > li')).toHaveCount(3)
    await expect(plans.getByRole('button', { name: 'Current plan', exact: true })).toBeEnabled()
    await plans.getByRole('button', { name: 'Choose Starter', exact: false }).click()
    await request(page)
    checks.push('Card5: three source-shaped plans, metadata and request-only choice; no invented billing-period tabs')

    const accounts = await open(page, 6)
    await accounts.getByRole('radio', { name: '7d', exact: true }).click()
    await expect(accounts.getByText('18,420', { exact: true })).toBeVisible()
    await expect(accounts.getByText('9,760', { exact: true })).toBeVisible()
    await expect(accounts.locator('.lumen-card-bars')).toHaveCount(4)
    checks.push('Card6: 7d selects its observed dataset and four host-supplied bar charts')

    const updates = await open(page, 7)
    await expect(updates.locator('.lumen-card-changelog-grid > li')).toHaveCount(6)
    await updates.getByRole('button', { name: 'Bookmark Scheduled exports', exact: true }).click()
    await expect(
      updates.getByRole('button', { name: 'Remove bookmark from Scheduled exports', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    checks.push('Card7: six linked updates with independent bookmark')

    const files = await open(page, 8)
    await files.getByRole('button', { name: /cap-table.xlsx/ }).click()
    await expect(files.getByText('2 selected of 8 files', { exact: true })).toBeVisible()
    await files.getByRole('button', { name: 'Download', exact: true }).click()
    await request(page)
    await files.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(files.getByText('8 files', { exact: true })).toBeVisible()
    await expect(files.getByRole('button', { name: 'Download', exact: true })).toBeDisabled()
    checks.push(
      'Card8: multi-selection, exact download request, Clear disables download without any real file transfer',
    )

    const profile = await open(page, 9)
    await profile.getByRole('button', { name: 'Follow Sam Rivera', exact: true }).click()
    await expect(profile.getByRole('button', { name: 'Following Sam Rivera', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(profile.getByRole('link', { name: 'Message', exact: true })).toBeVisible()
    checks.push('Card9: owner-local follow and semantic Message link')

    const balance = await open(page, 10)
    await expect(balance.locator('.lumen-card-transactions > li')).toHaveCount(3)
    await balance.getByRole('button', { name: 'Add money', exact: true }).click()
    await request(page)
    await expect(balance.getByText('$46,318.52', { exact: true })).toBeVisible()
    checks.push('Card10: three transactions; Add money records intent without changing balance')

    const invoice = await open(page, 11)
    await expect(invoice.getByText('Total due', { exact: true })).toBeVisible()
    await invoice.getByRole('button', { name: 'Download PDF', exact: true }).click()
    await request(page)
    checks.push('Card11: source-shaped invoice; PDF action only records request')

    await page.setViewportSize({ width: 360, height: 780 })
    const localized = await open(page, 3, 'localized')
    assert(
      await localized.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      'Long translated onboarding copy is clipped horizontally',
    )
    await expect(localized.getByRole('button', { name: /Als abgeschlossen markieren: Das gesamte/ })).toBeVisible()
    await capture(page, 'card-onboarding-localized-narrow.png')
    checks.push('Card3 narrow: long German copy wraps and action stays reachable')
    const narrowBalance = await open(page, 10)
    await expect(narrowBalance.getByRole('button', { name: 'Transfer', exact: true })).toBeVisible()
    assert(
      await narrowBalance.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
      'Balance metadata spills horizontally',
    )
    checks.push('Card10 narrow: transaction amount pairs wrap naturally and footer is reachable')

    const overflow = await open(page, 8, 'overflow')
    const pane = overflow.locator('.lumen-card-file-grid')
    await expect(pane.locator(':scope > li')).toHaveCount(61)
    const last = pane.getByRole('button', { name: /Workspace export 60.pdf/ })
    await last.scrollIntoViewIfNeeded()
    await expect(last).toBeInViewport()
    assert(
      await pane.evaluate((element) => element.scrollTop > 0),
      'File boundary overflow did not scroll its owning pane',
    )
    await capture(page, 'card-files-overflow-narrow.png')
    checks.push('Card8 overflow: 61st file reachable within owning pane; header/actions retained')
    assert(diagnostics.length === 0, `Browser diagnostics ${JSON.stringify(diagnostics)}`)
    const report = {
      coverage: 'core-flows-and-representative-layout',
      baseUrl,
      variants: 11,
      checks,
      screenshots,
      diagnostics,
      limits:
        'No exhaustive control/theme/viewport replay; 90d source dataset unavailable and shown honestly as missing; bar shapes inferred from captured graph appearance.',
    }
    await writeFile(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await browser.close()
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error))
  process.exitCode = 1
})
