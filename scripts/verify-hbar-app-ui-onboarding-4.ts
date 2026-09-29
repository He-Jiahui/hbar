import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function url(localized = false): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-onboarding-4', mode: 'isolated' })
  if (localized) parameters.set('onboarding4Fixture', 'localized')
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
      // The preview may still be starting.
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
  const page = await browser.newPage({ viewport: { width: 1086, height: 720 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    await page.goto(url(), { waitUntil: 'networkidle' })
    const panel = page.locator('[data-hbar-app-ui-component="hbar-app-ui-onboarding-4"]')
    assert((await panel.count()) === 1, 'Onboarding 4 reference is not rendered')
    assert(
      (await panel.getByRole('heading', { name: 'What will you use this for first?' }).count()) === 1,
      'Heading missing',
    )
    assert(
      (await panel.getByRole('radiogroup', { name: 'Primary use case' }).getByRole('radio').count()) === 6,
      'Six radio choices expected',
    )
    assert((await panel.locator('[data-onboarding4-team-size]').count()) === 4, 'Four team sizes expected')
    const roadmap = panel.locator('[data-onboarding4-use-case-id="plan-roadmap"]')
    const sprints = panel.locator('[data-onboarding4-use-case-id="run-sprints"]')
    const justMe = panel.locator('[data-onboarding4-team-size="just-me"]')
    const twoToTen = panel.locator('[data-onboarding4-team-size="2-10"]')
    assert((await sprints.getAttribute('aria-checked')) === 'true', 'Run sprints should initially be checked')
    assert((await twoToTen.getAttribute('aria-pressed')) === 'true', '2–10 should initially be pressed')
    await roadmap.click()
    assert((await roadmap.getAttribute('aria-checked')) === 'true', 'Plan a roadmap did not become checked')
    assert((await sprints.getAttribute('aria-checked')) === 'false', 'Previous use case stayed checked')
    await justMe.click()
    assert((await justMe.getAttribute('aria-pressed')) === 'true', 'Just me did not become pressed')
    assert((await twoToTen.getAttribute('aria-pressed')) === 'false', 'Previous team size stayed pressed')
    assert((await roadmap.getAttribute('aria-checked')) === 'true', 'Team size changed the radio choice')

    await page.setViewportSize({ width: 356, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const mobile = await panel.evaluate(() => ({
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      useCases: document.querySelectorAll('[data-onboarding4-use-case-id]').length,
      sizes: document.querySelectorAll('[data-onboarding4-team-size]').length,
    }))
    assert(
      !mobile.horizontalOverflow && mobile.useCases === 6 && mobile.sizes === 4,
      `Narrow layout failed: ${JSON.stringify(mobile)}`,
    )

    await page.setViewportSize({ width: 320, height: 420 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    await page.mouse.move(160, 300)
    await page.mouse.wheel(0, 5000)
    const continueButton = panel.locator('[data-onboarding4-continue]')
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-onboarding4-continue]')
      if (!button) return false
      const rect = button.getBoundingClientRect()
      return rect.top >= 0 && rect.bottom <= window.innerHeight + 1
    })
    const shortHeight = await continueButton.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        visible: rect.top >= 0 && rect.bottom <= window.innerHeight + 1,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
        buttonTop: rect.top,
        buttonBottom: rect.bottom,
      }
    })
    assert(
      shortHeight.visible && shortHeight.documentScrollTop > 0 && !shortHeight.horizontalOverflow,
      `Short-height controls unreachable: ${JSON.stringify(shortHeight)}`,
    )
    await page.goto(url(true), { waitUntil: 'networkidle' })
    assert(
      (await panel.getByRole('heading', { name: 'Wofür möchten Sie den Arbeitsbereich zuerst nutzen?' }).count()) === 1,
      'Localized heading missing',
    )
    assert(pageErrors.length === 0, `Page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({
        observedRadioSelection: true,
        observedSizeSelection: true,
        mobile,
        shortHeight,
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
