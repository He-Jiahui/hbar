import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { HbarClient } from '../packages/client/src/index'

async function login(context: BrowserContext, page: Page) {
  const fixture = JSON.parse(await readFile('.dev/e2e.json', 'utf8')) as { url: string; token: string }
  const api = new HbarClient(fixture.url, fixture.token)
  await api.connect()
  const response = await context.request.post(`${fixture.url}/auth/token`, { data: { token: fixture.token } })
  expect(response.ok()).toBeTruthy()
  await page.goto(fixture.url)
  await expect(page.locator('.app-shell')).toBeVisible()
  return { ...fixture, api }
}

async function openMobileSettings(page: Page) {
  await page.locator('.mobile-nav').getByRole('button', { name: '更多', exact: true }).click()
  const more = page.locator('.mobile-more-grid')
  await expect(more).toBeVisible()
  await more.getByRole('button', { name: '设置', exact: true }).click()
}

test('model settings can search and filter configured connections', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    await page.getByRole('button', { name: '设置', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: '供应商与模型', exact: true })).toBeVisible()
    const settingsPanel = page.locator('.settings-panel:not(.settings-editor-panel)').filter({ visible: true })
    await expect(settingsPanel).toHaveCSS('grid-template-columns', /\S+ \S+/)
    await expect(settingsPanel.locator('.settings-nav')).toHaveCSS('grid-column', '1')
    await expect(settingsPanel.locator('.models-section')).toHaveCSS('grid-column', '2')
    await expect(page.locator('.settings-tabs-glass')).toHaveClass(/glass-surface/)
    await expect(page.locator('.settings-tabs').getByRole('button', { name: '模型', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.locator('.settings-provider-group').first()).toHaveAttribute('aria-label', 'Local fixture')
    await expect(page.locator('.settings-provider-group').first()).toHaveCSS('opacity', '1')
    await expect(page.locator('.settings-provider-list')).toHaveCount(1)
    await expect(page.locator('.model-row.rb-spotlight-card')).toHaveCount(1)

    const search = page.getByRole('textbox', { name: '搜索供应商或模型', exact: true })
    await search.fill('fixture')
    await expect(page.locator('.model-row')).toHaveCount(1)
    await search.fill('does-not-exist')
    await expect(page.getByText('没有匹配的模型', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '清除筛选', exact: true }).click()
    await expect(page.locator('.model-row')).toHaveCount(1)

    await page.getByRole('button', { name: '待配置', exact: true }).click()
    await expect(page.getByText('没有匹配的模型', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '全部', exact: true }).click()

    await page.setViewportSize({ width: 390, height: 844 })
    await openMobileSettings(page)
    await expect(page.getByRole('textbox', { name: '搜索供应商或模型', exact: true })).toBeVisible()
    await expect(page.locator('.model-row')).toBeVisible()
    const mobileNavItems = page.locator('.mobile-nav button')
    await expect(mobileNavItems).toHaveCount(5)
    const mobileNavFitsViewport = await mobileNavItems.evaluateAll((items) =>
      items.every((item) => {
        const bounds = item.getBoundingClientRect()
        return bounds.left >= 0 && bounds.right <= innerWidth
      }),
    )
    expect(mobileNavFitsViewport).toBeTruthy()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  } finally {
    fixture.api.disconnect()
  }
})

test('provider editor opens as a secondary settings page', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    await page.getByRole('button', { name: '设置', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: '供应商与模型', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '添加模型', exact: true }).click()

    const editorPage = page.locator('.settings-detail-page[aria-label="添加模型"]')
    await expect(editorPage).toBeVisible()
    await expect(page.getByRole('dialog', { name: '添加模型', exact: true })).toHaveCount(0)
    await expect(editorPage.locator('.settings-detail-glass')).toHaveClass(/glass-surface/)
    const editorMetrics = await editorPage.evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      scrollTop: element.scrollTop,
    }))
    expect(editorMetrics.scrollHeight).toBeGreaterThan(editorMetrics.clientHeight)
    expect(editorMetrics.scrollTop).toBe(0)
    await expect(editorPage.locator('.provider-preset.rb-glare-button')).not.toHaveCount(0)
    await expect(editorPage.locator('.provider-preset').first()).toHaveCSS('text-align', 'left')
    await expect(editorPage.locator('.provider-preset').first().locator('.rb-glare-button-content')).toHaveCSS(
      'text-align',
      'left',
    )
    const presetAlignment = await editorPage
      .locator('.provider-preset')
      .first()
      .evaluate((element) => {
        const title = element.querySelector('strong')
        const buttonRect = element.getBoundingClientRect()
        const titleRect = title?.getBoundingClientRect()
        return titleRect ? titleRect.left - buttonRect.left : Number.POSITIVE_INFINITY
      })
    expect(presetAlignment).toBeLessThan(24)
    await expect(editorPage.locator('.provider-connection-summary.rb-spotlight-card')).toHaveCount(1)
    await expect(editorPage.locator('.provider-model-card-glass')).not.toHaveCount(0)
    await expect(editorPage.locator('.provider-advanced-glass')).toHaveCount(1)
    await expect(editorPage.locator('.settings-unsaved-bar')).toHaveCount(0)
    const modelId = editorPage.locator('input[aria-label="模型 ID"]')
    await modelId.fill('deepseek-chat-preview')
    await expect(editorPage.locator('.settings-unsaved-bar')).toHaveCount(0)
    await expect(editorPage.getByRole('button', { name: '保存', exact: true })).toBeEnabled()
    await editorPage.getByRole('button', { name: '取消', exact: true }).click()
    await expect(editorPage).toHaveCount(0)
    await page.screenshot({ path: `artifacts/${Date.now()}-desktop-provider-editor-page.png` })
    await editorPage.getByRole('button', { name: '返回供应商与模型', exact: true }).click()
    await expect(editorPage).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '供应商与模型', exact: true })).toBeVisible()

    await page.setViewportSize({ width: 390, height: 844 })
    await openMobileSettings(page)
    await expect(page.getByRole('heading', { name: '供应商与模型', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '添加模型', exact: true }).click()
    await expect(editorPage).toBeVisible()
    await expect(editorPage.locator('.provider-preset-grid')).toBeVisible()
    expect(await editorPage.evaluate((element) => element.scrollTop)).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await page.screenshot({ path: `artifacts/${Date.now()}-mobile-provider-editor-page.png` })
  } finally {
    fixture.api.disconnect()
  }
})

test('model picker changes the active model without leaving the conversation', async ({ page, context }) => {
  const fixture = await login(context, page)
  const providerId = 'ui-model-catalog'
  try {
    await fixture.api.call('provider.save', {
      provider: {
        id: providerId,
        name: 'UI Model Catalog',
        protocol: 'mock',
        baseUrl: 'http://127.0.0.1',
        model: 'fast-model',
        models: [
          { id: 'fast-model', name: 'Fast model', thinkingLevels: ['off'] },
          {
            id: 'deep-model',
            name: 'Deep model',
            reasoning: true,
            thinkingLevels: ['off', 'medium', 'high'],
            defaultThinkingLevel: 'medium',
          },
        ],
      },
    })
    await page.reload()
    const picker = page.getByRole('button', { name: /选择模型，当前/ }).filter({ visible: true })
    await picker.click()
    const pickerMenu = page.getByRole('menu', { name: '选择模型', exact: true }).filter({ visible: true })
    await expect(pickerMenu).toBeVisible()
    await expect(page.locator('.settings-panel').filter({ visible: true })).toHaveCount(0)
    const search = pickerMenu.getByRole('textbox', { name: '搜索模型', exact: true })
    await search.fill('UI Model Catalog')
    const provider = pickerMenu.locator('.model-picker-provider[aria-label="UI Model Catalog"]')
    await expect(provider).toBeVisible()
    const deep = provider.locator('.model-picker-model').filter({ hasText: 'Deep model' })
    await deep.getByRole('menuitemradio', { name: /UI Model Catalog \/ Deep model/ }).click()
    await expect(deep.getByRole('menuitemradio', { name: /UI Model Catalog \/ Deep model/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(page.locator('.settings-panel').filter({ visible: true })).toHaveCount(0)
    const high = pickerMenu.getByRole('radio', { name: '高', exact: true })
    if (await high.count()) await high.click()
    await expect(page.locator('.settings-panel').filter({ visible: true })).toHaveCount(0)

    await page.setViewportSize({ width: 390, height: 844 })
    await openMobileSettings(page)
    await expect(page.getByRole('heading', { name: '供应商与模型', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '搜索供应商或模型', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  } finally {
    await fixture.api.call('provider.delete', { id: providerId }).catch(() => {})
    fixture.api.disconnect()
  }
})
