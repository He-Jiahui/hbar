import {chromium} from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
type AuthenticationFixture = 'overflow' | 'localized'

function previewUrl(variant: number, fixture?: AuthenticationFixture): string {
    const parameters = new URLSearchParams({variant: `hbar-app-ui-authentication-${variant}`, mode: 'isolated'})
    if (fixture) parameters.set('authenticationFixture', fixture)
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

async function inspectScroll(locator: import('@playwright/test').Locator): Promise<{readonly scrollable: boolean; readonly moved: boolean}> {
    return locator.evaluate((element) => {
        element.scrollTop = element.scrollHeight
        return {scrollable: element.scrollHeight > element.clientHeight, moved: element.scrollTop > 0}
    })
}

async function noHorizontalOverflow(page: import('@playwright/test').Page, variant: number, fixture?: AuthenticationFixture): Promise<boolean> {
    await page.setViewportSize({width: 320, height: 800})
    await page.goto(previewUrl(variant, fixture), {waitUntil: 'networkidle'})
    return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
}

async function run(): Promise<void> {
    const server = await ensurePreview()
    const browser = await chromium.launch({headless: true, executablePath})
    const page = await browser.newPage({viewport: {width: 1192, height: 800}})
    page.setDefaultTimeout(5_000)
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    try {
        await page.goto(previewUrl(1), {waitUntil: 'networkidle'})
        const remembered = page.getByRole('checkbox', {name: 'Keep me signed in for 30 days', exact: true})
        await remembered.click()
        assert(!(await remembered.isChecked()), 'Sign-in preference did not toggle')
        await page.getByRole('button', {name: 'Show password', exact: true}).click()
        assert(await page.locator('.hbar-app-ui-auth-sign-in-surface input[type="text"]').count() === 1, 'Password visibility did not switch')
        assert(await page.locator('.hbar-app-ui-auth-sign-in-surface input[type="email"]').count() === 1, 'Email field lost its native type')

        await page.goto(previewUrl(2), {waitUntil: 'networkidle'})
        assert(await page.getByRole('textbox', {name: 'Work email'}).count() === 1, 'Provider-first email must have one associated label')
        const providerContinue = page.getByRole('button', {name: 'Continue', exact: true})
        assert(await providerContinue.isDisabled(), 'Provider-first email starts disabled')
        await page.getByRole('button', {name: 'Use single sign-on', exact: true}).click()
        const domain = page.getByRole('textbox', {name: 'Company domain'})
        assert(await domain.count() === 1, 'Provider-first flow did not switch to the host-defined domain branch')
        assert(await page.getByText('.northwind.app', {exact: true}).count() === 1, 'Host domain suffix is missing')
        assert(await page.getByText('Your admin set this when the workspace was created.', {exact: true}).count() === 1, 'SSO helper is missing')
        await domain.fill('northwind')
        assert(!(await providerContinue.isDisabled()), 'Nonempty company domain should enable Continue')
        await page.getByRole('button', {name: 'Use email instead', exact: true}).click()
        const workEmail = page.getByRole('textbox', {name: 'Work email'})
        await workEmail.fill('not-an-email')
        assert(await providerContinue.isDisabled(), 'Invalid work email must not enable Continue')
        await workEmail.fill('dana@example.com')
        assert(!(await providerContinue.isDisabled()), 'Valid work email should enable Continue')

        await page.goto(previewUrl(3), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Next quote', exact: true}).click()
        assert(await page.getByText('Daniel Osei', {exact: true}).count() === 1, 'Quote carousel did not change its selected record')
        await page.getByRole('button', {name: 'Show quote from Rachel Lindqvist', exact: true}).click()
        assert(await page.getByText('Rachel Lindqvist', {exact: true}).count() === 1, 'Direct quote selection did not change the author and metrics')
        await page.getByRole('button', {name: 'Previous quote', exact: true}).click()
        assert(await page.getByText('Daniel Osei', {exact: true}).count() === 1, 'Reverse carousel navigation did not retain the selected record')
        await page.waitForTimeout(8200)
        assert(await page.getByText('Rachel Lindqvist', {exact: true}).count() === 1, 'Host-configured quote auto-advance did not rotate to the next story')

        await page.goto(previewUrl(4), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Continue', exact: true}).click()
        assert(await page.getByText('Matched account', {exact: true}).count() === 1, 'Two-step sign-in did not advance after a valid host email')

        await page.goto(previewUrl(6), {waitUntil: 'networkidle'})
        const codeBoxes = page.locator('.hbar-app-ui-verification-digits input')
        for (let index = 0; index < 6; index += 1) await codeBoxes.nth(index).fill(String(index + 1))
        const verify = page.getByRole('button', {name: 'Verify and continue', exact: true})
        assert(!(await verify.isDisabled()), 'Six code boxes did not enable verification')
        await codeBoxes.first().evaluate((element) => {
            const transfer = new DataTransfer()
            transfer.setData('text', '654321')
            element.dispatchEvent(new ClipboardEvent('paste', {bubbles: true, clipboardData: transfer}))
        })
        assert(await codeBoxes.evaluateAll((elements) => elements.map((element) => (element as HTMLInputElement).value).join('')) === '654321', 'Verification code paste did not distribute the bounded code')

        await page.goto(previewUrl(7), {waitUntil: 'networkidle'})
        const create = page.getByRole('button', {name: 'Create account', exact: true})
        assert(await create.isDisabled(), 'Sign-up should begin disabled')
        await page.getByLabel('Full name', {exact: true}).fill('Dana Whitfield')
        await page.getByLabel(/^Work email/).fill('dana@example.test')
        await page.locator('.hbar-app-ui-auth-sign-up-surface input[type="password"]').fill('StrongPassword1!')
        await page.getByRole('checkbox').click()
        assert(!(await create.isDisabled()), 'Sign-up did not enable after valid host-owned form data')

        await page.goto(previewUrl(8), {waitUntil: 'networkidle'})
        const enterpriseContinue = page.getByRole('button', {name: 'Continue with Okta', exact: true})
        await page.getByLabel(/^Work email/).fill('dana@other.example')
        assert(await enterpriseContinue.isDisabled(), 'Enterprise SSO must not enable for an unmatched host domain')
        await page.getByLabel(/^Work email/).fill('dana@northwind.com')
        assert(!(await enterpriseContinue.isDisabled()), 'Enterprise SSO did not enable for the matched host domain')

        await page.goto(previewUrl(9), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: /Dana's iPhone/}).click()
        assert(await page.getByRole('button', {name: "Continue with Dana's iPhone", exact: true}).count() === 1, 'Passkey selection did not update the action target')

        await page.goto(previewUrl(10), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: /Mina Park/}).click()
        assert(await page.getByText('Signing in as mina.park@northwind.com', {exact: true}).count() === 1, 'Account selection did not retain the clicked host record')

        await page.goto(previewUrl(11), {waitUntil: 'networkidle'})
        const search = page.getByLabel('Search workspaces', {exact: true})
        await search.fill('no matching workspace')
        assert(await page.getByText('No workspaces match this search.', {exact: true}).count() === 1, 'Workspace picker did not render its host-owned empty state')
        await search.fill('Northwind Design')
        await page.getByRole('button', {name: /Northwind Design/}).click()
        assert(await page.getByRole('button', {name: 'Open Northwind Design', exact: true}).count() === 1, 'Workspace picker did not update the selected action')

        await page.goto(previewUrl(12), {waitUntil: 'networkidle'})
        const accept = page.getByRole('button', {name: 'Accept invitation', exact: true})
        assert(await accept.isDisabled(), 'Invitation should begin disabled')
        await page.getByLabel('Full name', {exact: true}).fill('Dana Whitfield')
        await page.locator('.hbar-app-ui-auth-invitation-surface input[type="password"]').fill('StrongPassword1!')
        assert(!(await accept.isDisabled()), 'Invitation acceptance did not enable for valid form data')

        await page.goto(previewUrl(13), {waitUntil: 'networkidle'})
        await page.locator('.hbar-app-ui-auth-password-reset-surface input[type="password"]').fill('StrongPassword1!')
        await page.getByLabel(/^Confirm password/).fill('StrongPassword1!')
        assert(!(await page.getByRole('button', {name: 'Update password', exact: true}).isDisabled()), 'Password reset did not enable after matching valid input')

        await page.goto(previewUrl(14), {waitUntil: 'networkidle'})
        const approve = page.getByRole('button', {name: 'Yes, that was me', exact: true})
        await approve.click()
        assert(await approve.isDisabled(), 'Sign-in approval did not settle after a decision')
        assert(await page.getByRole('button', {name: 'No, secure my account', exact: true}).isDisabled(), 'Paired denial action remained enabled after approval')

        await page.setViewportSize({width: 1192, height: 800})
        await page.goto(previewUrl(11, 'overflow'), {waitUntil: 'networkidle'})
        const workspaceList = page.locator('.hbar-app-ui-auth-workspace-list[data-hbar-app-ui-list-strategy="pane-scroll"]')
        const overflowCheck = await inspectScroll(workspaceList)
        assert(overflowCheck.scrollable && overflowCheck.moved, 'Workspace list did not honor its pane-owned scroll strategy')
        await page.goto(previewUrl(14, 'overflow'), {waitUntil: 'networkidle'})
        const recentList = page.locator('.hbar-app-ui-auth-recent-list[data-hbar-app-ui-list-strategy="pane-scroll"]')
        const recentOverflowCheck = await inspectScroll(recentList)
        assert(recentOverflowCheck.scrollable && recentOverflowCheck.moved, 'Recent sign-in list did not honor its pane-owned scroll strategy')

        await page.goto(previewUrl(1, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByText('Sehr lange lokalisierte Beschreibung für den gemeinsamen Arbeitsbereich.', {exact: true}).count() === 1, 'Localized sign-in copy was not supplied by the host bundle')
        await page.goto(previewUrl(11, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByText('Arbeitsbereich auswählen', {exact: true}).count() === 1, 'Localized workspace title was not supplied by the host bundle')
        await page.setViewportSize({width: 320, height: 800})
        await page.goto(previewUrl(2, 'localized'), {waitUntil: 'networkidle'})
        await page.getByRole('button', {name: 'Use single sign-on', exact: true}).click()
        assert(await page.getByRole('textbox', {name: 'Lange Unternehmensdomäne'}).count() === 1, 'Localized SSO label was not supplied by the host bundle')
        assert(await page.getByText('.sehr-lange-arbeitsbereich-adresse.beispiel.test', {exact: true}).count() === 1, 'Localized SSO suffix was not retained')
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Localized provider-first SSO branch overflowed horizontally')

        const narrowOverflow: Record<string, boolean> = {}
        for (let variant = 1; variant <= 14; variant += 1) {
            narrowOverflow[`authentication-${variant}`] = await noHorizontalOverflow(page, variant, variant === 11 ? 'overflow' : undefined)
            assert(narrowOverflow[`authentication-${variant}`], `Narrow authentication-${variant} layout overflowed horizontally`)
        }

        assert(pageErrors.length === 0, `Authentication preview reported page errors: ${pageErrors.join(' | ')}`)
        console.log(JSON.stringify({overflowCheck, recentOverflowCheck, narrowOverflow, localizedHostCopy: true, pageErrors: pageErrors.length}))
    } finally {
        await browser.close()
        server?.kill()
    }
}

await run()
