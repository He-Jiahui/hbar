import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { HbarClient, createWorkspaceSessionCommandClient } from '@hbar/client'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { workspaceSortCopy } from '../apps/web/src/workspace-sort-copy'
import { expectComposerText } from './support/composer-text'

const rootPrefix = 'hbar-workspace-sort-ui-'
const evidenceDirectory = resolve('artifacts/project-sort-reference/hbar-e2e')
const readySchema = z.strictObject({
  url: z.string().url(),
  wideToken: z.string().min(1),
  narrowToken: z.string().min(1),
  observerToken: z.string().min(1),
  workspaces: z.array(workspaceSchema).length(6),
  primaryWorkspace: workspaceSchema,
  pinnedWorkspace: workspaceSchema,
  hiddenWorkspace: workspaceSchema,
  selectedSession: sessionSchema,
  createdHead: sessionSchema,
  idPageSessionCount: z.number().int().nonnegative(),
})
const rpcSchema = z
  .object({
    params: z.object({ commandId: z.string().optional(), input: z.unknown().optional() }).passthrough().optional(),
  })
  .passthrough()
type Ready = z.infer<typeof readySchema>
type DirectoryClient = ReturnType<typeof createWorkspaceSessionCommandClient>
type SortBy = 'createdAt' | 'updatedAt'
interface RpcCall {
  readonly commandId: string
  readonly input: unknown
}
interface OwnedHost {
  readonly root: string
  readonly child: ChildProcess
  readonly ready: Ready
  readonly external: HbarClient
  readonly directory: DirectoryClient
}
interface PageFixture {
  readonly host: OwnedHost
  readonly context: BrowserContext
  readonly page: Page
  readonly locale: ShellLocale
  readonly width: number
  readonly copy: ReturnType<typeof getShellCopy>
  readonly sort: ReturnType<typeof workspaceSortCopy>
  readonly errors: string[]
  readonly warnings: string[]
  readonly calls: RpcCall[]
}

function bunExecutable(): string {
  if (process.platform !== 'win32') return 'bun'
  const candidate = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((directory) => [join(directory, 'bun.exe'), join(directory, 'node_modules', 'bun', 'bin', 'bun.exe')])
    .find(existsSync)
  if (!candidate) throw new Error('Bun is unavailable for the owned workspace-sort Host')
  return candidate
}

async function waitForReady(child: ChildProcess, diagnostics: () => string): Promise<Ready> {
  if (!child.stdout) throw new Error('Missing owned workspace-sort Host stdout')
  const lines = createInterface({ input: child.stdout })
  return new Promise<Ready>((resolveReady, reject) => {
    let settled = false
    const cleanup = () => {
      clearTimeout(timer)
      lines.off('line', onLine)
      child.off('error', onError)
      child.off('exit', onExit)
      lines.close()
    }
    const finish = (complete: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      complete()
    }
    const onLine = (line: string) => {
      let payload: unknown
      try {
        payload = JSON.parse(line) as unknown
      } catch {
        return
      }
      const ready = readySchema.safeParse(payload)
      if (ready.success) finish(() => resolveReady(ready.data))
    }
    const onError = (error: Error) => finish(() => reject(error))
    const onExit = (code: number | null) =>
      finish(() => reject(new Error(`Owned Host exited ${code}: ${diagnostics()}`)))
    const timer = setTimeout(
      () => finish(() => reject(new Error(`Owned workspace-sort Host startup timed out: ${diagnostics()}`))),
      90_000,
    )
    lines.on('line', onLine)
    child.once('error', onError)
    child.once('exit', onExit)
  })
}

async function stopOwnedChild(child: ChildProcess): Promise<void> {
  const ended = () => child.exitCode !== null || child.signalCode !== null
  if (ended()) return
  if (!child.stdin) throw new Error('Owned workspace-sort Host has no stop channel')
  const waitForExit = (timeoutMs: number) =>
    new Promise<void>((done) => {
      if (ended()) {
        done()
        return
      }
      const timer = setTimeout(() => {
        child.off('exit', onExit)
        done()
      }, timeoutMs)
      const onExit = () => {
        clearTimeout(timer)
        done()
      }
      child.once('exit', onExit)
    })
  const gracefulExit = waitForExit(5_000)
  child.stdin.write('stop\n')
  await gracefulExit
  if (!ended()) {
    const forcedExit = waitForExit(5_000)
    child.kill()
    await forcedExit
  }
  if (!ended()) throw new Error('Owned workspace-sort Host did not stop')
}

async function removeOwnedRoot(root: string): Promise<void> {
  const target = await realpath(root)
  if (dirname(target) !== (await realpath(tmpdir())) || !basename(target).startsWith(rootPrefix))
    throw new Error('Refusing cleanup outside this exact workspace-sort fixture root')
  await rm(target, { recursive: true, force: true })
}

async function startHost(): Promise<OwnedHost> {
  const root = await mkdtemp(join(tmpdir(), rootPrefix))
  const assets = resolve(process.env.HBAR_WORKSPACE_SORT_WEB_DIST ?? 'dist/web')
  if (!existsSync(join(assets, 'index.html'))) {
    await removeOwnedRoot(root)
    throw new Error('The production Web bundle is missing; build dist/web before this E2E')
  }
  const child = spawn(bunExecutable(), ['e2e/support/workspace-sort-host.ts'], {
    cwd: process.cwd(),
    env: { ...process.env, HBAR_WORKSPACE_SORT_ROOT: root, HBAR_WORKSPACE_SORT_WEB_DIST: assets },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let diagnostics = ''
  child.stderr?.on('data', (chunk: Buffer) => {
    diagnostics = (diagnostics + chunk.toString()).slice(-16_384)
  })
  let external: HbarClient | undefined
  try {
    const ready = await waitForReady(child, () => diagnostics)
    external = new HbarClient(ready.url, ready.observerToken)
    await external.connect()
    return {
      root,
      child,
      ready,
      external,
      directory: createWorkspaceSessionCommandClient(external),
    }
  } catch (error) {
    external?.disconnect()
    await stopOwnedChild(child)
    await removeOwnedRoot(root)
    throw error
  }
}

async function stopHost(host: OwnedHost): Promise<void> {
  host.external.disconnect()
  await stopOwnedChild(host.child)
  await removeOwnedRoot(host.root)
}

function captureCalls(page: Page, calls: RpcCall[]): void {
  page.on('websocket', (socket) =>
    socket.on('framesent', ({ payload }) => {
      if (typeof payload !== 'string') return
      let value: unknown
      try {
        value = JSON.parse(payload) as unknown
      } catch {
        return
      }
      const parsed = rpcSchema.safeParse(value)
      if (!parsed.success) return
      const commandId = parsed.data.params?.commandId
      if (commandId) calls.push({ commandId, input: parsed.data.params?.input })
    }),
  )
}

async function openPage(host: OwnedHost, browser: Browser, locale: ShellLocale, width: number): Promise<PageFixture> {
  const context = await browser.newContext({ locale, viewport: { width, height: 900 } })
  context.setDefaultTimeout(10_000)
  const token = locale === 'en-US' ? host.ready.wideToken : host.ready.narrowToken
  try {
    const paired = await context.request.post(`${host.ready.url}/auth/token`, { data: { token } })
    expect(paired.ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    const warnings: string[] = []
    const calls: RpcCall[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        warnings.push(`${message.type()}: ${message.text()}`)
    })
    captureCalls(page, calls)
    await page.goto(host.ready.url)
    if (process.env.HBAR_WORKSPACE_SORT_EXPECTED_ASSET)
      await expect(page.locator('script[type="module"][src]')).toHaveAttribute(
        'src',
        new RegExp(process.env.HBAR_WORKSPACE_SORT_EXPECTED_ASSET),
      )
    return {
      host,
      context,
      page,
      locale,
      width,
      copy: getShellCopy(locale),
      sort: workspaceSortCopy(locale),
      errors,
      warnings,
      calls,
    }
  } catch (error) {
    await context.close()
    throw error
  }
}

async function stopPage(f: PageFixture): Promise<void> {
  await f.context.close()
}

async function showSidebar(f: PageFixture) {
  const side = f.page.getByRole('complementary', { name: f.copy.shell.projectsAndSessions, exact: true })
  if (!(await side.isVisible()))
    await f.page.getByRole('button', { name: f.copy.shell.showSidebar, exact: true }).click()
  await expect(side).toBeVisible()
  return side
}

function workspaceRow(f: PageFixture, workspaceId: string) {
  return f.page.locator(`[data-workspace-id="${workspaceId}"]`)
}

function composer(f: PageFixture) {
  return f.page.getByRole('textbox', { name: f.copy.session.prompt.input, exact: true, includeHidden: true })
}

async function projectIds(sidebar: Locator): Promise<string[]> {
  return sidebar
    .locator('.hbar-app-react-project-tree > section')
    .evaluateAll((sections) => sections.map((section) => section.getAttribute('data-workspace-id') ?? ''))
}

async function sessionIds(f: PageFixture): Promise<string[]> {
  return workspaceRow(f, f.host.ready.primaryWorkspace.id)
    .locator('.hbar-app-react-session-list [data-session-id]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-session-id') ?? ''))
}

async function expectedProjectIds(f: PageFixture, sortBy: SortBy): Promise<string[]> {
  const page = await f.host.directory.execute('workspace.activity.list', { sortBy, limit: 200 })
  const organization = await f.host.directory.execute('workspaceOrganization.get', {})
  const hidden = new Set(organization.hiddenWorkspaceIds)
  const pinned = f.host.ready.pinnedWorkspace.id
  return [pinned, ...page.items.map((item) => item.workspace.id).filter((id) => id !== pinned && !hidden.has(id))]
}

async function expectSubmenuFitsViewport(f: PageFixture, submenu: Locator) {
  const box = await submenu.boundingBox()
  if (!box) throw new Error('Sort submenu has no visible layout box')
  const viewport = await f.page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  expect(box.x).toBeGreaterThanOrEqual(-1)
  expect(box.y).toBeGreaterThanOrEqual(-1)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
  expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
}

async function openSortSubmenu(f: PageFixture) {
  const sidebar = await showSidebar(f)
  const menu = sidebar.getByTestId('workspace-organization-menu')
  const trigger = menu.locator('[data-workspace-menu-trigger]')
  await expect(trigger).toHaveAttribute('aria-label', f.sort.menu)
  await trigger.click()
  const sortCondition = f.page.getByRole('menuitem', { name: f.sort.sortCondition, exact: true })
  await expect(sortCondition).toBeVisible()
  await sortCondition.click()
  const submenu = f.page.getByTestId('workspace-sort-submenu')
  await expect(submenu).toBeVisible()
  await expectSubmenuFitsViewport(f, submenu)
  return { sidebar, trigger, submenu }
}

function hasSortInput(input: unknown, sortBy: SortBy): boolean {
  const parsed = z
    .object({ sortBy: z.enum(['createdAt', 'updatedAt']).optional() })
    .passthrough()
    .safeParse(input)
  return parsed.success && parsed.data.sortBy === sortBy
}

async function verifyLocale(host: OwnedHost, browser: Browser, locale: ShellLocale, width: number): Promise<void> {
  const f = await openPage(host, browser, locale, width)
  try {
    let sidebar = await showSidebar(f)
    await expect(sidebar.locator('.hbar-app-react-project-tree > section')).toHaveCount(5)
    await expect(workspaceRow(f, host.ready.hiddenWorkspace.id)).toHaveCount(0)

    const pinnedRow = workspaceRow(f, host.ready.pinnedWorkspace.id)
    await pinnedRow.getByTitle(f.copy.shell.workspaceActions(host.ready.pinnedWorkspace.name), { exact: true }).click()
    await f.page.getByRole('menuitem', { name: f.copy.shell.pinWorkspace, exact: true }).click()
    await expect(
      pinnedRow.getByTitle(f.copy.shell.pinnedWorkspace(host.ready.pinnedWorkspace.name), { exact: true }),
    ).toBeVisible()
    await expect(sidebar.locator('.hbar-app-react-project-tree > section').first()).toHaveAttribute(
      'data-workspace-id',
      host.ready.pinnedWorkspace.id,
    )

    const primaryRow = workspaceRow(f, host.ready.primaryWorkspace.id)
    const expand = primaryRow.locator('.hbar-app-react-workspace-row')
    if ((await expand.getAttribute('aria-expanded')) === 'false') await expand.click()
    const currentSessionButton = primaryRow.getByRole('button', {
      name: f.copy.shell.openSession(host.ready.selectedSession.title),
      exact: true,
    })
    await expect(currentSessionButton).toBeVisible()
    await currentSessionButton.click()
    const currentTab = f.page.getByRole('tab', {
      name: host.ready.selectedSession.title,
      exact: true,
      includeHidden: true,
    })
    await expect(currentTab).toHaveAttribute('aria-selected', 'true')
    const draft = `Sort preserves this draft — ${locale}`
    await composer(f).fill(draft)
    await expectComposerText(composer(f), draft)

    sidebar = await showSidebar(f)
    const idPage = await host.directory.execute('session.list', {
      workspaceId: host.ready.primaryWorkspace.id,
      limit: 100,
    })
    expect(idPage.items).toHaveLength(host.ready.idPageSessionCount)
    expect(idPage.items.some((session) => session.id === host.ready.selectedSession.id)).toBe(false)

    const updatedSessions = await host.directory.execute('session.activity.list', {
      workspaceId: host.ready.primaryWorkspace.id,
      sortBy: 'updatedAt',
      limit: 200,
    })
    const createdSessions = await host.directory.execute('session.activity.list', {
      workspaceId: host.ready.primaryWorkspace.id,
      sortBy: 'createdAt',
      limit: 200,
    })
    expect(updatedSessions.items[0]?.id).toBe(host.ready.selectedSession.id)
    expect(createdSessions.items[0]?.id).toBe(host.ready.createdHead.id)
    expect(createdSessions.items[0]?.id).not.toBe(host.ready.selectedSession.id)
    await expect(primaryRow.locator('.hbar-app-react-session-list [data-session-id]').first()).toHaveAttribute(
      'data-session-id',
      host.ready.selectedSession.id,
    )

    const beforeOrder = await expectedProjectIds(f, 'updatedAt')
    await expect.poll(() => projectIds(sidebar)).toEqual(beforeOrder)
    expect(beforeOrder[1]).toBe(host.ready.primaryWorkspace.id)
    const updatedSubmenu = await openSortSubmenu(f)
    const createdRadio = updatedSubmenu.submenu.getByRole('menuitemradio', { name: f.sort.createdAt, exact: true })
    const updatedRadio = updatedSubmenu.submenu.getByRole('menuitemradio', { name: f.sort.updatedAt, exact: true })
    await expect(updatedRadio).toHaveAttribute('aria-checked', 'true')
    await expect(createdRadio).toHaveAttribute('aria-checked', 'false')
    await mkdir(evidenceDirectory, { recursive: true })
    await f.page.screenshot({ path: join(evidenceDirectory, `${locale}-${width}-updated-sort-submenu.png`) })
    await createdRadio.click()
    await expect(updatedSubmenu.trigger).toBeFocused()

    const afterOrder = await expectedProjectIds(f, 'createdAt')
    await expect.poll(() => projectIds(sidebar)).toEqual(afterOrder)
    expect(afterOrder[1]).not.toBe(host.ready.primaryWorkspace.id)
    expect(afterOrder).not.toContain(host.ready.hiddenWorkspace.id)
    expect(afterOrder[0]).toBe(host.ready.pinnedWorkspace.id)
    await expect(workspaceRow(f, host.ready.hiddenWorkspace.id)).toHaveCount(0)
    await expect(
      workspaceRow(f, host.ready.pinnedWorkspace.id).getByTitle(
        f.copy.shell.pinnedWorkspace(host.ready.pinnedWorkspace.name),
        { exact: true },
      ),
    ).toBeVisible()

    await expect(primaryRow.locator('.hbar-app-react-session-list [data-session-id]').first()).toHaveAttribute(
      'data-session-id',
      createdSessions.items[0]?.id ?? '',
    )
    const createdSessionIds = await sessionIds(f)
    expect(createdSessionIds.length).toBeGreaterThan(0)
    expect(createdSessionIds[0]).toBe(createdSessions.items[0]?.id)
    expect(createdSessionIds).toEqual(
      createdSessions.items.slice(0, createdSessionIds.length).map((session) => session.id),
    )
    await primaryRow.getByRole('button', { name: f.copy.shell.loadMore, exact: true }).click()
    await expect(primaryRow.locator('.hbar-app-react-session-list [data-session-id]')).toHaveCount(
      createdSessions.items.length,
    )
    expect(await sessionIds(f)).toEqual(createdSessions.items.map((session) => session.id))
    expect(
      f.calls.some((call) => call.commandId === 'workspace.activity.list' && hasSortInput(call.input, 'createdAt')),
    ).toBe(true)
    expect(
      f.calls.some((call) => call.commandId === 'session.activity.list' && hasSortInput(call.input, 'createdAt')),
    ).toBe(true)
    await expect(currentTab).toHaveAttribute('aria-selected', 'true')
    await expectComposerText(composer(f), draft)
    await sidebar.locator('.hbar-app-react-project-tree > section').first().scrollIntoViewIfNeeded()
    const createdSubmenu = await openSortSubmenu(f)
    await expect(
      createdSubmenu.submenu.getByRole('menuitemradio', { name: f.sort.createdAt, exact: true }),
    ).toHaveAttribute('aria-checked', 'true')
    await expect(
      createdSubmenu.submenu.getByRole('menuitemradio', { name: f.sort.updatedAt, exact: true }),
    ).toHaveAttribute('aria-checked', 'false')
    await f.page.screenshot({ path: join(evidenceDirectory, `${locale}-${width}-created-sort-submenu.png`) })
    await createdSubmenu.submenu.getByRole('menuitemradio', { name: f.sort.createdAt, exact: true }).focus()
    await f.page.keyboard.press('ArrowDown')
    await expect(
      createdSubmenu.submenu.getByRole('menuitemradio', { name: f.sort.updatedAt, exact: true }),
    ).toBeFocused()
    await f.page.keyboard.press('Escape')
    await expect(f.page.getByRole('menuitem', { name: f.sort.sortCondition, exact: true })).toBeFocused()
    await f.page.keyboard.press('Escape')
    await expect(createdSubmenu.trigger).toBeFocused()

    await f.page.reload()
    sidebar = await showSidebar(f)
    await expect.poll(() => projectIds(sidebar)).toEqual(afterOrder)
    const persistedSubmenu = await openSortSubmenu(f)
    await expect(
      persistedSubmenu.submenu.getByRole('menuitemradio', { name: f.sort.createdAt, exact: true }),
    ).toHaveAttribute('aria-checked', 'true')
    await expect(workspaceRow(f, host.ready.hiddenWorkspace.id)).toHaveCount(0)
    await expect(workspaceRow(f, host.ready.pinnedWorkspace.id)).toHaveAttribute(
      'data-workspace-id',
      host.ready.pinnedWorkspace.id,
    )
    await expect(
      workspaceRow(f, host.ready.pinnedWorkspace.id).getByTitle(
        f.copy.shell.pinnedWorkspace(host.ready.pinnedWorkspace.name),
        { exact: true },
      ),
    ).toBeVisible()
    expect(f.calls.some((call) => call.commandId === 'run.submit')).toBe(false)
    expect((await host.external.call('session.snapshot', { sessionId: host.ready.selectedSession.id })).runs).toEqual(
      [],
    )
    expect(f.errors).toEqual([])
    expect(f.warnings).toEqual([])
  } finally {
    await stopPage(f)
  }
}

test('sort condition reorders Host workspace and session activity while retaining sidebar state', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const host = await startHost()
  try {
    await verifyLocale(host, browser, 'en-US', 1440)
    await verifyLocale(host, browser, 'zh-CN', 320)
  } finally {
    await stopHost(host)
  }
})
