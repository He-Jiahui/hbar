import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function url(fixture?: 'localized'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-forms-10', mode: 'isolated' })
  if (fixture) parameters.set('forms10Fixture', fixture)
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
    const form = page.locator('[data-hbar-app-ui-component="hbar-app-ui-forms-10"]')
    assert((await form.count()) === 1, 'Forms 10 reference is not rendered')
    assert((await form.getByText('0 / 7 answered').count()) === 1, 'Initial question count differs')
    assert((await form.getByRole('radio').count()) === 31, 'NPS and matrix radio inventory differs')
    assert((await form.getByRole('checkbox').count()) === 6, 'Highlight choices differ')
    assert(await form.getByRole('button', { name: 'Submit feedback' }).isDisabled(), 'Submit must start disabled')

    await form.getByRole('radio', { name: '0 out of 10', exact: true }).click()
    assert((await form.getByText('1 / 8 answered').count()) === 1, 'Low score did not change question count')
    assert((await form.getByText('Required because you scored 6 or below.').count()) === 1, 'Follow-up is missing')
    await form
      .getByRole('radiogroup', { name: 'The room was clean and well kept' })
      .getByRole('radio', { name: 'The room was clean and well kept: Good', exact: true })
      .check()
    assert((await form.getByText('2 / 8 answered').count()) === 1, 'Matrix answer did not update progress')
    await form.getByRole('checkbox', { name: 'The location' }).check()
    assert((await form.getByText('3 / 8 answered').count()) === 1, 'Highlight answer did not update progress')
    assert(await form.getByRole('button', { name: 'Submit feedback' }).isDisabled(), 'Partial survey must not submit')

    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const submit = form.getByRole('button', { name: 'Submit feedback' })
    await submit.scrollIntoViewIfNeeded()
    const narrow = await submit.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        footerVisible: rect.top >= 0 && rect.top < window.innerHeight,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
      }
    })
    assert(narrow.footerVisible && !narrow.horizontalOverflow, '320px survey footer is not reachable')

    await page.goto(url('localized'), { waitUntil: 'networkidle' })
    assert(
      (await form.getByRole('heading', { name: 'Wie war Ihr Aufenthalt?' }).count()) === 1,
      'Localized host copy is missing',
    )
    assert(pageErrors.length === 0, `Forms 10 preview reported page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({
        lowScoreBranch: true,
        matrixAndHighlights: true,
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
