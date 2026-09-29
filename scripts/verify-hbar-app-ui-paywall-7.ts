import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5185'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const output = 'artifacts/paywall7-local-review'

function url(theme: 'light' | 'dark', fixture?: 'localized' | 'long', capacity?: 'overflow', isolated = true): string {
  const parameters = new URLSearchParams({ variant: 'hbar-app-ui-paywall-7', theme })
  if (isolated) parameters.set('mode', 'isolated')
  if (fixture) parameters.set('paywall7Fixture', fixture)
  if (capacity) parameters.set('paywall7Capacity', capacity)
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
  const page = await browser.newPage({ viewport: { width: 1086, height: 560 } })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  try {
    const panel = page.locator('[data-hbar-app-ui-component="hbar-app-ui-paywall-7"]')
    await page.goto(url('light'), { waitUntil: 'networkidle' })
    assert((await panel.count()) === 1, 'Admin gate reference did not render')
    assert(
      (await panel.locator('[data-paywall7-recipient-id]').count()) === 2,
      'Two passive source administrators expected',
    )
    assert((await panel.getByRole('heading').count()) === 1, 'Request text became an invented heading')
    const note = panel.getByRole('textbox', { name: 'Why do you need it?', exact: true })
    assert(
      (await note.inputValue()) === 'I need audit log access to close out the SOC 2 evidence request.',
      'Default source note missing',
    )
    const desktop = await panel.evaluate((element) => {
      const root = element.getBoundingClientRect()
      const shell = element.querySelector('.lumen-paywall7-request-shell')!.getBoundingClientRect()
      const textarea = element.querySelector('textarea') as HTMLTextAreaElement
      const icons = Array.from(element.querySelectorAll('svg')).map((icon) => ({
        tier: icon.getAttribute('data-tier'),
        width: icon.getBoundingClientRect().width,
      }))
      return {
        root: { width: root.width, height: root.height },
        shellWidth: shell.width,
        icons,
        optionalNote: !textarea.required,
        nativeRows: textarea.rows,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    assert(
      Math.abs(desktop.root.width - 560) < 1 && Math.abs(desktop.shellWidth - desktop.root.width) < 1,
      'Admin column or request shell failed to stretch',
    )
    assert(
      desktop.optionalNote && desktop.nativeRows === 2 && !desktop.horizontalOverflow,
      'Native note semantics or flow changed',
    )
    assert(
      desktop.icons.some((icon) => icon.tier === 'md' && icon.width === 16) &&
        desktop.icons.some((icon) => icon.tier === 'sm' && icon.width === 14),
      'Header icon tiers changed',
    )
    await note.fill('Audit sample note for local reference verification.')
    assert(
      (await note.inputValue()) === 'Audit sample note for local reference verification.',
      'Controlled host draft did not change',
    )

    for (const theme of ['light', 'dark'] as const) {
      for (const [name, width, height] of [
        ['desktop', 1086, 560],
        ['tablet', 670, 640],
        ['mobile', 356, 640],
        ['stress', 286, 640],
      ] as const) {
        await page.setViewportSize({ width, height })
        await page.goto(url(theme), { waitUntil: 'networkidle' })
        assert(
          !(await panel.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)),
          `${theme}/${name} overflows`,
        )
        await panel.screenshot({ path: `${output}/${theme}-${name}.png` })
      }
    }
    await page.setViewportSize({ width: 320, height: 420 })
    await page.goto(url('dark'), { waitUntil: 'networkidle' })
    await page.mouse.move(160, 300)
    await page.mouse.wheel(0, 5000)
    await page.waitForFunction(() => {
      const button = document.querySelector('[data-paywall7-send]')
      if (!button) return false
      const bounds = button.getBoundingClientRect()
      return bounds.top >= 0 && bounds.bottom <= window.innerHeight + 1
    })
    const shortHeight = await panel.locator('[data-paywall7-send]').evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return {
        buttonTop: bounds.top,
        buttonBottom: bounds.bottom,
        scrollTop: document.scrollingElement?.scrollTop ?? 0,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      }
    })
    assert(shortHeight.scrollTop > 0 && !shortHeight.horizontalOverflow, 'Short-height Send action is unreachable')
    await page.screenshot({ path: `${output}/dark-short-320x420.png` })
    await page.goto(url('light', 'localized'), { waitUntil: 'networkidle' })
    assert(
      (await panel.getByRole('button', { name: 'Anfrage senden', exact: true }).count()) === 1,
      'German copy missing',
    )
    await page.goto(url('light', 'long'), { waitUntil: 'networkidle' })
    assert(
      !(await panel.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)),
      'Long German note/recipient copy overflows',
    )
    await panel.locator('[data-paywall7-send]').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/light-long-320x420.png` })

    await page.setViewportSize({ width: 1086, height: 640 })
    await page.goto(url('dark', undefined, 'overflow'), { waitUntil: 'networkidle' })
    const recipients = panel.getByRole('region', { name: 'Workspace administrators', exact: true })
    await recipients.focus()
    await recipients.press('End')
    await page.waitForFunction(() => (document.querySelector('[data-paywall7-recipients]')?.scrollTop ?? 0) > 0)
    const overflow = await recipients.evaluate((element) => ({
      focused: document.activeElement === element,
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    }))
    assert(
      overflow.focused && overflow.scrollHeight > overflow.clientHeight && !overflow.horizontalOverflow,
      'Administrator overflow region cannot be reached by keyboard',
    )
    assert((await panel.locator('[data-paywall7-recipient-id]').count()) === 16, 'Overflow administrators were dropped')

    // The preview inspector observes requests; it is not part of the reference component.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(url('light', undefined, undefined, false), { waitUntil: 'networkidle' })
    const submittedDraft = 'Local request fixture, not a delivered message.'
    await note.fill(submittedDraft)
    await panel.getByRole('button', { name: 'Send request', exact: true }).click()
    const events = page.locator('.hbar-app-ui-preview-events')
    await events.getByText('request-admin-upgrade', { exact: true }).waitFor()
    const requestText = await events.innerText()
    assert(
      requestText.includes(submittedDraft) && requestText.includes('delivery-and-upgrade-unverified'),
      'Send request lost the current draft or fabricated delivery',
    )
    assert(
      requestText.includes('priya-nandakumar') && requestText.includes('marcus-bell'),
      'Send request lost stable administrator IDs',
    )
    assert((await note.inputValue()) === submittedDraft, 'Send request cleared the draft')
    assert(
      (await panel.getByText('Northwind is on Pro · you do not manage billing', { exact: true }).count()) === 1,
      'Request fabricated an upgraded plan',
    )
    assert(errors.length === 0, `Browser errors: ${errors.join(' | ')}`)
    console.log(
      JSON.stringify({
        desktop,
        draftChange: true,
        requestOnlySend: true,
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
