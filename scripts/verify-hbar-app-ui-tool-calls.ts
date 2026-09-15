import {chromium} from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5180'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
type ToolCallsFixture = 'overflow' | 'localized'

function previewUrl(variant: number, fixture?: ToolCallsFixture): string {
    const parameters = new URLSearchParams({variant: `hbar-app-ui-tool-calls-${variant}`, mode: 'isolated'})
    if (fixture) parameters.set('toolCallsFixture', fixture)
    return `${baseUrl}/?${parameters.toString()}`
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
            // A locally started Vite process can need a short interval before binding.
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
        const server = Bun.spawn(['bun', 'run', 'app-ui:preview', '--', '--host', '127.0.0.1'], {stdout: 'ignore', stderr: 'ignore'})
        await waitForPreview()
        return server
    }
}

async function inspectScrollable(locator: import('@playwright/test').Locator): Promise<{readonly scrollable: boolean; readonly moved: boolean}> {
    return locator.evaluate((element) => {
        element.scrollTop = element.scrollHeight
        return {scrollable: element.scrollHeight > element.clientHeight, moved: element.scrollTop > 0}
    })
}

async function run(): Promise<void> {
    const server = await ensurePreview()
    const browser = await chromium.launch({headless: true, executablePath})
    const page = await browser.newPage({viewport: {width: 1192, height: 640}})
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    try {
        await page.goto(previewUrl(1), {waitUntil: 'networkidle'})
        const traceToggle = page.getByRole('button', {name: /search_incidents.*Streaming/, exact: false})
        assert(await traceToggle.getAttribute('aria-expanded') === 'true', 'Trace did not open the host-selected item')
        await page.getByRole('button', {name: /read_file.*Done/, exact: false}).first().click()
        assert(await page.getByRole('button', {name: /read_file.*Done/, exact: false}).first().getAttribute('aria-expanded') === 'true', 'Trace item did not toggle by stable ID')

        await page.goto(previewUrl(2), {waitUntil: 'networkidle'})
        await page.getByRole('tab', {name: 'Failed', exact: true}).click()
        assert(await page.getByRole('button', {name: /fetch_url.*Failed/, exact: false}).count() === 1, 'Activity filter did not narrow to failed tools')
        assert(await page.getByRole('button', {name: /read_file.*Done/, exact: false}).count() === 0, 'Activity filter left an unrelated row visible')

        await page.goto(previewUrl(3), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: /idempotency\.ts/, exact: false}).click()
        assert(await page.getByText('stableKey', {exact: false}).count() === 1, 'Diff file disclosure did not show the selected file')

        await page.goto(previewUrl(4), {waitUntil: 'networkidle'})
        const searchResult = page.getByRole('button', {name: /Idempotent requests/, exact: false}).first()
        assert(await searchResult.count() === 1, 'Search result did not render as an actionable row')
        await searchResult.click()
        assert((await searchResult.innerText()).includes('Idempotency-Key'), 'Search result action row did not preserve its host-provided excerpt')

        await page.goto(previewUrl(5), {waitUntil: 'networkidle'})
        await page.getByRole('tab', {name: 'stderr', exact: true}).click()
        assert(await page.getByText('expected status 409', {exact: false}).count() === 1, 'Command output tab did not change')

        await page.goto(previewUrl(6), {waitUntil: 'networkidle'})
        const permissionSwitch = page.getByRole('switch', {name: 'Toggle delete file permission', exact: true})
        assert(await permissionSwitch.getAttribute('aria-checked') === 'false', 'Permission switch did not use host-provided initial state')
        await permissionSwitch.click()
        assert(await permissionSwitch.getAttribute('aria-checked') === 'false', 'Permission switch unexpectedly mutated uncontrolled domain data')

        await page.goto(previewUrl(1, 'overflow'), {waitUntil: 'networkidle'})
        const traceOverflow = await inspectScrollable(page.locator('.hbar-app-ui-tool-calls-trace-pane'))
        assert(traceOverflow.scrollable && traceOverflow.moved, 'Trace pane did not expose real overflow scrolling')
        await page.goto(previewUrl(2, 'overflow'), {waitUntil: 'networkidle'})
        const activityOverflow = await inspectScrollable(page.locator('.hbar-app-ui-tool-calls-activity-pane'))
        assert(activityOverflow.scrollable && activityOverflow.moved, 'Activity pane did not expose real overflow scrolling')
        await page.goto(previewUrl(4, 'overflow'), {waitUntil: 'networkidle'})
        const searchOverflow = await inspectScrollable(page.locator('.hbar-app-ui-tool-calls-search > main'))
        assert(searchOverflow.scrollable && searchOverflow.moved, 'Search pane did not expose real overflow scrolling')
        await page.goto(previewUrl(5, 'overflow'), {waitUntil: 'networkidle'})
        const commandOverflow = await inspectScrollable(page.locator('.hbar-app-ui-tool-calls-command-output'))
        assert(commandOverflow.scrollable && commandOverflow.moved, 'Command output did not expose real overflow scrolling')

        await page.setViewportSize({width: 320, height: 800})
        const narrowOverflow: Record<string, boolean> = {}
        for (const variant of [1, 2, 3, 4, 5, 6]) {
            await page.goto(previewUrl(variant, variant === 4 ? 'localized' : undefined), {waitUntil: 'networkidle'})
            const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
            narrowOverflow[`tool-calls-${variant}`] = noHorizontalOverflow
            assert(noHorizontalOverflow, `Narrow tool-calls-${variant} layout overflowed horizontally`)
        }

        await page.goto(previewUrl(1, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByText('Werkzeugaufrufe und laufende Ausfuehrungen', {exact: true}).count() === 1, 'Localized trace title was not rendered from the host bundle')
        await page.goto(previewUrl(6, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByText('Werkzeugberechtigungen fuer diesen Arbeitsbereich', {exact: true}).count() === 1, 'Localized permission title was not rendered from the host bundle')

        assert(pageErrors.length === 0, `Tool-call preview reported page errors: ${pageErrors.join(' | ')}`)
        console.log(JSON.stringify({
            traceToggle: true,
            activityFilter: true,
            diffDisclosure: true,
            searchAction: true,
            commandTabs: true,
            permissionContract: true,
            traceOverflow,
            activityOverflow,
            searchOverflow,
            commandOverflow,
            narrowOverflow,
            localizedHostCopy: true,
            pageErrors: pageErrors.length,
        }))
    } finally {
        await browser.close()
        server?.kill()
    }
}

await run()
