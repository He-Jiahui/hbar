import { chromium, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { promptAuditCopy } from '../tests/fixtures/hbar-app-ui-prompt-audit'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5187'
const recordOnly = process.env.HBAR_APP_UI_PROMPT_RECORD_ONLY === '1'
const outputRoot = `artifacts/ui-redesign/prompt/${recordOnly ? 'before' : 'after'}`
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const records: unknown[] = []

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function ready(): Promise<boolean> {
  try {
    return (await fetch(`${baseUrl}/prompt-audit.html`)).ok
  } catch {
    return false
  }
}

async function inspect(page: Page, name: string) {
  const geometry = await page.locator('.hbar-app-ui-prompt-composer').evaluate((element) => {
    const input = element.querySelector('textarea')
    const send = element.querySelector<HTMLButtonElement>('.send-button')
    if (!input || !send) throw new Error('Prompt controls are missing')
    const bounds = element.getBoundingClientRect()
    const inputStyle = getComputedStyle(input)
    const buttons = [...element.querySelectorAll('button')].map((button) => {
      const rect = button.getBoundingClientRect()
      return {
        label: button.getAttribute('aria-label') ?? button.textContent,
        width: rect.width,
        height: rect.height,
        contained: rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1,
      }
    })
    return {
      width: bounds.width,
      height: bounds.height,
      noOverflow: document.documentElement.scrollWidth <= innerWidth + 1,
      inputHeight: input.getBoundingClientRect().height,
      inputBorder: inputStyle.borderTopWidth,
      inputBackground: inputStyle.backgroundColor,
      inputFont: inputStyle.fontFamily,
      buttons,
      inputContained: input.getBoundingClientRect().right <= bounds.right + 1,
      sendBackground: getComputedStyle(send).backgroundColor,
    }
  })
  await page.screenshot({ path: `${outputRoot}/${name}.png`, fullPage: true })
  records.push({ name, ...geometry })
  if (!recordOnly) {
    assert(geometry.noOverflow && geometry.inputContained, `${name}: prompt overflows its viewport`)
    assert(
      geometry.buttons.every((button) => button.contained && button.height >= 32 && button.width >= 32),
      `${name}: controls overflow or have undersized hit areas`,
    )
    assert(
      geometry.inputBorder === '0px' && geometry.inputBackground === 'rgba(0, 0, 0, 0)',
      `${name}: textarea still has a native inset surface`,
    )
    assert(geometry.sendBackground !== 'rgba(0, 0, 0, 0)', `${name}: primary send action lost its surface`)
  }
}

async function run() {
  let server: ReturnType<typeof Bun.spawn> | undefined
  if (!(await ready())) {
    server = Bun.spawn(['bun', 'run', 'app-ui:preview', '--', '--host', '127.0.0.1', '--port', new URL(baseUrl).port], {
      stdout: 'ignore',
      stderr: 'ignore',
    })
  }
  const errors: string[] = []
  try {
    for (let attempt = 0; attempt < 50 && !(await ready()); attempt++) await Bun.sleep(200)
    assert(await ready(), 'Prompt audit preview did not start')
    await mkdir(outputRoot, { recursive: true })
    const browser = await chromium.launch({ headless: true, executablePath })
    try {
      const page = await browser.newPage()
      page.on('pageerror', (error) => errors.push(error.message))
      for (const locale of ['zh-CN', 'en-US'] as const) {
        for (const theme of ['light', 'dark']) {
          for (const width of [1440, 1024, 390, 320]) {
            await page.setViewportSize({ width, height: width >= 1024 ? 960 : 844 })
            await page.goto(`${baseUrl}/prompt-audit.html?locale=${locale}&theme=${theme}`)
            await page.getByRole('textbox', { name: promptAuditCopy[locale].labels.input }).waitFor()
            await page.evaluate(() => document.fonts.ready.then(() => undefined))
            await inspect(page, `${locale}-${theme}-${width}`)
          }
        }
      }
      const copy = promptAuditCopy['zh-CN']
      for (const scenario of ['attachments', 'long', 'error', 'running', 'disabled']) {
        await page.goto(`${baseUrl}/prompt-audit.html?locale=zh-CN&theme=dark&scenario=${scenario}`)
        const input = page.getByRole('textbox', { name: copy.labels.input })
        await input.waitFor()
        await inspect(page, `zh-CN-dark-320-${scenario}`)
        if (recordOnly) continue
        if (scenario === 'long') {
          const bounds = await input.boundingBox()
          assert(bounds && bounds.height <= 224, 'Long input exceeds its bounded editor')
        }
        if (scenario === 'attachments') {
          await page.getByRole('button', { name: `移除附件 ${copy.attachment}` }).click()
          assert((await page.locator('.attachment-chip').count()) === 0, 'Attachment removal failed')
        }
        if (scenario === 'running') {
          await page.getByRole('button', { name: copy.labels.stop }).click()
          assert((await page.getByRole('button', { name: copy.labels.stop }).count()) === 0, 'Stop callback failed')
        }
        if (scenario === 'disabled') assert(await input.isDisabled(), 'Disabled prompt is editable')
      }
      if (!recordOnly) {
        await page.goto(`${baseUrl}/prompt-audit.html?locale=zh-CN&theme=light`)
        const input = page.getByRole('textbox', { name: copy.labels.input })
        await input.fill(copy.draft)
        await input.focus()
        assert(
          await input.evaluate((element) => getComputedStyle(element).outlineStyle !== 'none'),
          'Keyboard focus is invisible',
        )
        await input.dispatchEvent('compositionstart')
        await input.press('Enter')
        assert(
          (await page.getByRole('status', { name: copy.submitted }).textContent()) === '',
          'IME Enter submitted a draft',
        )
        await input.dispatchEvent('compositionend')
        await input.fill(copy.draft)
        await input.press('Enter')
        assert(
          (await page.getByRole('status', { name: copy.submitted }).textContent()) === copy.draft,
          'Enter did not submit the original draft',
        )
      }
      assert(errors.length === 0, errors.join('\n'))
    } finally {
      await browser.close()
    }
  } finally {
    if (records.length)
      await writeFile(`${outputRoot}/report.json`, JSON.stringify({ recordOnly, records, errors }, null, 2))
    server?.kill()
    if (server) await server.exited
  }
  console.log(JSON.stringify({ recordOnly, screenshots: records.length, outputRoot, pageErrors: errors.length }))
}

await run()
