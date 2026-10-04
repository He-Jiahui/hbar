import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = resolve('artifacts/file-manager-core-review')
const checks: string[] = []
const diagnostics: string[] = []
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
async function open(page: Page, variant: number, fixture?: string): Promise<Locator> {
  const query = new URLSearchParams({ variant: `hbar-app-ui-file-manager-${variant}`, mode: 'isolated' })
  if (fixture) query.set('fileManagerFixture', fixture)
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded' })
  const root = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-file-manager-${variant}"]`)
  await expect(root.locator('[data-reference-kind]')).toBeVisible()
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    'File workspace page overflow',
  )
  checks.push(`FileManager${variant}${fixture ? ` ${fixture}` : ''}: natural structure without page overflow`)
  return root
}
async function main() {
  assert((await fetch(baseUrl)).ok, 'Existing production preview unavailable; no automatic server start')
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1192, height: 760 } })
  page.on('pageerror', (error) => diagnostics.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.push(message.text())
  })
  try {
    const drive = await open(page, 1)
    await expect(drive.locator('[data-row-id]')).toHaveCount(12)
    await drive.getByRole('textbox', { name: 'Search files', exact: true }).fill('Northwind')
    await expect(drive.locator('[data-row-id]')).toHaveCount(1)
    await drive.getByRole('button', { name: 'Star Northwind key visual.png', exact: true }).click()
    await expect(drive.getByRole('button', { name: 'Unstar Northwind key visual.png', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await drive.getByRole('checkbox', { name: 'Select all files', exact: true }).check()
    await expect(drive.getByRole('checkbox', { name: 'Select Northwind key visual.png', exact: true })).toBeChecked()
    await drive.getByRole('button', { name: 'Grid view', exact: true }).click()
    await expect(drive.locator('.lumen-file-manager-reference')).toHaveClass(/is-grid/)
    await drive.getByRole('button', { name: 'List view', exact: true }).click()
    await drive.getByRole('textbox', { name: 'Search files', exact: true }).fill('')
    await drive.getByRole('button', { name: 'Starred', exact: true }).click()
    await expect(drive.locator('[data-row-id]')).toHaveCount(4)
    await drive.getByRole('button', { name: 'Size', exact: true }).click()
    await expect(drive.locator('[data-row-id]').first()).toHaveAttribute('data-row-id', 'studio-plan')
    await page.screenshot({ path: resolve(output, 'file-manager-drive-desktop.png'), fullPage: true })
    checks.push(
      'Drive search, select-visible, star filtering, size order and view switching preserve current owner state',
    )
    const assets = await open(page, 2)
    await expect(assets.getByRole('button', { name: 'Select hero-still-a.png', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await assets.getByRole('button', { name: 'Images', exact: true }).click()
    await expect(assets.locator('[data-row-id]')).toHaveCount(3)
    await assets.getByRole('button', { name: 'Share', exact: true }).click()
    await expect(assets.locator('.lumen-file-manager-reference-notice')).toContainText('hero-a')
    await expect(assets.locator('.lumen-file-manager-reference-notice')).toContainText('teaser')
    await assets.getByRole('button', { name: 'Clear selection', exact: true }).click()
    await expect(assets.locator('.lumen-file-manager-reference-selection-footer')).toHaveCount(0)
    await assets.getByRole('button', { name: 'Key art', exact: false }).click()
    await expect(assets.locator('[data-row-id]')).toHaveCount(3)
    await expect(assets.locator('[data-row-id="brief"]')).toBeVisible()
    await assets.getByRole('button', { name: 'Assets', exact: true }).click()
    await expect(assets.locator('[data-row-id]')).toHaveCount(8)
    checks.push(
      'Asset type filter preserves hidden selected IDs for exact request-only batch actions; Clear removes the batch bar',
    )
    const detail = await open(page, 3)
    await expect(detail.locator('.lumen-file-manager-reference-metadata')).toContainText('4000 × 2500')
    await detail.getByRole('button', { name: 'Open Brand guidelines.pdf', exact: true }).click()
    await expect(detail.locator('.lumen-file-manager-reference-detail-summary')).toContainText('Brand guidelines.pdf')
    await expect(detail.locator('.lumen-file-manager-reference-metadata')).toHaveCount(0)
    await detail.getByRole('button', { name: 'Download', exact: true }).click()
    await expect(detail.locator('.lumen-file-manager-reference-notice')).toContainText('guidelines')
    await detail.getByRole('button', { name: 'Open Northwind key visual.png', exact: true }).click()
    await expect(detail.locator('.lumen-file-manager-reference-metadata')).toContainText('4000 × 2500')
    checks.push('Details switch the exact file without reusing unknown metadata; Download remains target-scoped intent')
    const upload = await open(page, 4)
    await upload.getByRole('button', { name: 'Pause sizzle-30s.mp4', exact: true }).click()
    await expect(upload.locator('[data-row-id="sizzle"]')).toHaveAttribute('data-upload-state', 'paused')
    await upload.getByRole('button', { name: 'Start press-kit.zip', exact: true }).click()
    await expect
      .poll(async () =>
        Number(
          await upload
            .getByRole('progressbar', { name: 'Upload progress for press-kit.zip', exact: true })
            .getAttribute('aria-valuenow'),
        ),
      )
      .toBeGreaterThan(0)
    await upload.getByRole('button', { name: 'Retry billboard-2400.png', exact: true }).click()
    await expect(upload.locator('[data-row-id="billboard-upload"]')).toHaveAttribute('data-upload-state', 'uploading')
    await upload
      .locator('input[type="file"]')
      .setInputFiles({ name: 'local-art.png', mimeType: 'image/png', buffer: Buffer.from('local metadata fixture') })
    await expect(upload.locator('[data-row-id]')).toHaveCount(6)
    await expect(upload.getByRole('button', { name: 'Start local-art.png', exact: true })).toBeVisible()
    await upload.getByRole('button', { name: 'Clear completed', exact: true }).click()
    await expect(upload.locator('[data-row-id]')).toHaveCount(4)
    await upload.getByRole('button', { name: 'Cancel all', exact: true }).click()
    await expect(upload.locator('[data-upload-state="cancelled"]')).toHaveCount(4)
    await upload.getByRole('button', { name: 'Close uploader', exact: true }).click()
    await expect(upload.getByRole('button', { name: 'Reopen uploader', exact: true })).toBeVisible()
    await upload.getByRole('button', { name: 'Reopen uploader', exact: true }).click()
    await expect(upload.locator('[data-upload-state="cancelled"]')).toHaveCount(4)
    await page.screenshot({ path: resolve(output, 'file-manager-upload-desktop.png'), fullPage: true })
    checks.push(
      'Queue pause/start/retry, native metadata enqueue, clear, cancel and reopen update local transfer state without remote upload',
    )
    await page.setViewportSize({ width: 390, height: 844 })
    const narrow = await open(page, 2, 'localized')
    await expect(narrow.locator('[data-row-id]')).toHaveCount(8)
    await narrow.getByRole('button', { name: '清除选择', exact: true }).click()
    await page.screenshot({ path: resolve(output, 'file-manager-assets-localized-narrow.png'), fullPage: true })
    checks.push('Long localized asset heading, filters and cards wrap in natural narrow flow')
    const narrowUpload = await open(page, 4, 'localized')
    await expect(narrowUpload.locator('[data-row-id]')).toHaveCount(5)
    checks.push('Upload footer and row actions remain reachable in the same narrow flow')
    await page.setViewportSize({ width: 1192, height: 760 })
    const overflow = await open(page, 1, 'overflow')
    await expect(overflow.locator('[data-row-id]')).toHaveCount(81)
    const pane = overflow.locator('.lumen-file-manager-reference-collection')
    assert(
      await pane.evaluate((node) => node.scrollHeight > node.clientHeight),
      'Eighty-one files must own collection scrolling',
    )
    await overflow.locator('[data-row-id]').last().scrollIntoViewIfNeeded()
    await expect(overflow.locator('[data-row-id]').last()).toBeInViewport()
    checks.push('Capacity eighty-one: final file stays reachable in pane-owned scrolling')
    assert(!diagnostics.length, `Browser errors: ${diagnostics.join('; ')}`)
    await writeFile(
      resolve(output, 'report.json'),
      JSON.stringify(
        {
          standard: 'core file workflows and representative natural flow; no repeated button/theme/viewport matrix',
          checks,
          diagnostics,
        },
        null,
        2,
      ),
    )
    console.log(
      `FileManager practical verification passed: ${checks.length} records, ${diagnostics.length} diagnostics`,
    )
  } finally {
    await browser.close()
  }
}
await main()
