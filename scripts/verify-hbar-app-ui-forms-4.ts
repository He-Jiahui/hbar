import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function url(fixture?: 'localized'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-forms-4', mode: 'isolated' })
  if (fixture) parameters.set('forms4Fixture', fixture)
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
    const form = page.locator('.lumen-forms-4-reference')
    assert((await form.count()) === 1, 'Forms 4 reference is not rendered')
    const rows = form.locator('.lumen-forms-4-property-row')
    assert((await rows.count()) === 11, 'Expected nine editable plus two status rows')
    await form.getByRole('button', { name: 'Edit Asset tag' }).click()
    const assetTag = form.getByRole('textbox', { name: 'Asset tag' })
    assert((await assetTag.inputValue()) === 'EQ-20841', 'Asset tag edit did not expose source draft')
    await assetTag.fill('EQ-20842')
    await form.getByRole('button', { name: 'Cancel', exact: true }).click()
    assert(
      (await form.getByRole('button', { name: 'Edit Asset tag' }).count()) === 1,
      'Cancel did not restore the property row',
    )
    assert((await form.getByText('EQ-20841', { exact: true }).count()) === 1, 'Cancel changed the saved property')
    const tracking = form.getByRole('switch', { name: 'Condition tracking' })
    assert((await tracking.getAttribute('aria-checked')) === 'true', 'Tracking should start enabled')
    await tracking.click()
    assert((await tracking.getAttribute('aria-checked')) === 'false', 'Tracking switch did not update')
    assert((await form.getByText('Manual checks only', { exact: true }).count()) === 1, 'Tracking label did not update')

    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const lastRow = rows.last()
    await lastRow.scrollIntoViewIfNeeded()
    const narrow = await lastRow.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        scrollTop: document.scrollingElement?.scrollTop ?? 0,
        visible: rect.top >= 0 && rect.bottom <= window.innerHeight,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    assert(
      narrow.scrollTop > 0 && narrow.visible && !narrow.horizontalOverflow,
      '320px final property is not reachable',
    )

    await page.goto(url('localized'), { waitUntil: 'networkidle' })
    assert((await form.getByText('Anlagenakte', { exact: true }).count()) === 1, 'Localized host copy is missing')
    assert(pageErrors.length === 0, `Forms 4 preview reported page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({ editCancel: true, trackingSwitch: true, narrow, localizedHostCopy: true, pageErrors: 0 }),
    )
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
