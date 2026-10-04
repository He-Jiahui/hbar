import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const artifactDirectory = resolve('artifacts/app-sidebar-core-review')
const diagnostics: string[] = []
const checks: string[] = []
const screenshots: string[] = []

type SidebarVariant = 1 | 2 | 3 | 4 | 5 | 6 | 7
type SidebarFixture = 'localized' | 'overflow'

const fixtureParameters: Readonly<Record<SidebarVariant, string>> = {
  1: 'appSidebarFixture',
  2: 'appSidebarRailFixture',
  3: 'appSidebarWorkspaceFixture',
  4: 'appSidebarDualFixture',
  5: 'appSidebarTreeFixture',
  6: 'appSidebarDrawerFixture',
  7: 'appSidebarFullFixture',
}

const componentRoots: Readonly<Record<SidebarVariant, string>> = {
  1: '.lumen-primary-sidebar-root',
  2: '.lumen-app-sidebar-rail-root',
  3: '.lumen-workspace-sidebar-root',
  4: '.lumen-dual-sidebar-root',
  5: '.lumen-tree-root',
  6: '.lumen-drawer-root',
  7: '.lumen-full-root',
}

function variantUrl(variant: SidebarVariant, fixture?: SidebarFixture, theme: 'light' | 'dark' = 'light'): string {
  const query = new URLSearchParams({
    variant: `hbar-app-ui-app-sidebar-${variant}`,
    mode: 'isolated',
    theme,
  })
  if (fixture) query.set(fixtureParameters[variant], fixture)
  return `${baseUrl}/?${query.toString()}`
}

async function openVariant(
  page: Page,
  variant: SidebarVariant,
  fixture?: SidebarFixture,
  theme: 'light' | 'dark' = 'light',
): Promise<Locator> {
  await page.goto(variantUrl(variant, fixture, theme), { waitUntil: 'domcontentloaded' })
  const preview = page.locator('.lumen-app-sidebar-preview')
  await expect(preview).toBeVisible()
  await expect(preview.locator(`[data-lumen-component="app-sidebar"][data-lumen-variant="${variant}"]`)).toBeVisible()
  const component = preview.locator(componentRoots[variant])
  await expect(component).toBeVisible()
  return component
}

async function checkHorizontalOverflow(page: Page, context: string): Promise<void> {
  const sizes = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }))
  if (Math.max(sizes.document, sizes.body) > sizes.viewport + 1) {
    throw new Error(`${context} introduced horizontal page overflow: ${JSON.stringify(sizes)}`)
  }
  checks.push(`${context}: no horizontal page overflow`)
}

async function checkPreviewRequest(page: Page): Promise<void> {
  const notice = page.locator('.lumen-app-sidebar-preview-notice[role="status"]')
  await expect(notice).toBeVisible()
  await expect(notice).toContainText(/preview|vorschau/i)
}

async function capture(page: Page, filename: string): Promise<void> {
  if (screenshots.length >= 3) throw new Error('The App Sidebar verifier is limited to three screenshots.')
  const path = resolve(artifactDirectory, filename)
  await page.screenshot({ path, fullPage: true })
  screenshots.push(path)
}

async function waitForExistingPreview(): Promise<void> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // This verifier only connects to a preview that its owner already started.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200))
  }
  throw new Error(`Preview is not reachable at ${baseUrl}; start it separately before verification.`)
}

async function verifyVariantOne(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  const root = await openVariant(page, 1)
  const navigation = root.getByRole('navigation', { name: 'Primary', exact: true })
  await expect(navigation.getByRole('link')).toHaveCount(11)
  await expect(root.getByRole('button', { name: /Iris Renner/ })).toBeVisible()
  // This source-shaped primary sidebar has no search field; the query control appears in variants 3–5.
  await expect(root.getByRole('searchbox')).toHaveCount(0)

  const profile = root.getByRole('button', { name: /Iris Renner/ })
  await profile.click()
  const menu = root.getByRole('menu', { name: 'Account', exact: true })
  await expect(menu.getByRole('menuitem')).toHaveCount(4)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(profile).toBeFocused()

  await root.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  await expect(root.locator('.lumen-primary-sidebar')).toHaveClass(/is-collapsed/)
  await root.getByRole('button', { name: 'Expand sidebar', exact: true }).click()
  await expect(root.locator('.lumen-primary-sidebar')).not.toHaveClass(/is-collapsed/)
  await checkHorizontalOverflow(page, 'variant 1 primary menu and collapse')
  checks.push(
    'variant 1: source primary has grouped navigation and an Escape-dismissible account menu; no search was invented',
  )
}

async function verifyVariantTwo(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  const root = await openVariant(page, 2, undefined, 'dark')
  await expect(page.locator('.hbar-app-ui-isolated-canvas')).toHaveAttribute('data-hbar-app-ui-theme', 'dark')
  const navigation = root.getByRole('navigation', { name: 'Primary', exact: true })
  const overview = navigation.getByRole('button', { name: 'Overview', exact: true })
  await overview.hover()
  const flyout = root.getByRole('menu', { name: 'Overview', exact: true })
  await expect(flyout.getByRole('menuitem', { name: 'Today', exact: true })).toBeVisible()
  await expect(flyout.getByRole('menuitem', { name: 'This week', exact: true })).toBeVisible()
  await capture(page, 'variant-2-dark-rail-flyout.png')
  await checkHorizontalOverflow(page, 'variant 2 dark rail hover flyout')
  checks.push('variant 2: dark-theme icon rail reveals its local flyout on hover')
}

async function verifyVariantThree(page: Page): Promise<void> {
  await page.setViewportSize({ width: 428, height: 820 })
  const root = await openVariant(page, 3)
  const switcher = root.getByRole('button', { name: /Northwind Logistics/ })
  await switcher.click()
  const menu = root.getByRole('menu', { name: 'Switch workspace', exact: true })
  await expect(menu.getByRole('menuitemradio')).toHaveCount(3)
  await menu.getByRole('menuitemradio', { name: /Atlas Service Desk/ }).click()
  await expect(root.getByRole('button', { name: /Atlas Service Desk/ })).toBeVisible()

  const search = root.getByRole('searchbox', { name: 'Search this workspace', exact: true })
  await expect(search).toHaveAttribute('placeholder', 'Search Atlas')
  await search.fill('no matching navigation label')
  const navigation = root.getByRole('navigation', { name: 'Primary', exact: true })
  // Source after-state and the current view retain all links after a search fill.
  await expect(navigation.getByRole('link')).toHaveCount(11)
  await expect(navigation.getByRole('link', { name: 'Boards', exact: true })).toBeVisible()
  await checkHorizontalOverflow(page, 'variant 3 narrow workspace picker and passive search')
  checks.push(
    'variant 3: workspace selection is Host-projected; search changes its draft but does not filter navigation',
  )
}

async function verifyVariantFour(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  const root = await openVariant(page, 4)
  const sections = root.getByRole('navigation', { name: 'Sections', exact: true })
  await expect(sections.getByRole('button')).toHaveCount(7)
  await sections.getByRole('button', { name: 'Projects', exact: true }).click()
  await expect(root.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible()
  const search = root.getByRole('searchbox', { name: 'Search Projects', exact: true })
  await search.fill('no matching page')
  const pages = root.getByRole('navigation', { name: 'Projects pages', exact: true })
  await expect(pages.getByRole('button')).toHaveCount(10)
  await expect(pages.getByRole('button', { name: 'Active', exact: true })).toBeVisible()
  await checkHorizontalOverflow(page, 'variant 4 dual rail section and search')
  checks.push('variant 4: selecting a section replaces the panel; search remains a draft and does not remove pages')
}

async function verifyVariantFive(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  const root = await openVariant(page, 5)
  const navigation = root.getByRole('navigation', { name: 'Documents', exact: true })
  const folder = navigation.getByRole('button', { name: 'Customer operations', exact: true })
  const firstDocument = navigation.getByRole('button', { name: 'Enterprise handoff checklist', exact: true })
  await expect(folder).toHaveAttribute('aria-expanded', 'true')
  await expect(firstDocument).toBeVisible()

  await root.getByRole('searchbox', { name: 'Search documents', exact: true }).fill('no matching document')
  await expect(firstDocument).toBeVisible()
  await folder.click()
  await expect(folder).toHaveAttribute('aria-expanded', 'false')
  await expect(firstDocument).toBeHidden()
  await folder.click()
  await expect(firstDocument).toBeVisible()

  await navigation.getByRole('button', { name: 'Actions for Customer operations', exact: true }).click()
  const menu = root.getByRole('menu', { name: 'Customer operations actions', exact: true })
  await menu.getByRole('menuitem', { name: 'Duplicate', exact: true }).click()
  await checkPreviewRequest(page)
  await expect(firstDocument).toBeVisible()
  await checkHorizontalOverflow(page, 'variant 5 document tree disclosure and request-only duplicate')
  checks.push('variant 5: folder disclosure changes locally; search does not filter, and Duplicate stays request-only')
}

async function verifyVariantSix(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 800 })
  const root = await openVariant(page, 6, 'localized')
  const dialog = root.getByRole('dialog', { name: 'Navigation', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(dialog.getByText('Fieldbase — ausführliche Team-Navigation', { exact: true })).toBeVisible()

  const open = root.getByRole('button', { name: 'Navigation öffnen', exact: true })
  await expect(open).toHaveAttribute('aria-expanded', 'true')
  await dialog.getByRole('button', { name: 'Close navigation', exact: true }).click()
  await expect(root.getByRole('dialog', { name: 'Navigation', exact: true })).toHaveCount(0)
  await open.focus()
  await open.press('Enter')
  await expect(root.getByRole('dialog', { name: 'Navigation', exact: true })).toBeVisible()
  await expect(open).toHaveAttribute('aria-expanded', 'true')
  await expect(open).toBeFocused()
  await capture(page, 'variant-6-narrow-localized-drawer.png')
  await checkHorizontalOverflow(page, 'variant 6 narrow localized drawer open/close and keyboard activation')
  checks.push(
    'variant 6: long localized drawer closes and reopens by keyboard; focus stays on the trigger (no focus trap is claimed)',
  )
}

async function verifyVariantSeven(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  const root = await openVariant(page, 7, 'overflow')
  const sidebar = root.locator('.lumen-full-desktop')
  const navigation = sidebar.getByRole('navigation', { name: 'Primary', exact: true })
  const links = navigation.getByRole('link')
  await expect(links).toHaveCount(65)

  const first = links.first()
  const last = links.last()
  await expect(first).toHaveAttribute('href', '#nav')
  const paneBefore = await navigation.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))
  if (paneBefore.scrollHeight <= paneBefore.clientHeight) {
    throw new Error(
      `variant 7 overflow fixture did not create a scrollable navigation pane: ${JSON.stringify(paneBefore)}`,
    )
  }
  await last.scrollIntoViewIfNeeded()
  await expect(last).toBeInViewport()
  const scrollTop = await navigation.evaluate((element) => element.scrollTop)
  if (scrollTop <= 0) throw new Error('variant 7 did not scroll its navigation pane to reach the final destination')

  await first.scrollIntoViewIfNeeded()
  const before = new URL(page.url())
  await first.click()
  const after = new URL(page.url())
  expect(after.origin).toBe(before.origin)
  expect(after.pathname).toBe(before.pathname)
  expect(after.searchParams.get('variant')).toBe('hbar-app-ui-app-sidebar-7')
  expect(after.hash).toBe('#nav')
  await checkPreviewRequest(page)
  await capture(page, 'variant-7-full-sidebar-pane-overflow.png')
  await checkHorizontalOverflow(page, 'variant 7 full sidebar pane-scroll and fragment-only request')
  checks.push(
    'variant 7: all 65 destinations remain reachable in the declared pane-scroll; link is same-page fragment, not external navigation',
  )
}

await waitForExistingPreview()
await mkdir(artifactDirectory, { recursive: true })
const browser = await chromium.launch({ executablePath })
const page = await browser.newPage()
page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error') diagnostics.push(`console: ${message.text()}`)
})

try {
  await verifyVariantOne(page)
  await verifyVariantTwo(page)
  await verifyVariantThree(page)
  await verifyVariantFour(page)
  await verifyVariantFive(page)
  await verifyVariantSix(page)
  await verifyVariantSeven(page)
  expect(diagnostics).toEqual([])
  const report = {
    appSidebarPractical: 'passed',
    variants: [1, 2, 3, 4, 5, 6, 7],
    narrowRepresentatives: ['variant 3 workspace picker', 'variant 6 localized drawer'],
    paneOverflow: 'variant 7 full navigation: 65 records in a pane-scroll region',
    checks,
    diagnostics,
    screenshots,
  }
  await writeFile(resolve(artifactDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
}
