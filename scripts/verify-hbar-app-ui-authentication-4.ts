import { mkdir } from 'node:fs/promises'
import { chromium, type Page } from '@playwright/test'
import { readAuditContentGeometry } from './reactbits-audit-content-geometry'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = 'artifacts/authentication4-local-review'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function url(fixture: 'source' | 'long', scenario: 'source' | 'password') {
  const parameters = new URLSearchParams({
    mode: 'isolated',
    variant: 'hbar-app-ui-authentication-4',
    theme: 'light',
    authentication4Fixture: fixture,
    authentication4Scenario: scenario,
  })
  return `${baseUrl}/?${parameters}`
}

async function inspect(page: Page) {
  const geometry = await page.locator('.hbar-app-ui-isolated-canvas').evaluate(readAuditContentGeometry)
  const flow = await page.locator('.hbar-app-ui-auth-two-step-surface').evaluate((surface) => {
    const rect = (element: Element) => {
      const bounds = element.getBoundingClientRect()
      return { top: bounds.top, bottom: bounds.bottom, width: bounds.width, height: bounds.height }
    }
    const card = surface.querySelector('.hbar-app-ui-auth-card')
    const footer = surface.querySelector('.hbar-app-ui-auth-footer-note')
    if (!card || !footer) throw new Error('Missing two-step card or footer')
    const buttons = Array.from(surface.querySelectorAll<HTMLButtonElement>('button')).map((button) => {
      const style = getComputedStyle(button)
      return {
        action: button.getAttribute('data-auth4-action'),
        ...rect(button),
        clientHeight: button.clientHeight,
        scrollHeight: button.scrollHeight,
        padding: style.padding,
        fontWeight: style.fontWeight,
        icons: Array.from(button.querySelectorAll('svg')).map(rect),
      }
    })
    return {
      card: rect(card),
      footer: rect(footer),
      buttons,
      passwordPaddingEnd: (() => {
        const password = surface.querySelector('input[autocomplete="current-password"]')
        return password ? getComputedStyle(password).paddingInlineEnd : null
      })(),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      phase: surface.querySelector('[data-auth4-phase]')?.getAttribute('data-auth4-phase'),
      nativeOptionalInputs: Array.from(surface.querySelectorAll<HTMLInputElement>('input')).every(
        (input) => !input.required,
      ),
    }
  })
  return { geometry, flow }
}

async function run() {
  assert((await fetch(baseUrl)).ok, 'Production preview is not reachable')
  await mkdir(output, { recursive: true })
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ reducedMotion: 'reduce' })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.setDefaultTimeout(5_000)
  const records = []
  try {
    // Different measures, not button × theme × layout permutations. Full static pairs use the audit runner.
    for (const width of [1086, 286]) {
      await page.setViewportSize({ width, height: 560 })
      await page.goto(url('source', 'source'), { waitUntil: 'networkidle' })
      await page.locator('[data-auth4-phase="email"]').waitFor()
      const observation = await inspect(page)
      assert(!observation.flow.horizontalOverflow, `Default ${width}: horizontal overflow`)
      assert(observation.geometry.clippedRegions.length === 0, `Default ${width}: unreachable content`)
      assert(observation.flow.nativeOptionalInputs, 'A required gate was invented')
      const mail = observation.flow.buttons.find((button) => button.action === 'magic-link')
      assert(mail && mail.fontWeight === '500', 'Mail action is missing its measured weight')
      assert(
        mail.icons.length === 1 && mail.icons[0]?.width === 16 && mail.icons[0].height === 16,
        'Mail icon must keep the shared md tier at both measures',
      )
      await page.screenshot({ path: `${output}/default-${width}.png`, fullPage: true, animations: 'disabled' })
      records.push({ fixture: 'source', width, observation })
    }
    for (const scenario of ['source', 'password'] as const) {
      await page.setViewportSize({ width: 320, height: 420 })
      await page.goto(url('long', scenario), { waitUntil: 'networkidle' })
      await page.locator(`[data-auth4-phase="${scenario === 'source' ? 'email' : 'password'}"]`).waitFor()
      const observation = await inspect(page)
      assert(!observation.flow.horizontalOverflow, `Long ${scenario}: horizontal overflow`)
      assert(observation.geometry.clippedRegions.length === 0, `Long ${scenario}: unreachable content`)
      assert(
        observation.flow.card.top >= -1 && observation.flow.card.height > 400,
        `Long ${scenario}: card did not grow in normal flow`,
      )
      const submit = observation.flow.buttons.find(
        (button) => button.action === (scenario === 'source' ? 'continue' : 'sign-in'),
      )
      assert(submit && submit.height > 40, `Long ${scenario}: submit caption cannot grow`)
      if (scenario === 'password')
        assert(observation.flow.passwordPaddingEnd === '44px', 'Password overlay lacks its observed text clearance')
      const footer = page.locator('.hbar-app-ui-auth-footer-note')
      await footer.scrollIntoViewIfNeeded()
      assert(
        await footer.evaluate((element) => {
          const bounds = element.getBoundingClientRect()
          return bounds.top >= -1 && bounds.bottom <= innerHeight + 1
        }),
        `Long ${scenario}: footer not scroll-reachable`,
      )
      await page.screenshot({ path: `${output}/long-${scenario}.png`, fullPage: true, animations: 'disabled' })
      records.push({ fixture: 'long', scenario, width: 320, observation })
    }
    assert(errors.length === 0, `Browser errors: ${JSON.stringify(errors)}`)
    await Bun.write(
      `${output}/report.json`,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          previewUrl: baseUrl,
          verification: 'four distinct flow/content measures; no repeated button-layout matrix',
          authenticationAndNavigation: 'unverified; no credentials submitted by this flow probe',
          records,
          errors,
        },
        null,
        2,
      ),
    )
    console.log(
      JSON.stringify({ command: 'authentication-4-flow', measures: records.length, errors: errors.length, output }),
    )
  } finally {
    try {
      await page.close()
    } finally {
      await browser.close()
    }
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
