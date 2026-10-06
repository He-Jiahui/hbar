import { expect, test, type Locator, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { z } from 'zod'
import {
  createBudgetCommandClient,
  createFileCommandClient,
  createModelCommandClient,
  createRunCommandClient,
  createSessionLaunchTargetReader,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { COMMAND_PROTOCOL_VERSION, createCommandClient } from '@hbar/commands'
import { sessionLaunchTargetCommands } from '@hbar/contracts/commands/session-launch-target'
import { getShellCopy, type ShellLocale } from '../apps/web/src/shell-copy'
import { workspaceTabsCopy } from '../apps/web/src/workspace-tabs-copy'
import { selectLumenOption } from './support/lumen-controls'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const prefix = 'hbar-session-target-files-'
const evidence = 'artifacts/session-target-files/final'
const origin = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 48729}`
const hostPort = () => Number(process.env.HBAR_E2E_HOST_PORT ?? 48717)
const documentPath = 'same-path-target-proof.md'
const sharedText = '# Shared workspace version\n'
const isolatedText = '# Isolated session version\n'
const rpcRequest = z
  .object({
    params: z
      .object({
        commandId: z.string().optional(),
        input: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()

type LocaleCopy = ReturnType<typeof getShellCopy>

test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true })
})

async function removeOwnedFixture(root: string): Promise<void> {
  const absoluteRoot = await realpath(root)
  if (dirname(absoluteRoot) !== (await realpath(tmpdir())) || !basename(absoluteRoot).startsWith(prefix))
    throw new Error('Refusing to remove an unowned Files E2E directory')
  await rm(absoluteRoot, { recursive: true, force: true })
}

function branchClient(host: WebSessionHost) {
  return createCommandClient(sessionLaunchTargetCommands, {
    execute(commandId, input, options) {
      return host.client.call('command.execute', {
        protocol: COMMAND_PROTOCOL_VERSION,
        requestId: options?.requestId ?? crypto.randomUUID(),
        commandId,
        commandVersion: options?.version ?? 1,
        ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
        input,
      })
    },
  })
}

async function createFixtureWorkspace(host: WebSessionHost, root: string) {
  const repositoryPath = join(root, 'repository')
  await mkdir(repositoryPath)
  for (const args of [
    ['init'],
    ['config', 'user.email', 'session-files@hbar.invalid'],
    ['config', 'user.name', 'hbar session Files fixture'],
  ])
    execFileSync('git', args, { cwd: repositoryPath, stdio: 'ignore', windowsHide: true })
  const directory = createWorkspaceSessionCommandClient(host.client)
  const workspace = await directory.execute(
    'workspace.create',
    { path: repositoryPath },
    { idempotencyKey: crypto.randomUUID() },
  )
  const shared = await directory.execute(
    'session.create',
    { workspaceId: workspace.id, title: 'Shared Files target' },
    { idempotencyKey: crypto.randomUUID() },
  )
  return { directory, repositoryPath, shared, workspace }
}

async function createIsolatedSession(host: WebSessionHost, workspaceId: string, title: string, run: boolean) {
  const directory = createWorkspaceSessionCommandClient(host.client)
  const session = await directory.execute(
    'session.create',
    { workspaceId, title },
    { idempotencyKey: crypto.randomUUID() },
  )
  const targets = createSessionLaunchTargetReader(host.client)
  const launch = branchClient(host)
  const before = await targets.read(session.id)
  const branch = `codex/files-target-${crypto.randomUUID().slice(0, 8)}`
  const receipt = await launch.execute(
    'sessionLaunchTarget.set',
    {
      sessionId: session.id,
      expectedRevision: before.revision,
      selection: { mode: 'isolated-worktree', branch: { kind: 'new', name: branch } },
    },
    { idempotencyKey: crypto.randomUUID() },
  )
  if (run) {
    const models = createModelCommandClient(host.client)
    const configuration = await models.execute('session.getModel', { sessionId: session.id })
    await models.execute(
      'session.setModel',
      { sessionId: session.id, modelId: 'local-fixture', baselineRevisions: configuration.revisions },
      { idempotencyKey: crypto.randomUUID() },
    )
    await createBudgetCommandClient(host.client).execute(
      'session.setBudget',
      { sessionId: session.id, tokens: 100_000 },
      { idempotencyKey: crypto.randomUUID() },
    )
    const runs = createRunCommandClient(host.client)
    const accepted = await runs.execute(
      'run.submit',
      {
        sessionId: session.id,
        modelId: 'local-fixture',
        input: { text: 'Bind isolated Files target fixture', images: [] },
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    await expect
      .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status, {
        timeout: 15_000,
      })
      .toBe('completed')
    await expect.poll(async () => (await targets.read(session.id)).locked, { timeout: 10_000 }).toBe(true)
  }
  return { session, targets, receipt, branch }
}

async function selectSession(page: Page, copy: LocaleCopy, workspaceId: string, title: string): Promise<void> {
  const show = page.getByRole('button', { name: copy.shell.showSidebar, exact: true })
  if (await show.isVisible()) await show.click()
  const project = page.locator(`[data-workspace-id="${workspaceId}"]`)
  const toggle = project
  await expect(toggle).toBeVisible()
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click()
  await project.getByRole('treeitem', { name: title, exact: true }).click()
  await expect(page.getByRole('tab', { name: title, exact: true, includeHidden: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const hide = page.getByRole('button', { name: copy.shell.hideSidebar, exact: true })
  if (await hide.isVisible()) await hide.click()
}

function filesPanel(page: Page) {
  return page.locator('.hbar-app-react-file-workspace:not(.hbar-app-react-file-workbench)')
}

async function captureWorkbench(
  page: Page,
  workbench: Locator,
  sourceTab: Locator,
  expectedText: string,
  name: string,
  width: number,
): Promise<void> {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 960 })
  await expect(workbench).toBeVisible()
  await expect(workbench).toContainText(expectedText)
  await sourceTab.scrollIntoViewIfNeeded()
  await expect(sourceTab).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await page.screenshot({ path: `${evidence}/${name}-${width}.png` })
}

async function openFile(page: Page, copy: LocaleCopy, path: string): Promise<void> {
  const panel = filesPanel(page)
  const show = panel.getByRole('button', { name: copy.files.showNavigator, exact: true })
  if (await show.isVisible()) await show.click()
  const navigator = panel.getByRole('region', { name: copy.files.navigator, exact: true })
  await expect(navigator).toBeVisible()
  await selectLumenOption(navigator.getByRole('combobox', { name: copy.files.changes.mode, exact: true }), 'all')
  await navigator.getByRole('textbox', { name: copy.files.tree.filter, exact: true }).fill(path)
  const results = navigator.getByRole('list', { name: copy.files.tree.searchResults, exact: true })
  await expect(results).toBeVisible()
  const leaf = path.slice(path.lastIndexOf('/') + 1)
  const fileName = results.getByText(leaf, { exact: true })
  await expect(fileName).toBeVisible()
  const result = results.getByRole('button').filter({ has: page.getByText(path, { exact: true }) })
  await expect(result).toHaveCount(1)
  await result.click()
  await expect(panel.getByLabel(copy.files.textPreview(path), { exact: true })).toBeVisible()
}

for (const locale of ['en-US', 'zh-CN'] as const satisfies readonly ShellLocale[]) {
  test(`unbound session Files explain the run prerequisite without shared fallback: ${locale}`, async ({ browser }) => {
    test.setTimeout(60_000)
    const root = await mkdtemp(join(tmpdir(), prefix))
    const context = await browser.newContext({ locale, viewport: { width: 1280, height: 900 } })
    let host: WebSessionHost | undefined
    try {
      host = await startWebSessionHost({ root, port: hostPort(), goalAutoContinue: false })
      const repository = await createFixtureWorkspace(host, root)
      await writeFile(join(repository.repositoryPath, documentPath), sharedText, 'utf8')
      for (const args of [
        ['add', documentPath],
        ['commit', '-m', 'seed unbound Files target fixture'],
      ])
        execFileSync('git', args, { cwd: repository.repositoryPath, stdio: 'ignore', windowsHide: true })
      const isolated = await createIsolatedSession(host, repository.workspace.id, 'Unbound Files target', false)
      expect(await isolated.targets.read(isolated.session.id)).toMatchObject({
        locked: false,
        resolution: { status: 'idle' },
      })
      expect((await isolated.targets.read(repository.shared.id)).revision).toBe(0)
      expect((await context.request.post(`${origin()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
        true,
      )
      const page = await context.newPage()
      page.setDefaultTimeout(15_000)
      const fallbackCalls: string[] = []
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('websocket', (socket) =>
        socket.on('framesent', ({ payload }) => {
          if (typeof payload !== 'string') return
          const parsed: unknown = JSON.parse(payload)
          const request = rpcRequest.safeParse(parsed)
          const command = request.success ? request.data.params?.commandId : undefined
          if (
            command?.startsWith('file.') ||
            command?.startsWith('git.') ||
            command === 'sessionGit.status' ||
            command === 'sessionGit.diff'
          )
            fallbackCalls.push(command)
        }),
      )
      const copy = getShellCopy(locale)
      await page.goto(origin())
      await selectSession(page, copy, repository.workspace.id, isolated.session.title)
      await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
      const files = filesPanel(page)
      await expect(files).toBeVisible()
      const alert = files.getByRole('alert').first()
      const message = copy.files.error('SESSION_LAUNCH_TARGET_UNRESOLVED')
      await expect(alert).toContainText(message)
      const visibleText = await files.innerText()
      expect(visibleText).not.toContain('SESSION_LAUNCH_TARGET_UNRESOLVED')
      expect(visibleText.toLowerCase()).not.toContain('too large')
      expect(visibleText).not.toContain('过大')
      expect(fallbackCalls).toEqual([])
      expect(errors).toEqual([])
    } finally {
      await context.close()
      if (host) {
        await stopWebSessionHost(host)
        await expect.poll(() => host?.child.exitCode !== null || host?.child.signalCode !== null).toBe(true)
      }
      await removeOwnedFixture(root)
    }
  })
}

test('an isolated Files workbench reads and saves its own same-path file after session navigation', async ({
  browser,
}) => {
  test.setTimeout(90_000)
  const root = await mkdtemp(join(tmpdir(), prefix))
  const locale: ShellLocale = 'en-US'
  const context = await browser.newContext({ locale, viewport: { width: 1440, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: hostPort(), goalAutoContinue: false })
    const repository = await createFixtureWorkspace(host, root)
    await writeFile(join(repository.repositoryPath, documentPath), sharedText, 'utf8')
    for (const args of [
      ['add', documentPath],
      ['commit', '-m', 'seed same-path session Files fixture'],
    ])
      execFileSync('git', args, { cwd: repository.repositoryPath, stdio: 'ignore', windowsHide: true })
    const isolated = await createIsolatedSession(host, repository.workspace.id, 'Isolated Files target', true)
    const bound = await isolated.targets.read(isolated.session.id)
    expect(bound).toMatchObject({
      locked: true,
      selection: { mode: 'isolated-worktree' },
      resolution: { status: 'ready' },
    })
    expect((await isolated.targets.read(repository.shared.id)).revision).toBe(0)
    expect((await context.request.post(`${origin()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(
      true,
    )
    const page = await context.newPage()
    page.setDefaultTimeout(15_000)
    const fileRequests: { command: string; input: Record<string, unknown> }[] = []
    const gitRequests: { command: string; input: Record<string, unknown> }[] = []
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('websocket', (socket) =>
      socket.on('framesent', ({ payload }) => {
        if (typeof payload !== 'string') return
        const parsed: unknown = JSON.parse(payload)
        const request = rpcRequest.safeParse(parsed)
        const command = request.success ? request.data.params?.commandId : undefined
        const input = request.success ? request.data.params?.input : undefined
        if (command?.startsWith('file.') && input) fileRequests.push({ command, input })
        if (
          input &&
          command &&
          (command.startsWith('git.') || command === 'sessionGit.status' || command === 'sessionGit.diff')
        )
          gitRequests.push({ command, input })
      }),
    )
    const copy = getShellCopy(locale)
    const workspaceTabs = workspaceTabsCopy((_chinese, english) => english)
    await page.goto(origin())
    await selectSession(page, copy, repository.workspace.id, isolated.session.title)
    await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
    const isolatedFiles = filesPanel(page)
    await expect(isolatedFiles).toBeVisible()
    await openFile(page, copy, documentPath)
    const isolatedTarget = { sessionId: isolated.session.id, expectedRevision: bound.revision }
    expect(fileRequests.length).toBeGreaterThan(0)
    expect(
      fileRequests.every(
        ({ input }) => input.sessionTarget && JSON.stringify(input.sessionTarget) === JSON.stringify(isolatedTarget),
      ),
    ).toBe(true)
    await isolatedFiles.getByRole('button', { name: copy.files.edit, exact: true }).click()
    await isolatedFiles.getByRole('textbox', { name: documentPath, exact: true }).fill(isolatedText)
    await isolatedFiles.getByRole('button', { name: copy.files.save, exact: true }).click()
    const documentPane = isolatedFiles.locator(`.lumen-file-document[aria-label="${documentPath}"]`)
    const saveStatus = documentPane.locator('footer [role="status"]')
    await expect(saveStatus).toHaveText(copy.files.saved)
    const persisted = await createFileCommandClient(host.client).execute('file.read', {
      workspaceId: repository.workspace.id,
      sessionTarget: isolatedTarget,
      path: documentPath,
    })
    expect(persisted).toMatchObject({
      workspaceId: repository.workspace.id,
      sessionTarget: isolatedTarget,
      path: documentPath,
      text: isolatedText,
    })
    expect(await readFile(join(repository.repositoryPath, documentPath), 'utf8')).toBe(sharedText)
    expect(
      fileRequests.some(
        ({ command, input }) =>
          command === 'file.write' && JSON.stringify(input.sessionTarget) === JSON.stringify(isolatedTarget),
      ),
    ).toBe(true)
    await isolatedFiles.getByRole('button', { name: copy.files.expandWorkbench, exact: true }).click()
    const workbench = page.locator('.hbar-app-react-file-workbench')
    await expect(workbench).toBeVisible()
    await expect(workbench).toContainText(isolatedText)
    const workbenchTab = page.getByRole('tab', { name: workspaceTabs.workbenchTitle, exact: true, includeHidden: true })
    await expect(workbenchTab).toHaveCount(1)
    const originalSessionTab = page.getByRole('tab', { name: isolated.session.title, exact: true, includeHidden: true })
    await expect(originalSessionTab).toHaveCount(1)
    await captureWorkbench(page, workbench, originalSessionTab, isolatedText, 'isolated-saved-workbench-en-US', 1440)
    await captureWorkbench(page, workbench, originalSessionTab, isolatedText, 'isolated-saved-workbench-en-US', 320)
    await page.setViewportSize({ width: 1440, height: 960 })

    await selectSession(page, copy, repository.workspace.id, repository.shared.title)
    await expect(workbenchTab).toHaveCount(1)
    // Inactive workbenches are unmounted; revisit the retained tab to verify its source-owned content.
    await workbenchTab.click()
    await expect(workbench).toBeVisible()
    await expect(workbench).toContainText(isolatedText)
    await selectSession(page, copy, repository.workspace.id, repository.shared.title)
    await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
    const sharedFiles = filesPanel(page)
    await expect(sharedFiles).toBeVisible()
    await openFile(page, copy, documentPath)
    await expect(sharedFiles.getByLabel(copy.files.textPreview(documentPath), { exact: true })).toContainText(
      sharedText,
    )
    const sharedTarget = { sessionId: repository.shared.id, expectedRevision: 0 }
    expect(
      fileRequests.some(
        ({ command, input }) =>
          command === 'file.read' && JSON.stringify(input.sessionTarget) === JSON.stringify(sharedTarget),
      ),
    ).toBe(true)
    expect(await readFile(join(repository.repositoryPath, documentPath), 'utf8')).toBe(sharedText)
    await selectSession(page, copy, repository.workspace.id, isolated.session.title)
    await page.getByRole('button', { name: copy.session.tools.files, exact: true }).click()
    await expect(workbenchTab).toHaveAttribute('aria-selected', 'true')
    await expect(workbench).toContainText(isolatedText)
    const showNavigator = workbench.getByRole('button', { name: copy.files.showNavigator, exact: true })
    if (await showNavigator.isVisible()) await showNavigator.click()
    const navigator = workbench.getByRole('region', { name: copy.files.navigator, exact: true })
    await expect(navigator).toBeVisible()
    await selectLumenOption(navigator.getByRole('combobox', { name: copy.files.changes.mode, exact: true }), 'changed')
    await navigator.getByRole('button', { name: copy.files.changes.open(documentPath), exact: true }).click()
    const diffContent = workbench.getByLabel(copy.files.changes.diffContent(documentPath), { exact: true })
    await expect(diffContent).toContainText('-# Shared workspace version')
    await expect(diffContent).toContainText('+# Isolated session version')
    await workbench.getByRole('button', { name: copy.files.changes.staged, exact: true }).click()
    await expect(workbench.getByText(copy.files.changes.noDiff, { exact: true })).toBeVisible()
    await workbench.getByRole('button', { name: copy.files.changes.workingTree, exact: true }).click()
    const diff = workbench.locator('.hbar-file-diff')
    const workingTree = diff.getByRole('button', { name: copy.files.changes.workingTree, exact: true })
    await expect(workingTree).toBeEnabled()
    await expect(workingTree).toHaveAttribute('aria-pressed', 'true')
    await expect(diff.getByText(copy.files.changes.loading, { exact: true })).toHaveCount(0)
    await expect(diff.getByRole('alert')).toHaveCount(0)
    await expect(diffContent).toContainText('+# Isolated session version')
    expect(gitRequests.some(({ command }) => command === 'sessionGit.status')).toBe(true)
    expect(gitRequests.some(({ command, input }) => command === 'sessionGit.diff' && input.cached === true)).toBe(true)
    expect(
      gitRequests.every(
        ({ command, input }) =>
          (command === 'sessionGit.status' || command === 'sessionGit.diff') &&
          input.workspaceId === repository.workspace.id &&
          input.sessionId === isolated.session.id &&
          input.expectedRevision === bound.revision,
      ),
    ).toBe(true)
    expect(await readFile(join(repository.repositoryPath, documentPath), 'utf8')).toBe(sharedText)
    await captureWorkbench(
      page,
      workbench,
      originalSessionTab,
      '+# Isolated session version',
      'isolated-working-diff-en-US',
      1440,
    )
    await captureWorkbench(
      page,
      workbench,
      originalSessionTab,
      '+# Isolated session version',
      'isolated-working-diff-en-US',
      320,
    )
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) {
      await stopWebSessionHost(host)
      await expect.poll(() => host?.child.exitCode !== null || host?.child.signalCode !== null).toBe(true)
    }
    await removeOwnedFixture(root)
  }
})
