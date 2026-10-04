import { chromium, type Page } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
type Fixture = 'sign-in-retry' | 'sign-in-unavailable' | 'sign-in-empty' | 'sign-in-one' | 'sign-in-duplicate' | 'sign-in-overbound' | 'localized'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function open(page: Page, fixture?: Fixture) {
  const params = new URLSearchParams({ variant: 'hbar-app-ui-authentication-1', mode: 'isolated', theme: 'light' })
  if (fixture) params.set('authenticationFixture', fixture)
  await page.goto(`${baseUrl}/?${params}`, { waitUntil: 'networkidle' })
  return page.locator('[data-hbar-app-ui-component="hbar-app-ui-authentication-1"]')
}

async function credentials(page: Page) {
  await page.getByRole('textbox', { name: 'Email or username' }).fill('dana@example.com')
  await page.getByPlaceholder('Enter your password').fill('secret-password')
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1086, height: 640 } })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    let root = await open(page)
    assert(await root.locator('form').count() === 1, 'Source sign-in form semantics are missing')
    const emailInput = root.getByRole('textbox', { name: 'Email or username' })
    const neutralBorder = await emailInput.evaluate((element) => getComputedStyle(element).borderColor)
    await root.getByRole('button', { name: 'Sign in' }).click()
    assert(await root.getByRole('alert').innerText() === 'Enter a valid email address.', 'Invalid email has no adjacent feedback')
    assert(await emailInput.evaluate((element) => getComputedStyle(element).borderColor) !== neutralBorder, 'Invalid email lost its border feedback')
    await root.getByRole('textbox', { name: 'Email or username' }).fill('dana@example.com')
    await root.getByRole('button', { name: 'Sign in' }).click()
    assert(await root.getByRole('alert').innerText() === 'Passwords are at least 8 characters.', 'Missing password has no adjacent feedback')
    await root.getByRole('button', { name: 'Show password' }).click()
    assert(await root.getByRole('button', { name: 'Hide password' }).count() === 1, 'Reveal did not update its accessible name')
    const remember = root.getByRole('checkbox', { name: 'Keep me signed in for 30 days' })
    await remember.click()
    assert(!(await remember.isChecked()), 'Remember-me state did not toggle')
    await root.getByPlaceholder('Enter your password').fill('secret-password')
    await root.getByRole('button', { name: 'Sign in' }).click()
    assert(await root.getByRole('button', { name: 'Signing in' }).isDisabled(), 'A pending host request can be submitted twice')
    assert(await root.locator('.hbar-app-ui-auth-sign-in-spinner').count() === 1, 'Pending submission has no inline progress mark')
    await root.getByRole('status').filter({ hasText: 'Signed in' }).waitFor({ timeout: 5000 })

    root = await open(page, 'sign-in-retry')
    await credentials(page)
    await root.getByRole('button', { name: 'Sign in' }).click()
    await root.getByRole('alert').filter({ hasText: 'Sign-in failed. Try again.' }).waitFor()
    assert(await root.getByRole('button', { name: 'Sign in' }).isEnabled(), 'Failed sign-in cannot be retried')
    await root.getByRole('button', { name: 'Sign in' }).click()
    await root.getByRole('status').filter({ hasText: 'Signed in' }).waitFor({ timeout: 5000 })
    root = await open(page)
    await credentials(page)
    await root.getByRole('button', { name: 'Sign in' }).click()
    assert(await root.getByRole('button', { name: 'Signing in' }).isDisabled(), 'Cancellation test did not enter pending state')
    root = await open(page, 'sign-in-unavailable')
    assert(await root.getByRole('button', { name: 'Sign in' }).isDisabled(), 'Missing host capability allows a fake sign-in')
    assert(await root.getByText('Sign-in is unavailable.').count() === 1, 'Missing capability has no nearby explanation')

    for (const [fixture, expected] of [['sign-in-empty', 0], ['sign-in-one', 1], ['sign-in-duplicate', 3], ['sign-in-overbound', 5]] as const) {
      root = await open(page, fixture)
      assert(await root.locator('.hbar-app-ui-auth-provider-buttons button').count() === expected, `${fixture} provider cardinality differs`)
      assert(await root.getByText('Or continue with').count() === (expected ? 1 : 0), `${fixture} divider is orphaned`)
    }
    for (const width of [356, 286, 280]) {
      await page.setViewportSize({ width, height: 640 })
      root = await open(page, 'localized')
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px localized card overflows horizontally`)
      assert(await root.getByRole('textbox', { name: 'Email or username' }).isVisible(), `${width}px email is inaccessible`)
      assert(await root.getByRole('button', { name: 'Anmelden' }).isVisible(), `${width}px submit is inaccessible`)
    }
    assert(errors.length === 0, `Sign-in preview page errors: ${errors.join(' | ')}`)
    console.log(JSON.stringify({ workflow: 'authentication-sign-in', validation: true, confirmed: true, retry: true, cancellation: true, unavailable: true, providerCounts: [0, 1, 3, 5], widths: [356, 286, 280], pageErrors: 0 }))
  } finally {
    await browser.close()
  }
}

if (import.meta.main) await main()
