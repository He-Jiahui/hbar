import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function url(fixture?: 'localized'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-forms-3', mode: 'isolated' })
  if (fixture) parameters.set('formsForm3Fixture', fixture)
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
    const form = page.locator('[data-hbar-app-ui-component="hbar-app-ui-forms-3"]')
    assert((await form.count()) === 1, 'Forms 3 reference is not rendered')
    const rows = form.locator('.lumen-forms-3-line-row')
    const total = form.locator('.lumen-forms-3-grand-total')
    assert((await rows.count()) === 3, 'Cached booking should start with three cargo lines')
    assert((await total.getByText('EUR 2,937.81').count()) === 1, 'Initial grand total differs from cached source')
    assert(
      await form.getByRole('button', { name: 'Book shipment' }).isDisabled(),
      'Unverified booking path must remain disabled',
    )
    await rows.first().getByRole('textbox', { name: 'Quantity' }).fill('20')
    assert((await total.getByText('EUR 3,027.06').count()) === 1, 'Quantity edit did not recalculate the total')
    await form.getByRole('button', { name: 'Add line' }).click()
    assert((await rows.count()) === 4, 'Adding a cargo line did not grow the list')
    await rows.last().getByRole('button', { name: 'Remove line' }).click()
    assert((await rows.count()) === 3, 'Removing the new cargo line did not restore list capacity')

    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const footer = form.locator('[data-hbar-app-ui-region="booking-footer"]')
    await footer.scrollIntoViewIfNeeded()
    const narrow = await footer.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        scrollTop: document.scrollingElement?.scrollTop ?? 0,
        visible: rect.top >= 0 && rect.bottom <= window.innerHeight,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    assert(narrow.scrollTop > 0 && narrow.visible && !narrow.horizontalOverflow, '320px footer is not reachable')

    await page.goto(url('localized'), { waitUntil: 'networkidle' })
    assert(
      (await form.getByText('Neue Frachtbuchung', { exact: true }).count()) === 1,
      'Host localized copy is missing',
    )
    assert((await total.getByText('EUR 2.937,81').count()) === 1, 'Host localized amount formatting is missing')
    assert(pageErrors.length === 0, `Forms 3 preview reported page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({
        cachedBaseline: true,
        localLineMechanisms: true,
        narrow,
        localizedHostCopy: true,
        pageErrors: 0,
      }),
    )
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
