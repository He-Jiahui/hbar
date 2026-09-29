import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function url(fixture?: 'localized'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-forms-2', mode: 'isolated' })
  if (fixture) parameters.set('forms2Fixture', fixture)
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
    const form = page.locator('[data-hbar-app-ui-component="hbar-app-ui-forms-2"]')
    assert((await form.count()) === 1, 'Forms 2 reference is not rendered')
    const title = form.getByLabel('Session title')
    const abstract = form.getByLabel('Abstract')
    const contact = form.getByLabel('Contact address')
    assert((await form.getByText('0 of 4 ready', { exact: true }).count()) === 1, 'Readiness should start at 0/4')
    await title.fill('Instrumenting Field Robots')
    assert((await form.getByText('1 of 4 ready', { exact: true }).count()) === 1, 'Title did not change readiness')
    await abstract.fill('A'.repeat(120))
    await contact.fill('speaker@example.org')
    assert(
      (await form.getByText('3 of 4 ready', { exact: true }).count()) === 1,
      'Abstract and contact did not change readiness',
    )
    await form.getByRole('button', { name: 'Submit proposal' }).click()
    assert(
      (await form.getByText('Recording consent is required to submit.', { exact: true }).count()) === 1,
      'Invalid submission did not reveal consent validation',
    )
    await form.getByRole('radio', { name: /Hands-on workshop/ }).click()
    assert(
      (await form.getByText('Hands-on workshop runs 90 minutes', { exact: true }).count()) === 1,
      'Session format did not update duration',
    )

    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const submit = form.getByRole('button', { name: 'Submit proposal' })
    await submit.scrollIntoViewIfNeeded()
    const narrow = await submit.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        scrollTop: document.scrollingElement?.scrollTop ?? 0,
        visible: rect.top >= 0 && rect.bottom <= window.innerHeight,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    assert(narrow.scrollTop > 0 && narrow.visible && !narrow.horizontalOverflow, '320px submit is not reachable')

    await page.goto(url('localized'), { waitUntil: 'networkidle' })
    assert(
      (await form.getByLabel('Titel der Sitzung').count()) === 1,
      'Localized field copy did not come from the host fixture',
    )
    assert(pageErrors.length === 0, `Forms 2 preview reported page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({
        readinessAndValidation: true,
        formatDuration: true,
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
