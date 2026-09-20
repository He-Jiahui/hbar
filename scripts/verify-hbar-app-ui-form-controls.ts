import { chromium, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { formControlsAuditCopy } from '../tests/fixtures/hbar-app-ui-form-controls-audit'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5188'
const outputRoot = 'artifacts/ui-redesign/form-controls'
const executablePath = process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function ready(): Promise<boolean> {
  try {
    return (await fetch(`${baseUrl}/form-controls-audit.html`)).ok
  } catch {
    return false
  }
}

async function inspect(page: Page, name: string, minimumControlHeight = 36) {
  const report = await page.locator('.form-controls-audit-panel').evaluate((panel) => {
    const panelBounds = panel.getBoundingClientRect()
    const controls = [...panel.querySelectorAll<HTMLElement>('input:not([type="checkbox"]), select, textarea')].map(
      (control) => {
        const bounds = control.getBoundingClientRect()
        return {
          id: control.id,
          width: bounds.width,
          height: bounds.height,
          contained: bounds.left >= panelBounds.left - 1 && bounds.right <= panelBounds.right + 1,
        }
      },
    )
    const popup = panel.querySelector<HTMLElement>('.hbar-app-ui-combobox-popup')
    const popupBounds = popup?.getBoundingClientRect()
    return {
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      panelWidth: panelBounds.width,
      controls,
      popup: popupBounds ? { left: popupBounds.left, right: popupBounds.right, height: popupBounds.height } : null,
    }
  })
  await page.screenshot({ path: `${outputRoot}/${name}.png`, fullPage: true })
  assert(report.documentWidth <= report.viewportWidth + 1, `${name}: horizontal document overflow`)
  assert(
    report.controls.every((control) => control.contained),
    `${name}: a control escapes the form panel`,
  )
  assert(
    report.controls.every((control) => control.height >= minimumControlHeight),
    `${name}: a control has an undersized hit area`,
  )
  if (report.popup)
    assert(
      report.popup.left >= -1 && report.popup.right <= report.viewportWidth + 1,
      `${name}: combo box popup escapes the viewport`,
    )
  return { name, ...report }
}

async function run() {
  let server: ReturnType<typeof Bun.spawn> | undefined
  if (!(await ready()))
    server = Bun.spawn(['bun', 'run', 'app-ui:preview', '--', '--host', '127.0.0.1', '--port', new URL(baseUrl).port], {
      stdout: 'ignore',
      stderr: 'ignore',
    })
  const records: unknown[] = []
  const errors: string[] = []
  try {
    for (let attempt = 0; attempt < 50 && !(await ready()); attempt += 1) await Bun.sleep(200)
    assert(await ready(), 'Form controls audit preview did not start')
    await mkdir(outputRoot, { recursive: true })
    const browser = await chromium.launch({ headless: true, executablePath })
    try {
      const page = await browser.newPage()
      page.on('pageerror', (error) => errors.push(error.message))
      for (const locale of ['zh-CN', 'en-US'] as const)
        for (const theme of ['light', 'dark'] as const)
          for (const width of [1280, 390]) {
            await page.setViewportSize({ width, height: width > 600 ? 900 : 844 })
            await page.goto(`${baseUrl}/form-controls-audit.html?locale=${locale}&theme=${theme}`)
            await page.getByRole('heading', { name: formControlsAuditCopy[locale].title }).waitFor()
            await page.evaluate(() => document.fonts.ready.then(() => undefined))
            records.push(await inspect(page, `${locale}-${theme}-${width}`))
          }

      await page.setViewportSize({ width: 1280, height: 900 })
      for (const [size, expectedHeight] of [
        ['s', 32],
        ['m', 36],
        ['l', 44],
      ] as const) {
        await page.goto(`${baseUrl}/form-controls-audit.html?locale=en-US&theme=light`)
        await page.getByRole('heading', { name: formControlsAuditCopy['en-US'].title }).waitFor()
        await page.evaluate((appearanceSize) => {
          document.documentElement.dataset.hbarAppUiControlSize = appearanceSize
          document.documentElement.dataset.hbarAppUiTextSize = appearanceSize
          document.documentElement.dataset.hbarAppUiCornerSize = appearanceSize
        }, size)
        const record = await inspect(page, `appearance-${size}`, expectedHeight)
        const input = record.controls.find((control) => control.id === 'provider-name')
        assert(input?.height === expectedHeight, `${size}: input height does not match the shared appearance tier`)
        records.push(record)
      }

      const copy = formControlsAuditCopy['zh-CN']
      await page.setViewportSize({ width: 390, height: 844 })
      for (const scenario of ['error', 'long', 'disabled', 'loading']) {
        await page.goto(`${baseUrl}/form-controls-audit.html?locale=zh-CN&theme=dark&scenario=${scenario}`)
        await page.getByRole('heading', { name: copy.title }).waitFor()
        records.push(await inspect(page, `zh-CN-dark-390-${scenario}`))
      }

      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto(`${baseUrl}/form-controls-audit.html?locale=zh-CN&theme=dark&open=1`)
      const model = page.getByRole('combobox', { name: copy.modelLabel })
      await model.waitFor()
      await page
        .getByRole('option', { name: /GPT-5\.4/ })
        .first()
        .waitFor()
      records.push(await inspect(page, 'zh-CN-dark-1280-open'))
      await model.fill('Codex')
      await page.getByRole('option', { name: /GPT-5\.3 Codex/ }).waitFor()
      await model.press('ArrowDown')
      await model.press('Enter')
      assert(
        (await page.getByRole('status', { name: copy.selectedLabel }).textContent()) === 'GPT-5.3 Codex',
        'Keyboard selection failed',
      )
      assert((await page.getByRole('listbox').count()) === 0, 'Combo box stayed open after keyboard selection')
      const visibility = page.getByRole('checkbox', { name: copy.visibleLabel })
      await visibility.click()
      assert(!(await visibility.isChecked()), 'Checkbox did not publish its controlled value')
      const removeMedium = page.getByRole('button', { name: copy.removeThinking('中') })
      await removeMedium.click()
      assert((await removeMedium.count()) === 0, 'Multi-select did not remove a selected value')
      const thinking = page.getByRole('combobox', { name: copy.thinkingLabel })
      await thinking.click()
      await page.getByRole('option', { name: '中', exact: true }).click()
      assert(
        (await page.getByRole('button', { name: copy.removeThinking('中') }).count()) === 1,
        'Multi-select did not add a value',
      )
      assert((await thinking.inputValue()) === '', 'Multi-select retained the chosen label as a search query')
      await model.focus()
      const focusStyle = await model.evaluate((element) => {
        const control = element.closest<HTMLElement>('.hbar-app-ui-combobox-control')
        return control ? getComputedStyle(control).boxShadow : 'none'
      })
      assert(focusStyle !== 'none', 'Keyboard focus is not visually visible')

      await page.goto(`${baseUrl}/form-controls-audit.html?locale=zh-CN&theme=dark&scenario=disabled`)
      assert(
        await page.getByRole('textbox', { name: copy.providerLabel }).isDisabled(),
        'Disabled input remains editable',
      )
      assert(
        await page.getByRole('combobox', { name: copy.modelLabel }).isDisabled(),
        'Disabled combo box remains editable',
      )
      assert(errors.length === 0, errors.join('\n'))
    } finally {
      await browser.close()
    }
  } finally {
    await writeFile(`${outputRoot}/report.json`, JSON.stringify({ records, errors }, null, 2))
    server?.kill()
    if (server) await server.exited
  }
  console.log(JSON.stringify({ screenshots: records.length, outputRoot, pageErrors: errors.length }))
}

await run()
