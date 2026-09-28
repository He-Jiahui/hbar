import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5180'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

type EditorFixture = 'overflow' | 'localized'
const richOnly = process.argv.includes('--rich-only')
const markdownOnly = process.argv.includes('--markdown-only')
const codeOnly = process.argv.includes('--code-only')
const suggestionsOnly = process.argv.includes('--suggestions-only')

function previewUrl(variant: number, options: { readonly fixture?: EditorFixture } = {}): string {
  const parameters = new URLSearchParams({ variant: `hbar-app-ui-editor-${variant}`, mode: 'isolated' })
  if (options.fixture) parameters.set('editorFixture', options.fixture)
  return `${baseUrl}/?${parameters.toString()}`
}

async function waitForPreview(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // The local test preview may need a short interval before binding.
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
    const server = Bun.spawn(['bun', 'run', 'app-ui:preview', '--', '--host', '127.0.0.1'], {
      stdout: 'ignore',
      stderr: 'ignore',
    })
    await waitForPreview()
    return server
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function run(): Promise<void> {
  const server = await ensurePreview()
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1192, height: 780 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  try {
    if (suggestionsOnly) {
      await page.goto(previewUrl(4), {waitUntil: 'networkidle'})
      const cards = page.locator('.lumen-suggestions-reference-card')
      assert((await cards.count()) === 3, 'Initial suggestion list did not render')
      await page.getByRole('button', {name: 'customers on the bigger plans', exact: true}).click()
      assert(await cards.nth(2).evaluate(element => element.classList.contains('is-selected')), 'Inline selection did not target the original ID')
      await page.getByRole('button', {name: 'Dismiss', exact: true}).nth(1).click()
      assert((await cards.count()) === 2, 'Dismiss did not remove only the selected suggestion')
      assert((await page.getByRole('button', {name: 'a drift of under 0.5%', exact: true}).count()) === 1, 'Dismiss removed document copy')
      assert(await page.getByRole('button', {name: 'a drift of under 0.5%', exact: true}).evaluate(element => getComputedStyle(element).backgroundColor === 'rgba(0, 0, 0, 0)'), 'Dismiss retained unresolved highlight')
      await page.getByRole('button', {name: 'Accept', exact: true}).first().click()
      assert((await cards.count()) === 1, 'Accept did not remove the matching card')
      assert((await page.getByRole('button', {name: 'rolls out in three stages', exact: true}).count()) === 1, 'Accepted copy did not replace its inline phrase')
      await page.getByRole('button', {name: 'Accept all', exact: true}).click()
      assert((await cards.count()) === 0, 'Accept all left actionable cards')
      assert((await page.getByText('Review complete', {exact: true}).count()) === 1, 'Empty recovery message was missing')
      await page.getByRole('button', {name: 'Restore', exact: true}).click()
      assert((await cards.count()) === 3, 'Restore did not recover the source list')
      assert((await page.getByRole('button', {name: 'should probably be rolled out slowly', exact: true}).count()) === 1, 'Restore lost source document copy')
      const narrow: Array<{width: number; overlap: boolean; footerReachable: boolean}> = []
      for (const width of [670, 356, 286]) {
        await page.setViewportSize({width, height: 360})
        const state = await page.evaluate(() => {
          const title = document.querySelector('.lumen-suggestions-reference-document-header')!.getBoundingClientRect()
          const toolbar = document.querySelector('.lumen-suggestions-reference-panel-header')!.getBoundingClientRect()
          const list = document.querySelector('.lumen-suggestions-reference-list')!
          return {overlap: title.bottom > toolbar.top + 1, footerReachable: list.scrollHeight > list.clientHeight,
            horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1}
        })
        assert(!state.overlap && !state.horizontalOverflow, `Narrow review flow overlapped or overflowed at ${width}`)
        assert(state.footerReachable, `Narrow review list did not own vertical scrolling at ${width}`)
        narrow.push({width, overlap: state.overlap, footerReachable: state.footerReachable})
      }
      await page.getByRole('button', {name: 'Accept', exact: true}).last().click()
      const narrowAfterAccept = await page.evaluate(() => {
        const copy = document.querySelector('.lumen-suggestions-reference-copy')!.getBoundingClientRect()
        const toolbar = document.querySelector('.lumen-suggestions-reference-panel-header')!.getBoundingClientRect()
        return {copyVisible: copy.height > 50, flowing: copy.bottom <= toolbar.top + 1}
      })
      assert(narrowAfterAccept.copyVisible && narrowAfterAccept.flowing, 'Narrow two-card state did not reveal a flowing document excerpt')
      await page.goto(previewUrl(4, {fixture: 'overflow'}), {waitUntil: 'networkidle'})
      const list = page.locator('.lumen-suggestions-reference-list')
      await list.evaluate(element => {element.scrollTop = element.scrollHeight})
      const overflow = await list.evaluate(element => ({scrollable: element.scrollHeight > element.clientHeight, moved: element.scrollTop > 0}))
      assert(overflow.scrollable && overflow.moved, 'Over-bound suggestion list did not reach its last card')
      assert((await page.locator('.lumen-suggestions-reference-card').count()) === 24, 'Over-bound list lost records')
      await page.goto(previewUrl(4, {fixture: 'localized'}), {waitUntil: 'networkidle'})
      assert((await page.getByRole('button', {name: 'Alle annehmen', exact: true}).count()) === 1, 'Localized review action did not render')
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Long localized review labels overflowed')
      assert(pageErrors.length === 0, `Suggestions preview reported page errors: ${pageErrors.join(' | ')}`)
      console.log(JSON.stringify({inlineSelection: true, dismiss: true, accept: true, acceptAllRestore: true, narrow, narrowAfterAccept, overflow, localized: true, pageErrors: pageErrors.length}))
      return
    }
    if (codeOnly) {
      await page.goto(previewUrl(3), {waitUntil: 'networkidle'})
      const lines = page.locator('.lumen-code-reference-line')
      assert((await lines.count()) === 28, 'The TypeScript source lines did not render')
      assert((await page.getByRole('button', {name: 'meter.ts Unsaved changes'}).count()) === 1, 'Dirty file was not accessible')
      await lines.nth(5).click()
      const cursor = await page.locator('.lumen-code-reference-footer span').first().innerText()
      assert(cursor === 'Ln 6, Col 56', `Code line click did not update source cursor: ${cursor}`)
      await page.getByRole('button', {name: 'ledger.ts', exact: true}).click()
      assert((await lines.first().innerText()).includes('import { db }'), 'File selection did not replace the visible code')
      await page.getByRole('button', {name: 'Close meter.ts'}).click()
      assert((await page.getByRole('button', {name: 'Close meter.ts'}).count()) === 0, 'Inactive file remained open')
      assert((await lines.first().innerText()).includes('import { db }'), 'Closing an inactive file changed selection')
      await page.getByRole('button', {name: 'Close ledger.ts'}).click()
      assert((await lines.first().innerText()).includes('export type Event'), 'Active close did not select the first remaining file')
      await page.getByRole('button', {name: 'Close types.ts'}).click()
      assert((await page.getByRole('button', {name: 'Close types.ts'}).count()) === 1, 'Source last-tab no-op was not retained')
      await page.getByRole('button', {name: 'Run', exact: true}).click()
      assert((await page.getByRole('button', {name: 'Run', exact: true}).count()) === 1, 'Run invented a visible execution state')
      assert((await page.getByText('Stop', {exact: true}).count()) === 0, 'Run became Stop without source evidence')
      await page.setViewportSize({width: 286, height: 360})
      await page.goto(previewUrl(3), {waitUntil: 'networkidle'})
      const scroller = page.locator('.lumen-code-reference-scroll')
      await scroller.evaluate(element => {element.scrollLeft = 240})
      const horizontal = await scroller.evaluate(element => ({overflow: element.scrollWidth > element.clientWidth, moved: element.scrollLeft > 0}))
      assert(horizontal.overflow && horizontal.moved, 'Long code lines did not scroll inside the pane')
      await page.getByRole('button', {name: 'types.ts', exact: true}).click()
      assert((await lines.first().innerText()).includes('export type Event'), 'Narrow tab did not switch files')
      const strip = page.locator('.lumen-code-reference-strip')
      const tabScroll = await strip.evaluate(element => ({overflow: element.scrollWidth > element.clientWidth, moved: element.scrollLeft > 0}))
      assert(tabScroll.overflow && tabScroll.moved, 'Narrow file strip did not scroll to the later tab')
      const footerVisible = await page.locator('.lumen-code-reference-footer').evaluate(element => element.getBoundingClientRect().bottom <= innerHeight + 1)
      assert(footerVisible, 'Narrow wrapped footer is clipped')
      await page.goto(previewUrl(3, {fixture: 'overflow'}), {waitUntil: 'networkidle'})
      const overflow = page.locator('.lumen-code-reference-scroll')
      await overflow.evaluate(element => {element.scrollTop = element.scrollHeight})
      const vertical = await overflow.evaluate(element => ({overflow: element.scrollHeight > element.clientHeight, moved: element.scrollTop > 0}))
      assert(vertical.overflow && vertical.moved, 'Long code did not scroll vertically')
      assert((await page.locator('.lumen-code-reference-line').last().innerText()).includes('finalLine'), 'Long code lost its final line')
      await page.goto(previewUrl(3, {fixture: 'localized'}), {waitUntil: 'networkidle'})
      await page.getByRole('button', {name: 'Ausfuehren', exact: true}).click()
      assert((await page.getByRole('button', {name: 'Ausfuehren', exact: true}).count()) === 1, 'Localized Run changed source state')
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Localized file tabs caused page overflow')
      assert(pageErrors.length === 0, `Code preview reported page errors: ${pageErrors.join(' | ')}`)
      console.log(JSON.stringify({codeFileSelection: true, activeAndInactiveClose: true, lastTabNoop: true, runNoop: true, cursor, horizontal, vertical, tabScroll, footerVisible, pageErrors: pageErrors.length}))
      return
    }
    if (markdownOnly) {
      await page.goto(previewUrl(2), { waitUntil: 'networkidle' })
      const source = page.getByRole('textbox', { name: 'Markdown source', exact: true })
      const changed = '# Revised heading\n\n**Alpha** and *beta*.\n\n> Quote note'
      await source.fill(changed)
      assert(
        (await page.getByRole('heading', { name: 'Revised heading', level: 3 }).count()) === 1,
        'Markdown source did not update its semantic preview',
      )
      assert(
        (await page.locator('.lumen-markdown-reference-toolbar p').innerText()) === '9 words · Markdown',
        'Raw source counter did not include Markdown syntax',
      )
      assert(
        (await page.locator('.lumen-markdown-reference-prose strong').innerText()) === 'Alpha',
        'Strong token did not render inline',
      )
      assert(
        (await page.locator('.lumen-markdown-reference-quote').innerText()) === 'Quote note',
        'Reference quote did not preserve paragraph semantics',
      )
      await page.getByRole('tab', { name: 'Preview', exact: true }).click()
      assert((await source.count()) === 0, 'Preview retained its source editor')
      await page.getByRole('tab', { name: 'Write', exact: true }).click()
      assert((await source.inputValue()) === changed, 'Mode switching lost the host source')
      assert((await page.locator('.lumen-markdown-reference-preview').count()) === 0, 'Write retained a preview pane')
      await page.getByRole('tab', { name: 'Split', exact: true }).click()
      await page.getByRole('tab', { name: 'Split', exact: true }).press('ArrowRight')
      assert(
        (await page.getByRole('tab', { name: 'Split', exact: true }).getAttribute('aria-selected')) === 'true',
        'Source no-op ArrowRight unexpectedly selected another mode',
      )
      for (const width of [768, 767]) {
        await page.setViewportSize({ width, height: 680 })
        const previewVisible = await page.locator('.lumen-markdown-reference-preview').isVisible()
        assert(previewVisible === width >= 768, `Split pane visibility did not follow its 768px boundary at ${width}`)
        assert((await source.inputValue()) === changed, 'Resize changed the host document')
      }
      for (const width of [430, 429, 356, 286]) {
        await page.setViewportSize({ width, height: 680 })
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
          `Markdown overflowed at ${width}`,
        )
      }
      await page.getByRole('tab', { name: 'Preview', exact: true }).press('Space')
      assert(
        (await source.count()) === 0 && (await page.locator('.lumen-markdown-reference-preview').isVisible()),
        'Narrow keyboard Preview did not replace the source pane',
      )
      await page.setViewportSize({ width: 286, height: 360 })
      await page.goto(previewUrl(2, { fixture: 'overflow' }), { waitUntil: 'networkidle' })
      const overflowSource = page.getByRole('textbox', { name: 'Markdown source', exact: true })
      await overflowSource.press('Control+End')
      const sourceScroll = await overflowSource.evaluate((element) => ({
        overflow: element.scrollHeight > element.clientHeight,
        moved: element.scrollTop > 0,
      }))
      assert(sourceScroll.overflow && sourceScroll.moved, 'Native long source did not expose its final paragraph')
      await page.getByRole('tab', { name: 'Preview', exact: true }).click()
      const preview = page.locator('.lumen-markdown-reference-scroll')
      await preview.hover()
      await page.mouse.wheel(0, 50000)
      await page.waitForTimeout(150)
      const previewScroll = await preview.evaluate((element) => ({
        overflow: element.scrollHeight > element.clientHeight,
        moved: element.scrollTop > 0,
      }))
      assert(previewScroll.overflow && previewScroll.moved, 'Rendered document did not use its own scroll region')
      await page.locator('.lumen-markdown-reference-prose p').last().scrollIntoViewIfNeeded()
      assert(
        (await page.locator('.lumen-markdown-reference-prose p').last().innerText()) === 'Final editable paragraph',
        'Rendered overflow document lost its final content',
      )
      await page.goto(previewUrl(2, { fixture: 'localized' }), { waitUntil: 'networkidle' })
      const localizedSource = page.getByRole('textbox', { name: 'Markdown-Quelltext', exact: true })
      await localizedSource.fill('# Lokalisierte Notiz\n\nBearbeiteter Inhalt')
      await page.getByRole('tab', { name: 'Vollstaendige Vorschauansicht', exact: true }).press('Space')
      assert(
        (await page.getByRole('heading', { name: 'Lokalisierte Notiz', exact: true }).count()) === 1,
        'Localized controlled source did not render',
      )
      const tabScroll = await page
        .getByRole('tablist')
        .evaluate((element) => ({ overflow: element.scrollWidth > element.clientWidth, moved: element.scrollLeft > 0 }))
      assert(
        tabScroll.overflow && tabScroll.moved,
        'Long localized mode labels did not support native keyboard scrolling',
      )
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        'Long localized Markdown content overflowed horizontally',
      )
      assert(pageErrors.length === 0, `Editor preview reported page errors: ${pageErrors.join(' | ')}`)
      console.log(
        JSON.stringify({
          markdownHostDraft: true,
          semanticPreview: true,
          sourceModes: true,
          sourceArrowNoop: true,
          splitBoundary: true,
          sourceScroll,
          previewScroll,
          tabScroll,
          pageErrors: pageErrors.length,
        }),
      )
      return
    }
    await page.goto(previewUrl(1), { waitUntil: 'networkidle' })
    await page.getByLabel('Document title', { exact: true }).fill('Edited title')
    await page.getByText('Saving…', { exact: true }).waitFor()
    await page.getByText('Saved', { exact: true }).waitFor()
    const body = page.getByRole('textbox', { name: 'Document body', exact: true })
    await body.fill('Alpha beta')
    await page.getByText('Saving…', { exact: true }).waitFor()
    await page.getByText('Saved', { exact: true }).waitFor()
    assert(
      (await page.getByRole('contentinfo').innerText()) ===
        '2 words\n10 characters\n1 min read\nMarkdown shortcuts are on',
      'Rich-text statistics did not update from host body',
    )
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    await page.getByRole('button', { name: 'Redo', exact: true }).click()
    assert((await body.inputValue()) === 'Alpha beta', 'Source no-op history controls invented a document history')
    await page.getByRole('button', { name: 'Bold', exact: true }).click()
    await page.getByRole('button', { name: 'Link', exact: true }).click()
    assert(
      (await page.getByRole('button', { name: 'Bold', exact: true }).getAttribute('aria-pressed')) === 'false',
      'Independent Bold state did not toggle off',
    )
    assert(
      (await page.getByRole('button', { name: 'Link', exact: true }).getAttribute('aria-pressed')) === 'true',
      'Link invented a dialog rather than a pressed state',
    )
    assert((await body.inputValue()) === 'Alpha beta', 'Format status incorrectly changed the plain-text document')
    await page.getByRole('button', { name: 'Paragraph', exact: true }).press('Space')
    await page.getByRole('menuitemradio', { name: 'Heading 1', exact: true }).click()
    assert((await page.getByRole('menu').count()) === 0, 'Block menu did not close after selection')
    assert(
      await page
        .getByRole('button', { name: 'Heading 1', exact: true })
        .evaluate((element) => element === document.activeElement),
      'Block menu did not return focus',
    )
    await page.getByRole('button', { name: 'Heading 1', exact: true }).press('Space')
    await page.getByRole('menuitemradio', { name: 'Heading 1', exact: true }).press('End')
    await page.keyboard.press('Space')
    assert(
      (await page.getByRole('button', { name: 'Numbered list', exact: true }).count()) === 1,
      'Menu keyboard End/Space did not choose the final stable block',
    )
    await page.getByRole('button', { name: 'Numbered list', exact: true }).press('Space')
    await page.keyboard.press('Escape')
    assert((await page.getByRole('menu').count()) === 0, 'Escape did not close the block menu')
    for (const width of [768, 640, 400, 356, 286]) {
      await page.setViewportSize({ width, height: 680 })
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
      assert(!overflow, `Rich-text editor overflowed horizontally at ${width}`)
    }
    await page.setViewportSize({ width: 286, height: 360 })
    await page.goto(previewUrl(1, { fixture: 'overflow' }), { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Paragraph', exact: true }).press('Space')
    await page.getByRole('menuitemradio', { name: 'Paragraph', exact: true }).press('End')
    const menuScroll = await page
      .getByRole('menu')
      .evaluate((element) => ({ overflow: element.scrollHeight > element.clientHeight, moved: element.scrollTop > 0 }))
    assert(
      menuScroll.overflow && menuScroll.moved,
      'Extended menu did not expose its final option through native focus scrolling',
    )
    await page.keyboard.press('Space')
    assert(
      (await page.getByRole('button', { name: 'Additional block style 34', exact: true }).count()) === 1,
      'Overflow block action lost the final host ID',
    )
    const longBody = page.getByRole('textbox', { name: 'Document body', exact: true })
    await longBody.press('Control+End')
    const bodyScroll = await longBody.evaluate((element) => ({
      overflow: element.scrollHeight > element.clientHeight,
      moved: element.scrollTop > 0,
    }))
    assert(bodyScroll.overflow && bodyScroll.moved, 'Native text editor did not expose the end of a long document')
    const shortMain = await page.locator('.lumen-rich-editor-main').evaluate((element) => {
      element.scrollTop = element.scrollHeight
      return { overflow: element.scrollHeight > element.clientHeight, moved: element.scrollTop > 0 }
    })
    assert(shortMain.overflow && shortMain.moved, 'Short editor pane hid part of the document instead of scrolling')
    assert(await page.getByRole('contentinfo').isVisible(), 'Short document scroll lost the nearby footer')
    await page.goto(previewUrl(1, { fixture: 'localized' }), { waitUntil: 'networkidle' })
    const localizedTitle = page.getByRole('textbox', { name: 'Dokumenttitel', exact: true })
    await localizedTitle.fill('Bearbeiteter Titel')
    await page
      .getByRole('button', {
        name: 'Lokalisierter Absatzstil mit absichtlich sehr langer Bezeichnung: paragraph',
        exact: true,
      })
      .press('Space')
    await page
      .getByRole('menuitemradio', {
        name: 'Lokalisierter Absatzstil mit absichtlich sehr langer Bezeichnung: heading-2',
        exact: true,
      })
      .click()
    assert(
      (await localizedTitle.inputValue()) === 'Bearbeiteter Titel',
      'Localized reordered block selection lost the document draft',
    )
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      'Localized editor overflowed horizontally',
    )
    assert(pageErrors.length === 0, `Editor preview reported page errors: ${pageErrors.join(' | ')}`)
    if (richOnly) {
      console.log(
        JSON.stringify({
          richTextHostDraft: true,
          sourceFormatStates: true,
          sourceHistoryNoop: true,
          blockKeyboard: true,
          menuScroll,
          bodyScroll,
          shortMain,
          localizedStableIds: true,
          pageErrors: pageErrors.length,
        }),
      )
      return
    }

    await page.goto(previewUrl(2), { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: 'Preview', exact: true }).click()
    assert(
      (await page.locator('.hbar-app-ui-editor-markdown-mode-preview').count()) === 1,
      'Markdown mode did not change',
    )
    assert(
      (await page.locator('.hbar-app-ui-editor-markdown-source').count()) === 0,
      'Markdown source remained visible after preview mode',
    )

    await page.goto(previewUrl(3), { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: 'ledger.ts', exact: true }).click()
    assert(
      (await page.locator('.hbar-app-ui-editor-code-file.is-active').innerText()) === 'ledger.ts',
      'Code tab selection did not use the supplied file ID',
    )
    await page.getByRole('button', { name: 'Run', exact: true }).click()
    assert(
      (await page.getByRole('button', { name: 'Stop', exact: true }).count()) === 1,
      'Run action did not update its nearby state',
    )

    await page.goto(previewUrl(4), { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Accept', exact: true }).first().click()
    assert(
      (await page.getByRole('button', { name: 'Done', exact: true }).count()) === 1,
      'Suggestion action did not resolve the original card',
    )

    await page.goto(previewUrl(4, { fixture: 'overflow' }), { waitUntil: 'networkidle' })
    const suggestionOverflow = await page.locator('.hbar-app-ui-editor-suggestion-list').evaluate((element) => {
      element.scrollTop = element.scrollHeight
      return { scrollable: element.scrollHeight > element.clientHeight, moved: element.scrollTop > 0 }
    })
    assert(
      suggestionOverflow.scrollable && suggestionOverflow.moved,
      'Suggestion pane did not provide real overflow scrolling',
    )

    await page.goto(previewUrl(5, { fixture: 'overflow' }), { waitUntil: 'networkidle' })
    const outlineOverflow = await page.locator('.hbar-app-ui-editor-reader-outline > nav').evaluate((element) => {
      element.scrollTop = element.scrollHeight
      return { scrollable: element.scrollHeight > element.clientHeight, moved: element.scrollTop > 0 }
    })
    assert(
      outlineOverflow.scrollable && outlineOverflow.moved,
      'Long-document outline did not provide real overflow scrolling',
    )

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(previewUrl(3), { waitUntil: 'networkidle' })
    const noHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    )
    assert(noHorizontalOverflow, 'Narrow editor layout overflowed horizontally')
    assert(
      (await page.getByRole('button', { name: 'Run', exact: true }).count()) === 0,
      'Narrow code view kept a non-reference run control',
    )
    assert(
      !(await page.locator('.hbar-app-ui-editor-minimap').isVisible()),
      'Narrow code view kept a non-reference minimap',
    )

    await page.goto(previewUrl(2, { fixture: 'localized' }), { waitUntil: 'networkidle' })
    const localizedNoHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    )
    assert(localizedNoHorizontalOverflow, 'Long localized editor labels overflowed horizontally')
    assert(pageErrors.length === 0, `Editor preview reported page errors: ${pageErrors.join(' | ')}`)

    console.log(
      JSON.stringify({
        richTextDraft: true,
        markdownMode: true,
        codeTabsAndRun: true,
        suggestionResolution: true,
        suggestionOverflow,
        outlineOverflow,
        noHorizontalOverflow,
        localizedNoHorizontalOverflow,
        pageErrors: pageErrors.length,
      }),
    )
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
