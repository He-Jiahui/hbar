import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function url(fixture?: 'localized'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-forms-9', mode: 'isolated' })
  if (fixture) parameters.set('forms9Fixture', fixture)
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
    const form = page.locator('[data-hbar-app-ui-component="hbar-app-ui-forms-9"]')
    assert((await form.count()) === 1, 'Forms 9 reference is not rendered')
    assert((await form.locator('[data-day-id]').count()) === 7, 'The seven-day schedule is incomplete')
    assert((await form.getByText('49 h', { exact: true }).count()) >= 1, 'Initial weekly total differs')
    assert(await form.getByRole('button', { name: 'Save hours' }).isDisabled(), 'Save must start disabled')
    assert(await form.getByRole('button', { name: 'Reset' }).isDisabled(), 'Reset must start disabled')

    await form.getByRole('button', { name: 'Copy Monday to weekdays' }).click()
    assert((await form.getByText('49 h', { exact: true }).count()) >= 1, 'Copy changed the total unexpectedly')
    assert(await form.getByRole('button', { name: 'Save hours' }).isEnabled(), 'Copy did not mark the draft dirty')
    await form.getByRole('switch', { name: 'Monday open' }).click()
    assert((await form.getByText('40 h', { exact: true }).count()) >= 1, 'Closing Monday did not derive 40 hours')
    await form.getByRole('checkbox', { name: 'Accept bookings on public holidays' }).check()
    assert(
      await form.getByRole('checkbox', { name: 'Accept bookings on public holidays' }).isChecked(),
      'Holiday choice did not update',
    )

    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const sunday = form.locator('[data-day-id="sunday"]')
    await sunday.scrollIntoViewIfNeeded()
    const narrow = await sunday.evaluate((element) => {
      const dayRect = element.getBoundingClientRect()
      return {
        dayVisible: dayRect.top >= 0 && dayRect.top < window.innerHeight,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
      }
    })
    const save = form.getByRole('button', { name: 'Save hours' })
    await save.scrollIntoViewIfNeeded()
    assert(
      narrow.dayVisible && !narrow.horizontalOverflow && (await save.isVisible()),
      '320px schedule/footer is not reachable',
    )

    await page.goto(url('localized'), { waitUntil: 'networkidle' })
    assert(
      (await form.getByRole('heading', { name: 'Öffnungszeiten' }).count()) === 1,
      'Localized host copy is missing',
    )
    assert(pageErrors.length === 0, `Forms 9 preview reported page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({
        weeklyTotal: '49 h → 40 h',
        copyAndHolidayDraft: true,
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
