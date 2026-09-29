import { afterEach, expect, test } from 'bun:test'
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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

const resources: { root: string; store: Storage; service: SessionLaunchTargetService }[] = []
const prefix = 'hbar-session-launch-target-service-'

afterEach(async () => {
  for (const resource of resources.splice(0)) {
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

async function gitOk(cwd: string, args: string[]) {
  const result = await git(cwd, args)
  if (result.code !== 0) throw new Error(`${args.join(' ')} failed: ${result.stderr || result.stdout}`)
  return result.stdout.trim()
}

async function fixture(execute?: GitExecutor) {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const repository = join(root, 'repository')
  const data = join(root, 'host-data')
  await mkdir(repository)
  await gitOk(repository, ['init', '-q', '-b', 'main'])
  await gitOk(repository, ['config', 'user.name', 'hbar test'])
  await gitOk(repository, ['config', 'user.email', 'hbar@example.invalid'])
  await writeFile(join(repository, 'README.md'), 'initial\n')
  await gitOk(repository, ['add', 'README.md'])
  await gitOk(repository, ['commit', '-q', '-m', 'initial'])

  const layout = createPathLayout(data, join(root, 'host-cache'), join(root, 'system', 'paths.json'))
  await ensurePathLayout(layout)
  const store = new Storage(layout.database, layout)
  await store.call('ready')
  const workspace = await store.call('createWorkspace', repository, 'fixture')
  const session = await store.call('createSession', workspace.id, 'launch target')
  const service = new SessionLaunchTargetService(store, layout, execute)
  resources.push({ root, store, service })
  return { root, repository, layout, store, service, workspace, session }
}

async function select(store: Storage, sessionId: string, selection: SessionLaunchSelection) {
  return store.call('setSessionLaunchTarget', {
    actorId: 'actor-a',
    idempotencyKey: crypto.randomUUID(),
    sessionId,
    expectedRevision: 0,
    selection,
  })
}

async function expectCode(operation: Promise<unknown>, code: string) {
  let caught: unknown
  try {
    await operation
  } catch (error) {
    caught = error
  }
  expect(caught).toMatchObject({ code })
}

test('new session worktree is Host-data-root managed, idempotent, and leaves the shared checkout on its branch', async () => {
  const f = await fixture()
  const choice: SessionLaunchSelection = {
    mode: 'isolated-worktree',
    branch: { kind: 'new', name: 'feature/session-a', startPoint: 'main' },
  }
  await select(f.store, f.session.id, choice)

  const ready = await f.service.prepare(f.session.id, 1)
  expect(ready).toMatchObject({
    revision: 1,
    selection: choice,
    locked: false,
    resolution: { status: 'ready', branch: 'feature/session-a' },
  })
  const internal = await f.store.call('sessionLaunchTargetRuntime', f.session.id)
  const targetPath = internal.resolution?.targetPath
  expect(targetPath).toBe(join(f.layout.worktrees, f.session.id, 'r1'))
  expect(resolve(targetPath!).startsWith(resolve(f.layout.worktrees) + '\\')).toBeTrue()
  expect(resolve(targetPath!).startsWith(resolve(f.repository) + '\\')).toBeFalse()
  expect(await gitOk(targetPath!, ['branch', '--show-current'])).toBe('feature/session-a')
  expect(await gitOk(f.repository, ['branch', '--show-current'])).toBe('main')
  expect((await gitOk(f.repository, ['worktree', 'list', '--porcelain'])).match(/^worktree /gm)).toHaveLength(2)

  await f.service.prepare(f.session.id, 1)
  expect((await gitOk(f.repository, ['worktree', 'list', '--porcelain'])).match(/^worktree /gm)).toHaveLength(2)
})

test('an existing branch checked out elsewhere reports BRANCH_IN_USE without switching or removing anything', async () => {
  let mutationCalls = 0
  const observe: GitExecutor = async (cwd, args, signal) => {
    if (args[0] === 'worktree' && args[1] === 'add') mutationCalls++
    return git(cwd, args, signal)
  }
  const f = await fixture(observe)
  await gitOk(f.repository, ['switch', '-q', '-c', 'feature/busy'])
  await gitOk(f.repository, ['switch', '-q', 'main'])
  const otherPath = join(f.root, 'already-checked-out')
  await gitOk(f.repository, ['worktree', 'add', '-q', otherPath, 'feature/busy'])
  const sharedHead = await gitOk(f.repository, ['rev-parse', 'HEAD'])
  await select(f.store, f.session.id, {
    mode: 'isolated-worktree',
    branch: { kind: 'existing', name: 'feature/busy' },
  })

  await expectCode(f.service.prepare(f.session.id, 1), 'BRANCH_IN_USE')
  expect(await f.service.get(f.session.id)).toMatchObject({
    locked: false,
    resolution: { status: 'failed', code: 'BRANCH_IN_USE' },
  })
  expect(await gitOk(f.repository, ['branch', '--show-current'])).toBe('main')
  expect(await gitOk(f.repository, ['rev-parse', 'HEAD'])).toBe(sharedHead)
  expect(await gitOk(otherPath, ['branch', '--show-current'])).toBe('feature/busy')
  expect(await readFile(join(otherPath, 'README.md'), 'utf8')).toBe('initial\n')
  expect(mutationCalls).toBe(0)
})

test('occupied deterministic target is reported and preserved byte-for-byte', async () => {
  let mutationCalls = 0
  const observe: GitExecutor = async (cwd, args, signal) => {
    if (args[0] === 'worktree' && args[1] === 'add') mutationCalls++
    return git(cwd, args, signal)
  }
  const f = await fixture(observe)
  const choice: SessionLaunchSelection = {
    mode: 'isolated-worktree',
    branch: { kind: 'new', name: 'feature/occupied', startPoint: 'main' },
  }
  await select(f.store, f.session.id, choice)
  const targetPath = join(f.layout.worktrees, f.session.id, 'r1')
  await mkdir(targetPath, { recursive: true })
  await writeFile(join(targetPath, 'keep.txt'), 'user data\n')
  const sharedHead = await gitOk(f.repository, ['rev-parse', 'HEAD'])

  await expectCode(f.service.prepare(f.session.id, 1), 'SESSION_LAUNCH_TARGET_PATH_OCCUPIED')
  expect(await readFile(join(targetPath, 'keep.txt'), 'utf8')).toBe('user data\n')
  expect(await f.service.get(f.session.id)).toMatchObject({
    resolution: { status: 'failed', code: 'SESSION_LAUNCH_TARGET_PATH_OCCUPIED' },
  })
  expect(await gitOk(f.repository, ['branch', '--show-current'])).toBe('main')
  expect(await gitOk(f.repository, ['rev-parse', 'HEAD'])).toBe(sharedHead)
  expect(mutationCalls).toBe(0)
})

test('restart reconcile handles a lost result after -b created the branch but before its worktree existed', async () => {
  const f = await fixture()
  const choice: SessionLaunchSelection = {
    mode: 'isolated-worktree',
    branch: { kind: 'new', name: 'feature/reconcile', startPoint: 'main' },
  }
  await select(f.store, f.session.id, choice)
  let lostFirstAdd = true
  const injected: GitExecutor = async (cwd, args, signal) => {
    if (lostFirstAdd && args[0] === 'worktree' && args[1] === 'add' && args[2] === '-b') {
      lostFirstAdd = false
      await gitOk(cwd, ['branch', args[3]!, args[5]!])
      return { code: 128, stdout: '', stderr: 'simulated lost result after branch creation' }
    }
    return git(cwd, args, signal)
  }
  const service = new SessionLaunchTargetService(f.store, f.layout, injected)
  await resources[resources.length - 1]!.service.close()
  resources[resources.length - 1]!.service = service

  await expectCode(service.prepare(f.session.id, 1), 'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED')
  expect(await service.get(f.session.id)).toMatchObject({ resolution: { status: 'reconciling' } })
  expect(await gitOk(f.repository, ['branch', '--show-current'])).toBe('main')

  const resumed = new SessionLaunchTargetService(f.store, f.layout)
  resources[resources.length - 1]!.service = resumed
  expect(await resumed.reconcile(f.session.id, 1)).toMatchObject({
    resolution: { status: 'ready', branch: 'feature/reconcile' },
  })
  expect(await gitOk(join(f.layout.worktrees, f.session.id, 'r1'), ['branch', '--show-current'])).toBe(
    'feature/reconcile',
  )
})

test('cancel after Git created a worktree stops acceptance but preserves and reports the created target', async () => {
  const f = await fixture()
  await select(f.store, f.session.id, {
    mode: 'isolated-worktree',
    branch: { kind: 'new', name: 'feature/cancelled', startPoint: 'main' },
  })
  let didCreate!: () => void
  let release!: () => void
  const created = new Promise<void>((resolveCreated) => (didCreate = resolveCreated))
  const gate = new Promise<void>((resolveGate) => (release = resolveGate))
  const delaying: GitExecutor = async (cwd, args, signal) => {
    const result = await git(cwd, args, signal)
    if (args[0] === 'worktree' && args[1] === 'add') {
      didCreate()
      await gate
    }
    return result
  }
  const service = new SessionLaunchTargetService(f.store, f.layout, delaying)
  await resources[resources.length - 1]!.service.close()
  resources[resources.length - 1]!.service = service
  const preparation = service.prepare(f.session.id, 1).then(
    () => null,
    (error: unknown) => error,
  )
  await created
  const cancelled = service.cancel(f.session.id, 1)
  release()
  await cancelled
  expect(await preparation).toMatchObject({ code: 'USER_CANCELLED' })
  const targetPath = join(f.layout.worktrees, f.session.id, 'r1')
  expect(await lstat(targetPath)).toBeDefined()
  expect(await service.get(f.session.id)).toMatchObject({
    resolution: { status: 'ready', branch: 'feature/cancelled' },
  })
  expect(await gitOk(f.repository, ['branch', '--show-current'])).toBe('main')
})
