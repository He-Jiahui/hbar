import {chromium, type Locator, type Page} from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function previewUrl(variant: number, fixture?: 'overflow' | 'localized'): string {
    const parameters = new URLSearchParams({variant: `hbar-app-ui-billing-${variant}`, mode: 'isolated'})
    if (fixture) parameters.set('billingFixture', fixture)
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
            // The preview server can need a short interval before the port is ready.
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

async function inspectScroll(locator: Locator): Promise<{readonly scrollable: boolean; readonly moved: boolean}> {
    return locator.evaluate((element) => {
        element.scrollTop = element.scrollHeight
        return {scrollable: element.scrollHeight > element.clientHeight, moved: element.scrollTop > 0}
    })
}

async function noHorizontalOverflow(page: Page, variant: number, fixture?: 'overflow' | 'localized'): Promise<boolean> {
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
        await page.getByRole('button', {name: 'Start recovery', exact: true}).click()
        await page.getByLabel('Search customers', {exact: true}).fill('Lumendesk')
        assert(await page.getByText('Lumendesk', {exact: true}).count() === 1, 'Invoice search did not filter rows')

        await page.goto(previewUrl(2), {waitUntil: 'networkidle'})
        const starterSwitch = page.getByRole('switch', {name: 'Starter Active', exact: true})
        await starterSwitch.click()
        assert(await starterSwitch.getAttribute('aria-checked') === 'false', 'Plan toggle did not change state')
        await page.getByRole('button', {name: 'Save changes', exact: true}).click()
        assert(await page.getByText('Unsaved changes', {exact: true}).count() === 0, 'Plan save did not clear the draft banner')

        await page.goto(previewUrl(3), {waitUntil: 'networkidle'})
        await page.getByLabel('Customer', {exact: true}).fill('Cedar Labs')
        await page.getByRole('button', {name: 'Next step', exact: true}).click()
        assert(await page.getByText('Step 2 of 4', {exact: false}).count() >= 1, 'Invoice composer did not advance')

        await page.goto(previewUrl(4), {waitUntil: 'networkidle'})
        const retryRow = page.getByRole('button', {name: 'Open retry attempts for Halcyon Pay', exact: true})
        assert(await retryRow.getAttribute('aria-expanded') === 'true', 'Initial retry selection was not restored')
        await page.getByRole('button', {name: 'Retry now', exact: true}).click()

        await page.goto(previewUrl(5), {waitUntil: 'networkidle'})
        await page.getByRole('radio', {name: 'Scale', exact: true}).check()
        await page.getByRole('button', {name: 'Continue', exact: true}).click()
        assert(await page.getByText('Timing', {exact: true}).count() >= 1, 'Change-plan workflow did not advance')

        await page.goto(previewUrl(6), {waitUntil: 'networkidle'})
        const mastercard = page.locator('[data-hbar-app-ui-item-id="mastercard"]')
        await mastercard.getByRole('button', {name: 'Make primary', exact: true}).click()
        assert(await mastercard.getByText('Primary', {exact: true}).count() === 1, 'Payment method primary action did not update')

        await page.goto(previewUrl(7), {waitUntil: 'networkidle'})
        const lastCycle = page.getByRole('button', {name: 'Last cycle', exact: true})
        await lastCycle.click()
        assert(await lastCycle.getAttribute('aria-pressed') === 'true', 'Usage period did not change')

        await page.goto(previewUrl(8), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Charge now', exact: true}).click()

        await page.goto(previewUrl(1, 'overflow'), {waitUntil: 'networkidle'})
        const statementOverflow = await inspectScroll(page.locator('[data-hbar-app-ui-list-strategy="pane-scroll"]').first())
        assert(statementOverflow.scrollable && statementOverflow.moved, 'Statement ledger did not scroll inside its pane')
        await page.goto(previewUrl(4, 'overflow'), {waitUntil: 'networkidle'})
        const recoveryOverflow = await inspectScroll(page.locator('[data-hbar-app-ui-list-strategy="pane-scroll"]').first())
        assert(recoveryOverflow.scrollable && recoveryOverflow.moved, 'Recovery queue did not scroll inside its pane')

        await page.goto(previewUrl(2, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByText('Tarife', {exact: true}).count() === 1, 'Localized plan title was not supplied by the host')
        assert(await page.getByText('Änderungen speichern', {exact: true}).count() === 1, 'Localized plan action was not supplied by the host')

        const narrowOverflow: Record<string, boolean> = {}
        for (let variant = 1; variant <= 8; variant += 1) {
            narrowOverflow[`billing-${variant}`] = await noHorizontalOverflow(page, variant, 'overflow')
            assert(narrowOverflow[`billing-${variant}`], `Narrow billing-${variant} layout overflowed horizontally`)
        }

        assert(pageErrors.length === 0, `Billing preview reported page errors: ${pageErrors.join(' | ')}`)
        console.log(JSON.stringify({statementOverflow, recoveryOverflow, narrowOverflow, localizedHostCopy: true, pageErrors: pageErrors.length}))
    } finally {
        await browser.close()
        server?.kill()
    }
}

await run()
