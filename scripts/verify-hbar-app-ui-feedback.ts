import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
type FeedbackFixture = 'overflow' | 'localized'

function previewUrl(variant: number, fixture?: FeedbackFixture): string {
  const params = new URLSearchParams({ variant: `hbar-app-ui-feedback-${variant}`, mode: 'isolated' })
  if (fixture) params.set('feedbackFixture', fixture)
  return `${baseUrl}/?${params.toString()}`
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function waitForPreview(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // Vite may need a short interval before the port is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Preview is not reachable at ${baseUrl}`)
}

async function ensurePreview(): Promise<ReturnType<typeof Bun.spawn> | undefined> {
  try {
    await waitForPreview()
    return undefined
  } catch {
    const server = Bun.spawn(['bun', 'run', 'app-ui:preview', '--', '--host', '127.0.0.1', '--port', '5185'], {
      stdout: 'ignore',
      stderr: 'ignore',
    })
    await waitForPreview()
    return server
  }
}

async function inspectScroll(
  locator: import('@playwright/test').Locator,
): Promise<{ readonly scrollable: boolean; readonly moved: boolean }> {
  return locator.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    return { scrollable: element.scrollHeight > element.clientHeight, moved: element.scrollTop > 0 }
  })
}

async function noHorizontalOverflow(
  page: import('@playwright/test').Page,
  variant: number,
  fixture?: FeedbackFixture,
): Promise<boolean> {
  await page.goto(previewUrl(variant, fixture), { waitUntil: 'networkidle' })
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
}

async function run(): Promise<void> {
  const widgetOnly = process.argv.includes('--widget-only')
  const surveyOnly = process.argv.includes('--survey-only')
  const ratingOnly = process.argv.includes('--rating-only')
  const boardOnly = process.argv.includes('--board-only')
  const inboxOnly = process.argv.includes('--inbox-only')
  const server = await ensurePreview()
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1192, height: 800 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    if (inboxOnly) {
      await page.goto(previewUrl(5), {waitUntil: 'networkidle'})
      const root = page.locator('.lumen-feedback-inbox-reference')
      const list = root.locator('.lumen-feedback-inbox-reference-list')
      const detail = root.locator('.lumen-feedback-inbox-reference-detail')
      assert((await list.locator('li').count()) === 7, 'Inbox should contain the seven source threads')
      await page.getByRole('button', {name: /Jonas Vikander 1h/}).click()
      assert((await detail.getByText('We retired a 40 tab spreadsheet last month.', {exact: false}).count()) === 1, 'Selection did not change detail body')
      await page.getByRole('textbox', {name: 'Internal note'}).fill('Follow up with Jonas')
      await page.getByRole('button', {name: /Wei Chen 3h/}).click()
      assert((await page.getByRole('textbox', {name: 'Internal note'}).inputValue()) === 'Follow up with Jonas', 'Shared draft was lost on thread selection')
      assert((await detail.getByText('Security will not sign off without SAML.', {exact: false}).count()) === 1, 'Second selection did not change detail')
      await page.getByRole('button', {name: 'Archive read'}).click()
      await page.getByRole('button', {name: 'Add tag'}).click()
      await page.getByRole('button', {name: 'Reply', exact: true}).click()
      await page.getByRole('button', {name: 'Create issue'}).click()
      await page.getByRole('button', {name: 'Archive', exact: true}).click()
      assert((await list.locator('li').count()) === 7, 'Source no-result actions unexpectedly removed threads')
      assert((await page.getByRole('textbox', {name: 'Internal note'}).inputValue()) === 'Follow up with Jonas', 'Source no-result actions lost draft')
      await page.goto(previewUrl(5, 'localized'), {waitUntil: 'networkidle'})
      assert((await page.getByRole('heading', {name: 'Feedback-Posteingang'}).count()) === 1, 'Localized inbox heading missing')
      await page.setViewportSize({width: 320, height: 560})
      await page.goto(previewUrl(5, 'overflow'), {waitUntil: 'networkidle'})
      const overflowList = await inspectScroll(page.locator('.lumen-feedback-inbox-reference-list'))
      const overflowDetail = await inspectScroll(page.locator('.lumen-feedback-inbox-reference-detail-scroll'))
      assert(overflowList.scrollable && overflowList.moved, 'Narrow list did not retain independent scroll')
      assert(overflowDetail.scrollable && overflowDetail.moved, 'Narrow detail did not retain independent scroll')
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Narrow inbox overflowed horizontally')
      assert(pageErrors.length === 0, `Inbox preview reported page errors: ${pageErrors.join(' | ')}`)
      console.log(JSON.stringify({inboxOnly: true, localizedHostCopy: true, narrowList: overflowList, narrowDetail: overflowDetail, pageErrors: pageErrors.length}))
      return
    }
    if (boardOnly) {
      await page.goto(previewUrl(4), {waitUntil: 'networkidle'})
      const root = page.locator('.lumen-feedback-board-reference')
      await page.getByRole('button', {name: 'Vote for Row-level permissions on shared views'}).click()
      assert((await page.getByRole('button', {name: 'Remove vote from Row-level permissions on shared views'}).textContent())?.includes('188'), 'Vote did not update the card')
      await page.getByRole('button', {name: 'Remove vote from Row-level permissions on shared views'}).click()
      assert((await page.getByRole('button', {name: 'Vote for Row-level permissions on shared views'}).textContent())?.includes('187'), 'Vote did not reverse')
      await page.getByRole('button', {name: 'New', exact: true}).click()
      assert((await root.locator('article h3').first().textContent()) === 'Webhook retries with a dead letter queue', 'New order differs')
      await page.getByRole('button', {name: 'Shipped', exact: true}).click()
      assert((await root.locator('article').count()) === 1, 'Shipped subset differs')
      await page.getByRole('button', {name: 'Top', exact: true}).click()
      await page.getByRole('searchbox', {name: 'Search requests'}).fill('no matching feature')
      assert((await root.locator('article').count()) === 5, 'Source search unexpectedly filtered records')
      await page.getByRole('button', {name: 'New request'}).click()
      assert((await root.locator('article').count()) === 5, 'Source New request unexpectedly created a card')
      await page.goto(previewUrl(4, 'localized'), {waitUntil: 'networkidle'})
      assert((await page.getByRole('heading', {name: 'Funktionswünsche'}).count()) === 1, 'Localized board missing')
      await page.setViewportSize({width: 320, height: 560})
      await page.goto(previewUrl(4, 'localized'), {waitUntil: 'networkidle'})
      const list = page.locator('.lumen-feedback-board-reference-list')
      const scroll = await inspectScroll(list)
      assert(scroll.scrollable && scroll.moved, 'Narrow board did not keep the list pane scrollable')
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Narrow board overflowed horizontally')
      assert(pageErrors.length === 0, `Board preview reported page errors: ${pageErrors.join(' | ')}`)
      console.log(JSON.stringify({boardOnly: true, localizedHostCopy: true, narrowScroll: scroll, pageErrors: pageErrors.length}))
      return
    }
    if (ratingOnly) {
      await page.goto(previewUrl(3), {waitUntil: 'networkidle'})
      assert((await page.getByRole('button', {name: 'Took too long'}).count()) === 0, 'Unselected rating reasons should be inert')
      await page.getByRole('radio', {name: '4 out of 5, Good'}).hover()
      assert((await page.getByText('Good', {exact: true}).count()) === 1, 'Star hover preview missing')
      await page.mouse.move(0, 0)
      assert((await page.getByText('Tap a star to rate').count()) === 1, 'Hover preview did not clear')
      await page.getByRole('radio', {name: '1 out of 5, Not good'}).click()
      assert((await page.getByText('What should have gone better?').count()) === 1, 'Negative reason family missing')
      await page.getByRole('button', {name: 'Took too long'}).click()
      await page.getByRole('radio', {name: '4 out of 5, Good'}).click()
      assert((await page.getByText('What went well?').count()) === 1, 'Positive reason family missing')
      await page.getByRole('button', {name: 'Fast reply'}).click()
      assert((await page.getByRole('button', {name: 'Fast reply'}).getAttribute('aria-pressed')) === 'true', 'Reason did not toggle')
      await page.getByRole('textbox', {name: 'Add a comment'}).fill('Sofia helped us promptly.')
      await page.getByRole('button', {name: 'Send rating'}).click()
      assert((await page.getByRole('radio', {name: '4 out of 5, Good'}).getAttribute('aria-checked')) === 'true', 'Source no-result send should retain rating')
      await page.getByRole('button', {name: 'No thanks'}).click()
      assert((await page.getByRole('button', {name: 'Fast reply'}).getAttribute('aria-pressed')) === 'true', 'Source no-result skip should retain reason')
      await page.goto(previewUrl(3, 'localized'), {waitUntil: 'networkidle'})
      assert((await page.getByRole('heading', {name: 'Wie beurteilen Sie die erhaltene Unterstützung?'}).count()) === 1, 'Localized rating heading missing')
      await page.setViewportSize({width: 320, height: 360})
      await page.goto(previewUrl(3, 'localized'), {waitUntil: 'networkidle'})
      const stage = page.locator('.lumen-feedback-rating-reference')
      const scroll = await inspectScroll(stage)
      assert(scroll.scrollable && scroll.moved, `Narrow rating did not expose full form scroll: ${JSON.stringify(scroll)}`)
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Narrow rating overflowed horizontally')
      await page.getByRole('radio', {name: /5 von 5/}).focus()
      await page.keyboard.press('Space')
      assert((await page.getByText('Was hat besonders gut funktioniert?').count()) === 1, 'Keyboard rating failed')
      assert(pageErrors.length === 0, `Rating preview reported page errors: ${pageErrors.join(' | ')}`)
      console.log(JSON.stringify({ratingOnly: true, localizedHostCopy: true, narrowScroll: scroll, pageErrors: pageErrors.length}))
      return
    }
    if (surveyOnly) {
      await page.goto(previewUrl(2), { waitUntil: 'networkidle' })
      assert(
        (await page.getByRole('button', { name: 'It is fast' }).count()) === 0,
        'Unselected reasons should remain inert',
      )
      await page.getByRole('radio', { name: '3', exact: true }).click()
      assert((await page.getByText('What let you down most?').count()) === 1, 'Low score follow-up missing')
      await page.getByRole('radio', { name: '8', exact: true }).click()
      assert(
        (await page.getByText('What would move you to a nine or ten?').count()) === 1,
        'Middle score follow-up missing',
      )
      await page.getByRole('button', { name: 'It is fast' }).click()
      assert(
        (await page.getByRole('button', { name: 'It is fast' }).getAttribute('aria-pressed')) === 'true',
        'Reason did not toggle',
      )
      await page.getByRole('textbox', { name: 'Anything else' }).fill('The product helped me onboard quickly.')
      await page.getByRole('radio', { name: '10', exact: true }).focus()
      await page.keyboard.press('Space')
      assert((await page.getByText('What made it worth recommending?').count()) === 1, 'High score follow-up missing')
      await page.getByRole('button', { name: 'Submit' }).click()
      assert((await page.getByText('Recorded, thank you').count()) === 1, 'Survey acknowledgement missing')
      assert(
        (await page.getByText(/Your score of 10 goes to the product team/).count()) === 1,
        'Survey score was not retained',
      )
      await page.goto(previewUrl(2, 'localized'), { waitUntil: 'networkidle' })
      assert(
        (await page.getByRole('heading', { name: /Wie wahrscheinlich empfehlen Sie/ }).count()) === 1,
        'Localized survey heading missing',
      )
      await page.setViewportSize({ width: 320, height: 560 })
      await page.goto(previewUrl(2, 'localized'), { waitUntil: 'networkidle' })
      const stage = page.locator('.lumen-feedback-survey-reference')
      const scroll = await inspectScroll(stage)
      assert(scroll.scrollable && scroll.moved, 'Narrow survey did not expose the full normal-flow form')
      assert(await page.getByRole('button', { name: 'Absenden' }).isVisible(), 'Narrow survey footer is unreachable')
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        'Narrow survey overflowed horizontally',
      )
      assert(pageErrors.length === 0, `Survey preview reported page errors: ${pageErrors.join(' | ')}`)
      console.log(
        JSON.stringify({
          surveyOnly: true,
          localizedHostCopy: true,
          narrowScroll: scroll,
          pageErrors: pageErrors.length,
        }),
      )
      return
    }
    await page.goto(previewUrl(1), { waitUntil: 'networkidle' })
    await page.getByRole('radio', { name: 'Issue' }).click()
    assert(
      (await page.locator('textarea').getAttribute('placeholder')) ===
        'What went wrong, and what did you expect instead?',
      'Feedback type did not update the contextual prompt',
    )
    await page.getByRole('button', { name: 'Screenshot attached' }).click()
    assert(
      (await page.getByRole('button', { name: 'Attach a screenshot' }).count()) === 1,
      'Screenshot toggle did not detach',
    )
    await page.locator('textarea').fill('Please make exports easier to review.')
    assert(
      await page.getByRole('button', { name: 'Send feedback', exact: true }).isEnabled(),
      'Draft did not enable Send',
    )
    await page.getByRole('button', { name: 'Send feedback', exact: true }).click()
    assert(
      (await page.getByText('Thanks, that is on its way', { exact: true }).count()) === 1,
      'Feedback widget did not settle into its sent state',
    )
    await page.getByRole('button', { name: 'Send another' }).click()
    assert(
      (await page.getByRole('radio', { name: 'Issue' }).getAttribute('aria-checked')) === 'true',
      'Another draft lost selected type',
    )
    assert((await page.locator('textarea').inputValue()) === '', 'Another draft was not cleared')
    if (widgetOnly) {
      await page.goto(previewUrl(1, 'localized'), { waitUntil: 'networkidle' })
      assert(
        (await page.getByRole('heading', { name: 'Feedback senden' }).count()) === 1,
        'Localized widget copy was not hosted',
      )
      await page.setViewportSize({ width: 320, height: 560 })
      assert(await noHorizontalOverflow(page, 1), 'Narrow feedback widget overflowed horizontally')
      assert(pageErrors.length === 0, `Feedback preview reported page errors: ${pageErrors.join(' | ')}`)
      console.log(
        JSON.stringify({
          widgetOnly: true,
          localizedHostCopy: true,
          narrowOverflow: true,
          pageErrors: pageErrors.length,
        }),
      )
      return
    }

    await page.goto(previewUrl(2), { waitUntil: 'networkidle' })
    await page.getByRole('radio', { name: '8', exact: true }).click()
    await page.getByRole('button', { name: 'Submit', exact: true }).click()
    assert(
      (await page.getByText('Recorded, thank you', { exact: true }).count()) === 1,
      'Survey did not settle after score submission',
    )

    await page.goto(previewUrl(3), { waitUntil: 'networkidle' })
    await page.getByRole('radio', { name: '4 out of 5, Good', exact: true }).click()
    await page.getByRole('button', { name: 'Send rating', exact: true }).click()
    assert(
      (await page.getByRole('radio', { name: '4 out of 5, Good', exact: true }).getAttribute('aria-checked')) === 'true',
      'Source no-result rating action did not retain selection',
    )

    await page.goto(previewUrl(4), { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Vote for Row-level permissions on shared views', exact: true }).click()
    assert(
      (await page
        .getByRole('button', { name: 'Remove vote from Row-level permissions on shared views', exact: true })
        .count()) === 1,
      'Feature request vote did not toggle its target',
    )
    await page.getByRole('searchbox', { name: 'Search requests', exact: true }).fill('webhook')
    assert(
      (await page.locator('.lumen-feedback-board-reference-list article').count()) === 5,
      'Source search-only draft unexpectedly filtered cards',
    )

    await page.goto(previewUrl(5), { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /Jonas Vikander 1h Saved views replaced our spreadsheet/ }).click()
    assert(
      (await page.locator('.lumen-feedback-inbox-reference-detail h3').textContent()) ===
        'Saved views replaced our spreadsheet',
      'Inbox thread selection did not update the detail pane',
    )
    await page.getByRole('button', { name: 'Add tag', exact: true }).click()
    await page.getByRole('button', { name: 'Archive', exact: true }).click()
    assert((await page.locator('.lumen-feedback-inbox-reference-list li').count()) === 7, 'Source no-result archive removed threads')

    await page.goto(previewUrl(6), { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '90 days', exact: true }).click()
    assert(
      (await page.getByRole('button', { name: '90 days', exact: true }).getAttribute('aria-pressed')) === 'true' &&
        (await page.getByText('1,187', { exact: true }).count()) === 1,
      'Insights period did not switch',
    )

    const overflowChecks: Record<string, { readonly scrollable: boolean; readonly moved: boolean }> = {}
    const overflowSelectors: Readonly<Record<number, string>> = {
      4: '.lumen-feedback-board-reference-list',
      5: '.lumen-feedback-inbox-reference-list',
      6: '.lumen-feedback-insights-reference-themes ol',
    }
    for (const [variantText, selector] of Object.entries(overflowSelectors)) {
      const variant = Number(variantText)
      await page.goto(previewUrl(variant, 'overflow'), { waitUntil: 'networkidle' })
      const inspection = await inspectScroll(page.locator(selector))
      overflowChecks[`feedback-${variant}`] = inspection
      assert(
        inspection.scrollable && inspection.moved,
        `feedback-${variant} did not expose its declared pane scroll strategy`,
      )
    }

    await page.goto(previewUrl(1, 'localized'), { waitUntil: 'networkidle' })
    assert(
      (await page.locator('.lumen-feedback-reference-header h2').textContent()) === 'Feedback senden',
      'Localized widget copy was not supplied by the host bundle',
    )
    await page.goto(previewUrl(5, 'localized'), { waitUntil: 'networkidle' })
    assert(
      (await page.getByText('Feedback-Posteingang', { exact: true }).count()) === 1,
      'Localized inbox copy was not supplied by the host bundle',
    )

    await page.setViewportSize({ width: 320, height: 800 })
    const narrowOverflow: Record<string, boolean> = {}
    for (let variant = 1; variant <= 6; variant += 1) {
      narrowOverflow[`feedback-${variant}`] = await noHorizontalOverflow(
        page,
        variant,
        variant === 4 || variant === 5 ? 'localized' : undefined,
      )
      assert(narrowOverflow[`feedback-${variant}`], `Narrow feedback-${variant} layout overflowed horizontally`)
    }

    assert(pageErrors.length === 0, `Feedback preview reported page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({ overflowChecks, narrowOverflow, localizedHostCopy: true, pageErrors: pageErrors.length }),
    )
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
