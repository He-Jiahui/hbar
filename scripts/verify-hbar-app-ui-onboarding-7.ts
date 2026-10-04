import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = 'artifacts/onboarding7-local-review'

function url(theme: 'light' | 'dark', locale?: 'localized' | 'long'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-onboarding-7', mode: 'isolated', theme })
  if (locale) parameters.set('onboarding7Fixture', locale)
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
  const page = await browser.newPage({ viewport: { width: 1086, height: 709 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    const panel = page.locator('[data-hbar-app-ui-component="hbar-app-ui-onboarding-7"]')
    await page.goto(url('light'), { waitUntil: 'networkidle' })
    assert((await panel.count()) === 1, 'Onboarding 7 reference is not rendered')
    assert((await panel.evaluate((element) => element.tagName)) === 'FORM', 'Form semantics missing')
    assert((await panel.getByRole('combobox').locator('option').count()) === 3, 'Three source regions expected')
    const desktop = await panel.evaluate((element) => {
      const rect = (selector: string) => {
        const bounds = element.querySelector(selector)!.getBoundingClientRect()
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
      }
      const root = element.getBoundingClientRect()
      return {
        root: { x: root.x, y: root.y, width: root.width, height: root.height },
        name: rect('[data-onboarding7-name]'),
        slug: rect('[data-onboarding7-slug]'),
        region: rect('[data-onboarding7-region]'),
        privacy: rect('.lumen-onboarding7-privacy'),
        actions: rect('.lumen-onboarding7-actions'),
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    assert(!desktop.horizontalOverflow, 'Desktop form overflows')

    // One representative for each distinct observed local state mechanism.
    await panel.locator('[data-onboarding7-name]').fill('audit sample')
    assert((await panel.locator('[data-onboarding7-name]').inputValue()) === 'audit sample', 'Name edit is not retained')
    await panel.getByRole('combobox').selectOption('us-east')
    assert((await panel.getByRole('combobox').inputValue()) === 'us-east', 'Region selection is not retained')
    await panel.getByRole('switch').click()
    assert((await panel.getByRole('switch').getAttribute('aria-checked')) === 'false', 'Private switch did not toggle')
    await panel.locator('[data-onboarding7-slug]').fill('draft-only')
    assert((await panel.getByText('Members will reach it at northwind.app/northwind', { exact: true }).count()) === 1,
      'Unverified slug change fabricated a derived URL')
    await panel.locator('[data-onboarding7-continue]').click()
    assert((await panel.getByRole('heading', { name: 'Create your workspace' }).count()) === 1,
      'Continue fabricated workspace creation or navigation')
    assert((await panel.locator('[data-onboarding7-name]').inputValue()) === 'audit sample', 'Request reset local values')

    for (const theme of ['light', 'dark'] as const) {
      for (const [name, width, height] of [
        ['desktop', 1086, 709],
        ['tablet', 670, 637],
        ['mobile', 356, 738],
        ['stress', 286, 604],
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
      const button = document.querySelector('[data-onboarding7-continue]')
      if (!button) return false
      const bounds = button.getBoundingClientRect()
      return bounds.top >= 0 && bounds.bottom <= window.innerHeight + 1
    })
    const shortHeight = await panel.locator('[data-onboarding7-continue]').evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return {
        buttonTop: bounds.top,
        buttonBottom: bounds.bottom,
        scrollTop: document.scrollingElement?.scrollTop ?? 0,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    assert(shortHeight.scrollTop > 0 && !shortHeight.horizontalOverflow,
      `Short-height Continue unreachable: ${JSON.stringify(shortHeight)}`)
    await page.screenshot({ path: `${output}/dark-short-320x420.png` })
    await page.goto(url('light', 'localized'), { waitUntil: 'networkidle' })
    assert((await panel.getByRole('heading', { name: 'Erstelle deinen Arbeitsbereich' }).count()) === 1,
      'Localized heading missing')
    await page.goto(url('light', 'long'), { waitUntil: 'networkidle' })
    assert(!(await panel.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)),
      'Long localized copy overflows')
    assert((await panel.getByRole('switch').count()) === 1, 'Long copy dropped the private switch')
    await panel.locator('[data-onboarding7-continue]').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/light-long-320x420.png` })
    assert(pageErrors.length === 0, `Page errors: ${pageErrors.join(' | ')}`)
    console.log(JSON.stringify({ desktop, distinctLocalStateMechanisms: 3, requestOnlyResults: true,
      shortHeight, localizedCopy: true, pageErrors: 0 }))
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
