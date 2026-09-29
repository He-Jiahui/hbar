import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function url(fixture?: 'localized'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-forms-5', mode: 'isolated' })
  if (fixture) parameters.set('forms5Fixture', fixture)
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
  const page = await browser.newPage({ viewport: { width: 1192, height: 800 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    await page.goto(url(), { waitUntil: 'networkidle' })
    const form = page.locator('[data-hbar-app-ui-component="hbar-app-ui-forms-5"]')
    assert((await form.count()) === 1, 'Forms 5 reference is not rendered')
    const create = form.getByRole('button', { name: 'Create workspace' })
    assert(await create.isDisabled(), 'Workspace creation should start disabled')
    assert(
      (await form.getByText('Complete every required field to continue.', { exact: true }).count()) === 1,
      'Initial status differs from source',
    )
    const password = form.getByRole('textbox', { name: 'Password', exact: true })
    assert((await password.getAttribute('type')) === 'password', 'Password should start masked')
    await form.getByRole('button', { name: 'Show password' }).click()
    assert((await password.getAttribute('type')) === 'text', 'Show password did not change the input type')
    await form.getByRole('button', { name: 'Hide password' }).click()
    assert((await password.getAttribute('type')) === 'password', 'Hide password did not restore masking')
    await form.getByRole('radio', { name: /Solo/ }).check()
    assert(await form.getByRole('radio', { name: /Solo/ }).isChecked(), 'Plan selection did not update')
    assert(await create.isDisabled(), 'Plan selection alone must not enable creation')

    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const footer = form.locator('[data-hbar-app-ui-region="workspace-footer"]')
    await footer.scrollIntoViewIfNeeded()
    const narrow = await footer.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const owner = element
        .closest('[data-hbar-app-ui-component="hbar-app-ui-forms-5"]')
        ?.querySelector('[data-hbar-app-ui-scroll-owner="workspace-form"]')
      return {
        visible: rect.top >= 0 && rect.bottom <= window.innerHeight,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        formScrollHeight: owner?.scrollHeight ?? 0,
        formClientHeight: owner?.clientHeight ?? 0,
      }
    })
    assert(narrow.visible && !narrow.horizontalOverflow, '320px create footer is not reachable')
    assert(narrow.formScrollHeight > narrow.formClientHeight, '320px form body should own overflow')

    await page.goto(url('localized'), { waitUntil: 'networkidle' })
    assert(
      (await form.getByText('Arbeitsbereich bereitstellen', { exact: true }).count()) === 1,
      'Localized host copy is missing',
    )
    assert(pageErrors.length === 0, `Forms 5 preview reported page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({ passwordVisibility: true, planSelection: true, narrow, localizedHostCopy: true, pageErrors: 0 }),
    )
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
