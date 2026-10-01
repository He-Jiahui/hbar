import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { createWorkspaceSessionCommandClient } from '@hbar/client'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { z } from 'zod'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { workspaceTabsCopy } from '../apps/web/src/workspace-tabs-copy'
import { expectComposerText } from './support/composer-text'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'
import { openSessionTool } from './support/session-tools-menu'

const origin = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
const port = Number(process.env.HBAR_E2E_HOST_PORT ?? 4317)
const evidence = 'artifacts/session-tool-ownership/final'
const aPath = 'original-A-会话文件-keep-unsaved-draft.md'
const cPath = 'independent-C-workspace-原目标文件.md'
const aDisk = '# Original A disk\n'
const cDisk = '# Independent C disk\n'
const aDirty = '# Unsaved A file\n不得切换到其他工程或自动保存\n'
const cDirty = '# Unsaved C file\nC 的独立文件草稿\n'
const materialName = 'A-original-material.md'
const latePath = 'A-delayed-original-read.md'
const lateText = '# Delayed A-only read\nNot a B document\n'
type Copy = ReturnType<typeof getShellCopy>
type Session = Readonly<{ id: string; title: string; workspaceId: string }>
type Workspace = Readonly<{ id: string; name: string; path: string }>
type Tool = 'files' | 'monitoring' | 'agents' | 'goals'
interface Fixture {
  readonly root: string
  readonly context: BrowserContext
  readonly page: Page
  readonly host: WebSessionHost
  readonly copy: Copy
  readonly locale: ShellLocale
  readonly a: Session
  readonly b: Session
  readonly c: Session
  readonly firstWorkspace: Workspace
  readonly secondWorkspace: Workspace
  readonly errors: string[]
  readonly writes: string[]
}
const rpc = z.object({ params: z.object({ commandId: z.string().optional() }).passthrough().optional() }).passthrough()

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true })
})

async function removeRoot(root: string): Promise<void> {
  const resolved = await realpath(root)
  if (dirname(resolved) !== (await realpath(tmpdir())) || !basename(resolved).startsWith('hbar-session-tool-owner-'))
    throw new Error('Refusing cleanup outside the original owned session-tool fixture')
  await rm(resolved, { recursive: true, force: true })
}
async function start(
  browser: Browser,
  locale: ShellLocale,
  beforeNavigate?: (page: Page, workspaceId: string) => Promise<void>,
): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'hbar-session-tool-owner-'))
  const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    const secondPath = join(root, 'Independent-project-C-明确原工程')
    await mkdir(secondPath)
    await writeFile(join(root, aPath), aDisk)
    await writeFile(join(root, latePath), lateText)
    await writeFile(join(secondPath, cPath), cDisk)
    host = await startWebSessionHost({ root, port, sessionCount: 2, goalAutoContinue: false })
    const commands = createWorkspaceSessionCommandClient(host.client)
    const sessions = await commands.execute('session.list', { workspaceId: host.ready.workspaceId, limit: 100 })
    const a = sessions.items.find((item) => item.title === 'Session 001')
    const b = sessions.items.find((item) => item.title === 'Session 002')
    const firstWorkspace = await commands.execute('workspace.get', { workspaceId: host.ready.workspaceId })
    if (!a || !b || !firstWorkspace) throw new Error('The original Host session/workspace facts are missing')
    const secondWorkspace = await commands.execute('workspace.create', { path: secondPath })
    const c = await commands.execute(
      'session.create',
      {
        workspaceId: secondWorkspace.id,
        title: 'Independent C — 独立工程会话',
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    expect((await context.request.post(`${origin}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    const errors: string[] = []
    const writes: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('websocket', (socket) =>
      socket.on('framesent', ({ payload }) => {
        if (typeof payload !== 'string') return
        const parsed: unknown = JSON.parse(payload)
        const command = rpc.safeParse(parsed)
        if (
          command.success &&
          ['run.submit', 'run.cancel', 'file.write'].includes(command.data.params?.commandId ?? '')
        )
          writes.push(command.data.params?.commandId ?? '')
      }),
    )
    await beforeNavigate?.(page, firstWorkspace.id)
    await page.goto(origin)
    const copy = getShellCopy(locale)
    const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
    if (await show.isVisible()) await show.click()
    // Initial workspace discovery expands its first real project. Wait for its
    // roster before examining another project's toggle, avoiding startup TOCTOU.
    await expect(page.locator('.hbar-app-react-session-target').first()).toBeVisible()
    const fixture = {
      root,
      context,
      page,
      host,
      copy,
      locale,
      a,
      b,
      c,
      firstWorkspace,
      secondWorkspace,
      errors,
      writes,
    }
    await select(fixture, a)
    return fixture
  } catch (reason) {
    await context.close()
    if (host) {
      await stopWebSessionHost(host)
      const captured = host
      await expect.poll(() => captured.child.exitCode !== null || captured.child.signalCode !== null).toBe(true)
      await removeRoot(root)
    }
    throw reason
  }
}
async function stop(fixture: Fixture): Promise<void> {
  await fixture.context.close()
  await stopWebSessionHost(fixture.host)
  await expect.poll(() => fixture.host.child.exitCode !== null || fixture.host.child.signalCode !== null).toBe(true)
  await removeRoot(fixture.root)
}
async function sidebar(fixture: Fixture, visible: boolean): Promise<void> {
  const { page, copy } = fixture
  const button = page.getByRole('button', {
    name: visible ? copy.shell.showSidebar : copy.shell.hideSidebar,
    exact: true,
  })
  if (await button.isVisible()) await button.click()
  await expect(page.locator('[data-hbar-sidebar-expanded]')).toHaveAttribute(
    'data-hbar-sidebar-expanded',
    String(visible),
  )
}
async function select(fixture: Fixture, session: Session): Promise<void> {
  const { page, copy } = fixture
  await sidebar(fixture, true)
  const project = page.locator(`[data-workspace-id="${session.workspaceId}"]`)
  const toggle = project.locator('.hbar-app-react-workspace-row')
  await expect(toggle).toBeVisible()
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
  await project.getByRole('button', { name: copy.shell.openSession(session.title), exact: true }).click()
  await expect(page.getByRole('tab', { name: session.title, exact: true, includeHidden: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await sidebar(fixture, false)
}
function prompt(fixture: Fixture) {
  return fixture.page.getByRole('textbox', {
    name: fixture.copy.session.prompt.input,
    exact: true,
    includeHidden: true,
  })
}
function tool(fixture: Fixture, id: Tool) {
  const selector = {
    files: '.hbar-app-react-file-workspace:not(.hbar-app-react-file-workbench)',
    monitoring: '.hbar-app-react-session-monitoring',
    agents: '.hbar-app-react-agent-workspace',
    goals: '.hbar-app-react-goal-plan-workspace',
  }[id]
  return fixture.page.locator('.lumen-app-tool-drawer').locator(selector)
}
async function open(fixture: Fixture, id: Tool): Promise<void> {
  if (id === 'files')
    await fixture.page.getByRole('button', { name: fixture.copy.session.tools[id], exact: true }).click()
  else await openSessionTool(fixture.page, fixture.copy.session.tools, id)
  await expect(tool(fixture, id)).toBeVisible()
}
async function close(fixture: Fixture, id: Tool): Promise<void> {
  const label = {
    files: fixture.copy.files.close,
    monitoring: fixture.copy.monitoring.close,
    agents: fixture.copy.agents.close,
    goals: fixture.copy.goals.close,
  }[id]
  await tool(fixture, id).getByRole('button', { name: label, exact: true }).click()
  await expect(fixture.page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
}
async function seedA(fixture: Fixture): Promise<string> {
  const { page, locale, copy } = fixture
  const draft = `Original A composer — 原草稿 ${locale}`
  await prompt(fixture).fill(draft)
  const data = await page.evaluateHandle((name) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['Original A material'], name, { type: 'text/markdown' }))
    return transfer
  }, materialName)
  await page.locator('.hbar-composer-attachment-target').dispatchEvent('drop', { dataTransfer: data })
  await data.dispose()
  await expect(page.locator('.lumen-attachment-chip').filter({ hasText: materialName })).toBeVisible()
  await open(fixture, 'files')
  const files = tool(fixture, 'files')
  await files.getByRole('button', { name: aPath, exact: true }).click()
  await files.getByRole('button', { name: copy.files.edit, exact: true }).click()
  await files.getByRole('textbox', { name: aPath, exact: true }).fill(aDirty)
  return draft
}
async function assertA(fixture: Fixture, draft: string): Promise<void> {
  await expect(tool(fixture, 'files').getByRole('textbox', { name: aPath, exact: true })).toHaveValue(aDirty)
  await expectComposerText(prompt(fixture), draft)
  await expect(fixture.page.locator('.lumen-attachment-chip').filter({ hasText: materialName })).toHaveCount(1)
  expect(await readFile(join(fixture.root, aPath), 'utf8')).toBe(aDisk)
}
async function capture(fixture: Fixture, name: string, width: number): Promise<void> {
  await fixture.page.setViewportSize({ width, height: 960 })
  await sidebar(fixture, false)
  expect(await fixture.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await fixture.page.screenshot({ path: `${evidence}/${name}-${fixture.locale}-${width}.png` })
}
async function assertNoExecution(fixture: Fixture): Promise<void> {
  for (const session of [fixture.a, fixture.b, fixture.c])
    expect((await fixture.host.client.call('session.snapshot', { sessionId: session.id })).runs).toHaveLength(0)
  expect(fixture.writes).toEqual([])
  expect(fixture.errors).toEqual([])
}

for (const locale of ['en-US', 'zh-CN'] as const) {
  test(`session toolbar memory returns original tools without sharing visibility or drafts: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(180_000)
    const fixture = await start(browser, locale)
    const { page, copy, a, b } = fixture
    try {
      const draftA = await seedA(fixture)
      await select(fixture, b)
      await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
      const draftB = `Original B composer — 独立 B ${locale}`
      await prompt(fixture).fill(draftB)
      await open(fixture, 'monitoring')
      for (const width of [1440, 900, 390, 320]) {
        await page.setViewportSize({ width, height: 960 })
        await select(fixture, a)
        await assertA(fixture, draftA)
        await capture(fixture, 'A-restored-files', width)
        await select(fixture, b)
        await expect(tool(fixture, 'monitoring')).toBeVisible()
        await expectComposerText(prompt(fixture), draftB)
        await capture(fixture, 'B-original-monitoring', width)
      }
      await page.setViewportSize({ width: 1440, height: 960 })
      await open(fixture, 'agents')
      await select(fixture, a)
      await assertA(fixture, draftA)
      await select(fixture, b)
      await expect(tool(fixture, 'agents')).toBeVisible()
      await close(fixture, 'agents')
      await select(fixture, a)
      await assertA(fixture, draftA)
      await close(fixture, 'files')
      await select(fixture, b)
      await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
      await select(fixture, a)
      await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
      await open(fixture, 'files')
      await assertA(fixture, draftA)
      for (const destination of ['settings', 'status'] as const) {
        await sidebar(fixture, true)
        await page.getByRole('button', { name: copy.shell[destination], exact: true }).click()
        await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
        await page
          .getByRole('button', {
            name: destination === 'settings' ? copy.settings.back : copy.status.close,
            exact: true,
          })
          .click()
        await sidebar(fixture, false)
        await assertA(fixture, draftA)
      }
      // Deliberately selecting B from Settings uses B's closed memory, not the
      // old A returnContext. Re-entering A still restores A's original tool.
      await sidebar(fixture, true)
      await page.getByRole('button', { name: copy.shell.settings, exact: true }).click()
      await select(fixture, b)
      await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
      await expectComposerText(prompt(fixture), draftB)
      for (let index = 0; index < 3; index++) {
        await select(fixture, a)
        await assertA(fixture, draftA)
        await select(fixture, b)
        await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
        await expectComposerText(prompt(fixture), draftB)
      }
      await assertNoExecution(fixture)
      await writeFile(
        `${evidence}/session-memory-${locale}.json`,
        JSON.stringify(
          {
            actualHost: true,
            a: a.id,
            b: b.id,
            originalDrafts: true,
            originalMaterial: true,
            fileDirty: true,
            fourToolTypesCoveredAcrossMatrix: true,
            noExecution: true,
            errors: fixture.errors,
          },
          null,
          2,
        ),
      )
    } finally {
      await stop(fixture)
    }
  })

  test(`cross-project memories and explicit pinned Files preserve the original workbench: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const fixture = await start(browser, locale)
    const { page, copy, a, b, c, secondWorkspace, root } = fixture
    const tabs = workspaceTabsCopy((zh, en) => (locale === 'zh-CN' ? zh : en))
    try {
      const draftA = await seedA(fixture)
      await select(fixture, c)
      await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
      await prompt(fixture).fill(`Independent C composer — C 原草稿 ${locale}`)
      await open(fixture, 'goals')
      await select(fixture, a)
      await assertA(fixture, draftA)
      await select(fixture, c)
      await expect(tool(fixture, 'goals')).toBeVisible()
      await open(fixture, 'files')
      const files = tool(fixture, 'files')
      await files.getByRole('button', { name: cPath, exact: true }).click()
      await files.getByRole('button', { name: copy.files.edit, exact: true }).click()
      await files.getByRole('textbox', { name: cPath, exact: true }).fill(cDirty)
      await select(fixture, a)
      await assertA(fixture, draftA)
      await sidebar(fixture, true)
      await page.getByTitle(copy.shell.workspaceActions(secondWorkspace.name), { exact: true }).click()
      await page.getByRole('menuitem', { name: copy.shell.workspaceFiles, exact: true }).click()
      await sidebar(fixture, false)
      await expect(files.getByTitle(secondWorkspace.name, { exact: true })).toBeVisible()
      // The project-only pinned entry can start in its own browser view. Both
      // panes use the same bounded workspace/path document fact, not a copy.
      if (!(await files.getByRole('textbox', { name: cPath, exact: true }).isVisible()))
        await files.getByRole('button', { name: cPath, exact: true }).click()
      await files.getByRole('button', { name: copy.files.edit, exact: true }).click()
      await expect(files.getByRole('textbox', { name: cPath, exact: true })).toHaveValue(cDirty)
      for (const session of [b, a]) {
        await select(fixture, session)
        await expect(files.getByTitle(secondWorkspace.name, { exact: true })).toBeVisible()
        await expect(files.getByRole('textbox', { name: cPath, exact: true })).toHaveValue(cDirty)
      }
      await capture(fixture, 'project-pinned-C-over-A', 1440)
      await close(fixture, 'files')
      await expectComposerText(prompt(fixture), draftA)
      await select(fixture, b)
      await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
      await select(fixture, a)
      await assertA(fixture, draftA)
      await files.getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
      const workbench = page.locator('.hbar-app-react-file-workbench')
      const workbenchTab = page.getByRole('tab', { name: tabs.workbenchTitle, exact: true, includeHidden: true })
      await expect(workbench).toBeVisible()
      await expect(workbench.getByRole('textbox', { name: aPath, exact: true })).toHaveValue(aDirty)
      await select(fixture, b)
      await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
      await open(fixture, 'monitoring')
      // Files already expanded from A is one original workbench, not another
      // dock instance. Its toolbar entry brings that existing tab to the front.
      await select(fixture, a)
      await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
      await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
      await expect(workbenchTab).toHaveCount(1)
      await expect(workbenchTab).toHaveAttribute('aria-selected', 'true')
      await expect(workbench.getByRole('textbox', { name: aPath, exact: true })).toHaveValue(aDirty)
      await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
      for (const width of [1440, 900, 390, 320]) await capture(fixture, 'A-workbench-after-B-tool', width)
      await workbench.getByRole('button', { name: copy.files.returnToConversation, exact: true }).click()
      await expect(page.getByRole('tab', { name: a.title, exact: true })).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
      await expectComposerText(prompt(fixture), draftA)
      await page.setViewportSize({ width: 1440, height: 960 })
      await select(fixture, b)
      await expect(tool(fixture, 'monitoring')).toBeVisible()
      await select(fixture, a)
      await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
      await open(fixture, 'files')
      await assertA(fixture, draftA)
      expect(await readFile(join(secondWorkspace.path, cPath), 'utf8')).toBe(cDisk)
      expect(await readFile(join(root, aPath), 'utf8')).toBe(aDisk)
      await assertNoExecution(fixture)
      await writeFile(
        `${evidence}/pinned-workbench-${locale}.json`,
        JSON.stringify(
          {
            actualHost: true,
            a: a.id,
            b: b.id,
            c: c.id,
            pinnedWorkspaceId: secondWorkspace.id,
            pinnedNotRetargeted: true,
            originalWorkbenchFile: aPath,
            sourceDockRemainsClosed: true,
            fileDirty: true,
            noExecution: true,
            errors: fixture.errors,
          },
          null,
          2,
        ),
      )
    } finally {
      await stop(fixture)
    }
  })

  test(`view close and confirmed archive retire tool visibility without losing dirty workbench or drafts: ${locale}`, async ({
    browser,
  }) => {
    test.setTimeout(150_000)
    const fixture = await start(browser, locale)
    const { page, copy, host, a, b, firstWorkspace } = fixture
    const tabs = workspaceTabsCopy((zh, en) => (locale === 'zh-CN' ? zh : en))
    const commands = createWorkspaceSessionCommandClient(host.client)
    try {
      const draftA = await seedA(fixture)
      await select(fixture, b)
      const draftB = `B stays selected — B 原草稿 ${locale}`
      await prompt(fixture).fill(draftB)
      await open(fixture, 'monitoring')
      await select(fixture, a)
      await assertA(fixture, draftA)
      await page.getByRole('button', { name: tabs.tabs.close(a.title), exact: true }).click()
      await expect(page.getByRole('tab', { name: a.title, exact: true })).toHaveCount(0)
      await expect(tool(fixture, 'monitoring')).toBeVisible()
      await expectComposerText(prompt(fixture), draftB)
      await select(fixture, a)
      await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
      await expectComposerText(prompt(fixture), draftA)
      await open(fixture, 'files')
      await assertA(fixture, draftA)
      await tool(fixture, 'files').getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
      const workbench = page.locator('.hbar-app-react-file-workbench')
      const workbenchTab = page.getByRole('tab', { name: tabs.workbenchTitle, exact: true, includeHidden: true })
      await select(fixture, b)
      await expect(tool(fixture, 'monitoring')).toBeVisible()
      await page.getByRole('button', { name: tabs.tabs.close(a.title), exact: true }).click()
      await expect(page.getByRole('tab', { name: a.title, exact: true })).toHaveCount(0)
      await expectComposerText(prompt(fixture), draftB)
      await workbenchTab.click()
      await expect(workbench.getByRole('textbox', { name: aPath, exact: true })).toHaveValue(aDirty)
      await workbench.getByRole('button', { name: copy.files.returnToConversation, exact: true }).click()
      await expect(page.getByRole('tab', { name: a.title, exact: true, includeHidden: true })).toHaveCount(0)
      await expect(page.getByRole('tab', { name: b.title, exact: true, includeHidden: true })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await select(fixture, a)
      await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
      await open(fixture, 'files')
      await assertA(fixture, draftA)
      await tool(fixture, 'files').getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
      await select(fixture, b)
      await sidebar(fixture, true)
      const row = page.locator(`[data-session-id="${a.id}"]`)
      await row.locator('summary').click()
      await row.getByRole('menuitem', { name: copy.shell.archiveSession, exact: true }).click()
      const confirmation = row.getByRole('group', { name: copy.shell.archive.confirmTitle(a.title), exact: true })
      await confirmation.getByRole('button', { name: copy.shell.archive.confirm, exact: true }).click()
      await expect(row).toHaveCount(0)
      await expect(page.getByRole('tab', { name: a.title, exact: true, includeHidden: true })).toHaveCount(0)
      expect((await commands.execute('session.get', { sessionId: a.id }))?.archived).toBe(true)
      await expectComposerText(prompt(fixture), draftB)
      await page.getByRole('button', { name: copy.shell.archive.dismiss, exact: true }).click()
      await sidebar(fixture, false)
      await workbenchTab.click()
      await expect(workbench.getByRole('textbox', { name: aPath, exact: true })).toHaveValue(aDirty)
      for (const width of [1440, 320]) await capture(fixture, 'archived-source-A-workbench', width)
      await workbench.getByRole('button', { name: copy.files.returnToConversation, exact: true }).click()
      await expect(page.getByRole('tab', { name: a.title, exact: true, includeHidden: true })).toHaveCount(0)
      await expect(page.getByRole('tab', { name: b.title, exact: true, includeHidden: true })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await page.setViewportSize({ width: 1440, height: 960 })
      await sidebar(fixture, true)
      await page.getByTitle(copy.shell.workspaceActions(firstWorkspace.name), { exact: true }).click()
      await page.getByRole('menuitem', { name: copy.shell.archive.openList(firstWorkspace.name), exact: true }).click()
      const list = page.getByRole('region', { name: copy.shell.archive.listTitle(firstWorkspace.name), exact: true })
      await list.getByRole('button', { name: copy.shell.archive.restoreSession(a.title), exact: true }).click()
      await expect(row).toBeVisible()
      expect((await commands.execute('session.get', { sessionId: a.id }))?.archived).toBe(false)
      await expect(page.getByRole('tab', { name: a.title, exact: true, includeHidden: true })).toHaveCount(0)
      await expect(page.getByRole('tab', { name: b.title, exact: true, includeHidden: true })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await expectComposerText(prompt(fixture), draftB)
      await list.getByRole('button', { name: copy.shell.archive.close, exact: true }).click()
      await select(fixture, a)
      await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
      await expectComposerText(prompt(fixture), draftA)
      await open(fixture, 'files')
      await assertA(fixture, draftA)
      await assertNoExecution(fixture)
      await writeFile(
        `${evidence}/retirement-${locale}.json`,
        JSON.stringify(
          {
            actualHost: true,
            a: a.id,
            b: b.id,
            originalWorkbenchPreserved: true,
            closedAndRestoredVisibilityClosed: true,
            restoreNotNavigation: true,
            originalDraftsAndMaterial: true,
            dirtyNotSaved: true,
            noExecution: true,
            errors: fixture.errors,
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

test('original unknown save and delayed read survive session switches without replay or retargeting', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const envelope = z
    .object({
      id: z.union([z.string(), z.number()]).optional(),
      params: z
        .object({
          commandId: z.string().optional(),
          input: z.object({ workspaceId: z.string().optional(), path: z.string().optional() }).passthrough().optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
  const pending = new Map<string | number, 'write' | 'delayed-read'>()
  let originalWriteCount = 0
  let reconciliationReads = 0
  const capturedReply: { held: { release: () => void } | null } = { held: null }
  let deliveredLate = false
  const fixture = await start(browser, 'en-US', async (page, workspaceId) => {
    await page.routeWebSocket('**/rpc', (socket) => {
      const server = socket.connectToServer()
      socket.onMessage((message) => {
        if (typeof message === 'string') {
          const parsed: unknown = JSON.parse(message)
          const request = envelope.safeParse(parsed)
          if (
            request.success &&
            request.data.id !== undefined &&
            request.data.params?.input?.workspaceId === workspaceId
          ) {
            const { commandId, input } = request.data.params
            if (commandId === 'file.write' && input?.path === aPath) {
              originalWriteCount++
              pending.set(request.data.id, 'write')
            } else if (commandId === 'file.read' && input?.path === aPath && originalWriteCount > 0)
              reconciliationReads++
            else if (commandId === 'file.read' && input?.path === latePath) pending.set(request.data.id, 'delayed-read')
          }
        }
        server.send(message)
      })
      server.onMessage((message) => {
        if (typeof message === 'string') {
          const parsed: unknown = JSON.parse(message)
          const response = envelope.safeParse(parsed)
          const id = response.success ? response.data.id : undefined
          const kind = id === undefined ? undefined : pending.get(id)
          if (id !== undefined && kind) {
            pending.delete(id)
            if (kind === 'write') {
              // The real Host has received and completed the write. Only its
              // reply is replaced; UI must not assume it failed before dispatch.
              socket.send(
                JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  error: { code: -32603, message: 'Fixture lost accepted file write reply', data: 'CONNECTION_CLOSED' },
                }),
              )
              return
            }
            capturedReply.held = {
              release: () => {
                deliveredLate = true
                socket.send(message)
              },
            }
            return
          }
        }
        socket.send(message)
      })
    })
  })
  const { page, copy, a, b, root } = fixture
  const tabs = workspaceTabsCopy((_zh, en) => en)
  try {
    const draftA = await seedA(fixture)
    const files = tool(fixture, 'files')
    const editor = files.getByRole('textbox', { name: aPath, exact: true })
    await files.getByRole('button', { name: copy.files.save, exact: true }).click()
    await expect(files.getByRole('button', { name: copy.files.reconcile, exact: true })).toBeVisible()
    await expect(editor).toBeDisabled()
    expect(originalWriteCount).toBe(1)
    expect(await readFile(join(root, aPath), 'utf8')).toBe(aDirty)
    await select(fixture, b)
    await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
    await open(fixture, 'monitoring')
    await select(fixture, a)
    await expect(editor).toHaveValue(aDirty)
    await expect(editor).toBeDisabled()
    await expect(files.getByRole('button', { name: copy.files.reconcile, exact: true })).toBeVisible()
    await page.getByRole('button', { name: tabs.tabs.close(a.title), exact: true }).click()
    await expect(tool(fixture, 'monitoring')).toBeVisible()
    await select(fixture, a)
    await expect(page.locator('.lumen-app-tool-drawer')).toHaveCount(0)
    await open(fixture, 'files')
    await expect(editor).toHaveValue(aDirty)
    await expect(editor).toBeDisabled()
    await expectComposerText(prompt(fixture), draftA)
    await expect(page.locator('.lumen-attachment-chip').filter({ hasText: materialName })).toHaveCount(1)
    for (const width of [1440, 320]) await capture(fixture, 'unknown-save-original-A', width)
    await page.setViewportSize({ width: 1440, height: 960 })
    expect(originalWriteCount).toBe(1)
    expect(reconciliationReads).toBe(0)
    await files.getByRole('button', { name: copy.files.reconcile, exact: true }).click()
    await expect(editor).toBeEnabled()
    await expect(editor).toHaveValue(aDirty)
    await expect(files.getByRole('button', { name: copy.files.save, exact: true })).toBeDisabled()
    expect(reconciliationReads).toBe(1)
    expect(originalWriteCount).toBe(1)
    await files.getByRole('button', { name: copy.files.backToFiles, exact: true }).click()
    await files.getByRole('button', { name: latePath, exact: true }).click()
    await expect.poll(() => capturedReply.held !== null).toBe(true)
    await select(fixture, b)
    await expect(tool(fixture, 'monitoring')).toBeVisible()
    const response = capturedReply.held
    if (!response) throw new Error('The original real Host file.read reply was not captured')
    response.release()
    capturedReply.held = null
    await expect(page.getByRole('tab', { name: b.title, exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(tool(fixture, 'monitoring')).toBeVisible()
    await expect(files).toHaveCount(0)
    await select(fixture, a)
    await expect(files.getByLabel(copy.files.textPreview(latePath), { exact: true })).toHaveText(lateText)
    expect(deliveredLate).toBe(true)
    await capture(fixture, 'delayed-read-still-original-A', 1440)
    // The text proves that the captured reply has now been applied. Re-select
    // B after that observable result; B must still own Monitoring, not A Files.
    // This does not claim the reply had already rendered before the first A selection.
    await select(fixture, b)
    await expect(page.getByRole('tab', { name: b.title, exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(tool(fixture, 'monitoring')).toBeVisible()
    await expect(files).toHaveCount(0)
    for (const session of [a, b, fixture.c])
      expect((await fixture.host.client.call('session.snapshot', { sessionId: session.id })).runs).toHaveLength(0)
    expect(fixture.writes).toEqual(['file.write'])
    expect(fixture.errors).toEqual([])
    await writeFile(
      `${evidence}/unknown-late-read-en-US.json`,
      JSON.stringify(
        {
          actualHost: true,
          a: a.id,
          b: b.id,
          realWriteAccepted: true,
          originalWriteCount,
          reconciliationReads,
          lateTextAppliedBeforeFinalBCheck: true,
          unknownPreservedAcrossClose: true,
          originalDraftAndDisabledUnknownPreserved: true,
          delayedReadDidNotNavigateB: true,
          runCount: 0,
          errors: fixture.errors,
        },
        null,
        2,
      ),
    )
  } finally {
    const response = capturedReply.held
    if (response) response.release()
    await stop(fixture)
  }
})
