import { expect, test, type Locator } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { z } from 'zod'
import { chatSearchCopy } from '../apps/web/src/chat-search-copy'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function removeFixture(root: string): Promise<void> {
  const exact = await realpath(root)
  if (dirname(exact) !== (await realpath(tmpdir())) || !basename(exact).startsWith('hbar-conversation-anchors-'))
    throw new Error('Refusing unowned anchor fixture cleanup')
  await rm(exact, { recursive: true, force: true })
}

async function aligned(viewport: Locator, messageId: string): Promise<boolean> {
  return viewport.evaluate((element, id) => {
    const row = [...element.querySelectorAll<HTMLElement>('[data-message-id]')].find(
      (item) => item.dataset.messageId === id,
    )
    if (!row) return false
    const gap = row.getBoundingClientRect().top - element.getBoundingClientRect().top - element.clientTop
    return Math.abs(gap) < Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  }, messageId)
}

const rpcCommand = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
})

for (const locale of ['zh-CN', 'en-US'] as const) {
  test(`real user anchors preview, page, seek virtual history and retain the draft: ${locale}`, async ({
    browser,
  }, info) => {
    test.setTimeout(90_000)
    const root = await mkdtemp(join(tmpdir(), 'hbar-conversation-anchors-'))
    const context = await browser.newContext({ locale, colorScheme: 'dark', viewport: { width: 1440, height: 960 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({
        root,
        port: Number(process.env.HBAR_E2E_HOST_PORT ?? 45642),
        historyCount: 180,
        goalAutoContinue: false,
        budgetAutoContinue: false,
      })
      const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 45641}`
      expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
      const page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const copy = getShellCopy(locale)
      await page.goto(base)
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      const rail = page.locator('.hbar-conversation-anchor-rail')
      const viewport = page.locator('.lumen-conversation-messages')
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      await expect(page.locator('[data-hbar-composer-session]')).toHaveAttribute(
        'data-hbar-composer-session',
        host.ready.sessionId,
      )
      await expect(prompt).toHaveAttribute('contenteditable', 'true')
      const draft = '保留这份未发送草稿 🧭 Keep this draft'
      await expect(page.getByRole('heading', { level: 1, name: host.ready.sessionTitle, exact: true })).toBeVisible()
      await expect(prompt).toBeEnabled()
      await prompt.focus()
      await page.keyboard.press('ControlOrMeta+A')
      await page.keyboard.insertText(draft)
      await expectComposerText(prompt, draft)
      await expect(rail).toHaveAttribute('aria-label', copy.session.anchors.navigation(25, 30, 30))
      expect(await rail.locator('[data-conversation-anchor]').count()).toBe(6)
      await rail.getByRole('button', { name: copy.session.anchors.previous, exact: true }).click()
      const first = rail.locator('[data-conversation-anchor="history-121"]')
      await expect(first).toBeVisible()
      await first.hover()
      const tooltip = page.getByRole('tooltip', { name: copy.session.anchors.preview, exact: true })
      await expect(tooltip).toContainText('History message 121')
      await expect(tooltip).toContainText('History message 122')
      expect(await tooltip.evaluate((element) => element.closest('.hbar-app-react-session-main') === null)).toBe(true)
      expect(await tooltip.evaluate((element) => getComputedStyle(element).textAlign)).toBe('start')
      await expect
        .poll(async () => {
          const markerBox = await first.boundingBox()
          const previewBox = await tooltip.boundingBox()
          if (!markerBox || !previewBox) return Infinity
          return Math.abs(markerBox.y + markerBox.height / 2 - (previewBox.y + previewBox.height / 2))
        })
        .toBeLessThan(16)
      await page.screenshot({ path: info.outputPath(`anchors-preview-${locale}-1440.png`) })
      await page.keyboard.press('Escape')
      await expect(tooltip).toHaveCount(0)
      await first.click()
      await expect.poll(() => aligned(viewport, 'history-121')).toBe(true)
      await expect(first).toHaveAttribute('aria-current', 'location')
      await expectComposerText(prompt, draft)

      await rail.getByRole('button', { name: copy.session.anchors.older, exact: true }).click()
      await expect(rail).toHaveAttribute('aria-label', copy.session.anchors.navigation(25, 48, 60))
      // The first item is now history-61, outside the original 60-message window.
      await rail.getByRole('button', { name: copy.session.anchors.previous, exact: true }).click()
      const earlier = rail.locator('[data-conversation-anchor="history-61"]')
      await earlier.click()
      await expect.poll(() => aligned(viewport, 'history-61')).toBe(true)
      await expectComposerText(prompt, draft)
      await earlier.focus()
      await page.keyboard.press('ArrowDown')
      await expect(rail.locator('[data-conversation-anchor="history-63"]')).toBeFocused()
      await page.keyboard.press('Enter')
      await expect.poll(() => aligned(viewport, 'history-63')).toBe(true)

      // A search has its own scroll owner; an anchor explicitly closes it.
      await page.getByRole('button', { name: copy.session.find.entry, exact: true }).click()
      await rail.locator('[data-conversation-anchor="history-65"]').click()
      await expect.poll(() => aligned(viewport, 'history-65')).toBe(true)
      await expect(page.locator('[data-session-find-bar]')).toHaveCount(0)

      // Moving through many anchors keeps the preview attached to its current marker.
      await rail.locator('[data-conversation-anchor="history-65"]').focus()
      await page.keyboard.press('End')
      await expect(rail.locator('[data-conversation-anchor="history-179"]')).toBeFocused()
      await expect(tooltip).toContainText('History message 179')
      await page.keyboard.press('Home')
      await expect(rail.locator('[data-conversation-anchor="history-61"]')).toBeFocused()
      await expect(tooltip).toContainText('History message 61')
      await page.keyboard.press('Escape')
      await rail.locator('[data-conversation-anchor="history-65"]').click()
      await expect.poll(() => aligned(viewport, 'history-65')).toBe(true)
      await expect(page.locator('.hbar-app-react-session-main')).toHaveAttribute('data-reading-restoring', 'false')

      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await expect(rail).toHaveCount(0)
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await expect.poll(() => aligned(viewport, 'history-65')).toBe(true)
      await expect(rail.locator('[aria-current="location"]')).toHaveAttribute('data-conversation-anchor', 'history-65')
      const other = await createWorkspaceSessionCommandClient(host.client).execute(
        'session.create',
        { workspaceId: host.ready.workspaceId, title: 'Empty conversation · 空会话' },
        { idempotencyKey: crypto.randomUUID() },
      )
      await page.getByRole('treeitem', { name: other.title, exact: true }).click()
      await expect(rail).toHaveCount(0)
      await expectComposerText(prompt, '')
      await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
      await expect.poll(() => aligned(viewport, 'history-65')).toBe(true)
      await expect(page.locator('.hbar-app-react-session-main')).toHaveAttribute('data-reading-restoring', 'false')
      await expectComposerText(prompt, draft)

      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 })
        const marker = rail.locator('[aria-current="location"]')
        await prompt.evaluate((element: HTMLElement) => element.focus({ preventScroll: true }))
        await marker.focus()
        await expect(tooltip).toBeVisible()
        const box = await tooltip.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.x).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width).toBeLessThanOrEqual(width)
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
        ).toBe(false)
        expect(await rail.locator('[data-conversation-anchor]').count()).toBeLessThanOrEqual(24)
        await page.screenshot({ path: info.outputPath(`anchors-preview-${locale}-${width}.png`) })
        await page.keyboard.press('Escape')
        await expect(tooltip).toHaveCount(0)
      }
      await expectComposerText(prompt, draft)
      expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)
      // Refresh reconstructs the rail from canonical history; no persisted index is required.
      await page.reload()
      await expect(rail.locator('[aria-current="location"]')).toHaveAttribute('data-conversation-anchor', 'history-179')
      expect(errors).toEqual([])
    } finally {
      if (host) await stopWebSessionHost(host)
      await context.close()
      await removeFixture(root)
    }
  })
}

test('one long Chinese and emoji turn has a bounded preview on desktop and narrow screens', async ({
  browser,
}, info) => {
  test.setTimeout(45_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-conversation-anchors-'))
  const context = await browser.newContext({
    locale: 'zh-CN',
    colorScheme: 'dark',
    viewport: { width: 1440, height: 960 },
  })
  let host: WebSessionHost | undefined
  try {
    const prefix = '中文👩🏽‍💻'
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 45642),
      historyCount: 2,
      historyText: prefix + '界'.repeat(4_000 - prefix.length),
      goalAutoContinue: false,
    })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 45641}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const copy = getShellCopy('zh-CN')
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    const rail = page.locator('.hbar-conversation-anchor-rail')
    const marker = rail.locator('[data-conversation-anchor="history-1"]')
    await expect(rail).toHaveAttribute('aria-label', copy.session.anchors.navigation(1, 1, 1))
    await expect(rail.locator('[data-conversation-anchor]')).toHaveCount(1)
    const tooltip = page.getByRole('tooltip', { name: copy.session.anchors.preview, exact: true })
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 })
      await page
        .getByRole('textbox', { name: copy.session.prompt.input, exact: true })
        .evaluate((element: HTMLElement) => element.focus({ preventScroll: true }))
      await marker.focus()
      await expect(tooltip).toBeVisible()
      await expect(tooltip.locator('strong')).toContainText(prefix)
      await expect(tooltip.locator('p')).toContainText(prefix)
      expect((await tooltip.locator('strong').textContent())?.length).toBeLessThan(180)
      expect((await tooltip.locator('p').textContent())?.length).toBeLessThan(300)
      expect(await tooltip.locator('p').evaluate((element) => getComputedStyle(element).webkitLineClamp)).toBe('none')
      expect(await tooltip.locator('p').evaluate((element) => getComputedStyle(element).overflowY)).toBe('auto')
      const box = await tooltip.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
      ).toBe(false)
      await page.screenshot({ path: info.outputPath(`anchors-long-${width}.png`) })
      await page.keyboard.press('Escape')
      await expect(tooltip).toHaveCount(0)
    }
    expect(errors).toEqual([])
  } finally {
    if (host) await stopWebSessionHost(host)
    await context.close()
    await removeFixture(root)
  }
})

test('conversation navigation retries a transient older-page failure before reaching the target', async ({
  browser,
}) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-conversation-anchors-'))
  const context = await browser.newContext({
    locale: 'zh-CN',
    colorScheme: 'dark',
    viewport: { width: 1440, height: 960 },
  })
  let host: WebSessionHost | undefined
  let failOlder = false
  let restoreArmed = false
  let injected = 0
  let restorationRequests = 0
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 45642),
      historyCount: 180,
      goalAutoContinue: false,
    })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 45641}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.routeWebSocket('**/rpc', (socket) => {
      const server = socket.connectToServer()
      socket.onMessage((message) => {
        let parsed: ReturnType<typeof rpcCommand.safeParse> | null = null
        if (typeof message === 'string') {
          try {
            parsed = rpcCommand.safeParse(JSON.parse(message))
          } catch {
            parsed = null
          }
        }
        const params = parsed?.success ? parsed.data.params : undefined
        if (
          parsed?.success &&
          parsed.data.method === 'session.snapshot' &&
          params &&
          params.sessionId === host?.ready.sessionId &&
          typeof params.before === 'number'
        ) {
          if (restoreArmed) restorationRequests += 1
          if (failOlder) {
            failOlder = false
            injected += 1
            socket.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: parsed.data.id,
                error: { code: -32603, message: 'Injected older-page read failure', data: 'READ_FAILED' },
              }),
            )
            return
          }
        }
        server.send(message)
      })
      server.onMessage((message) => socket.send(message))
    })
    const copy = getShellCopy('zh-CN')
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    const rail = page.locator('.hbar-conversation-anchor-rail')
    const viewport = page.locator('.lumen-conversation-messages')
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    await expect(page.locator('[data-hbar-composer-session]')).toHaveAttribute(
      'data-hbar-composer-session',
      host.ready.sessionId,
    )
    await expect(prompt).toHaveAttribute('contenteditable', 'true')
    const draft = '保留这份未发送草稿 🧭 Keep this draft'
    await prompt.focus()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.insertText(draft)
    await expectComposerText(prompt, draft)
    await rail.getByRole('button', { name: copy.session.anchors.previous, exact: true }).click()
    await rail.locator('[data-conversation-anchor="history-121"]').click()
    await expect.poll(() => aligned(viewport, 'history-121')).toBe(true)
    restoreArmed = true
    failOlder = true
    await rail.getByRole('button', { name: copy.session.anchors.older, exact: true }).click()
    await expect.poll(() => injected).toBe(1)
    await expect.poll(() => restorationRequests).toBeGreaterThan(0)
    await rail.getByRole('button', { name: copy.session.anchors.retryOlder, exact: true }).click()
    await expect(rail).toHaveAttribute('aria-label', copy.session.anchors.navigation(25, 48, 60))
    await rail.getByRole('button', { name: copy.session.anchors.previous, exact: true }).click()
    await rail.locator('[data-conversation-anchor="history-65"]').click()
    await expect.poll(() => aligned(viewport, 'history-65')).toBe(true)
    await expect(page.locator('.hbar-app-react-session-main')).toHaveAttribute('data-reading-restoring', 'false')
    await expect(rail).toHaveAttribute('aria-busy', 'false')
    await expect(rail).toHaveAttribute('aria-label', copy.session.anchors.navigation(1, 24, 60))
    await rail.getByRole('button', { name: copy.session.anchors.next, exact: true }).click()
    await expect(rail).toHaveAttribute('aria-label', copy.session.anchors.navigation(25, 48, 60))
    await rail.getByRole('button', { name: copy.session.anchors.previous, exact: true }).click()
    await expect(rail).toHaveAttribute('aria-label', copy.session.anchors.navigation(1, 24, 60))
    await rail.locator('[data-conversation-anchor="history-65"]').click()
    await expect.poll(() => aligned(viewport, 'history-65')).toBe(true)
    await expect(page.locator('.hbar-app-react-session-main')).toHaveAttribute('data-reading-restoring', 'false')
    await expectComposerText(prompt, draft)
    expect(pageErrors).toEqual([])
  } finally {
    if (host) await stopWebSessionHost(host)
    await context.close()
    await removeFixture(root)
  }
})

test('conversation reading automatically retries older history after a search jump failure', async ({ browser }) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-conversation-anchors-'))
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: { width: 1440, height: 960 },
  })
  let host: WebSessionHost | undefined
  let failOlder = false
  let injected = 0
  let olderReads = 0
  try {
    host = await startWebSessionHost({
      root,
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 45642),
      historyCount: 180,
      goalAutoContinue: false,
    })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 45641}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.routeWebSocket('**/rpc', (socket) => {
      const server = socket.connectToServer()
      socket.onMessage((message) => {
        let parsed: ReturnType<typeof rpcCommand.safeParse> | null = null
        if (typeof message === 'string') {
          try {
            parsed = rpcCommand.safeParse(JSON.parse(message))
          } catch {
            parsed = null
          }
        }
        const params = parsed?.success ? parsed.data.params : undefined
        if (
          parsed?.success &&
          parsed.data.method === 'session.snapshot' &&
          host &&
          params &&
          params.sessionId === host.ready.sessionId &&
          typeof params.before === 'number'
        ) {
          olderReads += 1
          if (failOlder) {
            failOlder = false
            injected += 1
            socket.send(
              JSON.stringify({
                jsonrpc: '2.0',
                id: parsed.data.id,
                error: { code: -32603, message: 'Injected older-page read failure', data: 'READ_FAILED' },
              }),
            )
            return
          }
        }
        server.send(message)
      })
      server.onMessage((message) => socket.send(message))
    })
    const copy = getShellCopy('en-US')
    const searchCopy = chatSearchCopy('en-US')
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    const draft = 'Keep this unsent search recovery draft'
    await page.goto(base)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    await expect(page.locator('[data-hbar-composer-session]')).toHaveAttribute(
      'data-hbar-composer-session',
      host.ready.sessionId,
    )
    await expect(prompt).toHaveAttribute('contenteditable', 'true')
    await prompt.focus()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.insertText(draft)
    await expectComposerText(prompt, draft)
    const initial = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })
    expect(initial.messages.map((message) => message.id).sort()).toEqual(
      Array.from({ length: 60 }, (_, index) => `history-${index + 121}`).sort(),
    )
    expect(initial.messages.some((message) => message.id === 'history-64')).toBe(false)
    await expect(page.locator('[data-message-id="history-180"]')).toBeVisible()
    await expect(page.locator('[data-message-id="history-64"]')).toHaveCount(0)

    await page.getByRole('button', { name: copy.shell.searchChats, exact: true }).click()
    const dialog = page.locator('.hbar-app-react-chat-search-dialog[role="dialog"]')
    const input = dialog.getByRole('combobox', { name: searchCopy.search, exact: true })
    await expect(input).toBeFocused()
    await input.fill('History message 64')
    const result = dialog.getByRole('option')
    await expect(result).toHaveCount(1)
    failOlder = true
    await result.click()

    const viewport = page.locator('.lumen-conversation-messages')
    await expect.poll(() => injected).toBe(1)
    await expect.poll(() => olderReads).toBeGreaterThan(1)
    await expect.poll(() => aligned(viewport, 'history-64')).toBe(true)
    await expect(page.locator('.hbar-app-react-session-main')).toHaveAttribute('data-reading-restoring', 'false')
    await expectComposerText(prompt, draft)
    expect(pageErrors).toEqual([])
  } finally {
    if (host) await stopWebSessionHost(host)
    await context.close()
    await removeFixture(root)
  }
})
