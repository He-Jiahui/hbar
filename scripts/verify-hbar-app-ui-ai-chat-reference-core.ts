import { chromium, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const baseUrl = process.env.HBAR_APP_UI_PREVIEW_URL ?? 'http://127.0.0.1:5193'
const output = 'artifacts/ai-chat-reference-core-review'
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
  const parameters = new URLSearchParams({
    mode: 'isolated',
    variant: `hbar-app-ui-ai-chat-${variant}`,
    theme: 'light',
  })
  if (localized) parameters.set('aiChatFixture', 'localized')
  await page.goto(`${baseUrl}/?${parameters}`, { waitUntil: 'networkidle' })
  const panel = page.locator(`[data-hbar-app-ui-component="hbar-app-ui-ai-chat-${variant}"]`)
  await expect(panel).toHaveCount(1)
  return panel
}
async function noOverflow(target: Page) {
  expect(await target.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
}
try {
  await mkdir(output, { recursive: true })
  // One overall structure pass per variant, not a theme/viewport/button matrix.
  const messageCounts = [4, 6, 6, 6, 2, 5, 8, 0, 6]
  for (let variant = 1; variant <= 9; variant++) {
    const panel = await open(variant)
    await expect(panel.locator('[data-message-id]')).toHaveCount(messageCounts[variant - 1] ?? 0)
    await noOverflow(page)
    if ([2, 5, 8, 9].includes(variant)) await panel.screenshot({ path: `${output}/chat-${variant}-desktop.png` })
  }
  const thread = await open(1)
  await thread.getByRole('button', { name: 'Thought for 4s' }).click()
  await expect(thread.getByText('The refund total moved', { exact: false })).toBeVisible()
  const draft = thread.getByRole('textbox')
  await draft.fill('Please keep this preview draft')
  await thread.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(draft).toHaveValue('Please keep this preview draft')
  await expect(thread.getByRole('status')).toContainText('No external action')

  const artifact = await open(2)
  await artifact.getByRole('button', { name: 'v2', exact: true }).click()
  await expect(artifact.getByRole('button', { name: 'v2', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await artifact.getByRole('button', { name: 'Document', exact: true }).click()
  await expect(artifact.getByRole('button', { name: 'Document', exact: true })).toHaveAttribute('aria-pressed', 'true')

  const models = await open(9)
  await models.getByRole('button', { name: 'Model', exact: true }).click()
  await expect(models.getByRole('listbox', { name: 'Model', exact: true })).toBeVisible()
  await models.getByRole('option', { name: /Quill/ }).click()
  await expect(models.getByRole('button', { name: 'Model', exact: true })).toContainText('Quill')
  await expect(models.getByRole('listbox')).toHaveCount(0)

  const approval = await open(5)
  await approval.getByRole('button', { name: 'Delete keys', exact: true }).click()
  await expect(approval.getByText('Needs approval', { exact: true })).toBeVisible()
  await expect(approval.locator('.lumen-ai-chat-reference-notice')).toContainText('No external action')

  const voice = await open(8)
  await expect(voice.getByRole('button', { name: 'Send', exact: true })).toBeDisabled()
  await voice.getByRole('button', { name: 'Stop recording', exact: true }).click()
  await expect(voice.getByRole('status')).toContainText('Local preview')

  // Two structurally distinct narrow flows cover the shared wrapping and menu mechanism.
  await page.setViewportSize({ width: 390, height: 844 })
  const narrow = await open(2, true)
  await noOverflow(page)
  await expect(narrow.getByRole('textbox')).toBeVisible()
  const narrowArtifact = narrow.locator('[data-hbar-app-ui-region="artifact"]')
  await narrowArtifact.getByRole('button', { name: '文档', exact: true }).click()
  await expect(narrowArtifact.getByRole('button', { name: '文档', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.screenshot({ path: `${output}/artifact-narrow-localized.png`, fullPage: true })
  const narrowModels = await open(9)
  await narrowModels.getByRole('button', { name: 'Model', exact: true }).click()
  await expect(narrowModels.getByRole('listbox')).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: `${output}/model-menu-narrow.png`, fullPage: true })
  expect(errors).toEqual([])
  console.log(
    'AI Chat 1–9 practical core passed: nine structures, shared draft/disclosure, artifact/model selection, honest approval/voice preview and two narrow flows.',
  )
} finally {
  await browser.close()
}
