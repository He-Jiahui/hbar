import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function url(fixture?: 'localized'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-forms-1', mode: 'isolated' })
  if (fixture) parameters.set('formsForm1Fixture', fixture)
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
    const station = page.locator('#hbar-app-ui-forms-1-station-code')
    const originalStation = await station.inputValue()
    assert((await page.getByText('100%', { exact: true }).count()) === 1, 'Survey should start complete')
    await station.fill('')
    assert((await page.getByText('90%', { exact: true }).count()) === 1, 'Empty station code did not update completion')
    await page.getByRole('button', { name: 'Revert', exact: true }).click()
    assert((await station.inputValue()) === originalStation, 'Revert did not restore the filed station code')

    await page.getByRole('button', { name: 'Remove Benthic cores', exact: true }).click()
    await page.getByRole('button', { name: 'Remove Water column', exact: true }).click()
    assert((await page.getByText('90%', { exact: true }).count()) === 1, 'Empty method group did not update completion')
    await page.getByRole('button', { name: 'Revert', exact: true }).click()
    assert(
      (await page.getByRole('button', { name: 'Remove Benthic cores', exact: true }).count()) === 1 &&
        (await page.getByRole('button', { name: 'Remove Water column', exact: true }).count()) === 1,
      'Revert did not restore both filed sampling methods',
    )

    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const footer = page.locator('[data-hbar-app-ui-region="form-footer"]')
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
      (await page.locator('label[for="hbar-app-ui-forms-1-station-code"]')
        .getByText('Registrierter Stationscode', { exact: true }).count()) === 1,
      'Localized field copy did not come from the host fixture',
    )
    assert(pageErrors.length === 0, `Forms 1 preview reported page errors: ${pageErrors.join(' | ')}`)
    console.log(JSON.stringify({ completionAndRevert: true, narrow, localizedHostCopy: true, pageErrors: 0 }))
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
