import {chromium} from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
type FeedbackFixture = 'overflow' | 'localized'

function previewUrl(variant: number, fixture?: FeedbackFixture): string {
    const params = new URLSearchParams({variant: `hbar-app-ui-feedback-${variant}`, mode: 'isolated'})
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
        const server = Bun.spawn(['bun', 'run', 'app-ui:preview', '--', '--host', '127.0.0.1', '--port', '5185'], {stdout: 'ignore', stderr: 'ignore'})
        await waitForPreview()
        return server
    }
}

async function inspectScroll(locator: import('@playwright/test').Locator): Promise<{readonly scrollable: boolean; readonly moved: boolean}> {
    return locator.evaluate((element) => {
        element.scrollTop = element.scrollHeight
        return {scrollable: element.scrollHeight > element.clientHeight, moved: element.scrollTop > 0}
    })
}

async function noHorizontalOverflow(page: import('@playwright/test').Page, variant: number, fixture?: FeedbackFixture): Promise<boolean> {
    await page.goto(previewUrl(variant, fixture), {waitUntil: 'networkidle'})
    return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
}

async function run(): Promise<void> {
    const server = await ensurePreview()
    const browser = await chromium.launch({headless: true, executablePath})
    const page = await browser.newPage({viewport: {width: 1192, height: 800}})
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    try {
        await page.goto(previewUrl(1), {waitUntil: 'networkidle'})
        await page.locator('.hbar-app-ui-feedback-textarea-wrap textarea').fill('Please make exports easier to review.')
        await page.getByRole('button', {name: 'Send feedback', exact: true}).click()
        assert(await page.getByText('Thanks for the feedback', {exact: true}).count() === 1, 'Feedback widget did not settle into its sent state')

        await page.goto(previewUrl(2), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: '8', exact: true}).click()
        await page.getByRole('button', {name: 'Submit', exact: true}).click()
        assert(await page.getByText('Thanks, your response was recorded.', {exact: true}).count() === 1, 'Survey did not settle after score submission')

        await page.goto(previewUrl(3), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: '4 out of 5, Good', exact: true}).click()
        await page.getByRole('button', {name: 'Send rating', exact: true}).click()
        assert(await page.getByText('Thanks for rating your support experience.', {exact: true}).count() === 1, 'Post-resolution rating did not settle')

        await page.goto(previewUrl(4), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Vote for Row-level permissions on shared views', exact: true}).click()
        assert(await page.getByRole('button', {name: 'Remove vote from Row-level permissions on shared views', exact: true}).count() === 1, 'Feature request vote did not toggle its target')
        await page.getByRole('textbox', {name: 'Search requests', exact: true}).fill('webhook')
        assert(await page.getByText('Webhook retries with a dead letter queue', {exact: true}).count() === 1, 'Feature request search did not filter host records')

        await page.goto(previewUrl(5), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Open Saved views replaced our spreadsheet', exact: true}).click()
        assert(await page.locator('.hbar-app-ui-feedback-thread-detail h3').textContent() === 'Saved views replaced our spreadsheet', 'Inbox thread selection did not update the detail pane')
        await page.getByRole('button', {name: 'Add tag', exact: true}).click()
        await page.getByRole('button', {name: 'Archive', exact: true}).last().click()

        await page.goto(previewUrl(6), {waitUntil: 'networkidle'})
        await page.getByRole('radio', {name: '90 days', exact: true}).click()
        assert(await page.getByRole('radio', {name: '90 days', exact: true}).getAttribute('aria-checked') === 'true', 'Insights period did not switch')

        const overflowChecks: Record<string, {readonly scrollable: boolean; readonly moved: boolean}> = {}
        const overflowSelectors: Readonly<Record<number, string>> = {4: '.hbar-app-ui-feedback-request-list', 5: '.hbar-app-ui-feedback-thread-list', 6: '.hbar-app-ui-feedback-themes'}
        for (const [variantText, selector] of Object.entries(overflowSelectors)) {
            const variant = Number(variantText)
            await page.goto(previewUrl(variant, 'overflow'), {waitUntil: 'networkidle'})
            const inspection = await inspectScroll(page.locator(selector))
            overflowChecks[`feedback-${variant}`] = inspection
            assert(inspection.scrollable && inspection.moved, `feedback-${variant} did not expose its declared pane scroll strategy`)
        }

        await page.goto(previewUrl(1, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.locator('.hbar-app-ui-feedback-modal-header h2').textContent() === 'Feedback senden', 'Localized widget copy was not supplied by the host bundle')
        await page.goto(previewUrl(5, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByText('Feedback-Posteingang', {exact: true}).count() === 1, 'Localized inbox copy was not supplied by the host bundle')

        await page.setViewportSize({width: 320, height: 800})
        const narrowOverflow: Record<string, boolean> = {}
        for (let variant = 1; variant <= 6; variant += 1) {
            narrowOverflow[`feedback-${variant}`] = await noHorizontalOverflow(page, variant, variant === 4 || variant === 5 ? 'localized' : undefined)
            assert(narrowOverflow[`feedback-${variant}`], `Narrow feedback-${variant} layout overflowed horizontally`)
        }

        assert(pageErrors.length === 0, `Feedback preview reported page errors: ${pageErrors.join(' | ')}`)
        console.log(JSON.stringify({overflowChecks, narrowOverflow, localizedHostCopy: true, pageErrors: pageErrors.length}))
    } finally {
        await browser.close()
        server?.kill()
    }
}

await run()
