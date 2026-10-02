import {chromium, type Locator, type Page} from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function previewUrl(variant: number, fixture?: 'overflow' | 'localized'): string {
    const parameters = new URLSearchParams({variant: `hbar-app-ui-integrations-${variant}`, mode: 'isolated'})
    if (fixture) parameters.set('integrationsFixture', fixture)
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
            // The preview server can need a brief interval before listening.
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
        await page.getByLabel('Search integrations', {exact: true}).fill('Harbor')
        assert(await page.getByText('Harbor', {exact: true}).count() === 1, 'Marketplace search did not filter integrations')
        await page.getByRole('button', {name: 'Connect Harbor', exact: true}).click()
        assert(await page.getByText('Connected', {exact: true}).count() >= 1, 'Marketplace connection did not update')

        await page.goto(previewUrl(2), {waitUntil: 'networkidle'})
        const issueSwitch = page.getByRole('switch', {name: 'Toggle Write issues', exact: true})
        await issueSwitch.click()
        assert(await issueSwitch.getAttribute('aria-checked') === 'false', 'Connection scope toggle did not update')
        await page.getByRole('button', {name: 'Disconnect', exact: true}).click()
        assert(await page.getByText('Disconnected', {exact: true}).count() === 1, 'Connection disconnect did not update status')

        await page.goto(previewUrl(3), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Reveal Billing worker', exact: true}).click()
        assert(await page.getByText('rbk_live_91a2b3c4d5e6f7a5d3', {exact: true}).count() === 1, 'Key reveal did not expose host value')
        await page.getByRole('button', {name: 'Revoke Warehouse sync', exact: true}).click()
        assert(await page.getByText('Warehouse sync', {exact: true}).count() === 0, 'Key revoke did not remove the original row')

        await page.goto(previewUrl(4), {waitUntil: 'networkidle'})
        const delivery = page.getByRole('button', {name: 'Open usage.rollup delivery', exact: true}).first()
        assert(await page.getByText('"workspace": "wrk_2f81"', {exact: false}).count() === 1, 'Initial webhook delivery payload was not restored')
        await delivery.click()
        assert(await page.getByText('"workspace": "wrk_2f81"', {exact: false}).count() === 0, 'Webhook delivery did not collapse payload')
        await delivery.click()
        assert(await page.getByText('"workspace": "wrk_2f81"', {exact: false}).count() === 1, 'Webhook delivery did not expand payload')
        await page.getByRole('switch', {name: 'Toggle hooks.northwind.dev/halcyon/usage', exact: true}).click()
        assert(await page.getByText('Disabled', {exact: true}).count() === 1, 'Webhook endpoint switch did not update')

        await page.goto(previewUrl(5), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Authorize', exact: true}).click()
        assert(await page.getByText('Authorized', {exact: true}).count() === 1, 'Consent authorize action did not update')

        await page.goto(previewUrl(6), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Pause Northwind', exact: true}).click()
        assert(await page.getByText('Paused', {exact: true}).count() >= 2, 'Sync source pause did not update state')
        await page.getByRole('button', {name: 'Retry', exact: true}).click()

        await page.goto(previewUrl(1, 'overflow'), {waitUntil: 'networkidle'})
        const marketplaceOverflow = await inspectScroll(page.locator('[data-hbar-app-ui-list-strategy="pane-scroll"]').first())
        assert(marketplaceOverflow.scrollable && marketplaceOverflow.moved, 'Marketplace list did not scroll inside its pane')
        await page.goto(previewUrl(3, 'overflow'), {waitUntil: 'networkidle'})
        const keyOverflow = await inspectScroll(page.locator('[data-hbar-app-ui-list-strategy="pane-scroll"]').first())
        assert(keyOverflow.scrollable && keyOverflow.moved, 'Key table did not scroll inside its pane')
        await page.goto(previewUrl(4, 'overflow'), {waitUntil: 'networkidle'})
        const deliveryOverflow = await inspectScroll(page.locator('[data-hbar-app-ui-list-strategy="pane-scroll"]').first())
        assert(deliveryOverflow.scrollable && deliveryOverflow.moved, 'Delivery list did not scroll inside its pane')
        await page.goto(previewUrl(6, 'overflow'), {waitUntil: 'networkidle'})
        const syncOverflow = await inspectScroll(page.locator('[data-hbar-app-ui-list-strategy="pane-scroll"]').first())
        assert(syncOverflow.scrollable && syncOverflow.moved, 'Sync list did not scroll inside its pane')

        await page.goto(previewUrl(1, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByText('Integrationen', {exact: true}).count() === 1, 'Localized marketplace title was not supplied by the host')
        assert(await page.getByText('Sehr lange lokalisierte Beschreibung der verbundenen und verfügbaren Erweiterungen.', {exact: true}).count() === 1, 'Localized marketplace description was not supplied by the host')

        const narrowOverflow: Record<string, boolean> = {}
        for (let variant = 1; variant <= 6; variant += 1) {
            narrowOverflow[`integrations-${variant}`] = await noHorizontalOverflow(page, variant, 'overflow')
            assert(narrowOverflow[`integrations-${variant}`], `Narrow integrations-${variant} layout overflowed horizontally`)
        }

        assert(pageErrors.length === 0, `Integrations preview reported page errors: ${pageErrors.join(' | ')}`)
        console.log(JSON.stringify({marketplaceOverflow, keyOverflow, deliveryOverflow, syncOverflow, narrowOverflow, localizedHostCopy: true, pageErrors: pageErrors.length}))
    } finally {
        await browser.close()
        server?.kill()
    }
}

await run()
