import { expect, test, type Page } from '@playwright/test'
import {
  createChatDatabaseCommandClient,
  createSettingsCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { chatSearchCopy } from '../apps/web/src/chat-search-copy'
import { workspaceTabsCopy } from '../apps/web/src/workspace-tabs-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { expectComposerText } from './support/composer-text'

async function removeFixture(root: string) {
  const exact = await realpath(root)
  if (
    dirname(exact).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(exact).startsWith('hbar-chat-browser-')
  )
    throw new Error('Refusing cleanup outside owned chat deletion fixture')
  await rm(exact, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

async function connectionGate(page: Page) {
  let blocked = false
  let disconnect: (() => Promise<void>) | undefined
  await page.routeWebSocket('**/rpc', (socket) => {
    if (blocked) {
      void socket.close({ code: 1012, reason: 'Owned deletion test is offline' }).catch(() => undefined)
      return
    }
    const remote = socket.connectToServer()
    socket.onMessage((message) => remote.send(message))
    remote.onMessage((message) => socket.send(message))
    disconnect = async () => {
      await Promise.all([socket.close({ code: 1012, reason: 'Owned deletion test disconnects' }), remote.close()])
    }
  })
  return {
    async offline() {
      blocked = true
      await disconnect?.()
    },
    online() {
      blocked = false
    },
  }
}

async function cleanSession(host: WebSessionHost, sessionId: string) {
  const commands = createChatDatabaseCommandClient(host.client)
  const preview = await commands.execute(
    'chatDatabase.preview',
    { kind: 'sessions', scope: { kind: 'session', targetId: sessionId } },
    { idempotencyKey: crypto.randomUUID() },
  )
  await expect
    .poll(async () => (await commands.execute('chatDatabase.operation', { operationId: preview.operationId })).status)
    .toBe('completed')
  const candidates = await commands.execute('chatDatabase.previewPage', { previewId: preview.operationId })
  expect(candidates.items.map((item) => item.id)).toEqual([sessionId])
  const operation = await commands.execute(
    'chatDatabase.cleanup',
    { previewId: preview.operationId },
    { idempotencyKey: crypto.randomUUID() },
  )
  await expect
    .poll(async () => (await commands.execute('chatDatabase.operation', { operationId: operation.operationId })).status)
    .toBe('completed')
  expect((await commands.execute('chatDatabase.operation', { operationId: operation.operationId })).deletedCount).toBe(
    1,
  )
}

test('real cleanup removes sidebar and search facts, retains both drafts and tabs, and recovers missed deletion after reconnect', async ({
  browser,
}, info) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-chat-browser-'))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      fixture: 'chat-deletion',
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
    })
    const settings = createSettingsCommandClient(host.client)
    const scope = { kind: 'global' as const }
    const before = await settings.execute('settings.get', { scope })
    await settings.execute(
      'settings.apply',
      {
        schemaVersion: 1,
        scope,
        baselineRevisions: before.revisions,
        changes: [{ op: 'set', path: [{ kind: 'field', name: 'chatDatabase.archivedOnly' }], value: false }],
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    const directory = createWorkspaceSessionCommandClient(host.client)
    const other = (await directory.execute('session.list', { workspaceId: host.ready.workspaceId })).items.find(
      (item) => item.title === 'Kept chat — 其他聊天',
    )
    if (!other) throw new Error('Missing second deletion fixture chat')
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const gate = await connectionGate(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const copy = getShellCopy('zh-CN')
    const searchCopy = chatSearchCopy('zh-CN')
    const tabCopy = workspaceTabsCopy((zh) => zh)
    const composer = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    await expect(page.getByText(`Actual saved history in ${host.ready.sessionTitle}`, { exact: true })).toBeVisible()
    await composer.fill('保留第一个聊天的未发送草稿')
    await page.locator('input[type="file"]').setInputFiles({
      name: 'deleted-chat-draft.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Unsent attachment must survive chat deletion'),
    })
    await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'deleted-chat-draft.txt' })).toBeVisible()
    await page.getByRole('treeitem', { name: other.title, exact: true }).click()
    await composer.fill('保留另一个聊天的离线草稿')
    await page.getByRole('button', { name: copy.shell.searchChats, exact: true }).click()
    const search = page.getByRole('combobox', { name: searchCopy.search, exact: true })
    await search.fill('Database monitor chat')
    const dialog = page.locator('.hbar-app-react-chat-search-dialog[role="dialog"]')
    await expect(dialog.locator('.hbar-chat-search-row')).toHaveCount(2)
    await expect(search).toBeFocused()
    await cleanSession(host, host.ready.sessionId)
    await expect(dialog.locator('.hbar-chat-search-row')).toHaveCount(0)
    await expect(dialog.getByText(searchCopy.empty, { exact: true })).toBeVisible()
    await expect(search).toHaveValue('Database monitor chat')
    await expect(search).toBeFocused()
    await expect(page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true })).toHaveCount(0)
    await expect(page.getByRole('treeitem', { name: other.title, exact: true })).toBeVisible()
    await search.press('Escape')
    await expectComposerText(composer, '保留另一个聊天的离线草稿')
    await page.getByRole('tab', { name: tabCopy.unknownSession(host.ready.sessionId), exact: true }).click()
    await expect(page.getByText(copy.session.error('SESSION_DELETED'), { exact: true })).toBeVisible()
    await expect(page.getByText(`Actual saved history in ${host.ready.sessionTitle}`, { exact: true })).toHaveCount(0)
    await expectComposerText(composer, '保留第一个聊天的未发送草稿')
    await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'deleted-chat-draft.txt' })).toBeVisible()
    const database = createChatDatabaseCommandClient(host.client)
    const drafts = await database.execute('chatDatabase.draft.list', {})
    expect(drafts.items.some((owner) => owner.kind === 'session' && owner.artifactIds.length === 1)).toBe(true)
    await expect(page.locator('[data-session-deleted] [role="alert"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: copy.session.prompt.send, exact: true })).toBeDisabled()
    await page.screenshot({ path: info.outputPath('deleted-chat-draft-zh.png') })
    await composer.fill('清理后仍可编辑的原窗口草稿')
    await expectComposerText(composer, '清理后仍可编辑的原窗口草稿')
    await page
      .getByRole('button', {
        name: copy.session.prompt.removeAttachment({ id: '', kind: 'file', name: 'deleted-chat-draft.txt' }),
        exact: true,
      })
      .click()
    await expect(page.locator('.lumen-attachment-chip').filter({ hasText: 'deleted-chat-draft.txt' })).toHaveCount(0)
    await expect
      .poll(async () =>
        (await database.execute('chatDatabase.draft.list', {})).items.every((owner) => owner.artifactIds.length === 0),
      )
      .toBe(true)
    await page.getByRole('tab', { name: other.title, exact: true }).click()
    await expect(page.getByText(`Actual saved history in ${other.title}`, { exact: true })).toBeVisible()
    await gate.offline()
    await cleanSession(host, other.id)
    await expectComposerText(composer, '保留另一个聊天的离线草稿')
    gate.online()
    await expect(page.getByText(copy.session.error('SESSION_DELETED'), { exact: true })).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByRole('tab', { name: tabCopy.unknownSession(other.id), exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expectComposerText(composer, '保留另一个聊天的离线草稿')
    await expect(page.getByRole('tab')).toHaveCount(2)
    await expect(page.locator('[data-session-deleted] [role="alert"]')).toHaveCount(0)
    await page.setViewportSize({ width: 320, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await expectComposerText(composer, '保留另一个聊天的离线草稿')
    await page.screenshot({ path: info.outputPath('deleted-chats-zh.png') })
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await removeFixture(root)
  }
})
