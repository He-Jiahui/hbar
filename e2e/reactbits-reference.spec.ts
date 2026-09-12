import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { HbarClient } from '../packages/client/src/index'

async function controller() {
  const fixture = JSON.parse(await readFile('.dev/e2e.json', 'utf8')) as { url: string; token: string }
  const api = new HbarClient(fixture.url, fixture.token)
  await api.connect()
  return { ...fixture, api }
}

async function login(context: BrowserContext, page: Page) {
  const fixture = await controller()
  const response = await context.request.post(`${fixture.url}/auth/token`, { data: { token: fixture.token } })
  expect(response.ok()).toBeTruthy()
  await page.goto(fixture.url)
  await expect(page.locator('.app-shell')).toBeVisible()
  return fixture
}

test('ReactBits reference gallery covers public variants and responsive fixture interactions', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    await page.keyboard.press('Control+Shift+P')
    const palette = page.getByRole('dialog', { name: '命令面板', exact: true })
    await expect(palette).toBeVisible()
    await palette.getByRole('searchbox', { name: '搜索命令', exact: true }).fill('ReactBits')
    await palette.getByRole('option', { name: /打开 ReactBits 参考画廊/ }).press('Enter')

    const gallery = page.getByTestId('reactbits-reference-gallery')
    await expect(gallery).toBeVisible()
    await expect(gallery).toContainText('38 categories · 300 variants')
    const variantSelect = gallery.getByRole('combobox', { name: 'Select reference variant', exact: true })
    await expect(variantSelect.locator('option')).toHaveCount(300)

    await gallery.getByRole('button', { name: 'Agent Activity 7', exact: true }).click()
    await expect(gallery.getByRole('heading', { name: 'Agent Activity 1', exact: true })).toBeVisible()
    await variantSelect.selectOption('reactbits.agent-activity-5')
    await expect(gallery.getByRole('heading', { name: 'Agent Activity 5', exact: true })).toBeVisible()
    await expect(gallery.locator('.rb-reference-fixture-loading')).toHaveCount(0)

    const previewFrame = gallery.locator('.rb-reference-preview-frame')
    await previewFrame.getByRole('tab', { name: 'Code', exact: true }).click()
    await expect(previewFrame.getByText('Clean-room fixture source', { exact: true })).toBeVisible()
    await expect(previewFrame).toContainText('Private ReactBits source is not accessed or copied.')
    await previewFrame.getByRole('tab', { name: 'Preview', exact: true }).click()

    const mobileButton = previewFrame.locator('[aria-label="Mobile preview width"]')
    await mobileButton.click()
    const mobileGeometry = await previewFrame.locator('.rb-reference-frame-preview > .rb-reference-preview > *').evaluate((element) => ({
      width: element.getBoundingClientRect().width,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }))
    expect(mobileGeometry.width).toBeLessThanOrEqual(390)
    expect(mobileGeometry.scrollWidth).toBeLessThanOrEqual(mobileGeometry.clientWidth)

    const splitter = previewFrame.getByRole('separator', { name: 'Drag to resize preview', exact: true })
    const before = await splitter.getAttribute('aria-valuenow')
    await splitter.press('ArrowRight')
    await expect(splitter).not.toHaveAttribute('aria-valuenow', before ?? '')

    await gallery.getByRole('button', { name: /All variants 300/ }).click()
    await variantSelect.selectOption('reactbits.ai-chat-9')
    await expect(gallery.getByRole('heading', { name: 'AI Chat 9', exact: true })).toBeVisible()
    await previewFrame.locator('[aria-label="Desktop preview width"]').click()
    await previewFrame.locator('.rb-reference-composer-model').click()
    const modelSurface = page.getByRole('dialog', { name: 'Model', exact: true })
    await expect(modelSurface).toBeVisible()
    await expect(modelSurface.locator('button').filter({ hasText: 'Atlas Long' })).toBeVisible()
    await expect(modelSurface.getByText('200K tokens', { exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(modelSurface).toHaveCount(0)
    await expect(gallery).toBeVisible()

    await gallery.getByRole('button', { name: 'Fullscreen preview', exact: true }).click()
    await expect(previewFrame).toHaveClass(/is-fullscreen/)
    await previewFrame.locator('[aria-label="Close fullscreen preview"]').click()
    await expect(previewFrame).not.toHaveClass(/is-fullscreen/)

    await page.screenshot({ path: `artifacts/${Date.now()}-reactbits-reference-gallery.png` })
  } finally {
    fixture.api.disconnect()
  }
})
