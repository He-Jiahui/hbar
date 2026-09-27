import {expect, test} from 'bun:test'
import {chromium} from '@playwright/test'
import {snapshotLocator} from '../scripts/reactbits-pro-audit'

test('textarea capture separates native draft value from React text nodes and keeps real prose feedback', async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'})
  try {
    const page = await browser.newPage()
    await page.setContent('<section><label for="notes">Notes</label><textarea id="notes"></textarea><p>Unchanged feedback</p></section>')
    const root = page.locator('section')
    const textarea = page.locator('textarea')
    const before = await snapshotLocator(root, false)
    await textarea.fill('audit sample')
    const propertyOnly = await snapshotLocator(root, false)
    await textarea.evaluate((element) => {
      if (!(element instanceof HTMLTextAreaElement)) throw new Error('Expected textarea')
      element.textContent = element.value
    })
    const controlled = await snapshotLocator(root, false)
    expect(propertyOnly.controls[0]?.value).toBe('audit sample')
    expect(controlled.controls[0]?.value).toBe('audit sample')
    expect(controlled.controls[0]?.name).toBe(propertyOnly.controls[0]?.name)
    expect(controlled.controls[0]?.labelFor).toBe('Notes')
    expect(controlled.bodyTextLength).toBe(propertyOnly.bodyTextLength)
    expect(controlled.bodyTextLength).toBe(before.bodyTextLength)
    await textarea.fill('a different draft value')
    const differentValue = await snapshotLocator(root, false)
    expect(differentValue.controls[0]?.value).not.toBe(controlled.controls[0]?.value)
    await page.locator('p').evaluate((element) => {element.textContent = 'Changed visible feedback remains audited'})
    expect((await snapshotLocator(root, false)).bodyTextLength).not.toBe(controlled.bodyTextLength)
  } finally {await browser.close()}
})
