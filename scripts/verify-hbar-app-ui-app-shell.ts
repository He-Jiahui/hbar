import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { appShellChatFixture } from '../tests/fixtures/hbar-app-ui-app-shell-chat-fixtures'
import { appShellInboxFixture } from '../tests/fixtures/hbar-app-ui-app-shell-inbox-fixtures'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const artifactDirectory = resolve('artifacts/app-shell-core-review')
const diagnostics: string[] = []
const checks: string[] = []

const rootSelectors: Readonly<Record<number, string>> = {
  1: '.lumen-sidebar-shell',
  2: '.lumen-rail-shell',
  3: '.lumen-contracts-shell',
  4: '.lumen-editorial-shell',
  5: '.lumen-inbox-shell',
  6: '.lumen-documents-shell',
  7: '.lumen-scope-shell',
  8: '.lumen-adaptive-shell',
  9: '.lumen-chat-shell',
}

type AppShellFixture = 'overflow' | 'localized'

function variantUrl(variant: number, fixture?: AppShellFixture): string {
  const query = new URLSearchParams({
    variant: `hbar-app-ui-app-shell-${variant}`,
    mode: 'isolated',
    theme: 'light',
  })
  if (fixture) query.set('appShellFixture', fixture)
  return `${baseUrl}/?${query.toString()}`
}

async function openVariant(page: Page, variant: number, fixture?: AppShellFixture): Promise<Locator> {
  const selector = rootSelectors[variant]
  if (!selector) throw new Error(`No App Shell root selector is configured for variant ${variant}`)
  await page.goto(variantUrl(variant, fixture), { waitUntil: 'domcontentloaded' })
  const root = page.locator(selector)
  await expect(root).toBeVisible()
  return root
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
  checks.push(`${context}: no horizontal page overflow`)
}

async function checkPreviewRequest(page: Page): Promise<void> {
  const notice = page.getByRole('status').filter({ hasText: /preview|vorschau/i })
  await expect(notice).toHaveCount(1)
  await expect(notice).toBeVisible()
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
      // Connect only to a preview that the task owner has already started.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200))
  }
  throw new Error(`Preview is not reachable at ${baseUrl}; start it separately before verification.`)
}

async function verifyStructures(page: Page): Promise<void> {
  const surfaces: readonly {
    readonly variant: number
    readonly check: (root: Locator) => Promise<void>
  }[] = [
    {
      variant: 1,
      check: async (root) => {
        await expect(root.getByRole('searchbox', { name: 'Search shipments', exact: true })).toBeVisible()
        await expect(root.locator('tbody [data-record-id]')).toHaveCount(14)
        await expect(root.getByRole('heading', { name: 'Active shipments', exact: true })).toBeVisible()
      },
    },
    {
      variant: 2,
      check: async (root) => {
        await expect(root.getByRole('navigation', { name: 'Areas', exact: true })).toBeVisible()
        await expect(root.getByRole('navigation', { name: 'Areas' }).getByRole('button')).toHaveCount(5)
        await expect(root.getByRole('heading', { name: 'Shipments', exact: true })).toBeVisible()
      },
    },
    {
      variant: 3,
      check: async (root) => {
        await expect(root.getByRole('radiogroup', { name: 'Filter agreements' })).toBeVisible()
        await expect(root.locator('main tbody tr')).toHaveCount(14)
      },
    },
    {
      variant: 4,
      check: async (root) => {
        await expect(root.getByRole('heading', { name: 'Story queue', exact: true })).toBeVisible()
        await expect(root.locator('.lumen-editorial-table tbody tr')).toHaveCount(16)
        await expect(root.getByRole('table', { name: 'August 2026 publishing schedule' })).toBeVisible()
      },
    },
    {
      variant: 5,
      check: async (root) => {
        await expect(root.getByRole('listbox', { name: 'Conversations' }).getByRole('option')).toHaveCount(9)
        await expect(root.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible()
      },
    },
    {
      variant: 6,
      check: async (root) => {
        await expect(root.getByRole('treeitem', { name: 'Webhook retry schedule', exact: true })).toHaveAttribute(
          'aria-selected',
          'true',
        )
        await expect(root.getByRole('main').getByRole('heading', { name: 'Webhook retry schedule' })).toBeVisible()
      },
    },
    {
      variant: 7,
      check: async (root) => {
        await expect(root.getByRole('button', { name: 'Project: Payments API', exact: true })).toBeVisible()
        await expect(root.getByRole('button', { name: 'Environment: Production', exact: true })).toBeVisible()
        await expect(root.locator('main tbody tr')).toHaveCount(14)
      },
    },
    {
      variant: 8,
      check: async (root) => {
        await expect(root.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
        await expect(root.locator('.lumen-adaptive-row-list > li')).toHaveCount(12)
        await expect(root.getByRole('button', { name: 'Assign remaining', exact: true })).toBeVisible()
      },
    },
    {
      variant: 9,
      check: async (root) => {
        await expect(root.getByRole('radiogroup', { name: 'Model' }).getByRole('radio')).toHaveCount(3)
        await expect(root.getByRole('textbox', { name: 'Message Halden', exact: true })).toBeVisible()
        await expect(root.getByRole('button', { name: 'Draft an email', exact: true })).toBeVisible()
      },
    },
  ]

  await page.setViewportSize({ width: 1280, height: 800 })
  for (const surface of surfaces) {
    const root = await openVariant(page, surface.variant)
    await surface.check(root)
    await checkHorizontalOverflow(page, `variant ${surface.variant} structure`)
    checks.push(`variant ${surface.variant}: source-shaped core structure is present`)
  }
}

async function verifySidebarNavigationAndSearch(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  const root = await openVariant(page, 1)
  const shipments = root.getByRole('button', { name: 'Shipments', exact: true })
  await expect(shipments).toHaveAttribute('aria-expanded', 'true')
  await shipments.click()
  await expect(shipments).toHaveAttribute('aria-expanded', 'false')
  await expect(root.getByRole('link', { name: 'Awaiting pickup', exact: true })).toBeHidden()
  await shipments.press('Space')
  await expect(shipments).toHaveAttribute('aria-expanded', 'true')

  const search = root.getByRole('searchbox', { name: 'Search shipments', exact: true })
  await search.fill('Kettleworth')
  await expect(search).toHaveValue('Kettleworth')
  // The reviewed sidebar preview accepts this query without filtering its supplied table.
  await expect(root.locator('tbody [data-record-id]')).toHaveCount(14)
  await expect(root.locator('tbody [data-record-id]').filter({ hasText: 'Kettleworth Foods' })).toHaveCount(1)
  await checkHorizontalOverflow(page, 'sidebar navigation and search draft')
  checks.push('variant 1: navigation group toggles; search draft is retained without inventing table filtering')
}

async function verifyRailAreaSelection(page: Page): Promise<string> {
  await page.setViewportSize({ width: 1280, height: 800 })
  const root = await openVariant(page, 2)
  await root.getByRole('navigation', { name: 'Areas', exact: true }).getByRole('button', { name: 'Dispatch' }).click()
  await expect(root.getByRole('heading', { name: 'Load board', exact: true })).toBeVisible()
  await expect(root.getByRole('navigation', { name: 'Dispatch', exact: true })).toBeVisible()
  await expect(root.getByRole('button', { name: 'Assign driver', exact: true })).toBeVisible()
  await checkHorizontalOverflow(page, 'icon rail area selection')
  checks.push('variant 2: selecting an icon-rail area switches the local workspace view')
  return capture(page, 'app-shell-2-rail-area.png')
}

async function verifyContractsFilter(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  const root = await openVariant(page, 3)
  await root.getByRole('radio', { name: 'Needs attention', exact: true }).click()
  await expect(root.locator('main tbody tr')).toHaveCount(3)
  await expect(root.getByRole('radio', { name: 'Needs attention' })).toHaveAttribute('aria-checked', 'true')
  await checkHorizontalOverflow(page, 'contract attention filter')
  checks.push('variant 3: contract filter narrows the supplied table to the three attention records')
}

async function verifyEditorialCalendar(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  const root = await openVariant(page, 4)
  await root.getByRole('button', { name: 'Thursday, August 13, 2026', exact: true }).click()
  await expect(root.locator('.lumen-editorial-agenda li')).toHaveCount(8)
  await expect(root.getByRole('button', { name: 'Thursday, August 13, 2026', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await checkHorizontalOverflow(page, 'editorial calendar date selection')
  checks.push('variant 4: selecting a calendar day updates its agenda locally')
}

async function verifyInboxConversation(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  const selected = appShellInboxFixture(null).inventory.find((item) => item.id === 'daniel')
  if (!selected || !selected.paragraphs[0]) throw new Error('Inbox sample content is incomplete')
  const root = await openVariant(page, 5)
  const conversation = root.getByRole('option').filter({ hasText: 'Daniel Okonkwo' })
  await conversation.click()
  await expect(conversation).toHaveAttribute('aria-selected', 'true')
  await expect(root.getByRole('main').getByRole('heading', { level: 1 })).toContainText(
    "Rate card for the Rotterdam lane is showing last quarter's prices",
  )
  await expect(root.getByRole('main').getByText(selected.paragraphs[0], { exact: true })).toBeVisible()
  await checkHorizontalOverflow(page, 'inbox conversation detail')
  checks.push('variant 5: selecting a conversation shows its own message details')
}

async function verifyDocumentEdit(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  const root = await openVariant(page, 6)
  const title = root.getByRole('textbox', { name: 'Document title', exact: true })
  await title.fill('Local preview document edit')
  await expect(root.getByRole('main').getByRole('heading', { level: 1 })).toHaveText('Local preview document edit')
  await expect(root.getByRole('treeitem', { name: 'Local preview document edit', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await checkHorizontalOverflow(page, 'document title edit')
  checks.push('variant 6: editing the title updates the selected tree item and document heading together')
}

async function verifyScopeMenu(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  const root = await openVariant(page, 7)
  await root.getByRole('button', { name: 'Environment: Production', exact: true }).click()
  const menu = root.getByRole('menu', { name: 'Environment', exact: true })
  await expect(menu.getByRole('menuitemradio', { name: 'Preview', exact: true })).toBeVisible()
  await menu.getByRole('menuitemradio', { name: 'Preview', exact: true }).click()
  await expect(root.getByRole('button', { name: 'Environment: Preview', exact: true })).toBeVisible()
  await expect(root.getByRole('button', { name: 'System status: operational', exact: true })).toBeVisible()
  await expect(root.locator('main tbody tr')).toHaveCount(13)
  await checkHorizontalOverflow(page, 'scope environment selection')
  checks.push('variant 7: the scope menu changes environment and projects its matching local database view')
}

async function verifyAdaptiveMobile(page: Page): Promise<string> {
  await page.setViewportSize({ width: 390, height: 844 })
  const root = await openVariant(page, 8)
  const bottomNavigation = root.locator('.lumen-adaptive-bottom-nav')
  await expect(bottomNavigation).toBeVisible()
  await bottomNavigation.getByRole('button', { name: 'Unassigned', exact: true }).click()
  await expect(root.getByRole('heading', { name: 'Unassigned', exact: true })).toBeVisible()
  await expect(root.locator('.lumen-adaptive-card-list > li')).toHaveCount(4)
  const flaggedJob = root.getByRole('button', { name: 'Clear follow-up on WO-4825', exact: true })
  await expect(flaggedJob).toHaveAttribute('aria-pressed', 'true')
  await flaggedJob.click()
  const unflaggedJob = root.getByRole('button', { name: 'Flag WO-4825 for follow-up', exact: true })
  await expect(unflaggedJob).toHaveAttribute('aria-pressed', 'false')
  await unflaggedJob.click()
  await expect(root.getByRole('button', { name: 'Clear follow-up on WO-4825', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await checkHorizontalOverflow(page, 'adaptive mobile queue and follow-up flag')
  checks.push('variant 8: mobile queue selection and follow-up flag retain their target row')
  return capture(page, 'app-shell-8-mobile-adaptive.png')
}

async function verifyDocumentsOverflow(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 })
  const root = await openVariant(page, 6, 'overflow')
  const pane = root.locator('.lumen-documents-tree-pane')
  const items = pane.getByRole('treeitem')
  await expect(items).toHaveCount(102)
  const canScroll = await pane.evaluate((element) => element.scrollHeight > element.clientHeight)
  if (!canScroll) throw new Error('The over-bound Documents tree did not expose its pane-owned scroll region')
  await items.last().scrollIntoViewIfNeeded()
  await expect(items.last()).toBeInViewport()
  const scrollTop = await pane.evaluate((element) => element.scrollTop)
  if (scrollTop <= 0) throw new Error('The final Documents tree item did not scroll within its owning pane')
  await checkHorizontalOverflow(page, 'documents tree capacity sample')
  checks.push('variant 6: all 101 overflow-fixture documents remain reachable in the tree pane')
}

async function verifyChatMobilePreview(page: Page): Promise<string> {
  await page.setViewportSize({ width: 390, height: 844 })
  const fixture = appShellChatFixture('localized')
  const thread = fixture.threads.find((item) => item.id === 'refactor')
  const model = fixture.models.find((item) => item.id === 'wren')
  const suggestion = fixture.suggestions[0]
  if (!thread || !model || !suggestion || !thread.messages[0]) throw new Error('Chat sample content is incomplete')
  const root = await openVariant(page, 9, 'localized')
  await root.getByRole('button', { name: fixture.labels.openNavigation, exact: true }).click()
  const dialog = root.getByRole('dialog', { name: fixture.labels.openNavigation, exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('radio', { name: model.label, exact: true }).click()
  await expect(root.locator('.lumen-chat-model-trigger')).toContainText(model.label)
  await dialog.getByRole('button', { name: thread.label, exact: true }).click()
  // The reference intentionally omits the workspace title at this narrow breakpoint.
  await expect(root.locator('.lumen-shell-chat-message')).toHaveCount(thread.messages.length)
  await expect(root.getByText(thread.messages[0].text, { exact: true })).toBeVisible()

  await root.getByRole('button', { name: fixture.labels.openNavigation, exact: true }).click()
  await root
    .getByRole('dialog', { name: fixture.labels.openNavigation, exact: true })
    .getByRole('button', {
      name: fixture.labels.newChat,
      exact: true,
    })
    .click()
  const composer = root.getByRole('textbox', { name: fixture.labels.messagePlaceholder, exact: true })
  await root.getByRole('button', { name: suggestion.label, exact: true }).click()
  await expect(composer).toHaveValue(suggestion.label)
  await root.getByRole('button', { name: fixture.labels.send, exact: true }).click()
  await checkPreviewRequest(page)
  await expect(composer).toHaveValue(suggestion.label)
  await expect(root.locator('.lumen-shell-chat-message')).toHaveCount(0)
  await checkHorizontalOverflow(page, 'chat mobile composer preview request')
  checks.push('variant 9: localized model/thread/composer controls work; Send is a preview intent, not a model reply')
  return capture(page, 'app-shell-9-mobile-chat-preview-de.png')
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
    await verifySidebarNavigationAndSearch(page)
    screenshots.push(await verifyRailAreaSelection(page))
    await verifyContractsFilter(page)
    await verifyEditorialCalendar(page)
    await verifyInboxConversation(page)
    await verifyDocumentEdit(page)
    await verifyScopeMenu(page)
    screenshots.push(await verifyAdaptiveMobile(page))
    await verifyDocumentsOverflow(page)
    screenshots.push(await verifyChatMobilePreview(page))
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
