import {chromium} from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
type FileManagerFixture = 'overflow' | 'localized'

function previewUrl(variant: number, fixture?: FileManagerFixture): string {
    const parameters = new URLSearchParams({variant: `hbar-app-ui-file-manager-${variant}`, mode: 'isolated'})
    if (fixture) parameters.set('fileManagerFixture', fixture)
    return `${baseUrl}/?${parameters.toString()}`
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
}

async function inspectScroll(locator: import('@playwright/test').Locator): Promise<{readonly scrollable: boolean; readonly moved: boolean}> {
    return locator.evaluate((element) => {
        element.scrollTop = element.scrollHeight
        return {scrollable: element.scrollHeight > element.clientHeight, moved: element.scrollTop > 0}
    })
}

async function waitForPreview(): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        try {
            const response = await fetch(baseUrl)
            if (response.ok) return
        } catch {
            // Vite can need a short interval before the port is ready.
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

async function noHorizontalOverflow(page: import('@playwright/test').Page, variant: number, fixture?: FileManagerFixture): Promise<boolean> {
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
        const openDriveItem = page.locator('.hbar-app-ui-file-manager-drive-table .hbar-app-ui-file-manager-drive-row-open').first()
        await openDriveItem.click()
        assert(await openDriveItem.locator('xpath=ancestor::tr').evaluate((element) => element.classList.contains('is-selected')), 'Drive open action did not remain local to the selected item')
        const driveSelection = page.getByRole('checkbox', {name: 'Select Brand Library', exact: true})
        await driveSelection.check()
        assert(await driveSelection.isChecked(), 'Drive item checkbox did not preserve its local selection state')
        const listView = page.getByRole('button', {name: 'List view', exact: true})
        const gridView = page.getByRole('button', {name: 'Grid view', exact: true})
        assert(await listView.count() === 1 && await gridView.count() === 1, 'Drive view controls lost their accessible host labels')
        const collapseFolder = page.getByRole('button', {name: 'Collapse Client Deliverables', exact: true})
        await collapseFolder.click()
        assert(await page.getByRole('button', {name: 'Open Northwind Rebrand', exact: true}).count() === 0, 'Collapsed drive folder did not hide its child folder')
        await page.getByRole('button', {name: 'Expand Client Deliverables', exact: true}).click()
        assert(await page.getByRole('button', {name: 'Open Northwind Rebrand', exact: true}).count() === 1, 'Expanded drive folder did not restore its child folder')

        await page.goto(previewUrl(2), {waitUntil: 'networkidle'})
        const asset = page.getByRole('button', {name: 'Select hero-still-a.png', exact: true})
        await asset.click()
        assert(await asset.evaluate((element) => element.classList.contains('is-selected')), 'Asset selection did not toggle the selected class')

        await page.goto(previewUrl(3), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Open Brand guidelines.pdf', exact: true}).click()
        assert(await page.getByText('Brand guidelines.pdf', {exact: true}).count() >= 2, 'File-detail selection did not update the preview region')
        assert(await page.getByRole('button', {name: 'Copy link', exact: true}).count() === 1, 'File-detail copy action was not present')
        assert(await page.getByRole('button', {name: 'Make a copy', exact: true}).count() === 1, 'File-detail copy workflow action was not present')

        await page.goto(previewUrl(4), {waitUntil: 'networkidle'})
        const pause = page.getByRole('button', {name: 'Pause sizzle-30s.mp4', exact: true})
        await pause.click()
        assert(await page.getByRole('button', {name: 'Start sizzle-30s.mp4', exact: true}).count() === 1, 'Upload queue did not switch a paused transfer to the start action')
        assert(await page.getByRole('button', {name: 'Retry billboard-2400.png', exact: true}).count() === 1, 'Upload queue did not expose a failed-transfer retry action')
        await page.getByRole('button', {name: 'Remove hero-still-a.png', exact: true}).click()
        assert(await page.getByText('hero-still-a.png', {exact: true}).count() === 0, 'Upload queue did not remove the targeted item')

        const overflowChecks: Record<string, {readonly scrollable: boolean; readonly moved: boolean}> = {}
        const overflowSelectors: Readonly<Record<number, string>> = {
            1: '.hbar-app-ui-file-manager-table-wrap',
            2: '.hbar-app-ui-file-manager-asset-grid',
            3: '.hbar-app-ui-file-manager-detail-list',
            4: '.hbar-app-ui-file-manager-upload-queue',
        }
        for (const [variantText, selector] of Object.entries(overflowSelectors)) {
            const variant = Number(variantText)
            await page.goto(previewUrl(variant, 'overflow'), {waitUntil: 'networkidle'})
            const inspection = await inspectScroll(page.locator(selector))
            overflowChecks[`file-manager-${variant}`] = inspection
            assert(inspection.scrollable && inspection.moved, `file-manager-${variant} did not expose its declared pane-owned scroll strategy`)
        }

        await page.goto(previewUrl(1, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByText('Halcyon-Dateiablage', {exact: true}).count() === 1, 'Localized drive title was not supplied by the host bundle')
        await page.goto(previewUrl(4, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByText('In Frühlingskampagne hochladen', {exact: true}).count() === 1, 'Localized upload title was not supplied by the host bundle')

        await page.setViewportSize({width: 320, height: 800})
        const narrowOverflow: Record<string, boolean> = {}
        for (let variant = 1; variant <= 4; variant += 1) {
            narrowOverflow[`file-manager-${variant}`] = await noHorizontalOverflow(page, variant, variant === 2 || variant === 4 ? 'localized' : undefined)
            assert(narrowOverflow[`file-manager-${variant}`], `Narrow file-manager-${variant} layout overflowed horizontally`)
        }

        assert(pageErrors.length === 0, `File manager preview reported page errors: ${pageErrors.join(' | ')}`)
        console.log(JSON.stringify({overflowChecks, narrowOverflow, localizedHostCopy: true, pageErrors: pageErrors.length}))
    } finally {
        await browser.close()
        server?.kill()
    }
}

await run()
