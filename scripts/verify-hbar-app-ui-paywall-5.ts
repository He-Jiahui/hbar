import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = 'artifacts/paywall5-local-review'

function url(theme: 'light' | 'dark', locale?: 'localized' | 'long', capacity?: 'overflow'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-paywall-5', mode: 'isolated', theme })
  if (locale) parameters.set('paywall5Fixture', locale)
  if (capacity) parameters.set('paywall5Capacity', capacity)
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
      // The local preview may still be starting.
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
      stdout: 'ignore', stderr: 'ignore',
    })
    await waitForPreview()
  }
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1086, height: 600 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    const panel = page.locator('[data-hbar-app-ui-component="hbar-app-ui-paywall-5"]')
    await page.goto(url('light'), { waitUntil: 'networkidle' })
    assert((await panel.count()) === 1, 'Paywall 5 reference is not rendered')
    assert((await panel.getByRole('heading', { name: 'Your 14 days with Pro are up' }).count()) === 1,
      'Source heading missing')
    assert((await panel.locator('[data-paywall5-row-id]').count()) === 4, 'Four retained rows expected')
    assert((await panel.getByRole('button').count()) === 2, 'Two distinct requests expected')
    const desktop = await panel.evaluate((element) => {
      const rect = (selector: string) => {
        const bounds = element.querySelector(selector)!.getBoundingClientRect()
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
      }
      const root = element.getBoundingClientRect()
      return { root: { x: root.x, y: root.y, width: root.width, height: root.height },
        rows: rect('[data-paywall5-rows]'), payment: rect('.lumen-paywall5-payment'),
        reactivate: rect('[data-paywall5-reactivate]'),
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 }
    })
    assert(Math.abs(desktop.root.width - 560) < 1, 'Desktop source card width differs')
    assert(Math.abs(desktop.rows.width - (desktop.root.width - 50)) < 1, 'Retained list is not stretched in card padding')
    assert(!desktop.horizontalOverflow, 'Desktop trial card overflows')
    await panel.locator('[data-paywall5-change]').click()
    assert((await panel.getByText('Card ending 4471', { exact: true }).count()) === 1, 'Change fabricated payment update')
    assert((await panel.locator('[data-paywall5-row-id]').count()) === 4, 'Payment request mutated retained data')

    for (const theme of ['light', 'dark'] as const) {
      for (const [name, width, height] of [
        ['desktop', 1086, 600], ['tablet', 670, 640], ['mobile', 356, 640], ['stress', 286, 640],
      ] as const) {
        await page.setViewportSize({ width, height })
        await page.goto(url(theme), { waitUntil: 'networkidle' })
        assert(!(await panel.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)),
          `${theme}/${name} overflows`)
        await panel.screenshot({ path: `${output}/${theme}-${name}.png` })
      }
    }
    await page.setViewportSize({ width: 320, height: 420 })
    await page.goto(url('dark'), { waitUntil: 'networkidle' })
    await page.mouse.move(160, 300)
    await page.mouse.wheel(0, 5000)
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-paywall5-reactivate]')
      if (!button) return false
      const bounds = button.getBoundingClientRect()
      return bounds.top >= 0 && bounds.bottom <= window.innerHeight + 1
    })
    const shortHeight = await panel.locator('[data-paywall5-reactivate]').evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return { buttonTop: bounds.top, buttonBottom: bounds.bottom, scrollTop: document.scrollingElement?.scrollTop ?? 0,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 }
    })
    assert(shortHeight.scrollTop > 0 && !shortHeight.horizontalOverflow, 'Short-height reactivation action unreachable')
    await page.screenshot({ path: `${output}/dark-short-320x420.png` })
    await page.goto(url('light', 'localized'), { waitUntil: 'networkidle' })
    assert((await panel.getByRole('heading', { name: 'Deine 14 Tage mit Pro sind vorbei' }).count()) === 1,
      'German heading missing')
    await page.goto(url('light', 'long'), { waitUntil: 'networkidle' })
    assert(!(await panel.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)),
      'Long German copy overflows')
    await panel.locator('[data-paywall5-reactivate]').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/light-long-320x420.png` })

    await page.setViewportSize({ width: 390, height: 640 })
    await page.goto(url('dark', undefined, 'overflow'), { waitUntil: 'networkidle' })
    const rows = panel.getByRole('region', { name: 'Retained workspace data', exact: true })
    await rows.focus()
    await rows.press('End')
    await page.waitForFunction(() => (document.querySelector('[data-paywall5-rows]')?.scrollTop ?? 0) > 0)
    const overflow = await rows.evaluate((element) => ({ focused: document.activeElement === element,
      scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 }))
    assert(overflow.focused && overflow.scrollHeight > overflow.clientHeight && !overflow.horizontalOverflow,
      `Overflow rows not keyboard-scrollable: ${JSON.stringify(overflow)}`)
    assert((await panel.locator('[data-paywall5-row-id]').count()) === 18, 'Overflow records were dropped')
    assert(pageErrors.length === 0, `Page errors: ${pageErrors.join(' | ')}`)
    console.log(JSON.stringify({ desktop, requestOnly: true, shortHeight, localizedCopy: true, overflow, pageErrors: 0 }))
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
