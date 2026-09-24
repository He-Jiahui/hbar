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

async function textContrast(locator: import('@playwright/test').Locator): Promise<number> {
    return locator.evaluate(async (element) => {
        await Promise.all(element.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
            .map((animation) => animation.finished.catch(() => undefined)))
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 1
        const context = canvas.getContext('2d')
        if (!context) return 0
        const fill = (color: string) => {
            context.fillStyle = color
            context.fillRect(0, 0, 1, 1)
        }
        const luminance = () => {
            const pixel = context.getImageData(0, 0, 1, 1).data
            const channels = [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0].map((value) => {
                const normalized = value / 255
                return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
            })
            return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722
        }
        const ancestors: Element[] = []
        for (let current: Element | null = element; current; current = current.parentElement) ancestors.push(current)
        fill('#fff')
        for (const ancestor of ancestors.reverse()) fill(getComputedStyle(ancestor).backgroundColor)
        const background = luminance()
        fill(getComputedStyle(element).color)
        const foreground = luminance()
        return (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05)
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
        const liveStop = page.getByRole('button', {name: 'Stop', exact: true})
        assert(await page.getByRole('button').count() === 1 && await liveStop.count() === 1, 'Live activity must expose the reference Stop action')
        assert(await page.getByText('Loaded October general ledger', {exact: true}).count() === 1, 'Live activity omitted its host step')
        await liveStop.click()
        assert(await liveStop.isDisabled(), 'Live Stop did not become disabled')
        assert(await page.getByText('Stopped', {exact: true}).count() === 2, 'Live Stop did not update status and active step')

        await page.goto(previewUrl(2), {waitUntil: 'networkidle'})
        const nestedGroup = page.locator('.hbar-app-ui-agent-activity-group-row').first()
        assert(await nestedGroup.getAttribute('aria-expanded') === 'true', 'Nested activity did not open host-provided group')
        await nestedGroup.click()
        assert(await nestedGroup.getAttribute('aria-expanded') === 'false', 'Nested activity group did not collapse')

        await page.goto(previewUrl(3), {waitUntil: 'networkidle'})
        assert(await page.getByRole('button').count() === 1, 'Desktop deployment must expose the reference Stop action')
        assert(await page.getByRole('button', {name: 'Stop', exact: true}).count() === 1, 'Desktop deployment omitted Stop')
        await page.setViewportSize({width: 390, height: 844})
        await page.reload({waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Stop', exact: true}).click()
        assert(await page.getByText('Stopped', {exact: true}).count() === 2, 'Deployment stop did not update the header and active step')
        await page.getByRole('button', {name: 'Run again', exact: true}).click()
        assert(await page.getByText('Running', {exact: true}).count() === 2, 'Deployment rerun did not restore the header and active step')
        await page.setViewportSize({width: 1192, height: 640})

        await page.goto(previewUrl(4), {waitUntil: 'networkidle'})
        const rerun = page.getByRole('button', {name: /Re-run Reconcile October invoices/, exact: true}).first()
        assert(await rerun.count() === 1, 'History row action was not rendered')
        await rerun.click()

        await page.goto(previewUrl(5), {waitUntil: 'networkidle'})
        await page.getByRole('radio', {name: 'Warnings', exact: true}).click()
        assert(await page.locator('.hbar-app-ui-agent-activity-log-list > li').count() === 2, 'Log filter did not narrow warning entries')
        await page.reload({waitUntil: 'domcontentloaded'})
        const logStop = page.getByRole('button', {name: 'Stop', exact: true})
        await logStop.waitFor({state: 'visible'})
        await page.locator('.hbar-app-ui-agent-activity-log-list > li').nth(24).waitFor({state: 'attached'})
        const followingLatest = await page.locator('.hbar-app-ui-agent-activity-log-scroll').evaluate((pane) =>
            pane.scrollHeight - pane.clientHeight - pane.scrollTop <= 1)
        assert(followingLatest, 'Live log did not follow its newest entry')
        await logStop.click()
        assert(await logStop.count() === 0, 'Log Stop did not end its live run')
        await page.reload({waitUntil: 'domcontentloaded'})
        await page.locator('[data-hbar-app-ui-log-phase="complete"]').waitFor({state: 'visible'})
        const logScroll = page.locator('.hbar-app-ui-agent-activity-log-scroll')
        await logScroll.evaluate((pane) => { pane.scrollTop = 0 })
        const jump = page.getByRole('button', {name: 'Jump to latest', exact: true})
        await jump.waitFor({state: 'visible'})
        await jump.click()
        assert(await jump.count() === 0, 'Jump to latest did not restore log following')

        await page.goto(previewUrl(6), {waitUntil: 'networkidle'})
        assert(await page.getByRole('progressbar').count() === 0, 'Decorative worker tracks became announced progress controls')
        assert(await page.locator('.hbar-app-ui-agent-activity-worker-list > li').count() === 6, 'Worker list did not preserve all host records')
        assert(await page.locator('.hbar-app-ui-agent-activity-worker-list .lumen-agent-activity-progress').count() === 4, 'Worker visual tracks did not preserve host data')

        await page.goto(previewUrl(7), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Retry run', exact: true}).click()
        assert(await page.getByRole('alert').getByText('Retry queued', {exact: true}).count() === 1, 'Failure retry did not show queued feedback')
        assert(await page.getByRole('alert').getByText('Attempt 3 starts off-peak at 22:00 with a 512-row batch size.', {exact: true}).count() === 1, 'Failure retry did not show host-provided schedule')
        await page.getByRole('button', {name: 'Cancel retry', exact: true}).click()
        assert(await page.getByRole('alert').getByText('Warehouse write timed out', {exact: true}).count() === 1, 'Cancelling a queued retry did not restore the failure')
        assert(await page.getByRole('button', {name: 'Retry run', exact: true}).count() === 1, 'Retry action did not return after cancelling')
        const download = page.getByRole('button', {name: /Download ledger-partial\.csv/, exact: false})
        assert(await download.count() === 1, 'Failure output action was not rendered')
        const failureHeader = page.getByRole('banner')
        const headerY = (await failureHeader.boundingBox())?.y
        await download.focus()
        assert(await page.locator('.hbar-app-ui-agent-activity-failure-body').evaluate((element) => element.scrollTop) > 0, 'Download focus did not scroll the failure content pane')
        assert((await failureHeader.boundingBox())?.y === headerY, 'Download focus scrolled the failure header out of view')

        for (const theme of ['dark', 'light']) {
            await page.goto(`${previewUrl(7)}&theme=${theme}`, {waitUntil: 'networkidle'})
            const retry = page.getByRole('button', {name: 'Retry run', exact: true})
            await retry.hover()
            assert(await textContrast(retry) >= 4.5, `${theme} Retry hover lost readable contrast`)
            await retry.click()
            const cancelRetry = page.getByRole('button', {name: 'Cancel retry', exact: true})
            await cancelRetry.hover()
            assert(await textContrast(cancelRetry) >= 4.5, `${theme} Cancel retry hover lost readable contrast`)
            assert(await cancelRetry.locator('path').evaluate((path) => getComputedStyle(path).stroke !== 'none'), 'Cancel retry glyph lost its stroke')
        }

        const overflowChecks: Record<string, {readonly scrollable: boolean; readonly moved: boolean}> = {}
        const overflowSelectors = [
            [1, '.hbar-app-ui-agent-activity-live .hbar-app-ui-agent-activity-pane'],
            [2, '.hbar-app-ui-agent-activity-nested .hbar-app-ui-agent-activity-pane'],
            [3, '.hbar-app-ui-agent-activity-deployment .hbar-app-ui-agent-activity-pane'],
            [4, '.hbar-app-ui-agent-activity-history .hbar-app-ui-agent-activity-pane'],
            [5, '.hbar-app-ui-agent-activity-log-scroll'],
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
        assert(await page.getByText('Angehalten', {exact: true}).count() === 2, 'Localized deployment state was not rendered from the host bundle')
        assert(await page.getByRole('button', {name: 'Erneut ausführen', exact: true}).count() === 1, 'Localized rerun action was not rendered from the host bundle')
        await page.goto(previewUrl(1, 'localized'), {waitUntil: 'networkidle'})
        const localizedLiveStop = page.getByRole('button', {name: 'Ausführung sicher anhalten', exact: true})
        await localizedLiveStop.click()
        assert(await localizedLiveStop.isDisabled(), 'Localized live Stop did not become disabled')
        assert(await page.getByText('Angehalten', {exact: true}).count() === 2, 'Localized live Stop did not use the host-provided status')
        await page.goto(previewUrl(7, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByText('Oktoberbuch-Export fehlgeschlagen', {exact: true}).count() === 1, 'Localized failure title was not rendered from the host bundle')
        await page.getByRole('button', {name: 'Ausführung erneut versuchen', exact: true}).click()
        assert(await page.getByRole('alert').getByText('Erneuter Versuch vorgemerkt', {exact: true}).count() === 1, 'Localized retry feedback was not rendered from the host bundle')
        await page.getByRole('button', {name: 'Erneuten Versuch abbrechen', exact: true}).click()

        assert(pageErrors.length === 0, `Agent activity preview reported page errors: ${pageErrors.join(' | ')}`)
        console.log(JSON.stringify({
            liveStopAndTimeline: true,
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
