import {chromium} from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5180'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

type EditorFixture = 'overflow' | 'localized'

function previewUrl(variant: number, options: {readonly fixture?: EditorFixture} = {}): string {
    const parameters = new URLSearchParams({variant: `hbar-app-ui-editor-${variant}`, mode: 'isolated'})
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
    const browser = await chromium.launch({headless: true, executablePath})
    const page = await browser.newPage({viewport: {width: 1192, height: 780}})
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    try {
        await page.goto(previewUrl(1), {waitUntil: 'networkidle'})
        await page.getByLabel('Document title', {exact: true}).fill('Edited title')
        assert(await page.getByText('Unsaved changes', {exact: true}).count() === 1, 'Rich-text draft did not expose local unsaved feedback')

        await page.goto(previewUrl(2), {waitUntil: 'networkidle'})
        await page.getByRole('tab', {name: 'Preview', exact: true}).click()
        assert(await page.locator('.hbar-app-ui-editor-markdown-mode-preview').count() === 1, 'Markdown mode did not change')
        assert(await page.locator('.hbar-app-ui-editor-markdown-source').count() === 0, 'Markdown source remained visible after preview mode')

        await page.goto(previewUrl(3), {waitUntil: 'networkidle'})
        await page.getByRole('tab', {name: 'ledger.ts', exact: true}).click()
        assert(await page.locator('.hbar-app-ui-editor-code-file.is-active').innerText() === 'ledger.ts', 'Code tab selection did not use the supplied file ID')
        await page.getByRole('button', {name: 'Run', exact: true}).click()
        assert(await page.getByRole('button', {name: 'Stop', exact: true}).count() === 1, 'Run action did not update its nearby state')

        await page.goto(previewUrl(4), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Accept', exact: true}).first().click()
        assert(await page.getByRole('button', {name: 'Done', exact: true}).count() === 1, 'Suggestion action did not resolve the original card')

        await page.goto(previewUrl(4, {fixture: 'overflow'}), {waitUntil: 'networkidle'})
        const suggestionOverflow = await page.locator('.hbar-app-ui-editor-suggestion-list').evaluate((element) => {
            element.scrollTop = element.scrollHeight
            return {scrollable: element.scrollHeight > element.clientHeight, moved: element.scrollTop > 0}
        })
        assert(suggestionOverflow.scrollable && suggestionOverflow.moved, 'Suggestion pane did not provide real overflow scrolling')

        await page.goto(previewUrl(5, {fixture: 'overflow'}), {waitUntil: 'networkidle'})
        const outlineOverflow = await page.locator('.hbar-app-ui-editor-reader-outline > nav').evaluate((element) => {
            element.scrollTop = element.scrollHeight
            return {scrollable: element.scrollHeight > element.clientHeight, moved: element.scrollTop > 0}
        })
        assert(outlineOverflow.scrollable && outlineOverflow.moved, 'Long-document outline did not provide real overflow scrolling')

        await page.setViewportSize({width: 390, height: 844})
        await page.goto(previewUrl(3), {waitUntil: 'networkidle'})
        const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
        assert(noHorizontalOverflow, 'Narrow editor layout overflowed horizontally')
        assert(await page.getByRole('button', {name: 'Run', exact: true}).count() === 0, 'Narrow code view kept a non-reference run control')
        assert(!await page.locator('.hbar-app-ui-editor-minimap').isVisible(), 'Narrow code view kept a non-reference minimap')

        await page.goto(previewUrl(2, {fixture: 'localized'}), {waitUntil: 'networkidle'})
        const localizedNoHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
        assert(localizedNoHorizontalOverflow, 'Long localized editor labels overflowed horizontally')
        assert(pageErrors.length === 0, `Editor preview reported page errors: ${pageErrors.join(' | ')}`)

        console.log(JSON.stringify({
            richTextDraft: true,
            markdownMode: true,
            codeTabsAndRun: true,
            suggestionResolution: true,
            suggestionOverflow,
            outlineOverflow,
            noHorizontalOverflow,
            localizedNoHorizontalOverflow,
            pageErrors: pageErrors.length,
        }))
    } finally {
        await browser.close()
        server?.kill()
    }
}

await run()
