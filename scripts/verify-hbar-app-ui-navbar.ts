import {chromium} from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5180'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

type NavbarFixture = 'overflow' | 'localized'

function previewUrl(variant: number, options: {readonly fixture?: NavbarFixture} = {}): string {
    const parameters = new URLSearchParams({variant: `hbar-app-ui-navbar-${variant}`, mode: 'isolated'})
    if (options.fixture) parameters.set('navbarFixture', options.fixture)
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
            // A locally started preview can need a brief interval before binding.
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
        await page.getByRole('tab', {name: 'Discussion 3', exact: true}).click()
        assert(await page.getByRole('tab', {name: 'Discussion 3', exact: true}).getAttribute('aria-selected') === 'true', 'Project board tab did not change in local state')

        await page.goto(previewUrl(7), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Customers', exact: true}).click()
        assert(await page.getByRole('button', {name: 'Customers', exact: true}).evaluate((element) => element.classList.contains('is-selected')), 'Analytics primary tab did not select the supplied value')

        await page.goto(previewUrl(8), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'All 248', exact: true}).click()
        assert(await page.getByRole('button', {name: 'All 248', exact: true}).evaluate((element) => element.classList.contains('is-selected')), 'Filter tab did not select the supplied stable ID')

        await page.goto(previewUrl(2, {fixture: 'overflow'}), {waitUntil: 'networkidle'})
        const taskOverflow = await inspectScrollable(page.locator('.hbar-app-ui-navbar-task-main'))
        assert(taskOverflow.scrollable && taskOverflow.moved, 'Task pane did not provide real overflow scrolling')

        await page.goto(previewUrl(8, {fixture: 'overflow'}), {waitUntil: 'networkidle'})
        const filterOverflow = await inspectScrollable(page.locator('.hbar-app-ui-navbar-filter-list > main'))
        assert(filterOverflow.scrollable && filterOverflow.moved, 'Filter pane did not provide real overflow scrolling')

        await page.goto(previewUrl(10, {fixture: 'overflow'}), {waitUntil: 'networkidle'})
        const docsOverflow = await inspectScrollable(page.locator('.hbar-app-ui-navbar-docs > main > aside'))
        assert(docsOverflow.scrollable && docsOverflow.moved, 'Documentation sidebar did not provide real overflow scrolling')

        const narrowChecks: {readonly variant: number; readonly fixture?: NavbarFixture}[] = [
            {variant: 1}, {variant: 2}, {variant: 3}, {variant: 4, fixture: 'localized'},
            {variant: 5}, {variant: 6}, {variant: 7}, {variant: 8, fixture: 'localized'},
            {variant: 9}, {variant: 10}, {variant: 11}, {variant: 12}, {variant: 13}, {variant: 14},
        ]
        await page.setViewportSize({width: 320, height: 640})
        const narrowOverflow: Record<string, boolean> = {}
        for (const check of narrowChecks) {
            await page.goto(previewUrl(check.variant, check.fixture ? {fixture: check.fixture} : {}), {waitUntil: 'networkidle'})
            const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
            narrowOverflow[`navbar-${check.variant}`] = noHorizontalOverflow
            assert(noHorizontalOverflow, `Narrow navbar-${check.variant} layout overflowed horizontally`)
        }

        await page.goto(previewUrl(4, {fixture: 'localized'}), {waitUntil: 'networkidle'})
        assert(await page.getByText('Kostenlosen Arbeitsbereich jetzt erstellen', {exact: true}).count() === 1, 'Localized marketing primary action was not rendered from the host bundle')
        await page.goto(previewUrl(8, {fixture: 'localized'}), {waitUntil: 'networkidle'})
        assert(await page.getByText('Aktuelle gefilterte Ergebnisse exportieren', {exact: true}).count() === 1, 'Localized export action was not rendered from the host bundle')

        assert(pageErrors.length === 0, `Navbar preview reported page errors: ${pageErrors.join(' | ')}`)
        console.log(JSON.stringify({
            projectTabSelection: true,
            analyticsTabSelection: true,
            filterTabSelection: true,
            taskOverflow,
            filterOverflow,
            docsOverflow,
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
