import { expect, test, type Page } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { z } from 'zod'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { scrollToHistoryTop } from './support/session-history-scroll'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const requestSchema = z
  .object({
    id: z.union([z.number(), z.string()]).optional(),
    method: z.string().optional(),
    params: z.object({ sessionId: z.string().optional(), before: z.number().optional() }).passthrough().optional(),
  })
  .passthrough()

async function removeFixture(root: string) {
  const exact = await realpath(root)
  if (
    dirname(exact).toLowerCase() !== (await realpath(tmpdir())).toLowerCase() ||
    !basename(exact).startsWith('hbar-history-scroll-')
  )
    throw new Error('Refusing cleanup outside the owned history fixture')
  await rm(exact, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

async function historyGate(page: Page) {
  const reads: { readonly sessionId: string; readonly before: number }[] = []
  let hold = false
  let fail = false
  let release: (() => void) | undefined
  let blocked = false
  let disconnect: (() => Promise<void>) | undefined
  await page.routeWebSocket('**/rpc', (socket) => {
    if (blocked) {
      void socket.close({ code: 1012, reason: 'Owned history test is offline' }).catch(() => undefined)
      return
    }
    const remote = socket.connectToServer()
    disconnect = async () => {
      await Promise.all([socket.close({ code: 1012, reason: 'Owned history test disconnects' }), remote.close()])
    }
    socket.onMessage((message) => {
      const value: unknown = typeof message === 'string' ? JSON.parse(message) : null
      const request = requestSchema.safeParse(value)
      if (request.success && request.data.method === 'session.snapshot' && request.data.params?.before !== undefined) {
        const { params, id } = request.data
        reads.push({ sessionId: params.sessionId ?? '', before: params.before! })
        if (fail) {
          fail = false
          socket.send(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: 'PAGE_UNAVAILABLE' } }))
          return
        }
        if (hold) {
          release = () => remote.send(message)
          return
        }
      }
      remote.send(message)
    })
    remote.onMessage((message) => socket.send(message))
  })
  return {
    reads,
    hold() {
      hold = true
    },
    release() {
      hold = false
      release?.()
      release = undefined
    },
    failNext() {
      fail = true
    },
    async offline() {
      blocked = true
      await disconnect?.()
    },
    online() {
      blocked = false
    },
  }
}

async function reading(page: Page, messageId: string | null = null) {
  return page.locator('.lumen-conversation-messages').evaluate((element, id) => {
    const top = element.getBoundingClientRect().top + element.clientTop
    const row = [...element.querySelectorAll<HTMLElement>('[data-message-id]')].find((item) =>
      id
        ? item.dataset.messageId === id
        : item.getBoundingClientRect().bottom > top &&
          item.getBoundingClientRect().top < element.getBoundingClientRect().bottom,
    )
    return { id: row?.dataset.messageId ?? null, offset: row ? row.getBoundingClientRect().top - top : null }
  }, messageId)
}

for (const [locale, width] of [
  ['zh-CN', 1440],
  ['en-US', 320],
] as const)
  test(`upward top scrolling loads once, preserves the reader and exposes local retry: ${locale} ${width}`, async ({
    browser,
  }, info) => {
    test.setTimeout(60_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-history-scroll-'))
    const context = await browser.newContext({ locale, colorScheme: 'dark', viewport: { width, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 45944),
        historyCount: 240,
        goalAutoContinue: false,
      })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 45943}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      page.setDefaultTimeout(10_000)
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const gate = await historyGate(page)
      const copy = getShellCopy(locale)
      await page.goto(base)
      if (width === 320) await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const viewport = page.locator('.lumen-conversation-messages')
      const list = viewport.locator('[data-hbar-app-ui-message-count]')
      const input = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      const draft = '保留这份历史阅读草稿 🧭 Keep this draft'
      await input.fill(draft)
      await expect(list).toHaveAttribute('data-hbar-app-ui-message-count', '60')
      await expect(viewport.locator('[data-message-id="history-240"]')).toBeVisible()
      await expect(page.getByRole('button', { name: copy.session.loadOlder, exact: true })).toHaveCount(0)
      expect(gate.reads).toHaveLength(0)

      gate.hold()
      await scrollToHistoryTop(page)
      await expect(viewport.getByRole('status').filter({ hasText: copy.session.loadingOlder })).toBeVisible()
      await expect.poll(() => gate.reads.length).toBe(1)
      const before = await reading(page)
      expect(before.id).not.toBeNull()
      await scrollToHistoryTop(page)
      expect(gate.reads).toHaveLength(1)
      await page.screenshot({ path: info.outputPath(`history-loading-${width}.png`) })
      gate.release()
      await expect(list).toHaveAttribute('data-hbar-app-ui-message-count', '120')
      await expect(viewport.getByText(copy.session.loadingOlder, { exact: true })).toHaveCount(0)
      // A newly prepended row can become visible in the old top padding.
      // Preserve the original message's geometry, not the identity of that padding.
      await expect.poll(async () => (await reading(page, before.id)).id).toBe(before.id)
      await expect
        .poll(async () => Math.abs(((await reading(page, before.id)).offset ?? 0) - (before.offset ?? 0)))
        .toBeLessThan(16)
      expect(gate.reads).toHaveLength(1)
      await expect(page.locator('.hbar-app-react-session-main')).toHaveAttribute('data-reading-restoring', 'false')
      await expect(viewport.getByText(copy.session.readingPositionUnavailable, { exact: true })).toHaveCount(0)
      await expectComposerText(input, draft)

      gate.failNext()
      await scrollToHistoryTop(page)
      const retry = viewport.getByRole('button', { name: copy.session.retryHistory, exact: true })
      await expect(retry).toBeVisible()
      expect(gate.reads).toHaveLength(2)
      await scrollToHistoryTop(page)
      expect(gate.reads).toHaveLength(2)
      await retry.click()
      await expect(list).toHaveAttribute('data-hbar-app-ui-message-count', '180')
      await expect(retry).toHaveCount(0)
      await expectComposerText(input, draft)

      await gate.offline()
      await expect(
        page.locator('.hbar-composer-primary-notice').getByText(copy.session.disconnected, { exact: true }),
      ).toBeVisible()
      await scrollToHistoryTop(page)
      expect(gate.reads).toHaveLength(3)
      gate.online()
      await expect(
        page.locator('.hbar-composer-primary-notice').getByText(copy.session.disconnected, { exact: true }),
      ).toHaveCount(0)
      await expect(list).toHaveAttribute('data-hbar-app-ui-message-count', '180')

      // Only the original Session owns a delayed older page.
      const other = await createWorkspaceSessionCommandClient(host.client).execute(
        'session.create',
        {
          workspaceId: host.ready.workspaceId,
          title: 'Empty history — 空历史',
        },
        { idempotencyKey: crypto.randomUUID() },
      )
      gate.hold()
      await scrollToHistoryTop(page)
      await expect.poll(() => gate.reads.length).toBe(4)
      if (width === 320) await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
      await page.getByRole('treeitem', { name: other.title, exact: true }).click()
      gate.release()
      await expect(viewport.locator('[data-message-id]')).toHaveCount(0)
      await expectComposerText(input, '')
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
      ).toBe(false)
      expect(errors).toEqual([])
    } finally {
      if (host) await stopWebSessionHost(host)
      await context.close()
      await removeFixture(root)
    }
  })

test('programmatic seeks and draft keys do not page; Home in the reader loads the final page once', async ({
  browser,
}, info) => {
  test.setTimeout(45_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-history-scroll-'))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 390, height: 844 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 45944),
      historyCount: 100,
      goalAutoContinue: false,
    })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 45943}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    page.setDefaultTimeout(10_000)
    const copy = getShellCopy('zh-CN')
    const gate = await historyGate(page)
    await page.goto(base)
    await page.getByRole('button', { name: copy.shell.showSidebar, exact: true }).click()
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    const viewport = page.locator('.lumen-conversation-messages')
    const list = viewport.locator('[data-hbar-app-ui-message-count]')
    await expect(viewport.locator('[data-message-id="history-100"]')).toBeVisible()
    const input = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await input.fill('未发送草稿')
    await page.keyboard.press('Home')
    expect(gate.reads).toHaveLength(0)
    // A previous upward gesture must not carry into an explicit message seek.
    const previousTop = await viewport.evaluate((element) => element.scrollTop)
    await viewport.hover()
    await page.mouse.wheel(0, -100)
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeLessThan(previousTop)
    const rail = page.locator('.hbar-conversation-anchor-rail')
    await rail.getByRole('button', { name: copy.session.anchors.previous, exact: true }).click()
    await rail.locator('[data-conversation-anchor="history-41"]').click()
    await expect(viewport.locator('[data-message-id="history-41"]')).toBeVisible()
    await expect(page.locator('.hbar-app-react-session-main')).toHaveAttribute('data-reading-restoring', 'false')
    expect(gate.reads).toHaveLength(0)
    const copyButton = viewport.locator('[data-message-id="history-42"] button').first()
    await copyButton.evaluate((element: HTMLElement) => element.focus({ preventScroll: true }))
    await page.keyboard.press('Home')
    await expect(list).toHaveAttribute('data-hbar-app-ui-message-count', '100')
    expect(gate.reads).toHaveLength(1)
    await expect(viewport.getByText(copy.session.loadOlder, { exact: true })).toHaveCount(0)
    await expect(page.locator('.hbar-app-react-session-main')).toHaveAttribute('data-reading-restoring', 'false')
    await scrollToHistoryTop(page)
    await expect(viewport.locator('[data-message-id="history-1"]')).toBeVisible()
    expect(gate.reads).toHaveLength(1)
    await expectComposerText(input, '未发送草稿')
    expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(
      false,
    )
    await page.screenshot({ path: info.outputPath('history-final-page-390.png') })
  } finally {
    if (host) await stopWebSessionHost(host)
    await context.close()
    await removeFixture(root)
  }
})
