import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function url(fixture?: 'localized'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-forms-6', mode: 'isolated' })
  if (fixture) parameters.set('forms6Fixture', fixture)
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
    const form = page.locator('[data-hbar-app-ui-component="hbar-app-ui-forms-6"]')
    assert((await form.count()) === 1, 'Forms 6 reference is not rendered')
    const summary = form.locator('[data-hbar-app-ui-region="order-summary"]')
    assert(
      (await summary.locator('.lumen-forms-6-cart-line').count()) === 3,
      'Source order should start with three items',
    )
    assert(
      (await summary.locator('.lumen-forms-6-total').getByText('$275.59').count()) === 1,
      'Initial total differs from source',
    )
    const pay = form.getByRole('button', { name: 'Pay $275.59' })
    assert(await pay.isDisabled(), 'Pay should start disabled')
    await summary.getByRole('radio', { name: /Express/ }).check()
    assert(
      (await summary.locator('.lumen-forms-6-total').getByText('$289.59').count()) === 1,
      'Express shipping did not update total',
    )
    const billing = form.getByRole('checkbox', { name: 'Billing address matches delivery' })
    assert(await billing.isChecked(), 'Billing match should start checked')
    await billing.uncheck()
    assert(
      (await form.getByRole('heading', { name: 'Billing address' }).count()) === 1,
      'Billing fields disappeared after unchecking',
    )
    await billing.check()

    const delivery = form.locator('.lumen-forms-6-address-section').first()
    await delivery.getByLabel('Country').selectOption('ca')
    assert((await delivery.getByLabel('Province').count()) === 1, 'Canada did not switch region to Province')
    await delivery.getByLabel('Province').selectOption('ontario')
    assert((await delivery.getByLabel('Province').inputValue()) === 'ontario', 'Province selection did not update')

    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const footer = form.locator('[data-hbar-app-ui-region="checkout-footer"]')
    await footer.scrollIntoViewIfNeeded()
    const narrow = await footer.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        visible: rect.top >= 0 && rect.bottom <= window.innerHeight,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
      }
    })
    assert(
      narrow.visible && !narrow.horizontalOverflow && narrow.documentScrollTop > 0,
      '320px Pay footer is not reachable',
    )
    assert(await form.getByRole('button', { name: 'Pay $275.59' }).isDisabled(), 'Pay should remain disabled')

    await page.goto(url('localized'), { waitUntil: 'networkidle' })
    assert((await form.getByRole('heading', { name: 'Kasse' }).count()) === 1, 'Localized host copy is missing')
    assert(pageErrors.length === 0, `Forms 6 preview reported page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({
        sourceBaseline: true,
        shippingAndAddress: true,
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
