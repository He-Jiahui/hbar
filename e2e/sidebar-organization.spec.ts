import { expect, test, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test'
import {
  HbarClient,
  createModelCommandClient,
  createRunCommandClient,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { sessionSchema, workspaceSchema } from '@hbar/contracts/directory'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, delimiter, dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { expectComposerText } from './support/composer-text'

const rootPrefix = 'hbar-sidebar-organization-e2e-'
const evidenceDirectory = resolve('artifacts/sidebar-organization/hbar-e2e')
const readySchema = z.strictObject({
  url: z.string().url(),
  wideToken: z.string().min(1),
  narrowToken: z.string().min(1),
  observerToken: z.string().min(1),
  workspaces: z.array(workspaceSchema).length(6),
  aliases: z.array(z.strictObject({ workspaceId: z.string().min(1), displayName: z.string().min(1) })).length(6),
  hiddenWorkspaceId: z.string().min(1),
  pinnedWorkspaceId: z.string().min(1),
  selectedSession: sessionSchema,
  activeSession: sessionSchema,
  activeRunId: z.string().min(1),
  timeRepresentatives: z.strictObject({
    today: sessionSchema,
    yesterday: sessionSchema,
    last7Days: sessionSchema,
    last30Days: sessionSchema,
    earlier: sessionSchema,
  }),
  sessionCount: z.number().int().min(61),
})
const rpcSchema = z
  .object({ params: z.object({ commandId: z.string().optional() }).passthrough().optional() })
  .passthrough()
type Ready = z.infer<typeof readySchema>
type DirectoryClient = ReturnType<typeof createWorkspaceSessionCommandClient>
type OwnedHost = {
  readonly root: string
  readonly child: ChildProcess
  readonly ready: Ready
  readonly external: HbarClient
  readonly directory: DirectoryClient
}
type SidebarFixture = {
  readonly host: OwnedHost
  readonly context: BrowserContext
  readonly page: Page
  readonly locale: ShellLocale
  readonly copy: ReturnType<typeof getShellCopy>
  readonly commandIds: string[]
  readonly errors: string[]
  readonly warnings: string[]
}

const screenshots = new Set<string>()

function bunExecutable(): string {
  if (process.platform !== 'win32') return 'bun'
  const candidate = (process.env.PATH ?? '')
    .split(delimiter)
    .flatMap((directory) => [join(directory, 'bun.exe'), join(directory, 'node_modules', 'bun', 'bin', 'bun.exe')])
    .find(existsSync)
  if (!candidate) throw new Error('Bun is unavailable for the owned sidebar-organization Host')
  return candidate
}

async function waitForReady(child: ChildProcess, diagnostics: () => string): Promise<Ready> {
  if (!child.stdout) throw new Error('Missing owned sidebar-organization Host stdout')
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
      const parsed = readySchema.safeParse(payload)
      if (parsed.success) finish(() => resolveReady(parsed.data))
    }
    const onError = (error: Error) => finish(() => reject(error))
    const onExit = (code: number | null) =>
      finish(() => reject(new Error(`Owned sidebar-organization Host exited ${code}: ${diagnostics()}`)))
    const timer = setTimeout(
      () => finish(() => reject(new Error(`Owned sidebar-organization Host startup timed out: ${diagnostics()}`))),
      90_000,
    )
    lines.on('line', onLine)
    child.once('error', onError)
    child.once('exit', onExit)
  })
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return true
  return new Promise<boolean>((resolveExit) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit)
      resolveExit(false)
    }, timeoutMs)
    const onExit = () => {
      clearTimeout(timer)
      resolveExit(true)
    }
    child.once('exit', onExit)
  })
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (!child.stdin) throw new Error('Owned sidebar-organization Host has no stop channel')
  child.stdin.write('stop\n')
  if (await waitForExit(child, 5_000)) return
  child.kill()
  if (!(await waitForExit(child, 5_000))) throw new Error('Owned sidebar-organization Host did not stop')
}

async function removeOwnedRoot(root: string): Promise<void> {
  const target = await realpath(root)
  if (dirname(target) !== (await realpath(tmpdir())) || !basename(target).startsWith(rootPrefix))
    throw new Error('Refusing cleanup outside this exact sidebar-organization fixture root')
  await rm(target, { recursive: true, force: true })
}

async function startHost(): Promise<OwnedHost> {
  const root = await mkdtemp(join(tmpdir(), rootPrefix))
  const assets = resolve(process.env.HBAR_SIDEBAR_ORGANIZATION_WEB_DIST ?? 'dist/web')
  if (!existsSync(join(assets, 'index.html'))) {
    await removeOwnedRoot(root)
    throw new Error('Production Web bundle is missing; build dist/web before running this sidebar E2E')
  }
  const child = spawn(bunExecutable(), ['e2e/support/sidebar-organization-host.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HBAR_SIDEBAR_ORGANIZATION_ROOT: root,
      HBAR_SIDEBAR_ORGANIZATION_WEB_DIST: assets,
    },
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
    await stopChild(child)
    await removeOwnedRoot(root)
    throw error
  }
}

async function stopHost(host: OwnedHost): Promise<void> {
  host.external.disconnect()
  await stopChild(host.child)
  await removeOwnedRoot(host.root)
}

function captureCommandIds(page: Page, commandIds: string[]): void {
  page.on('websocket', (socket) =>
    socket.on('framesent', ({ payload }) => {
      if (typeof payload !== 'string') return
      try {
        const parsed = rpcSchema.safeParse(JSON.parse(payload) as unknown)
        const commandId = parsed.success ? parsed.data.params?.commandId : undefined
        if (commandId) commandIds.push(commandId)
      } catch {
        // Non-JSON websocket frames are outside the command-call assertion.
      }
    }),
  )
}

async function openPage(
  host: OwnedHost,
  browser: Browser,
  locale: ShellLocale,
  width: number,
): Promise<SidebarFixture> {
  const context = await browser.newContext({
    locale,
    timezoneId: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport: { width, height: 900 },
  })
  context.setDefaultTimeout(10_000)
  const token = locale === 'en-US' ? host.ready.wideToken : host.ready.narrowToken
  try {
    const paired = await context.request.post(`${host.ready.url}/auth/token`, { data: { token } })
    expect(paired.ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    const warnings: string[] = []
    const commandIds: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning')
        warnings.push(`${message.type()}: ${message.text()}`)
    })
    captureCommandIds(page, commandIds)
    await page.goto(host.ready.url)
    if (process.env.HBAR_SIDEBAR_ORGANIZATION_EXPECTED_ASSET)
      await expect(page.locator('script[type="module"][src]')).toHaveAttribute(
        'src',
        new RegExp(process.env.HBAR_SIDEBAR_ORGANIZATION_EXPECTED_ASSET),
      )
    return { host, context, page, locale, copy: getShellCopy(locale), commandIds, errors, warnings }
  } catch (error) {
    await context.close()
    throw error
  }
}

async function stopPage(f: SidebarFixture): Promise<void> {
  await f.context.close()
}

async function showSidebar(f: SidebarFixture): Promise<Locator> {
  const sidebar = f.page.locator('.hbar-app-react-project-tree')
  if (!(await sidebar.isVisible()))
    await f.page.getByRole('button', { name: f.copy.shell.showSidebar, exact: true }).click()
  await expect(sidebar).toBeVisible()
  return sidebar
}

function projectRow(sidebar: Locator, workspaceId: string): Locator {
  return sidebar.locator(`section[data-workspace-id="${workspaceId}"]`)
}

async function projectIds(sidebar: Locator): Promise<string[]> {
  return sidebar
    .locator(':scope > section[data-workspace-id]')
    .evaluateAll((sections) => sections.map((section) => section.getAttribute('data-workspace-id') ?? ''))
}

function composer(page: Page, f: SidebarFixture): Locator {
  return page.getByRole('textbox', { name: f.copy.session.prompt.input, exact: true, includeHidden: true })
}

async function selectFixtureSession(f: SidebarFixture): Promise<void> {
  const sidebar = await showSidebar(f)
  const selectedAlias = f.host.ready.aliases.find(
    ({ workspaceId }) => workspaceId === f.host.ready.selectedSession.workspaceId,
  )
  if (!selectedAlias) throw new Error('The selected fixture session has no aliased project')
  const row = projectRow(sidebar, selectedAlias.workspaceId)
  const disclosure = row.locator('.hbar-app-react-workspace-row')
  if ((await disclosure.getAttribute('aria-expanded')) === 'false') await disclosure.click()
  await row
    .getByRole('button', {
      name: f.copy.shell.openSession(f.host.ready.selectedSession.title),
      exact: true,
    })
    .click()
  await expect(
    f.page.getByRole('tab', { name: f.host.ready.selectedSession.title, exact: true, includeHidden: true }),
  ).toHaveAttribute('aria-selected', 'true')
  await expect(composer(f.page, f)).toBeVisible()
}

async function pinFixtureProject(f: SidebarFixture): Promise<void> {
  const sidebar = await showSidebar(f)
  const target = f.host.ready.aliases.find(({ workspaceId }) => workspaceId === f.host.ready.pinnedWorkspaceId)
  if (!target) throw new Error('The fixture pin project has no display name')
  const row = projectRow(sidebar, target.workspaceId)
  await row.getByTitle(f.copy.shell.workspaceActions(target.displayName), { exact: true }).click()
  await f.page.getByRole('menuitem', { name: f.copy.shell.pinWorkspace, exact: true }).click()
  await expect(row.getByTitle(f.copy.shell.pinnedWorkspace(target.displayName), { exact: true })).toBeVisible()
}

async function openOrganizationSubmenu(f: SidebarFixture) {
  const root = f.page.getByTestId('workspace-organization-menu')
  const trigger = root.locator('[data-workspace-menu-trigger]')
  await expect(trigger).toHaveAttribute('aria-label', f.copy.shell.sort.menu)
  await trigger.click()
  const mainMenu = f.page.getByRole('menu', { name: f.copy.shell.sort.menu, exact: true })
  await expect(mainMenu).toBeVisible()
  const organize = mainMenu.getByRole('menuitem', {
    name: f.copy.shell.sort.organization.organize,
    exact: true,
  })
  await organize.click()
  const submenu = f.page.getByTestId('workspace-organization-submenu')
  await expect(submenu).toBeVisible()
  return { trigger, organize, submenu }
}

async function chooseOrganization(f: SidebarFixture, mode: 'project' | 'recentProject' | 'time'): Promise<void> {
  const { trigger, submenu } = await openOrganizationSubmenu(f)
  const name =
    mode === 'project'
      ? f.copy.shell.sort.organization.byProject
      : mode === 'recentProject'
        ? f.copy.shell.sort.organization.recentProjects
        : f.copy.shell.sort.organization.byTime
  await submenu.getByRole('menuitemradio', { name, exact: true }).click()
  await expect(trigger).toBeFocused()
  await expect(f.page.locator('.hbar-app-react-project-tree')).toHaveAttribute('data-sidebar-organization', mode)
}

async function expectOrganizationOrder(
  f: SidebarFixture,
  sidebar: Locator,
  organization: 'project' | 'recentProject',
): Promise<void> {
  const page = await f.host.directory.execute('workspace.sidebar.list', {
    organization,
    sortBy: 'updatedAt',
    locale: f.locale,
    limit: 200,
  })
  const workspaceIds = page.items.map(({ workspace }) => workspace.id)
  const visibleAliasNames = page.items.map(({ displayName }) => displayName)
  expect(page.items.some(({ workspace }) => workspace.id === f.host.ready.hiddenWorkspaceId)).toBe(false)
  expect(visibleAliasNames).toEqual(
    organization === 'project'
      ? [...visibleAliasNames].sort((left, right) => left.localeCompare(right, f.locale, { sensitivity: 'base' }))
      : visibleAliasNames,
  )
  const expected = [
    f.host.ready.pinnedWorkspaceId,
    ...workspaceIds.filter((id) => id !== f.host.ready.pinnedWorkspaceId),
  ]
  await expect.poll(() => projectIds(sidebar)).toEqual(expected)
  await expect(projectRow(sidebar, f.host.ready.hiddenWorkspaceId)).toHaveCount(0)
  const pinnedAlias = f.host.ready.aliases.find(({ workspaceId }) => workspaceId === f.host.ready.pinnedWorkspaceId)
  if (!pinnedAlias) throw new Error('The pinned project is missing its Host display name')
  await expect(
    projectRow(sidebar, f.host.ready.pinnedWorkspaceId).getByTitle(
      f.copy.shell.pinnedWorkspace(pinnedAlias.displayName),
      { exact: true },
    ),
  ).toBeVisible()
}

async function expectSubmenuFitsViewport(f: SidebarFixture, submenu: Locator): Promise<void> {
  const box = await submenu.boundingBox()
  if (!box) throw new Error('Organization submenu has no visible layout box')
  const viewport = await f.page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
  expect(box.x).toBeGreaterThanOrEqual(-1)
  expect(box.y).toBeGreaterThanOrEqual(-1)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
  expect(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
}

function sessionRow(sidebar: Locator, sessionId: string): Locator {
  return sidebar.locator(`.hbar-app-react-sidebar-time-view [data-session-id="${sessionId}"]`)
}

async function timeGroup(sidebar: Locator, label: string): Promise<Locator> {
  const heading = sidebar.getByRole('heading', { name: label, exact: true })
  const id = await heading.getAttribute('id')
  if (!id) throw new Error(`Time group heading has no accessible relationship id: ${label}`)
  return sidebar.locator(`section[aria-labelledby="${id}"]`)
}

async function capture(f: SidebarFixture, name: string): Promise<void> {
  await mkdir(evidenceDirectory, { recursive: true })
  await f.page.screenshot({ path: join(evidenceDirectory, name), fullPage: false })
  screenshots.add(name)
}

function expectNoCreationOrRunCommands(f: SidebarFixture): void {
  expect(f.commandIds).not.toContain('session.create')
  expect(f.commandIds).not.toContain('app.createSession')
  expect(f.commandIds).not.toContain('run.submit')
}

test.describe('sidebar organization modes', () => {
  test('recent projects use native title drag and keyboard menu moves without changing the open session', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const host = await startHost()
    let f: SidebarFixture | undefined
    try {
      f = await openPage(host, browser, 'en-US', 1440)
      let sidebar = await showSidebar(f)
      await selectFixtureSession(f)
      await pinFixtureProject(f)
      await expectOrganizationOrder(f, sidebar, 'recentProject')
      const draft = 'Project movement must leave this draft alone.'
      await composer(f.page, f).fill(draft)
      const modelText = await f.page.locator('.hbar-composer-model-trigger').innerText()
      const thinkingText = await f.page.locator('.hbar-composer-thinking-trigger').innerText()
      const original = await projectIds(sidebar)
      const sourceId = original.at(-1)
      const targetId = original[1]
      if (!sourceId || !targetId) throw new Error('Missing ordinary projects to reorder')
      for (const id of original) {
        const disclosure = projectRow(sidebar, id).locator('.hbar-app-react-workspace-row')
        if ((await disclosure.getAttribute('aria-expanded')) === 'true') await disclosure.click()
      }
      const source = projectRow(sidebar, sourceId).locator('.hbar-app-react-workspace-row')
      await expect(source).toHaveAttribute('draggable', 'true')
      await capture(f, 'en1440-projects-before.png')
      const sourceBox = await source.boundingBox()
      const targetBox = await projectRow(sidebar, targetId).boundingBox()
      if (!sourceBox || !targetBox) throw new Error('Missing project drag geometry')
      await f.page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
      await f.page.mouse.down()
      await f.page.mouse.move(sourceBox.x + sourceBox.width / 2 + 12, sourceBox.y + sourceBox.height / 2, { steps: 4 })
      await f.page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 8, { steps: 10 })
      await f.page.mouse.move(targetBox.x + targetBox.width / 2 + 2, targetBox.y + 8)
      await expect(projectRow(sidebar, targetId)).toHaveAttribute('data-project-drop', 'before')
      await capture(f, 'en1440-project-drag-before.png')
      await f.page.mouse.up()
      const dragged = [original[0], sourceId, ...original.slice(1, -1)]
      await expect.poll(() => projectIds(sidebar)).toEqual(dragged)
      await expect(source).toHaveAttribute('aria-expanded', 'false')
      await expectComposerText(composer(f.page, f), draft)
      await expect(f.page.locator('.hbar-composer-model-trigger')).toHaveText(modelText)
      await expect(f.page.locator('.hbar-composer-thinking-trigger')).toHaveText(thinkingText)
      await expect(
        f.page.getByRole('tab', { name: host.ready.selectedSession.title, exact: true, includeHidden: true }),
      ).toHaveAttribute('aria-selected', 'true')
      await capture(f, 'en1440-project-drag-after.png')
      const sourceAlias = host.ready.aliases.find((item) => item.workspaceId === sourceId)
      if (!sourceAlias) throw new Error('Missing moved project alias')
      await projectRow(sidebar, sourceId)
        .getByTitle(f.copy.shell.workspaceActions(sourceAlias.displayName), { exact: true })
        .click()
      await expect(f.page.getByRole('menuitem', { name: f.copy.shell.sort.reorder.moveUp, exact: true })).toBeDisabled()
      const down = f.page.getByRole('menuitem', { name: f.copy.shell.sort.reorder.moveDown, exact: true })
      await capture(f, 'en1440-project-move-menu.png')
      await down.focus()
      await down.press('Enter')
      const moved = [dragged[0], dragged[2], dragged[1], ...dragged.slice(3)]
      await expect.poll(() => projectIds(sidebar)).toEqual(moved)
      await expectComposerText(composer(f.page, f), draft)
      await f.page.reload()
      sidebar = await showSidebar(f)
      await expect.poll(() => projectIds(sidebar)).toEqual(moved)
      await chooseOrganization(f, 'project')
      await expect(projectRow(sidebar, sourceId).locator('.hbar-app-react-workspace-row')).toHaveAttribute(
        'draggable',
        'false',
      )
      await chooseOrganization(f, 'recentProject')
      await expectOrganizationOrder(f, sidebar, 'recentProject')
      expectNoCreationOrRunCommands(f)
      expect(f.errors).toEqual([])
      expect(f.warnings).toEqual([])
    } finally {
      if (f) await stopPage(f)
      await stopHost(host)
    }
  })
  test('project alias order, recent activity, time groups and saved Bell return preserve the open session', async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const host = await startHost()
    let f: SidebarFixture | undefined
    try {
      f = await openPage(host, browser, 'en-US', 1440)
      let sidebar = await showSidebar(f)
      await selectFixtureSession(f)
      await pinFixtureProject(f)

      const prompt = composer(f.page, f)
      const draft = 'Sidebar organization must keep this unsent draft.'
      await prompt.fill(draft)
      await expectComposerText(prompt, draft)
      const model = f.page.locator('.hbar-composer-model-trigger')
      const thinking = f.page.locator('.hbar-composer-thinking-trigger')
      await expect(model).toBeVisible()
      await expect(thinking).toBeVisible()
      const modelText = await model.innerText()
      const thinkingText = await thinking.innerText()
      const modelCommands = createModelCommandClient(host.external)
      const beforeModel = await modelCommands.execute('session.getModel', {
        sessionId: host.ready.selectedSession.id,
      })
      const selectedTab = f.page.getByRole('tab', {
        name: host.ready.selectedSession.title,
        exact: true,
        includeHidden: true,
      })
      const expectSelectedState = async () => {
        await expect(selectedTab).toHaveAttribute('aria-selected', 'true')
        await expectComposerText(prompt, draft)
        await expect(model).toHaveText(modelText)
        await expect(thinking).toHaveText(thinkingText)
        expect(await modelCommands.execute('session.getModel', { sessionId: host.ready.selectedSession.id })).toEqual(
          beforeModel,
        )
      }

      await chooseOrganization(f, 'project')
      sidebar = await showSidebar(f)
      await expectSelectedState()
      await expectOrganizationOrder(f, sidebar, 'project')
      const projectSubmenu = await openOrganizationSubmenu(f)
      await expect(
        projectSubmenu.submenu.getByRole('menuitemradio', {
          name: f.copy.shell.sort.organization.byProject,
          exact: true,
        }),
      ).toHaveAttribute('aria-checked', 'true')
      await f.page.keyboard.press('Escape')
      await f.page.keyboard.press('Escape')
      await expect(projectSubmenu.trigger).toBeFocused()

      await chooseOrganization(f, 'recentProject')
      await expectSelectedState()
      await expectOrganizationOrder(f, sidebar, 'recentProject')
      const projectPage = await host.directory.execute('workspace.sidebar.list', {
        organization: 'project',
        sortBy: 'updatedAt',
        locale: 'en-US',
        limit: 200,
      })
      const recentPage = await host.directory.execute('workspace.sidebar.list', {
        organization: 'recentProject',
        sortBy: 'updatedAt',
        locale: 'en-US',
        limit: 200,
      })
      expect(recentPage.items[0]?.displayName).toBe('Alpha Project')
      expect(recentPage.items.map(({ displayName }) => displayName)).not.toEqual(
        projectPage.items.map(({ displayName }) => displayName),
      )
      expect(recentPage.items.findIndex(({ displayName }) => displayName === 'Delta Project')).toBeLessThan(
        recentPage.items.findIndex(({ displayName }) => displayName === 'Charlie Project'),
      )

      const organization = await host.directory.execute('workspaceOrganization.get', {})
      expect(organization.hiddenWorkspaceIds).toContain(host.ready.hiddenWorkspaceId)

      await f.page.getByTestId('sidebar-time-toggle').click()
      sidebar = await showSidebar(f)
      await expect(sidebar).toHaveAttribute('data-sidebar-organization', 'time')
      const bell = f.page.getByTestId('sidebar-time-toggle')
      await expect(bell).toHaveAttribute('aria-pressed', 'true')
      await expect(bell).toHaveAttribute('aria-label', f.copy.shell.sort.time.showProjects)

      const pageOne = await host.directory.execute('session.activity.global.list', { limit: 60 })
      expect(pageOne.items).toHaveLength(60)
      expect(pageOne.nextCursor).not.toBeNull()
      expect(pageOne.items[0]?.session.id).toBe(host.ready.activeSession.id)
      expect(pageOne.items[0]?.execution.state).toBe('running')
      const pageTwo = await host.directory.execute('session.activity.global.list', {
        cursor: pageOne.nextCursor ?? undefined,
        limit: 60,
      })
      expect(pageTwo.items).toHaveLength(host.ready.sessionCount - 60)
      expect(pageTwo.items.every((item) => !pageOne.items.some((first) => first.session.id === item.session.id))).toBe(
        true,
      )

      const groups = f.copy.shell.sort.time.groups
      const expectedHeadings = [
        groups.running,
        groups.today,
        groups.yesterday,
        groups.last7Days,
        groups.last30Days,
        groups.earlier,
      ]
      const heading = sidebar.locator('.hbar-app-react-sidebar-time-heading')
      await expect(heading).toHaveText(expectedHeadings)
      const activeRow = sessionRow(sidebar, host.ready.activeSession.id)
      await expect(activeRow.locator('.hbar-app-react-session-workspace-label')).toHaveText('Alpha Project')
      await expect(activeRow.locator('.hbar-app-react-session-activity-indicator')).toHaveAttribute(
        'aria-label',
        f.copy.shell.sort.time.execution.running,
      )
      const selectedRow = sessionRow(sidebar, host.ready.selectedSession.id)
      await expect(selectedRow.locator('.hbar-app-react-session-workspace-label')).toHaveText('Delta Project')
      await expect(selectedRow).toHaveAttribute('data-selected', 'true')
      expect(
        await selectedRow
          .locator('.hbar-app-react-session-workspace-label')
          .evaluate((node) => getComputedStyle(node).textAlign),
      ).toBe('start')
      expect(
        await selectedRow.locator('.hbar-app-react-session-workspace-label').evaluate((node) => {
          const style = getComputedStyle(node)
          return { whiteSpace: style.whiteSpace, textOverflow: style.textOverflow, overflow: style.overflow }
        }),
      ).toEqual({ whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' })
      const yesterdayGroup = await timeGroup(sidebar, groups.yesterday)
      const last7DaysGroup = await timeGroup(sidebar, groups.last7Days)
      const last30DaysGroup = await timeGroup(sidebar, groups.last30Days)
      const earlierGroup = await timeGroup(sidebar, groups.earlier)
      await expect(earlierGroup.locator('[data-session-id]')).toHaveCount(1)
      await expect(
        yesterdayGroup.locator(`[data-session-id="${host.ready.timeRepresentatives.yesterday.id}"]`),
      ).toHaveCount(1)
      await expect(
        last7DaysGroup.locator(`[data-session-id="${host.ready.timeRepresentatives.last7Days.id}"]`),
      ).toHaveCount(1)
      await expect(
        last30DaysGroup.locator(`[data-session-id="${host.ready.timeRepresentatives.last30Days.id}"]`),
      ).toHaveCount(1)
      const loadMore = sidebar.getByRole('button', { name: f.copy.shell.loadMore, exact: true })
      await expect(loadMore).toBeVisible()
      await loadMore.scrollIntoViewIfNeeded()
      await capture(f, 'en1440-time-bottom.png')
      const loadedBefore = await sidebar.locator('.hbar-app-react-sidebar-time-view [data-session-id]').count()
      await loadMore.click()
      await expect
        .poll(() => sidebar.locator('.hbar-app-react-sidebar-time-view [data-session-id]').count())
        .toBe(host.ready.sessionCount)
      const timeRows = sidebar.locator('.hbar-app-react-sidebar-time-view [data-session-id]')
      expect(await timeRows.count()).toBeGreaterThan(loadedBefore)
      const loadedSessionIds = await timeRows.evaluateAll((rows) =>
        rows.map((row) => row.getAttribute('data-session-id') ?? ''),
      )
      expect(loadedSessionIds).toHaveLength(host.ready.sessionCount)
      await expect(
        earlierGroup.locator(`[data-session-id="${host.ready.timeRepresentatives.earlier.id}"]`),
      ).toHaveCount(1)
      await activeRow.scrollIntoViewIfNeeded()
      await capture(f, 'en1440-time-top.png')

      await expectSelectedState()
      expectNoCreationOrRunCommands(f)
      const activeOperation = createRunCommandClient(host.external)
      const initialRun = await host.external.call('session.snapshot', {
        sessionId: host.ready.activeSession.id,
      })
      expect(initialRun.runs).toHaveLength(1)
      expect(initialRun.runs[0]?.id).toBe(host.ready.activeRunId)
      expect(initialRun.runs[0]?.status).toBe('running')

      await earlierGroup.locator('[data-session-id]').last().scrollIntoViewIfNeeded()
      await expect(activeRow).not.toBeInViewport()
      const cancel = await activeOperation.execute('operation.cancel', { operationId: host.ready.activeRunId })
      expect(cancel.status).toBe('cancelRequested')
      await expect(activeRow.locator('.hbar-app-react-session-activity-indicator')).toHaveAttribute(
        'aria-label',
        f.copy.shell.sort.time.execution.cancelRequested,
      )
      await expect(activeRow).not.toBeInViewport()
      expect(
        await timeRows.evaluateAll((rows) => rows.map((row) => row.getAttribute('data-session-id') ?? '')),
      ).toEqual(loadedSessionIds)
      const updatedActivity = await host.directory.execute('session.activity.global.list', { limit: 60 })
      expect(
        updatedActivity.items.find(({ session }) => session.id === host.ready.activeSession.id)?.execution.state,
      ).toBe('cancelRequested')
      expect((await activeOperation.execute('operation.get', { operationId: host.ready.activeRunId })).status).toBe(
        'cancelRequested',
      )
      expect(f.commandIds).not.toContain('operation.cancel')
      await expectSelectedState()

      expect((await host.external.call('session.snapshot', { sessionId: host.ready.selectedSession.id })).runs).toEqual(
        [],
      )
      const activeSnapshot = await host.external.call('session.snapshot', {
        sessionId: host.ready.activeSession.id,
      })
      expect(activeSnapshot.runs).toHaveLength(1)
      // Cancellation is an event overlay; the raw stored Run remains running because this fixture has no dispatcher.
      expect(activeSnapshot.runs[0]?.status).toBe('running')

      await f.page.reload()
      sidebar = await showSidebar(f)
      await expect(sidebar).toHaveAttribute('data-sidebar-organization', 'time')
      await expect(f.page.getByTestId('sidebar-time-toggle')).toHaveAttribute('aria-pressed', 'true')
      await expect(sessionRow(sidebar, host.ready.selectedSession.id)).toHaveAttribute('data-selected', 'true')
      await expect(selectedTab).toHaveAttribute('aria-selected', 'true')
      await expect(f.page.locator('.hbar-composer-model-trigger')).toHaveText(modelText)
      await expect(f.page.locator('.hbar-composer-thinking-trigger')).toHaveText(thinkingText)
      expect(await modelCommands.execute('session.getModel', { sessionId: host.ready.selectedSession.id })).toEqual(
        beforeModel,
      )
      const postReloadDraft = 'Bell return must keep this current unsent draft.'
      await composer(f.page, f).fill(postReloadDraft)
      await expectComposerText(composer(f.page, f), postReloadDraft)
      await f.page.getByTestId('sidebar-time-toggle').click()
      await expect(sidebar).toHaveAttribute('data-sidebar-organization', 'recentProject')
      await expect(f.page.getByTestId('sidebar-time-toggle')).toHaveAttribute('aria-pressed', 'false')
      await expect(selectedTab).toHaveAttribute('aria-selected', 'true')
      await expectComposerText(composer(f.page, f), postReloadDraft)
      await expectOrganizationOrder(f, sidebar, 'recentProject')
      const persisted = await openOrganizationSubmenu(f)
      await expect(
        persisted.submenu.getByRole('menuitemradio', {
          name: f.copy.shell.sort.organization.recentProjects,
          exact: true,
        }),
      ).toHaveAttribute('aria-checked', 'true')
      await f.page.keyboard.press('Escape')
      await f.page.keyboard.press('Escape')
      await expect(persisted.trigger).toBeFocused()
      await expectComposerText(composer(f.page, f), postReloadDraft)
      await expect(f.page.locator('.hbar-composer-model-trigger')).toHaveText(modelText)
      await expect(f.page.locator('.hbar-composer-thinking-trigger')).toHaveText(thinkingText)
      expect(await modelCommands.execute('session.getModel', { sessionId: host.ready.selectedSession.id })).toEqual(
        beforeModel,
      )
      expectNoCreationOrRunCommands(f)
      expect(f.errors).toEqual([])
      expect(f.warnings).toEqual([])
    } finally {
      if (f) await stopPage(f)
      await stopHost(host)
    }
  })

  test('zh 320 sidebar submenu stays inside the viewport and restores focus with Escape', async ({ browser }) => {
    test.setTimeout(180_000)
    const host = await startHost()
    let f: SidebarFixture | undefined
    try {
      f = await openPage(host, browser, 'zh-CN', 320)
      const sidebar = await showSidebar(f)
      await expect.poll(() => projectIds(sidebar)).toHaveLength(5)
      const initialProjects = await projectIds(sidebar)
      const firstId = initialProjects[0]
      const firstAlias = host.ready.aliases.find((item) => item.workspaceId === firstId)
      if (!firstId || !firstAlias) throw new Error('Missing first narrow project')
      const firstProject = projectRow(sidebar, firstId)
      await firstProject.getByTitle(f.copy.shell.workspaceActions(firstAlias.displayName), { exact: true }).click()
      const projectMenu = firstProject.getByRole('menu')
      await expect(
        projectMenu.getByRole('menuitem', { name: f.copy.shell.sort.reorder.moveUp, exact: true }),
      ).toBeDisabled()
      await expectSubmenuFitsViewport(f, projectMenu)
      await capture(f, 'zh320-project-move-menu.png')
      const moveDown = projectMenu.getByRole('menuitem', { name: f.copy.shell.sort.reorder.moveDown, exact: true })
      await moveDown.focus()
      await moveDown.press('Enter')
      await expect
        .poll(() => projectIds(sidebar))
        .toEqual([initialProjects[1], initialProjects[0], ...initialProjects.slice(2)])
      const { trigger, organize, submenu } = await openOrganizationSubmenu(f)
      await expect(submenu.getByRole('menuitemradio', { checked: true })).toHaveCount(1)
      await expect(
        submenu.getByRole('menuitemradio', {
          name: f.copy.shell.sort.organization.recentProjects,
          exact: true,
        }),
      ).toHaveAttribute('aria-checked', 'true')
      await expect(submenu.getByRole('menuitemradio', { checked: true })).toBeFocused()
      await expectSubmenuFitsViewport(f, submenu)
      await capture(f, 'zh320-organization-submenu.png')
      await f.page.keyboard.press('Escape')
      await expect(organize).toBeFocused()
      await f.page.keyboard.press('Escape')
      await expect(trigger).toBeFocused()

      const bell = f.page.getByTestId('sidebar-time-toggle')
      await bell.click()
      await expect(sidebar).toHaveAttribute('data-sidebar-organization', 'time')
      await expect(bell).toHaveAttribute('aria-pressed', 'true')
      await expect(sidebar.locator('.hbar-app-react-sidebar-time-heading').first()).toHaveText(
        f.copy.shell.sort.time.groups.running,
      )
      await expect(f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).resolves.toBe(true)
      await sidebar.locator('.hbar-app-react-sidebar-time-view').scrollIntoViewIfNeeded()
      await capture(f, 'zh320-time-top.png')
      expectNoCreationOrRunCommands(f)
      expect(f.errors).toEqual([])
      expect(f.warnings).toEqual([])
    } finally {
      if (f) await stopPage(f)
      await stopHost(host)
    }
  })
})

test.afterAll(async () => {
  await mkdir(evidenceDirectory, { recursive: true })
  await writeFile(
    join(evidenceDirectory, 'manifest.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        source: 'Playwright against a disposable real Host and production Web assets',
        expectedAsset: process.env.HBAR_SIDEBAR_ORGANIZATION_EXPECTED_ASSET ?? null,
        originalReference: 'artifacts/project-sort-reference-v5/manifest.json',
        projectDragReference: 'artifacts/project-drag-reference-v6/manifest.json',
        fixtureBoundary:
          'Six synthetic projects and 69 Sessions in a temporary profile; one directly stored mock Run is never dispatched. No paid provider or real profile.',
        captures: [...screenshots].sort(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  )
})
