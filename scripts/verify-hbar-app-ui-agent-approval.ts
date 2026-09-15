import {chromium} from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5180'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
type AgentApprovalFixture = 'overflow' | 'localized'
type GeometryBox = Readonly<{x: number; y: number; width: number; height: number}>
type GeometryExpectation = Readonly<{
    readonly selector: string
    readonly name: string
    readonly expected: GeometryBox
}>
type GeometryViewport = Readonly<{
    readonly name: 'desktop' | 'mobile'
    readonly width: number
    readonly height: number
    readonly expectations: readonly GeometryExpectation[]
}>

function previewUrl(variant: number, fixture?: AgentApprovalFixture): string {
    const parameters = new URLSearchParams({variant: `hbar-app-ui-agent-approval-${variant}`, mode: 'isolated'})
    if (fixture) parameters.set('agentApprovalFixture', fixture)
    return `${baseUrl}/?${parameters.toString()}`
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
}

function boxDifference(actual: GeometryBox, expected: GeometryBox): number {
    return Math.max(
        Math.abs(actual.x - expected.x),
        Math.abs(actual.y - expected.y),
        Math.abs(actual.width - expected.width),
        Math.abs(actual.height - expected.height),
    )
}

async function measuredBox(locator: import('@playwright/test').Locator): Promise<GeometryBox> {
    return locator.evaluate((element) => {
        const box = element.getBoundingClientRect()
        return {x: box.x, y: box.y, width: box.width, height: box.height}
    })
}

async function verifyReferenceGeometry(page: import('@playwright/test').Page): Promise<Record<string, number>> {
    /* These values are observations from the captured reference iframe. They are
       assertions only: the implementation remains a flex/normal-flow layout. */
    const layouts: Readonly<Record<number, readonly GeometryViewport[]>> = {
        1: [
            {name: 'desktop', width: 1192, height: 481, expectations: [
                {name: 'request card', selector: '.hbar-app-ui-agent-approval-request-card', expected: {x: 212, y: 255.5, width: 768, height: 157.125}},
            ]},
            {name: 'mobile', width: 320, height: 481, expectations: [
                {name: 'request card', selector: '.hbar-app-ui-agent-approval-request-card', expected: {x: 16, y: 363.75, width: 288, height: 259.375}},
            ]},
        ],
        2: [
            {name: 'desktop', width: 1192, height: 561, expectations: [
                {name: 'diff card', selector: '.hbar-app-ui-agent-approval-card', expected: {x: 260, y: 144.5, width: 672, height: 327}},
            ]},
            {name: 'mobile', width: 320, height: 561, expectations: [
                {name: 'diff card', selector: '.hbar-app-ui-agent-approval-card', expected: {x: 16, y: 96.75, width: 288, height: 422.5}},
            ]},
        ],
        3: [
            {name: 'desktop', width: 1192, height: 641, expectations: [
                {name: 'featured queue item', selector: '.hbar-app-ui-agent-approval-queue-featured', expected: {x: 24, y: 64, width: 1144, height: 155.125}},
                {name: 'first queue row', selector: '.hbar-app-ui-agent-approval-queue-compact-row', expected: {x: 24, y: 225.125, width: 1144, height: 40}},
            ]},
            {name: 'mobile', width: 320, height: 641, expectations: [
                {name: 'featured queue item', selector: '.hbar-app-ui-agent-approval-queue-featured', expected: {x: 16, y: 64, width: 288, height: 179.125}},
                {name: 'first queue row', selector: '.hbar-app-ui-agent-approval-queue-compact-row', expected: {x: 16, y: 249.125, width: 288, height: 40}},
            ]},
        ],
        4: [
            {name: 'desktop', width: 1192, height: 561, expectations: [
                {name: 'permission card', selector: '.hbar-app-ui-agent-approval-card', expected: {x: 260, y: 76, width: 672, height: 428.5}},
            ]},
            {name: 'mobile', width: 320, height: 561, expectations: [
                {name: 'permission card', selector: '.hbar-app-ui-agent-approval-card', expected: {x: 16, y: 72, width: 288, height: 630}},
            ]},
        ],
        5: [
            {name: 'desktop', width: 1192, height: 561, expectations: [
                {name: 'cost card', selector: '.hbar-app-ui-agent-approval-card', expected: {x: 340, y: 56, width: 512, height: 448}},
            ]},
            {name: 'mobile', width: 320, height: 561, expectations: [
                {name: 'cost card', selector: '.hbar-app-ui-agent-approval-card', expected: {x: 16, y: -22, width: 288, height: 604}},
            ]},
        ],
        6: [
            {name: 'desktop', width: 1192, height: 641, expectations: [
                {name: 'history search', selector: '.hbar-app-ui-agent-approval-search', expected: {x: 24, y: 64, width: 320, height: 32}},
                {name: 'first history row', selector: '.hbar-app-ui-agent-approval-history-pane > ul > li', expected: {x: 24, y: 112, width: 1144, height: 57.5}},
            ]},
            {name: 'mobile', width: 320, height: 641, expectations: [
                {name: 'history search', selector: '.hbar-app-ui-agent-approval-search', expected: {x: 16, y: 56, width: 288, height: 32}},
                {name: 'first history row', selector: '.hbar-app-ui-agent-approval-history-pane > ul > li', expected: {x: 16, y: 144, width: 288, height: 57.5}},
            ]},
        ],
    }
    const geometryChecks: Record<string, number> = {}

    for (const [variantText, viewports] of Object.entries(layouts)) {
        const variant = Number(variantText)
        for (const viewport of viewports) {
            await page.setViewportSize({width: viewport.width, height: viewport.height})
            await page.goto(previewUrl(variant), {waitUntil: 'networkidle'})
            for (const expectation of viewport.expectations) {
                const actual = await measuredBox(page.locator(expectation.selector).first())
                const difference = boxDifference(actual, expectation.expected)
                const key = `agent-approval-${variant}-${viewport.name}-${expectation.name}`
                geometryChecks[key] = Number(difference.toFixed(3))
                assert(difference <= 2.5, `${key} drifted ${difference.toFixed(3)}px from captured reference geometry`)
            }
        }
    }

    return geometryChecks
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
        const geometryChecks = await verifyReferenceGeometry(page)
        await page.setViewportSize({width: 1192, height: 640})

        await page.goto(previewUrl(1), {waitUntil: 'networkidle'})
        const inlineToggle = page.getByRole('button', {name: 'Show request', exact: true})
        assert(await inlineToggle.getAttribute('aria-expanded') === 'true', 'Inline approval did not open the host request')
        await inlineToggle.click()
        assert(await inlineToggle.getAttribute('aria-expanded') === 'false', 'Inline approval request did not toggle')
        await page.getByRole('button', {name: 'Delete 12 projects', exact: true}).click()

        await page.goto(previewUrl(2), {waitUntil: 'networkidle'})
        const diffToggle = page.getByRole('button', {name: 'Show diff', exact: true})
        assert(await diffToggle.getAttribute('aria-expanded') === 'true', 'Diff approval did not open its change list')
        await diffToggle.click()
        assert(await diffToggle.getAttribute('aria-expanded') === 'false', 'Diff approval did not collapse its change list')
        await page.getByRole('button', {name: 'Approve', exact: true}).click()

        await page.goto(previewUrl(3), {waitUntil: 'networkidle'})
        const queueApprove = page.getByRole('button', {name: 'Approve', exact: true}).first()
        await queueApprove.click()
        assert(await queueApprove.isDisabled(), 'Queue approval did not settle the selected decision')

        await page.goto(previewUrl(4), {waitUntil: 'networkidle'})
        const scope = page.locator('label').filter({hasText: 'Read customer records'}).locator('input[type="checkbox"]')
        assert(await scope.isChecked(), 'Permission scope did not use host-provided checked state')
        await scope.uncheck()
        assert(!(await scope.isChecked()), 'Permission scope did not toggle')
        await page.getByRole('button', {name: 'Approve', exact: true}).click()

        await page.goto(previewUrl(5), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Approve', exact: true}).click()
        assert(await page.getByRole('button', {name: 'Approve', exact: true}).isDisabled(), 'Cost approval did not settle the decision')

        await page.goto(previewUrl(6), {waitUntil: 'networkidle'})
        await page.getByRole('tab', {name: 'Skipped', exact: true}).click()
        assert(await page.locator('.hbar-app-ui-agent-approval-history-pane > ul > li').count() === 3, 'Approval history filter did not narrow entries')
        const search = page.getByRole('textbox', {name: 'Search history', exact: true})
        await search.fill('production API token')
        assert(await page.getByText('Rotated the production API token', {exact: true}).count() === 1, 'Approval history search did not preserve host content')

        const overflowChecks: Record<string, {readonly scrollable: boolean; readonly moved: boolean}> = {}
        const overflowSelectors = [
            [2, '.hbar-app-ui-agent-approval-centered-body'],
            [3, '.hbar-app-ui-agent-approval-queue-pane'],
            [4, '.hbar-app-ui-agent-approval-centered-body'],
            [6, '.hbar-app-ui-agent-approval-history-pane'],
        ] as const
        for (const [variant, selector] of overflowSelectors) {
            await page.goto(previewUrl(variant, 'overflow'), {waitUntil: 'networkidle'})
            const result = await inspectScrollable(page.locator(selector))
            overflowChecks[`agent-approval-${variant}`] = result
            assert(result.scrollable && result.moved, `Agent approval ${variant} did not expose declared overflow behavior`)
        }

        await page.setViewportSize({width: 320, height: 640})
        const narrowOverflow: Record<string, boolean> = {}
        for (let variant = 1; variant <= 6; variant += 1) {
            await page.goto(previewUrl(variant, variant === 1 || variant === 6 ? 'localized' : undefined), {waitUntil: 'networkidle'})
            const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
            narrowOverflow[`agent-approval-${variant}`] = noHorizontalOverflow
            assert(noHorizontalOverflow, `Narrow agent-approval-${variant} layout overflowed horizontally`)
        }

        await page.goto(previewUrl(1, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByText('Zwölf archivierte Projekte und ihre Build-Historie dauerhaft löschen', {exact: true}).count() === 1, 'Localized inline approval copy was not rendered from the host bundle')
        await page.goto(previewUrl(6, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByText('Genehmigungsverlauf für diesen Arbeitsbereich', {exact: true}).count() === 1, 'Localized approval history copy was not rendered from the host bundle')

        assert(pageErrors.length === 0, `Agent approval preview reported page errors: ${pageErrors.join(' | ')}`)
        console.log(JSON.stringify({
            inlineToggle: true,
            diffDisclosure: true,
            queueDecision: true,
            permissionScope: true,
            costDecision: true,
            historyFilterSearch: true,
            overflowChecks,
            narrowOverflow,
            localizedHostCopy: true,
            geometryChecks,
            pageErrors: pageErrors.length,
        }))
    } finally {
        await browser.close()
        server?.kill()
    }
}

await run()
