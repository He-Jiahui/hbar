import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function url(fixture?: 'localized'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-forms-12', mode: 'isolated' })
  if (fixture) parameters.set('forms12Fixture', fixture)
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
    const form = page.locator('[data-hbar-app-ui-component="hbar-app-ui-forms-12"]')
    assert((await form.count()) === 1, 'Forms 12 reference is not rendered')
    const sections = form.locator('[data-forms12-section]')
    assert((await sections.count()) === 4, 'Review must contain four sections')
    assert((await form.getByText('£4,088.50', { exact: true }).count()) === 1, 'Initial annual total differs')
    assert((await form.getByRole('checkbox').count()) === 2, 'Review must contain two consents')
    assert(await form.getByRole('button', { name: 'Request bound quote' }).isDisabled(), 'Request must start disabled')
    const business = form.locator('[data-forms12-section="business-details"]')
    await business.getByRole('button', { name: 'Edit' }).press('Enter')
    assert(
      (await business.getByRole('textbox', { name: 'Legal business name' }).count()) === 1,
      'Business editor is missing',
    )
    assert((await business.getByRole('combobox', { name: 'Industry' }).count()) === 1, 'Industry control is missing')
    assert(
      (await business.getByRole('spinbutton', { name: 'Number of employees' }).count()) === 1,
      'Employee control is missing',
    )
    assert(
      (await business.getByRole('button', { name: 'Save section' }).count()) === 1,
      'Save section control is missing',
    )
    assert(
      (await business.getByRole('button', { name: 'Edit', exact: true }).count()) === 0,
      'Editing section should not retain Edit',
    )
    assert(
      (await form.getByRole('button', { name: 'Edit', exact: true, disabled: true }).count()) === 3,
      'Other sections should not edit concurrently',
    )
    assert(
      (await form.getByText('£4,088.50', { exact: true }).count()) === 1,
      'Opening the editor recalculated Premium',
    )

    await page.goto(url(), { waitUntil: 'networkidle' })
    const consents = form.getByRole('checkbox')
    await consents.first().check()
    assert(await consents.first().isChecked(), 'First consent did not update')
    assert(!(await consents.nth(1).isChecked()), 'Second consent changed unexpectedly')
    assert(
      await form.getByRole('button', { name: 'Request bound quote' }).isDisabled(),
      'Unverified request gate should stay disabled',
    )

    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const request = form.getByRole('button', { name: 'Request bound quote' })
    await page.mouse.move(160, 600)
    await page.mouse.wheel(0, 5000)
    await page.waitForFunction(() => (document.scrollingElement?.scrollTop ?? 0) > 0)
    const narrow = await request.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        requestVisible: rect.top >= 0 && rect.bottom <= window.innerHeight + 1,
        requestTop: rect.top,
        requestBottom: rect.bottom,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
        documentScrollHeight: document.scrollingElement?.scrollHeight ?? 0,
      }
    })
    assert(
      narrow.requestVisible && narrow.documentScrollTop > 0 && !narrow.horizontalOverflow,
      `320px quote request is not reachable through natural document scrolling: ${JSON.stringify(narrow)}`,
    )

    await page.goto(url('localized'), { waitUntil: 'networkidle' })
    assert(
      (await form.getByRole('heading', { name: 'Unternehmensdaten' }).count()) === 1,
      'Localized host copy is missing',
    )
    assert(pageErrors.length === 0, `Forms 12 preview reported page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({ businessEdit: true, oneConsent: true, narrow, localizedHostCopy: true, pageErrors: 0 }),
    )
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
