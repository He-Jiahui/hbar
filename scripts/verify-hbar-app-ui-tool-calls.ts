import { mkdir } from 'node:fs/promises'
import { chromium, type Locator, type Page } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const screenshots = 'artifacts/tool-calls-core-review'

function url(variant: number, fixture?: 'localized' | 'overflow'): string {
  const query = new URLSearchParams({ variant: `hbar-app-ui-tool-calls-${variant}`, mode: 'isolated' })
  if (fixture) query.set('toolCallsFixture', fixture)
  return `${baseUrl}/?${query}`
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function expectCount(locator: Locator, count: number, message: string): Promise<void> {
  assert((await locator.count()) === count, message)
}

async function expectText(locator: Locator, value: string, message: string): Promise<void> {
  assert((await locator.allInnerTexts()).join('\n').includes(value), message)
}

async function waitForPreview(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (
      await fetch(baseUrl)
        .then((response) => response.ok)
        .catch(() => false)
    )
      return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Preview is not reachable at ${baseUrl}`)
}

async function visit(page: Page, variant: number, fixture?: 'localized' | 'overflow'): Promise<void> {
  await page.goto(url(variant, fixture), { waitUntil: 'domcontentloaded' })
  await page.locator('.hbar-app-ui-tool-calls-surface').waitFor({ state: 'visible' })
  await assertNoHorizontalOverflow(page, variant)
}

async function assertNoHorizontalOverflow(page: Page, variant: number): Promise<void> {
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
    `Horizontal overflow in Tool Calls ${variant}`,
  )
}

async function run(): Promise<void> {
  await waitForPreview()
  await mkdir(screenshots, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1192, height: 760 } })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  try {
    await visit(page, 1)
    const traceRows = page.locator('.hbar-app-ui-tool-calls-trace-row')
    await expectCount(traceRows, 12, 'Trace omitted supplied tool calls')
    const activeTrace = page.getByRole('button', { name: /search_incidents.*Done/, exact: false })
    assert((await activeTrace.getAttribute('aria-expanded')) === 'true', 'Trace did not open the host-selected call')
    await activeTrace.click()
    assert((await activeTrace.getAttribute('aria-expanded')) === 'false', 'Trace detail did not collapse')
    const readTrace = page.getByRole('button', { name: /read_file.*Done/, exact: false }).first()
    await readTrace.click()
    assert((await readTrace.getAttribute('aria-expanded')) === 'true', 'Trace detail did not open by selected item')
    await visit(page, 1, 'overflow')
    const scroll = await page.locator('.hbar-app-ui-tool-calls-trace-pane').evaluate((pane) => {
      pane.scrollTop = pane.scrollHeight
      return pane.scrollHeight > pane.clientHeight && pane.scrollTop > 0
    })
    assert(scroll, 'The shared pane-scroll contract did not expose real scrolling')

    await visit(page, 2)
    await page.getByRole('tab', { name: 'Failed', exact: true }).click()
    const failedRows = page.locator('.hbar-app-ui-tool-calls-activity-row')
    await expectCount(failedRows, 2, 'Failed filter did not show only its supplied rows')
    await expectText(failedRows, 'fetch_url', 'Failed filter omitted failed URL')
    await expectText(failedRows, 'run_terminal', 'Failed filter omitted failed command')

    await page.setViewportSize({ width: 390, height: 844 })
    await visit(page, 3)
    const retryDiff = page.getByRole('button', { name: /services\/payments\/retry\.ts/, exact: false })
    assert((await retryDiff.getAttribute('aria-expanded')) === 'true', 'Diff did not open the host-selected file')
    await page.screenshot({ path: `${screenshots}/diff-narrow.png`, fullPage: true })
    await retryDiff.click()
    assert((await retryDiff.getAttribute('aria-expanded')) === 'false', 'Diff file disclosure did not collapse')
    await expectCount(page.getByText('baseBackoff', { exact: false }), 0, 'Collapsed diff still exposed its code lines')
    const idempotencyDiff = page.getByRole('button', { name: /services\/payments\/idempotency\.ts/, exact: false })
    await idempotencyDiff.click()
    assert((await idempotencyDiff.getAttribute('aria-expanded')) === 'true', 'Second diff file did not open')
    await expectCount(page.getByText('stableKey', { exact: false }), 1, 'Opened diff omitted supplied file contents')

    await page.setViewportSize({ width: 1192, height: 760 })
    await visit(page, 4)
    const resultLinks = page.locator('a.hbar-app-ui-tool-calls-search-link[href="#"]')
    await expectCount(resultLinks, 7, 'Search results did not render as placeholder links')
    const searchUrl = page.url()
    const result = resultLinks.first()
    await expectText(result, 'Idempotent requests', 'First search result title was missing')
    await result.click()
    assert(page.url() === searchUrl, 'Search result navigated away from the local preview')
    await expectCount(resultLinks, 7, 'Search result intent changed its source row')
    await expectText(
      page.locator('.lumen-tool-calls-notice'),
      'Preview request only',
      'Search result lacked intent-only feedback',
    )
    await expectText(result, 'Idempotency-Key', 'Search result lost its host-provided excerpt')
    await page.screenshot({ path: `${screenshots}/search-result-intent.png`, fullPage: true })

    await visit(page, 5)
    await page.getByRole('tab', { name: 'stderr', exact: true }).click()
    await expectText(
      page.getByRole('tabpanel'),
      'expected status 409, received status 500',
      'stderr tab did not show the supplied failure',
    )
    await expectText(
      page.getByRole('tabpanel'),
      'services/payments/charge.test.ts:84:11',
      'stderr omitted the source stack location',
    )
    await page.screenshot({ path: `${screenshots}/command-stderr.png`, fullPage: true })

    await page.setViewportSize({ width: 390, height: 844 })
    await visit(page, 6, 'localized')
    await expectCount(
      page.getByText('Werkzeugberechtigungen fuer diesen Arbeitsbereich', { exact: true }),
      1,
      'Localized permission heading missing',
    )
    await expectCount(
      page.getByText('2 ausstehende Freigabeanfragen', { exact: true }),
      1,
      'Localized pending count missing',
    )

    const requestRow = page.locator('.hbar-app-ui-tool-calls-permissions li.is-request').first()
    await expectText(requestRow, 'Send the Q3 renewal summary to 4 recipients', 'Pending request target was missing')
    const viewRequest = requestRow.getByRole('button', { name: 'View request', exact: true })
    await viewRequest.click()
    assert((await viewRequest.getAttribute('aria-expanded')) === 'true', 'View request did not expand')
    await expectText(
      requestRow.locator('.lumen-tool-calls-request-details'),
      'q3-renewals.pdf',
      'View request hid host payload details',
    )
    await assertNoHorizontalOverflow(page, 6)

    for (const action of ['Approve', 'Reject'] as const) {
      await requestRow.getByRole('button', { name: action, exact: true }).click()
      await expectText(
        requestRow.locator('.lumen-tool-calls-request-feedback'),
        'Nur eine Vorschau-Anfrage',
        `${action} lacked preview-only row feedback`,
      )
      await expectText(
        requestRow.locator('.lumen-tool-calls-request-feedback'),
        'keine Berechtigung erteilt',
        `${action} implied a permission grant`,
      )
      await expectCount(
        page.getByText('2 ausstehende Freigabeanfragen', { exact: true }),
        1,
        `${action} changed the source pending count`,
      )
      await expectText(
        requestRow,
        'Send the Q3 renewal summary to 4 recipients',
        `${action} removed the source request`,
      )
    }

    const readPermission = page.getByRole('switch', { name: 'Toggle read file permission', exact: true })
    assert(
      (await readPermission.getAttribute('aria-checked')) === 'true',
      'Read permission initial value diverged from host data',
    )
    await readPermission.click()
    assert(
      (await readPermission.getAttribute('aria-checked')) === 'false',
      'Permission toggle did not update preview state',
    )
    await expectText(
      page.locator('.lumen-tool-calls-notice'),
      'Lokale Vorschau aktualisiert',
      'Permission change lacked preview-only feedback',
    )
    await expectText(
      page.locator('.lumen-tool-calls-notice'),
      'Keine Live-Berechtigung wurde geaendert',
      'Permission change implied a live grant',
    )
    await expectCount(
      page.getByText('2 ausstehende Freigabeanfragen', { exact: true }),
      1,
      'Permission toggle altered pending requests',
    )
    await page.screenshot({ path: `${screenshots}/permissions-mobile-de.png`, fullPage: true })

    assert(errors.length === 0, `Tool Calls browser errors: ${errors.join(' | ')}`)
    console.log(
      JSON.stringify({
        variants: 6,
        traceDisclosure: true,
        failedFilter: true,
        diffDisclosure: true,
        searchIntent: true,
        stderrTab: true,
        permissionPreviewActions: true,
        narrowFlows: 2,
        errors: 0,
      }),
    )
  } finally {
    await browser.close()
  }
}

await run()
