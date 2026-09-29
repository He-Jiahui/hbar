import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function url(fixture?: 'localized'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-forms-7', mode: 'isolated' })
  if (fixture) parameters.set('forms7Fixture', fixture)
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
    const form = page.locator('[data-hbar-app-ui-component="hbar-app-ui-forms-7"]')
    assert((await form.count()) === 1, 'Forms 7 reference is not rendered')
    assert((await form.getByText('0%', { exact: true }).count()) === 1, 'Application progress should start at zero')
    assert((await form.locator('.lumen-forms-7-attachment').count()) === 2, 'Expected two source attachments')
    const submit = form.getByRole('button', { name: 'Submit application' })
    assert(await submit.isDisabled(), 'Submit should start disabled')
    await form.getByRole('textbox', { name: /Project summary/ }).fill('audit sample')
    assert(
      (await form.getByText('388 left', { exact: true }).count()) === 1,
      'Summary counter did not match cached state',
    )
    assert((await form.getByText('13%', { exact: true }).count()) === 1, 'Summary did not update observed progress')
    assert(await submit.isDisabled(), 'Summary alone must not enable submission')

    await page.goto(url(), { waitUntil: 'networkidle' })
    const focus = form.getByRole('combobox', { name: /Focus area/ })
    await focus.click()
    assert((await form.getByRole('option').count()) === 5, 'Focus area did not expose five source choices')
    const consent = form.getByRole('checkbox')
    await consent.check()
    assert((await form.getByText('13%', { exact: true }).count()) === 1, 'Consent did not update observed progress')
    assert(await submit.isDisabled(), 'Consent alone must not enable submission')

    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const footer = form.locator('.lumen-forms-7-footer')
    await footer.scrollIntoViewIfNeeded()
    const narrow = await footer.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        visible: rect.top >= 0 && rect.bottom <= window.innerHeight,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
      }
    })
    assert(narrow.visible && !narrow.horizontalOverflow, '320px footer is not reachable')

    await page.goto(url('localized'), { waitUntil: 'networkidle' })
    assert(
      (await form.getByRole('heading', { name: /Antrag für den Fonds/ }).count()) === 1,
      'Localized host copy is missing',
    )
    assert(pageErrors.length === 0, `Forms 7 preview reported page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({
        cachedSummaryAndConsent: true,
        focusOptions: true,
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
