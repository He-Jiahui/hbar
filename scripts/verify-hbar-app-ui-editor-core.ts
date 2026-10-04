import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = resolve('artifacts/editor-core-review')
const checks: string[] = []
const diagnostics: string[] = []
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
async function open(page: Page, variant: number, fixture?: string): Promise<Locator> {
  const query = new URLSearchParams({ mode: 'isolated', variant: `hbar-app-ui-editor-${variant}`, theme: 'light' })
  if (fixture) query.set('editorFixture', fixture)
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded' })
  const root = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-editor-${variant}"]`)
  await expect(root).toBeVisible()
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `Editor${variant}: page overflow`,
  )
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
    const rich = await open(page, 1)
    await rich.getByRole('textbox', { name: 'Document body', exact: true }).fill('Alpha beta')
    await expect(rich.getByText('Saving…', { exact: true })).toBeVisible()
    await expect(rich.getByText('Saved', { exact: true })).toBeVisible()
    await expect(rich.getByRole('contentinfo')).toContainText('2 words')
    await rich.getByRole('button', { name: 'Paragraph', exact: true }).press('Space')
    await rich.getByRole('menuitemradio', { name: 'Heading 1', exact: true }).click()
    await expect(rich.getByRole('button', { name: 'Heading 1', exact: true })).toBeFocused()
    await rich.getByRole('button', { name: 'Bold', exact: true }).click()
    await expect(rich.getByRole('textbox', { name: 'Document body', exact: true })).toHaveValue('Alpha beta')
    await page.screenshot({ path: resolve(output, 'editor-rich-desktop.png'), fullPage: true })
    checks.push(
      'Rich editor: draft, counters and preview save label; keyboard block menu restores focus without transforming text',
    )

    const markdown = await open(page, 2)
    await markdown
      .getByRole('textbox', { name: 'Markdown source', exact: true })
      .fill('# Core heading\n\n**Alpha** beta\n\n> Context')
    await expect(markdown.getByRole('heading', { name: 'Core heading', exact: true })).toBeVisible()
    await markdown.getByRole('tab', { name: 'Preview', exact: true }).click()
    await expect(markdown.getByRole('textbox')).toHaveCount(0)
    await markdown.getByRole('tab', { name: 'Split', exact: true }).click()
    await expect(markdown.getByRole('textbox', { name: 'Markdown source', exact: true })).toHaveValue(
      '# Core heading\n\n**Alpha** beta\n\n> Context',
    )
    checks.push('Markdown: source projects safe headings/emphasis; view changes retain one draft')

    const code = await open(page, 3)
    await code.getByRole('button', { name: 'ledger.ts', exact: true }).click()
    await code.locator('.lumen-code-reference-line').nth(3).click()
    await expect(code.getByRole('contentinfo')).toContainText('Ln 4, Col')
    await code.getByRole('button', { name: 'Close ledger.ts', exact: true }).click()
    await expect(code.getByRole('button', { name: 'ledger.ts', exact: true })).toHaveCount(0)
    await expect(code.getByRole('button', { name: 'meter.ts Unsaved changes', exact: true })).toHaveAttribute(
      'aria-current',
      'true',
    )
    await code.getByRole('button', { name: 'Run', exact: true }).click()
    await expect(code.getByRole('button', { name: 'Stop', exact: true })).toHaveCount(0)
    checks.push('Code: active file/line, exact close and fallback; Run retains read-only source without fake process')

    const review = await open(page, 4)
    await review.getByRole('button', { name: 'Accept', exact: true }).first().click()
    await expect(review.getByRole('button', { name: 'rolls out in three stages', exact: true })).toHaveCount(1)
    await expect(review.locator('.lumen-suggestions-reference-card')).toHaveCount(2)
    await page.screenshot({ path: resolve(output, 'editor-review-desktop.png'), fullPage: true })
    await review.getByRole('button', { name: 'Accept all', exact: true }).click()
    await expect(review.getByText('Review complete', { exact: true })).toBeVisible()
    await review.getByRole('button', { name: 'Restore', exact: true }).click()
    await expect(review.locator('.lumen-suggestions-reference-card')).toHaveCount(3)
    checks.push('Review: original inline phrase accept, complete and restore share the same decision state')

    const reader = await open(page, 5)
    await reader.getByRole('button', { name: 'Retention', exact: true }).click()
    await reader.getByRole('button', { name: 'Focus', exact: true }).click()
    await expect(reader.getByRole('button', { name: 'Retention', exact: true })).toHaveAttribute('aria-current', 'true')
    await reader.getByRole('button', { name: 'Toggle outline', exact: true }).click()
    await reader.getByRole('button', { name: 'Toggle outline', exact: true }).click()
    await expect(reader.getByRole('button', { name: 'Retention', exact: true })).toHaveAttribute('aria-current', 'true')
    checks.push(
      'Reader: section selection, independent Focus and outline collapse/reopen preserve content and selection',
    )

    await page.setViewportSize({ width: 356, height: 720 })
    const narrow = await open(page, 2, 'localized')
    await narrow
      .getByRole('textbox', { name: 'Markdown-Quelltext', exact: true })
      .fill('# Lokalisierte Notiz\n\nBearbeiteter Inhalt')
    await narrow.getByRole('tab', { name: 'Vollstaendige Vorschauansicht', exact: true }).press('Space')
    await expect(narrow.getByRole('heading', { name: 'Lokalisierte Notiz', exact: true })).toBeVisible()
    await page.screenshot({ path: resolve(output, 'editor-markdown-narrow.png'), fullPage: true })
    checks.push(
      'Representative localized narrow Markdown: long host labels retain the tab strip and edited preview remains readable',
    )

    const overflow = await open(page, 5, 'overflow')
    await expect(overflow.locator('article section')).toHaveCount(28)
    const content = overflow.locator('.lumen-reader-reference-content')
    assert(
      await content.evaluate((element) => {
        element.scrollTop = element.scrollHeight
        return element.scrollTop > 0 && element.scrollWidth <= element.clientWidth + 1
      }),
      'Extended reader lacks owned vertical scroll',
    )
    await expect(overflow.locator('article section').last()).toBeVisible()
    await expect(overflow.getByRole('button', { name: 'Focus', exact: true })).toBeVisible()
    await page.screenshot({ path: resolve(output, 'editor-reader-overflow.png'), fullPage: true })
    checks.push(
      'Representative overflowing narrow reader: all 28 sections retained, final content and toolbar reachable',
    )

    assert(diagnostics.length === 0, `Browser diagnostics: ${diagnostics.join('; ')}`)
    await writeFile(
      resolve(output, 'report.json'),
      JSON.stringify({ checks, diagnostics, exhaustiveMatrix: false }, null, 2),
    )
    console.log(JSON.stringify({ checks: checks.length, diagnostics: diagnostics.length, output }))
  } finally {
    await browser.close()
  }
}
await main()
