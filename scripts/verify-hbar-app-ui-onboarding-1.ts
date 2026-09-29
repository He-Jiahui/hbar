import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function url(fixture?: 'localized'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-onboarding-1', mode: 'isolated' })
  if (fixture) parameters.set('onboarding1Fixture', fixture)
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
    await page.goto(url(), { waitUntil: 'networkidle' })
    const profile = page.locator('[data-hbar-app-ui-component="hbar-app-ui-onboarding-1"]')
    assert((await profile.count()) === 1, 'Onboarding 1 reference is not rendered')
    assert(
      (await profile.getByRole('heading', { name: 'Set up your profile' }).count()) === 1,
      'Profile heading is missing',
    )
    assert(
      (await profile.getByRole('textbox', { name: /Full name/ }).inputValue()) === 'Sam Rivera',
      'Default name differs',
    )
    assert(
      (await profile.getByRole('textbox', { name: 'Job title' }).inputValue()) === 'Product Engineer',
      'Default job title differs',
    )
    assert(
      (await profile.getByRole('combobox', { name: 'Timezone' }).inputValue()) === 'berlin',
      'Default timezone differs',
    )
    assert(
      await profile.getByRole('checkbox', { name: /product updates/ }).isChecked(),
      'Default updates state differs',
    )
    assert(await profile.getByText('Directory preview').isVisible(), 'Desktop directory preview is missing')
    assert((await profile.getByText('Subscribed', { exact: true }).count()) === 1, 'Initial preview is missing updates')

    await profile.getByRole('textbox', { name: /Full name/ }).fill('Ada Lovelace')
    assert(
      (await profile.getByText('Ada Lovelace', { exact: true }).count()) === 1,
      'Host-derived directory preview did not project the local name draft',
    )

    await page.setViewportSize({ width: 356, height: 640 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    assert(!(await profile.getByText('Directory preview').isVisible()), 'Narrow layout should hide the aside')
    await profile.getByRole('checkbox', { name: /product updates/ }).uncheck()
    assert(
      !(await profile.getByRole('checkbox', { name: /product updates/ }).isChecked()),
      'Updates toggle did not change',
    )
    await profile.getByRole('combobox', { name: 'Timezone' }).selectOption('')
    assert(
      (await profile.getByRole('combobox', { name: 'Timezone' }).inputValue()) === '',
      'Native timezone placeholder was not selected',
    )

    await page.setViewportSize({ width: 286, height: 640 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const continueButton = profile.getByRole('button', { name: 'Continue' })
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
      shortHeight.continueVisible && shortHeight.documentScrollTop > 0 && !shortHeight.horizontalOverflow,
      `320px short-height flow is not reachable through natural document scrolling: ${JSON.stringify(shortHeight)}`,
    )

    await page.goto(url('localized'), { waitUntil: 'networkidle' })
    assert(
      (await profile.getByRole('heading', { name: 'Profil einrichten' }).count()) === 1,
      'Localized host copy is missing',
    )
    assert(pageErrors.length === 0, `Onboarding 1 preview reported page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({
        desktopDefault: true,
        nameProjection: 'local-inference',
        narrowToggle: true,
        timezonePlaceholder: true,
        stress,
        shortHeight,
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
