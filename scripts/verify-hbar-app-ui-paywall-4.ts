import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = 'artifacts/paywall4-local-review'

function url(theme: 'light' | 'dark', locale?: 'localized' | 'long', capacity?: 'overflow'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-paywall-4', mode: 'isolated', theme })
  if (locale) parameters.set('paywall4Fixture', locale)
  if (capacity) parameters.set('paywall4Capacity', capacity)
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
  const page = await browser.newPage({ viewport: { width: 1086, height: 560 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    const panel = page.locator('[data-hbar-app-ui-component="hbar-app-ui-paywall-4"]')
    await page.goto(url('light'), { waitUntil: 'networkidle' })
    assert((await panel.count()) === 1, 'Paywall 4 reference is not rendered')
    assert((await panel.getByRole('heading', { name: 'You have hit the Starter limit' }).count()) === 1,
      'Source heading missing')
    assert((await panel.locator('[data-paywall4-meter-id]').count()) === 3, 'Three source quotas expected')
    assert((await panel.getByRole('button').count()) === 2, 'Two request actions expected')
    assert((await panel.getByRole('progressbar').count()) === 0, 'Passive source bars became progress controls')
    const desktop = await panel.evaluate((element) => {
      const rect = (selector: string) => {
        const bounds = element.querySelector(selector)!.getBoundingClientRect()
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
      }
      const root = element.getBoundingClientRect()
      const track = element.querySelector('[data-paywall4-meter-id="rows-processed"] .lumen-paywall4-track')!
      const fill = track.firstElementChild!.getBoundingClientRect().width / track.getBoundingClientRect().width
      return {
        root: { x: root.x, y: root.y, width: root.width, height: root.height },
        header: rect('.lumen-paywall4-header'), meters: rect('[data-paywall4-meters]'),
        card: rect('.lumen-paywall4-upgrade-card'), actions: rect('.lumen-paywall4-actions'),
        rowsProcessedFill: fill,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    assert(Math.abs(desktop.rowsProcessedFill - 0.92) < 0.001, 'Rows quota fill differs from host value')
    assert(Math.abs(desktop.meters.width - desktop.root.width) < 1 && Math.abs(desktop.card.width - desktop.root.width) < 1,
      'Quota list or upgrade card fails to stretch across the source content column')
    assert(!desktop.horizontalOverflow, 'Desktop notice overflows')
    await panel.locator('[data-paywall4-top-up]').click()
    assert((await panel.locator('[data-paywall4-meter-id]').count()) === 3, 'Request mutated passive quotas')
    assert((await panel.getByText('You have hit the Starter limit', { exact: true }).count()) === 1,
      'Top-up fabricated ingestion resume')

    for (const theme of ['light', 'dark'] as const) {
      for (const [name, width, height] of [
        ['desktop', 1086, 560], ['tablet', 670, 560], ['mobile', 356, 640], ['stress', 286, 640],
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
      const button = document.querySelector('[data-paywall4-upgrade]')
      if (!button) return false
      const bounds = button.getBoundingClientRect()
      return bounds.top >= 0 && bounds.bottom <= window.innerHeight + 1
    })
    const shortHeight = await panel.locator('[data-paywall4-upgrade]').evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return { buttonTop: bounds.top, buttonBottom: bounds.bottom, scrollTop: document.scrollingElement?.scrollTop ?? 0,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 }
    })
    assert(shortHeight.scrollTop > 0 && !shortHeight.horizontalOverflow, 'Short-height action is unreachable')
    await page.screenshot({ path: `${output}/dark-short-320x420.png` })
    await page.goto(url('light', 'localized'), { waitUntil: 'networkidle' })
    assert((await panel.getByRole('heading', { name: 'Du hast das Starter-Limit erreicht' }).count()) === 1,
      'German heading missing')
    await page.goto(url('light', 'long'), { waitUntil: 'networkidle' })
    assert(!(await panel.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)),
      'Long German copy overflows')
    await panel.locator('[data-paywall4-upgrade]').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/light-long-320x420.png` })

    await page.setViewportSize({ width: 390, height: 640 })
    await page.goto(url('dark', undefined, 'overflow'), { waitUntil: 'networkidle' })
    const meters = panel.getByRole('region', { name: 'Workspace usage quotas', exact: true })
    await meters.focus()
    await meters.press('End')
    await page.waitForFunction(() => (document.querySelector('[data-paywall4-meters]')?.scrollTop ?? 0) > 0)
    const overflow = await meters.evaluate((element) => ({ focused: document.activeElement === element,
      scrollTop: element.scrollTop, scrollHeight: element.scrollHeight, clientHeight: element.clientHeight,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1 }))
    assert(overflow.focused && overflow.scrollHeight > overflow.clientHeight && !overflow.horizontalOverflow,
      `Overflow quotas not keyboard-scrollable: ${JSON.stringify(overflow)}`)
    assert((await panel.locator('[data-paywall4-meter-id]').count()) === 17, 'Overflow rows were dropped')
    assert(pageErrors.length === 0, `Page errors: ${pageErrors.join(' | ')}`)
    console.log(JSON.stringify({ desktop, requestOnly: true, shortHeight, localizedCopy: true, overflow, pageErrors: 0 }))
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
