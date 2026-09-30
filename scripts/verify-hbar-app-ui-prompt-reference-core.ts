import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const output = 'artifacts/prompt-reference-core-review'
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HBAR_APP_UI_CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
async function open(variant: number, localized = false) {
  const query = new URLSearchParams({
    mode: 'isolated',
    variant: `hbar-app-ui-prompt-input-${variant}`,
    theme: 'light',
  })
  if (localized) query.set('promptInputFixture', 'localized')
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'networkidle' })
  const panel = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-prompt-input-${variant}"]`)
  await expect(panel).toHaveCount(1)
  return panel
}
async function noOverflow() {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}
try {
  await mkdir(output, { recursive: true })
  // Seven structures once; shared menus/composers are not a per-button or viewport matrix.
  for (let variant = 1; variant <= 7; variant++) {
    const panel = await open(variant)
    await expect(panel.locator('textarea')).toHaveCount(variant === 4 ? 0 : 1)
    await expect(panel.locator('textarea, input[type="text"]').first()).toBeVisible()
    await noOverflow()
    if ([2, 3, 5].includes(variant)) await panel.screenshot({ path: `${output}/prompt-${variant}-desktop.png` })
  }

  const rich = await open(1)
  const draft = rich.locator('textarea')
  await draft.fill('Keep this preview draft')
  await rich.getByRole('button', { name: 'Model: Atlas', exact: true }).click()
  await rich.getByRole('option', { name: /Quill/ }).click()
  await expect(rich.getByRole('button', { name: 'Model: Quill', exact: true })).toBeVisible()
  await rich.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(draft).toHaveValue('Keep this preview draft')
  await expect(rich.getByRole('status')).toContainText('No external action')

  const hero = await open(3)
  await hero.getByRole('button', { name: 'Landing page', exact: true }).click()
  await expect(hero.locator('textarea')).not.toHaveValue('')

  const template = await open(4)
  await expect(template.getByRole('button', { name: 'Run template' })).toBeDisabled()
  await template.getByRole('textbox', { name: 'Product', exact: true }).fill('Atlas Billing')
  await template.getByRole('button', { name: 'Run template' }).click()
  await expect(template.getByRole('textbox', { name: 'Product', exact: true })).toHaveValue('Atlas Billing')
  await expect(template.locator('.lumen-prompt-reference-notice')).toContainText('No external action')

  const uploads = await open(5)
  await uploads.getByRole('button', { name: 'Retry product-shot-hero.png', exact: true }).click()
  await expect(uploads.getByText('Connection lost', { exact: true })).toBeVisible()
  await expect(uploads.locator('.lumen-prompt-reference-notice')).toContainText('No external action')

  const context = await open(6)
  await context.getByRole('button', { name: 'Remove Dana Whitfield', exact: true }).click()
  await expect(context.locator('[data-source-id]')).toHaveCount(2)

  // Two different narrow flows cover inline fields and the wrapping shared toolbar/menu.
  await page.setViewportSize({ width: 390, height: 844 })
  const narrowTemplate = await open(4, true)
  await expect(narrowTemplate.getByRole('textbox', { name: '产品', exact: true })).toBeVisible()
  await noOverflow()
  await page.screenshot({ path: `${output}/template-narrow-localized.png`, fullPage: true })
  const modes = await open(7)
  const modeDraft = modes.locator('textarea')
  await modeDraft.fill('Keep across modes')
  await modes.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(modeDraft).toHaveValue('Keep across modes')
  await modeDraft.press('Shift+Enter')
  await expect(modeDraft).toHaveValue('Keep across modes\n')
  await modeDraft.press('Enter')
  await expect(modeDraft).toHaveValue('Keep across modes\n')
  await modes.getByRole('button', { name: 'Model: Atlas', exact: true }).click()
  await expect(modes.getByRole('listbox')).toBeVisible()
  await noOverflow()
  await page.screenshot({ path: `${output}/modes-narrow.png`, fullPage: true })
  expect(errors).toEqual([])
  console.log(
    'Prompt Input 1–7 practical core passed: seven structures, shared controlled drafts/menus, template validation, honest retry, context removal and two narrow flows.',
  )
} finally {
  await browser.close()
}
