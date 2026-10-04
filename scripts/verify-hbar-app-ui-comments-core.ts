import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = resolve('artifacts/comments-core-review')
const checks: string[] = []
const diagnostics: string[] = []
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
async function open(page: Page, variant: number, fixture?: string): Promise<Locator> {
  const query = new URLSearchParams({ mode: 'isolated', variant: `hbar-app-ui-comments-${variant}`, theme: 'light' })
  if (fixture) query.set('commentsFixture', fixture)
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded' })
  const root = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-comments-${variant}"]`)
  await expect(root.getByRole('heading').first()).toBeVisible()
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `Comments${variant}: page overflow`,
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
    const discussion = await open(page, 1)
    const parents = discussion.locator('.lumen-comments-discussion-thread > article')
    await discussion.getByRole('tab', { name: 'Newest', exact: true }).click()
    await expect(parents.first()).toContainText('Tomás Guerrero')
    await discussion.getByRole('tab', { name: 'Oldest', exact: true }).click()
    await expect(parents.first()).toContainText('Priya Nandakumar')
    await parents.first().getByRole('button', { name: '5', exact: true }).click()
    await expect(parents.first().getByRole('button', { name: '4', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await discussion.getByRole('textbox').fill('Core discussion draft')
    await expect(discussion.getByRole('button', { name: 'Comment', exact: true })).toBeEnabled()
    checks.push('Discussion: sort, reaction and draft gate retain nested replies and stable message targets')

    const annotation = await open(page, 2)
    const regions = annotation.locator(
      '[data-hbar-app-ui-action="select-annotation"][data-hbar-app-ui-target="regions"]',
    )
    await regions.click()
    await annotation.locator('[data-hbar-app-ui-action="toggle-resolved"][data-hbar-app-ui-target="support"]').click()
    await expect(regions).toHaveClass(/is-active/)
    await expect(annotation.locator('header')).toContainText('1 open comment · 3 total')
    checks.push('Annotation: linked text selection and another row resolution remain independent')

    const review = await open(page, 3)
    await review.getByRole('textbox').fill('Read both values from the pool')
    const resolveThread = review.locator('[data-hbar-app-ui-action="resolve-thread"]')
    await resolveThread.click()
    await expect(resolveThread).toHaveAttribute('aria-pressed', 'true')
    await resolveThread.focus()
    await page.keyboard.press('Space')
    await expect(resolveThread).toHaveAttribute('aria-pressed', 'false')
    await expect(review.getByRole('textbox')).toHaveValue('Read both values from the pool')
    await page.screenshot({ path: resolve(output, 'comments-review-desktop.png'), fullPage: true })
    checks.push('Code review: resolve/reopen by keyboard keeps draft and passive code suggestion')

    const composer = await open(page, 4)
    const editor = composer.getByRole('textbox', { name: 'Write a comment', exact: true })
    await editor.fill('Please ask @so')
    await expect(composer.getByRole('option')).toHaveCount(1)
    await page.keyboard.press('Enter')
    await expect(editor).toHaveValue('Please ask @sofia ')
    await expect(editor).toBeFocused()
    await expect(composer.getByRole('listbox')).toHaveCount(0)
    await composer.getByRole('button', { name: 'Remove pool-saturation.png', exact: true }).click()
    await expect(composer.locator('.lumen-comments-composer-attachment')).toHaveCount(1)
    await page.screenshot({ path: resolve(output, 'comments-composer-desktop.png'), fullPage: true })
    checks.push(
      'Composer: filtered keyboard mention inserts original handle, restores focus and removes one attachment',
    )

    const inbox = await open(page, 5)
    await inbox.getByRole('tab', { name: 'Unresolved', exact: true }).click()
    await inbox.getByRole('button', { name: 'Resolve comment from Priya Nandakumar', exact: true }).click()
    await expect(inbox.locator('.lumen-comments-inbox-items > article')).toHaveCount(3)
    await expect(inbox.locator('header')).toContainText('3 unresolved across 5 documents')
    await inbox.getByRole('tab', { name: 'All', exact: true }).click()
    await expect(inbox.locator('.lumen-comments-inbox-items > article')).toHaveCount(5)
    await expect(
      inbox.getByRole('button', { name: 'Reopen comment from Priya Nandakumar', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true')
    checks.push('Inbox: resolving hides only its unresolved row; All restores original history and global summary')

    const canvas = await open(page, 6)
    await canvas.getByRole('textbox').fill('Shared review draft')
    await canvas.getByRole('button', { name: 'Pin 2 by Amelia Whitfield', exact: true }).click()
    await canvas
      .locator(
        '.lumen-comments-canvas-card[data-hbar-app-ui-target="headline"] [data-hbar-app-ui-action="toggle-resolved"]',
      )
      .click()
    await expect(canvas.getByRole('textbox')).toHaveAttribute('placeholder', 'Reply to pin 2')
    await expect(canvas.getByRole('textbox')).toHaveValue('Shared review draft')
    await expect(canvas.locator('header')).toContainText('2 open pins · 3 reviewers')
    await expect(canvas.locator('.lumen-comments-canvas-card[data-selected="true"]')).toHaveAttribute(
      'data-hbar-app-ui-target',
      'card',
    )
    checks.push(
      'Canvas: pin and comment selection agree; other row resolution preserves active marker and shared draft',
    )

    await page.setViewportSize({ width: 356, height: 720 })
    const narrow = await open(page, 6, 'localized')
    const title = narrow.getByRole('heading')
    assert(
      await title.evaluate((element) => element.getBoundingClientRect().top >= 0),
      'Narrow title outside scroll origin',
    )
    const history = narrow.locator('.lumen-comments-canvas-items')
    assert(
      await history.evaluate((element) => {
        element.scrollTop = element.scrollHeight
        return element.scrollTop > 0
      }),
      'Narrow comment history cannot reach last pin',
    )
    await history.locator('[data-hbar-app-ui-target="footer"] [data-hbar-app-ui-action="locate-pin"]').click()
    await expect(narrow.getByRole('textbox')).toHaveAttribute('placeholder', '回复标记3')
    await narrow.getByRole('textbox').scrollIntoViewIfNeeded()
    await expect(narrow.getByRole('textbox')).toBeVisible()
    await page.screenshot({ path: resolve(output, 'comments-canvas-narrow.png'), fullPage: true })
    checks.push('Representative localized narrow canvas: safe title, scrollable history and reachable reply')

    const overflow = await open(page, 1, 'overflow')
    const thread = overflow.locator('.lumen-comments-discussion-thread')
    await expect(thread.locator('article')).toHaveCount(45)
    assert(
      await thread.evaluate((element) => {
        element.scrollTop = element.scrollHeight
        return element.scrollTop > 0 && element.scrollWidth <= element.clientWidth + 1
      }),
      'Overflow thread lacks owned vertical scroll',
    )
    await expect(overflow.getByRole('textbox')).toBeVisible()
    await page.screenshot({ path: resolve(output, 'comments-discussion-overflow.png'), fullPage: true })
    checks.push(
      'Representative overflowing narrow discussion: all records retained, final row reachable and composer outside scroll',
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
