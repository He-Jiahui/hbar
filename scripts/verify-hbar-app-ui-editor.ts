import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5180'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

type EditorFixture = 'overflow' | 'localized'
const richOnly = process.argv.includes('--rich-only')

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
