import { mkdir } from 'node:fs/promises'
import { chromium, type Locator, type Page } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const screenshots = 'artifacts/agent-activity-core-review'

function url(variant: number, fixture?: 'localized'): string {
  const query = new URLSearchParams({ variant: `hbar-app-ui-agent-activity-${variant}`, mode: 'isolated' })
  if (fixture) query.set('agentActivityFixture', fixture)
  return `${baseUrl}/?${query}`
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function expectCount(locator: Locator, count: number, message: string): Promise<void> {
  assert((await locator.count()) === count, message)
}

async function expectText(locator: Locator, value: string, message: string): Promise<void> {
  assert((await locator.innerText()).includes(value), message)
}

async function visit(page: Page, variant: number, fixture?: 'localized'): Promise<void> {
  await page.goto(url(variant, fixture), { waitUntil: 'domcontentloaded' })
  await page.locator('.hbar-app-ui-agent-activity-surface').waitFor({ state: 'visible' })
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
    `Horizontal overflow in Agent Activity ${variant}`,
  )
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

async function run(): Promise<void> {
  await waitForPreview()
  await mkdir(screenshots, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1192, height: 760 } })
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  const radio = (name: string) => page.getByRole('radio', { name, exact: true })
  const text = (name: string) => page.getByText(name, { exact: true })
  const notice = page.locator('.lumen-agent-activity-notice')
  const errors: string[] = []
  let downloaded = false
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('download', () => {
    downloaded = true
  })

  try {
    await visit(page, 1)
    await button('Stop').click()
    await expectCount(text('Running'), 1, 'Live stop claimed a stopped run')
    await expectText(notice, 'Preview request only', 'Live stop lacked intent feedback')

    await visit(page, 2)
    const group = page.locator('.hbar-app-ui-agent-activity-group-row').first()
    await group.click()
    assert((await group.getAttribute('aria-expanded')) === 'false', 'Nested group did not collapse')
    await expectCount(text('Validate source schema'), 0, 'Collapsed children remained visible')

    await visit(page, 3)
    await button('Stop').click()
    await expectCount(text('Preview stopped'), 2, 'Deployment stop was not marked as preview')
    await button('Replay preview').click()
    await expectCount(text('Running'), 2, 'Deployment preview did not replay')

    await visit(page, 4)
    const rows = page.locator('.hbar-app-ui-agent-activity-history-table tbody tr')
    await rows.first().waitFor()
    const firstRow = rows.first()
    const originalRun = await firstRow.innerText()
    await expectCount(rows, 14, 'History omitted host runs')
    assert(
      !(await page.locator('.hbar-app-ui-agent-activity-history-cards').isVisible()),
      'Desktop history duplicated cards above the table',
    )
    await button('Re-run Reconcile October invoices').first().click()
    await expectCount(rows, 14, 'Run intent added history')
    assert((await firstRow.innerText()) === originalRun, 'Run intent changed its source row')
    await expectText(notice, 'Preview request only', 'Re-run lacked intent feedback')

    await visit(page, 5)
    await radio('Warnings').click()
    const logRows = page.locator('.hbar-app-ui-agent-activity-log-list > li')
    await expectCount(logRows, 2, 'Warnings filter did not narrow the log')
    assert((await radio('Warnings').getAttribute('aria-checked')) === 'true', 'Warning filter not selected')

    await visit(page, 5)
    await button('Stop').click()
    const frozenCount = await logRows.count()
    await page.waitForTimeout(1400)
    await expectCount(logRows, frozenCount, 'Stopped log replay continued')
    await expectText(notice, 'Local preview updated', 'Log stop lacked local feedback')
    const pane = page.locator('.hbar-app-ui-agent-activity-log-scroll')
    await pane.evaluate((element) => {
      element.scrollTop = 0
    })
    const jump = button('Jump to latest')
    await jump.waitFor()
    await jump.click()
    await page.waitForFunction(
      () => (document.querySelector<HTMLElement>('.hbar-app-ui-agent-activity-log-scroll')?.scrollTop ?? 0) > 0,
    )
    await expectCount(jump, 0, 'Jump to latest did not resume following')
    await page.screenshot({ path: `${screenshots}/run-log.png`, fullPage: true })

    await visit(page, 6)
    const workers = page.locator('.hbar-app-ui-agent-activity-worker-list')
    await expectCount(workers.locator('> li'), 6, 'Worker rows omitted')
    await expectCount(workers.locator('.lumen-agent-activity-progress'), 4, 'Worker progress differed from data')
    await expectCount(page.getByRole('button'), 0, 'Read-only workers invented controls')

    await visit(page, 7)
    const alert = page.getByRole('alert')
    await alert.waitFor()
    const failureFacts = await alert.innerText()
    const failureUrl = page.url()
    await button('View log').click()
    assert(page.url() === failureUrl, 'View log implied navigation')
    await expectText(alert, 'Warehouse write timed out', 'View log obscured the failure')
    await button('Retry run').click()
    await expectCount(text('Preview retry request queued'), 1, 'Retry feedback was not preview-only')
    await expectText(alert, 'No new run has started', 'Retry implied an attempt')
    await expectCount(page.locator('.hbar-app-ui-agent-activity-attempt-list > div'), 2, 'Retry changed attempts')
    await expectCount(page.locator('.hbar-app-ui-agent-activity-output-list > li'), 2, 'Retry hid outputs')
    await button('Cancel retry').click()
    assert((await alert.innerText()) === failureFacts, 'Cancel did not restore failure facts')
    await expectText(notice, 'Preview request only', 'Failure actions lacked intent feedback')
    await button('Download ledger-partial.csv').click()
    assert(!downloaded, 'Download intent transferred a file')
    await expectCount(page.locator('.hbar-app-ui-agent-activity-output-list > li'), 2, 'Download hid outputs')

    await page.setViewportSize({ width: 390, height: 844 })
    await visit(page, 4)
    const cards = page.locator('.hbar-app-ui-agent-activity-history-cards > li')
    await cards.first().waitFor()
    await expectCount(cards, 14, 'Narrow history omitted runs')
    assert(
      !(await page.locator('.hbar-app-ui-agent-activity-history-table').isVisible()),
      'Narrow history duplicated the desktop table',
    )
    await page.screenshot({ path: `${screenshots}/history-mobile.png`, fullPage: true })

    await visit(page, 7, 'localized')
    await page.getByRole('heading', { name: 'Oktoberbuch-Export fehlgeschlagen', exact: true }).waitFor()
    await expectCount(button('Datei herunterladen ledger-partial.csv'), 1, 'German output label missing')
    await button('Ausführung erneut versuchen').click()
    await expectCount(button('Erneuten Versuch abbrechen'), 1, 'German retry label missing')
    await page.mouse.move(389, 843)
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${screenshots}/failure-german-mobile.png`, fullPage: true })

    assert(errors.length === 0, `Agent Activity browser errors: ${errors.join(' | ')}`)
    console.log(JSON.stringify({ variants: 7, logFlow: true, previewIntents: true, narrowFlows: 2, errors: 0 }))
  } finally {
    await browser.close()
  }
}

await run()
