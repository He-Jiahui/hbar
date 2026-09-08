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
    await page.reload()
    await expect(page.locator('.app-shell')).toBeVisible()
    await expect(page.getByRole('tab', { name: '请检查当前项目', exact: true })).toHaveCount(0)
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

test('a client plugin adds an interactive panel and unloads it without a core edit', async ({ page, context }) => {
  const fixture = await login(context, page)
  try {
    await expect.poll(async () => (await fixture.api.call('system.bootstrap', {})).host.activeRuns).toBe(0)
    await fixture.api.call('plugin.install', { path: resolve('examples/observer') })
    await expect(page.getByRole('button', { name: 'Observer counter', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Observer counter', exact: true }).click()
    await page.getByRole('button', { name: 'Increment counter' }).click()
    await expect(page.locator('.plugin-panel output')).toHaveText('1')
    await fixture.api.call('plugin.set', { id: 'example.observer', enabled: false })
    await expect(page.getByRole('button', { name: 'Observer counter', exact: true })).toHaveCount(0)
    await expect(page.locator('.plugin-panel output')).toHaveCount(0)
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
