import { mkdir } from 'node:fs/promises'
import { chromium, type Page } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = 'artifacts/authentication3-local-review'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function url(options: {
  theme: 'light' | 'dark'
  fixture?: string
  capacity?: string
  metrics?: string
  isolated?: boolean
}) {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-authentication-3', theme: options.theme })
  if (options.isolated !== false) parameters.set('mode', 'isolated')
  if (options.fixture) parameters.set('authentication3Fixture', options.fixture)
  if (options.capacity) parameters.set('authentication3Capacity', options.capacity)
  if (options.metrics) parameters.set('authentication3Metrics', options.metrics)
  return `${baseUrl}/?${parameters}`
}

async function inspectFlow(page: Page) {
  return page.locator('.hbar-app-ui-auth-quote-surface').evaluate((surface) => {
    const rect = (selector: string) => {
      const element = surface.querySelector(selector)
      if (!element) throw new Error(`Missing quote flow node: ${selector}`)
      const bounds = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        width: bounds.width,
        height: bounds.height,
        top: bounds.top,
        bottom: bounds.bottom,
        display: style.display,
        padding: style.padding,
        gap: style.gap,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        fontWeight: style.fontWeight,
      }
    }
    const providers = Array.from(surface.querySelectorAll('.hbar-app-ui-auth-provider-buttons > button'))
    const email = surface.querySelector<HTMLInputElement>('input[type="email"]')
    const password = surface.querySelector<HTMLInputElement>('input[autocomplete="current-password"]')
    const submit = surface.querySelector<HTMLButtonElement>('button[type="submit"]')
    return {
      left: rect('.hbar-app-ui-auth-quote-sign-in'),
      column: rect('.hbar-app-ui-auth-quote-form-content'),
      heading: rect('h1'),
      footer: rect('.hbar-app-ui-auth-quote-sign-in-footer'),
      aside: rect('aside'),
      input: rect('input[type="email"]'),
      providers: providers.map((provider) => ({
        height: provider.getBoundingClientRect().height,
        text: provider.textContent?.trim(),
        captionHeight: provider.querySelector('span:last-child')?.getBoundingClientRect().height,
        icons: Array.from(provider.querySelectorAll('svg')).map((icon) => ({
          width: icon.getBoundingClientRect().width,
          height: icon.getBoundingClientRect().height,
        })),
      })),
      nativeOptionalFields:
        email?.type === 'email' && !email.required && password?.type === 'password' && !password.required,
      nativeEnabledSubmit: submit?.type === 'submit' && !submit.disabled,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    }
  })
}

async function run() {
  assert((await fetch(baseUrl)).ok, `Preview is not reachable at ${baseUrl}`)
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport: { width: 1071, height: 640 } })
  page.setDefaultTimeout(5000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`)
  })
  try {
    const panel = page.locator('[data-hbar-app-ui-component="hbar-app-ui-authentication-3"]')
    const observations: unknown[] = []
    // Layout changes are independent of form drafts. Observe the split boundary once, not per control.
    for (const [name, width, theme] of [
      ['desktop', 1071, 'light'],
      ['boundary-hidden', 1023, 'light'],
      ['boundary-shown', 1024, 'light'],
      ['narrow', 320, 'dark'],
      ['iframe-stress', 286, 'light'],
    ] as const) {
      await page.setViewportSize({ width, height: 640 })
      await page.goto(url({ theme }), { waitUntil: 'networkidle' })
      const flow = await inspectFlow(page)
      assert(!flow.horizontalOverflow, `${name} overflows horizontally`)
      assert(flow.nativeOptionalFields && flow.nativeEnabledSubmit, 'Native source form semantics changed')
      assert(flow.aside.display === (width < 1024 ? 'none' : 'flex'), 'Content-width split boundary changed')
      assert(
        flow.input.height === 36 &&
          flow.providers.every((provider) => provider.height === 36 && provider.captionHeight === 20),
        `${name}: default native control dimensions changed: ${JSON.stringify(flow.providers)}`,
      )
      assert(
        flow.providers.map((provider) => provider.text).join('/') === 'Google/Apple/GitHub',
        'Provider labels differ from visible source',
      )
      assert(
        flow.providers.every(
          (provider) =>
            provider.icons.length === 1 && provider.icons[0]?.width === 16 && provider.icons[0]?.height === 16,
        ),
        'Canonical inline icons were hidden or distorted',
      )
      const expectedFooterHeight = name === 'iframe-stress' ? 40 : 20
      assert(
        Math.abs(flow.footer.bottom - 608) <= 1 && flow.footer.height === expectedFooterHeight,
        `${name}: default footer does not follow the observed source wrapping: ${JSON.stringify(flow.footer)}`,
      )
      if (name === 'desktop')
        assert(
          flow.column.width === 360 && flow.column.height === 434 && flow.heading.fontWeight === '500',
          'Desktop form hierarchy changed',
        )
      if (name === 'narrow')
        assert(flow.column.width === 272 && flow.left.padding === '32px 24px', 'Narrow padding or form width changed')
      observations.push({ name, width, theme, flow })
      if (name === 'desktop' || name === 'narrow')
        await page.screenshot({ path: `${output}/${theme}-${name}.png`, fullPage: true })
    }

    await page.setViewportSize({ width: 1071, height: 640 })
    await page.goto(url({ theme: 'light' }), { waitUntil: 'networkidle' })
    const metricLabels = await panel.locator('.hbar-app-ui-auth-quote-metric p + p').evaluateAll((labels) =>
      labels.map((label) => {
        const style = getComputedStyle(label)
        return {
          text: label.textContent?.trim(),
          title: label.getAttribute('title'),
          height: label.getBoundingClientRect().height,
          whiteSpace: style.whiteSpace,
          textOverflow: style.textOverflow,
        }
      }),
    )
    assert(
      metricLabels.length === 3 &&
        metricLabels.every(
          (label) =>
            label.text === label.title &&
            label.height === 16 &&
            label.whiteSpace === 'nowrap' &&
            label.textOverflow === 'ellipsis',
        ),
      'Observed metric-label flow or full Host disclosure changed',
    )
    await panel.getByRole('textbox', { name: 'Work email', exact: true }).fill('audit@example.invalid')
    const password = panel.getByLabel('Password', { exact: true })
    await password.fill('local-fixture-only')
    await panel.getByRole('button', { name: 'Show password', exact: true }).press('Space')
    assert(
      (await password.getAttribute('type')) === 'text' && (await password.inputValue()) === 'local-fixture-only',
      'Native reveal lost the local draft',
    )
    await panel.getByRole('button', { name: 'Show quote from Rachel Lindqvist', exact: true }).click()
    assert(
      (await panel.locator('blockquote').innerText()).includes('on-call handover'),
      'Selected story did not project its content',
    )

    await page.setViewportSize({ width: 320, height: 420 })
    await page.goto(url({ theme: 'dark' }), { waitUntil: 'networkidle' })
    await page.mouse.wheel(0, 5000)
    await page.waitForFunction(() => {
      const footer = document.querySelector('.hbar-app-ui-auth-quote-sign-in-footer')?.getBoundingClientRect()
      return footer && footer.top >= 0 && footer.bottom <= innerHeight + 1
    })
    const shortHeight = await page.evaluate(() => ({
      scrollTop: document.scrollingElement?.scrollTop ?? 0,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    }))
    assert(shortHeight.scrollTop > 0 && !shortHeight.horizontalOverflow, 'Short-host content or footer is clipped')
    await page.screenshot({ path: `${output}/dark-short-320x420.png` })

    await page.goto(url({ theme: 'light', fixture: 'long' }), { waitUntil: 'networkidle' })
    const longCopy = await panel
      .locator(
        'h1, label, .hbar-app-ui-auth-divider > small, .hbar-app-ui-auth-provider-buttons > button, .hbar-app-ui-auth-quote-sign-in-footer, button[type="submit"]',
      )
      .evaluateAll((elements) =>
        elements.map((element) => {
          const bounds = element.getBoundingClientRect()
          return {
            text: element.textContent?.trim(),
            clipped:
              bounds.left < -1 ||
              bounds.right > innerWidth + 1 ||
              element.scrollWidth > element.clientWidth + 1 ||
              element.scrollHeight > element.clientHeight + 1,
          }
        }),
      )
    assert(
      longCopy.every((entry) => !entry.clipped),
      'Long translated copy is clipped',
    )
    assert(
      !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)),
      'Long copy overflows the document',
    )
    await page.screenshot({ path: `${output}/light-long-320x420.png`, fullPage: true })

    await page.setViewportSize({ width: 1071, height: 640 })
    await page.goto(url({ theme: 'dark', capacity: 'overflow', metrics: 'overflow' }), { waitUntil: 'networkidle' })
    const providers = panel.locator('.hbar-app-ui-auth-provider-buttons > button')
    const dots = panel.locator('.hbar-app-ui-auth-quote-dots > button')
    assert((await providers.count()) === 17 && (await dots.count()) === 17, 'Overflow host data was truncated')
    assert((await panel.locator('.hbar-app-ui-auth-quote-metric').count()) === 17, 'Metric overflow was truncated')
    await providers.last().focus()
    await providers.last().press('Enter')
    await dots.last().focus()
    await dots.last().press('Space')
    assert((await dots.last().getAttribute('data-auth3-selected')) === 'true', 'Last story is not keyboard reachable')
    assert(
      !(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)),
      'Overflow document exceeds host width',
    )
    await page.screenshot({ path: `${output}/dark-overflow-1071x640.png`, fullPage: true })

    // A local typed request only; credentials never enter the preview event log or an external transport.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(url({ theme: 'light', isolated: false }), { waitUntil: 'networkidle' })
    await panel.getByRole('textbox', { name: 'Work email', exact: true }).fill('audit@example.invalid')
    await password.fill('local-fixture-only')
    await password.press('Enter')
    const events = page.locator('.hbar-app-ui-preview-events')
    await events.getByText('request-authentication-sign-in', { exact: true }).waitFor()
    const requestText = await events.innerText()
    assert(
      requestText.includes('audit@example.invalid') && requestText.includes('authentication-and-navigation-unverified'),
      'Local sign-in request is missing or falsely successful',
    )
    assert(
      !requestText.includes('local-fixture-only') && !requestText.includes('"password"'),
      'A password leaked into the request log',
    )
    assert(errors.length === 0, `Browser errors: ${errors.join(' | ')}`)
    const report = {
      acceptance: 'local-flow-and-host-integration-only; not current strict source/local acceptance',
      observations,
      representativeDraftAndSelection: true,
      metricLabels,
      shortHeight,
      longCopy,
      overflowCounts: { providers: 17, stories: 17, metrics: 17 },
      localRequestOnly: true,
      passwordInRequestLog: false,
      browserErrors: 0,
    }
    await Bun.write(`${output}/local-verification.json`, JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
  } finally {
    await browser.close()
  }
}

await run()
