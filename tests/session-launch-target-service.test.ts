import { afterEach, expect, test } from 'bun:test'
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
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

async function fixture(execute?: GitExecutor, dataDirectory = 'host-data') {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const repository = join(root, 'repository')
  const data = join(root, dataDirectory)
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

function isWorktreeAdd(args: string[]): boolean {
  const commandIndex = args.indexOf('worktree')
  return commandIndex >= 0 && args[commandIndex + 1] === 'add'
}

function waitForGateOrAbort(gate: Promise<void>, signal: AbortSignal): Promise<void> {
  return new Promise((resolveGate, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      reject(signal.reason)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    gate.then(
      () => {
        signal.removeEventListener('abort', onAbort)
        resolveGate()
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
    if (signal.aborted) onAbort()
  })
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

test('derived worktrees use a captured local base OID without moving the current or checked-out base branch', async () => {
  const f = await fixture()
  await gitOk(f.repository, ['branch', 'feature/base-elsewhere'])
  const heldPath = join(f.root, 'held-base-worktree')
  await gitOk(f.repository, ['worktree', 'add', '-q', heldPath, 'feature/base-elsewhere'])
  const mainHead = await gitOk(f.repository, ['rev-parse', 'refs/heads/main'])
  const heldHead = await gitOk(f.repository, ['rev-parse', 'refs/heads/feature/base-elsewhere'])

  await select(f.store, f.session.id, {
    mode: 'isolated-worktree',
    branch: { kind: 'derived', baseRef: 'refs/heads/main' },
  })
  const currentBaseTarget = await f.service.prepare(f.session.id, 1)
  const currentBranch = currentBaseTarget.resolution.status === 'ready' ? currentBaseTarget.resolution.branch : null
  if (!currentBranch) throw new Error('Expected the prepared target to expose its generated branch')
  expect(currentBranch).toMatch(/^hbar\/session-launch\/[0-9a-f]{64}$/)
  const currentResolution = (await f.store.call('sessionLaunchTargetRuntime', f.session.id)).resolution
  expect(currentResolution).toMatchObject({
    state: 'ready',
    branch: currentBranch,
    requestedHead: mainHead,
    resolvedHead: mainHead,
  })
  expect(await gitOk(currentResolution!.targetPath, ['branch', '--show-current'])).toBe(currentBranch)
  expect(await gitOk(currentResolution!.targetPath, ['rev-parse', 'HEAD'])).toBe(mainHead)

  const elsewhereSession = await f.store.call('createSession', f.workspace.id, 'derived from checked-out branch')
  await select(f.store, elsewhereSession.id, {
    mode: 'isolated-worktree',
    branch: { kind: 'derived', baseRef: 'refs/heads/feature/base-elsewhere' },
  })
  const elsewhereTarget = await f.service.prepare(elsewhereSession.id, 1)
  const elsewhereBranch = elsewhereTarget.resolution.status === 'ready' ? elsewhereTarget.resolution.branch : null
  if (!elsewhereBranch) throw new Error('Expected the prepared target to expose its generated branch')
  expect(elsewhereBranch).toMatch(/^hbar\/session-launch\/[0-9a-f]{64}$/)
  expect(elsewhereBranch).not.toBe(currentBranch)
  const elsewhereResolution = (await f.store.call('sessionLaunchTargetRuntime', elsewhereSession.id)).resolution
  expect(elsewhereResolution).toMatchObject({
    state: 'ready',
    branch: elsewhereBranch,
    requestedHead: heldHead,
    resolvedHead: heldHead,
  })
  expect(await gitOk(elsewhereResolution!.targetPath, ['branch', '--show-current'])).toBe(elsewhereBranch)
  expect(await gitOk(elsewhereResolution!.targetPath, ['rev-parse', 'HEAD'])).toBe(heldHead)

  const subdirectory = join(f.repository, 'packages', 'nested')
  await mkdir(subdirectory, { recursive: true })
  const nestedWorkspace = await f.store.call('createWorkspace', subdirectory, 'nested')
  const nestedSession = await f.store.call('createSession', nestedWorkspace.id, 'derived from subdirectory')
  await select(f.store, nestedSession.id, {
    mode: 'isolated-worktree',
    branch: { kind: 'derived', baseRef: 'refs/heads/main' },
  })
  await expectCode(f.service.prepare(nestedSession.id, 1), 'SESSION_LAUNCH_TARGET_SUBDIRECTORY_UNSUPPORTED')

  expect(await gitOk(f.repository, ['symbolic-ref', '--short', 'HEAD'])).toBe('main')
  expect(await gitOk(f.repository, ['rev-parse', 'HEAD'])).toBe(mainHead)
  expect(await gitOk(f.repository, ['rev-parse', 'refs/heads/main'])).toBe(mainHead)
  expect(await gitOk(f.repository, ['rev-parse', 'refs/heads/feature/base-elsewhere'])).toBe(heldHead)
  expect(await gitOk(heldPath, ['branch', '--show-current'])).toBe('feature/base-elsewhere')
})

test('porcelain -z keeps Unicode and spaces in managed paths during restart reconciliation', async () => {
  const f = await fixture(undefined, 'Host Data 数据')
  await select(f.store, f.session.id, {
    mode: 'isolated-worktree',
    branch: { kind: 'new', name: 'feature/unicode-path', startPoint: 'main' },
  })

  await f.service.prepare(f.session.id, 1)
  const runtime = await f.store.call('sessionLaunchTargetRuntime', f.session.id)
  const intent = runtime.resolution
  if (!intent) throw new Error('Prepared worktree intent was not persisted')
  const list = await git(f.repository, ['worktree', 'list', '--porcelain', '-z'])
  const gitPath = intent.targetPath.replaceAll('\\', '/')
  expect(list.stdout).toContain(`worktree ${gitPath}\0`)
  expect(list.stdout).not.toContain(`worktree "${gitPath}`)

  await f.store.call('updateSessionLaunchTargetPreparation', {
    sessionId: f.session.id,
    revision: 1,
    targetPath: intent.targetPath,
    state: 'reconciling',
    errorCode: 'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED',
    errorMessage: 'Simulated restart before ready was persisted',
  })
  expect(await f.service.reconcile(f.session.id, 1)).toMatchObject({
    resolution: { status: 'ready', branch: 'feature/unicode-path' },
  })
})

test('Host worktree creation bypasses repository post-checkout hooks', async () => {
  const f = await fixture()
  const hooks = join(f.repository, '.git', 'hooks')
  const sentinel = join(hooks, 'launch-target-hook-sentinel')
  const hook = join(hooks, 'post-checkout')
  await gitOk(f.repository, ['config', 'core.filemode', 'true'])
  await writeFile(hook, '#!/bin/sh\nprintf \'ran\\n\' >> "$(dirname "$0")/launch-target-hook-sentinel"\n')
  await chmod(hook, 0o755)

  await gitOk(f.repository, ['worktree', 'add', '--detach', join(f.root, 'hook-control')])
  expect(await readFile(sentinel, 'utf8')).toBe('ran\n')
  await writeFile(sentinel, '')
  await select(f.store, f.session.id, {
    mode: 'isolated-worktree',
    branch: { kind: 'new', name: 'feature/hook-disabled', startPoint: 'main' },
  })

  await f.service.prepare(f.session.id, 1)
  expect(await readFile(sentinel, 'utf8')).toBe('')
})

test('a joining prepare can cancel its own wait without cancelling the active owner', async () => {
  const f = await fixture()
  await select(f.store, f.session.id, {
    mode: 'isolated-worktree',
    branch: { kind: 'new', name: 'feature/join-cancel', startPoint: 'main' },
  })
  let didStart!: () => void
  let release!: () => void
  const started = new Promise<void>((resolveStarted) => (didStart = resolveStarted))
  const gate = new Promise<void>((resolveGate) => (release = resolveGate))
  const waiting: GitExecutor = async (cwd, args, signal) => {
    const result = await git(cwd, args, signal)
    if (isWorktreeAdd(args)) {
      didStart()
      await gate
    }
    return result
  }
  const service = new SessionLaunchTargetService(f.store, f.layout, waiting)
  await resources[resources.length - 1]!.service.close()
  resources[resources.length - 1]!.service = service
  const owner = service.prepare(f.session.id, 1)
  await started
  const joiningController = new AbortController()
  const joining = service.prepare(f.session.id, 1, joiningController.signal).then(
    () => null,
    (error: unknown) => error,
  )
  joiningController.abort(new Error('joining caller cancelled'))
  const joinTimedOut = Symbol('join timed out')
  const resultBeforeRelease = await Promise.race([
    joining,
    new Promise<symbol>((resolveLater) => setTimeout(() => resolveLater(joinTimedOut), 250)),
  ])
  release()
  const ownerResult = await owner
  expect(resultBeforeRelease).not.toBe(joinTimedOut)
  expect(resultBeforeRelease).toMatchObject({ code: 'USER_CANCELLED' })
  expect(ownerResult.resolution).toMatchObject({ status: 'ready', branch: 'feature/join-cancel' })
})

test('Git subprocesses are globally bounded and cancellation removes a queued session command', async () => {
  let concurrent = 0
  let peak = 0
  let initialCommands = 0
  let fourStarted!: () => void
  let release!: () => void
  const firstWaveStarted = new Promise<void>((resolveStarted) => (fourStarted = resolveStarted))
  const firstWave = new Promise<void>((resolveGate) => (release = resolveGate))
  const waiting: GitExecutor = async (cwd, args, signal) => {
    concurrent++
    peak = Math.max(peak, concurrent)
    try {
      if (args.includes('--show-toplevel')) {
        initialCommands++
        if (initialCommands === 4) fourStarted()
        if (initialCommands <= 4) await waitForGateOrAbort(firstWave, signal)
      }
      return await git(cwd, args, signal)
    } finally {
      concurrent--
    }
  }
  const f = await fixture(waiting)
  await gitOk(f.repository, ['switch', '-q', '-c', 'feature/git-pool-busy'])
  await gitOk(f.repository, ['switch', '-q', 'main'])
  const other = join(f.root, 'pool-busy-worktree')
  await gitOk(f.repository, ['worktree', 'add', '-q', other, 'feature/git-pool-busy'])
  const sessions = [f.session]
  for (let index = 1; index < 5; index++)
    sessions.push(await f.store.call('createSession', f.workspace.id, `pool waiter ${index}`))
  for (const session of sessions)
    await select(f.store, session.id, {
      mode: 'isolated-worktree',
      branch: { kind: 'existing', name: 'feature/git-pool-busy' },
    })
  const queuedController = new AbortController()
  const pending = sessions.map((session, index) =>
    f.service.prepare(session.id, 1, index === 4 ? queuedController.signal : undefined).then(
      () => null,
      (error: unknown) => error,
    ),
  )

  try {
    await firstWaveStarted
    await new Promise((resolveLater) => setTimeout(resolveLater, 100))
    const activeAtLimit = initialCommands
    queuedController.abort(new Error('queued Git command cancelled'))
    expect(await pending[4]).toMatchObject({ code: 'USER_CANCELLED' })
    expect(activeAtLimit).toBe(4)
  } finally {
    release()
  }
  const outcomes = await Promise.all(pending.slice(0, 4))
  expect(outcomes.map((error) => (error as { code?: string }).code)).toEqual([
    'BRANCH_IN_USE',
    'BRANCH_IN_USE',
    'BRANCH_IN_USE',
    'BRANCH_IN_USE',
  ])
  expect(peak).toBeLessThanOrEqual(4)
})

test('the Host Git waiting queue is capped and rejects excess commands with BUSY', async () => {
  let active = 0
  let peak = 0
  let initialCommands = 0
  let fourStarted!: () => void
  let release!: () => void
  const firstWaveStarted = new Promise<void>((resolveStarted) => (fourStarted = resolveStarted))
  const firstWave = new Promise<void>((resolveGate) => (release = resolveGate))
  const waiting: GitExecutor = async (cwd, args, signal) => {
    active++
    peak = Math.max(peak, active)
    try {
      if (args.includes('--show-toplevel')) {
        initialCommands++
        if (initialCommands === 4) fourStarted()
        if (initialCommands <= 4) await waitForGateOrAbort(firstWave, signal)
      }
      return await git(cwd, args, signal)
    } finally {
      active--
    }
  }
  const f = await fixture(waiting)
  await gitOk(f.repository, ['switch', '-q', '-c', 'feature/queue-cap-busy'])
  await gitOk(f.repository, ['switch', '-q', 'main'])
  await gitOk(f.repository, ['worktree', 'add', '-q', join(f.root, 'queue-cap-busy'), 'feature/queue-cap-busy'])
  const sessions = [f.session]
  for (let index = 1; index < 69; index++)
    sessions.push(await f.store.call('createSession', f.workspace.id, `queue capacity ${index}`))
  for (const session of sessions)
    await select(f.store, session.id, {
      mode: 'isolated-worktree',
      branch: { kind: 'existing', name: 'feature/queue-cap-busy' },
    })
  const pending = sessions.map((session) =>
    f.service.prepare(session.id, 1).then(
      () => null,
      (error: unknown) => error,
    ),
  )

  try {
    await firstWaveStarted
    await new Promise((resolveLater) => setTimeout(resolveLater, 200))
    expect(initialCommands).toBe(4)
  } finally {
    release()
  }
  const outcomes = await Promise.all(pending)
  const errors = outcomes.filter((outcome): outcome is Error => outcome instanceof Error)
  expect(errors.some((error) => 'code' in error && error.code === 'BUSY')).toBeTrue()
  expect(peak).toBeLessThanOrEqual(4)
  expect(await gitOk(f.repository, ['branch', '--show-current'])).toBe('main')
})

test('an existing branch checked out elsewhere reports BRANCH_IN_USE without switching or removing anything', async () => {
  let mutationCalls = 0
  const observe: GitExecutor = async (cwd, args, signal) => {
    if (isWorktreeAdd(args)) mutationCalls++
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
    if (isWorktreeAdd(args)) mutationCalls++
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

test('a symlink at the Host session directory cannot redirect worktree creation outside its root', async () => {
  let mutationCalls = 0
  const observe: GitExecutor = async (cwd, args, signal) => {
    if (isWorktreeAdd(args)) mutationCalls++
    return git(cwd, args, signal)
  }
  const f = await fixture(observe)
  await select(f.store, f.session.id, {
    mode: 'isolated-worktree',
    branch: { kind: 'new', name: 'feature/root-symlink', startPoint: 'main' },
  })
  const outside = join(f.root, 'outside-managed-root')
  await mkdir(outside)
  const sessionRoot = join(f.layout.worktrees, f.session.id)
  await symlink(outside, sessionRoot, process.platform === 'win32' ? 'junction' : 'dir')

  await expectCode(f.service.prepare(f.session.id, 1), 'SESSION_LAUNCH_TARGET_INVALID_ROOT')
  let outsideTargetExists = true
  try {
    await lstat(join(outside, 'r1'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    outsideTargetExists = false
  }
  expect(outsideTargetExists).toBeFalse()
  expect(mutationCalls).toBe(0)
})

test('restart reconcile handles a lost result after -b created the branch but before its worktree existed', async () => {
  const f = await fixture()
  const choice: SessionLaunchSelection = {
    mode: 'isolated-worktree',
    branch: { kind: 'derived', baseRef: 'refs/heads/main' },
  }
  await select(f.store, f.session.id, choice)
  let lostFirstAdd = true
  const injected: GitExecutor = async (cwd, args, signal) => {
    const commandIndex = args.indexOf('worktree')
    if (lostFirstAdd && isWorktreeAdd(args) && args[commandIndex + 2] === '-b') {
      lostFirstAdd = false
      await gitOk(cwd, ['branch', args[commandIndex + 3]!, args[commandIndex + 5]!])
      return { code: 128, stdout: '', stderr: 'simulated lost result after branch creation' }
    }
    return git(cwd, args, signal)
  }
  const service = new SessionLaunchTargetService(f.store, f.layout, injected)
  await resources[resources.length - 1]!.service.close()
  resources[resources.length - 1]!.service = service

  await expectCode(service.prepare(f.session.id, 1), 'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED')
  const interrupted = await f.store.call('sessionLaunchTargetRuntime', f.session.id)
  const generatedBranch = interrupted.resolution?.branch
  if (!generatedBranch) throw new Error('Expected the interrupted intent to persist its generated branch')
  expect(generatedBranch).toMatch(/^hbar\/session-launch\/[0-9a-f]{64}$/)
  expect(await service.get(f.session.id)).toMatchObject({ resolution: { status: 'reconciling' } })
  expect(await gitOk(f.repository, ['branch', '--show-current'])).toBe('main')

  const resumed = new SessionLaunchTargetService(f.store, f.layout)
  resources[resources.length - 1]!.service = resumed
  expect(await resumed.reconcile(f.session.id, 1)).toMatchObject({
    resolution: { status: 'ready', branch: generatedBranch },
  })
  expect(await gitOk(join(f.layout.worktrees, f.session.id, 'r1'), ['branch', '--show-current'])).toBe(generatedBranch)
})

test('cancel after Git created a worktree stops acceptance but preserves and reports the created target', async () => {
  const f = await fixture()
  await select(f.store, f.session.id, {
    mode: 'isolated-worktree',
    branch: { kind: 'derived', baseRef: 'refs/heads/main' },
  })
  let didCreate!: () => void
  let release!: () => void
  const created = new Promise<void>((resolveCreated) => (didCreate = resolveCreated))
  const gate = new Promise<void>((resolveGate) => (release = resolveGate))
  const delaying: GitExecutor = async (cwd, args, signal) => {
    const result = await git(cwd, args, signal)
    if (isWorktreeAdd(args)) {
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
  const ready = await service.get(f.session.id)
  expect(ready.resolution).toMatchObject({ status: 'ready' })
  if (ready.resolution.status !== 'ready' || !ready.resolution.branch)
    throw new Error('Cancelled derived worktree was not retained as ready')
  expect(ready.resolution.branch).toMatch(/^hbar\/session-launch\/[0-9a-f]{64}$/)
  expect(await gitOk(targetPath, ['branch', '--show-current'])).toBe(ready.resolution.branch)
  expect(await gitOk(f.repository, ['branch', '--show-current'])).toBe('main')
})

test('get remains responsive with a readable preparing state and cooperative cancel is bounded', async () => {
  let signalAddStarted!: () => void
  const addStarted = new Promise<void>((resolveStarted) => (signalAddStarted = resolveStarted))
  const waiting: GitExecutor = async (cwd, args, signal) => {
    if (isWorktreeAdd(args)) {
      signalAddStarted()
      await waitForGateOrAbort(new Promise<void>(() => undefined), signal)
    }
    return git(cwd, args, signal)
  }
  const f = await fixture(waiting)
  await select(f.store, f.session.id, {
    mode: 'isolated-worktree',
    branch: { kind: 'new', name: 'feature/cancel-responsive', startPoint: 'main' },
  })
  const preparation = f.service.prepare(f.session.id, 1).then(
    () => null,
    (error: unknown) => error,
  )
  await addStarted

  const readStartedAt = performance.now()
  const during = await f.service.get(f.session.id)
  const readElapsed = performance.now() - readStartedAt
  expect(during.resolution).toMatchObject({ status: 'preparing' })
  expect(readElapsed).toBeLessThan(1_000)

  const cancelStartedAt = performance.now()
  const cancelled = await f.service.cancel(f.session.id, 1)
  const cancelElapsed = performance.now() - cancelStartedAt
  expect(cancelElapsed).toBeLessThan(3_000)
  expect(cancelled.resolution).toMatchObject({ status: 'reconciling' })
  expect(await preparation).toMatchObject({ code: 'USER_CANCELLED' })
})

test('close aborts cooperative Git, persists reconcile-needed state, and leaves created worktree intact', async () => {
  let signalAddStarted!: () => void
  let release!: () => void
  const addStarted = new Promise<void>((resolveStarted) => (signalAddStarted = resolveStarted))
  const gate = new Promise<void>((resolveGate) => (release = resolveGate))
  const waiting: GitExecutor = async (cwd, args, signal) => {
    const result = await git(cwd, args, signal)
    if (isWorktreeAdd(args)) {
      signalAddStarted()
      await waitForGateOrAbort(gate, signal)
    }
    return result
  }
  const f = await fixture(waiting)
  await select(f.store, f.session.id, {
    mode: 'isolated-worktree',
    branch: { kind: 'new', name: 'feature/close-preserve', startPoint: 'main' },
  })
  const preparation = f.service.prepare(f.session.id, 1).then(
    () => null,
    (error: unknown) => error,
  )
  await addStarted
  const targetPath = join(f.layout.worktrees, f.session.id, 'r1')
  expect(await lstat(targetPath)).toBeDefined()

  const closeStartedAt = performance.now()
  await f.service.close()
  const closeElapsed = performance.now() - closeStartedAt
  expect(closeElapsed).toBeLessThan(3_000)
  expect(await preparation).toMatchObject({ code: 'HOST_SHUTTING_DOWN' })
  expect(await f.service.get(f.session.id)).toMatchObject({ resolution: { status: 'reconciling' } })
  expect(await lstat(targetPath)).toBeDefined()
  release()
})
