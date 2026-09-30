import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const output = 'artifacts/integrations-reference-core-review'
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1086, height: 760 } })
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

function url(variant: number, localized = false): string {
  const parameters = new URLSearchParams({ variant: `hbar-app-ui-integrations-${variant}`, mode: 'isolated' })
  if (localized) parameters.set('integrationsFixture', 'localized')
  return `${baseUrl}/?${parameters}`
}
async function checkNoPageOverflow() {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}

try {
  await mkdir(output, { recursive: true })
  // Mount each independent composition once. Shared cards/buttons do not need a viewport/theme matrix.
  const structures = [
    { variant: 1, selector: '.hbar-app-ui-integration-marketplace-reference-card', count: 9 },
    { variant: 2, selector: '[role="switch"]', count: 4 },
    { variant: 3, selector: 'table tbody > tr', count: 4 },
    { variant: 4, selector: '.hbar-app-ui-integration-reference-webhooks-delivery', count: 3 },
    { variant: 5, selector: '.lumen-integration-consent-reference-permissions > li', count: 3 },
    { variant: 6, selector: '.lumen-integration-sync-reference-list > li', count: 5 },
  ]
  for (const structure of structures) {
    await page.goto(url(structure.variant), { waitUntil: 'domcontentloaded' })
    await expect(page.locator(structure.selector)).toHaveCount(structure.count)
    await checkNoPageOverflow()
  }

  // One filtering sample covers category keyboard selection and controlled search.
  await page.goto(url(1), { waitUntil: 'domcontentloaded' })
  await page.screenshot({ path: `${output}/marketplace-desktop.png`, fullPage: true })
  await expect(page.getByRole('tab')).toHaveCount(6)
  await page.getByRole('tab', { name: 'All', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Analytics', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.hbar-app-ui-integration-marketplace-reference-card')).toHaveCount(2)
  await page.locator('[data-hbar-app-ui-field="integration-search"]').fill('Northwind')
  await expect(page.locator('.hbar-app-ui-integration-marketplace-reference-card')).toHaveCount(1)

  // Required scopes remain immutable; one editable scope checks the reused toggle mechanism.
  await page.goto(url(2), { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('switch').first()).toBeChecked()
  await expect(page.getByRole('switch').first()).toBeDisabled()
  const editableScope = page.getByRole('switch').nth(1)
  await editableScope.uncheck()
  await expect(editableScope).not.toBeChecked()
  await expect(page.locator('.hbar-app-ui-integration-connection-reference-activity-item')).toHaveCount(4)

  // Reveal stores only a key ID. Copy/revoke are intents, not clipboard or credential mutations.
  await page.goto(url(3), { waitUntil: 'domcontentloaded' })
  const keyRow = page.locator('tr[data-hbar-app-ui-item-id="billing-worker"]')
  await keyRow.getByRole('button', { name: 'Reveal key', exact: true }).click()
  await expect(keyRow.getByRole('button', { name: 'Hide key', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await keyRow.getByRole('button', { name: 'Hide key', exact: true }).click()
  await keyRow.getByRole('button', { name: 'Copy key', exact: true }).click()
  await keyRow.getByRole('button', { name: 'Revoke Billing worker', exact: true }).click()
  await expect(page.locator('table tbody > tr')).toHaveCount(4)

  // Expansion and endpoint selection change different structures; select one fixture-only alternate endpoint.
  await page.goto(url(4), { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.hbar-app-ui-integration-reference-webhooks-endpoint-list > li')).toHaveCount(3)
  const payload = page.locator('.hbar-app-ui-integration-reference-webhooks-payload')
  await expect(payload).toHaveCount(1)
  await page.locator('.hbar-app-ui-integration-reference-webhooks-delivery-trigger').first().click()
  await expect(payload).toHaveCount(0)
  await page.getByRole('button', { name: 'Select api.cedarlabs.io/v2/events', exact: true }).click()
  await expect(page.locator('.hbar-app-ui-integration-reference-webhooks-url')).toHaveText(
    'https://api.cedarlabs.io/v2/events',
  )
  await expect(page.locator('.hbar-app-ui-integration-reference-webhooks-delivery')).toHaveCount(1)

  // The captured workspace menu is an overlay, with keyboard navigation and controlled target IDs.
  await page.goto(url(5), { waitUntil: 'domcontentloaded' })
  const workspace = page.locator('[data-hbar-app-ui-action="select-workspace"]')
  await workspace.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('listbox')).toBeVisible()
  await expect(page.getByRole('option')).toHaveCount(3)
  await page.screenshot({ path: `${output}/consent-menu-desktop.png`, fullPage: true })
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(workspace).toContainText('Halcyon Labs')
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await page.getByRole('button', { name: 'Authorize', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Authorize', exact: true })).toBeEnabled()

  // Pause/resume are inferred local preview states, not evidence of a successful backend sync.
  await page.goto(url(6), { waitUntil: 'domcontentloaded' })
  const northwind = page.locator('li[data-hbar-app-ui-item-id="northwind"]')
  const progress = await northwind.getByRole('progressbar').getAttribute('aria-valuenow')
  const failure = page.locator('li[data-hbar-app-ui-item-id="meridian"] .lumen-integration-sync-reference-failure')
  const failureText = await failure.textContent()
  await expect(page.locator('.lumen-integration-sync-reference-metric')).toHaveCount(4)
  await page.getByRole('button', { name: 'Pause Northwind', exact: true }).click()
  await expect(northwind.getByText('Paused', { exact: true })).toBeVisible()
  await expect(
    page
      .locator('.lumen-integration-sync-reference-metric')
      .filter({ has: page.getByText('Paused', { exact: true }) })
      .locator('dd'),
  ).toHaveText('2')
  await page.getByRole('button', { name: 'Resume Northwind', exact: true }).click()
  await expect(northwind.getByText('Syncing', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Sync all', exact: true }).click()
  await expect(failure).toHaveText(failureText ?? '')
  await expect(northwind.getByRole('progressbar')).toHaveAttribute('aria-valuenow', progress ?? '')
  await expect(page.getByRole('button', { name: /retry/i })).toHaveCount(0)

  // Two narrow samples cover inner table scrolling and long-copy stacked flow; no per-button matrix.
  await page.setViewportSize({ width: 320, height: 520 })
  await page.goto(url(3), { waitUntil: 'domcontentloaded' })
  const tableScroll = page.locator('.hbar-app-ui-integration-reference-api-keys-scroll')
  expect(
    await tableScroll.evaluate((element) => {
      element.scrollLeft = element.scrollWidth
      return element.scrollWidth > element.clientWidth && element.scrollLeft > 0
    }),
  ).toBe(true)
  const revoke = page.getByRole('button', { name: 'Revoke Billing worker', exact: true })
  await revoke.scrollIntoViewIfNeeded()
  await expect(revoke).toBeInViewport()
  await checkNoPageOverflow()

  await page.goto(url(2, true), { waitUntil: 'domcontentloaded' })
  const auditLog = page.getByRole('link', { name: 'Vollständiges Prüfprotokoll öffnen', exact: true })
  await auditLog.scrollIntoViewIfNeeded()
  await expect(auditLog).toBeInViewport()
  await checkNoPageOverflow()
  await page.locator('.hbar-app-ui-integration-surface').evaluate((element) => {
    element.scrollTop = 0
  })
  await page.screenshot({ path: `${output}/connection-localized-narrow.png`, fullPage: true })
  expect(errors).toEqual([])
  console.log(
    'Integrations 1–6 practical core passed: source structures, filtering, scopes, reveal IDs, webhook expansion/selection, workspace keyboard selection, local pause/resume, inner table scrolling and stacked long copy. No exhaustive button/theme/viewport matrix or real connection/clipboard/OAuth/sync success is claimed.',
  )
} finally {
  await browser.close()
}
