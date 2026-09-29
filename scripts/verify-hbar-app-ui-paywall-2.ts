import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function url(theme: 'light' | 'dark', fixture?: 'localized' | 'overflow'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-paywall-2', mode: 'isolated', theme })
  if (fixture) parameters.set('paywallFixture', fixture)
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
  const page = await browser.newPage({ viewport: { width: 1086, height: 640 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    const panel = page.locator('[data-hbar-app-ui-component="hbar-app-ui-paywall-2"]')
    const dialog = panel.locator('[data-paywall2-dialog]')
    await page.goto(url('light'), { waitUntil: 'networkidle' })
    assert((await dialog.getAttribute('role')) === 'dialog', 'Feature gate lacks dialog semantics')
    assert((await dialog.getAttribute('aria-label')) === 'Scheduled exports are a Pro feature', 'Dialog name differs')
    assert((await dialog.locator('[data-paywall2-feature-id]').count()) === 3, 'Three source features expected')
    assert((await dialog.getByRole('button').count()) === 3, 'Three actions expected')
    const desktop = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const footer = element.querySelector('.hbar-app-ui-paywall-feature-footer')!.getBoundingClientRect()
      return {
        dialog: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        footer: { y: footer.y, height: footer.height },
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    assert(!desktop.horizontalOverflow, `Desktop feature gate overflows: ${JSON.stringify(desktop)}`)
    await dialog.locator('[data-paywall2-action="dismiss"]').click()
    assert((await dialog.count()) === 1, 'Legacy source did not establish local Dismiss close')
    await dialog.locator('[data-paywall2-action="defer"]').click()
    assert((await dialog.count()) === 1, 'Not now fabricated close')
    await dialog.locator('[data-paywall2-action="upgrade"]').click()
    assert((await dialog.count()) === 1, 'Upgrade fabricated remote result')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(url('dark'), { waitUntil: 'networkidle' })
    const mobile = await dialog.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const actions = element.querySelector('.hbar-app-ui-paywall-feature-actions')!.getBoundingClientRect()
      return {
        dialog: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        actions: { y: actions.y, height: actions.height },
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    assert(
      !mobile.horizontalOverflow && mobile.dialog.width <= 390,
      `Mobile feature gate overflows: ${JSON.stringify(mobile)}`,
    )

    await page.setViewportSize({ width: 320, height: 420 })
    await page.goto(url('dark'), { waitUntil: 'networkidle' })
    const upgrade = dialog.locator('[data-paywall2-action="upgrade"]')
    await page.mouse.move(160, 300)
    await page.mouse.wheel(0, 5000)
    const shortHeight = await upgrade.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const pane = element.closest('.lumen-paywall')
      return {
        buttonTop: rect.top,
        buttonBottom: rect.bottom,
        paneScrollTop: pane?.scrollTop ?? 0,
        documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    assert(
      shortHeight.paneScrollTop + shortHeight.documentScrollTop > 0 && !shortHeight.horizontalOverflow,
      `Short-height upgrade unreachable: ${JSON.stringify(shortHeight)}`,
    )

    await page.goto(url('light', 'localized'), { waitUntil: 'networkidle' })
    assert(
      (await dialog.getAttribute('aria-label')) === 'Geplante Exporte sind eine Pro-Funktion',
      'Localized dialog name missing',
    )
    await page.goto(url('light', 'overflow'), { waitUntil: 'networkidle' })
    const list = dialog.locator('[data-paywall2-feature-list]')
    assert((await list.locator('[data-paywall2-feature-id]').count()) > 8, 'Over-capacity features dropped')
    await list.focus()
    await page.keyboard.press('End')
    const overflow = await list.evaluate((element) => ({
      focused: document.activeElement === element,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      scrollTop: element.scrollTop,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    }))
    assert(
      overflow.focused &&
        overflow.scrollHeight > overflow.clientHeight &&
        overflow.scrollTop > 0 &&
        !overflow.horizontalOverflow,
      `Over-capacity list not scrollable: ${JSON.stringify(overflow)}`,
    )
    assert(pageErrors.length === 0, `Page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({
        desktop,
        mobile,
        shortHeight,
        overflow,
        requestOnlyActions: true,
        localizedCopy: true,
        pageErrors: 0,
      }),
    )
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
