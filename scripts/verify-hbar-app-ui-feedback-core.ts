import { chromium, expect, type Locator, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = resolve('artifacts/feedback-core-review')
const checks: string[] = []
const diagnostics: string[] = []
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
async function open(page: Page, variant: number, fixture?: string): Promise<Locator> {
  const query = new URLSearchParams({ mode: 'isolated', variant: `hbar-app-ui-feedback-${variant}`, theme: 'light' })
  if (fixture) query.set('feedbackFixture', fixture)
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded' })
  const root = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-feedback-${variant}"]`).first()
  await expect(root).toBeVisible()
  assert(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    `Feedback${variant}: page overflow`,
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
    const widget = await open(page, 1)
    await widget.getByRole('radio', { name: 'Issue', exact: true }).click()
    await widget.getByRole('button', { name: 'Screenshot attached', exact: true }).click()
    await widget.getByRole('textbox').fill('Please retain all export columns')
    await widget.getByRole('button', { name: 'Send feedback', exact: true }).click()
    await expect(widget.getByText('Thanks, that is on its way', { exact: true })).toBeVisible()
    await widget.getByRole('button', { name: 'Send another', exact: true }).click()
    await expect(widget.getByRole('textbox')).toHaveValue('')
    await expect(widget.getByRole('radio', { name: 'Issue', exact: true })).toHaveAttribute('aria-checked', 'true')
    await expect(widget.getByRole('button', { name: 'Attach a screenshot', exact: true })).toBeVisible()
    checks.push(
      'Widget: type/draft/attachment, local acknowledgement and Send another retain choices and clear one draft',
    )

    const survey = await open(page, 2)
    await survey.getByRole('radio', { name: '8', exact: true }).press('Space')
    await survey.getByRole('button', { name: 'It is fast', exact: true }).click()
    await survey.getByRole('textbox', { name: 'Anything else', exact: true }).fill('Useful product feedback')
    await survey.getByRole('radio', { name: '10', exact: true }).click()
    await expect(survey.getByRole('button', { name: 'It is fast', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await survey.getByRole('button', { name: 'Submit', exact: true }).click()
    await expect(survey.getByText('Recorded, thank you', { exact: true })).toBeVisible()
    await expect(survey.getByText(/Your score of 10 goes to the product team/)).toBeVisible()
    checks.push('Survey: keyboard score/reason/comment, changed follow-up and retained score in local acknowledgement')

    const rating = await open(page, 3)
    await rating.getByRole('radio', { name: '1 out of 5, Not good', exact: true }).click()
    await rating.getByRole('button', { name: 'Took too long', exact: true }).click()
    await rating.getByRole('textbox', { name: 'Add a comment', exact: true }).fill('Retained comment')
    await rating.getByRole('radio', { name: '4 out of 5, Good', exact: true }).click()
    await rating.getByRole('button', { name: 'Fast reply', exact: true }).click()
    await expect(rating.getByRole('textbox', { name: 'Add a comment', exact: true })).toHaveValue('Retained comment')
    await rating.getByRole('button', { name: 'Send rating', exact: true }).click()
    await expect(rating.getByRole('button', { name: 'Fast reply', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await page.screenshot({ path: resolve(output, 'feedback-rating-desktop.png'), fullPage: true })
    checks.push('Rating: low/high reason family, retained comment and source Send without invented delivery state')

    const board = await open(page, 4)
    await board.getByRole('button', { name: 'Vote for Row-level permissions on shared views', exact: true }).click()
    await expect(
      board.getByRole('button', { name: 'Remove vote from Row-level permissions on shared views', exact: true }),
    ).toContainText('188')
    await board.getByRole('button', { name: 'New', exact: true }).click()
    await expect(board.locator('article h3').first()).toHaveText('Webhook retries with a dead letter queue')
    await board.getByRole('searchbox', { name: 'Search requests', exact: true }).fill('No matching feature')
    await expect(board.locator('article')).toHaveCount(5)
    await page.screenshot({ path: resolve(output, 'feedback-board-desktop.png'), fullPage: true })
    checks.push('Board: exact vote counter and source sort; search remains a draft without filtering the five requests')

    const inbox = await open(page, 5)
    await inbox.getByRole('button', { name: /Jonas Vikander 1h Saved views replaced our spreadsheet/ }).click()
    await inbox.getByRole('textbox', { name: 'Internal note', exact: true }).fill('Shared follow-up note')
    await inbox.getByRole('button', { name: /Wei Chen 3h Can we get SSO/ }).click()
    await expect(inbox.locator('.lumen-feedback-inbox-reference-detail h3')).toHaveText(
      'Can we get SSO on the Pro plan?',
    )
    await expect(inbox.getByRole('textbox', { name: 'Internal note', exact: true })).toHaveValue(
      'Shared follow-up note',
    )
    checks.push('Inbox: original thread/detail selection and source shared note remain independent')

    const insights = await open(page, 6)
    const volume = await insights
      .locator('[data-volume-endpoint]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('style')))
    await insights.getByRole('button', { name: '90 days', exact: true }).click()
    await expect(insights.getByRole('button', { name: '90 days', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(insights.getByText('1,187', { exact: true })).toBeVisible()
    assert(
      JSON.stringify(
        await insights
          .locator('[data-volume-endpoint]')
          .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('style'))),
      ) === JSON.stringify(volume),
      'Insights invented a period-specific source volume series',
    )
    checks.push('Insights: report period updates its host metrics while retaining the captured common volume series')

    await page.setViewportSize({ width: 356, height: 560 })
    const narrow = await open(page, 3, 'localized')
    await narrow.getByRole('radio', { name: /5 von 5/ }).press('Space')
    await narrow.getByRole('textbox').fill('Lokalisierte Bewertung mit zusätzlichem Kontext')
    await narrow.getByRole('button', { name: 'Bewertung senden', exact: true }).scrollIntoViewIfNeeded()
    await expect(narrow.getByRole('button', { name: 'Bewertung senden', exact: true })).toBeVisible()
    await page.screenshot({ path: resolve(output, 'feedback-rating-narrow.png'), fullPage: true })
    checks.push(
      'Representative localized narrow rating: keyboard selection, natural reason/text flow and reachable action footer',
    )

    const overflow = await open(page, 5, 'overflow')
    const list = overflow.locator('.lumen-feedback-inbox-reference-list')
    await expect(list.locator('li')).toHaveCount(25)
    await list.locator('li').last().getByRole('button').click()
    await expect(overflow.locator('.lumen-feedback-inbox-reference-detail h3')).toHaveText(
      'Additional feedback thread 18',
    )
    await overflow.getByRole('textbox', { name: 'Internal note', exact: true }).fill('Last thread note')
    await expect(overflow.getByRole('button', { name: 'Reply', exact: true })).toBeVisible()
    assert(
      await list.evaluate((element) => element.scrollTop > 0 && element.scrollWidth <= element.clientWidth + 1),
      'Extended inbox lacks an owned scroll boundary',
    )
    await page.screenshot({ path: resolve(output, 'feedback-inbox-overflow.png'), fullPage: true })
    checks.push(
      'Representative overflowing narrow inbox: all 25 threads retained, final original target opens, shared note/actions reachable',
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
