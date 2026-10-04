import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const output = 'artifacts/authentication-core-review'
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1086, height: 700 } })
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

function url(variant: number, localized = false): string {
  const parameters = new URLSearchParams({ variant: `hbar-app-ui-authentication-${variant}`, mode: 'isolated' })
  if (localized) parameters.set('authenticationFixture', 'localized')
  return `${baseUrl}/?${parameters}`
}

try {
  await mkdir(output, { recursive: true })
  await page.clock.install()
  // One mail-flow branch, not every button/gesture/viewport combination.
  await page.goto(url(5), { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-auth5-phase]')).toHaveAttribute('data-auth5-phase', 'sent')
  await page.screenshot({ path: `${output}/magic-link-desktop.png` })
  await page.locator('[data-auth5-action="different-email"]').click()
  const email = page.locator('[data-auth5-field="email"]')
  await email.fill('invalid')
  await email.press('Enter')
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await email.fill('preview@example.test')
  await email.press('Enter')
  await expect(page.locator('.hbar-app-ui-auth-magic-link-summary-value').first()).toHaveText('preview@example.test')
  await page.clock.runFor(46_000)
  await expect(page.locator('[data-auth5-action="resend"]')).toBeEnabled()

  // Narrow long-copy flow is shared with the unchanged natural-flow stylesheet.
  await page.setViewportSize({ width: 320, height: 480 })
  await page.goto(url(5, true), { waitUntil: 'domcontentloaded' })
  await page.locator('[data-auth5-action="different-email"]').click()
  await page.locator('[data-auth5-field="email"]').waitFor()
  await page.screenshot({ path: `${output}/magic-link-long-narrow.png`, fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)

  // Verification's distinct asynchronous cancellation path; repeated input modes are inferred.
  await page.goto(url(6), { waitUntil: 'domcontentloaded' })
  const digits = page.locator('.hbar-app-ui-auth-code-digits input')
  for (let digit = 0; digit < 6; digit += 1) await digits.nth(digit).fill(String(digit + 1))
  await expect(page.getByRole('button', { name: 'Verifying', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Use a recovery code', exact: true }).click()
  await page.clock.runFor(1200)
  await expect(page.getByRole('heading', { name: 'Enter a recovery code' })).toBeVisible()
  const recovery = page.getByRole('textbox', { name: 'Recovery code' })
  await recovery.fill('ABCDE-12345')
  await recovery.press('Enter')
  await page.clock.runFor(1200)
  await expect(page.getByRole('heading', { name: 'Device verified' })).toBeVisible()

  // SSO uses a different pending timer but the same owner/ticket lifecycle.
  await page.goto(url(8), { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Continue with Okta', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Redirecting', exact: true })).toBeDisabled()
  await page.clock.runFor(2000)
  await expect(page.getByRole('button', { name: 'Continue with Okta', exact: true })).toBeEnabled()
  expect(errors).toEqual([])
  console.log(
    'Authentication core flows passed: mail/validation/countdown, verification cancellation/completion, SSO wait; narrow long copy has no horizontal overflow. Shared layouts/gestures inferred; no strict matrix or remote-service claims.',
  )
} finally {
  await browser.close()
}
