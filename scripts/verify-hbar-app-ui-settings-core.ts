import { chromium, expect, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = resolve('artifacts/settings-core-review')
const diagnostics: string[] = []
const checks: string[] = []
async function open(page: Page, variant: number, fixture?: string) {
  const query = new URLSearchParams({
    mode: 'isolated',
    variant: `hbar-app-ui-settings-form-${variant}`,
    theme: 'light',
  })
  if (fixture) query.set('settingsFormFixture', fixture)
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded' })
  const root = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-settings-form-${variant}"]`).first()
  await expect(root).toBeVisible()
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
    throw new Error('Settings page overflow')
  return root
}
async function main() {
  if (!(await fetch(baseUrl)).ok) throw new Error('Existing production preview unavailable; no automatic server start')
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1192, height: 760 } })
  page.on('pageerror', (error) => diagnostics.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(message.text())
  })
  try {
    const workspace = await open(page, 1)
    await workspace.getByLabel('Name', { exact: true }).fill('Northwind core draft')
    await workspace.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(workspace.getByText('Saved just now', { exact: true })).toBeVisible()
    await workspace.getByRole('button', { name: 'Billing', exact: true }).click()
    await workspace.getByLabel('Billing email', { exact: true }).fill('replacement@example.test')
    await workspace.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(workspace.getByLabel('Billing email', { exact: true })).toHaveValue('accounts-payable@northwind.co')
    checks.push('Workspace: active section draft, local save acknowledgement and Cancel restore saved fields')

    const api = await open(page, 5)
    const key = api.locator('[data-hbar-app-ui-region="api-key-row"]').filter({ hasText: 'Production server' })
    await key.getByRole('button', { name: 'Reveal Production server', exact: true }).click()
    await expect(key.getByText('Secret value is withheld in this safe preview.', { exact: true })).toBeVisible()
    await key.getByRole('button', { name: 'Hide Production server', exact: true }).click()
    await expect(key.getByRole('button', { name: 'Reveal Production server', exact: true })).toBeVisible()
    await api.getByRole('switch', { name: 'GitHub', exact: true }).click()
    await expect(api.getByRole('switch', { name: 'GitHub', exact: true })).toBeChecked()
    await page.screenshot({ path: resolve(output, 'settings-safe-keys-desktop.png'), fullPage: true })
    checks.push(
      'Safe keys: Reveal/Hide only project a redaction notice, integration changes are local; no secret or service write',
    )

    const danger = await open(page, 6)
    await danger.getByLabel('Type northwind to confirm', { exact: true }).fill('northwind')
    await danger.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(danger.getByLabel('Type northwind to confirm', { exact: true })).toHaveValue('northwind')
    checks.push(
      'Danger preview: confirmation draft remains hosted; Cancel is explicitly callback-only, not source parity or deletion',
    )

    await page.setViewportSize({ width: 356, height: 560 })
    const narrow = await open(page, 6, 'localized')
    await narrow.getByRole('textbox').fill('Lokalisierter Bestätigungsentwurf')
    const footer = narrow.getByText('Exportiere Daten vor unwiderruflichen Änderungen am Arbeitsbereich.', {
      exact: true,
    })
    await footer.scrollIntoViewIfNeeded()
    await expect(footer).toBeVisible()
    await page.screenshot({ path: resolve(output, 'settings-danger-localized-narrow.png'), fullPage: true })
    checks.push(
      'Representative localized narrow danger view: natural long copy/impact flow, editable field and reachable guidance footer',
    )
    if (diagnostics.length) throw new Error(diagnostics.join('; '))
    await writeFile(
      resolve(output, 'report.json'),
      JSON.stringify(
        { checks, diagnostics, exhaustiveMatrix: false, sourceCancelParity: 'unverified-next-state' },
        null,
        2,
      ),
    )
    console.log(JSON.stringify({ checks: checks.length, diagnostics: diagnostics.length, output }))
  } finally {
    await browser.close()
  }
}
await main()
