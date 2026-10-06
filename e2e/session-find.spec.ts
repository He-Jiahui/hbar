import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { createRunCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { openSessionTool } from './support/session-tools-menu'

const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 45157}`
const port = Number(process.env.HBAR_E2E_HOST_PORT ?? 45158)
const evidence = 'artifacts/session-find/browser'
const fixturePrefix = 'hbar-session-find-'
const expectedAsset = process.env.HBAR_E2E_EXPECT_ASSET
const draft = 'Unsent find boundary — 查找不得搜索或发送原草稿'
const attachmentName = 'find-unsent-material-原附件.md'
const rpcSchema = z
  .object({
    method: z.string().optional(),
    params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
  })
  .passthrough()
const writeCommands = new Set([
  'run.submit',
  'run.retry',
  'operation.cancel',
  'settings.apply',
  'file.write',
  'goal.set',
  'plan.set',
])

interface Fixture {
  readonly root: string
  readonly host: WebSessionHost
  readonly context: BrowserContext
  readonly page: Page
  readonly copy: ReturnType<typeof getShellCopy>
  readonly errors: string[]
  readonly requests: string[]
  readonly uploads: string[]
  readonly productionAsset: string
  readonly consoleDiagnostics: { readonly type: string; readonly text: string }[]
}

test.beforeAll(() => mkdir(evidence, { recursive: true }))

async function removeFixtureRoot(root: string): Promise<void> {
  const resolved = await realpath(root)
  if (dirname(resolved) !== (await realpath(tmpdir())) || !basename(resolved).startsWith(fixturePrefix))
    throw new Error('Refusing cleanup outside this session Find fixture')
  await rm(resolved, { recursive: true, force: true })
}

async function start(browser: Browser, locale: ShellLocale, width: number): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), fixturePrefix))
  const context = await browser.newContext({ locale, viewport: { width, height: width === 320 ? 844 : 960 } })
  let host: WebSessionHost | undefined
  try {
    // Real demo Kernel/Host, with 180 deliberately synthetic canonical stored
    // messages. Only the streaming case submits a Run to its local fixture model.
    host = await startWebSessionHost({ root, port, sessionCount: 2, historyCount: 180, goalAutoContinue: false })
    expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    const errors: string[] = []
    const requests: string[] = []
    const uploads: string[] = []
    const consoleDiagnostics: { type: string; text: string }[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'warning' || message.type() === 'error')
        consoleDiagnostics.push({ type: message.type(), text: message.text() })
      if (consoleDiagnostics.length > 200)
        throw new Error('Session Find console diagnostics exceeded the fixture bound')
    })
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/artifacts') uploads.push('upload')
    })
    page.on('websocket', (socket) =>
      socket.on('framesent', ({ payload }) => {
        if (typeof payload !== 'string') return
        const raw: unknown = JSON.parse(payload)
        const parsed = rpcSchema.safeParse(raw)
        if (!parsed.success) return
        const name = parsed.data.params?.commandId ?? parsed.data.method
        if (name) requests.push(name)
        if (requests.length > 2000) throw new Error('Session Find fixture exceeded its RPC observation bound')
      }),
    )
    const copy = getShellCopy(locale)
    await page.goto(origin)
    const productionAsset = await page.locator('script[type="module"][src]').getAttribute('src')
    if (!productionAsset) throw new Error('The production application module asset is missing')
    if (expectedAsset) expect(new URL(productionAsset, origin).pathname.split('/').at(-1)).toBe(expectedAsset)
    const fixture = { root, host, context, page, copy, errors, requests, uploads, productionAsset, consoleDiagnostics }
    await showSidebar(fixture, true)
    await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
    await showSidebar(fixture, false)
    await expect(page.locator('[data-hbar-app-ui-list-strategy="virtualized"]')).toHaveAttribute(
      'data-hbar-app-ui-message-count',
      '60',
    )
    await expect(page.locator('[data-message-id="history-180"]')).toBeVisible()
    return fixture
  } catch (error) {
    await context.close()
    if (host) {
      await stopWebSessionHost(host)
      const owned = host
      await expect.poll(() => owned.child.exitCode !== null || owned.child.signalCode !== null).toBe(true)
      await removeFixtureRoot(root)
    }
    throw error
  }
}

async function stop(fixture: Fixture): Promise<void> {
  const errors: unknown[] = []
  try {
    await fixture.context.close()
  } catch (error) {
    errors.push(error)
  }
  try {
    await stopWebSessionHost(fixture.host)
    if (fixture.host.child.exitCode === null && fixture.host.child.signalCode === null)
      throw new Error('This Find fixture Host has not exited; its temporary root is retained')
    await removeFixtureRoot(fixture.root)
  } catch (error) {
    errors.push(error)
  }
  if (errors.length) throw new AggregateError(errors, 'Find fixture cleanup did not fully finish')
}

async function showSidebar({ page, copy }: Fixture, open: boolean): Promise<void> {
  const trigger = page.getByRole('button', {
    name: open ? copy.shell.showSidebar : copy.shell.hideSidebar,
    exact: true,
  })
  if (await trigger.isVisible()) await trigger.click()
  await expect(page.locator('[data-hbar-sidebar-expanded]')).toHaveAttribute('data-hbar-sidebar-expanded', String(open))
}

function findControls({ page, copy }: Fixture) {
  const bar = page.getByRole('search', { name: copy.session.find.title, exact: true })
  return {
    bar,
    entry: page.getByRole('button', { name: copy.session.find.entry, exact: true }),
    input: bar.getByRole('searchbox', { name: copy.session.find.input, exact: true }),
    count: bar.getByRole('status'),
    previous: bar.getByRole('button', { name: copy.session.find.previous, exact: true }),
    next: bar.getByRole('button', { name: copy.session.find.next, exact: true }),
    close: bar.getByRole('button', { name: copy.session.find.close, exact: true }),
  }
}

async function openFind({ page, copy }: Fixture): Promise<Locator> {
  const entry = page.getByRole('button', { name: copy.session.find.entry, exact: true })
  if (await entry.isVisible()) {
    await entry.click()
    return entry
  }
  const trigger = page.locator('.hbar-mobile-header-menu-trigger')
  await trigger.click()
  await page
    .locator('.hbar-mobile-header-menu-content')
    .getByRole('button', { name: copy.session.find.entry, exact: true })
    .click()
  return trigger
}

async function activeHighlights(page: Page) {
  return page.evaluate(() => {
    const active = CSS.highlights.get('hbar-session-find-active')
    return [...(active ?? [])].flatMap((range) => {
      if (!(range instanceof Range)) return []
      const rect = range.getBoundingClientRect()
      const row = range.startContainer.parentElement?.closest<HTMLElement>('[data-message-id]')
      const viewport = row?.closest('.lumen-conversation-messages')?.getBoundingClientRect()
      const fragments = [...range.getClientRects()].filter((fragment) => fragment.width > 0 && fragment.height > 0)
      return [
        {
          text: range.toString(),
          messageId: row?.dataset.messageId ?? null,
          top: rect.top,
          visible:
            !!viewport &&
            rect.width > 0 &&
            rect.height > 0 &&
            fragments.length > 0 &&
            fragments.every((fragment) => {
              const hit = document.elementFromPoint(
                fragment.left + fragment.width / 2,
                fragment.top + fragment.height / 2,
              )
              return (
                fragment.top >= viewport.top - 1 &&
                fragment.bottom <= viewport.bottom + 1 &&
                fragment.left >= viewport.left - 1 &&
                fragment.right <= viewport.right + 1 &&
                !!hit &&
                !!row?.contains(hit)
              )
            }),
        },
      ]
    })
  })
}

async function expectMatch(page: Page, messageId: string, text: string): Promise<void> {
  await expect
    .poll(async () => {
      const highlights = await activeHighlights(page)
      return {
        text: highlights.map((range) => range.text).join(''),
        matched: highlights.length > 0 && highlights.every((range) => range.messageId === messageId && range.visible),
      }
    })
    .toEqual({ text, matched: true })
}

async function horizontalMatchGeometry(page: Page) {
  return page.evaluate(() => {
    const ranges = [...(CSS.highlights.get('hbar-session-find-active') ?? [])].filter(
      (range): range is Range => range instanceof Range,
    )
    return ranges.map((range) => {
      const fragments = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0)
      const clips: Array<{
        tag: string
        overflow: string
        left: number
        right: number
        scrollLeft: number
        clientWidth: number
        scrollWidth: number
        containsMatch: boolean
      }> = []
      let ancestor = range.startContainer.parentElement
      while (ancestor) {
        const overflow = getComputedStyle(ancestor).overflowX
        if (['auto', 'scroll', 'hidden', 'clip'].includes(overflow)) {
          const box = ancestor.getBoundingClientRect()
          const left = box.left + ancestor.clientLeft
          const right = left + ancestor.clientWidth
          clips.push({
            tag: ancestor.tagName,
            overflow,
            left,
            right,
            scrollLeft: ancestor.scrollLeft,
            clientWidth: ancestor.clientWidth,
            scrollWidth: ancestor.scrollWidth,
            containsMatch: fragments.every((rect) => rect.left >= left - 1 && rect.right <= right + 1),
          })
        }
        ancestor = ancestor.parentElement
      }
      return { text: range.toString(), clips }
    })
  })
}

async function unchangedOuterScroll(page: Page) {
  return page.evaluate(() => ({
    windowX: window.scrollX,
    windowY: window.scrollY,
    documentX: document.scrollingElement?.scrollLeft ?? null,
    documentY: document.scrollingElement?.scrollTop ?? null,
    composer: [...document.querySelectorAll<HTMLElement>('.lumen-prompt-composer,.hbar-app-react-session-footer')].map(
      (element) => ({ x: element.scrollLeft, y: element.scrollTop }),
    ),
  }))
}

async function expectBarGeometry(fixture: Fixture): Promise<void> {
  const { bar } = findControls(fixture)
  await expect(bar).toBeVisible()
  await expect
    .poll(() =>
      bar.evaluate((element) => {
        const bounds = element.getBoundingClientRect()
        const pane = element.closest('.hbar-app-react-session-workspace')?.getBoundingClientRect()
        if (!pane) return false
        const controls = [...element.querySelectorAll<HTMLElement>('input,button')]
        return (
          bounds.left >= pane.left - 1 &&
          bounds.right <= pane.right + 1 &&
          bounds.left >= 0 &&
          bounds.right <= innerWidth + 1 &&
          controls.every((control) => {
            const box = control.getBoundingClientRect()
            const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
            return (
              box.width > 0 &&
              box.height > 0 &&
              box.left >= bounds.left - 1 &&
              box.right <= bounds.right + 1 &&
              !!hit &&
              control.contains(hit)
            )
          }) &&
          document.documentElement.scrollWidth <= innerWidth + 1
        )
      }),
    )
    .toBe(true)
}

async function attachUnsentMaterial({ page }: Fixture): Promise<void> {
  const data = await page.evaluateHandle((name) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['Original unsent attachment contents'], name, { type: 'text/markdown' }))
    return transfer
  }, attachmentName)
  try {
    await page.locator('.hbar-composer-attachment-target').dispatchEvent('drop', { dataTransfer: data })
  } finally {
    await data.dispose()
  }
  await expect(page.locator('.lumen-attachment-chip').filter({ hasText: attachmentName })).toBeVisible()
}

/**
 * Real keyboard dispatch reaches the application first. This final Window bubble
 * observer records whether the app consumed Ctrl+F, then suppresses browser chrome
 * Find so the next assertion stays in the page. It does not open/close any app UI.
 */
async function expectShortcutLeftToOtherSurface(page: Page): Promise<void> {
  const observation = 'data-hbar-find-shortcut-observation'
  // Await listener installation before dispatching the real keyboard event.
  await page.evaluate((attribute) => {
    document.documentElement.setAttribute(attribute, 'pending')
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'f' || !(event.ctrlKey || event.metaKey)) return
      clearTimeout(timer)
      window.removeEventListener('keydown', onKey)
      document.documentElement.setAttribute(attribute, event.defaultPrevented ? 'consumed' : 'unclaimed')
      event.preventDefault()
    }
    const timer = setTimeout(() => {
      window.removeEventListener('keydown', onKey)
      document.documentElement.setAttribute(attribute, 'missing')
    }, 3000)
    window.addEventListener('keydown', onKey)
  }, observation)
  try {
    await page.keyboard.press('Control+f')
    await expect(page.locator('html')).toHaveAttribute(observation, 'unclaimed')
    await expect(page.locator('[data-session-find-bar]')).toHaveCount(0)
  } finally {
    await page.locator('html').evaluate((element, attribute) => element.removeAttribute(attribute), observation)
  }
}

async function record(fixture: Fixture, name: string, extra: object = {}): Promise<void> {
  await writeFile(
    `${evidence}/${name}.json`,
    JSON.stringify(
      {
        actualHost: true,
        fixture: '180 synthetic canonical stored messages; local-fixture model only',
        browserWrites: fixture.requests.filter((request) => writeCommands.has(request)),
        browserSnapshots: fixture.requests.filter((request) => request === 'session.snapshot').length,
        artifactUploads: fixture.uploads.length,
        productionAsset: fixture.productionAsset,
        consoleDiagnostics: fixture.consoleDiagnostics,
        errors: fixture.errors,
        ...extra,
      },
      null,
      2,
    ),
  )
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const width of [1440, 320]) {
    test(`conversation Find covers loaded virtual history without fetching or changing drafts: ${locale} ${width}`, async ({
      browser,
    }) => {
      test.setTimeout(180_000)
      const fixture = await start(browser, locale, width)
      const { page, host, copy } = fixture
      const find = findControls(fixture)
      const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
      try {
        await prompt.fill(draft)
        await attachUnsentMaterial(fixture)
        await expect(page.locator('[data-message-id="history-121"]')).toHaveCount(0)
        const snapshotsBefore = fixture.requests.filter((request) => request === 'session.snapshot').length
        await prompt.focus()
        await page.keyboard.press('Control+f')
        await expect(find.input).toBeFocused()
        await find.input.fill('History message 121')
        await expect(find.count).toHaveText(copy.session.find.count(1, 1, false))
        await expectMatch(page, 'history-121', 'History message 121')
        await expectBarGeometry(fixture)
        await page.screenshot({ path: `${evidence}/loaded-${locale}-${width}.png` })

        await find.input.fill(draft)
        await expect(find.count).toHaveText('0')
        await find.input.fill(attachmentName)
        await expect(find.count).toHaveText('0')
        await find.input.fill('History message 17')
        await expect(find.count).toHaveText(copy.session.find.count(1, 10, false))
        await find.next.click()
        await expect(find.count).toHaveText(copy.session.find.count(2, 10, false))
        await expectMatch(page, 'history-171', 'History message 17')
        await find.previous.click()
        await find.previous.click()
        await expect(find.count).toHaveText(copy.session.find.count(10, 10, false))
        await expectMatch(page, 'history-179', 'History message 17')
        await find.input.focus()
        await page.keyboard.press('Enter')
        await expect(find.count).toHaveText(copy.session.find.count(1, 10, false))
        await page.keyboard.press('Shift+Enter')
        await expect(find.count).toHaveText(copy.session.find.count(10, 10, false))
        await page.keyboard.press('Control+f')
        await expect(find.input).toHaveValue('History message 17')
        await expect(find.input).toBeFocused()
        expect(
          await find.input.evaluate((element: HTMLInputElement) => {
            if (element.selectionEnd === null || element.selectionStart === null) return -1
            return element.selectionEnd - element.selectionStart
          }),
        ).toBe('History message 17'.length)
        // Synthetic IME flags supplement real keyboard navigation, not an OS IME claim.
        await find.input.dispatchEvent('keydown', { key: 'Escape', isComposing: true, keyCode: 229, bubbles: true })
        await expect(find.bar).toBeVisible()
        await find.input.dispatchEvent('keydown', { key: 'Enter', isComposing: true, keyCode: 229, bubbles: true })
        await expect(find.count).toHaveText(copy.session.find.count(10, 10, false))

        await find.input.fill('History message 64')
        await expect(find.count).toHaveText('0')
        await expect(find.bar).toContainText(copy.session.find.older)
        expect(fixture.requests.filter((request) => request === 'session.snapshot')).toHaveLength(snapshotsBefore)
        await page.getByRole('button', { name: copy.session.loadOlder, exact: true }).click()
        await expect(page.locator('[data-hbar-app-ui-list-strategy="virtualized"]')).toHaveAttribute(
          'data-hbar-app-ui-message-count',
          '120',
        )
        await expect(find.count).toHaveText(copy.session.find.count(1, 1, false))
        await expectMatch(page, 'history-64', 'History message 64')
        expect(fixture.requests.filter((request) => request === 'session.snapshot')).toHaveLength(snapshotsBefore + 1)
        await expectBarGeometry(fixture)
        await page.screenshot({ path: `${evidence}/older-${locale}-${width}.png` })

        await find.close.click()
        await expect(find.bar).toHaveCount(0)
        await expect(prompt).toBeFocused()
        await expect.poll(() => activeHighlights(page)).toEqual([])
        await expectComposerText(prompt, draft)
        await expect(page.locator('.lumen-attachment-chip').filter({ hasText: attachmentName })).toBeVisible()
        const findTrigger = await openFind(fixture)
        await expect(find.input).toBeFocused()
        await expect(find.input).toHaveValue('')
        await find.input.fill('x'.repeat(257))
        await expect(find.input).toHaveAttribute('aria-invalid', 'true')
        await expect(find.bar.getByRole('alert')).toHaveText(copy.session.find.queryLimit)
        await page.keyboard.press('Escape')
        await expect(find.bar).toHaveCount(0)
        await expect(findTrigger).toBeFocused()
        await openFind(fixture)
        await find.input.fill('History message 64')
        await expect(find.count).toHaveText(copy.session.find.count(1, 1, false))
        await showSidebar(fixture, true)
        await page.getByRole('treeitem', { name: 'Session 001', exact: true }).click()
        await showSidebar(fixture, false)
        await expect(find.input).toHaveValue('History message 64')
        await expect(find.count).toHaveText('0')
        await expect.poll(() => activeHighlights(page)).toEqual([])
        await showSidebar(fixture, true)
        await page.getByRole('treeitem', { name: host.ready.sessionTitle, exact: true }).click()
        await showSidebar(fixture, false)
        await expect(find.input).toHaveValue('History message 64')
        await expect(find.count).toHaveText(copy.session.find.count(1, 1, false))
        await expectMatch(page, 'history-64', 'History message 64')
        await expectComposerText(prompt, draft)
        await find.close.click()
        expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(0)
        expect(fixture.requests.filter((request) => writeCommands.has(request))).toEqual([])
        expect(fixture.uploads).toHaveLength(1)
        expect(fixture.errors).toEqual([])
        expect(fixture.consoleDiagnostics).toEqual([])
        await record(fixture, `history-${locale}-${width}`, { explicitFixtureRunWrites: 0, locale, width })
      } finally {
        try {
          await record(fixture, `diagnostics-history-${locale}-${width}`)
        } finally {
          await stop(fixture)
        }
      }
    })
  }

  test(`conversation Find yields tool and modal shortcuts and follows real stream facts: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const fixture = await start(browser, locale, 1440)
    const { page, host, copy } = fixture
    const find = findControls(fixture)
    const prompt = page.getByRole('textbox', { name: copy.session.prompt.input, exact: true })
    try {
      await prompt.fill(draft)
      await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
      const files = page.locator('.hbar-app-react-file-workspace:not(.hbar-app-react-file-workbench)')
      await files.getByRole('button', { name: 'browser-e2e.md', exact: true }).click()
      await files.getByRole('button', { name: copy.files.edit, exact: true }).click()
      const editor = files.getByRole('textbox', { name: 'browser-e2e.md', exact: true })
      const originalFileDraft = '# Original Files draft — 不发送、不保存'
      await editor.fill(originalFileDraft)
      await editor.focus()
      await expectShortcutLeftToOtherSurface(page)
      await expect(editor).toHaveValue(originalFileDraft)

      await page.keyboard.press('Control+Shift+p')
      const palette = page.getByRole('dialog', { name: copy.commandPalette.title, exact: true })
      await expect(palette).toBeVisible()
      // A modal may legitimately stop propagation before the Window observer.
      // Test its user-visible ownership instead of requiring that event to bubble.
      await page.keyboard.press('Control+f')
      await expect(palette).toBeVisible()
      await expect(find.bar).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(palette).toHaveCount(0)
      await expect(editor).toBeFocused()

      await openSessionTool(page, copy.session.tools, 'settings')
      await expect(page.getByRole('button', { name: copy.settings.back, exact: true })).toBeVisible()
      await expectShortcutLeftToOtherSurface(page)
      await page.getByRole('button', { name: copy.settings.back, exact: true }).click()
      await expect(editor).toHaveValue(originalFileDraft)
      await find.entry.click()
      await expect(find.input).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(find.bar).toHaveCount(0)
      await expect(files).toBeVisible()
      await files.getByRole('button', { name: copy.files.close, exact: true }).click()

      await prompt.focus()
      await page.keyboard.press('Control+f')
      await find.input.fill('History message 121')
      await expect(find.count).toHaveText(copy.session.find.count(1, 1, false))
      await expectMatch(page, 'history-121', 'History message 121')
      const viewport = page.locator('.lumen-conversation-messages')
      const before = await viewport.evaluate((element) => element.scrollTop)
      const commands = createRunCommandClient(host.client)
      const columns = Array.from({ length: 64 }, (_item, index) => `Column${index}`)
      const table = [
        `| ${columns.join(' | ')} |`,
        `| ${columns.map(() => '---').join(' | ')} |`,
        `| ${columns.map((_column, index) => (index === columns.length - 1 ? 'tR9' : 'x')).join(' | ')} |`,
      ].join('\n')
      const code = `\`\`\`text\n${'column_'.repeat(80)}code-rightneedle\n\`\`\``
      const runText = `/slow\n\n**markedneedle** before **cross** [inline](https://example.invalid) after\n\n${table}\n\n${code}`
      const accepted = await commands.execute(
        'run.submit',
        { sessionId: host.ready.sessionId, modelId: 'local-fixture', input: { text: runText, images: [] } },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(
          async () =>
            (await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs.find(
              (run) => run.id === accepted.operationId,
            )?.status,
        )
        .toBe('running')
      // Incoming stream publications must not reinterpret the selected result as
      // a fresh user scroll request. A bounded observation spans several chunks.
      await page.waitForTimeout(350)
      expect(Math.abs((await viewport.evaluate((element) => element.scrollTop)) - before)).toBeLessThan(16)
      await expectMatch(page, 'history-121', 'History message 121')
      await find.input.fill('cancellable response')
      await expect
        .poll(async () => Number((await find.count.textContent())?.split('/')[1]?.trim() ?? 0))
        .toBeGreaterThan(0)
      await expect
        .poll(
          async () =>
            (await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs.find(
              (run) => run.id === accepted.operationId,
            )?.status,
        )
        .toBe('completed')
      await expect(find.count).toHaveText(copy.session.find.count(1, 180, false))
      await expect
        .poll(async () => (await activeHighlights(page)).map((range) => range.text).join(''))
        .toBe('cancellable response')
      await expectBarGeometry(fixture)
      await page.screenshot({ path: `${evidence}/stream-${locale}-1440.png` })
      const completed = await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })
      const richInput = completed.messages.find(
        (message) =>
          message.role === 'user' && message.content.some((block) => block.type === 'text' && block.text === runText),
      )
      if (!richInput) throw new Error('Real Host did not commit the canonical literal fixture input')
      await find.input.fill('**markedneedle**')
      await expect(find.count).toHaveText(copy.session.find.count(1, 1, false))
      await expectMatch(page, richInput.id, '**markedneedle**')
      await find.input.fill('markedneedle')
      await expect(find.count).toHaveText(copy.session.find.count(1, 1, false))
      await expectMatch(page, richInput.id, 'markedneedle')
      // Rich reading remains assistant-owned; do not turn operator prompts into
      // tables/code previews to preserve this test's horizontal reveal fixture.
      const richText = `before **cross** [inline](https://example.invalid) after\n\n${table}\n\n${code}`
      const richRun = await commands.execute(
        'run.submit',
        { sessionId: host.ready.sessionId, modelId: 'local-fixture', input: { text: richText, images: [] } },
        { idempotencyKey: crypto.randomUUID() },
      )
      await expect
        .poll(
          async () =>
            (await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs.find(
              (run) => run.id === richRun.operationId,
            )?.status,
        )
        .toBe('completed')
      const richReply = (await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).messages.find(
        (message) =>
          message.role === 'assistant' &&
          message.runId === richRun.operationId &&
          message.content.some((block) => block.type === 'text' && block.text.includes(richText)),
      )
      if (!richReply) throw new Error('Canonical rich assistant fixture missing')
      await find.input.fill('before cross inline after')
      await expect(find.count).toHaveText(copy.session.find.count(1, 1, false))
      await expectMatch(page, richReply.id, 'before cross inline after')
      await page.screenshot({ path: `${evidence}/markdown-${locale}-1440.png` })
      await page.setViewportSize({ width: 320, height: 844 })
      await find.input.fill('before cross')
      await expectMatch(page, richReply.id, 'before cross')
      const richRow = page.locator(`[data-message-id="${richReply.id}"]`)
      const tableBlock = richRow.locator('table')
      const codeBlock = richRow.locator('pre')
      await expect(tableBlock).toHaveCount(1)
      await expect(codeBlock).toHaveCount(1)
      expect(await tableBlock.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeGreaterThan(64)
      expect(await tableBlock.evaluate((element) => element.scrollLeft)).toBe(0)
      const outerBeforeTable = await unchangedOuterScroll(page)
      const codeBeforeTable = await codeBlock.evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }))
      await find.input.fill('tR9')
      await expect(find.count).toHaveText(copy.session.find.count(1, 3, false))
      await find.next.click()
      await find.next.click()
      await expectMatch(page, richReply.id, 'tR9')
      await expect.poll(() => tableBlock.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
      await expect
        .poll(async () =>
          (await horizontalMatchGeometry(page)).every((range) => range.clips.every((clip) => clip.containsMatch)),
        )
        .toBe(true)
      expect(await unchangedOuterScroll(page)).toEqual(outerBeforeTable)
      expect(await codeBlock.evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }))).toEqual(
        codeBeforeTable,
      )
      const tableEvidence = await horizontalMatchGeometry(page)
      expect(
        tableEvidence.some((range) => range.clips.some((clip) => clip.tag === 'TABLE' && clip.scrollLeft > 0)),
      ).toBe(true)
      await page.screenshot({ path: `${evidence}/table-far-right-${locale}-320.png` })

      // Production currently wraps code lines (pre-wrap/anywhere). Do not inject
      // CSS to pretend it is a horizontal scroller: verify the actual last token
      // and every real clipping ancestor, and record its computed wrapping policy.
      const outerBeforeCode = await unchangedOuterScroll(page)
      const tableBeforeCode = await tableBlock.evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }))
      await find.input.fill('code-rightneedle')
      await expect(find.count).toHaveText(copy.session.find.count(1, 3, false))
      await find.next.click()
      await find.next.click()
      await expectMatch(page, richReply.id, 'code-rightneedle')
      await expect
        .poll(async () =>
          (await horizontalMatchGeometry(page)).every((range) => range.clips.every((clip) => clip.containsMatch)),
        )
        .toBe(true)
      expect(await unchangedOuterScroll(page)).toEqual(outerBeforeCode)
      expect(await tableBlock.evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }))).toEqual(
        tableBeforeCode,
      )
      const codeEvidence = {
        ranges: await horizontalMatchGeometry(page),
        layout: await codeBlock.evaluate((element) => ({
          whiteSpace: getComputedStyle(element).whiteSpace,
          overflowWrap: getComputedStyle(element).overflowWrap,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          scrollLeft: element.scrollLeft,
        })),
      }
      expect(
        codeEvidence.layout.whiteSpace === 'pre-wrap' ||
          codeEvidence.layout.scrollWidth > codeEvidence.layout.clientWidth,
      ).toBe(true)
      await page.screenshot({ path: `${evidence}/code-last-token-${locale}-320.png` })
      await find.close.click()
      await expectComposerText(prompt, draft)
      expect((await host.client.call('session.snapshot', { sessionId: host.ready.sessionId })).runs).toHaveLength(2)
      expect(fixture.requests.filter((request) => writeCommands.has(request))).toEqual([])
      expect(fixture.uploads).toHaveLength(0)
      expect(fixture.errors).toEqual([])
      expect(fixture.consoleDiagnostics).toEqual([])
      await record(fixture, `stream-${locale}`, {
        explicitFixtureRunWrites: 2,
        model: 'local-fixture',
        locale,
        horizontalTable: tableEvidence,
        codeLastToken: codeEvidence,
      })
    } finally {
      try {
        await record(fixture, `diagnostics-stream-${locale}`)
      } finally {
        await stop(fixture)
      }
    }
  })
}
