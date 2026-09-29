import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function url(fixture?: 'localized'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-onboarding-3', mode: 'isolated' })
  if (fixture) parameters.set('onboarding3Fixture', fixture)
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
  const page = await browser.newPage({ viewport: { width: 1086, height: 720 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    await page.goto(url(), { waitUntil: 'networkidle' })
    const checklist = page.locator('[data-hbar-app-ui-component="hbar-app-ui-onboarding-3"]')
    assert((await checklist.count()) === 1, 'Onboarding 3 reference is not rendered')
    assert((await checklist.getByRole('heading', { name: 'Get set up' }).count()) === 1, 'Checklist heading is missing')
    assert((await checklist.locator('[data-onboarding3-task-id]').count()) === 6, 'Checklist must have six tasks')
    assert((await checklist.getByRole('checkbox').count()) === 6, 'Each task needs a checkbox')
    assert(
      (await checklist.locator('[data-onboarding3-task-action]').count()) === 6,
      'Each task needs one independent link',
    )
    assert((await checklist.getByText('2 of 6 done', { exact: true }).count()) === 1, 'Initial progress differs')
    const progress = checklist.getByRole('progressbar', { name: 'Setup progress' })
    assert((await progress.getAttribute('aria-valuenow')) === '2', 'Initial progressbar value differs')

    const profile = checklist.locator('[data-onboarding3-task-id="profile"]')
    const workspace = checklist.locator('[data-onboarding3-task-id="workspace"]')
    assert(await profile.getByRole('checkbox').isChecked(), 'Profile must initially be complete')
    assert(await workspace.getByRole('checkbox').isChecked(), 'Workspace must initially be complete')
    await profile.getByRole('checkbox').click()
    assert(!(await profile.getByRole('checkbox').isChecked()), 'Observed Profile uncheck did not update')
    assert(await workspace.getByRole('checkbox').isChecked(), 'Profile change mutated a different task')
    assert((await checklist.getByText('1 of 6 done', { exact: true }).count()) === 1, 'Progress did not drop to 1/6')
    assert((await progress.getAttribute('aria-valuenow')) === '1', 'Progressbar did not follow completion state')

    await page.setViewportSize({ width: 356, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    assert((await checklist.locator('[data-onboarding3-task-id]').count()) === 6, 'Narrow list lost tasks')
    const mobile = await checklist.evaluate((element) => ({
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      taskCount: element.querySelectorAll('[data-onboarding3-task-id]').length,
    }))
    assert(!mobile.horizontalOverflow, `356px checklist overflows horizontally: ${JSON.stringify(mobile)}`)

    await page.setViewportSize({ width: 320, height: 420 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const footer = checklist.locator('[data-onboarding3-footer]')
    await page.mouse.move(160, 300)
    await page.mouse.wheel(0, 5000)
    await page.waitForFunction(() => {
      const footer = document.querySelector('[data-onboarding3-footer]')
      if (!footer) return false
      const rect = footer.getBoundingClientRect()
      return rect.top >= 0 && rect.bottom <= window.innerHeight + 1
    })
    const shortHeight = await footer.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        footerVisible: rect.top >= 0 && rect.bottom <= window.innerHeight + 1,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
        footerTop: rect.top,
        footerBottom: rect.bottom,
      }
    })
    assert(
      shortHeight.footerVisible && shortHeight.documentScrollTop > 0 && !shortHeight.horizontalOverflow,
      `320px checklist footer is not reachable through natural scrolling: ${JSON.stringify(shortHeight)}`,
    )

    await page.goto(url('localized'), { waitUntil: 'networkidle' })
    assert(
      (await checklist.getByRole('heading', { name: 'Erste Schritte' }).count()) === 1,
      'Localized host copy is missing',
    )
    assert(pageErrors.length === 0, `Onboarding 3 preview reported page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({ observedProfileUncheck: true, mobile, shortHeight, localizedHostCopy: true, pageErrors: 0 }),
    )
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
