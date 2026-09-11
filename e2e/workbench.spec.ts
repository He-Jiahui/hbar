import { test, expect, type Page, type BrowserContext } from '@playwright/test'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { HbarClient } from '../packages/client/src/index'

async function controller() {
  const fixture = JSON.parse(await readFile('.dev/e2e.json', 'utf8')) as {
    url: string
    token: string
    code: string
    root: string
    lanUrl?: string
    historyId: string
  }
  const api = new HbarClient(fixture.url, fixture.token)
  await api.connect()
  return { ...fixture, api }
}
async function login(context: BrowserContext, page: Page) {
  const fixture = await controller()
  const response = await context.request.post(`${fixture.url}/auth/token`, {
    data: { token: fixture.token },
  })
  expect(response.ok()).toBeTruthy()
  await page.goto(fixture.url)
  await expect(page.locator('.app-shell')).toBeVisible()
  await mkdir('artifacts', { recursive: true })
  return fixture
}
async function send(page: Page, text: string) {
  const input = page.getByRole('textbox', { name: '消息', exact: true }).filter({ visible: true })
  await input.fill(text)
  await page.getByRole('button', { name: '发送', exact: true }).filter({ visible: true }).click()
}

async function openMobileMore(page: Page) {
  await page.locator('.mobile-nav').getByRole('button', { name: '更多', exact: true }).click()
  await expect(page.locator('.mobile-more-grid')).toBeVisible()
  await expect(page.locator('.mobile-more-backdrop')).toBeVisible()
  const sheet = page.locator('.mobile-more-backdrop [role="dialog"]')
  await expect(sheet).toBeVisible()
  await expect(sheet).toHaveAttribute('aria-labelledby', 'mobile-more-title')
  await expect(page.locator('.mobile-more-close')).toBeFocused()
}

async function openMobileSettings(page: Page) {
  await openMobileMore(page)
  await page.locator('.mobile-more-grid').getByRole('button', { name: '设置', exact: true }).click()
}

test('workbench keeps tools on demand and exposes the global command palette', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    const sessionList = page.locator('.session-list')
    await expect(sessionList).toHaveClass(/rb-animated-list/)
    await expect(sessionList.locator('.session-list-viewport')).toHaveCSS('overflow-y', 'auto')
    const firstSessionCard = sessionList.locator('.rb-spotlight-card').first()
    await expect(firstSessionCard).toBeVisible()
    await expect(firstSessionCard).toHaveCSS('opacity', '1')
    await expect(page.locator('.session-header-glass')).toHaveClass(/glass-surface/)
    await expect(page.locator('.chat-context-glass')).toHaveClass(/glass-surface/)
    const bootstrap = await fixture.api.call('system.bootstrap', {})
    const browserSession = bootstrap.sessions.find((session) => !session.archived)
    if (!browserSession) throw new Error('E2E fixture did not expose an active session')
    const firstBrowserPage = await fixture.api.call('browser.navigate', {
      sessionId: browserSession.id,
      url: fixture.url,
    })
    const healthUrl = new URL('/healthz', fixture.url).href
    await fixture.api.call('browser.navigate', {
      sessionId: browserSession.id,
      url: healthUrl,
      contextId: firstBrowserPage.contextId,
      pageId: firstBrowserPage.pageId,
    })
    await page.locator('.session-select').filter({ hasText: browserSession.title }).first().click()
    const browserRail = page.getByRole('button', { name: '浏览器', exact: true }).filter({ visible: true })
    const browserPanel = page.locator('.browser-panel').filter({ visible: true })
    await expect(browserPanel).toHaveCount(0)
    await browserRail.click()
    await expect(browserPanel).toBeVisible()
    await expect(browserPanel.locator('.tool-header-glass')).toHaveClass(/glass-surface/)
    await expect(browserPanel.locator('.browser-address-glass')).toHaveClass(/glass-surface/)
    await expect(browserPanel.locator('.rb-animated-list')).toBeVisible()
    await expect(browserPanel.locator('.browser-page-card.rb-spotlight-card')).toHaveCount(1)
    const browserPageCard = browserPanel.locator('.browser-page-card.rb-spotlight-card')
    await expect(browserPageCard).toContainText(fixture.url)
    expect(await browserPageCard.evaluate((element) => element.tagName)).toBe('BUTTON')
    await expect(browserPageCard.locator(':scope > button')).toHaveCount(0)
    await expect(browserPageCard).toHaveCSS('text-align', 'left')
    await expect(browserPageCard).toHaveCSS('opacity', '1')
    const browserAddress = browserPanel.getByRole('textbox', { name: '浏览器地址', exact: true })
    await expect(browserPanel.getByRole('button', { name: '后退', exact: true })).toBeEnabled()
    await browserPanel.getByRole('button', { name: '后退', exact: true }).click()
    await expect(browserAddress).toHaveValue(new URL('/', fixture.url).href)
    await expect(browserPanel.locator('.browser-snapshot')).toBeVisible()
    await browserPanel.getByRole('button', { name: '前进', exact: true }).click()
    await expect(browserAddress).toHaveValue(healthUrl)
    await browserPanel.getByRole('button', { name: '刷新页面', exact: true }).click()
    await expect(browserAddress).toHaveValue(healthUrl)
    await browserPanel.getByRole('button', { name: '新建页面', exact: true }).click()
    await expect(browserAddress).toHaveValue('https://')
    const secondPageUrl = new URL('/healthz?tab=2', fixture.url).href
    await browserAddress.fill(secondPageUrl)
    await browserPanel.getByRole('button', { name: '打开地址', exact: true }).click()
    await expect(browserPanel.locator('.browser-page-card')).toHaveCount(2)
    await expect(browserAddress).toHaveValue(secondPageUrl)
    await browserPanel.getByRole('button', { name: '关闭页面', exact: true }).click()
    await expect(browserPanel.locator('.browser-page-card')).toHaveCount(1)
    await browserRail.hover()
    await expect(browserRail.locator('.rb-glass-icon-label')).toHaveCSS('opacity', '1')
    await expect(browserRail.locator('.rb-glass-icon-label')).toHaveCSS('z-index', '100')
    await browserRail.dragTo(page.locator('.left-rail'))
    await expect(page.locator('.left-rail').getByRole('button', { name: '浏览器', exact: true })).toBeVisible()
    const movedBrowserRail = page.locator('.left-rail').getByRole('button', { name: '浏览器', exact: true })
    await movedBrowserRail.dragTo(page.locator('.right-rail'))
    await expect(page.locator('.right-rail').getByRole('button', { name: '浏览器', exact: true })).toBeVisible()
    await page.screenshot({ path: `artifacts/${Date.now()}-desktop-browser-animated-list.png` })
    await browserRail.click()
    await expect(browserPanel).toHaveCount(0)

    const gitRail = page.getByRole('button', { name: 'Git', exact: true }).filter({ visible: true })
    const gitPanel = page.locator('.git-panel').filter({ visible: true })
    await expect(gitPanel).toHaveCount(0)
    await gitRail.click()
    await expect(gitPanel).toBeVisible()
    await expect(gitPanel).toContainText('当前目录不是 Git 仓库')
    await expect(gitPanel.getByRole('button', { name: '刷新 Git 状态', exact: true })).toBeEnabled()

    const separator = page.getByRole('separator', { name: '调整侧栏宽度', exact: true }).filter({ visible: true })
    const before = await separator.getAttribute('aria-valuenow')
    await separator.press('ArrowRight')
    await expect(separator).not.toHaveAttribute('aria-valuenow', before ?? '')

    await page.keyboard.press('Control+Shift+P')
    const palette = page.getByRole('dialog', { name: '命令面板', exact: true })
    await expect(palette).toBeVisible()
    await expect(palette).toHaveClass(/glass-surface/)
    await expect(palette.locator('.command-palette-group[aria-label="导航"]')).toBeVisible()
    await expect(palette.locator('.command-palette-group[aria-label="操作"]')).toBeVisible()
    const commandStyle = await palette
      .locator('.command-palette-group .command-palette-item')
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          justifyContent: style.justifyContent,
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          textAlign: style.textAlign,
        }
      })
    expect(commandStyle).toEqual({
      justifyContent: 'flex-start',
      paddingLeft: '16px',
      paddingRight: '16px',
      textAlign: 'left',
    })
    await expect(palette.locator('.command-palette-group .command-palette-item.rb-spotlight-card')).not.toHaveCount(0)
    await page.screenshot({ path: `artifacts/${Date.now()}-desktop-command-palette.png` })
    await palette.getByRole('searchbox', { name: '搜索命令', exact: true }).fill('命令控制台')
    await palette.getByRole('option', { name: /打开命令控制台/ }).press('Enter')
    await expect(page.locator('.terminal-panel').filter({ visible: true })).toBeVisible()

    const activityRail = page.getByRole('button', { name: '运行与事件', exact: true }).filter({ visible: true })
    const activityPanel = page.locator('.rb-activity-panel').filter({ visible: true })
    await expect(activityPanel).toHaveCount(0)
    await activityRail.click()
    await expect(activityPanel).toBeVisible()
    await expect(activityPanel.locator('.activity-panel-glass')).toHaveClass(/glass-surface/)
    await expect(activityPanel.locator('.activity-metric.rb-spotlight-card')).toHaveCount(4)
    await expect(activityPanel.locator('.run-list')).toHaveClass(/rb-animated-list/)
    await expect(activityPanel.locator('.run-list-viewport')).toHaveCount(1)
    await page.screenshot({ path: `artifacts/${Date.now()}-desktop-activity-panel.png` })
    await activityPanel.getByRole('tab', { name: '事件', exact: true }).click()
    const eventEntry = activityPanel.locator('.event-entry.rb-spotlight-card').first()
    await expect(eventEntry).toBeVisible()
    await expect(eventEntry).toHaveAttribute('aria-label', /查看事件/)
    await expect(eventEntry).toHaveCSS('text-align', 'left')
    const eventFilter = activityPanel.getByRole('textbox', { name: '筛选事件', exact: true })
    await expect(eventFilter).toBeVisible()
    const eventType = (await eventEntry.locator('code').textContent())?.trim() ?? ''
    await eventFilter.fill(eventType)
    await expect(activityPanel.locator('.event-entry')).not.toHaveCount(0)
    await eventFilter.fill('no-event-type-match')
    await expect(activityPanel.getByText('没有匹配的事件', { exact: true })).toBeVisible()
    await eventFilter.fill('')
    await eventEntry.click()
    const eventDetail = activityPanel.locator('.event-detail-panel')
    await expect(eventDetail).toBeVisible()
    await expect(eventDetail.locator('.event-detail')).toBeVisible()
    await eventDetail.getByRole('button', { name: '返回事件列表', exact: true }).click()
    await expect(eventDetail).toHaveCount(0)
    await activityRail.click()
    await expect(activityPanel).toHaveCount(0)

    const inspectorRail = page.getByRole('button', { name: '会话检查', exact: true }).filter({ visible: true })
    const inspectorPanel = page.locator('.tool-surface').filter({ hasText: '会话检查', visible: true }).last()
    await expect(inspectorPanel).toHaveCount(0)
    await inspectorRail.click()
    await expect(inspectorPanel).toBeVisible()
    await expect(inspectorPanel.locator('.tool-header-glass')).toHaveClass(/glass-surface/)
    await expect(inspectorPanel.locator('.tool-detail-glass')).toHaveCount(1)
    await expect(inspectorPanel.locator('.inspector-grid .inspector-metric')).toHaveCount(6)
    await expect(inspectorPanel.locator('.inspector-runs-list')).toHaveCount(1)

    const planRail = page.getByRole('button', { name: '计划', exact: true }).filter({ visible: true })
    const planPanel = page.locator('.tool-surface').filter({ hasText: '计划', visible: true }).last()
    await expect(planPanel).toHaveCount(0)
    await planRail.click()
    await expect(planPanel).toBeVisible()
    await expect(planPanel.locator('.tool-header-glass')).toHaveClass(/glass-surface/)
    await expect(planPanel.locator('.goal-card .tool-detail-glass')).toHaveCount(1)
    await expect(planPanel.locator('.plan-card .tool-detail-glass')).toHaveCount(1)

    const insightsRail = page.getByRole('button', { name: '会话洞察', exact: true }).filter({ visible: true })
    const insightsPanel = page.locator('.tool-surface').filter({ hasText: '会话洞察', visible: true }).last()
    await expect(insightsPanel).toHaveCount(0)
    await insightsRail.click()
    await expect(insightsPanel).toBeVisible()
    await expect(insightsPanel.locator('.tool-header-glass')).toHaveClass(/glass-surface/)
    await expect(insightsPanel.locator('.insight-chart .tool-detail-glass')).toHaveCount(1)
    await expect(insightsPanel.locator('.insight-kpis .insight-kpi')).toHaveCount(5)
    await expect(insightsPanel.locator('.insight-kpi').filter({ hasText: '费用' })).toContainText('$')
    await expect(insightsPanel.locator('.insight-kpi').filter({ hasText: '缓存命中' })).toContainText('%')
    await expect(insightsPanel.locator('.insight-list')).toHaveCount(1)

    const browserRailAgain = page.getByRole('button', { name: '浏览器', exact: true }).filter({ visible: true })
    await browserRailAgain.click()
    await expect(browserPanel).toBeVisible()
    const settingsRail = page.getByRole('button', { name: '设置', exact: true }).filter({ visible: true })
    await settingsRail.click()
    const settingsTab = page.getByRole('tab', { name: '设置', exact: true }).filter({ visible: true })
    await expect(settingsTab.locator('.flexlayout__tab_button_trailing')).toBeVisible()
    await browserRailAgain.click()
    await expect(browserPanel).toBeVisible()
    await browserRailAgain.click()
    await expect(browserPanel).toHaveCount(0)
    await settingsRail.click()
    await expect(settingsTab).toBeVisible()
    await page.getByRole('button', { name: '外观', exact: true }).click()
    await expect(page.getByRole('heading', { name: '界面主题', exact: true })).toBeVisible()
    await expect(page.locator('.theme-options-glass')).toHaveClass(/glass-surface/)
    await expect(page.locator('.theme-options .rb-glare-button')).toHaveCount(3)
    await page.getByRole('button', { name: '浅色', exact: true }).click()
    await expect(page.getByRole('button', { name: '浅色', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: '权限', exact: true }).click()
    await expect(page.getByRole('heading', { name: '工具权限', exact: true })).toBeVisible()
    await expect(page.locator('.permission-setting-row')).toHaveClass(/rb-spotlight-card/)
    await expect(page.locator('.permission-note')).toHaveClass(/rb-spotlight-card/)
    await page.screenshot({ path: `artifacts/${Date.now()}-desktop-permission-settings.png` })
    await settingsRail.click()
    await expect(settingsTab).toHaveCount(0)
    await settingsRail.click()
    await expect(settingsTab).toBeVisible()
    await settingsTab.locator('.flexlayout__tab_button_trailing').click()
    await expect(settingsTab).toHaveCount(0)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.keyboard.press('Control+Shift+P')
    await expect(palette).toBeVisible()
    await expect(palette.locator('.command-palette-group[aria-label="最近使用"]')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await page.screenshot({ path: `artifacts/${Date.now()}-mobile-command-palette.png` })
    await palette.getByRole('searchbox', { name: '搜索命令', exact: true }).press('Escape')
    await page.setViewportSize({ width: 360, height: 800 })
    await page.keyboard.press('Control+Shift+P')
    await expect(palette).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await expect(palette.locator('.command-palette-group .command-palette-item').first()).toHaveCSS(
      'justify-content',
      'flex-start',
    )
    await page.screenshot({ path: `artifacts/${Date.now()}-narrow-command-palette.png` })
  } finally {
    fixture.api.disconnect()
  }
})

test('system terminal opens as an xterm workbench surface', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    await page.keyboard.press('Control+Shift+P')
    const palette = page.getByRole('dialog', { name: '命令面板', exact: true })
    await expect(palette).toBeVisible()
    await palette.getByRole('searchbox', { name: '搜索命令', exact: true }).fill('系统终端')
    await palette.getByRole('option', { name: /打开系统终端/ }).press('Enter')
    const terminal = page.locator('.system-terminal-panel').filter({ visible: true })
    await expect(terminal).toBeVisible()
    await expect(terminal.getByRole('heading')).toHaveCount(0)
    await expect(terminal.getByText('系统终端', { exact: true })).toBeVisible()
    await expect(terminal.locator('.xterm')).toBeVisible()
    await expect(terminal.locator('.xterm-helper-textarea')).toBeAttached()
    expect(await terminal.evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(140)
    await page.keyboard.press('Control+Shift+P')
    const secondPalette = page.getByRole('dialog', { name: '命令面板', exact: true })
    await secondPalette.getByRole('searchbox', { name: '搜索命令', exact: true }).fill('系统终端')
    await secondPalette.getByRole('option', { name: /打开系统终端/ }).press('Enter')
    await expect(page.locator('.system-terminal-panel').filter({ visible: true })).toHaveCount(2)
    await page.screenshot({ path: `artifacts/${Date.now()}-desktop-system-terminal.png` })
    const terminalPanels = page.locator('.system-terminal-panel').filter({ visible: true })
    await terminalPanels.nth(1).getByRole('button', { name: '关闭系统终端', exact: true }).click()
    await terminalPanels.nth(0).getByRole('button', { name: '关闭系统终端', exact: true }).click()
    await expect(terminalPanels).toHaveCount(0)
    await page.setViewportSize({ width: 390, height: 844 })
    await openMobileMore(page)
    await page.locator('.mobile-more-grid').getByRole('button', { name: '系统终端', exact: true }).click()
    const mobileTerminal = page.locator('.system-terminal-panel').filter({ visible: true })
    await expect(mobileTerminal).toBeVisible()
    await expect(mobileTerminal.locator('.xterm')).toBeVisible()
    await mobileTerminal.getByRole('button', { name: '关闭系统终端', exact: true }).click()
    await expect(mobileTerminal).toHaveCount(0)
  } finally {
    fixture.api.disconnect()
  }
})

test('diagnose panel surfaces structured host status on desktop and mobile', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    const diagnoseRail = page.getByRole('button', { name: '诊断', exact: true }).filter({ visible: true }).last()
    const panel = page.locator('.rb-diagnose-panel').filter({ visible: true })
    await expect(panel).toHaveCount(0)
    await diagnoseRail.click()
    await expect(panel).toBeVisible()
    await expect(panel).toHaveAttribute('aria-busy', 'false')
    await expect(panel.locator('.diagnose-panel-glass')).toHaveClass(/glass-surface/)
    await expect(panel.locator('.diagnose-summary-card.rb-spotlight-card')).toHaveCount(3)
    await expect(panel.getByRole('heading', { name: '存储', exact: true })).toBeVisible()
    await expect(panel.locator('.diagnose-storage-grid')).toBeVisible()
    await expect(panel.locator('.diagnose-plugin-list')).toHaveClass(/rb-animated-list/)
    await expect(panel.locator('.diagnose-details')).toHaveCount(2)
    await panel.locator('.diagnose-details').first().locator('summary').click()
    await expect(panel.locator('.diagnose-tool-chips')).toBeVisible()
    await panel.locator('.diagnose-raw-details summary').click()
    await expect(panel.locator('.diagnose-raw-details pre')).toContainText('"host"')
    await page.screenshot({ path: `artifacts/${Date.now()}-desktop-diagnose-panel.png` })

    await diagnoseRail.click()
    await expect(panel).toHaveCount(0)
    await page.setViewportSize({ width: 390, height: 844 })
    await openMobileMore(page)
    const mobileTools = page.locator('.mobile-tool-grid')
    await expect(mobileTools.getByRole('button', { name: '诊断', exact: true })).toBeVisible()
    await mobileTools.getByRole('button', { name: '诊断', exact: true }).click()
    const mobilePanel = page.locator('.rb-diagnose-panel').filter({ visible: true })
    await expect(mobilePanel).toBeVisible()
    await expect(mobilePanel.locator('.diagnose-summary-card.rb-spotlight-card')).toHaveCount(3)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await page.screenshot({ path: `artifacts/${Date.now()}-mobile-diagnose-panel.png` })
  } finally {
    fixture.api.disconnect()
  }
})

test('composer plus menu exposes mode and attachment capabilities', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    const plus = page.getByRole('button', { name: '添加能力', exact: true }).filter({ visible: true })
    await plus.click()
    const capabilityMenu = page.getByRole('menu', { name: '会话能力', exact: true })
    await expect(capabilityMenu).toBeVisible()
    await expect(capabilityMenu.locator('.rb-menu-glass')).toHaveClass(/glass-surface/)
    await expect(capabilityMenu.locator('.composer-menu-card.rb-spotlight-card').first()).toBeVisible()
    for (const label of ['Goal 模式', 'Plan 模式', 'Budget 模式', '添加图片', '添加文件'])
      await expect(page.getByRole('menuitem', { name: label, exact: true })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Goal 模式', exact: true })).toBeDisabled()
    await expect(page.getByRole('menuitem', { name: '添加文件', exact: true })).toBeEnabled()
    const capabilityStyle = await page.getByRole('menuitem', { name: 'Goal 模式', exact: true }).evaluate((element) => {
      const style = getComputedStyle(element)
      return { justifyContent: style.justifyContent, paddingLeft: style.paddingLeft, paddingRight: style.paddingRight }
    })
    expect(capabilityStyle).toEqual({ justifyContent: 'flex-start', paddingLeft: '10px', paddingRight: '10px' })

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
    const fileChooser = await fileChooserPromise
    expect(fileChooser.isMultiple()).toBe(true)
    await fileChooser.setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('attachment') })
    await expect(page.locator('.attachment-chip-file')).toBeVisible()
    await expect(page.locator('.attachment-chip-file')).toHaveClass(/rb-spotlight-card/)
    await page.getByRole('button', { name: '移除文件 notes.txt', exact: true }).click()

    await plus.click()
    const chooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('menuitem', { name: '添加图片', exact: true }).click()
    const chooser = await chooserPromise
    expect(chooser.isMultiple()).toBe(true)
    expect(await page.getByRole('menu', { name: '会话能力', exact: true }).count()).toBe(0)
  } finally {
    fixture.api.disconnect()
  }
})

test('session capability dialog uses React Bits surfaces for summaries and plans', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    const bootstrap = await fixture.api.call('system.bootstrap', {})
    const session = await fixture.api.call('session.create', {
      workspaceId: bootstrap.workspaces[0]!.id,
      title: `React Bits capability ${Date.now().toString(36)}`,
    })
    await page.reload()
    await page.locator('.session-select').filter({ hasText: session.title, visible: true }).click()
    const plus = page.getByRole('button', { name: '添加能力', exact: true }).filter({ visible: true })
    await plus.click()
    await page.getByRole('menuitem', { name: 'Goal 模式', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: '会话能力', exact: true })
    await expect(dialog.locator('.capability-tabs-glass')).toHaveClass(/glass-surface/)
    await dialog.getByRole('textbox', { name: '目标', exact: true }).fill('完成 React Bits 能力面板验收')
    await dialog.getByRole('button', { name: '创建 Goal', exact: true }).click()
    await expect(dialog.locator('.capability-surface-glass')).toHaveCount(1)

    await dialog.getByRole('button', { name: 'Plan', exact: true }).click()
    await expect(dialog.locator('.rb-animated-list')).toBeVisible()
    await expect(dialog.locator('.session-plan-viewport')).toBeVisible()
    await dialog.getByRole('button', { name: '添加步骤', exact: true }).click()
    await expect(dialog.locator('.session-plan-row.rb-spotlight-card')).toHaveCount(1)
    await page.screenshot({ path: `artifacts/${Date.now()}-desktop-capability-dialog.png` })
  } finally {
    fixture.api.disconnect()
  }
})

test('composer drafts stay with their Session while switching and refreshing', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    const bootstrap = await fixture.api.call('system.bootstrap', {})
    const first = await fixture.api.call('session.create', {
      workspaceId: bootstrap.workspaces[0]!.id,
      title: 'Draft one',
    })
    await fixture.api.call('session.create', {
      workspaceId: bootstrap.workspaces[0]!.id,
      title: 'Draft two',
    })
    await page.reload()

    const firstSession = page.locator('.session-select').filter({ hasText: first.title, visible: true })
    await firstSession.click()
    const firstInput = page.getByRole('textbox', { name: '消息', exact: true }).filter({ visible: true })
    await firstInput.fill('draft belongs to the first Session')
    const plus = page.getByRole('button', { name: '添加能力', exact: true }).filter({ visible: true })
    await plus.click()
    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles({ name: 'draft-context.txt', mimeType: 'text/plain', buffer: Buffer.from('context') })
    await expect(page.getByRole('button', { name: '移除文件 draft-context.txt', exact: true })).toBeVisible()

    await page.locator('.session-select').filter({ hasText: 'Draft two', visible: true }).click()
    const secondInput = page.getByRole('textbox', { name: '消息', exact: true }).filter({ visible: true })
    await secondInput.fill('draft belongs to the second Session')
    await firstSession.click()
    await expect(firstInput).toHaveValue('draft belongs to the first Session')
    await expect(page.getByRole('button', { name: '移除文件 draft-context.txt', exact: true })).toBeVisible()
    await page.reload()
    await expect(page.locator('.session-select').filter({ hasText: first.title, visible: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '消息', exact: true }).filter({ visible: true })).toHaveValue(
      'draft belongs to the first Session',
    )
    await expect(page.getByRole('button', { name: '移除文件 draft-context.txt', exact: true })).toBeVisible()
  } finally {
    fixture.api.disconnect()
  }
})

test('session navigation reuses one conversation tab instead of accumulating tabs', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    const bootstrap = await fixture.api.call('system.bootstrap', {})
    const suffix = Date.now().toString(36)
    const first = await fixture.api.call('session.create', {
      workspaceId: bootstrap.workspaces[0]!.id,
      title: `Navigate first ${suffix}`,
    })
    const second = await fixture.api.call('session.create', {
      workspaceId: bootstrap.workspaces[0]!.id,
      title: `Navigate second ${suffix}`,
    })
    await page.reload()

    await page.locator('.session-select').filter({ hasText: first.title, visible: true }).click()
    await expect(page.getByRole('tab', { name: first.title, exact: true, selected: true })).toBeVisible()

    await page.locator('.session-select').filter({ hasText: second.title, visible: true }).click()
    await expect(page.getByRole('tab', { name: second.title, exact: true, selected: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: first.title, exact: true })).toHaveCount(0)

    await page.reload()
    await expect(page.getByRole('tab', { name: second.title, exact: true, selected: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: first.title, exact: true })).toHaveCount(0)
  } finally {
    fixture.api.disconnect()
  }
})

test('session sidebar exposes explicit rename and one primary new-session action', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    const bootstrap = await fixture.api.call('system.bootstrap', {})
    const title = `Rename me ${Date.now().toString(36)}`
    const renamed = `Renamed ${Date.now().toString(36)}`
    await fixture.api.call('session.create', { workspaceId: bootstrap.workspaces[0]!.id, title })
    await page.reload()
    await expect(page.getByRole('button', { name: '新建会话', exact: true }).filter({ visible: true })).toHaveCount(1)

    await page.locator('.session-select').filter({ hasText: title, visible: true }).click()
    await page.getByRole('button', { name: `重命名 ${title}`, exact: true }).click()
    const input = page.getByRole('textbox', { name: `重命名 ${title}`, exact: true })
    await input.fill(renamed)
    await input.press('Enter')
    await expect(page.getByRole('button', { name: `重命名 ${renamed}`, exact: true })).toBeVisible()
    await expect(page.getByRole('tab', { name: renamed, exact: true })).toBeVisible()
  } finally {
    fixture.api.disconnect()
  }
})

test('new-session action creates only one session when double-clicked', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    const before = await fixture.api.call('system.bootstrap', {})
    const workspaceId = before.workspaces[0]!.id
    const countBefore = before.sessions.filter((session) => session.workspaceId === workspaceId).length
    const action = page.getByRole('button', { name: '新建会话', exact: true }).filter({ visible: true })

    await action.dblclick()
    await expect
      .poll(async () => {
        const current = await fixture.api.call('system.bootstrap', {})
        return current.sessions.filter((session) => session.workspaceId === workspaceId).length
      })
      .toBe(countBefore + 1)
    await expect(page.getByRole('button', { name: '新建会话', exact: true }).filter({ visible: true })).toBeEnabled()
  } finally {
    fixture.api.disconnect()
  }
})

test('branch action creates only one child when double-clicked', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    const before = await fixture.api.call('system.bootstrap', {})
    const workspaceId = before.workspaces[0]!.id
    const title = `Branch source ${Date.now().toString(36)}`
    const source = await fixture.api.call('session.create', { workspaceId, title })
    await page.reload()
    await page.locator('.session-select').filter({ hasText: title, visible: true }).click()
    const branch = page.getByRole('button', { name: `创建分支 ${title}`, exact: true })
    const countBefore = (await fixture.api.call('system.bootstrap', {})).sessions.filter(
      (session) => session.parentId === source.id,
    ).length

    await branch.dblclick()
    await expect
      .poll(async () => {
        const current = await fixture.api.call('system.bootstrap', {})
        return current.sessions.filter((session) => session.parentId === source.id).length
      })
      .toBe(countBefore + 1)
    await expect(page.getByRole('button', { name: `创建分支 ${title}`, exact: true })).toBeEnabled()
  } finally {
    fixture.api.disconnect()
  }
})

test('model picker and permission preset survive a refresh', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    const modelPicker = page.getByRole('button', { name: /选择模型，当前/ }).filter({ visible: true })
    await modelPicker.click()
    const pickerMenu = page.getByRole('menu', { name: '选择模型', exact: true }).filter({ visible: true })
    await expect(pickerMenu).toBeVisible()
    await expect(pickerMenu.locator('.model-picker-detail')).toBeVisible()
    await expect(pickerMenu.locator('.model-picker-detail-stats')).toContainText('上下文')
    await expect(page.locator('.settings-panel').filter({ visible: true })).toHaveCount(0)
    const fixtureModel = pickerMenu.locator('.model-picker-option').filter({ hasText: 'fixture' })
    await expect(fixtureModel).toBeVisible()
    await fixtureModel.click()
    await expect(fixtureModel).toHaveAttribute('aria-checked', 'true')
    const thinkingOption = pickerMenu.getByRole('button', { name: /中等|medium/i }).first()
    if (await thinkingOption.count()) await thinkingOption.click()
    await expect(page.locator('.settings-panel').filter({ visible: true })).toHaveCount(0)
    await page.locator('.right-rail').getByRole('button', { name: '设置', exact: true }).click()
    const modelPage = page.locator('.settings-panel:not(.settings-editor-panel)').filter({ visible: true })
    await expect(modelPage.getByRole('heading', { name: '供应商与模型', exact: true })).toBeVisible()
    await expect(modelPage.getByRole('textbox', { name: '搜索供应商或模型', exact: true })).toBeVisible()
    await page.locator('.right-rail').getByRole('button', { name: '设置', exact: true }).click()
    await expect(modelPage).toHaveCount(0)

    const permission = page.getByRole('button', { name: '询问', exact: true }).filter({ visible: true })
    await permission.click()
    const permissionMenu = page.getByRole('menu', { name: '权限模式', exact: true })
    await expect(permissionMenu.locator('.rb-menu-glass')).toHaveClass(/glass-surface/)
    await expect(permissionMenu.locator('.permission-option-card.rb-spotlight-card').first()).toBeVisible()
    await permissionMenu.getByRole('menuitemradio', { name: /工作区自动执行/ }).click()
    await expect(page.getByRole('button', { name: '自动执行', exact: true }).filter({ visible: true })).toBeVisible()
    await expect.poll(async () => (await fixture.api.call('permission.get', {})).mode).toBe('allow')

    await page.reload()
    await expect(page.locator('.app-shell')).toBeVisible()
    await expect(page.getByRole('button', { name: '自动执行', exact: true }).filter({ visible: true })).toBeVisible()

    await page.getByRole('button', { name: '设置', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: '供应商与模型' })).toBeVisible()
    await page.getByRole('button', { name: '添加模型', exact: true }).click()
    const editor = page.locator('.settings-detail-page[aria-label="添加模型"]')
    await expect(editor).toBeVisible()
    await expect(page.getByRole('dialog', { name: '添加模型', exact: true })).toHaveCount(0)
    await expect(editor.locator('.settings-detail-glass')).toHaveClass(/glass-surface/)
    await expect(editor.getByRole('button', { name: '保存', exact: true })).toHaveClass(/rb-glare-button/)
    await editor.getByRole('button', { name: /OpenAI 官方 OpenAI API/ }).click()
    await expect(editor.locator('.provider-connection-summary')).toContainText('https://api.openai.com/v1')
    await expect(editor.getByRole('combobox', { name: '模型 ID' })).toHaveValue('gpt-5.5')
    await editor.getByRole('button', { name: '取消', exact: true }).click()
  } finally {
    await fixture.api.call('permission.set', { mode: 'ask' }).catch(() => {})
    fixture.api.disconnect()
  }
})

test('desktop pairs, sends Chinese input, approves a tool, recovers layout and cancels a run', async ({ page }) => {
  const fixture = await controller()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    const pairing = await fixture.api.call('pairing.create', {})
    await page.goto(fixture.url)
    await expect(page.locator('.pairing-page-glass')).toHaveClass(/glass-surface/)
    await expect(page.locator('.pairing-card')).toHaveClass(/rb-spotlight-card/)
    await expect(page.locator('.pairing-host-card')).toBeVisible()
    await expect(page.locator('.pairing-steps li').first()).toHaveCSS('text-align', 'left')
    await expect(page.getByRole('button', { name: '配对并连接', exact: true })).toHaveClass(/rb-glare-button/)
    await mkdir('artifacts', { recursive: true })
    await page.screenshot({ path: `artifacts/${Date.now()}-pairing-page.png` })
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(page.locator('.pairing-card')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await page.screenshot({ path: `artifacts/${Date.now()}-mobile-pairing-page.png` })
    await page.setViewportSize({ width: 1280, height: 840 })
    await page.getByRole('textbox', { name: '配对码' }).fill(pairing.code)
    await page.getByRole('button', { name: '配对并连接' }).click()
    await expect(page.locator('.app-shell')).toBeVisible()
    await send(page, '请检查当前项目')
    await expect(page.locator('.message-assistant')).toContainText('请检查当前项目')
    await send(page, '/tool write_file {"path":"approved.txt","text":"已批准"}')
    await expect(page.getByText('批准工具调用', { exact: true })).toBeVisible()
    await expect(page.locator('.tool-call').last()).toHaveClass(/rb-spotlight-card/)
    await page.getByRole('button', { name: '批准', exact: true }).click()
    await expect(page.locator('.approval')).toHaveCount(0)
    await expect.poll(() => readFile(`${fixture.root}/approved.txt`, 'utf8').catch(() => '')).toBe('已批准')
    await expect(page.locator('.tool-result').last()).toHaveClass(/rb-spotlight-card/)
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await expect(page.getByRole('heading', { name: '供应商与模型' })).toBeVisible()
    await page.reload()
    await expect(page.locator('.app-shell')).toBeVisible()
    await expect(page.getByRole('heading', { name: '供应商与模型' })).toBeVisible()
    await page.locator('.session-select').filter({ hasText: '请检查当前项目' }).click()
    await send(page, '/slow')
    await expect(page.getByRole('button', { name: '停止运行', exact: true }).filter({ visible: true })).toBeVisible()
    await page.getByRole('button', { name: '停止运行', exact: true }).filter({ visible: true }).click()
    await expect(page.locator('.run-outcome').filter({ visible: true })).toContainText('已停止')
    await expect(page.locator('.run-outcome-glass')).toHaveClass(/glass-surface/)
    await mkdir('artifacts', { recursive: true })
    await page.screenshot({ path: `artifacts/${Date.now()}-desktop-workbench.png` })
    await page
      .getByRole('tab', { name: '请检查当前项目', exact: true })
      .locator('.flexlayout__tab_button_trailing')
      .click()
    await expect(page.getByRole('tab', { name: '请检查当前项目', exact: true })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: '新会话', exact: true, selected: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '消息', exact: true }).filter({ visible: true })).toBeEnabled()
    await page.reload()
    await expect(page.locator('.app-shell')).toBeVisible()
    await expect(page.getByRole('tab', { name: '请检查当前项目', exact: true })).toHaveCount(0)
    await expect(page.getByRole('tab', { name: '新会话', exact: true, selected: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '消息', exact: true }).filter({ visible: true })).toBeEnabled()
    expect(errors).toEqual([])
  } finally {
    fixture.api.disconnect()
  }
})

test('rich content, image attachments and hostile Markdown render within their containers', async ({
  page,
  context,
}) => {
  const fixture = await login(context, page)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.getByRole('button', { name: '新建会话', exact: true }).last().click()
    await expect(page.getByRole('tab', { name: 'New session', exact: true, selected: true })).toBeVisible()
    await send(page, '/demo')
    await expect(page.locator('.mermaid-view svg')).toBeAttached()
    await expect(page.locator('.recharts-surface[role="application"]')).toBeAttached()
    await expect(page.locator('.react-flow__node')).toHaveCount(2)
    await expect(page.locator('.mermaid-view .render-surface-glass')).toHaveClass(/glass-surface/)
    await expect(page.locator('.chart-view .render-surface-glass')).toHaveClass(/glass-surface/)
    await expect(page.locator('.flow-view .render-surface-glass')).toHaveClass(/glass-surface/)
    await expect(page.locator('.code-block').first()).toHaveClass(/rb-code-surface/)
    await expect(page.locator('.code-block-glass').first()).toHaveClass(/glass-surface/)
    await page
      .locator('.chat-scroll')
      .filter({ visible: true })
      .evaluate((element) => {
        element.scrollTop = 0
      })
    await page.screenshot({ path: `artifacts/${Date.now()}-desktop-rich-content.png` })
    await page
      .locator('input[type="file"]')
      .filter({ visible: false })
      .last()
      .setInputFiles({
        name: 'pixel.png',
        mimeType: 'image/png',
        buffer: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
          'base64',
        ),
      })
    await expect(page.locator('.attachment-chip')).toBeVisible()
    await send(page, '<img src=x onerror="window.compromised=true"> [link](javascript:alert(1))')
    await expect(page.locator('.message-user .attachment-image')).toBeAttached()
    await expect(page.locator('.message-user .rb-message-user-surface').last()).toHaveClass(/rb-spotlight-card/)
    expect(await page.evaluate(() => (window as unknown as { compromised?: boolean }).compromised)).toBeUndefined()
    expect(
      await page
        .locator('.attachment-image')
        .evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0)),
    ).toBeTruthy()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    expect(errors).toEqual([])
  } finally {
    fixture.api.disconnect()
  }
})

test('phone supports send, denial, files and model settings without horizontal overflow', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const fixture = await login(context, page)
  try {
    await send(page, '/tool write_file {"path":"denied.txt","text":"must not exist"}')
    await expect(page.getByText('批准工具调用', { exact: true })).toBeVisible()
    await page.screenshot({ path: `artifacts/${Date.now()}-mobile-approval.png` })
    await page.getByRole('button', { name: '拒绝', exact: true }).click()
    await expect(page.locator('.approval')).toHaveCount(0)
    await expect(readFile(`${fixture.root}/denied.txt`, 'utf8')).rejects.toThrow()
    await page.locator('.mobile-nav').getByRole('button', { name: '文件', exact: true }).click()
    const fileNav = page.locator('.rb-file-nav').filter({ visible: true })
    await expect(fileNav.locator('.file-nav-glass')).toHaveClass(/glass-surface/)
    const fileList = fileNav.locator('.file-list')
    await expect(fileList).toHaveClass(/rb-animated-list/)
    await expect(fileList.locator('.file-list-viewport')).toHaveCSS('overflow-y', 'auto')
    const fileFilter = fileNav.getByRole('searchbox', { name: '筛选当前目录', exact: true })
    const fileFilterLayout = await fileFilter.evaluate((input) => {
      const container = input.closest('.file-filter')
      const icon = container?.querySelector('svg')
      if (!container || !icon) return null
      const containerStyle = getComputedStyle(container)
      const inputBounds = input.getBoundingClientRect()
      const iconBounds = icon.getBoundingClientRect()
      return {
        direction: containerStyle.flexDirection,
        height: container.getBoundingClientRect().height,
        centerDelta: Math.abs(inputBounds.top + inputBounds.height / 2 - (iconBounds.top + iconBounds.height / 2)),
      }
    })
    expect(fileFilterLayout?.direction).toBe('row')
    expect(fileFilterLayout?.height).toBeLessThanOrEqual(36)
    expect(fileFilterLayout?.centerDelta).toBeLessThanOrEqual(1)
    await fileFilter.fill('does-not-exist')
    await expect(fileNav.getByText('没有匹配的文件', { exact: true })).toBeVisible()
    await expect(fileNav.getByText('0 个匹配项', { exact: true })).toBeVisible()
    await fileNav.getByRole('button', { name: '清除筛选', exact: true }).click()
    const sampleFile = page.getByRole('button', { name: '打开文件 sample.ts', exact: true })
    await expect(sampleFile).toHaveClass(/file-entry/)
    await expect(sampleFile).toHaveClass(/rb-spotlight-card/)
    await expect(sampleFile).toHaveCSS('text-align', 'left')
    await expect(sampleFile).toHaveCSS('opacity', '1')
    await page.screenshot({ path: `artifacts/${Date.now()}-mobile-file-navigation.png` })
    await sampleFile.click()
    const fileViewer = page.locator('.rb-file-viewer').filter({ visible: true })
    await expect(fileViewer.locator('.cm-content')).toContainText('answer = 42')
    await expect(fileViewer.locator('.file-viewer-glass')).toHaveClass(/glass-surface/)
    await fileViewer.locator('.cm-content').click()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('export const answer = 43\n')
    await expect(fileViewer.getByText('有未保存的更改', { exact: true })).toBeVisible()
    await fileViewer.getByRole('button', { name: '保存', exact: true }).click()
    await expect(fileViewer.getByText('已保存', { exact: true })).toBeVisible()
    await expect(readFile(`${fixture.root}/sample.ts`, 'utf8')).resolves.toContain('answer = 43')
    await openMobileSettings(page)
    await expect(page.getByRole('heading', { name: '供应商与模型' })).toBeVisible()
    await page.screenshot({ path: `artifacts/${Date.now()}-mobile-settings.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  } finally {
    fixture.api.disconnect()
  }
})

test('storage paths and plugin dependencies are manageable on desktop and phone', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    await page.getByRole('button', { name: '设置', exact: true }).first().click()
    await page.getByRole('button', { name: '设备与连接', exact: true }).filter({ visible: true }).click()
    await expect(page.getByRole('heading', { name: '宿主连接', exact: true })).toBeVisible()
    await expect(page.locator('.host-address-row.rb-spotlight-card').first()).toBeVisible()
    await page.getByRole('button', { name: '存储', exact: true }).filter({ visible: true }).click()
    await expect(page.getByRole('heading', { name: '存储目录', exact: true })).toBeVisible()
    const dataRoot = page.getByRole('textbox', { name: /数据目录/ })
    const cacheRoot = page.getByRole('textbox', { name: /缓存目录/ })
    await expect(dataRoot).not.toHaveValue('')
    await expect(cacheRoot).not.toHaveValue('')
    await expect(page.locator('.path-roots-glass')).toHaveClass(/glass-surface/)
    await page.getByRole('button', { name: '验证目录', exact: true }).click()
    await expect(page.locator('.path-details')).toContainText('hbar.sqlite')
    await expect(page.locator('.path-details-surface')).toHaveClass(/rb-spotlight-card/)
    await page.screenshot({ path: `artifacts/${Date.now()}-desktop-storage-settings.png` })

    await page
      .locator('.settings-tabs')
      .filter({ visible: true })
      .getByRole('button', { name: '插件', exact: true })
      .click()
    const pluginDiagnostics = page.locator('.plugin-diagnostics').filter({ visible: true })
    await expect(pluginDiagnostics).toBeVisible()
    await page.getByRole('button', { name: '检查', exact: true }).click()
    const doctorReport = pluginDiagnostics.locator('.plugin-diagnostic-result-doctor')
    await expect(doctorReport).toBeVisible()
    await expect(doctorReport).toHaveAttribute('aria-label', '插件检查结果')
    await expect(doctorReport.locator('.plugin-doctor-status')).toContainText('检查通过')
    await expect(doctorReport.locator('.plugin-report-order-list')).toHaveClass(/rb-animated-list/)
    await doctorReport.locator('.plugin-report-raw summary').click()
    await expect(doctorReport.locator('.plugin-report-raw pre')).toContainText('"ok": true')

    await page.getByRole('button', { name: '依赖图', exact: true }).click()
    const graphReport = pluginDiagnostics.locator('.plugin-diagnostic-result-graph')
    await expect(graphReport).toBeVisible()
    await expect(graphReport).toHaveAttribute('aria-label', '插件依赖图结果')
    await expect(graphReport.locator('.plugin-report-node-list')).toHaveClass(/rb-animated-list/)
    await page.screenshot({ path: `artifacts/${Date.now()}-desktop-plugin-diagnostics.png` })

    await page.getByRole('button', { name: '查看插件锁', exact: true }).click()
    const lockReport = pluginDiagnostics.locator('.plugin-diagnostic-result-lock')
    await expect(lockReport).toBeVisible()
    await expect(lockReport).toHaveAttribute('aria-label', '插件锁定清单结果')
    await expect(lockReport.locator('.plugin-report-raw')).toBeVisible()
    await page.locator('.plugin-expand').first().click()
    await expect(page.locator('.plugin-row').first()).toHaveClass(/rb-spotlight-card/)
    await expect(page.locator('.plugin-detail').first()).toContainText('包依赖')

    await page.setViewportSize({ width: 390, height: 844 })
    await openMobileSettings(page)
    await page.getByRole('button', { name: '存储', exact: true }).filter({ visible: true }).click()
    await expect(page.getByRole('heading', { name: '存储目录', exact: true })).toBeVisible()
    await page.screenshot({ path: `artifacts/${Date.now()}-mobile-storage-settings.png` })
    await page
      .locator('.settings-tabs')
      .filter({ visible: true })
      .getByRole('button', { name: '插件', exact: true })
      .click()
    const mobilePluginDiagnostics = page.locator('.plugin-diagnostics').filter({ visible: true })
    await expect(mobilePluginDiagnostics).toBeVisible()
    await mobilePluginDiagnostics.getByRole('button', { name: '检查', exact: true }).click()
    await expect(mobilePluginDiagnostics.locator('.plugin-diagnostic-result-doctor')).toBeVisible()
    await expect(mobilePluginDiagnostics.locator('.plugin-diagnostic-actions')).toHaveCSS(
      'justify-content',
      'flex-start',
    )
    await page.screenshot({ path: `artifacts/${Date.now()}-mobile-plugin-diagnostics.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  } finally {
    fixture.api.disconnect()
  }
})

test('command console supports keyboard commands, concurrent sessions, approval and mobile layout', async ({
  page,
  context,
}) => {
  const fixture = await login(context, page)
  try {
    const bootstrap = await fixture.api.call('system.bootstrap', {})
    const firstSession = bootstrap.sessions.find((session) => !session.archived)
    if (!firstSession) throw new Error('E2E fixture did not expose an active session')
    await page.keyboard.press('Control+Backquote')
    const terminal = page.locator('.terminal-panel').filter({ visible: true })
    await expect(terminal).toBeVisible()
    await expect(page.getByRole('tab', { name: '控制台', exact: true }).filter({ visible: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.locator('.session-console-context').filter({ visible: true })).toContainText('thinking:')
    await expect(terminal.locator('.terminal-toolbar')).toHaveCount(0)
    await expect(terminal.locator('.terminal-composer-glass')).toHaveClass(/glass-surface/)
    await expect(terminal.getByRole('button', { name: '执行', exact: true })).toHaveClass(/rb-glare-button/)
    const input = terminal.getByRole('textbox', { name: '控制台输入', exact: true })
    await input.fill('/he')
    const completions = page.getByRole('listbox', { name: '命令补全' }).filter({ visible: true })
    await expect(completions).toBeVisible()
    await expect(completions).toHaveCSS('position', 'static')
    expect(await completions.evaluate((element) => element.closest('.terminal-composer') !== null)).toBeTruthy()
    await page.mouse.click(5, 5)
    await expect(completions).toHaveCount(0)
    await input.press('End')
    await input.type('l')
    await input.press('Backspace')
    await expect(completions).toBeVisible()
    await expect(completions.locator('.terminal-completions-prompt')).toContainText('↑↓ 选择')
    await expect(completions.getByRole('option').first()).toBeVisible()
    await input.press('Tab')
    await expect(input).toHaveValue('/help ')
    await input.press('Enter')
    await expect(terminal).toContainText('控制台命令')
    await expect(terminal.locator('.terminal-command-entry').last()).not.toHaveClass(/rb-spotlight-card/)
    const commandEntryStyle = await terminal
      .locator('.terminal-command-entry')
      .last()
      .evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          marginLeft: style.marginLeft,
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          textAlign: style.textAlign,
        }
      })
    expect(commandEntryStyle).toEqual({
      marginLeft: '0px',
      paddingLeft: '16px',
      paddingRight: '16px',
      textAlign: 'left',
    })

    await input.fill('/settings')
    await input.press('Enter')
    await expect(terminal).toContainText('approval:')
    await expect(terminal).toContainText('thinking:')
    await expect(page.locator('.settings-panel').filter({ visible: true })).toHaveCount(0)

    await input.fill('/thinking')
    const thinkingOptions = page.getByRole('listbox', { name: '命令补全' }).filter({ visible: true })
    await expect(thinkingOptions).toBeVisible()
    for (const level of ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
      await expect(thinkingOptions.getByRole('option', { name: new RegExp(`\\b${level}\\b`, 'i') })).toBeVisible()
    await expect(thinkingOptions.getByRole('option').first()).toBeVisible()
    await input.press('ArrowDown')
    await input.press('Enter')
    await expect(terminal).toContainText('思考等级：')

    await input.fill(`/switch ${firstSession.id}`)
    await input.press('Enter')
    await input.fill('//slow')
    await input.press('Enter')
    await expect.poll(async () => (await fixture.api.call('system.bootstrap', {})).host.activeRuns).toBe(1)
    const sessionCount = (await fixture.api.call('system.bootstrap', {})).sessions.length
    await input.fill('/new')
    await input.press('Enter')
    await expect
      .poll(async () => (await fixture.api.call('system.bootstrap', {})).sessions.length)
      .toBeGreaterThan(sessionCount)
    await expect(page.locator('.terminal-panel').filter({ visible: true })).toBeVisible()
    await input.fill('来自第二个 Session')
    await input.press('Enter')
    await expect(terminal).toContainText('来自第二个 Session')

    await input.fill(`/switch ${firstSession.id}`)
    await input.press('Enter')
    await input.fill('/stop')
    await input.press('Enter')

    await input.fill('//tool write_file {"path":"terminal-approved.txt","text":"ok"}')
    await input.press('Enter')
    await expect(terminal).toContainText('等待审批')
    await expect(terminal.locator('.terminal-approval-glass')).toHaveClass(/glass-surface/)
    await expect(terminal.getByRole('button', { name: '批准', exact: true })).toHaveClass(/rb-glare-button/)
    await terminal.getByRole('button', { name: '批准', exact: true }).click()
    await expect.poll(() => readFile(`${fixture.root}/terminal-approved.txt`, 'utf8').catch(() => '')).toBe('ok')
    await page.screenshot({ path: `artifacts/${Date.now()}-desktop-terminal.png` })

    await page.setViewportSize({ width: 390, height: 844 })
    await openMobileMore(page)
    await page.locator('.mobile-more-grid').getByRole('button', { name: '命令控制台', exact: true }).click()
    await expect(page.locator('.terminal-panel').filter({ visible: true })).toBeVisible()
    const mobileTerminal = page.locator('.terminal-panel').filter({ visible: true })
    const mobileInput = mobileTerminal.getByRole('textbox', { name: '控制台输入', exact: true })
    await mobileInput.fill('/quit')
    await mobileInput.press('Enter')
    await expect(page.locator('.terminal-panel').filter({ visible: true })).toHaveCount(0)
    await page.getByRole('tab', { name: '控制台', exact: true }).filter({ visible: true }).click()
    await expect(page.locator('.terminal-panel').filter({ visible: true })).toBeVisible()
    await page.screenshot({ path: `artifacts/${Date.now()}-mobile-terminal.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  } finally {
    fixture.api.disconnect()
  }
})

test('a client plugin adds an interactive panel and unloads it without a core edit', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    await expect.poll(async () => (await fixture.api.call('system.bootstrap', {})).host.activeRuns).toBe(0)
    await fixture.api.call('plugin.install', { path: resolve('examples/observer') })
    await expect(page.getByRole('button', { name: 'Observer counter', exact: true })).toBeVisible()
    await page.getByRole('tab', { name: '控制台', exact: true }).filter({ visible: true }).click()
    const terminal = page.locator('.terminal-panel').filter({ visible: true })
    const terminalInput = terminal.getByRole('textbox', { name: '控制台输入', exact: true })
    await terminalInput.fill('/observer')
    await expect(
      page
        .getByRole('listbox', { name: '命令补全', exact: true })
        .filter({ visible: true })
        .getByRole('option', { name: /observer\.ping/ }),
    ).toBeVisible()
    await terminalInput.press('Tab')
    await terminalInput.press('Enter')
    await expect(terminal).toContainText('Observer Client plugin is active.')
    await page.getByRole('button', { name: 'Observer counter', exact: true }).click()
    await expect(page.locator('.rb-plugin-panel').filter({ visible: true }).locator('.plugin-panel-glass')).toHaveClass(
      /glass-surface/,
    )
    await page.getByRole('button', { name: 'Increment counter' }).click()
    await expect(page.locator('.plugin-panel output')).toHaveText('1')
    await fixture.api.call('plugin.set', { id: 'hbar-example-observer', enabled: false })
    await expect(page.getByRole('button', { name: 'Observer counter', exact: true })).toHaveCount(0)
    await expect(page.locator('.plugin-panel output')).toHaveCount(0)
    const activeTerminal = page.locator('.terminal-panel').filter({ visible: true })
    if (!(await activeTerminal.isVisible()))
      await page.getByRole('tab', { name: '控制台', exact: true }).filter({ visible: true }).click()
    await page
      .locator('.terminal-panel')
      .filter({ visible: true })
      .getByRole('textbox', { name: '控制台输入' })
      .fill('/observer')
    await expect(page.getByRole('option', { name: /observer\.ping/ })).toHaveCount(0)
  } finally {
    fixture.api.disconnect()
  }
})

test('10k history stays virtualized and an unfollowed background run does not repaint messages', async ({
  page,
  context,
}) => {
  const fixture = await login(context, page)
  try {
    await page.locator('.session-select').filter({ hasText: '10k history' }).click()
    await expect(page.getByRole('button', { name: '加载更早的消息' })).toBeVisible()
    await page.getByRole('button', { name: '加载更早的消息' }).click()
    expect(await page.locator('[data-message-id]').count()).toBeLessThan(30)
    const bootstrap = await fixture.api.call('system.bootstrap', {})
    const background = await fixture.api.call('session.create', { workspaceId: bootstrap.workspaces[0]!.id })
    const run = await fixture.api.call('run.start', {
      sessionId: background.id,
      requestId: 'background',
      modelId: 'local-fixture',
      input: { text: '/slow' },
    })
    await expect
      .poll(async () => (await fixture.api.call('session.snapshot', { sessionId: background.id })).streams.length)
      .toBeGreaterThan(0)
    const changes = await page
      .locator('.message-list')
      .filter({ visible: true })
      .evaluate(
        (element) =>
          new Promise<number>((resolve) => {
            let mutations = 0
            const observer = new MutationObserver((records) => {
              mutations += records.length
            })
            observer.observe(element, { subtree: true, childList: true, characterData: true })
            setTimeout(() => {
              observer.disconnect()
              resolve(mutations)
            }, 400)
          }),
      )
    expect(changes).toBe(0)
    await fixture.api.call('run.cancel', { runId: run.id })
    await page.reload()
    await expect(page.locator('.message-list').filter({ visible: true })).toContainText('History entry 9999')
    const ids = await page
      .locator('[data-message-id]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-message-id')))
    expect(new Set(ids).size).toBe(ids.length)
  } finally {
    fixture.api.disconnect()
  }
})

test('plain HTTP LAN origin can pair and send without secure-context-only browser APIs', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const fixture = await controller()
  test.skip(!fixture.lanUrl, 'No non-loopback IPv4 address on this machine')
  try {
    const pair = await fixture.api.call('pairing.create', {})
    const response = await context.request.post(`${fixture.lanUrl}/auth/pair`, {
      data: { code: pair.code, name: 'LAN browser' },
    })
    expect(response.ok()).toBe(true)
    await page.goto(fixture.lanUrl!)
    await expect(page.locator('.app-shell')).toBeVisible()
    expect(await page.evaluate(() => isSecureContext)).toBe(false)
    await send(page, '局域网中文消息')
    await expect(page.locator('.message-assistant')).toContainText('局域网中文消息')
    await page.screenshot({ path: `artifacts/${Date.now()}-mobile-lan.png` })
  } finally {
    fixture.api.disconnect()
  }
})

test('desktop and phone operate the same session and approval in real time', async ({ page, context, browser }) => {
  const fixture = await login(context, page)
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  try {
    const data = await fixture.api.call('system.bootstrap', {})
    await fixture.api.call('session.create', { workspaceId: data.workspaces[0]!.id, title: 'Shared session' })
    await page.locator('.session-select').filter({ hasText: 'Shared session' }).click()
    await expect(page.getByRole('tab', { name: 'Shared session', exact: true, selected: true })).toBeVisible()
    const pairing = await fixture.api.call('pairing.create', {})
    await phoneContext.request.post(`${fixture.url}/auth/pair`, { data: { code: pairing.code, name: 'Paired phone' } })
    const phone = await phoneContext.newPage()
    await phone.goto(fixture.url)
    await expect(phone.locator('.app-shell')).toBeVisible()
    await phone.locator('.mobile-nav').getByRole('button', { name: '会话', exact: true }).click()
    await phone.locator('.session-select').filter({ hasText: 'Shared session', visible: true }).click()
    await expect(phone.locator('.chat-context')).toContainText('Shared session')
    await send(page, '/tool write_file {"path":"shared.txt","text":"approved from phone"}')
    await expect(phone.getByText('批准工具调用', { exact: true })).toBeVisible()
    await phone.getByRole('button', { name: '批准', exact: true }).click()
    await expect(page.locator('.approval')).toHaveCount(0)
    await expect.poll(() => readFile(`${fixture.root}/shared.txt`, 'utf8').catch(() => '')).toBe('approved from phone')
    await expect(page.locator('.message-assistant').filter({ hasText: 'Tool completed' })).toBeVisible()
    await expect(phone.locator('.message-assistant').filter({ hasText: 'Tool completed' })).toBeVisible()
  } finally {
    await phoneContext.close()
    fixture.api.disconnect()
  }
})
