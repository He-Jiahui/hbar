import { expect, test, type BrowserContext } from '@playwright/test'
import { COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { workspaceFolderSnapshotSchema } from '@hbar/contracts/commands/workspace-folders'
import { createNodeCommandClient, createSessionLaunchBranchesReader } from '@hbar/client'
import { spawn, type ChildProcess } from 'node:child_process'
import { createInterface } from 'node:readline'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { workspaceLocationPickerCopy } from '../apps/web/src/workspace-location-picker-copy'
import { workspaceFoldersCopy } from '../apps/web/src/workspace-folders-copy'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { bunExecutable, startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

async function until(check: () => Promise<boolean>, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!(await check())) {
    if (Date.now() >= deadline) throw new Error('The B workspace link did not become online')
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

test('workspace picker creates against a live B read-only root and pins the returned workspace', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const root = await mkdtemp(join(tmpdir(), 'hbar-workspace-location-e2e-'))
  const hostRoot = join(root, 'a-host')
  const nodeHome = join(root, 'b-node-home')
  const sharedRoot = join(root, 'b-read-only-docs')
  const referenceRoot = join(root, 'b-read-only-reference')
  const sourceRoot = join(root, 'b-write-source')
  const nestedRoot = join(sharedRoot, 'nested')
  await Promise.all([
    mkdir(hostRoot, { recursive: true }),
    mkdir(sharedRoot, { recursive: true }),
    mkdir(referenceRoot, { recursive: true }),
    mkdir(sourceRoot, { recursive: true }),
    mkdir(nestedRoot, { recursive: true }),
  ])
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
  const shellCopy = getShellCopy('en-US')
  const pickerCopy = workspaceLocationPickerCopy('en-US')
  let host: WebSessionHost | undefined
  let nodeProcess: ChildProcess | undefined
  let observerContext: BrowserContext | undefined
  try {
    host = await startWebSessionHost({
      root: hostRoot,
      fixture: 'workspace-node',
      port: Number(process.env.HBAR_E2E_HOST_PORT ?? 4317),
    })
    const commands = createNodeCommandClient(host.client)
    expect(host.client.connectionHost()?.deviceAccess).toEqual({ role: 'operator', workspaceIds: null })
    const invite = await commands.execute('node.invite', { name: 'E2E live workspace node' })
    nodeProcess = spawn(
      bunExecutable(),
      [
        'e2e/fixtures/workspace-location-node.ts',
        nodeHome,
        sharedRoot,
        referenceRoot,
        sourceRoot,
        nestedRoot,
        host.url,
        invite.code,
        invite.fingerprint,
      ],
      { cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    )
    if (!nodeProcess.stdout || !nodeProcess.stderr || !nodeProcess.stdin)
      throw new Error('The live B fixture needs piped process streams')
    let nodeId = ''
    let startupError = ''
    const startupOutput: string[] = []
    nodeProcess.stderr.on('data', (chunk) => {
      startupError = `${startupError}${String(chunk)}`.slice(-8_000)
    })
    const lines = createInterface({ input: nodeProcess.stdout })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`The B fixture did not start: ${startupError}; output=${startupOutput.join(' | ')}`)),
        30_000,
      )
      const onExit = (code: number | null) => reject(new Error(`The B fixture exited with ${code}: ${startupError}`))
      nodeProcess?.once('exit', onExit)
      lines.on('line', (line) => {
        try {
          const payload = JSON.parse(line) as { readonly ready?: boolean; readonly nodeId?: string }
          if (!payload.ready || !payload.nodeId) return
          clearTimeout(timer)
          nodeProcess?.off('exit', onExit)
          nodeId = payload.nodeId
          resolve()
        } catch {
          startupOutput.push(line)
          if (startupOutput.length > 12) startupOutput.shift()
        }
      })
    })
    await until(async () => {
      const page = await commands.execute('node.list', { limit: 20 })
      const registered = page.items.find((item) => item.nodeId === nodeId)
      return Boolean(
        registered?.online &&
        registered.name === 'E2E live workspace node' &&
        registered.capabilities?.roots.some((item) => item.rootId === 'docs' && item.access === 'read'),
      )
    })
    const base = `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 4329}`
    expect((await context.request.post(`${base}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.stack ?? error.message))
    await page.goto(base)
    await expect(page.getByRole('complementary', { name: shellCopy.shell.projectsAndSessions })).toContainText(
      shellCopy.shell.connected,
    )
    await page.getByRole('button', { name: shellCopy.shell.openWorkspace, exact: true }).click()
    const workspaceDialog = page.getByRole('dialog').last()
    await expect(workspaceDialog).toBeVisible()
    await workspaceDialog.getByRole('button', { name: shellCopy.shell.addWorkspace, exact: true }).click()
    const picker = page.getByTestId('workspace-location-picker')
    await expect(picker).toBeVisible()
    await picker.getByRole('button', { name: pickerCopy.remote, exact: false }).click()
    await picker.getByRole('button', { name: /E2E live workspace node/ }).click()
    const rootOption = picker.getByRole('button', { name: new RegExp(`^docs .*${pickerCopy.readOnlyRoot}$`) })
    await expect(rootOption).toBeVisible()
    await rootOption.click()
    await expect(page.getByRole('button', { name: pickerCopy.create, exact: true })).toBeEnabled()
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await mkdir('artifacts/workspace-location', { recursive: true })
    await page.screenshot({ path: 'artifacts/workspace-location/live-read-root-390.png', fullPage: true })

    await page.getByRole('button', { name: pickerCopy.create, exact: true }).click()
    await expect(picker).toHaveCount(0)
    await expect(page.getByText('Node: E2E live workspace node', { exact: true })).toBeVisible()
    const workspaces = await host.client.call('workspace.list', { limit: 200 })
    const remoteWorkspace = workspaces.items.find(
      (item) => item.location?.kind === 'node' && item.location.nodeId === nodeId && item.location.rootId === 'docs',
    )
    if (!remoteWorkspace) throw new Error('The Host did not persist the created B workspace location')
    const branchReader = createSessionLaunchBranchesReader(host.client)
    if (process.platform === 'win32') {
      await expect(branchReader.list({ workspaceId: remoteWorkspace.id })).rejects.toMatchObject({
        code: 'NODE_CONFINEMENT_UNAVAILABLE',
      })
    } else {
      const branchPage = await branchReader.list({ workspaceId: remoteWorkspace.id })
      expect(branchPage).toMatchObject({ workspaceId: remoteWorkspace.id, repository: { kind: 'not-repository' } })
    }
    expect(errors).toEqual([])
    await page.screenshot({ path: 'artifacts/workspace-location/created-390.png', fullPage: true })
    await page.setViewportSize({ width: 1440, height: 960 })
    const showSidebar = page.getByRole('button', { name: shellCopy.shell.showSidebar, exact: true })
    if (await showSidebar.isVisible()) await showSidebar.click()
    await page.screenshot({ path: 'artifacts/workspace-location/created-1440.png', fullPage: true })
    const remoteWorkspaceRow = page
      .locator('[data-sidebar-level="project"]')
      .filter({ hasText: 'Node: E2E live workspace node' })
    if (!(await remoteWorkspaceRow.count()))
      throw new Error(
        `Remote workspace badge missing from the sidebar: ${(await page.locator('body').innerText()).slice(0, 2400)}`,
      )
    await expect(remoteWorkspaceRow).toContainText('docs')
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    const openSidebar = page.getByRole('button', { name: shellCopy.shell.showSidebar, exact: true })
    if (await openSidebar.isVisible()) await openSidebar.click()
    await remoteWorkspaceRow.getByRole('button', { name: shellCopy.shell.workspaceActions('docs') }).click()
    await page.getByRole('menuitem', { name: workspaceFoldersCopy('en-US').manage, exact: true }).click()
    const foldersDialog = page.getByRole('dialog').last()
    await expect(foldersDialog.getByText('Source packages for the remote integration fixture')).toBeVisible()
    await expect(foldersDialog.getByRole('button', { name: 'Add node root docs' })).toContainText(
      pickerCopy.readOnlyRoot,
    )
    await expect(
      foldersDialog.getByRole('button', {
        name: 'Add node root Source packages for the remote integration fixture',
      }),
    ).toContainText(pickerCopy.writeRoot)
    const longRootOption = foldersDialog.getByRole('button', {
      name: 'Add node root Source packages for the remote integration fixture',
    })
    const longRootLayout = await longRootOption.locator('.hbar-workspace-folder-node-root-name').evaluate((element) => {
      const text = element as HTMLElement
      const bounds = text.getBoundingClientRect()
      const button = text.closest('button')
      const buttonBounds = button?.getBoundingClientRect()
      return {
        wraps: text.clientHeight > Number.parseFloat(getComputedStyle(text).lineHeight),
        contained: Boolean(buttonBounds && bounds.left >= buttonBounds.left && bounds.right <= buttonBounds.right + 1),
        noHorizontalOverflow: text.scrollWidth <= text.clientWidth + 1,
      }
    })
    expect(longRootLayout).toEqual({ wraps: true, contained: true, noHorizontalOverflow: true })
    await expect(foldersDialog.getByText(workspaceFoldersCopy('en-US').nodeRootOverlap)).toBeVisible()
    const overlappingRoot = foldersDialog.getByRole('button', { name: 'Add node root Nested docs root' })
    await expect(overlappingRoot).toBeDisabled()
    await foldersDialog.getByRole('button', { name: 'Add node root Read only reference materials' }).click()
    await foldersDialog
      .getByRole('button', { name: 'Add node root Source packages for the remote integration fixture' })
      .click()
    await expect(foldersDialog.getByRole('textbox', { name: workspaceFoldersCopy('en-US').alias })).toHaveCount(3)
    await page.screenshot({ path: 'artifacts/workspace-location/node-folders-390.png', fullPage: true })
    await foldersDialog.getByRole('button', { name: workspaceFoldersCopy('en-US').save, exact: true }).click()
    await expect(foldersDialog.getByText(workspaceFoldersCopy('en-US').status.saved)).toBeVisible()
    await foldersDialog.getByRole('button', { name: workspaceFoldersCopy('en-US').done, exact: true }).click()
    await remoteWorkspaceRow.getByRole('button', { name: shellCopy.shell.workspaceActions('docs') }).click()
    await page.getByRole('menuitem', { name: workspaceFoldersCopy('en-US').manage, exact: true }).click()
    const reloadedFoldersDialog = page.getByRole('dialog').last()
    await expect(reloadedFoldersDialog.getByRole('textbox', { name: workspaceFoldersCopy('en-US').alias })).toHaveCount(
      3,
    )
    await expect(
      reloadedFoldersDialog.getByRole('textbox', { name: workspaceFoldersCopy('en-US').alias }).nth(1),
    ).toHaveValue('Read-only-reference-materials')
    await expect(
      reloadedFoldersDialog.getByRole('textbox', { name: workspaceFoldersCopy('en-US').alias }).nth(2),
    ).toHaveValue('Source-packages-for-the-remote-integration-fixture')
    await page.screenshot({ path: 'artifacts/workspace-location/node-folders-reloaded-390.png', fullPage: true })
    await reloadedFoldersDialog
      .getByRole('button', { name: workspaceFoldersCopy('en-US').remove, exact: true })
      .nth(2)
      .click()
    await expect(reloadedFoldersDialog.getByRole('textbox', { name: workspaceFoldersCopy('en-US').alias })).toHaveCount(
      2,
    )
    const removeSave = reloadedFoldersDialog.getByRole('button', {
      name: workspaceFoldersCopy('en-US').save,
      exact: true,
    })
    await removeSave.click()
    await expect
      .poll(async () => {
        const snapshot = workspaceFolderSnapshotSchema.parse(
          await host!.client.call('command.execute', {
            protocol: COMMAND_PROTOCOL_VERSION,
            requestId: crypto.randomUUID(),
            commandId: 'workspace.folders.get',
            commandVersion: 1,
            input: { workspaceId: remoteWorkspace.id },
          }),
        )
        return snapshot.folders.length
      })
      .toBe(2)
    await reloadedFoldersDialog
      .getByRole('banner')
      .getByRole('button', { name: workspaceFoldersCopy('en-US').cancel })
      .click()
    await remoteWorkspaceRow.getByRole('button', { name: shellCopy.shell.workspaceActions('docs') }).click()
    await page.getByRole('menuitem', { name: workspaceFoldersCopy('en-US').manage, exact: true }).click()
    const afterRemovalDialog = page.getByRole('dialog').last()
    await expect(afterRemovalDialog.getByRole('textbox', { name: workspaceFoldersCopy('en-US').alias })).toHaveCount(2)
    await expect(
      afterRemovalDialog.getByRole('textbox', { name: workspaceFoldersCopy('en-US').alias }).nth(1),
    ).toHaveValue('Read-only-reference-materials')
    await page.screenshot({ path: 'artifacts/workspace-location/node-folders-after-removal-390.png', fullPage: true })
    await afterRemovalDialog
      .getByRole('banner')
      .getByRole('button', { name: workspaceFoldersCopy('en-US').cancel })
      .click()

    if (!host.ready.observerToken) throw new Error('The Host fixture did not provision the observer role')
    observerContext = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
    expect(
      (await observerContext.request.post(`${base}/auth/token`, { data: { token: host.ready.observerToken } })).ok(),
    ).toBe(true)
    const observerPage = await observerContext.newPage()
    await observerPage.goto(base)
    await expect(observerPage.getByRole('complementary', { name: shellCopy.shell.projectsAndSessions })).toContainText(
      shellCopy.shell.connected,
    )
    const observerWorkspaceRow = observerPage
      .locator('[data-sidebar-level="project"]')
      .filter({ hasText: 'Node: E2E live workspace node' })
    await expect(observerWorkspaceRow).toContainText('docs')
    await observerWorkspaceRow.getByRole('button', { name: shellCopy.shell.workspaceActions('docs') }).click()
    await observerPage.getByRole('menuitem', { name: workspaceFoldersCopy('en-US').manage, exact: true }).click()
    const observerFoldersDialog = observerPage.getByRole('dialog').last()
    await expect(observerFoldersDialog.getByText(workspaceFoldersCopy('en-US').nodeRootObserver)).toBeVisible()
    await expect(
      observerFoldersDialog.getByRole('button', { name: workspaceFoldersCopy('en-US').remove, exact: true }).first(),
    ).toBeDisabled()
    await expect(
      observerFoldersDialog.getByRole('textbox', { name: workspaceFoldersCopy('en-US').alias }).first(),
    ).toBeDisabled()
    await expect(
      observerFoldersDialog.getByRole('button', { name: workspaceFoldersCopy('en-US').save, exact: true }),
    ).toBeDisabled()
    await observerPage.setViewportSize({ width: 390, height: 844 })
    expect(await observerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await observerPage.screenshot({
      path: 'artifacts/workspace-location/node-folders-observer-390.png',
      fullPage: true,
    })
    await observerFoldersDialog
      .getByRole('button', { name: workspaceFoldersCopy('en-US').cancel, exact: true })
      .first()
      .click()
    const registered = (await commands.execute('node.list', { limit: 20 })).items.find((item) => item.nodeId === nodeId)
    expect(registered?.capabilities?.roots.find((item) => item.rootId === 'docs')?.access).toBe('read')
  } finally {
    await observerContext?.close().catch(() => undefined)
    await context.close().catch(() => undefined)
    if (nodeProcess?.stdin?.writable) {
      nodeProcess.stdin.end('close\n')
      await new Promise<void>((resolve) => {
        if (nodeProcess?.exitCode !== null || nodeProcess?.signalCode !== null) return resolve()
        nodeProcess?.once('exit', () => resolve())
        setTimeout(() => {
          nodeProcess?.kill()
          resolve()
        }, 8_000)
      })
    }
    if (host) await stopWebSessionHost(host)
    await rm(root, { recursive: true, force: true })
  }
})
