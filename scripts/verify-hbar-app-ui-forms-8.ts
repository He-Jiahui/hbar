import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function url(fixture?: 'localized'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-forms-8', mode: 'isolated' })
  if (fixture) parameters.set('forms8Fixture', fixture)
  return `${baseUrl}/?${parameters}`
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function waitForPreview(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return
    } catch {
      // Vite may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Preview is not reachable at ${baseUrl}`)
}

async function run(): Promise<void> {
  let server: ReturnType<typeof Bun.spawn> | undefined
  try {
    await waitForPreview()
  } catch {
    server = Bun.spawn(['bun', 'run', 'app-ui:preview', '--', '--host', '127.0.0.1', '--port', '5185'], {
      stdout: 'ignore',
      stderr: 'ignore',
    })
    await waitForPreview()
  }

  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1192, height: 800 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    await page.goto(url(), { waitUntil: 'networkidle' })
    const form = page.locator('[data-hbar-app-ui-component="hbar-app-ui-forms-8"]')
    assert((await form.count()) === 1, 'Forms 8 reference is not rendered')
    const conditions = form.locator('.lumen-forms-8-condition')
    assert((await conditions.count()) === 3, 'Rule should start with three conditions')
    assert((await form.locator('.lumen-forms-8-action-row').count()) === 2, 'Rule should start with two actions')
    const summary = form.locator('.lumen-forms-8-summary')
    assert((await summary.getByText(/all 3 conditions/).count()) === 1, 'Initial match summary differs')
    await form.getByRole('button', { name: 'Match any' }).click()
    assert((await summary.getByText(/any of the 3 conditions/).count()) === 1, 'Match mode did not update summary')
    await form.getByRole('button', { name: 'Add condition' }).click()
    assert((await conditions.count()) === 4, 'Adding a condition did not grow the draft')
    assert(
      (await summary.getByText(/any of the 4 conditions/).count()) === 1,
      'Summary did not reflect added condition',
    )

    await page.goto(url(), { waitUntil: 'networkidle' })
    const first = conditions.first()
    await first.getByRole('combobox').first().click()
    await form.getByRole('option', { name: 'Hazardous flag' }).click()
    assert(
      (await first.getByRole('group', { name: 'Hazardous flag value' }).count()) === 1,
      'Field change did not switch value control',
    )

    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const footer = form.locator('.lumen-forms-8-footer')
    await footer.scrollIntoViewIfNeeded()
    const narrow = await footer.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        visible: rect.top >= 0 && rect.bottom <= window.innerHeight,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
      }
    })
    assert(narrow.visible && !narrow.horizontalOverflow, '320px rule footer is not reachable')

    await page.goto(url('localized'), { waitUntil: 'networkidle' })
    assert(
      (await form.getByRole('heading', { name: 'Regel für die Eingangspaletten-Zuordnung' }).count()) === 1,
      'Localized host copy is missing',
    )
    assert(pageErrors.length === 0, `Forms 8 preview reported page errors: ${pageErrors.join(' | ')}`)
    console.log(JSON.stringify({ conditionMechanisms: true, narrow, localizedHostCopy: true, pageErrors: 0 }))
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
