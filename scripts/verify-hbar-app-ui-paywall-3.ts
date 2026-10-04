import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = 'artifacts/paywall3-local-review'

function url(theme: 'light' | 'dark', locale?: 'localized' | 'long', capacity?: 'overflow'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-paywall-3', mode: 'isolated', theme })
  if (locale) parameters.set('paywall3Fixture', locale)
  if (capacity) parameters.set('paywall3Capacity', capacity)
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
      stdout: 'ignore',
      stderr: 'ignore',
    })
    await waitForPreview()
  }
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1086, height: 560 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    const panel = page.locator('[data-hbar-app-ui-component="hbar-app-ui-paywall-3"]')
    const pro = panel.locator('[data-paywall3-plan-id="pro"]')
    const scale = panel.locator('[data-paywall3-plan-id="scale"]')
    await page.goto(url('light'), { waitUntil: 'networkidle' })
    assert((await panel.count()) === 1, 'Paywall 3 reference is not rendered')
    assert((await panel.locator('[data-paywall3-plan-id]').count()) === 3, 'Three source plans expected')
    assert(
      !(await panel.getByRole('button', { name: 'Your current plan', exact: true }).isEnabled()),
      'Current plan action became selectable',
    )
    assert(
      (await pro.getByText('$19', { exact: true }).count()) === 1 &&
        (await scale.getByText('$54', { exact: true }).count()) === 1,
      'Initial yearly prices differ from source',
    )
    const desktop = await panel.evaluate((element) => {
      const root = element.getBoundingClientRect()
      const plans = element.querySelector('[data-paywall3-plans]')!.getBoundingClientRect()
      const tabs = Array.from(element.querySelectorAll('[role="tab"]')).map((tab) => (tab as HTMLElement).tabIndex)
      const cards = Array.from(element.querySelectorAll('[data-paywall3-plan-id]')).map((card) => {
        const bounds = card.getBoundingClientRect()
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
      })
      return {
        root: { x: root.x, y: root.y, width: root.width, height: root.height },
        plansWidth: plans.width,
        cards,
        tabs,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    assert(
      Math.abs(desktop.root.width - 900) < 1 && Math.abs(desktop.plansWidth - desktop.root.width) < 1,
      'Plan column failed to preserve source width/stretch',
    )
    assert(
      desktop.tabs.every((index) => index === 0),
      'Unselected native period button is unreachable by Tab',
    )
    assert(!desktop.horizontalOverflow, 'Desktop plans overflow')

    await panel.getByRole('tab', { name: 'Monthly', exact: true }).click()
    assert(
      (await pro.getByText('$24', { exact: true }).count()) === 1 &&
        (await scale.getByText('$68', { exact: true }).count()) === 1,
      'Monthly period did not project both prices',
    )
    assert(
      (await panel.getByText('Monthly billing, cancel before the next renewal.', { exact: true }).count()) === 1,
      'Monthly note did not change with the period',
    )
    await panel.getByRole('tab', { name: 'Yearly', exact: true }).press('Enter')
    assert(
      (await pro.getByText('$19', { exact: true }).count()) === 1,
      'Native keyboard activation failed to restore yearly price',
    )
    await pro.getByRole('button', { name: 'Choose Pro', exact: true }).click()
    assert(
      !(await panel.getByRole('button', { name: 'Your current plan', exact: true }).isEnabled()),
      'Selection request fabricated a new current plan',
    )
    assert((await pro.getByText('$19', { exact: true }).count()) === 1, 'Request reset the period or mutated price')

    for (const theme of ['light', 'dark'] as const) {
      for (const [name, width, height] of [
        ['desktop', 1086, 560],
        ['tablet', 670, 640],
        ['mobile', 356, 640],
        ['stress', 286, 640],
      ] as const) {
        await page.setViewportSize({ width, height })
        await page.goto(url(theme), { waitUntil: 'networkidle' })
        assert(
          !(await panel.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)),
          `${theme}/${name} overflows`,
        )
        await panel.screenshot({ path: `${output}/${theme}-${name}.png` })
      }
    }
    await page.setViewportSize({ width: 320, height: 420 })
    await page.goto(url('dark'), { waitUntil: 'networkidle' })
    await page.mouse.move(160, 300)
    await page.mouse.wheel(0, 5000)
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-paywall3-compare]')
      if (!button) return false
      const bounds = button.getBoundingClientRect()
      return bounds.top >= 0 && bounds.bottom <= window.innerHeight + 1
    })
    const shortHeight = await panel.locator('[data-paywall3-compare]').evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return {
        buttonTop: bounds.top,
        buttonBottom: bounds.bottom,
        scrollTop: document.scrollingElement?.scrollTop ?? 0,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    assert(shortHeight.scrollTop > 0 && !shortHeight.horizontalOverflow, 'Short-height compare action is unreachable')
    await page.screenshot({ path: `${output}/dark-short-320x420.png` })
    await page.goto(url('light', 'localized'), { waitUntil: 'networkidle' })
    assert(
      (await panel.getByRole('heading', { name: 'Wähle einen Plan, um fortzufahren' }).count()) === 1,
      'German heading missing',
    )
    await page.goto(url('light', 'long'), { waitUntil: 'networkidle' })
    assert(
      !(await panel.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)),
      'Long German copy overflows',
    )
    await panel.locator('[data-paywall3-compare]').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/light-long-320x420.png` })

    await page.setViewportSize({ width: 1086, height: 640 })
    await page.goto(url('dark', undefined, 'overflow'), { waitUntil: 'networkidle' })
    const plans = panel.getByRole('region', { name: 'Choose a plan to continue', exact: true })
    await plans.focus()
    await plans.press('End')
    await page.waitForFunction(() => (document.querySelector('[data-paywall3-plans]')?.scrollTop ?? 0) > 0)
    const overflow = await plans.evaluate((element) => ({
      focused: document.activeElement === element,
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      firstCardWidth: element.querySelector('[data-paywall3-plan-id]')!.getBoundingClientRect().width,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    }))
    assert(
      overflow.focused &&
        overflow.scrollHeight > overflow.clientHeight &&
        overflow.firstCardWidth > 250 &&
        !overflow.horizontalOverflow,
      `Overflow plans squeezed or unreachable: ${JSON.stringify(overflow)}`,
    )
    assert((await panel.locator('[data-paywall3-plan-id]').count()) === 15, 'Overflow cards were dropped')
    assert(pageErrors.length === 0, `Page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({
        desktop,
        periodAndKeyboard: true,
        requestOnlySelection: true,
        shortHeight,
        localizedCopy: true,
        overflow,
        pageErrors: 0,
      }),
    )
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
