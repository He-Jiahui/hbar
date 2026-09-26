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
        const twoStepEmail = page.getByRole('textbox', {name: 'Work email'})
        await twoStepEmail.fill('invalid')
        await page.getByRole('button', {name: 'Continue', exact: true}).click()
        assert(await page.getByRole('alert').getByText('Enter a valid email address.').count() === 1, 'Two-step email did not expose its invalid-input feedback')
        await twoStepEmail.fill('dana.whitfield@northwind.com')
        await page.getByRole('button', {name: 'Continue', exact: true}).click()
        assert(await page.getByRole('button', {name: 'Continue', exact: true}).isDisabled(), 'Two-step Continue did not enter its pending state')
        await page.getByText('Dana Whitfield', {exact: true}).waitFor()
        assert(await page.getByText('Northwind Operations', {exact: true}).count() === 1, 'Two-step matched account did not use host-owned account data')
        await page.getByRole('button', {name: 'Show password', exact: true}).click()
        assert(await page.locator('.hbar-app-ui-auth-two-step-surface input[type="text"]').count() === 1, 'Two-step password reveal did not change the native input type')
        await page.getByRole('button', {name: 'Sign in', exact: true}).click()
        assert(await page.getByRole('button', {name: 'Signing in', exact: true}).isDisabled(), 'Two-step sign-in did not enter its pending state')
        await page.getByRole('button', {name: 'Back', exact: true}).click()
        assert(await page.getByRole('textbox', {name: 'Work email'}).inputValue() === 'dana.whitfield@northwind.com', 'Two-step Back did not retain the email')

        await page.goto(previewUrl(5), {waitUntil: 'networkidle'})
        assert(await page.getByRole('button', {name: 'Resend link in 0:45', exact: true}).isDisabled(), 'Magic-link resend should start disabled')
        await page.getByRole('button', {name: 'Use a different email', exact: true}).click()
        const magicLinkEmail = page.getByRole('textbox', {name: 'Work email'})
        assert(await magicLinkEmail.inputValue() === 'dana.whitfield@northwind.com', 'Magic-link form did not retain the host email')
        await magicLinkEmail.fill('invalid')
        await page.getByRole('button', {name: 'Send sign-in link', exact: true}).click()
        assert(await page.locator('.hbar-app-ui-auth-magic-link-form-help').getByText('Enter a valid email address.').count() === 1, 'Magic-link form did not expose invalid-email feedback')
        await magicLinkEmail.fill('new@example.test')
        await page.getByRole('button', {name: 'Send sign-in link', exact: true}).click()
        assert(await page.getByRole('heading', {name: 'Check your inbox'}).count() === 1, 'Magic-link form did not return to confirmation')
        assert(await page.locator('.hbar-app-ui-auth-magic-link-summary-value').first().innerText() === 'new@example.test', 'Magic-link summary did not use the submitted email')

        const countdownPage = await browser.newPage()
        countdownPage.on('pageerror', (error) => pageErrors.push(error.message))
        try {
            await countdownPage.clock.install()
            await countdownPage.goto(previewUrl(5), {waitUntil: 'domcontentloaded'})
            await countdownPage.getByRole('button', {name: 'Resend link in 0:45', exact: true}).waitFor()
            await countdownPage.clock.runFor(47_000)
            const resendReady = countdownPage.getByRole('button', {name: 'Resend link', exact: true})
            assert(!(await resendReady.isDisabled()), 'Magic-link countdown did not re-enable resend')
            await resendReady.click()
            assert(await countdownPage.getByRole('button', {name: 'Resend link in 0:45', exact: true}).isDisabled(), 'Magic-link resend did not reset the countdown')
        } finally {
            await countdownPage.close()
        }

        await page.goto(previewUrl(6), {waitUntil: 'networkidle'})
        const codeBoxes = page.locator('.hbar-app-ui-auth-code-digits input')
        assert(await page.getByRole('group', {name: 'Six-digit verification code'}).count() === 1, 'Six-digit entry lost its associated group label')
        await codeBoxes.first().evaluate((element) => {
            const transfer = new DataTransfer()
            transfer.setData('text', '654321')
            element.dispatchEvent(new ClipboardEvent('paste', {bubbles: true, clipboardData: transfer}))
        })
        assert(await codeBoxes.evaluateAll((elements) => elements.map((element) => (element as HTMLInputElement).value).join('')) === '654321', 'Verification code paste did not distribute the bounded code')
        assert(await page.getByRole('button', {name: 'Verifying', exact: true}).isDisabled(), 'Complete six-digit entry did not begin automatic verification')
        await page.getByRole('heading', {name: 'Device verified'}).waitFor()
        assert(await page.getByText('9 September 2026', {exact: true}).count() === 1, 'Verified device did not render host-owned trust data')
        await page.getByRole('button', {name: 'Verify another device', exact: true}).click()
        await page.getByRole('button', {name: 'Use a recovery code', exact: true}).click()
        const recoveryCode = page.getByRole('textbox', {name: 'Recovery code'})
        await recoveryCode.fill('invalid')
        assert(await page.getByRole('button', {name: 'Verify and continue', exact: true}).isDisabled(), 'Invalid recovery code should not enable verification')
        await recoveryCode.fill('audit sample')
        assert(await recoveryCode.inputValue() === 'AUDIT SAMPL', 'Recovery input should uppercase and cap source-length input without rewriting spaces')
        assert(!(await page.getByRole('button', {name: 'Verify and continue', exact: true}).isDisabled()), 'Source-length recovery code did not enable verification')
        await recoveryCode.fill('ABCDE-12345')
        assert(!(await page.getByRole('button', {name: 'Verify and continue', exact: true}).isDisabled()), 'Valid recovery code did not enable verification')
        await page.getByRole('button', {name: 'Verify and continue', exact: true}).click()
        await page.getByRole('heading', {name: 'Device verified'}).waitFor()

        const codeCountdownPage = await browser.newPage()
        codeCountdownPage.on('pageerror', (error) => pageErrors.push(error.message))
        try {
            await codeCountdownPage.clock.install()
            await codeCountdownPage.goto(previewUrl(6), {waitUntil: 'domcontentloaded'})
            await codeCountdownPage.getByRole('button', {name: 'Resend in 0:28', exact: true}).waitFor()
            await codeCountdownPage.clock.runFor(30_000)
            const readyCode = codeCountdownPage.getByRole('button', {name: 'Resend code', exact: true})
            assert(!(await readyCode.isDisabled()), 'Code countdown did not enable resend after expiry')
            await readyCode.click()
            assert(await codeCountdownPage.getByRole('button', {name: 'Resend in 0:28', exact: true}).isDisabled(), 'Code resend did not restart its countdown')

            const cancellationCode = codeCountdownPage.getByRole('textbox', {name: 'Digit 1'})
            await cancellationCode.fill('1')
            for (let digit = 2; digit <= 6; digit += 1) await codeCountdownPage.getByRole('textbox', {name: `Digit ${digit}`}).fill(String(digit))
            await codeCountdownPage.getByRole('button', {name: 'Verifying', exact: true}).waitFor()
            await codeCountdownPage.getByRole('button', {name: 'Use a recovery code', exact: true}).click()
            await codeCountdownPage.clock.runFor(1200)
            assert(await codeCountdownPage.getByRole('heading', {name: 'Enter a recovery code'}).count() === 1, 'Switching mode did not cancel stale verification completion')
        } finally {
            await codeCountdownPage.close()
        }

        await page.goto(previewUrl(7), {waitUntil: 'networkidle'})
        const create = page.getByRole('button', {name: 'Create account', exact: true})
        assert(await create.isDisabled(), 'Sign-up should begin disabled')
        const signUpForm = page.locator('.hbar-app-ui-auth-sign-up-form')
        assert(await signUpForm.count() === 1, 'Sign-up fields and agreement should share one native form')
        const signUpPassword = page.getByRole('textbox', {name: 'Password'})
        await signUpPassword.fill('abcdefghij')
        assert(await signUpForm.getByText('Weak', {exact: true}).count() === 1, 'One password criterion did not expose the host-owned weak label')
        await signUpPassword.fill('Abcdefghij')
        assert(await signUpForm.getByText('Fair', {exact: true}).count() === 1, 'Two password criteria did not expose fair strength')
        await signUpPassword.fill('Abcdefghij1')
        assert(await signUpForm.getByText('Good', {exact: true}).count() === 1, 'Three password criteria did not expose good strength')
        await signUpPassword.fill('Abcdefghij1!')
        assert(await signUpForm.getByText('Strong', {exact: true}).count() === 1, 'Four password criteria did not expose strong strength')
        assert(await signUpForm.locator('li.is-valid').count() === 4, 'Password requirements did not reflect all four host-owned checks')
        await page.getByRole('button', {name: 'Show password'}).click()
        assert(await page.locator('.hbar-app-ui-auth-sign-up-password-wrap input[type="text"]').count() === 1, 'Sign-up reveal did not change the native password input type')
        await page.getByRole('button', {name: 'Hide password'}).click()
        await page.getByLabel('Full name', {exact: true}).fill('Dana Whitfield')
        await page.getByLabel('Work email', {exact: true}).fill('dana@incomplete')
        await page.getByRole('checkbox').click()
        assert(await create.isDisabled(), 'Sign-up accepted an incomplete email domain')
        await page.getByLabel('Work email', {exact: true}).fill('dana@example.test')
        assert(!(await create.isDisabled()), 'Sign-up did not enable after valid host-owned form data')
        await create.click()
        assert(!(await create.isDisabled()), 'Reference demonstration submit should not invent a success page')

        await page.goto(previewUrl(8), {waitUntil: 'networkidle'})
        const enterpriseContinue = page.getByRole('button', {name: 'Continue with Okta', exact: true})
        await page.getByLabel('Work email', {exact: true}).fill('dana@other.example')
        assert(await page.getByRole('button', {name: 'Continue', exact: true}).isEnabled(), 'Unknown valid domain should retain the generic source Continue action')
        assert(await page.getByText('northwind.com signs in through Okta.', {exact: true}).count() === 0, 'Unmatched domain retained the organization hint')
        assert(await page.getByText('We look up your domain', {exact: true}).count() === 1, 'Unmatched domain did not replace the organization summary')
        await page.getByLabel('Work email', {exact: true}).fill('invalid')
        assert(await page.getByRole('button', {name: 'Continue', exact: true}).isDisabled(), 'Invalid email enabled generic Continue')
        await page.getByLabel('Work email', {exact: true}).fill('dana@northwind.com')
        assert(!(await enterpriseContinue.isDisabled()), 'Enterprise SSO did not enable for the matched host domain')
        await enterpriseContinue.click()
        assert(await page.getByRole('button', {name: 'Redirecting', exact: true}).isDisabled(), 'Enterprise SSO did not enter pending redirect feedback')
        await page.getByRole('button', {name: 'Continue with Okta', exact: true}).waitFor({timeout: 5000})
        assert(await page.getByRole('complementary').count() === 1, 'Desktop matched organization summary lost its semantic region')
        await page.getByLabel('Work email', {exact: true}).fill('team@ardentfreight.co')
        assert(await page.getByRole('button', {name: 'Continue with Microsoft Entra ID', exact: true}).isEnabled(), 'Second host-owned matched organization did not update provider action')
        assert(await page.getByText('Ardent Freight', {exact: true}).count() === 1, 'Second matched organization did not update the summary')
        assert(await page.getByText('Sign-in restricted to managed devices', {exact: true}).count() === 1, 'Second organization policy remained stale')

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
        await page.goto(previewUrl(4, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByText('Beim Northwind-Arbeitsbereich anmelden', {exact: true}).count() === 1, 'Localized two-step title was not supplied by the host bundle')
        await page.getByRole('button', {name: 'Continue', exact: true}).click()
        await page.getByText('Dana Whitfield mit einem besonders langen Anzeigenamen', {exact: true}).waitFor()
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Localized two-step matched account overflowed horizontally')
        await page.goto(previewUrl(5, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByRole('heading', {name: 'Prüfen Sie Ihren Posteingang'}).count() === 1, 'Localized magic-link title was not supplied by the host bundle')
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Long host email overflowed the narrow magic-link summary')
        await page.getByRole('button', {name: 'Use a different email', exact: true}).click()
        assert(await page.getByRole('heading', {name: 'Mit einem Link anmelden'}).count() === 1, 'Localized magic-link form title was not supplied by the host bundle')
        await page.goto(previewUrl(6, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByRole('heading', {name: 'Bestätigen Sie Ihre Identität'}).count() === 1, 'Localized verification title was not supplied by the host bundle')
        await page.getByRole('button', {name: 'Use a recovery code', exact: true}).click()
        assert(await page.getByRole('heading', {name: 'Einen Wiederherstellungscode eingeben'}).count() === 1, 'Localized recovery title was not supplied by the host bundle')
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Localized narrow recovery flow overflowed horizontally')
        await page.goto(previewUrl(7, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByRole('heading', {name: 'Konto erstellen'}).count() === 1, 'Localized sign-up title was not supplied by the host bundle')
        await page.getByRole('textbox', {name: 'Password'}).fill('Abcdefghij1!')
        assert(await page.getByText('Stark', {exact: true}).count() === 1, 'Localized strength label was not supplied by the host bundle')
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Localized narrow sign-up flow overflowed horizontally')
        await page.goto(previewUrl(8, 'localized'), {waitUntil: 'networkidle'})
        assert(await page.getByRole('heading', {name: 'Mit Ihrem Unternehmenskonto anmelden'}).count() === 1, 'Localized enterprise title was not supplied by the host bundle')
        assert(await page.getByRole('complementary').count() === 0, 'Narrow enterprise view retained the desktop-only aside')
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Localized narrow enterprise form overflowed horizontally')
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
