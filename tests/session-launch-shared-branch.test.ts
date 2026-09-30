import { afterEach, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import type { SessionLaunchSelection } from '@hbar/contracts/commands/session-launch-target'
import { SessionLaunchTargetService } from '@hbar/kernel'
import { createPathLayout, ensurePathLayout, Storage } from '@hbar/storage'

interface GitResult {
  code: number
  stdout: string
  stderr: string
}

type GitExecutor = (cwd: string, args: string[], signal: AbortSignal) => Promise<GitResult>
type SharedBranchCheckoutGuard = (sessionId: string, checkoutRoot: string, signal: AbortSignal) => Promise<void>

const resources: { root: string; store: Storage; service: SessionLaunchTargetService }[] = []
const prefix = 'hbar-session-launch-shared-branch-'

afterEach(async () => {
  for (const resource of resources.splice(0).reverse()) {
    await resource.service.close()
    await resource.store.close()
    const root = resolve(resource.root)
    if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith(prefix))
      throw new Error('Refusing to remove an unowned test directory')
    await rm(root, { recursive: true, force: true })
  }
})

async function git(cwd: string, args: string[], signal = new AbortController().signal): Promise<GitResult> {
  const child = Bun.spawn(['git', ...args], {
    cwd,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' },
    stdout: 'pipe',
    stderr: 'pipe',
    stdin: 'ignore',
    windowsHide: true,
    signal,
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { code, stdout, stderr }
}

async function gitOk(cwd: string, args: string[]): Promise<string> {
  const result = await git(cwd, args)
  if (result.code !== 0) throw new Error(`${args.join(' ')} failed: ${result.stderr || result.stdout}`)
  return result.stdout.trim()
}

async function fixture(execute?: GitExecutor, guard?: SharedBranchCheckoutGuard) {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const repository = join(root, 'repository')
  await mkdir(repository)
  await gitOk(repository, ['init', '-q', '-b', 'main'])
  await gitOk(repository, ['config', 'user.name', 'hbar test'])
  await gitOk(repository, ['config', 'user.email', 'hbar@example.invalid'])
  await writeFile(join(repository, 'README.md'), 'main\n')
  await gitOk(repository, ['add', 'README.md'])
  await gitOk(repository, ['commit', '-q', '-m', 'initial'])

  const layout = createPathLayout(join(root, 'host-data'), join(root, 'host-cache'), join(root, 'paths.json'))
  await ensurePathLayout(layout)
  const store = new Storage(layout.database, layout)
  await store.call('ready')
  const workspace = await store.call('createWorkspace', repository, 'fixture')
  const session = await store.call('createSession', workspace.id, 'shared branch')
  const service = new SessionLaunchTargetService(store, layout, execute, guard)
  resources.push({ root, store, service })
  return { root, repository, layout, store, service, workspace, session }
}

async function addBranch(repository: string, name = 'feature/shared'): Promise<{ ref: string; tipOid: string }> {
  await gitOk(repository, ['switch', '-q', '-c', name])
  await writeFile(join(repository, 'README.md'), 'feature\n')
  await gitOk(repository, ['add', 'README.md'])
  await gitOk(repository, ['commit', '-q', '-m', 'feature tip'])
  const tipOid = await gitOk(repository, ['rev-parse', 'HEAD'])
  await gitOk(repository, ['switch', '-q', 'main'])
  return { ref: `refs/heads/${name}`, tipOid }
}

async function selectSharedBranch(
  store: Storage,
  sessionId: string,
  branch: { ref: string; tipOid: string },
): Promise<number> {
  const selection: SessionLaunchSelection = { mode: 'shared-branch', branch }
  const receipt = await store.call('setSessionLaunchTarget', {
    actorId: 'shared-branch-test-actor',
    idempotencyKey: crypto.randomUUID(),
    sessionId,
    expectedRevision: 0,
    selection,
  })
  return receipt.revision
}

async function expectCode(operation: Promise<unknown>, code: string): Promise<void> {
  let caught: unknown
  try {
    await operation
  } catch (error) {
    caught = error
  }
  expect(caught).toMatchObject({ code })
}

test('selection does not checkout; first preparation switches the shared root without creating a worktree', async () => {
  const guardCalls: { sessionId: string; checkoutRoot: string }[] = []
  const f = await fixture(undefined, async (sessionId, checkoutRoot, signal) => {
    signal.throwIfAborted()
    guardCalls.push({ sessionId, checkoutRoot })
  })
  const branch = await addBranch(f.repository)
  const revision = await selectSharedBranch(f.store, f.session.id, branch)
  const hooks = join(f.repository, '.git', 'hooks')
  const marker = join(hooks, 'shared-branch-post-checkout-sentinel')
  const hook = join(hooks, 'post-checkout')
  await writeFile(hook, '#!/bin/sh\nprintf \'ran\\n\' >> "$(dirname "$0")/shared-branch-post-checkout-sentinel"\n')
  await chmod(hook, 0o755)

  expect(await gitOk(f.repository, ['symbolic-ref', '--quiet', 'HEAD'])).toBe('refs/heads/main')
  expect(await f.service.checkoutRootForWorkspace(f.workspace.path)).toBe(f.repository)

  const ready = await f.service.prepare(f.session.id, revision)
  expect(ready).toMatchObject({
    revision,
    selection: { mode: 'shared-branch', branch },
    resolution: { status: 'ready', branch: 'feature/shared' },
  })
  expect(guardCalls).toEqual([{ sessionId: f.session.id, checkoutRoot: f.repository }])
  expect(await gitOk(f.repository, ['symbolic-ref', '--quiet', 'HEAD'])).toBe(branch.ref)
  expect(await gitOk(f.repository, ['rev-parse', 'HEAD'])).toBe(branch.tipOid)
  expect(existsSync(marker)).toBeFalse()
  expect((await gitOk(f.repository, ['worktree', 'list', '--porcelain'])).match(/^worktree /gm)).toHaveLength(1)

  const intent = (await f.store.call('sessionLaunchTargetRuntime', f.session.id)).resolution
  expect(intent).toMatchObject({
    state: 'ready',
    targetPath: f.repository,
    branch: 'feature/shared',
    requestedHead: branch.tipOid,
    resolvedHead: branch.tipOid,
  })
})

test('a moved captured ref is rejected before the shared checkout changes', async () => {
  const f = await fixture()
  const captured = await addBranch(f.repository)
  await gitOk(f.repository, ['switch', '-q', 'feature/shared'])
  await writeFile(join(f.repository, 'README.md'), 'moved tip\n')
  await gitOk(f.repository, ['add', 'README.md'])
  await gitOk(f.repository, ['commit', '-q', '-m', 'move selected ref'])
  await gitOk(f.repository, ['switch', '-q', 'main'])
  const revision = await selectSharedBranch(f.store, f.session.id, captured)

  await expectCode(f.service.prepare(f.session.id, revision), 'GIT_BRANCH_BASE_CHANGED')
  expect(await gitOk(f.repository, ['symbolic-ref', '--quiet', 'HEAD'])).toBe('refs/heads/main')
  expect((await gitOk(f.repository, ['worktree', 'list', '--porcelain'])).match(/^worktree /gm)).toHaveLength(1)
  expect((await f.store.call('sessionLaunchTargetRuntime', f.session.id)).resolution).toMatchObject({
    state: 'failed',
    errorCode: 'GIT_BRANCH_BASE_CHANGED',
  })
})

test('checkout-root lookup falls back for non-Git paths and non-cancellation Git inspection failures', async () => {
  const brokenInspection: GitExecutor = async (cwd, args, signal) => {
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel')
      return { code: 128, stdout: '', stderr: 'fatal: detected dubious ownership in repository' }
    return git(cwd, args, signal)
  }
  const f = await fixture(brokenInspection)
  const nonRepository = join(f.root, 'plain-folder')
  await mkdir(nonRepository)

  expect(await f.service.checkoutRootForWorkspace(f.workspace.path)).toBe(f.repository)
  expect(await f.service.checkoutRootForWorkspace(nonRepository)).toBe(nonRepository)
})

test('a dirty checkout conflict does not discard edits or claim the selected branch is ready', async () => {
  const f = await fixture()
  const branch = await addBranch(f.repository)
  await writeFile(join(f.repository, 'README.md'), 'uncommitted main work\n')
  const revision = await selectSharedBranch(f.store, f.session.id, branch)

  await expectCode(f.service.prepare(f.session.id, revision), 'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED')
  expect(await gitOk(f.repository, ['symbolic-ref', '--quiet', 'HEAD'])).toBe('refs/heads/main')
  expect(await readFile(join(f.repository, 'README.md'), 'utf8')).toBe('uncommitted main work\n')
  expect((await f.store.call('sessionLaunchTargetRuntime', f.session.id)).resolution).toMatchObject({
    state: 'reconciling',
    branch: 'feature/shared',
  })
  expect((await gitOk(f.repository, ['worktree', 'list', '--porcelain'])).match(/^worktree /gm)).toHaveLength(1)
})

test('a prepared shared target mismatch is reported without switching back automatically', async () => {
  const f = await fixture()
  const branch = await addBranch(f.repository)
  const revision = await selectSharedBranch(f.store, f.session.id, branch)
  await f.service.prepare(f.session.id, revision)

  await gitOk(f.repository, ['switch', '-q', 'main'])
  await expectCode(f.service.prepare(f.session.id, revision), 'SESSION_LAUNCH_TARGET_RECONCILE_CONFLICT')
  expect(await gitOk(f.repository, ['symbolic-ref', '--quiet', 'HEAD'])).toBe('refs/heads/main')
  expect((await f.store.call('sessionLaunchTargetRuntime', f.session.id)).resolution).toMatchObject({
    state: 'failed',
    branch: 'feature/shared',
  })
})

test('the accepted shared binding follows the workspace path and tolerates later HEAD advancement', async () => {
  const f = await fixture()
  const branch = await addBranch(f.repository)
  const revision = await selectSharedBranch(f.store, f.session.id, branch)
  await f.service.prepare(f.session.id, revision)

  const binding = await f.service.bindForRun(f.session.id, undefined, revision)
  expect(binding).toMatchObject({
    selection: { mode: 'shared-branch', branch },
    targetPath: f.repository,
    branch: 'feature/shared',
    head: branch.tipOid,
    requirePreparedTarget: true,
  })
  await f.store.call(
    'enqueue',
    f.session.id,
    'shared-branch-first-run',
    { text: 'first send', images: [] },
    'test-model',
    undefined,
    binding,
  )

  await writeFile(join(f.repository, 'later.txt'), 'created by an accepted Run\n')
  await gitOk(f.repository, ['add', 'later.txt'])
  await gitOk(f.repository, ['commit', '-q', '-m', 'advance shared branch'])
  expect(await gitOk(f.repository, ['rev-parse', 'HEAD'])).not.toBe(branch.tipOid)

  const replay = await f.service.bindForRun(f.session.id)
  expect(replay).toMatchObject({
    targetPath: f.repository,
    branch: 'feature/shared',
  })
  expect(await f.service.workspaceForRun(f.session.id, f.workspace.path)).toBe(f.repository)
})
