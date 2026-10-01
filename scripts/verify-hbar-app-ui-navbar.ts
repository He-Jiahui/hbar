import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import {
  createHbarAppUiNavbarLocalizedFixtures,
  createHbarAppUiNavbarOverflowFixtures,
  HBAR_APP_UI_NAVBAR_FIXTURES,
} from '../tests/fixtures/hbar-app-ui-navbar-fixtures'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const artifactDirectory = resolve('artifacts/navbar-core-review')
const defaultViewport = { width: 1192, height: 760 }
const narrowViewport = { width: 360, height: 844 }

type NavbarFixture = 'overflow' | 'localized'

const diagnostics: { variant: number; message: string }[] = []
const checks: string[] = []
let currentVariant = 0

function previewUrl(variant: number, fixture?: NavbarFixture): string {
  const query = new URLSearchParams({
    variant: `hbar-app-ui-navbar-${variant}`,
    mode: 'isolated',
  })
  if (fixture) query.set('navbarFixture', fixture)
  return `${baseUrl}/?${query}`
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function pushDiagnostic(variant: number, message: string): void {
  diagnostics.push({ variant, message })
}

async function waitForExistingPreview(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // The preview is intentionally owned by the caller; this verifier never starts it.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error(`Preview is not reachable at ${baseUrl}; start it separately before verification.`)
}

function rootFor(page: Page, variant: number): Locator {
  return page.locator(`[data-hbar-app-ui-component="hbar-app-ui-navbar-${variant}"]`)
}

async function checkHorizontalOverflow(page: Page, context: string): Promise<void> {
  const widths = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  const contentWidth = Math.max(widths.document, widths.body)
  assert(contentWidth <= widths.viewport + 1, `${context} introduced horizontal overflow: ${JSON.stringify(widths)}`)
  checks.push(`${context}: no horizontal page overflow`)
}

async function openVariant(page: Page, variant: number, fixture?: NavbarFixture): Promise<Locator> {
  currentVariant = variant
  await page.goto(previewUrl(variant, fixture), { waitUntil: 'domcontentloaded' })
  const root = rootFor(page, variant)
  await expect(root).toHaveCount(1)
  await expect(root).toBeVisible()
  await expect(root.locator('header')).toHaveCount(1)
  await expect(root.locator('main')).toHaveCount(1)
  await checkHorizontalOverflow(page, `navbar-${variant}${fixture ? ` ${fixture}` : ''}`)
  return root
}

async function expectPreviewRequest(page: Page, variant: number): Promise<void> {
  const ownerId = `navbar-preview-hbar-app-ui-navbar-${variant}`
  const notice = page.locator(`[data-hbar-preview-owner="${ownerId}"] p[role="status"]`)
  await expect(notice).toHaveCount(1)
  await expect(notice).toBeVisible()
  await expect(notice).toContainText(/Preview request recorded|Vorschau/i)
  await expect(notice).toContainText(/no external action|keine externe Aktion/i)
}

async function capture(page: Page, name: string): Promise<string> {
  const path = resolve(artifactDirectory, name)
  await page.screenshot({ path, fullPage: true })
  return path
}

async function inspectPaneScroll(
  pane: Locator,
  expectedRows: number,
  lastText: string,
): Promise<{ readonly rowCount: number; readonly lastReachable: boolean; readonly scrollTop: number }> {
  const rows = pane.locator('ol > li')
  await expect(rows).toHaveCount(expectedRows)
  const last = rows.last()
  await last.scrollIntoViewIfNeeded()
  await expect(last).toBeInViewport()
  await expect(last).toContainText(lastText)
  const scrollTop = await pane.evaluate((element) => element.scrollTop)
  assert(scrollTop > 0, 'The final overflow row did not move its owning pane')
  return { rowCount: await rows.count(), lastReachable: true, scrollTop }
}

async function verifyVariant1(_page: Page, root: Locator): Promise<void> {
  const project = HBAR_APP_UI_NAVBAR_FIXTURES.projectBoard
  if (!project) throw new Error('Navbar project-board fixture is missing')
  const discussion = root
    .getByRole('tab')
    .filter({ hasText: /Discussion|Open threads/ })
    .first()
  await expect(discussion).toBeVisible()
  await discussion.click()
  await expect(discussion).toHaveAttribute('aria-selected', 'true')
  await expect(root.getByRole('heading', { name: 'Open threads', exact: true })).toBeVisible()
  await expect(root.getByText('Payment retries', { exact: true })).toBeVisible()
  const star = root.getByRole('checkbox', { name: 'Add to starred', exact: true })
  await star.click()
  await expect(root.getByRole('checkbox', { name: 'Remove from starred', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  checks.push('navbar-1: Discussion tab reveals Open threads with Payment retries; star toggles to Remove from starred')
  assert(project.labels.discussion.length > 0, 'Navbar project discussion label is empty')
}

async function verifyVariant2(page: Page, root: Locator): Promise<void> {
  const task = HBAR_APP_UI_NAVBAR_FIXTURES.taskList
  if (!task) throw new Error('Navbar task-list fixture is missing')
  const payment = task.rows.find(({ id }) => id === 'payment-retries')
  if (!payment) throw new Error('Navbar task-list fixture has no payment-retries row')
  const paymentRow = root.locator('main li').filter({ hasText: payment.title }).getByRole('button')
  await expect(paymentRow).toHaveCount(1)
  await paymentRow.click()
  await expectPreviewRequest(page, 2)
  checks.push(`navbar-2: open intent targets ${payment.id}`)
}

async function verifyVariant3(_page: Page, root: Locator): Promise<void> {
  const workspace = root.getByRole('button', { name: 'Choose organisation', exact: true })
  await workspace.click()
  const menu = root.getByRole('menu', { name: 'Choose organisation', exact: true })
  await expect(menu).toBeVisible()
  await menu.getByText('Cedar Labs', { exact: true }).click()
  await expect(
    root.locator('.hbar-app-ui-navbar-deployment-path').getByText('Cedar Labs', { exact: true }),
  ).toBeVisible()
  await expect(root.getByText(/Cedar Labs.*production deployment/, { exact: false })).toBeVisible()
  checks.push('navbar-3: workspace menu selects Cedar Labs and updates its local summary')
}

async function verifyVariant4(page: Page, root: Locator): Promise<void> {
  const product = root.getByRole('button', { name: 'Product', exact: true })
  await product.click()
  const menu = root.getByRole('menu', { name: 'Product', exact: true })
  await expect(menu).toBeVisible()
  await menu.getByText('Security', { exact: true }).click()
  await expect(menu).toBeHidden()
  await expectPreviewRequest(page, 4)
  checks.push('navbar-4: Product popup opens and Security selection closes locally')
}

async function verifyVariant5(page: Page, root: Locator): Promise<void> {
  const landing = HBAR_APP_UI_NAVBAR_FIXTURES.landingSecondary
  if (!landing) throw new Error('Navbar secondary-landing fixture is missing')
  const navigation = root.getByRole('navigation', { name: landing.brand, exact: true })
  const docs = landing.navItems.find((item) => item === 'Docs')
  if (!docs) throw new Error('Navbar secondary-landing fixture has no Docs navigation item')
  await navigation.getByRole('button', { name: docs, exact: true }).click()
  await expectPreviewRequest(page, 5)
  checks.push(`navbar-5: ${docs} navigation is request-only`)
}

async function verifyVariant6(_page: Page, root: Locator): Promise<void> {
  const activity = HBAR_APP_UI_NAVBAR_FIXTURES.activity
  if (!activity) throw new Error('Navbar activity fixture is missing')
  const query = root.getByRole('textbox', { name: `Search ${activity.brand}`, exact: true })
  await query.fill('billing')
  await expect(query).toHaveValue('billing')
  await expect(root.getByText('RESULTS', { exact: true })).toBeVisible()
  await expect(root.getByRole('button', { name: 'Billing retry policy', exact: true })).toBeVisible()
  await expect(root.locator('main ol > li')).toHaveCount(4)
  await expect(root.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
  checks.push(
    'navbar-6: Search keeps the draft and exposes the supplied Billing retry policy result without filtering Today',
  )
}

async function verifyVariant7(_page: Page, root: Locator): Promise<void> {
  const analytics = HBAR_APP_UI_NAVBAR_FIXTURES.analytics
  if (!analytics) throw new Error('Navbar analytics fixture is missing')
  const customers = root.getByRole('tab', { name: 'Customers', exact: true })
  await customers.click()
  await expect(customers).toHaveAttribute('aria-selected', 'true')
  await root.getByRole('button', { name: 'Accounts', exact: true }).click()
  await expect(root.getByRole('heading', { name: 'Customers · Accounts', exact: true })).toBeVisible()
  await root.getByRole('button', { name: 'Segments', exact: true }).click()
  await expect(root.getByRole('heading', { name: 'Customers · Segments', exact: true })).toBeVisible()
  checks.push('navbar-7: Customers selects Accounts and Segments while the heading follows the active pair')
  assert(analytics.primaryTabs.includes('Customers'), 'Navbar analytics fixture has no Customers tab')
}

async function verifyVariant8(_page: Page, root: Locator): Promise<void> {
  const all = root.getByRole('tab', { name: 'All 248', exact: true })
  await all.click()
  await expect(all).toHaveAttribute('aria-selected', 'true')
  await expect(root.getByText('248 items in all', { exact: true })).toBeVisible()
  await expect(root.locator('main ol > li')).toHaveCount(5)
  checks.push('navbar-8: All 248 selects the static five-row all-items view')
}

async function verifyVariant9(page: Page, root: Locator): Promise<void> {
  const commerce = HBAR_APP_UI_NAVBAR_FIXTURES.commerce
  if (!commerce) throw new Error('Navbar commerce fixture is missing')
  await root.getByLabel(commerce.labels.cart, { exact: true }).click()
  await expectPreviewRequest(page, 9)
  checks.push('navbar-9: cart intent remains local to the commerce preview')
}

async function verifyVariant10(page: Page, root: Locator): Promise<void> {
  const docs = HBAR_APP_UI_NAVBAR_FIXTURES.docs
  if (!docs) throw new Error('Navbar docs fixture is missing')
  await root.getByLabel(docs.labels.sourceRepository, { exact: true }).click()
  await expectPreviewRequest(page, 10)
  checks.push('navbar-10: source repository intent remains local to the desktop docs preview')
}

async function verifyVariant11(page: Page, root: Locator): Promise<void> {
  await root.getByRole('button', { name: 'Share', exact: true }).click()
  await expectPreviewRequest(page, 11)
  checks.push('navbar-11: Share is a local preview request')
}

async function verifyVariant12(_page: Page, root: Locator): Promise<void> {
  await expect(root.getByRole('button', { name: 'Get started', exact: true })).toBeVisible()
  checks.push('navbar-12: centered Get started CTA is visible on desktop')
}

async function verifyVariant13(page: Page, root: Locator): Promise<void> {
  const portfolio = HBAR_APP_UI_NAVBAR_FIXTURES.portfolio
  if (!portfolio) throw new Error('Navbar portfolio fixture is missing')
  const project = root
    .locator('main li')
    .filter({ hasText: portfolio.projects[0]?.name ?? 'Harbor Coffee' })
    .getByRole('button')
  await expect(project).toHaveCount(1)
  await project.click()
  await expectPreviewRequest(page, 13)
  checks.push(`navbar-13: ${portfolio.projects[0]?.name ?? 'project'} open intent is request-only`)
}

async function verifyVariant14(page: Page, root: Locator): Promise<void> {
  const article = HBAR_APP_UI_NAVBAR_FIXTURES.article
  if (!article) throw new Error('Navbar article fixture is missing')
  const bookmark = root.getByLabel(/Bookmark article|Remove bookmark/, { exact: true })
  await expect(bookmark).toBeVisible()
  const bookmarkRole = await bookmark.getAttribute('role')
  if (bookmarkRole === 'checkbox') {
    await bookmark.click()
    await expect(root.getByRole('checkbox', { name: 'Remove bookmark', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  } else {
    await bookmark.click()
    await expectPreviewRequest(page, 14)
  }

  const contents = root.getByRole('button', { name: article.labels.contents, exact: true })
  await contents.click()
  const menu = root.getByRole('menu')
  if ((await menu.count()) > 0) {
    await expect(menu).toBeVisible()
    const firstSection = article.sections[0]
    if (firstSection) {
      await menu.getByRole('menuitem', { name: firstSection.title, exact: true }).click()
      await expect(root.getByRole('heading', { name: firstSection.title, exact: true })).toBeInViewport()
      await expectPreviewRequest(page, 14)
    }
  } else {
    await expectPreviewRequest(page, 14)
  }
  checks.push('navbar-14: bookmark and contents representative controls stay local to the article preview')
}

async function verifyDefaultVariants(page: Page): Promise<string> {
  await page.setViewportSize(defaultViewport)
  let screenshot = ''
  const checksByVariant: readonly ((page: Page, root: Locator) => Promise<void>)[] = [
    verifyVariant1,
    verifyVariant2,
    verifyVariant3,
    verifyVariant4,
    verifyVariant5,
    verifyVariant6,
    verifyVariant7,
    verifyVariant8,
    verifyVariant9,
    verifyVariant10,
    verifyVariant11,
    verifyVariant12,
    verifyVariant13,
    verifyVariant14,
  ]
  for (const [index, check] of checksByVariant.entries()) {
    const variant = index + 1
    const root = await openVariant(page, variant)
    await check(page, root)
    if (variant === 1) screenshot = await capture(page, 'navbar-discussion-desktop.png')
  }
  return screenshot
}

async function verifyNarrowRepresentatives(page: Page): Promise<string[]> {
  await page.setViewportSize(narrowViewport)
  const screenshots: string[] = []

  const localized = createHbarAppUiNavbarLocalizedFixtures().landingPrimary
  if (!localized) throw new Error('Localized navbar landing fixture is missing')
  if (!localized.labels.primaryAction || !localized.labels.menu) {
    throw new Error('Localized navbar landing fixture is missing its primary action or menu label')
  }
  const localizedRoot = await openVariant(page, 4, 'localized')
  await expect(localizedRoot.getByRole('button', { name: localized.labels.primaryAction, exact: true })).toBeVisible()
  await expect(localizedRoot.getByRole('button', { name: localized.labels.menu, exact: true })).toBeVisible()
  const contentFits = await localizedRoot.evaluate((element) => {
    const heading = element.querySelector('main h1')
    const controls = element.querySelectorAll('header button')
    return (
      Boolean(heading && heading.scrollWidth <= heading.clientWidth + 1) &&
      Array.from(controls)
        .filter((control) => control.getBoundingClientRect().width > 0)
        .every((control) => {
          const bounds = control.getBoundingClientRect()
          return bounds.left >= 0 && bounds.right <= innerWidth + 1
        })
    )
  })
  assert(contentFits, 'The localized heading or visible header controls are clipped')
  screenshots.push(await capture(page, 'navbar-localized-narrow.png'))
  checks.push('navbar-4 localized narrow: long German CTA and menu remain reachable')

  const docsRoot = await openVariant(page, 10)
  const trigger = docsRoot.getByRole('button', { name: 'Open navigation', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Documentation navigation', exact: true })
  await expect(dialog).toBeVisible()
  const concepts = dialog.locator('details').filter({ hasText: 'CORE CONCEPTS' })
  await expect(concepts).toHaveAttribute('open', '')
  await expect(concepts.getByText('Routing', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close navigation', exact: true }).click()
  await expect(dialog).toBeHidden()
  checks.push('navbar-10 narrow: documentation drawer opens with CORE CONCEPTS and closes at 360px')

  return screenshots
}

async function verifyOverflowStress(page: Page): Promise<string> {
  await page.setViewportSize(defaultViewport)
  const root = await openVariant(page, 2, 'overflow')
  const overflow = createHbarAppUiNavbarOverflowFixtures().taskList
  if (!overflow) throw new Error('Navbar overflow task fixture is missing')
  const pane = root.locator('.hbar-app-ui-navbar-task-main')
  const result = await inspectPaneScroll(pane, overflow.rows.length, '63')
  assert(result.lastReachable, 'The final task row was not reachable')
  checks.push(`navbar-2 overflow: ${result.rowCount} rows and final row 63 are reachable inside the pane`)
  return capture(page, 'navbar-overflow-stress.png')
}

async function main(): Promise<void> {
  await waitForExistingPreview()
  await mkdir(artifactDirectory, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: defaultViewport })
  page.on('pageerror', (error) => pushDiagnostic(currentVariant, `pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') pushDiagnostic(currentVariant, `console.error: ${message.text()}`)
  })

  try {
    // The default matrix visits each of the fourteen navbar surfaces once.
    const screenshots = [await verifyDefaultVariants(page)]
    screenshots.push(...(await verifyNarrowRepresentatives(page)))
    screenshots.push(await verifyOverflowStress(page))

    assert(diagnostics.length === 0, `Navbar browser diagnostics:\n${JSON.stringify(diagnostics, null, 2)}`)
    const report = {
      baseUrl,
      coverage: 'representative-states',
      variants: 14,
      defaultMatrix: 'each navbar variant once at desktop width',
      checks,
      screenshots: screenshots.filter(Boolean).map((path) => basename(path)),
      diagnostics,
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
