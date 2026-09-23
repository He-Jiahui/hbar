import {chromium} from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5180'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
type AgentActivityFixture = 'overflow' | 'localized'

function previewUrl(variant: number, fixture?: AgentActivityFixture): string {
    const parameters = new URLSearchParams({variant: `hbar-app-ui-agent-activity-${variant}`, mode: 'isolated'})
    if (fixture) parameters.set('agentActivityFixture', fixture)
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
            // A locally started preview can need a short interval before binding.
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
        assert(await page.getByRole('button').count() === 0, 'Live activity invented an interactive step')
        assert(await page.getByText('Loaded October general ledger', {exact: true}).count() === 1, 'Live activity omitted its host step')

        await page.goto(previewUrl(2), {waitUntil: 'networkidle'})
        const nestedGroup = page.locator('.hbar-app-ui-agent-activity-group-row').first()
        assert(await nestedGroup.getAttribute('aria-expanded') === 'true', 'Nested activity did not open host-provided group')
        await nestedGroup.click()
        assert(await nestedGroup.getAttribute('aria-expanded') === 'false', 'Nested activity group did not collapse')

        await page.goto(previewUrl(3), {waitUntil: 'networkidle'})
        assert(await page.getByRole('button').count() === 0, 'Desktop deployment invented step controls')
        await page.setViewportSize({width: 390, height: 844})
        await page.reload({waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Stop', exact: true}).click()
        assert(await page.getByText('Stopped', {exact: true}).count() === 1, 'Deployment stop did not update the active step')
        await page.getByRole('button', {name: 'Run again', exact: true}).click()
        assert(await page.getByText('Running', {exact: true}).count() === 1, 'Deployment rerun did not restore the active step')
        await page.setViewportSize({width: 1192, height: 640})

        await page.goto(previewUrl(4), {waitUntil: 'networkidle'})
        const rerun = page.getByRole('button', {name: /Re-run Reconcile October invoices/, exact: true}).first()
        assert(await rerun.count() === 1, 'History row action was not rendered')
        await rerun.click()

        await page.goto(previewUrl(5), {waitUntil: 'networkidle'})
        await page.getByRole('tab', {name: 'Warnings', exact: true}).click()
        assert(await page.locator('.hbar-app-ui-agent-activity-log-list > li').count() === 2, 'Log filter did not narrow warning entries')

        await page.goto(previewUrl(6), {waitUntil: 'networkidle'})
        assert(await page.getByRole('progressbar').count() === 4, 'Worker progress bars did not preserve host data')

        await page.goto(previewUrl(7), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Retry run', exact: true}).click()
        const download = page.getByRole('button', {name: /Download ledger-partial\.csv/, exact: false})
        assert(await download.count() === 1, 'Failure output action was not rendered')

        const overflowChecks: Record<string, {readonly scrollable: boolean; readonly moved: boolean}> = {}
        const overflowSelectors = [
            [1, '.hbar-app-ui-agent-activity-live .hbar-app-ui-agent-activity-pane'],
            [2, '.hbar-app-ui-agent-activity-nested .hbar-app-ui-agent-activity-pane'],
            [3, '.hbar-app-ui-agent-activity-deployment .hbar-app-ui-agent-activity-pane'],
            [4, '.hbar-app-ui-agent-activity-history .hbar-app-ui-agent-activity-pane'],
            [5, '.hbar-app-ui-agent-activity-log .hbar-app-ui-agent-activity-pane'],
            [6, '.hbar-app-ui-agent-activity-workers .hbar-app-ui-agent-activity-pane'],
            [7, '.hbar-app-ui-agent-activity-failure-body'],
        ] as const
        for (const [variant, selector] of overflowSelectors) {
            await page.goto(previewUrl(variant, 'overflow'), {waitUntil: 'networkidle'})
            const result = await inspectScrollable(page.locator(selector))
            overflowChecks[`agent-activity-${variant}`] = result
            if (variant !== 7)
                assert(result.scrollable && result.moved, `Agent activity ${variant} did not expose its declared overflow behavior`)
        }

        await page.setViewportSize({width: 320, height: 640})
        const narrowOverflow: Record<string, boolean> = {}
        for (let variant = 1; variant <= 7; variant += 1) {
            await page.goto(previewUrl(variant, variant === 1 || variant === 7 ? 'localized' : undefined), {waitUntil: 'networkidle'})
            const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
            narrowOverflow[`agent-activity-${variant}`] = noHorizontalOverflow
            assert(noHorizontalOverflow, `Narrow agent-activity-${variant} layout overflowed horizontally`)
        }

        await page.goto(previewUrl(3, 'localized'), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Bereitstellung anhalten', exact: true}).click()
        assert(await page.getByText('Angehalten', {exact: true}).count() === 1, 'Localized deployment state was not rendered from the host bundle')
        assert(await page.getByRole('button', {name: 'Erneut ausführen', exact: true}).count() === 1, 'Localized rerun action was not rendered from the host bundle')
        await page.goto(previewUrl(7, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByText('Oktoberbuch-Export fehlgeschlagen', {exact: true}).count() === 1, 'Localized failure title was not rendered from the host bundle')

        assert(pageErrors.length === 0, `Agent activity preview reported page errors: ${pageErrors.join(' | ')}`)
        console.log(JSON.stringify({
            liveStaticTimeline: true,
            nestedDisclosure: true,
            deploymentStopAndRerun: true,
            historyAction: true,
            logFilter: true,
            workerProgress: true,
            failureActions: true,
            overflowChecks,
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
