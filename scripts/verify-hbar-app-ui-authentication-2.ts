import { mkdir } from 'node:fs/promises'
import { chromium, type Page } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = 'artifacts/authentication2-local-review'

function url(theme: 'light' | 'dark', fixture?: string, capacity?: string, isolated = true) {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-authentication-2', theme })
  if (isolated) parameters.set('mode', 'isolated')
  if (fixture) parameters.set('authentication2Fixture', fixture)
  if (capacity) parameters.set('authentication2Capacity', capacity)
  return `${baseUrl}/?${parameters}`
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function inspectFlow(page: Page) {
  return page
    .locator('[data-auth2-mode]')
    .first()
    .evaluate((element) => {
      const rect = (selector: string) => {
        const node = element.querySelector(selector)
        if (!node) throw new Error(`Missing Authentication 2 flow node: ${selector}`)
        const bounds = node.getBoundingClientRect()
        const style = getComputedStyle(node)
        return {
          width: bounds.width,
          height: bounds.height,
          top: bounds.top,
          bottom: bounds.bottom,
          flex: style.flex,
          alignment: style.alignItems,
          gap: style.gap,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          weight: style.fontWeight,
          display: style.display,
          padding: style.padding,
        }
      }
      const input = element.querySelector<HTMLInputElement>('[data-auth2-draft]')
      const submit = element.querySelector<HTMLButtonElement>('[data-auth2-action="continue"]')
      return {
        header: rect('header'),
        main: rect('.hbar-app-ui-auth-wide-main'),
        column: rect('.hbar-app-ui-auth-wide-content'),
        heading: rect('h1'),
        providers: rect('.hbar-app-ui-auth-provider-buttons'),
        provider: rect('.hbar-app-ui-auth-provider-buttons > button'),
        labelRow: rect('.hbar-app-ui-auth-provider-first-label-row'),
        field: rect('.hbar-app-ui-auth-provider-first-input'),
        terms: rect('.hbar-app-ui-auth-footer-note'),
        footer: rect('footer'),
        legalButtonDisplay: getComputedStyle(element.querySelector('[data-auth2-action="terms"]')!).display,
        nativeFieldType: input?.type,
        optionalField: !input?.required,
        nativeSubmitType: submit?.type,
        initiallyDisabled: submit?.disabled,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
}

async function run() {
  assert((await fetch(baseUrl)).ok, `Preview is not reachable at ${baseUrl}; build/start it before verification`)
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 911, height: 640 } })
  page.setDefaultTimeout(5_000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`)
  })
  try {
    const panel = page.locator('[data-hbar-app-ui-component="hbar-app-ui-authentication-2"]')
    const captures: unknown[] = []
    // Static combinations do not replay form actions. Responsive flow and material changes are independent of drafts.
    for (const theme of ['light', 'dark'] as const) {
      for (const [name, width, height] of [
        ['desktop', 911, 640],
        ['tablet', 670, 640],
        ['mobile', 356, 640],
        ['stress', 320, 640],
      ] as const) {
        await page.setViewportSize({ width, height })
        await page.goto(url(theme), { waitUntil: 'networkidle' })
        assert((await panel.count()) === 1, 'Provider-first reference did not render')
        const flow = await inspectFlow(page)
        assert(!flow.horizontalOverflow, `${theme}/${name} has horizontal overflow`)
        assert(
          flow.nativeFieldType === 'email' &&
            flow.optionalField &&
            flow.nativeSubmitType === 'submit' &&
            flow.initiallyDisabled,
          'Native field/form semantics changed',
        )
        assert(flow.labelRow.alignment === 'baseline' && flow.labelRow.gap === '12px', 'Source label row flow changed')
        assert(flow.providers.gap === '8px' && flow.provider.gap === '10px', 'Source provider gaps changed')
        assert(flow.field.height === 40 && flow.provider.height === 40, 'Ordinary source control heights changed')
        assert(flow.legalButtonDisplay.startsWith('inline'), 'Legal sentence was split into block controls')
        if (name === 'desktop') {
          assert(flow.header.height === 56 && flow.footer.height === 48, 'Source header/footer sizing changed')
          assert(flow.column.width === 420 && flow.column.height === 504, 'Source desktop content flow differs')
          assert(
            flow.main.flex === '1 1 0%' && flow.main.alignment === 'center',
            'Source flexible main alignment changed',
          )
          assert(
            flow.heading.weight === '500' && flow.heading.lineHeight === '32px',
            'Source heading hierarchy changed',
          )
        }
        if (name === 'stress')
          assert(
            flow.column.width === 272 && flow.terms.height === 40 && flow.footer.height === 48,
            'Narrow source column, legal wrapping, or footer flow changed',
          )
        await page.screenshot({ path: `${output}/${theme}-${name}.png`, fullPage: true })
        captures.push({ theme, viewport: name, width, height, flow })
      }
    }

    // One representative compound state transition covers independent drafts and both disabled/enabled gates.
    await page.setViewportSize({ width: 911, height: 640 })
    await page.goto(url('light'), { waitUntil: 'networkidle' })
    const input = panel.locator('[data-auth2-draft]')
    const toggle = panel.locator('[data-auth2-action="toggle-mode"]')
    const submit = panel.locator('[data-auth2-action="continue"]')
    await input.fill('not-an-email')
    assert(await submit.isDisabled(), 'Invalid email enabled Continue')
    await input.fill('audit@example.invalid')
    assert(await submit.isEnabled(), 'Valid fictional email failed to enable Continue')
    await toggle.focus()
    await toggle.press('Space')
    assert(
      (await input.getAttribute('data-auth2-draft')) === 'domain' &&
        (await input.inputValue()) === '' &&
        (await submit.isDisabled()),
      'SSO branch did not project a blank independent draft',
    )
    await input.fill('audit-team')
    assert(await submit.isEnabled(), 'Nonempty fictional domain failed to enable Continue')
    await toggle.click()
    assert((await input.inputValue()) === 'audit@example.invalid', 'Switching modes lost the email draft')

    await page.setViewportSize({ width: 320, height: 420 })
    await page.goto(url('dark'), { waitUntil: 'networkidle' })
    await page.mouse.wheel(0, 5000)
    await page.waitForFunction(() => {
      const footer = document.querySelector('.hbar-app-ui-auth-provider-first-surface footer')
      if (!footer) return false
      const bounds = footer.getBoundingClientRect()
      return bounds.top >= 0 && bounds.bottom <= window.innerHeight + 1
    })
    const shortHeight = await page.evaluate(() => ({
      scrollTop: document.scrollingElement?.scrollTop ?? 0,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    }))
    assert(
      shortHeight.scrollTop > 0 && !shortHeight.horizontalOverflow,
      'Short-height footer is clipped or page overflows',
    )
    await page.screenshot({ path: `${output}/dark-short-320x420.png` })
    await page.goto(url('light', 'long'), { waitUntil: 'networkidle' })
    assert(
      (await panel
        .getByRole('heading', { name: 'Willkommen zurück in deinem gemeinsamen Arbeitsbereich', exact: true })
        .count()) === 1,
      'Long translated host copy missing',
    )
    assert(
      !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)),
      'Long localized copy overflows horizontally',
    )
    const longControls = await panel.locator('.hbar-app-ui-auth-provider-buttons > button').evaluateAll((elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect()
        return { height: bounds.height, clipped: element.scrollHeight > element.clientHeight + 1 }
      }),
    )
    assert(
      longControls.every((control) => control.height >= 40 && !control.clipped),
      'Long provider labels were clipped by a fixed height',
    )
    const longText = await panel
      .locator('.hbar-app-ui-auth-brand-label, .hbar-app-ui-auth-divider > small, [data-auth2-action="continue"]')
      .evaluateAll((elements) =>
        elements.map((element) => ({
          text: element.textContent?.trim(),
          clipped: element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1,
        })),
      )
    assert(
      longText.every((entry) => !entry.clipped),
      'Long header, divider or submit copy was clipped',
    )
    await page.screenshot({ path: `${output}/light-long-320x420.png`, fullPage: true })

    await page.setViewportSize({ width: 911, height: 640 })
    await page.goto(url('dark', undefined, 'overflow'), { waitUntil: 'networkidle' })
    const providers = panel.getByRole('region', { name: 'Workspace sign-in providers', exact: true })
    await providers.focus()
    await providers.press('End')
    await page.waitForFunction(() => {
      const pane = document.querySelector('[data-auth2-action="provider-group"]')
      return pane !== null && pane.scrollTop >= pane.scrollHeight - pane.clientHeight - 1
    })
    const overflow = await providers.evaluate((element) => ({
      focused: document.activeElement === element,
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }))
    assert(
      overflow.focused && overflow.scrollHeight > overflow.clientHeight,
      'Provider overflow has no keyboard-accessible scroll owner',
    )
    assert((await providers.getByRole('button').count()) === 17, 'Overflow host providers were dropped')

    // Only the local inspector receives these typed requests. No real authentication or navigation is attempted.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(url('light', undefined, undefined, false), { waitUntil: 'networkidle' })
    await input.fill('audit@example.invalid')
    await input.press('Enter')
    const events = page.locator('.hbar-app-ui-preview-events')
    await events.getByText('request-authentication-continue', { exact: true }).waitFor()
    const requestText = await events.innerText()
    assert(
      requestText.includes('audit@example.invalid') && requestText.includes('authentication-and-navigation-unverified'),
      'Continuation request lost the captured draft or fabricated authentication',
    )
    assert((await input.inputValue()) === 'audit@example.invalid', 'Request cleared the email draft')
    assert(errors.length === 0, `Browser errors: ${errors.join(' | ')}`)
    const report = {
      acceptance: 'local-flow-and-host-integration-only; not a current strict source/local pair',
      captures,
      representativeDraftTransitions: true,
      copyOnlyRetention: 'separate memory browser regression',
      shortHeight,
      longControls,
      longText,
      overflow,
      localRequestOnly: true,
      browserErrors: 0,
    }
    await Bun.write(`${output}/local-verification.json`, JSON.stringify(report, null, 2))
    console.log(
      JSON.stringify({
        acceptance: report.acceptance,
        staticCaptures: captures.length,
        representativeDraftTransitions: true,
        shortHeight,
        longControls,
        longText,
        overflow,
        localRequestOnly: true,
        browserErrors: 0,
      }),
    )
  } finally {
    await browser.close()
  }
}

await run()
