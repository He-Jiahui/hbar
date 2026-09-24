import {chromium} from '@playwright/test'
import {settleInlineApprovalScroll, waitForLocalStyles} from './reactbits-pro-audit'

// Fault injection is confined to this local test fixture. Reference captures
// still use the real React Bits Pro iframe without mocked content or assets.
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const browser = await chromium.launch({headless: true, executablePath})
let releaseCss: () => void = () => undefined
try {
    const page = await browser.newPage()
    const heldCss = new Promise<void>((resolve) => {releaseCss = resolve})
    await page.route('http://audit.invalid/**', async (route) => {
        const path = new URL(route.request().url()).pathname
        if (path === '/delayed.css') {
            await heldCss
            await route.fulfill({contentType: 'text/css', body: 'body { color: rgb(0, 128, 0); }'})
        } else if (path === '/failed.css') {
            await route.abort('failed')
        } else {
            await route.fulfill({contentType: 'text/html', body: `<link rel="stylesheet" href="/${path === '/failed' ? 'failed' : 'delayed'}.css"><p>Local readiness fixture</p>`})
        }
    })
    const requested = page.waitForRequest('http://audit.invalid/delayed.css', {timeout: 5000})
    await page.goto('http://audit.invalid/slow', {waitUntil: 'commit', timeout: 5000})
    await requested
    let ready = false
    const completion = waitForLocalStyles(page, 4000).then(() => {ready = true})
    await page.waitForTimeout(100)
    if (ready) throw new Error('Readiness accepted a stylesheet before it loaded')
    releaseCss()
    await completion
    if (await page.locator('body').evaluate((element) => getComputedStyle(element).color) !== 'rgb(0, 128, 0)') {
        throw new Error('Stylesheet was not applied')
    }
    await page.goto('http://audit.invalid/failed', {waitUntil: 'load', timeout: 5000})
    let rejected = false
    try {await waitForLocalStyles(page, 500)} catch {rejected = true}
    if (!rejected) throw new Error('Readiness accepted a failed stylesheet')
    await page.setContent('<div id="scroll-fixture" style="height:5rem;overflow:auto"><div style="height:40rem">Native scroll fixture</div></div>')
    const scrollPane = page.locator('#scroll-fixture')
    await scrollPane.evaluate((element) => element.scrollTo({top: 480, behavior: 'smooth'}))
    await settleInlineApprovalScroll(scrollPane)
    if (await scrollPane.evaluate((element) => element.scrollTop) !== 480) {
        throw new Error('Readiness accepted an intermediate native scroll frame')
    }
    console.log(JSON.stringify({waitsForDelayedStylesheet: true, rejectsFailedStylesheet: true, waitsForNativeScroll: true}))
} finally {
    releaseCss()
    await browser.close()
}
