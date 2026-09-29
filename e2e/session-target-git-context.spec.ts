import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import {
  createBudgetCommandClient,
  createModelCommandClient,
  createRunCommandClient,
  createSessionLaunchTargetReader,
  createWorkspaceSessionCommandClient,
} from '@hbar/client'
import { COMMAND_PROTOCOL_VERSION, createCommandClient } from '@hbar/commands'
import { sessionLaunchTargetCommands } from '@hbar/contracts/commands/session-launch-target'
import { getShellCopy } from '../apps/web/src/shell-copy'
import { sessionContextCopy } from '../apps/web/src/session-context-copy'
import { startWebSessionHost, stopWebSessionHost, type WebSessionHost } from './support/web-session-host'

const prefix = 'hbar-session-target-context-'
const base = () => `http://127.0.0.1:${process.env.HBAR_E2E_PORT ?? 48729}`

async function createRepository(root: string) {
  const repository = join(root, 'repository')
  await mkdir(repository)
  await writeFile(join(repository, 'entry.md'), '# Isolated branch fixture\n')
  for (const args of [
    ['init', '-q', '-b', 'main'],
    ['config', 'user.email', 'fixture@hbar.invalid'],
    ['config', 'user.name', 'Fixture'],
    ['add', 'entry.md'],
    ['commit', '-q', '-m', 'isolated fixture'],
  ])
    execFileSync('git', args, { cwd: repository, stdio: 'ignore', windowsHide: true })
  return repository
}

async function removeOwnedFixture(root: string) {
  const absoluteRoot = resolve(root)
  if (dirname(absoluteRoot) !== resolve(tmpdir()) || !basename(absoluteRoot).startsWith(prefix))
    throw new Error('Refusing to remove an unowned E2E directory')
  await rm(absoluteRoot, { recursive: true, force: true })
}

test('composer branch follows a bound isolated session without relabelling its original project or shared sibling', async ({
  browser,
}) => {
  test.setTimeout(60_000)
  const root = await mkdtemp(join(tmpdir(), prefix))
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 960 } })
  let host: WebSessionHost | undefined
  try {
    host = await startWebSessionHost({ root, port: Number(process.env.HBAR_E2E_HOST_PORT ?? 48717) })
    const client = host.client
    const directory = createWorkspaceSessionCommandClient(client)
    // The default fixture stores Host data under root/data. A separately
    // registered child repository keeps managed worktrees outside its source.
    const repository = await createRepository(root)
    const workspace = await directory.execute('workspace.create', { path: repository })
    const shared = await directory.execute(
      'session.create',
      { workspaceId: workspace.id, title: 'Shared sibling — 原项目' },
      { idempotencyKey: crypto.randomUUID() },
    )
    const isolated = await directory.execute(
      'session.create',
      { workspaceId: workspace.id, title: 'Isolated sibling — 会话分支' },
      { idempotencyKey: crypto.randomUUID() },
    )
    const targets = createSessionLaunchTargetReader(client)
    const launch = createCommandClient(sessionLaunchTargetCommands, {
      execute(commandId, input, options) {
        return client.call('command.execute', {
          protocol: COMMAND_PROTOCOL_VERSION,
          requestId: options?.requestId ?? crypto.randomUUID(),
          commandId,
          commandVersion: options?.version ?? 1,
          ...(options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
          input,
        })
      },
    })
    const initial = await targets.read(isolated.id)
    const branch = 'codex/isolated-context-with-a-long-session-specific-name'
    const receipt = await launch.execute(
      'sessionLaunchTarget.set',
      {
        sessionId: isolated.id,
        expectedRevision: initial.revision,
        selection: { mode: 'isolated-worktree', branch: { kind: 'new', name: branch } },
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    const models = createModelCommandClient(client)
    const model = await models.execute('session.getModel', { sessionId: isolated.id })
    await models.execute(
      'session.setModel',
      { sessionId: isolated.id, modelId: 'local-fixture', baselineRevisions: model.revisions },
      { idempotencyKey: crypto.randomUUID() },
    )
    await createBudgetCommandClient(client).execute(
      'session.setBudget',
      { sessionId: isolated.id, tokens: 100_000 },
      { idempotencyKey: crypto.randomUUID() },
    )
    const runs = createRunCommandClient(client)
    const accepted = await runs.execute(
      'run.submit',
      {
        sessionId: isolated.id,
        modelId: 'local-fixture',
        input: { text: 'Bind isolated context fixture', images: [] },
      },
      { idempotencyKey: crypto.randomUUID() },
    )
    await expect
      .poll(async () => (await runs.execute('operation.get', { operationId: accepted.operationId })).status, {
        timeout: 15_000,
      })
      .toBe('completed')
    expect(await targets.read(isolated.id)).toMatchObject({ revision: receipt.revision, locked: true })
    const sharedBranch = execFileSync('git', ['branch', '--show-current'], {
      cwd: repository,
      encoding: 'utf8',
      windowsHide: true,
    }).trim()
    expect(sharedBranch).not.toBe(branch)
    expect((await targets.read(shared.id)).revision).toBe(0)

    expect((await context.request.post(`${base()}/auth/token`, { data: { token: host.ready.token } })).ok()).toBe(true)
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const shell = getShellCopy('zh-CN').shell
    const copy = sessionContextCopy('zh-CN')
    await page.goto(`${base()}/apps/web/`)
    await page.getByTitle(shell.workspaceActions(workspace.name), { exact: true }).waitFor()
    const expand = page.getByRole('button', { name: shell.expandWorkspace(workspace.name), exact: true })
    if (await expand.isVisible()) await expand.click()
    const isolatedRow = page.getByRole('button', { name: shell.openSession(isolated.title), exact: true })
    const sharedRow = page.getByRole('button', { name: shell.openSession(shared.title), exact: true })
    const project = page.getByRole('group', { name: copy.project(workspace.name), exact: true })
    await isolatedRow.click()
    await expect(project.getByTitle(copy.branch(branch), { exact: true })).toBeVisible()
    await expect(project.getByTitle(copy.branch(sharedBranch), { exact: true })).toHaveCount(0)
    await expect(project.getByRole('button')).toHaveCount(0)
    await page.screenshot({ path: 'artifacts/session-project-context/isolated-zh-CN-1440.png' })

    await sharedRow.click()
    await expect(project.getByTitle(copy.branch(sharedBranch), { exact: true })).toBeVisible()
    await expect(project.getByTitle(copy.branch(branch), { exact: true })).toHaveCount(0)
    await isolatedRow.click()
    await expect(project.getByTitle(copy.branch(branch), { exact: true })).toBeVisible()
    await page.setViewportSize({ width: 320, height: 844 })
    await expect(project).toBeVisible()
    await expect(page.getByRole('group', { name: copy.project(workspace.name), exact: true })).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    await page.screenshot({ path: 'artifacts/session-project-context/isolated-zh-CN-320.png' })
    expect(errors).toEqual([])
  } finally {
    await context.close()
    if (host) await stopWebSessionHost(host)
    await removeOwnedFixture(root)
  }
})
