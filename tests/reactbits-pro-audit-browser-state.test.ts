import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser } from '@playwright/test'
import { semanticInteractionDelta, snapshotLocatorWithSemantics } from '../scripts/reactbits-pro-audit'

describe('React Bits Pro browser semantic state probes', () => {
  let browser: Browser | null = null

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    })
  }, 30_000)

  afterAll(async () => {
    await browser?.close()
    browser = null
  }, 30_000)

  function requireBrowser(): Browser {
    if (!browser) throw new Error('The shared browser did not finish launching')
    return browser
  }

  test('captures live checkbox, switch and native single-select deltas', async () => {
    const context = await requireBrowser().newContext()
    try {
      const page = await context.newPage()
      await page.setContent(
        '<main><input type="checkbox" aria-label="Newsletter" checked><button type="button" role="switch" aria-label="Private workspace" aria-checked="true"></button><select aria-label="Data region"><option value="eu-central" selected>Europe</option><option value="us-east">United States</option></select></main>',
      )
      const root = page.locator('main')
      const capture = () => snapshotLocatorWithSemantics(root, false)
      const before = await capture()

      await page.getByRole('checkbox', { name: 'Newsletter', exact: true }).uncheck()
      const afterCheckbox = await capture()
      const checkboxDelta = semanticInteractionDelta(before, afterCheckbox)
      expect(checkboxDelta.changed).toBe(true)
      expect(checkboxDelta.signature).toContain('checkbox:checked')
      expect(checkboxDelta.signature).toContain('checkbox:unchecked')

      const switchControl = page.getByRole('switch', { name: 'Private workspace', exact: true })
      await switchControl.evaluate((element) => {
        element.addEventListener(
          'click',
          () =>
            element.setAttribute('aria-checked', element.getAttribute('aria-checked') === 'true' ? 'false' : 'true'),
          { once: true },
        )
      })
      await switchControl.click()
      const afterSwitch = await capture()
      expect(semanticInteractionDelta(afterCheckbox, afterSwitch).changed).toBe(true)

      const select = page.getByRole('combobox', { name: 'Data region', exact: true })
      expect(before.controls.find((control) => control.tag === 'select')?.value).toBe('eu-central')
      await select.selectOption('us-east')
      const afterSelect = await capture()
      expect(afterSelect.controls.find((control) => control.tag === 'select')?.value).toBe('us-east')
      const selectDelta = semanticInteractionDelta(afterSwitch, afterSelect)
      expect(selectDelta.changed).toBe(true)
      expect(selectDelta.signature).toContain('"value":"us-east"')
    } finally {
      await context.close()
    }
  })

  test('projects progressbar and meter AX names and values when same-length progress copy changes', async () => {
    const context = await requireBrowser().newContext()
    try {
      const page = await context.newPage()
      await page.setContent(
        '<main><div role="progressbar" aria-label="Setup progress" aria-valuemin="0" aria-valuemax="6" aria-valuenow="2"></div><p>2 of 6 done</p><meter aria-label="Import readiness" min="0" max="6" value="2"></meter></main>',
      )
      const root = page.locator('main')
      const capture = () => snapshotLocatorWithSemantics(root, false)
      const before = await capture()
      expect(before.progressStates).toEqual([
        {
          role: 'progressbar',
          accessibleName: 'Setup progress',
          valueNow: '2',
          valueMin: '0',
          valueMax: '6',
          valueText: '2 of 6 done',
        },
        {
          role: 'meter',
          accessibleName: 'Import readiness',
          valueNow: '2',
          valueMin: '0',
          valueMax: '6',
          valueText: null,
        },
      ])

      await page.getByRole('progressbar', { name: 'Setup progress', exact: true }).evaluate((element) => {
        element.setAttribute('aria-valuenow', '1')
      })
      await page.getByText('2 of 6 done', { exact: true }).evaluate((element) => {
        element.textContent = '1 of 6 done'
      })
      await page.getByRole('meter', { name: 'Import readiness', exact: true }).evaluate((element) => {
        if (!(element instanceof HTMLMeterElement)) throw new Error('Expected a native meter element')
        element.value = 1
      })

      const after = await capture()
      expect(before.bodyTextLength).toBe(after.bodyTextLength)
      expect(after.progressStates?.[0]?.valueNow).toBe('1')
      expect(after.progressStates?.[0]?.valueText).toBe('1 of 6 done')
      expect(after.progressStates?.[1]?.valueNow).toBe('1')
      const delta = semanticInteractionDelta(before, after)
      expect(delta.changed).toBe(true)
      expect(delta.signature).toContain('Setup progress')
      expect(delta.signature).toContain('Import readiness')
      expect(delta.signature).toContain('2 of 6 done')
      expect(delta.signature).toContain('1 of 6 done')
    } finally {
      await context.close()
    }
  })
})
