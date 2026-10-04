import { chromium, expect } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 900, height: 760 } })
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

try {
  await page.clock.install()
  await page.goto(`${baseUrl}/?variant=hbar-app-ui-support-2&mode=isolated&supportOutcome=failed`, {
    waitUntil: 'domcontentloaded',
  })
  const subject = page.getByRole('textbox', { name: 'Subject', exact: true })
  await subject.fill('Keep this preview draft')
  await page
    .getByRole('textbox', { name: 'What happened?', exact: true })
    .fill('A local preview request, not a real support case.')
  await page.getByRole('button', { name: 'Submit ticket', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Submit ticket', exact: true })).toBeDisabled()
  await expect(page.getByRole('status')).toContainText('Waiting for the preview acknowledgement.')
  await page.clock.runFor(1500)
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(subject).toHaveValue('Keep this preview draft')
  await expect(page.getByRole('button', { name: 'Submit ticket', exact: true })).toBeEnabled()

  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto(`${baseUrl}/?variant=hbar-app-ui-support-2&mode=isolated&supportFixture=localized`, {
    waitUntil: 'domcontentloaded',
  })
  await page.getByRole('button', { name: 'Support-Anfrage senden', exact: true }).click()
  await page.clock.runFor(1500)
  await expect(
    page.getByText('Vorschau bestätigt. Es wurde kein echtes Support-Ticket erstellt.', { exact: true }),
  ).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  expect(errors).toEqual([])
  console.log(
    'Support ticket preview passed: pending waits for owner acknowledgement, failed draft stays editable, localized confirmation explicitly creates no real ticket; narrow layout has no horizontal overflow.',
  )
} finally {
  await browser.close()
}
