import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { HbarClient, createSessionSearchCommandClient } from '@hbar/client'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import { chatSearchCopy } from '../apps/web/src/chat-search-copy'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'

const prefix = 'hbar-chat-search-e2e-'
const evidence = resolve(process.env.HBAR_CHAT_SEARCH_EVIDENCE ?? 'artifacts/chat-search/browser-v1')
const readySchema = z.object({
  url: z.url(),
  token: z.string(),
  observerToken: z.string(),
  visibleWorkspace: workspaceSchema,
  hiddenWorkspace: workspaceSchema,
  filler: z.array(sessionSchema).length(7),
  visibleMatch: sessionSchema,
  hiddenMatch: sessionSchema,
  titleOnly: sessionSchema,
  hiddenFiller: sessionSchema,
  archivedMatch: sessionSchema,
  messageIds: z.object({
    visibleUser: z.string(),
    visibleAssistant: z.string(),
    hiddenUser: z.string(),
    hiddenAssistant: z.string(),
  }),
  initialization: z.object({
    workspaces: z.literal(2),
    sessions: z.literal(12),
    archivedSessions: z.literal(1),
    demo: z.literal(false),
    runs: z.literal(0),
  }),
})
const wireSchema = z.object({
  method: z.string(),
  params: z.object({ commandId: z.string().optional() }).passthrough().optional(),
})

interface Fixture {
  readonly root: string
  readonly directory: string
  readonly child: ChildProcess
  readonly context: BrowserContext
  readonly page: Page
  readonly observer: HbarClient
  readonly ready: z.infer<typeof readySchema>
  readonly locale: ShellLocale
  readonly width: number
  readonly asset: string
  readonly commands: string[]
  readonly errors: string[]
}

function bunExecutable(): string {
  if (process.platform !== 'win32') return 'bun'
  const executable = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((folder) => [join(folder, 'bun.exe'), join(folder, 'node_modules/bun/bin/bun.exe')])
    .find(existsSync)
  if (!executable) throw new Error('Bun unavailable for owned chat-search Host')
  return executable
}

async function cleanup(child: ChildProcess, root: string, directory: string): Promise<void> {
  if (child.exitCode === null && child.signalCode === null) {
    child.stdin?.write('stop\n')
    await expect.poll(() => child.exitCode !== null || child.signalCode !== null, { timeout: 15_000 }).toBe(true)
  }
  const stat = await lstat(root)
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Refusing replaced chat-search fixture root')
  const exact = await realpath(root)
  if (exact !== resolve(root) || dirname(exact) !== (await realpath(tmpdir())) || !basename(exact).startsWith(prefix))
    throw new Error('Refusing cleanup outside exact owned chat-search fixture')
  await rm(exact, { recursive: true })
  await writeFile(
    join(directory, 'cleanup.json'),
    JSON.stringify(
      { root, pid: child.pid, exitCode: child.exitCode, removed: !existsSync(root), stop: 'Owned child stdin only' },
      null,
      2,
    ),
  )
  expect(child.exitCode).toBe(0)
}

async function start(browser: Browser, locale: ShellLocale, width: number): Promise<Fixture> {
  const assets = resolve(z.string().min(1).parse(process.env.HBAR_CHAT_SEARCH_WEB_DIST))
  const asset = z
    .string()
    .regex(/^index-[A-Za-z0-9_-]+\.js$/)
    .parse(process.env.HBAR_CHAT_SEARCH_EXPECTED_ASSET)
  const sha256 = z
    .string()
    .regex(/^[A-Fa-f0-9]{64}$/)
    .parse(process.env.HBAR_CHAT_SEARCH_EXPECTED_SHA256)
  expect(
    createHash('sha256')
      .update(await readFile(join(assets, 'assets', asset)))
      .digest('hex')
      .toUpperCase(),
  ).toBe(sha256.toUpperCase())
  const directory = join(evidence, `${locale}-${width}-${randomUUID().slice(0, 8)}`)
  await mkdir(directory, { recursive: true })
  const root = await realpath(await mkdtemp(join(tmpdir(), prefix)))
  const child = spawn(bunExecutable(), ['e2e/support/chat-search-host.ts'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, HBAR_CHAT_SEARCH_ROOT: root, HBAR_CHAT_SEARCH_WEB_DIST: assets },
  })
  const context = await browser.newContext({ locale, viewport: { width, height: width === 320 ? 760 : 960 } })
  let observer: HbarClient | undefined
  let stderr = ''
  child.stderr?.on('data', (value: Buffer) => {
    stderr = (stderr + value.toString()).slice(-16_384)
  })
  try {
    if (!child.stdout) throw new Error('Owned Host stdout is missing')
    const lines = createInterface({ input: child.stdout })
    const ready = await new Promise<z.infer<typeof readySchema>>((done, reject) => {
      const timer = setTimeout(() => reject(new Error(`Owned Host startup timed out: ${stderr}`)), 30_000)
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('exit', (code) => {
        clearTimeout(timer)
        reject(new Error(`Owned Host exited ${code}: ${stderr}`))
      })
      lines.on('line', (line) => {
        try {
          const parsed = readySchema.safeParse(JSON.parse(line))
          if (parsed.success) {
            clearTimeout(timer)
            done(parsed.data)
          }
        } catch {
          // Credential-bearing stdout is intentionally never persisted.
        }
      })
    }).finally(() => lines.close())
    observer = new HbarClient(ready.url, ready.observerToken)
    await observer.connect()
    expect((await context.request.post(`${ready.url}/auth/token`, { data: { token: ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const commands: string[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') errors.push(message.text())
    })
    page.on('websocket', (socket) =>
      socket.on('framesent', (frame) => {
        try {
          const parsed = wireSchema.safeParse(JSON.parse(String(frame.payload)))
          if (!parsed.success) return
          if (commands.length >= 2048) throw new Error('Observed request capacity exceeded')
          commands.push(
            parsed.data.method === 'command.execute'
              ? (parsed.data.params?.commandId ?? 'invalid')
              : parsed.data.method,
          )
        } catch {
          errors.push('Invalid browser command frame')
        }
      }),
    )
    await page.goto(ready.url)
    await expect(page.locator('script[type="module"][src]')).toHaveAttribute('src', `/assets/${asset}`)
    const copy = getShellCopy(locale)
    const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
    if (await show.isVisible()) await show.click()
    await expect(page.locator(`[data-workspace-id="${ready.visibleWorkspace.id}"]`)).toBeVisible()
    await expect(page.locator(`[data-workspace-id="${ready.hiddenWorkspace.id}"]`)).toBeVisible()
    return { root, directory, child, context, page, observer, ready, locale, width, asset, commands, errors }
  } catch (error) {
    await context.close()
    observer?.disconnect()
    await cleanup(child, root, directory)
    throw error
  }
}

async function stop(fixture: Fixture): Promise<void> {
  try {
    await fixture.context.close()
  } finally {
    fixture.observer.disconnect()
    await cleanup(fixture.child, fixture.root, fixture.directory)
  }
}

function dialog(fixture: Fixture): Locator {
  return fixture.page.locator('dialog.hbar-app-react-chat-search-dialog')
}

function input(fixture: Fixture): Locator {
  return dialog(fixture).getByRole('combobox', { name: chatSearchCopy(fixture.locale).search, exact: true })
}

async function expectOpenedSession(fixture: Fixture, title: string): Promise<void> {
  await expect(
    fixture.page.getByRole('region', {
      name: getShellCopy(fixture.locale).session.conversationTitle(title),
      exact: true,
    }),
  ).toBeVisible()
  // The current narrow shell moves tabs into its navigation menu; the selected
  // conversation is visible even though the desktop tab strip is not mounted.
  if (fixture.width === 320)
    await expect(fixture.page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
  else
    await expect(fixture.page.getByRole('tab', { name: title, exact: true })).toHaveAttribute('aria-selected', 'true')
}

async function openBySidebar(fixture: Fixture): Promise<void> {
  const { page, locale } = fixture
  const copy = getShellCopy(locale)
  const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
  if (await show.isVisible()) await show.click()
  const action = page.getByRole('button', { name: copy.shell.searchChats, exact: true })
  await expect(action).toContainText(copy.shell.searchChats)
  await expect(action).toHaveAttribute('aria-haspopup', 'dialog')
  await expect(action).toHaveAttribute('aria-expanded', 'false')
  const controls = page.locator('.hbar-app-react-sidebar-query-actions')
  const buttons = controls.locator(':scope > button')
  await expect(buttons).toHaveCount(3)
  await expect(buttons.nth(0)).toHaveClass(/hbar-sidebar-search-entry/)
  await expect(buttons.nth(1)).toHaveClass(/hbar-app-react-roster-refresh/)
  await expect(buttons.nth(2)).toHaveClass(/hbar-app-react-session-batch-mode/)
  await page.screenshot({ path: join(fixture.directory, 'sidebar-search-entry.png') })
  await action.click()
  await expect(dialog(fixture)).toBeVisible()
  await expect(input(fixture)).toBeFocused()
}

async function hideSecondWorkspace(fixture: Fixture): Promise<void> {
  const project = fixture.page.locator(`[data-workspace-id="${fixture.ready.hiddenWorkspace.id}"]`)
  await project.locator('.hbar-app-react-project-menu summary').click()
  const hide = project.getByRole('menuitem', {
    name: getShellCopy(fixture.locale).shell.organization.hide,
    exact: true,
  })
  await expect(hide).toBeEnabled()
  await hide.click()
  await expect(project).toHaveCount(0)
}

async function capture(fixture: Fixture, name: string): Promise<void> {
  const geometry = await fixture.page.evaluate(() => {
    const root = document.querySelector<HTMLDialogElement>('dialog.hbar-app-react-chat-search-dialog')
    if (!root) throw new Error('Search dialog is missing')
    const rect = root.getBoundingClientRect()
    const footer = root.querySelector<HTMLElement>('.hbar-chat-search-footer')
    const footerRect = footer?.getBoundingClientRect()
    const footerChildren = Array.from(footer?.children ?? [], (node) => {
      const child = node.getBoundingClientRect()
      return { left: child.left, right: child.right, top: child.top, bottom: child.bottom }
    })
    const pane = root.querySelector<HTMLElement>('.hbar-chat-search-pane')
    const inline = Array.from(
      root.querySelectorAll<HTMLElement>('.hbar-chat-search-row-heading time, .hbar-chat-search-snippet-role'),
      (node) => ({
        text: node.textContent,
        height: node.getBoundingClientRect().height,
        fontSize: Number.parseFloat(getComputedStyle(node).fontSize),
      }),
    )
    const resultFlow = Array.from(
      root.querySelectorAll<HTMLElement>(
        '.hbar-chat-search-row, .hbar-chat-search-row-heading, .hbar-chat-search-row-context, .hbar-chat-search-snippet, .hbar-chat-search-snippet-role, .hbar-chat-search-snippet-text',
      ),
      (node) => {
        const bounds = node.getBoundingClientRect()
        return { className: node.className, left: bounds.left, right: bounds.right }
      },
    )
    const firstHeading = root.querySelector<HTMLElement>('.hbar-chat-search-row-heading')?.getBoundingClientRect()
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      dialog: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width },
      footer: footerRect ? { left: footerRect.left, right: footerRect.right } : null,
      footerChildren,
      pane: pane ? { scrollHeight: pane.scrollHeight, clientHeight: pane.clientHeight } : null,
      inline,
      resultFlow,
      firstHeadingLeft: firstHeading?.left ?? null,
      options: root.querySelectorAll('[role="option"]').length,
      focus: document.activeElement?.getAttribute('role'),
    }
  })
  expect(geometry.documentWidth).toBeLessThanOrEqual(fixture.width + 1)
  expect(geometry.dialog.left).toBeGreaterThanOrEqual(0)
  expect(geometry.dialog.right).toBeLessThanOrEqual(fixture.width + 1)
  if (fixture.width === 320) {
    expect(geometry.dialog.left).toBeGreaterThanOrEqual(20)
    expect(geometry.dialog.right).toBeLessThanOrEqual(300)
  } else if (name === 'recent') {
    expect(geometry.dialog.top).toBeLessThanOrEqual(160)
    expect(geometry.pane?.scrollHeight).toBeLessThanOrEqual((geometry.pane?.clientHeight ?? 0) + 1)
  }
  for (const item of geometry.inline) expect(item.height).toBeLessThanOrEqual(item.fontSize * 1.8 + 1)
  for (const item of geometry.resultFlow) {
    expect(item.left, item.className).toBeGreaterThanOrEqual(geometry.dialog.left - 1)
    expect(item.right, item.className).toBeLessThanOrEqual(geometry.dialog.right + 1)
  }
  if (geometry.firstHeadingLeft !== null)
    expect(geometry.firstHeadingLeft).toBeLessThanOrEqual(geometry.dialog.left + 64)
  if (geometry.footer)
    for (const child of geometry.footerChildren) {
      expect(child.left).toBeGreaterThanOrEqual(geometry.footer.left - 1)
      expect(child.right).toBeLessThanOrEqual(geometry.footer.right + 1)
    }
  await fixture.page.screenshot({ path: join(fixture.directory, `${name}.png`) })
  await writeFile(join(fixture.directory, `${name}.json`), JSON.stringify(geometry, null, 2))
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  for (const width of [1440, 320]) {
    test(`real Host Search chats follows global body-search navigation: ${locale} ${width}`, async ({ browser }) => {
      test.setTimeout(120_000)
      const fixture = await start(browser, locale, width)
      try {
        const { page, ready, observer } = fixture
        const labels = chatSearchCopy(locale)
        const search = createSessionSearchCommandClient(observer)
        await hideSecondWorkspace(fixture)
        expect((await search.execute('session.recent', {})).items).toHaveLength(8)
        await openBySidebar(fixture)
        const recent = await search.execute('session.recent', {})
        await expect(dialog(fixture).getByRole('option')).toHaveCount(8)
        expect(
          await dialog(fixture)
            .getByRole('option')
            .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-session-id'))),
        ).toEqual(recent.items.map((item) => item.sessionId))
        expect(recent.items.map((item) => item.sessionId)).not.toContain(ready.archivedMatch.id)
        await capture(fixture, 'recent')
        await page.mouse.move(0, 0)
        await input(fixture).press('ArrowDown')
        await expect(dialog(fixture).getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true')
        const recentRows = dialog(fixture).getByRole('option')
        await expect(recentRows.nth(1)).toHaveAttribute('data-lumen-state', 'selected')
        await expect
          .poll(() => recentRows.nth(0).evaluate((row) => getComputedStyle(row).backgroundColor))
          .toBe('rgba(0, 0, 0, 0)')
        const selectionPaint = await recentRows.evaluateAll((rows) => {
          const selected = rows.find((row) => row.getAttribute('aria-selected') === 'true')
          const idle = rows.find((row) => row.getAttribute('aria-selected') === 'false')
          return {
            selected: selected ? getComputedStyle(selected).backgroundColor : null,
            idle: idle ? getComputedStyle(idle).backgroundColor : null,
          }
        })
        await capture(fixture, 'keyboard-selected')
        expect(selectionPaint.selected).not.toBe(selectionPaint.idle)
        const keyboardTarget = recent.items[1]
        if (!keyboardTarget) throw new Error('Owned recent keyboard target is missing')
        await input(fixture).press('Enter')
        await expect(dialog(fixture)).toHaveCount(0)
        await expectOpenedSession(fixture, keyboardTarget.title)
        await page.keyboard.press('Control+k')
        await expect(input(fixture)).toBeFocused()
        await expect(input(fixture)).toHaveValue('')
        await expect(dialog(fixture).getByRole('option')).toHaveCount(8)

        const box = input(fixture)
        await box.fill('needle')
        const results = dialog(fixture).getByRole('option')
        await expect(results).toHaveCount(2, { timeout: 20_000 })
        const resultIds = await results.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-session-id')))
        expect(resultIds.sort()).toEqual([ready.visibleMatch.id, ready.hiddenMatch.id].sort())
        expect(resultIds).not.toContain(ready.titleOnly.id)
        expect(resultIds).not.toContain(ready.archivedMatch.id)
        for (const [session, workspace, messageIds] of [
          [
            ready.visibleMatch,
            ready.visibleWorkspace,
            [ready.messageIds.visibleUser, ready.messageIds.visibleAssistant],
          ],
          [ready.hiddenMatch, ready.hiddenWorkspace, [ready.messageIds.hiddenUser, ready.messageIds.hiddenAssistant]],
        ] as const) {
          const row = dialog(fixture).locator(`[role="option"][data-session-id="${session.id}"]`)
          await expect(row).toContainText(session.title)
          await expect(row).toContainText(workspace.name)
          await expect(row).toContainText(labels.matches(2))
          await expect(row.locator('.hbar-chat-search-snippet')).toHaveCount(2)
          await expect(row.locator('.hbar-chat-search-highlight')).toHaveText(['needle', 'needle'])
          const host = await search.execute('session.search', { query: 'needle' })
          const actual = host.items.find((item) => item.sessionId === session.id)
          expect(actual?.matches.map((match) => match.messageId).sort()).toEqual([...messageIds].sort())
        }
        await capture(fixture, 'matches')

        await box.fill('needle appears in this title only')
        await expect(dialog(fixture).getByRole('option')).toHaveCount(0)
        await expect(dialog(fixture).getByText(labels.empty, { exact: true })).toBeVisible()
        await capture(fixture, 'title-only-negative')

        // This is a synthetic DOM composition check, not an OS IME claim.
        await box.fill('')
        await box.dispatchEvent('compositionstart', { data: '中' })
        await box.fill('needle')
        await page.waitForTimeout(350)
        await expect(dialog(fixture).getByRole('option')).toHaveCount(0)
        await box.dispatchEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          isComposing: true,
          bubbles: true,
          cancelable: true,
        })
        await expect(dialog(fixture)).toBeVisible()
        await box.dispatchEvent('compositionend', { data: '中' })
        await expect(dialog(fixture).getByRole('option')).toHaveCount(2, { timeout: 20_000 })
        await capture(fixture, 'ime-settled')

        const hiddenRow = dialog(fixture).locator(`[role="option"][data-session-id="${ready.hiddenMatch.id}"]`)
        await hiddenRow.click()
        await expect(dialog(fixture)).toHaveCount(0)
        await expectOpenedSession(fixture, ready.hiddenMatch.title)
        await expect(page.getByText('The hidden project still has a needle in its user history.')).toBeVisible()
        await expect(page.locator(`[data-workspace-id="${ready.hiddenWorkspace.id}"]`)).toHaveCount(1)

        await page.keyboard.press('Control+k')
        await expect(dialog(fixture)).toBeVisible()
        await expect(input(fixture)).toHaveValue('')
        await expect(dialog(fixture).getByRole('option')).toHaveCount(8)
        await capture(fixture, 'shortcut-recent')
        await input(fixture).press('Escape')
        await expect(dialog(fixture)).toHaveCount(0)
        await page.keyboard.press('Control+Shift+p')
        await expect(page.locator('dialog.hbar-app-react-command-modal')).toBeVisible()
        expect(fixture.commands).toContain('session.recent')
        expect(fixture.commands).toContain('session.search')
        expect(fixture.commands).not.toContain('run.submit')
        expect(fixture.errors).toEqual([])
        await writeFile(
          join(fixture.directory, 'observation.json'),
          JSON.stringify(
            {
              actualHost: true,
              locale,
              width,
              asset: fixture.asset,
              root: fixture.root,
              pid: fixture.child.pid,
              initialization: ready.initialization,
              visibleSessionId: ready.visibleMatch.id,
              hiddenSessionId: ready.hiddenMatch.id,
              titleOnlySessionId: ready.titleOnly.id,
              archivedSessionId: ready.archivedMatch.id,
              recentSessionIds: recent.items.map((item) => item.sessionId),
              resultSessionIds: resultIds,
              commands: fixture.commands,
              errors: fixture.errors,
              ime: 'synthetic DOM composition only',
            },
            null,
            2,
          ),
        )
      } finally {
        await stop(fixture)
      }
    })
  }
}
