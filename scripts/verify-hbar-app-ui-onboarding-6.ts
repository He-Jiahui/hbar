import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = 'artifacts/onboarding6-local-review'

function url(theme: 'light' | 'dark', locale?: 'localized' | 'long'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-onboarding-6', mode: 'isolated', theme })
  if (locale) parameters.set('onboarding6Fixture', locale)
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

  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1086, height: 560 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    const panel = page.locator('[data-hbar-app-ui-component="hbar-app-ui-onboarding-6"]')
    await page.goto(url('light'), { waitUntil: 'networkidle' })
    assert((await panel.count()) === 1, 'Onboarding 6 reference is not rendered')
    assert((await panel.getByRole('heading', { name: 'Your workspace is ready' }).count()) === 1, 'Heading missing')
    assert(
      (await panel.locator('dl dt').count()) === 4 && (await panel.locator('dl dd').count()) === 4,
      'Four definition pairs expected',
    )
    assert((await panel.getByRole('button').count()) === 2, 'Two next actions expected')
    const desktop = await panel.evaluate((element) => {
      const root = element.getBoundingClientRect()
      const mark = element.querySelector('.lumen-onboarding6-success')!.getBoundingClientRect()
      const title = element.querySelector('.lumen-onboarding6-title')!.getBoundingClientRect()
      const description = element.querySelector('.lumen-onboarding6-description')!.getBoundingClientRect()
      const summary = element.querySelector('[data-onboarding6-summary]')!.getBoundingClientRect()
      const actions = element.querySelector('.lumen-onboarding6-actions')!.getBoundingClientRect()
      const note = element.querySelector('.lumen-onboarding6-inbox-note')!.getBoundingClientRect()
      return {
        root: { x: root.x, y: root.y, width: root.width, height: root.height },
        mark: { y: mark.y, height: mark.height },
        title: { y: title.y, height: title.height },
        description: { y: description.y, height: description.height },
        summary: { y: summary.y, height: summary.height },
        actions: { y: actions.y, height: actions.height },
        note: { y: note.y, height: note.height },
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    assert(!desktop.horizontalOverflow, 'Desktop summary overflows')
    await panel.screenshot({ path: `${output}/light-desktop.png` })
    await panel.locator('[data-onboarding6-open]').click()
    assert(
      (await panel.getByRole('heading', { name: 'Your workspace is ready' }).count()) === 1,
      'Unverified Open fabricated navigation',
    )
    assert((await panel.locator('dl dd').count()) === 4, 'Open action mutated summary')

    for (const theme of ['light', 'dark'] as const) {
      for (const [name, width, height] of [
        ['desktop', 1086, 560],
        ['tablet', 670, 560],
        ['mobile', 390, 640],
        ['stress', 320, 640],
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
      const button = document.querySelector('[data-onboarding6-tour]')
      if (!button) return false
      const rect = button.getBoundingClientRect()
      return rect.top >= 0 && rect.bottom <= window.innerHeight + 1
    })
    const shortHeight = await panel.locator('[data-onboarding6-tour]').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        buttonTop: rect.top,
        buttonBottom: rect.bottom,
        scrollTop: document.scrollingElement?.scrollTop ?? 0,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    assert(
      shortHeight.scrollTop > 0 && !shortHeight.horizontalOverflow,
      `Short-height Tour unreachable: ${JSON.stringify(shortHeight)}`,
    )
    await page.screenshot({ path: `${output}/dark-short-320x420.png` })
    await page.goto(url('light', 'localized'), { waitUntil: 'networkidle' })
    assert(
      (await panel.getByRole('heading', { name: 'Dein Arbeitsbereich ist bereit' }).count()) === 1,
      'Localized heading missing',
    )
    await page.goto(url('light', 'long'), { waitUntil: 'networkidle' })
    assert(
      !(await panel.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)),
      'Long localized copy overflows',
    )
    assert(pageErrors.length === 0, `Page errors: ${pageErrors.join(' | ')}`)
    console.log(JSON.stringify({ desktop, sourceNoOpRequest: true, shortHeight, localizedCopy: true, pageErrors: 0 }))
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
