import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = 'artifacts/paywall6-local-review'

function url(theme: 'light' | 'dark', fixture?: 'localized' | 'long', capacity?: 'overflow'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-paywall-6', mode: 'isolated', theme })
  if (fixture) parameters.set('paywall6Fixture', fixture)
  if (capacity) parameters.set('paywall6Capacity', capacity)
  return `${baseUrl}/?${parameters}`
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function waitForPreview(): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      if ((await fetch(baseUrl)).ok) return
    } catch {
      // The local preview may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Preview is not reachable at ${baseUrl}`)
}

async function run(): Promise<void> {
  let server: ReturnType<typeof Bun.spawn> | undefined
  try {
    await waitForPreview()
  } catch {
    server = Bun.spawn(['bun', 'run', 'app-ui:preview', '--', '--host', '127.0.0.1', '--port', '5185'], {
      stdout: 'ignore',
      stderr: 'ignore',
    })
    await waitForPreview()
  }
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1086, height: 400 } })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  try {
    const panel = page.locator('[data-hbar-app-ui-component="hbar-app-ui-paywall-6"]')
    await page.goto(url('light'), { waitUntil: 'networkidle' })
    assert((await panel.count()) === 1, 'Reader reference did not render')
    assert(
      (await panel.getByRole('img', { name: '3 of 3 free articles read this month', exact: true }).count()) === 1,
      'Read segments lost image semantics',
    )
    assert((await panel.getByRole('progressbar').count()) === 0, 'Read-counter image became a progress control')
    assert(
      (await panel.locator('[data-paywall6-segment-id][data-used="true"]').count()) === 3,
      'Three used source segments expected',
    )
    assert((await panel.getByRole('listitem').count()) === 3, 'Three passive reading assurances expected')
    const desktop = await panel.evaluate((element) => {
      const root = element.getBoundingClientRect()
      const counter = element.querySelector('[data-paywall6-counter]')!.getBoundingClientRect()
      const form = element.querySelector('form')!.getBoundingClientRect()
      const input = element.querySelector('input') as HTMLInputElement
      return {
        root: { width: root.width, height: root.height },
        counter: { width: counter.width, height: counter.height },
        form: { width: form.width, height: form.height },
        optionalEmail: !input.required,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    assert(
      Math.abs(desktop.root.width - 520) < 1 && Math.abs(desktop.counter.width - 108) < 1,
      'Reader column or segment width differs from source flow',
    )
    assert(desktop.optionalEmail && !desktop.horizontalOverflow, 'Email was made required or desktop overflowed')
    const email = panel.getByRole('textbox', { name: 'Email address', exact: true })
    const form = panel.locator('form')
    await form.evaluate((element) => {
      element.setAttribute('data-audit-submissions', '0')
      element.addEventListener('submit', () => {
        element.setAttribute(
          'data-audit-submissions',
          String(Number(element.getAttribute('data-audit-submissions')) + 1),
        )
      })
    })
    await email.fill('not-an-address')
    await email.press('Enter')
    assert(
      await email.evaluate((element) => (element as HTMLInputElement).validity.typeMismatch),
      'Native optional email lost type validation',
    )
    assert((await form.getAttribute('data-audit-submissions')) === '0', 'Invalid native email submitted')
    await email.fill('audit@example.invalid')
    await email.press('Enter')
    assert(
      (await form.getAttribute('data-audit-submissions')) === '1',
      'Valid native keyboard submit did not reach the host request',
    )
    assert((await email.inputValue()) === 'audit@example.invalid', 'Reader request discarded the draft')
    await panel.getByRole('button', { name: 'Sign in', exact: true }).click()
    assert(
      (await panel.locator('[data-paywall6-segment-id][data-used="true"]').count()) === 3,
      'Request fabricated a free-read reset',
    )
    assert(page.url() === url('light'), 'Request fabricated navigation')

    for (const theme of ['light', 'dark'] as const) {
      for (const [name, width, height] of [
        ['desktop', 1086, 400],
        ['tablet', 670, 640],
        ['mobile', 356, 640],
        ['stress', 286, 640],
      ] as const) {
        await page.setViewportSize({ width, height })
        await page.goto(url(theme), { waitUntil: 'networkidle' })
        assert(
          !(await panel.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)),
          `${theme}/${name} overflowed`,
        )
        await panel.screenshot({ path: `${output}/${theme}-${name}.png` })
      }
    }
    await page.setViewportSize({ width: 320, height: 420 })
    await page.goto(url('dark'), { waitUntil: 'networkidle' })
    await page.mouse.move(160, 300)
    await page.mouse.wheel(0, 5000)
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-paywall6-sign-in]')
      if (!button) return false
      const bounds = button.getBoundingClientRect()
      return bounds.top >= 0 && bounds.bottom <= window.innerHeight + 1
    })
    const shortHeight = await panel.locator('[data-paywall6-sign-in]').evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return {
        buttonTop: bounds.top,
        buttonBottom: bounds.bottom,
        scrollTop: document.scrollingElement?.scrollTop ?? 0,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    assert(shortHeight.scrollTop > 0 && !shortHeight.horizontalOverflow, 'Short-height reader action is unreachable')
    await page.screenshot({ path: `${output}/dark-short-320x420.png` })
    await page.goto(url('light', 'localized'), { waitUntil: 'networkidle' })
    assert(
      (await panel.getByRole('button', { name: 'Weiterlesen', exact: true }).count()) === 1,
      'German reader copy missing',
    )
    await page.goto(url('light', 'long'), { waitUntil: 'networkidle' })
    assert(
      !(await panel.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)),
      'Long German reader copy overflowed',
    )
    await panel.locator('[data-paywall6-sign-in]').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/light-long-320x420.png` })

    await page.setViewportSize({ width: 1086, height: 400 })
    await page.goto(url('dark', undefined, 'overflow'), { waitUntil: 'networkidle' })
    const assurances = panel.getByRole('region', { name: 'Email reading assurances', exact: true })
    await assurances.focus()
    await assurances.press('End')
    await page.waitForFunction(() => (document.querySelector('.lumen-paywall6-assurance-scroll')?.scrollTop ?? 0) > 0)
    const overflow = await assurances.evaluate((element) => ({
      focused: document.activeElement === element,
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    }))
    assert(
      overflow.focused && overflow.scrollHeight > overflow.clientHeight && !overflow.horizontalOverflow,
      'Reading assurances are not keyboard-scrollable',
    )
    assert((await panel.getByRole('listitem').count()) === 17, 'Overflow assurances were dropped')
    assert(errors.length === 0, `Browser errors: ${errors.join(' | ')}`)
    console.log(
      JSON.stringify({
        desktop,
        nativeEmailDraftAndValidation: true,
        requestOnlyActions: true,
        shortHeight,
        localizedCopy: true,
        overflow,
        browserErrors: 0,
      }),
    )
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
