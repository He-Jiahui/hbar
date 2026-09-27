import {chromium} from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
function url(fixture?: 'localized' | 'overflow', variant = 1) {
  const query = new URLSearchParams({mode: 'isolated', variant: `hbar-app-ui-wizard-${variant}`, theme: 'light'})
  if (fixture) query.set('wizardFixture', fixture)
  return `${baseUrl}/?${query.toString()}`
}

const browser = await chromium.launch({headless: true, executablePath})
try {
  const page = await browser.newPage({viewport: {width: 1086, height: 640}})
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(url(), {waitUntil: 'networkidle'})
  const form = page.locator('.hbar-app-ui-wizard-information-form')
  assert(await form.count() === 1, 'Information wizard form missing')
  assert(await form.getByRole('textbox').count() === 6, 'Wizard text/email/phone fields do not match source')
  assert(await form.getByRole('combobox').count() === 2, 'Wizard native choices missing')
  assert(await form.getByRole('button', {name: 'Back'}).isDisabled(), 'Initial Back must be disabled')
  await form.getByRole('textbox', {name: 'Public handle'}).fill('new-handle')
  await form.getByRole('combobox', {name: 'Role'}).selectOption('Finance')
  await form.getByRole('button', {name: 'Next step'}).click()
  assert(await form.locator('.hbar-app-ui-wizard-information-step-number.is-complete').count() === 1, 'Next did not complete first step')
  assert(await form.getByRole('heading', {name: 'Your information'}).count() === 1, 'Step progress incorrectly replaced the form')
  assert(await form.getByRole('textbox', {name: 'Public handle'}).inputValue() === 'new-handle', 'Step change discarded Host field value')
  assert(await form.getByRole('combobox', {name: 'Role'}).inputValue() === 'Finance', 'Step change discarded native select')
  await form.getByRole('button', {name: 'Back'}).click()
  assert(await form.getByRole('button', {name: 'Back'}).isDisabled(), 'Back did not return to first step')
  await form.getByRole('textbox', {name: 'First name'}).fill('')
  await form.getByRole('button', {name: 'Next step'}).click()
  assert(await form.locator('.hbar-app-ui-wizard-information-step-number.is-complete').count() === 1, 'Starred empty field incorrectly prevented source progress')
  await form.locator('ol button').last().click()
  assert(await form.locator('.hbar-app-ui-wizard-information-step-number.is-complete').count() === 2, 'Completed jump did not mark prior steps')
  await form.getByRole('button', {name: 'Next step'}).click()
  assert(await form.locator('.hbar-app-ui-wizard-information-step-number.is-complete').count() === 2, 'Next at final step advanced past boundary')

  await page.setViewportSize({width: 356, height: 640})
  await page.goto(url('localized'), {waitUntil: 'networkidle'})
  assert(await form.getByRole('heading', {name: '你的信息'}).count() === 1, 'Localized title not supplied by Host')
  assert(await form.getByRole('textbox', {name: '名字'}).inputValue() === '陈玛拉', 'Localized field not supplied by Host')
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Narrow wizard overflowed document horizontally')

  await page.setViewportSize({width: 320, height: 640})
  await page.goto(url('overflow'), {waitUntil: 'networkidle'})
  assert(await form.getByRole('textbox').count() === 46, 'Over-bound Host fields were truncated')
  const scroll = await page.locator('.hbar-app-ui-wizard-information-reference').evaluate((element) => {
    const scrollable = element.scrollHeight > element.clientHeight
    element.scrollTop = element.scrollHeight
    return {scrollable, moved: element.scrollTop > 0}
  })
  assert(scroll.scrollable && scroll.moved, 'Over-bound wizard cannot reach final fields and footer')
  assert(await form.getByRole('button', {name: 'Next step'}).count() === 1, 'Over-bound wizard lost footer action')
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Over-bound wizard escaped horizontal viewport')

  await page.setViewportSize({width: 1086, height: 720})
  await page.goto(url(undefined, 2), {waitUntil: 'networkidle'})
  const invoice = page.locator('.hbar-app-ui-wizard-invoice-reference')
  const invoiceScroll = page.locator('.hbar-app-ui-wizard-invoice-scroll')
  assert(await invoice.getByRole('textbox').count() === 7, 'Invoice text fields missing')
  assert(await invoice.getByRole('combobox').count() === 3, 'Invoice select fields missing')
  assert(await invoice.getByRole('progressbar', {name: 'Invoice progress'}).getAttribute('aria-valuenow') === '1', 'Invoice progress missing')
  await invoice.getByRole('button', {name: 'Clear customer'}).click()
  assert(await invoice.getByRole('textbox', {name: 'Customer'}).inputValue() === 'Orchid Ledger Group', 'Clear customer invented a reset')
  await invoice.getByRole('button', {name: 'Next step'}).click()
  await invoice.getByRole('button', {name: 'Save draft'}).click()
  await invoice.getByRole('button', {name: 'Close'}).click()
  assert(await invoice.getByRole('heading', {name: 'Customer details'}).count() === 1, 'Passive invoice action replaced page')
  await invoice.getByRole('combobox', {name: 'Currency'}).selectOption('EUR')
  assert(await invoice.getByRole('combobox', {name: 'Currency'}).inputValue() === 'EUR', 'Currency select did not update Host')
  assert(await invoice.locator('.hbar-app-ui-wizard-invoice-card-header').getByText('USD').count() === 1, 'Passive currency badge was incorrectly changed')
  const invoiceOverflow = await invoiceScroll.evaluate((element) => {
    const scrollable = element.scrollHeight > element.clientHeight
    element.scrollTop = element.scrollHeight
    return {scrollable, moved: element.scrollTop > 0}
  })
  assert(invoiceOverflow.scrollable && invoiceOverflow.moved, 'Invoice content did not scroll independently')
  assert(await invoice.getByRole('textbox', {name: 'Billing address'}).isVisible(), 'Invoice scroll did not reveal billing address')
  assert(await invoice.getByRole('button', {name: 'Next step'}).isVisible(), 'Invoice footer did not remain visible')
  await page.setViewportSize({width: 356, height: 720})
  await page.goto(url('localized', 2), {waitUntil: 'networkidle'})
  assert(await invoice.getByRole('heading', {name: '发送发票'}).count() === 1, 'Localized invoice title missing')
  assert(await invoice.getByRole('textbox', {name: '客户'}).inputValue() === '华港公司', 'Localized invoice customer missing')
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Narrow invoice overflowed horizontally')
  await page.setViewportSize({width: 320, height: 720})
  await page.goto(url('overflow', 2), {waitUntil: 'networkidle'})
  assert(await invoice.getByRole('textbox').count() === 47, 'Over-bound invoice fields were truncated')
  assert(await invoiceScroll.evaluate((element) => element.scrollHeight > element.clientHeight), 'Over-bound invoice lost scroll owner')
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Over-bound invoice overflowed horizontally')

  await page.setViewportSize({width: 1086, height: 720})
  await page.goto(url(undefined, 3), {waitUntil: 'networkidle'})
  const upgrade = page.locator('.hbar-app-ui-wizard-upgrade-reference')
  assert(await upgrade.getByRole('radio').count() === 3, 'Upgrade did not render three Host plans')
  assert(await upgrade.getByRole('radio', {name: /Business Recommended/}).getAttribute('aria-checked') === 'true', 'Default Business choice missing')
  await upgrade.getByRole('radio', {name: /^Team /}).click()
  assert(await upgrade.getByRole('radio', {name: /^Team /}).getAttribute('aria-checked') === 'true', 'Team selection did not update Host')
  assert(await upgrade.getByText('$31,235').count() === 1, 'Plan choice incorrectly recalculated passive invoice')
  assert(await upgrade.getByText('Business · 42 seats · billed once').count() === 1, 'Plan choice rewrote passive summary')
  await upgrade.getByRole('button', {name: 'Next'}).click()
  assert(await upgrade.locator('.hbar-app-ui-wizard-upgrade-step-number.is-complete').count() === 1, 'Next did not advance progress')
  assert(await upgrade.getByRole('radiogroup', {name: 'Plan'}).count() === 1, 'Step progress invented a new page')
  await upgrade.locator('ol button').last().click()
  assert(await upgrade.locator('.hbar-app-ui-wizard-upgrade-step-number.is-complete').count() === 3, 'Review jump did not mark preceding steps')
  await upgrade.locator('ol button').first().click()
  assert(await upgrade.locator('.hbar-app-ui-wizard-upgrade-step-number.is-complete').count() === 0, 'Plan jump did not restore first step')
  await upgrade.getByRole('radio', {name: /Business Recommended/}).focus()
  await upgrade.getByRole('radio', {name: /Business Recommended/}).press('Space')
  assert(await upgrade.getByRole('radio', {name: /Business Recommended/}).getAttribute('aria-checked') === 'true', 'Keyboard radio did not update Host')
  await page.setViewportSize({width: 670, height: 720})
  await page.goto(url(undefined, 3), {waitUntil: 'networkidle'})
  const tabletFlow = await upgrade.evaluate((element) => {
    const body = element.querySelector('.hbar-app-ui-wizard-upgrade-body')
    const label = element.querySelector('.hbar-app-ui-wizard-upgrade-step-label')
    return {direction: body ? getComputedStyle(body).flexDirection : '', labelVisible: label ? getComputedStyle(label).display !== 'none' : false}
  })
  assert(tabletFlow.direction === 'column' && tabletFlow.labelVisible, 'Tablet stack and labeled steps do not follow distinct source breakpoints')
  await page.setViewportSize({width: 356, height: 720})
  await page.goto(url('localized', 3), {waitUntil: 'networkidle'})
  assert(await upgrade.getByRole('heading', {name: '账单升级'}).count() === 1, 'Localized upgrade title missing')
  assert(await upgrade.getByRole('radio', {name: /团队版/}).count() === 1, 'Localized plan missing')
  assert(await upgrade.locator('.hbar-app-ui-wizard-upgrade-step-label').first().isHidden(), 'Narrow step labels did not collapse')
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Narrow upgrade overflowed horizontally')
  await page.setViewportSize({width: 320, height: 720})
  await page.goto(url('overflow', 3), {waitUntil: 'networkidle'})
  assert(await upgrade.getByRole('radio').count() === 33, 'Over-bound plans were truncated')
  const upgradeOverflow = await upgrade.evaluate((element) => {
    const scrollable = element.scrollHeight > element.clientHeight
    element.scrollTop = element.scrollHeight
    return {scrollable, moved: element.scrollTop > 0}
  })
  assert(upgradeOverflow.scrollable && upgradeOverflow.moved, 'Over-bound upgrade did not scroll in its pane')
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Over-bound upgrade overflowed horizontally')
  assert(errors.length === 0, `Wizard raised page errors: ${errors.join('; ')}`)
  console.log(JSON.stringify({informationFields: 8, invoiceFields: 10, invoiceOptions: 3, upgradePlans: 3, informationOverflow: scroll, invoiceOverflow, upgradeOverflow, localizedNarrow: true, pageErrors: errors.length}))
} finally {
  await browser.close()
}
