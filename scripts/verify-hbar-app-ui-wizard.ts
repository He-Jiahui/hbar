import {chromium} from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
function url(fixture?: 'localized' | 'overflow') {
  const query = new URLSearchParams({mode: 'isolated', variant: 'hbar-app-ui-wizard-1', theme: 'light'})
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
  assert(errors.length === 0, `Wizard raised page errors: ${errors.join('; ')}`)
  console.log(JSON.stringify({fields: 8, options: 2, steps: 3, overflow: scroll, localizedNarrow: true, pageErrors: errors.length}))
} finally {
  await browser.close()
}
