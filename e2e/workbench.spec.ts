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

test('workbench keeps tools on demand and exposes the global command palette', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    await expect(page.locator('.session-list .rb-spotlight-card').first()).toBeVisible()
    const bootstrap = await fixture.api.call('system.bootstrap', {})
    const browserSession = bootstrap.sessions.find((session) => !session.archived)
    if (!browserSession) throw new Error('E2E fixture did not expose an active session')
    await fixture.api.call('browser.navigate', { sessionId: browserSession.id, url: fixture.url })
    await page.locator('.session-select').filter({ hasText: browserSession.title }).first().click()
    const browserRail = page.getByRole('button', { name: '浏览器', exact: true }).filter({ visible: true })
    const browserTab = page.getByRole('tab', { name: '浏览器', exact: true }).filter({ visible: true })
    await expect(browserTab).toHaveCount(0)
    await browserRail.click()
    await expect(browserTab).toBeVisible()
    const browserPanel = page.locator('.browser-panel').filter({ visible: true })
    await expect(browserPanel.locator('.rb-animated-list')).toBeVisible()
    await expect(browserPanel.locator('.rb-animated-list__viewport button')).toContainText(fixture.url)
    await page.screenshot({ path: `artifacts/${Date.now()}-desktop-browser-animated-list.png` })
    await browserRail.click()
    await expect(browserTab).toHaveCount(0)

    const separator = page.getByRole('separator', { name: '调整侧栏宽度', exact: true }).filter({ visible: true })
    const before = await separator.getAttribute('aria-valuenow')
    await separator.press('ArrowRight')
    await expect(separator).not.toHaveAttribute('aria-valuenow', before ?? '')

    await page.keyboard.press('Control+Shift+P')
    const palette = page.getByRole('dialog', { name: '命令面板', exact: true })
    await expect(palette).toBeVisible()
    await expect(palette).toHaveClass(/glass-surface/)
    const commandStyle = await palette.locator('.command-palette-list > button').first().evaluate((element) => {
      const style = getComputedStyle(element)
      return { justifyContent: style.justifyContent, paddingLeft: style.paddingLeft, paddingRight: style.paddingRight }
    })
    expect(commandStyle).toEqual({ justifyContent: 'flex-start', paddingLeft: '16px', paddingRight: '16px' })
    await page.screenshot({ path: `artifacts/${Date.now()}-desktop-command-palette.png` })
    await palette.getByRole('searchbox', { name: '搜索命令', exact: true }).fill('命令控制台')
    await palette.getByRole('option', { name: /打开命令控制台/ }).press('Enter')
    await expect(page.locator('.terminal-panel').filter({ visible: true })).toBeVisible()

    const activityRail = page.getByRole('button', { name: '运行与事件', exact: true }).filter({ visible: true })
    const activityTab = page.getByRole('tab', { name: '运行', exact: true }).filter({ visible: true })
    await activityRail.click()
    await expect(activityTab).toBeVisible()
    await activityRail.click()
    await expect(activityTab).toHaveCount(0)

    const browserRailAgain = page.getByRole('button', { name: '浏览器', exact: true }).filter({ visible: true })
    const browserTabAgain = page.getByRole('tab', { name: '浏览器', exact: true }).filter({ visible: true })
    await browserRailAgain.click()
    await expect(browserTabAgain).toBeVisible()
    const settingsRail = page.getByRole('button', { name: '设置', exact: true }).filter({ visible: true })
    await settingsRail.click()
    const settingsTab = page.getByRole('tab', { name: '设置', exact: true }).filter({ visible: true })
    await expect(settingsTab.locator('.flexlayout__tab_button_trailing')).toBeVisible()
    await browserRailAgain.click()
    await expect(browserTabAgain).toBeVisible()
    await browserRailAgain.click()
    await expect(browserTabAgain).toHaveCount(0)
    await settingsRail.click()
    await expect(settingsTab).toBeVisible()
    await page.getByRole('button', { name: '外观', exact: true }).click()
    await expect(page.getByRole('heading', { name: '界面主题', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '浅色', exact: true }).click()
    await expect(page.getByRole('button', { name: '浅色', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await settingsRail.click()
    await expect(settingsTab).toHaveCount(0)
    await settingsRail.click()
    await expect(settingsTab).toBeVisible()
    await settingsTab.locator('.flexlayout__tab_button_trailing').click()
    await expect(settingsTab).toHaveCount(0)

    await page.setViewportSize({ width: 390, height: 844 })
    await page.keyboard.press('Control+Shift+P')
    await expect(palette).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await page.screenshot({ path: `artifacts/${Date.now()}-mobile-command-palette.png` })
  } finally {
    fixture.api.disconnect()
  }
})

test('composer plus menu exposes mode and attachment capabilities', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    const plus = page.getByRole('button', { name: '添加能力', exact: true }).filter({ visible: true })
    await plus.click()
    await expect(page.getByRole('menu', { name: '会话能力', exact: true })).toBeVisible()
    for (const label of ['Goal 模式', 'Plan 模式', 'Budget 模式', '添加图片', '添加文件'])
      await expect(page.getByRole('menuitem', { name: label, exact: true })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Goal 模式', exact: true })).toBeDisabled()
    await expect(page.getByRole('menuitem', { name: '添加文件', exact: true })).toBeEnabled()

    const fileChooserPromise = page.waitForEvent('filechooser')
    await page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
    const fileChooser = await fileChooserPromise
    expect(fileChooser.isMultiple()).toBe(true)
    await fileChooser.setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('attachment') })
    await expect(page.locator('.attachment-chip-file')).toBeVisible()
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
    await expect.poll(async () => {
      const current = await fixture.api.call('system.bootstrap', {})
      return current.sessions.filter((session) => session.workspaceId === workspaceId).length
    }).toBe(countBefore + 1)
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
    const countBefore = (await fixture.api.call('system.bootstrap', {})).sessions.filter((session) => session.parentId === source.id).length

    await branch.dblclick()
    await expect.poll(async () => {
      const current = await fixture.api.call('system.bootstrap', {})
      return current.sessions.filter((session) => session.parentId === source.id).length
    }).toBe(countBefore + 1)
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
    await expect(page.getByRole('textbox', { name: '搜索模型', exact: true })).toBeVisible()
    await page.getByRole('textbox', { name: '搜索模型', exact: true }).fill('fixture')
    await expect(page.getByRole('menuitemradio', { name: /Local fixture/ })).toBeVisible()
    await page.getByRole('menuitemradio', { name: /Local fixture/ }).click()

    const permission = page.getByRole('button', { name: '询问', exact: true }).filter({ visible: true })
    await permission.click()
    await page.getByRole('menuitemradio', { name: /工作区自动执行/ }).click()
    await expect(page.getByRole('button', { name: '自动执行', exact: true }).filter({ visible: true })).toBeVisible()
    await expect.poll(async () => (await fixture.api.call('permission.get', {})).mode).toBe('allow')

    await page.reload()
    await expect(page.locator('.app-shell')).toBeVisible()
    await expect(page.getByRole('button', { name: '自动执行', exact: true }).filter({ visible: true })).toBeVisible()

    await page.getByRole('button', { name: '设置', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: '供应商与模型' })).toBeVisible()
    await page.getByRole('button', { name: '添加模型', exact: true }).click()
    const editor = page.getByRole('dialog', { name: '添加模型', exact: true })
    await expect(editor).toBeVisible()
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
    await page.getByRole('textbox', { name: '配对码' }).fill(pairing.code)
    await page.getByRole('button', { name: '配对并连接' }).click()
    await expect(page.locator('.app-shell')).toBeVisible()
    await send(page, '请检查当前项目')
    await expect(page.locator('.message-assistant')).toContainText('请检查当前项目')
    await send(page, '/tool write_file {"path":"approved.txt","text":"已批准"}')
    await expect(page.getByText('批准工具调用', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '批准', exact: true }).click()
    await expect(page.locator('.approval')).toHaveCount(0)
    await expect.poll(() => readFile(`${fixture.root}/approved.txt`, 'utf8').catch(() => '')).toBe('已批准')
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
    await page.getByRole('button', { name: 'sample.ts' }).click()
    await expect(page.locator('.cm-content')).toContainText('answer = 42')
    await page.locator('.mobile-nav').getByRole('button', { name: '设置', exact: true }).click()
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
    await page.getByRole('button', { name: '存储', exact: true }).filter({ visible: true }).click()
    await expect(page.getByRole('heading', { name: '存储目录', exact: true })).toBeVisible()
    const dataRoot = page.getByRole('textbox', { name: /数据目录/ })
    const cacheRoot = page.getByRole('textbox', { name: /缓存目录/ })
    await expect(dataRoot).not.toHaveValue('')
    await expect(cacheRoot).not.toHaveValue('')
    await page.getByRole('button', { name: '验证目录', exact: true }).click()
    await expect(page.locator('.path-details')).toContainText('hbar.sqlite')
    await page.screenshot({ path: `artifacts/${Date.now()}-desktop-storage-settings.png` })

    await page.getByRole('button', { name: '插件', exact: true }).filter({ visible: true }).click()
    await page.getByRole('button', { name: '检查', exact: true }).click()
    await expect(page.locator('.plugin-report')).toContainText('"ok": true')
    await page.locator('.plugin-expand').first().click()
    await expect(page.locator('.plugin-detail').first()).toContainText('包依赖')

    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('.mobile-nav').getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('button', { name: '存储', exact: true }).filter({ visible: true }).click()
    await expect(page.getByRole('heading', { name: '存储目录', exact: true })).toBeVisible()
    await page.screenshot({ path: `artifacts/${Date.now()}-mobile-storage-settings.png` })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  } finally {
    fixture.api.disconnect()
  }
})

test('terminal panel supports keyboard commands, concurrent sessions, approval and mobile layout', async ({
  page,
  context,
}) => {
  const fixture = await login(context, page)
  try {
    await page.keyboard.press('Control+Backquote')
    const terminal = page.locator('.terminal-panel').filter({ visible: true })
    await expect(terminal).toBeVisible()
    const input = terminal.getByRole('textbox', { name: '终端输入', exact: true })
    await input.fill('/he')
    await expect(terminal.getByRole('listbox', { name: '命令补全' })).toBeVisible()
    await input.press('Tab')
    await expect(input).toHaveValue('/help ')
    await input.press('Enter')
    await expect(terminal).toContainText('终端命令')

    await input.fill('//slow')
    await input.press('Enter')
    await expect(terminal.getByRole('button', { name: '停止运行', exact: true })).toBeVisible()
    const firstSession = await terminal.getByRole('combobox', { name: '终端 Session' }).inputValue()
    await input.fill('/new')
    await input.press('Enter')
    await expect(terminal.getByRole('combobox', { name: '终端 Session' })).not.toHaveValue(firstSession)
    await input.fill('来自第二个 Session')
    await input.press('Enter')
    await expect(terminal.locator('.terminal-assistant')).toContainText('来自第二个 Session')

    await terminal.getByRole('combobox', { name: '终端 Session' }).selectOption(firstSession)
    await expect(terminal.getByRole('button', { name: '停止运行', exact: true })).toBeVisible()
    await terminal.getByRole('button', { name: '停止运行', exact: true }).click()
    await expect(terminal.getByRole('button', { name: '停止运行', exact: true })).toHaveCount(0)

    await input.fill('//tool write_file {"path":"terminal-approved.txt","text":"ok"}')
    await input.press('Enter')
    await expect(terminal).toContainText('等待审批')
    await terminal.getByRole('button', { name: '批准', exact: true }).click()
    await expect.poll(() => readFile(`${fixture.root}/terminal-approved.txt`, 'utf8').catch(() => '')).toBe('ok')
    await expect(terminal.getByRole('button', { name: '停止运行', exact: true })).toHaveCount(0)
    await page.screenshot({ path: `artifacts/${Date.now()}-desktop-terminal.png` })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: '终端', exact: true }).filter({ visible: true }).first().click()
    await expect(page.locator('.terminal-panel').filter({ visible: true })).toBeVisible()
    const mobileTerminal = page.locator('.terminal-panel').filter({ visible: true })
    const mobileInput = mobileTerminal.getByRole('textbox', { name: '终端输入', exact: true })
    await mobileInput.fill('/quit')
    await mobileInput.press('Enter')
    await expect(page.locator('.terminal-panel').filter({ visible: true })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Terminal', exact: true }).filter({ visible: true }).click()
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
    await page.getByRole('button', { name: '终端', exact: true }).filter({ visible: true }).first().click()
    const terminal = page.locator('.terminal-panel').filter({ visible: true })
    const terminalInput = terminal.getByRole('textbox', { name: '终端输入', exact: true })
    await terminalInput.fill('/observer')
    await expect(terminal.getByRole('option', { name: /observer\.ping/ })).toBeVisible()
    await terminalInput.press('Tab')
    await terminalInput.press('Enter')
    await expect(terminal).toContainText('Observer Client plugin is active.')
    await page.getByRole('button', { name: 'Observer counter', exact: true }).click()
    await page.getByRole('button', { name: 'Increment counter' }).click()
    await expect(page.locator('.plugin-panel output')).toHaveText('1')
    await fixture.api.call('plugin.set', { id: 'hbar-example-observer', enabled: false })
    await expect(page.getByRole('button', { name: 'Observer counter', exact: true })).toHaveCount(0)
    await expect(page.locator('.plugin-panel output')).toHaveCount(0)
    const activeTerminal = page.locator('.terminal-panel').filter({ visible: true })
    if (!(await activeTerminal.isVisible())) await page.getByRole('tab', { name: '终端', exact: true }).click()
    await page
      .locator('.terminal-panel')
      .filter({ visible: true })
      .getByRole('textbox', { name: '终端输入' })
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
