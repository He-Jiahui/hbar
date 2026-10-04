import { chromium, expect, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = resolve('artifacts/notifications-core-review')

async function open(page: Page, variant: number, fixtureKey: string, fixture: string) {
  const query = new URLSearchParams({
    mode: 'isolated',
    variant: `hbar-app-ui-notifications-${variant}`,
    theme: 'light',
    [fixtureKey]: fixture,
  })
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded' })
  const root = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-notifications-${variant}"]`)
  await expect(root).toBeVisible()
  return root
}

async function main(): Promise<void> {
  if (!(await fetch(baseUrl)).ok) throw new Error('Existing production preview unavailable; no automatic server start')
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1086, height: 680 } })
  const diagnostics: string[] = []
  const checks: string[] = []
  page.on('pageerror', (error) => diagnostics.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(message.text())
  })
  try {
    const preferences = await open(page, 3, 'notificationsFixture', 'retry')
    const save = preferences.getByRole('button', { name: 'Save preferences', exact: true })
    await preferences.getByRole('switch', { name: 'Assigned to you: Push' }).click()
    await expect(preferences.getByRole('banner')).toContainText('15 of 21 deliveries enabled')
    await save.click()
    await expect(preferences.getByRole('contentinfo')).toContainText('Could not save preferences. Try again.')
    await expect(save).toBeEnabled()
    await save.click()
    await expect(preferences.getByRole('contentinfo')).toContainText('All changes saved')
    await expect(save).toBeDisabled()
    checks.push('Preferences: draft changes summary, failed local callback retains draft, retry confirms locally')

    const bellRoot = await open(page, 6, 'bellFixture', '')
    await bellRoot.getByRole('button', { name: 'Notifications, 3 unread' }).click()
    const dialog = bellRoot.getByRole('dialog', { name: 'Notifications' })
    await expect(dialog.getByRole('listitem')).toHaveCount(5)
    await dialog.getByRole('button', { name: /Ana Reyes mentioned/ }).click()
    await expect(bellRoot.getByRole('button', { name: 'Notifications, 2 unread' })).toBeVisible()
    await dialog.getByRole('tab', { name: 'Unread' }).click()
    await expect(dialog.getByRole('listitem')).toHaveCount(2)
    await dialog.getByRole('tab', { name: 'Unread' }).press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(bellRoot.getByRole('button', { name: 'Notifications, 2 unread' })).toBeFocused()
    checks.push('Bell: exact-row local confirmation, derived unread filter, Escape returns trigger focus')

    await page.setViewportSize({ width: 286, height: 420 })
    const narrow = await open(page, 6, 'bellFixture', 'localized')
    await narrow.getByRole('button', { name: 'Benachrichtigungen, 3 ungelesen' }).press('Space')
    const panel = narrow.getByRole('dialog', { name: 'Benachrichtigungen' })
    await expect(panel.getByRole('tab', { name: 'Ungelesen' })).toBeInViewport()
    const readAll = panel.locator('[data-hbar-app-ui-action="mark-all"]')
    await expect(readAll).toBeInViewport({ ratio: 1 })
    await expect(panel.getByRole('button', { name: 'Benachrichtigungszentrale öffnen' })).toBeInViewport()
    const fits = await panel.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return (
        rect.left >= 0 &&
        rect.right <= innerWidth + 1 &&
        rect.bottom <= innerHeight + 1 &&
        document.documentElement.scrollWidth <= innerWidth + 1
      )
    })
    if (!fits) throw new Error('Narrow localized notification panel hides key content or overflows')
    await page.screenshot({ path: resolve(output, 'bell-narrow.png') })
    await readAll.press('Space')
    await expect(narrow.getByRole('button', { name: 'Benachrichtigungen, 0 ungelesen' })).toBeVisible()
    checks.push(
      'Narrow localized bell: full mark-all control, filters and footer are reachable; keyboard confirmation works',
    )
    if (diagnostics.length) throw new Error(diagnostics.join('\n'))
    const report = {
      standard: 'distinct core mechanisms and one natural narrow flow; no matrix',
      checks,
      diagnostics,
      reusedUnchangedVariants: [1, 2, 4, 5],
      freshStrictAcceptance: false,
      realPersistence: false,
    }
    await writeFile(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    console.log(
      JSON.stringify({ checks: checks.length, diagnostics: diagnostics.length, freshStrictAcceptance: false }),
    )
  } finally {
    await browser.close()
  }
}

if (import.meta.main) await main()
