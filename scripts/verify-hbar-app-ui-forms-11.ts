import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function url(fixture?: 'localized'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-forms-11', mode: 'isolated' })
  if (fixture) parameters.set('forms11Fixture', fixture)
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
    const form = page.locator('[data-hbar-app-ui-component="hbar-app-ui-forms-11"]')
    assert((await form.count()) === 1, 'Forms 11 reference is not rendered')
    assert((await page.getByRole('dialog', { name: 'New environment' }).count()) === 1, 'Dialog semantics differ')
    assert(await form.getByRole('radio', { name: 'Preview' }).isChecked(), 'Preview should be selected')
    assert(await form.getByRole('button', { name: 'Create environment' }).isDisabled(), 'Create must start disabled')
    await form.getByRole('textbox', { name: 'Name' }).fill('audit sample')
    assert(
      (await form.getByText('Deploys to audit-sample.yourapp.dev').count()) === 1,
      'Name did not update the visible deploy target',
    )
    assert(await form.getByRole('button', { name: 'Create environment' }).isEnabled(), 'Name did not enable Create')
    await form.getByRole('combobox', { name: 'Region' }).click()
    const regionOptionCount = await form.getByRole('listbox').getByRole('option').count()
    assert(regionOptionCount === 4, `Region menu should show four cached options, found ${regionOptionCount}`)

    await page.goto(url(), { waitUntil: 'networkidle' })
    const autoDeploy = form.getByRole('switch', { name: 'Auto-deploy on push' })
    assert((await autoDeploy.getAttribute('aria-checked')) === 'true', 'Auto-deploy should start checked')
    await autoDeploy.click()
    assert((await autoDeploy.getAttribute('aria-checked')) === 'false', 'Auto-deploy did not update')
    await form.getByRole('textbox', { name: 'Description' }).fill('audit sample')
    assert((await form.getByText('12 / 160').count()) === 1, 'Description count did not update')

    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto(url(), { waitUntil: 'networkidle' })
    const create = form.getByRole('button', { name: 'Create environment' })
    await create.scrollIntoViewIfNeeded()
    const narrow = await create.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        footerVisible: rect.top >= 0 && rect.top < window.innerHeight,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
      }
    })
    assert(narrow.footerVisible && !narrow.horizontalOverflow, '320px dialog footer is not reachable')

    await page.goto(url('localized'), { waitUntil: 'networkidle' })
    assert((await form.getByRole('heading', { name: 'Neue Umgebung' }).count()) === 1, 'Localized copy is missing')
    assert(pageErrors.length === 0, `Forms 11 preview reported page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({
        nameAndRegion: true,
        autoDeployAndDescription: true,
        narrow,
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
