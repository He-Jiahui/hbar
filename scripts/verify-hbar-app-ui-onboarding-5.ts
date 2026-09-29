import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = 'artifacts/onboarding5-local-review'

function url(theme: 'light' | 'dark', locale?: 'localized' | 'long'): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-onboarding-5', mode: 'isolated', theme })
  if (locale) parameters.set('onboarding5Fixture', locale)
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
      // Vite may still be starting.
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
  const page = await browser.newPage({ viewport: { width: 1086, height: 640 } })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    const panel = page.locator('[data-hbar-app-ui-component="hbar-app-ui-onboarding-5"]')
    const row = panel.locator('[data-onboarding5-invitation-id="invite-priya"]')
    const second = panel.locator('[data-onboarding5-invitation-id="invite-empty"]')
    await page.goto(url('light'), { waitUntil: 'networkidle' })
    assert((await panel.count()) === 1, 'Onboarding 5 reference is not rendered')
    assert((await panel.getByRole('heading', { name: 'Invite your team' }).count()) === 1, 'Heading missing')
    assert((await panel.locator('[data-onboarding5-invitation-id]').count()) === 2, 'Two source rows expected')
    assert((await panel.getByRole('combobox').count()) === 2, 'Per-person role selectors missing')
    assert((await row.getByRole('textbox').inputValue()) === 'priya@northwind.co', 'Initial email differs')
    assert((await row.getByRole('combobox').inputValue()) === 'admin', 'Initial role differs')
    const desktop = await panel.evaluate((element) => {
      const panelRect = element.getBoundingClientRect()
      const link = element.querySelector('.lumen-onboarding5-link-card')!.getBoundingClientRect()
      const rows = element.querySelector('.lumen-onboarding5-invitations')!.getBoundingClientRect()
      const footer = element.querySelector('.lumen-onboarding5-actions')!.getBoundingClientRect()
      return {
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        panel: { x: panelRect.x, y: panelRect.y, width: panelRect.width, height: panelRect.height },
        link: { y: link.y, height: link.height },
        rows: { y: rows.y, height: rows.height },
        footer: { y: footer.y, height: footer.height },
      }
    })
    assert(!desktop.horizontalOverflow, `Desktop overflows: ${JSON.stringify(desktop)}`)
    await panel.screenshot({ path: `${output}/light-desktop.png` })
    await row.getByRole('textbox').fill('sample@northwind.co')
    assert((await row.getByRole('textbox').inputValue()) === 'sample@northwind.co', 'Email draft did not update')
    assert((await second.getByRole('textbox').inputValue()) === '', 'Email draft leaked to another row')
    await row.getByRole('combobox').selectOption('member')
    assert((await row.getByRole('combobox').inputValue()) === 'member', 'Role did not change')
    assert((await second.getByRole('combobox').inputValue()) === 'member', 'Other role mutated')
    await panel.locator('[data-onboarding5-add]').click()
    assert(
      (await panel.locator('[data-onboarding5-invitation-id]').count()) === 2,
      'Unverified Add fabricated a new row',
    )
    await panel.locator('[data-onboarding5-copy]').click()
    assert(
      (await panel.locator('[data-onboarding5-copy]').textContent())?.trim() === 'Copy',
      'Unverified Copy fabricated success feedback',
    )

    for (const theme of ['light', 'dark'] as const) {
      for (const [name, width, height] of [
        ['desktop', 1086, 640],
        ['tablet', 670, 640],
        ['mobile', 390, 844],
        ['stress', 320, 720],
      ] as const) {
        await page.setViewportSize({ width, height })
        await page.goto(url(theme), { waitUntil: 'networkidle' })
        const overflow = await panel.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
        assert(!overflow, `${theme}/${name} overflows horizontally`)
        await panel.screenshot({ path: `${output}/${theme}-${name}.png` })
      }
    }

    await page.setViewportSize({ width: 320, height: 420 })
    await page.goto(url('dark'), { waitUntil: 'networkidle' })
    await page.mouse.move(160, 300)
    await page.mouse.wheel(0, 5000)
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-onboarding5-send]')
      if (!button) return false
      const rect = button.getBoundingClientRect()
      return rect.top >= 0 && rect.bottom <= window.innerHeight + 1
    })
    const shortHeight = await panel.locator('[data-onboarding5-send]').evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        buttonTop: rect.top,
        buttonBottom: rect.bottom,
        documentScrollTop: document.scrollingElement?.scrollTop ?? 0,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    assert(
      shortHeight.documentScrollTop > 0 && !shortHeight.horizontalOverflow,
      `Short-height send unreachable: ${JSON.stringify(shortHeight)}`,
    )
    await page.screenshot({ path: `${output}/dark-short-320x420.png` })
    await page.goto(url('light', 'localized'), { waitUntil: 'networkidle' })
    assert((await panel.getByRole('heading', { name: 'Team einladen' }).count()) === 1, 'Localized host copy missing')
    await page.goto(url('light', 'long'), { waitUntil: 'networkidle' })
    const longWidth = await panel.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      overflowing: [...document.querySelectorAll('[data-hbar-app-ui-component="hbar-app-ui-onboarding-5"] *')]
        .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 10)
        .map((element) => ({
          name: element.tagName,
          className: element.className,
          right: element.getBoundingClientRect().right,
        })),
    }))
    assert(
      longWidth.documentWidth <= longWidth.viewportWidth + 1,
      `Long localization overflows: ${JSON.stringify(longWidth)}`,
    )
    assert(pageErrors.length === 0, `Page errors: ${pageErrors.join(' | ')}`)
    console.log(
      JSON.stringify({
        desktop,
        independentDrafts: true,
        mobileAndStress: true,
        shortHeight,
        localizedCopy: true,
        pageErrors: 0,
      }),
    )
  } finally {
    await browser.close()
    server?.kill()
  }
}

await run()
