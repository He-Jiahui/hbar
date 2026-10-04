import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function url(fixture?: 'localized'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-onboarding-2', mode: 'isolated' })
  if (fixture) parameters.set('onboarding2Fixture', fixture)
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
    const stepper = page.locator('[data-hbar-app-ui-component="hbar-app-ui-onboarding-2"]')
    assert((await stepper.count()) === 1, 'Onboarding 2 reference is not rendered')
    assert(
      (await stepper.getByRole('heading', { name: 'Set up your profile' }).count()) === 1,
      'Profile step is missing',
    )
    assert(
      (await stepper.getByRole('textbox', { name: 'Full name' }).inputValue()) === 'Sam Rivera',
      'Initial name differs',
    )
    assert(
      (await stepper.getByRole('textbox', { name: 'Job title' }).inputValue()) === 'Product Lead',
      'Initial job title differs',
    )
    assert((await stepper.locator('[data-onboarding2-step-id]').count()) === 6, 'Desktop rail must show six steps')

    await stepper.getByRole('textbox', { name: 'Full name' }).fill('Ada Lovelace')
    assert(
      (await stepper.getByRole('textbox', { name: 'Full name' }).inputValue()) === 'Ada Lovelace',
      'Profile draft did not update',
    )
    await stepper.getByRole('button', { name: 'Continue' }).click()
    assert(
      (await stepper.getByRole('heading', { name: 'What do you work on?' }).count()) === 1,
      'Continue did not reveal Role',
    )
    assert((await stepper.getByRole('radio').count()) === 4, 'Role must expose four radio options')
    assert(await stepper.getByRole('radio', { name: 'Product' }).isChecked(), 'Product must be selected on Role entry')
    assert(
      (await stepper.locator('[data-onboarding2-step-id="profile"][data-step-status="complete"]').count()) === 1,
      'Rail did not mark Profile complete',
    )

    await page.setViewportSize({ width: 356, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    assert(await stepper.getByText('Step 1 of 6', { exact: true }).isVisible(), 'Narrow progress text is missing')
    assert(!(await stepper.locator('[data-onboarding2-step-list]').isVisible()), 'Narrow layout should hide the rail')
    await stepper.getByRole('button', { name: 'Continue' }).click()
    assert(await stepper.getByText('Step 2 of 6', { exact: true }).isVisible(), 'Narrow Role progress did not update')
    assert(await stepper.getByRole('radio', { name: 'Product' }).isChecked(), 'Narrow Role lost default selection')

    await page.setViewportSize({ width: 286, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const continueButton = stepper.getByRole('button', { name: 'Continue' })
    const stress = await continueButton.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        continueVisible: rect.top >= 0 && rect.bottom <= window.innerHeight + 1,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        continueTop: rect.top,
        continueBottom: rect.bottom,
      }
    })
    assert(
      stress.continueVisible && !stress.horizontalOverflow,
      `286px flow is not reachable: ${JSON.stringify(stress)}`,
    )

    await page.setViewportSize({ width: 320, height: 420 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    await page.mouse.move(160, 300)
    await page.mouse.wheel(0, 5000)
    const shortHeight = await continueButton.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        continueVisible: rect.top >= 0 && rect.bottom <= window.innerHeight + 1,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
        continueTop: rect.top,
        continueBottom: rect.bottom,
      }
    })
    assert(
      shortHeight.continueVisible && !shortHeight.horizontalOverflow,
      `320px short-height Profile action is not reachable: ${JSON.stringify(shortHeight)}`,
    )

    await continueButton.click()
    const roleContinue = stepper.locator('[data-onboarding2-continue-role]')
    const roleBeforeWheel = await roleContinue.evaluate((element) => element.getBoundingClientRect().bottom)
    await page.mouse.move(160, 300)
    await page.mouse.wheel(0, 5000)
    await page.waitForFunction(() => {
      const action = document.querySelector('[data-onboarding2-continue-role]')
      if (!action) return false
      const rect = action.getBoundingClientRect()
      return rect.top >= 0 && rect.bottom <= window.innerHeight + 1
    })
    const shortHeightRole = await roleContinue.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        continueVisible: rect.top >= 0 && rect.bottom <= window.innerHeight + 1,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
        continueTop: rect.top,
        continueBottom: rect.bottom,
      }
    })
    assert(
      shortHeightRole.continueVisible && !shortHeightRole.horizontalOverflow,
      `320px short-height Role action is not reachable: ${JSON.stringify({ roleBeforeWheel, shortHeightRole })}`,
    )

    await page.goto(url('localized'), { waitUntil: 'networkidle' })
    assert(
      (await stepper.getByRole('heading', { name: 'Richten Sie Ihr Profil ein' }).count()) === 1,
      'Localized host copy is missing',
    )
    assert(pageErrors.length === 0, `Onboarding 2 preview reported page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({
        desktopProfileToRole: true,
        narrowProfileToRole: true,
        stress,
        shortHeight,
        roleBeforeWheel,
        shortHeightRole,
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
