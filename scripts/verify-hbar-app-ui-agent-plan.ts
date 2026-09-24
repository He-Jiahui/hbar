import {chromium} from '@playwright/test'
import { verifyPlanChecklist } from './verify-hbar-app-ui-plan-checklist'
import { verifyPlanReview } from './verify-hbar-app-ui-plan-review'
import { verifyPlanTree } from './verify-hbar-app-ui-plan-tree'
import { verifyPlanActual } from './verify-hbar-app-ui-plan-actual'
import { verifyPlanBoard } from './verify-hbar-app-ui-plan-board'
import { verifyPlanSummary } from './verify-hbar-app-ui-plan-summary'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
type AgentPlanFixture = 'overflow' | 'localized'
type Box = Readonly<{x: number; y: number; width: number; height: number}>

function previewUrl(variant: number, fixture?: AgentPlanFixture): string {
    const params = new URLSearchParams({variant: `hbar-app-ui-agent-plan-${variant}`, mode: 'isolated'})
    if (fixture) params.set('agentPlanFixture', fixture)
    return `${baseUrl}/?${params.toString()}`
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
}

function difference(actual: Box, expected: Box): number {
    return Math.max(
        Math.abs(actual.x - expected.x),
        Math.abs(actual.y - expected.y),
        Math.abs(actual.width - expected.width),
        Math.abs(actual.height - expected.height),
    )
}

async function measured(locator: import('@playwright/test').Locator): Promise<Box> {
    return locator.evaluate((element) => {
        const box = element.getBoundingClientRect()
        return {x: box.x, y: box.y, width: box.width, height: box.height}
    })
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

async function verifyGeometry(page: import('@playwright/test').Page): Promise<Record<string, number>> {
    const layouts: Readonly<Record<number, readonly {name: 'desktop' | 'tablet' | 'mobile'; width: number; height: number; selector: string; expected: Box}[]>> = {
        1: [
            {name: 'desktop', width: 1192, height: 560, selector: '.hbar-app-ui-agent-plan-checklist-pane', expected: {x: 24, y: 68, width: 1144, height: 468}},
            {name: 'tablet', width: 768, height: 561, selector: '.hbar-app-ui-agent-plan-checklist-pane', expected: {x: 24, y: 68, width: 720, height: 468}},
            {name: 'mobile', width: 320, height: 560, selector: '.hbar-app-ui-agent-plan-checklist-pane', expected: {x: 16, y: 60, width: 288, height: 484}},
        ],
        2: [
            {name: 'desktop', width: 1192, height: 640, selector: '.lumen-plan-review-card', expected: {x: 24, y: 60, width: 1144, height: 460}},
            {name: 'tablet', width: 768, height: 641, selector: '.lumen-plan-review-card', expected: {x: 24, y: 60, width: 720, height: 461}},
            {name: 'mobile', width: 320, height: 640, selector: '.lumen-plan-review-card', expected: {x: 16, y: 52, width: 288, height: 476}},
        ],
        3: [
            {name: 'desktop', width: 1192, height: 640, selector: '.lumen-plan-tree-card', expected: {x: 24, y: 60, width: 1144, height: 556}},
            {name: 'tablet', width: 768, height: 641, selector: '.lumen-plan-tree-card', expected: {x: 24, y: 60, width: 720, height: 557}},
            {name: 'mobile', width: 320, height: 640, selector: '.lumen-plan-tree-card', expected: {x: 16, y: 52, width: 288, height: 572}},
        ],
        4: [
            {name: 'desktop', width: 1192, height: 480, selector: '.lumen-plan-actual-card', expected: {x: 24, y: 152, width: 1144, height: 304}},
            {name: 'tablet', width: 768, height: 481, selector: '.lumen-plan-actual-card', expected: {x: 24, y: 152, width: 720, height: 305}},
            {name: 'mobile', width: 320, height: 480, selector: '.lumen-plan-actual-card', expected: {x: 16, y: 144, width: 288, height: 320}},
        ],
        5: [
            {name: 'desktop', width: 1192, height: 560, selector: '.lumen-plan-board-column', expected: {x: 24, y: 60, width: 373.328, height: 476}},
            {name: 'tablet', width: 768, height: 561, selector: '.lumen-plan-board-column', expected: {x: 24, y: 60, width: 720, height: 480.5}},
            {name: 'mobile', width: 320, height: 560, selector: '.lumen-plan-board-column', expected: {x: 16, y: 52, width: 288, height: 480.5}},
        ],
        6: [
            {name: 'desktop', width: 1192, height: 640, selector: '.lumen-plan-summary-copy', expected: {x: 24, y: 87.5, width: 1144, height: 55.125}},
            {name: 'tablet', width: 768, height: 641, selector: '.lumen-plan-summary-copy', expected: {x: 24, y: 87.5, width: 720, height: 55.125}},
            {name: 'mobile', width: 320, height: 640, selector: '.lumen-plan-summary-copy', expected: {x: 16, y: 79.5, width: 288, height: 97.375}},
        ],
    }
    const checks: Record<string, number> = {}
    for (const [variantText, viewports] of Object.entries(layouts)) {
        const variant = Number(variantText)
        for (const viewport of viewports) {
            await page.setViewportSize({width: viewport.width, height: viewport.height})
            await page.goto(previewUrl(variant), {waitUntil: 'networkidle'})
            const actual = await measured(page.locator(viewport.selector).first())
            const delta = difference(actual, viewport.expected)
            const key = `agent-plan-${variant}-${viewport.name}`
            checks[key] = Number(delta.toFixed(3))
            assert(delta <= 2.5, `${key} drifted ${delta.toFixed(3)}px from captured reference geometry`)
        }
    }
    return checks
}

async function run(): Promise<void> {
    const server = await ensurePreview()
    const browser = await chromium.launch({headless: true, executablePath})
    const page = await browser.newPage({viewport: {width: 1192, height: 640}})
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    try {
        if (process.argv.includes('--summary-only')) {
            await verifyPlanSummary(page, baseUrl)
            assert(pageErrors.length === 0, `Plan summary page errors: ${pageErrors.join(' | ')}`)
            return
        }
        if (process.argv.includes('--board-only')) {
            await verifyPlanBoard(page, baseUrl)
            assert(pageErrors.length === 0, `Plan board page errors: ${pageErrors.join(' | ')}`)
            return
        }
        if (process.argv.includes('--actual-only')) {
            await verifyPlanActual(page, baseUrl)
            assert(pageErrors.length === 0, `Plan actual page errors: ${pageErrors.join(' | ')}`)
            return
        }
        if (process.argv.includes('--tree-only')) {
            await verifyPlanTree(page, baseUrl)
            assert(pageErrors.length === 0, `Plan tree page errors: ${pageErrors.join(' | ')}`)
            return
        }
        if (process.argv.includes('--review-only')) {
            await verifyPlanReview(page, baseUrl)
            assert(pageErrors.length === 0, `Plan review page errors: ${pageErrors.join(' | ')}`)
            return
        }
        if (process.argv.includes('--checklist-only')) {
            await verifyPlanChecklist(page, baseUrl)
            assert(pageErrors.length === 0, `Checklist page errors: ${pageErrors.join(' | ')}`)
            return
        }
        const geometryChecks = await verifyGeometry(page)

        await page.goto(previewUrl(1), {waitUntil: 'networkidle'})
        const stop = page.getByRole('button', {name: 'Stop', exact: true})
        await stop.click()
        assert(await page.getByRole('button', {name: 'Resume', exact: true}).count() === 1, 'Checklist stop action did not pause')

        await page.goto(previewUrl(2), {waitUntil: 'networkidle'})
        const addInput = page.getByRole('textbox', {name: 'Add a step', exact: true})
        await addInput.fill('Confirm the localized entitlement copy')
        await page.getByRole('button', {name: 'Add', exact: true}).click()
        assert(await page.getByText('Confirm the localized entitlement copy', {exact: true}).count() === 1, 'Editable plan did not add the host-entered step')
        const firstSkip = page.getByRole('button', {name: 'Skip Read the billing contract notes', exact: true})
        await firstSkip.click()
        assert(await page.getByRole('button', {name: 'Restore Read the billing contract notes', exact: true}).count() === 1, 'Editable plan did not expose restore after skipping')

        await page.goto(previewUrl(2, 'overflow'), {waitUntil: 'networkidle'})
        const editableOverflow = await inspectScroll(page.locator('.lumen-plan-review-scroll'))
        assert(editableOverflow.scrollable && editableOverflow.moved, 'Editable plan did not expose the declared pane scroll strategy')

        await page.goto(previewUrl(3), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Retry', exact: true}).click()

        await page.goto(previewUrl(5, 'overflow'), {waitUntil: 'networkidle'})
        const boardOverflow = await inspectScroll(page.locator('.lumen-plan-board-columns'))
        assert(boardOverflow.scrollable && boardOverflow.moved, 'Board did not expose the declared pane scroll strategy')

        await page.goto(previewUrl(6), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Edit plan', exact: true}).click()
        await page.getByRole('button', {name: 'Cancel', exact: true}).click()
        await page.getByRole('button', {name: 'Run plan', exact: true}).click()
        await page.getByRole('button', {name: 'Stop', exact: true}).click()

        await page.setViewportSize({width: 320, height: 640})
        const narrowOverflow: Record<string, boolean> = {}
        for (let variant = 1; variant <= 6; variant += 1) {
            await page.goto(previewUrl(variant, variant === 2 || variant === 6 ? 'localized' : undefined), {waitUntil: 'networkidle'})
            const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
            narrowOverflow[`agent-plan-${variant}`] = noHorizontalOverflow
            assert(noHorizontalOverflow, `Narrow agent-plan-${variant} layout overflowed horizontally`)
        }

        await page.goto(previewUrl(2, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByText('Plan vor dem Start prüfen', {exact: true}).count() === 1, 'Localized editable plan copy was not rendered from the host bundle')
        await page.goto(previewUrl(6, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByText('Shell-Befehle', {exact: true}).count() === 1, 'Localized summary copy was not rendered from the host bundle')

        assert(pageErrors.length === 0, `Agent plan preview reported page errors: ${pageErrors.join(' | ')}`)
        console.log(JSON.stringify({geometryChecks, boardOverflow, editableOverflow, narrowOverflow, localizedHostCopy: true, pageErrors: pageErrors.length}))
    } finally {
        await browser.close()
        server?.kill()
    }
}

await run()
