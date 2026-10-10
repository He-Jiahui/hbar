import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { SessionLaunchTargetPreparationService, SessionLaunchTargetService } from '@hbar/kernel'
import type {
  SessionLaunchTarget,
  SessionLaunchTargetPreparationOperationInput,
} from '@hbar/contracts/commands/session-launch-target'
import { createPathLayout, ensurePathLayout, Storage } from '@hbar/storage'

interface GitResult {
  code: number
  stdout: string
  stderr: string
}

type GitExecutor = (cwd: string, args: string[], signal: AbortSignal) => Promise<GitResult>

interface Resource {
  root: string
  store: Storage
  targets: SessionLaunchTargetService
  preparations: SessionLaunchTargetPreparationService
}

const resources: Resource[] = []
const prefix = 'hbar-session-launch-preparation-service-'

afterEach(async () => {
  for (const resource of resources.splice(0).reverse()) {
    await resource.preparations.close()
    await resource.targets.close()
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

async function gitOk(cwd: string, args: string[], signal?: AbortSignal): Promise<string> {
  const result = await git(cwd, args, signal)
  if (result.code !== 0) throw new Error(`${args.join(' ')} failed: ${result.stderr || result.stdout}`)
  return result.stdout.trim()
}

function isWorktreeAdd(args: string[]): boolean {
  const commandIndex = args.indexOf('worktree')
  return commandIndex >= 0 && args[commandIndex + 1] === 'add'
}

function normalizedPath(path: string): string {
  return path.replaceAll('\\', '/')
}

function selection(branch: string) {
  return { mode: 'isolated-worktree' as const, branch: { kind: 'new' as const, name: branch, startPoint: 'HEAD' } }
}

async function fixture(execute?: GitExecutor) {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const repository = join(root, 'repository')
  await mkdir(repository)
  await gitOk(repository, ['init', '-q', '-b', 'main'])
  await gitOk(repository, ['config', 'user.name', 'hbar test'])
  await gitOk(repository, ['config', 'user.email', 'hbar@example.invalid'])
  await writeFile(join(repository, 'README.md'), 'initial\n')
  await gitOk(repository, ['add', 'README.md'])
  await gitOk(repository, ['commit', '-q', '-m', 'initial'])

  const layout = createPathLayout(join(root, 'host-data'), join(root, 'host-cache'), join(root, 'paths.json'))
  await ensurePathLayout(layout)
  const store = new Storage(layout.database, layout)
  expect(await store.call('ready')).toEqual({ version: 24 })
  const workspace = await store.call('createWorkspace', repository, 'fixture')
  const session = await store.call('createSession', workspace.id, 'launch target')
  const targets = new SessionLaunchTargetService(store, layout, execute)
  const preparations = new SessionLaunchTargetPreparationService(store, {
    prepare: (sessionId, revision, signal) => targets.prepare(sessionId, revision, signal),
    reconcile: (sessionId, revision, signal) => targets.reconcile(sessionId, revision, signal),
    reconcileCancellation: (sessionId, revision, signal) =>
      targets.reconcileCancelledPreparation(sessionId, revision, signal),
    readTarget: (sessionId) => targets.get(sessionId),
  })
  const resource = { root, store, targets, preparations }
  resources.push(resource)
  return { ...resource, repository, layout, workspace, session }
}

async function chooseBranch(store: Storage, sessionId: string, branch: string): Promise<number> {
  const receipt = await store.call('setSessionLaunchTarget', {
    actorId: 'preparation-test-actor',
    idempotencyKey: `select-${branch}`,
    sessionId,
    expectedRevision: 0,
    selection: selection(branch),
  })
  return receipt.revision
}

async function waitFor<Value>(
  read: () => Promise<Value>,
  ready: (value: Value) => boolean,
  timeoutMs = 8_000,
): Promise<Value> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await read()
    if (ready(value)) return value
    await new Promise((resolveWait) => setTimeout(resolveWait, 10))
  }
  throw new Error(`Timed out waiting for preparation after ${timeoutMs}ms`)
}

async function expectNoRuns(path: string, sessionId: string) {
  const db = new Database(path, { strict: true })
  try {
    const count = db
      .query<{ count: number }, [string]>('SELECT COUNT(*) AS count FROM runs WHERE sessionId=?')
      .get(sessionId)?.count
    expect(count).toBe(0)
  } finally {
    db.close()
  }
}

test('preparation accepts quickly, duplicate keys join, and cancellation before Git mutation does not queue a Run', async () => {
  let releaseEntered!: () => void
  const entered = new Promise<void>((resolveEntered) => {
    releaseEntered = resolveEntered
  })
  let calls = 0
  const execute: GitExecutor = async (cwd, args, signal) => {
    calls++
    if (args[0] === 'rev-parse' && args.includes('--show-toplevel')) {
      releaseEntered()
      await new Promise<never>((_resolve, reject) => {
        const abort = () => reject(signal.reason)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
      })
    }
    return git(cwd, args, signal)
  }
  const f = await fixture(execute)
  const revision = await chooseBranch(f.store, f.session.id, 'feature/cancel-before')
  const startedAt = Date.now()
  const receipt = await f.preparations.start({
    actorId: 'preparation-test-actor',
    idempotencyKey: 'cancel-before-key',
    sessionId: f.session.id,
    expectedRevision: revision,
  })
  expect(Date.now() - startedAt).toBeLessThan(1_000)
  await entered
  expect(
    await f.preparations.start({
      actorId: 'preparation-test-actor',
      idempotencyKey: 'cancel-before-key',
      sessionId: f.session.id,
      expectedRevision: revision,
    }),
  ).toEqual(receipt)
  const identity = {
    sessionId: f.session.id,
    expectedRevision: revision,
    operationId: receipt.operationId,
  }
  expect(await f.preparations.read(identity)).toMatchObject({ status: 'preparing' })
  const cancelStartedAt = Date.now()
  expect(await f.preparations.cancel(identity)).toMatchObject({ status: 'cancel-requested' })
  expect(Date.now() - cancelStartedAt).toBeLessThan(1_000)
  const settled = await waitFor(
    () => f.preparations.read(identity),
    (snapshot) => snapshot.status === 'cancelled' || snapshot.status === 'ready' || snapshot.status === 'failed',
  )
  expect(settled).toMatchObject({ status: 'cancelled' })
  expect(calls).toBe(1)
  await expectNoRuns(f.layout.database, f.session.id)
  expect(
    await git(f.repository, ['show-ref', '--verify', '--quiet', 'refs/heads/feature/cancel-before']),
  ).toMatchObject({
    code: 1,
  })
})

test('cancellation after worktree mutation settles as ready and never removes the created worktree', async () => {
  let releaseMutation!: () => void
  const mutation = new Promise<void>((resolveMutation) => {
    releaseMutation = resolveMutation
  })
  let waitingForCancel = false
  const execute: GitExecutor = async (cwd, args, signal) => {
    const result = await git(cwd, args, signal)
    if (isWorktreeAdd(args) && !waitingForCancel) {
      waitingForCancel = true
      releaseMutation()
      await new Promise<never>((_resolve, reject) => {
        const abort = () => reject(signal.reason)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
      })
    }
    return result
  }
  const f = await fixture(execute)
  const revision = await chooseBranch(f.store, f.session.id, 'feature/cancel-after')
  const receipt = await f.preparations.start({
    actorId: 'preparation-test-actor',
    idempotencyKey: 'cancel-after-key',
    sessionId: f.session.id,
    expectedRevision: revision,
  })
  await mutation
  const identity = {
    sessionId: f.session.id,
    expectedRevision: revision,
    operationId: receipt.operationId,
  }
  expect(await f.preparations.cancel(identity)).toMatchObject({ status: 'cancel-requested' })
  const settled = await waitFor(
    () => f.preparations.read(identity),
    (snapshot) => snapshot.status === 'ready' || snapshot.status === 'failed' || snapshot.status === 'cancelled',
  )
  expect(settled).toMatchObject({ status: 'ready' })
  expect(normalizedPath(await gitOk(f.repository, ['worktree', 'list', '--porcelain']))).toContain(
    normalizedPath(join(f.layout.worktrees, f.session.id, `r${revision}`)),
  )
  await expectNoRuns(f.layout.database, f.session.id)
})

test('restart reattaches a cancelled reconciling intent by inspection only after a transient target-read failure', async () => {
  const f = await fixture()
  const revision = await chooseBranch(f.store, f.session.id, 'feature/restart-cancelled')
  const receipt = await f.store.call('startSessionLaunchTargetPreparation', {
    actorId: 'preparation-test-actor',
    idempotencyKey: 'restart-cancel-key',
    sessionId: f.session.id,
    expectedRevision: revision,
  })
  const operation: SessionLaunchTargetPreparationOperationInput = {
    sessionId: f.session.id,
    expectedRevision: revision,
    operationId: receipt.operationId,
  }
  const preparing = await f.store.call('transitionSessionLaunchTargetPreparation', {
    ...operation,
    expectedOperationVersion: 1,
    status: 'preparing',
    error: null,
  })
  const requested = await f.store.call('requestSessionLaunchTargetPreparationCancellation', operation)
  const reconciling = await f.store.call('transitionSessionLaunchTargetPreparation', {
    ...operation,
    expectedOperationVersion: requested.operationVersion,
    status: 'reconciling',
    error: { code: 'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED', message: 'Interrupted before acknowledgement' },
  })
  expect(preparing).toMatchObject({ status: 'preparing' })
  expect(reconciling).toMatchObject({ status: 'reconciling' })

  const targetPath = join(f.layout.worktrees, f.session.id, `r${revision}`)
  await mkdir(dirname(targetPath), { recursive: true })
  const requestedHead = await gitOk(f.repository, ['rev-parse', '--verify', 'HEAD^{commit}'])
  await f.store.call('beginSessionLaunchTargetPreparation', {
    sessionId: f.session.id,
    expectedRevision: revision,
    selection: selection('feature/restart-cancelled'),
    targetPath,
    branch: 'feature/restart-cancelled',
    requestedHead,
  })
  await gitOk(f.repository, ['worktree', 'add', '-b', 'feature/restart-cancelled', targetPath, requestedHead])

  await f.preparations.close()
  await f.targets.close()
  await f.store.close()
  resources.pop()

  let addCalls = 0
  const execute: GitExecutor = async (cwd, args, signal) => {
    if (isWorktreeAdd(args)) addCalls++
    return git(cwd, args, signal)
  }
  const store = new Storage(f.layout.database, f.layout)
  const targets = new SessionLaunchTargetService(store, f.layout, execute)
  let readFailures = 1
  const preparations = new SessionLaunchTargetPreparationService(store, {
    prepare: (sessionId, targetRevision, signal) => targets.prepare(sessionId, targetRevision, signal),
    reconcile: (sessionId, targetRevision, signal) => targets.reconcile(sessionId, targetRevision, signal),
    reconcileCancellation: (sessionId, targetRevision, signal) =>
      targets.reconcileCancelledPreparation(sessionId, targetRevision, signal),
    readTarget: async (sessionId) => {
      if (readFailures > 0) {
        readFailures--
        throw new Error('simulated temporary target read failure')
      }
      return targets.get(sessionId)
    },
  })
  resources.push({ root: f.root, store, targets, preparations })
  await preparations.resumePending()
  const afterReadFailure = await waitFor(
    () => preparations.read(operation),
    (snapshot) => snapshot.status === 'reconciling' && snapshot.operationVersion > reconciling.operationVersion,
  )
  expect(afterReadFailure).toMatchObject({ status: 'reconciling' })
  expect((await store.call('sessionLaunchTargetPreparationRecord', operation)).cancellationRequested).toBe(true)
  await preparations.reconcile(operation)
  const recovered = await waitFor(
    () => preparations.read(operation),
    (snapshot) => snapshot.status === 'ready' || snapshot.status === 'failed' || snapshot.status === 'cancelled',
  )
  expect(recovered).toMatchObject({ status: 'ready' })
  expect(addCalls).toBe(0)
  expect(normalizedPath(await gitOk(f.repository, ['worktree', 'list', '--porcelain']))).toContain(
    normalizedPath(targetPath),
  )
  await expectNoRuns(f.layout.database, f.session.id)
})

test('an idempotent start replay during active ambiguous recovery does not trigger an automatic rescan', async () => {
  const f = await fixture()
  const start = {
    actorId: 'preparation-test-actor',
    idempotencyKey: 'ambiguous-recovery-start',
    sessionId: f.session.id,
    expectedRevision: 0,
  }
  const accepted = await f.store.call('startSessionLaunchTargetPreparation', start)
  const identity: SessionLaunchTargetPreparationOperationInput = {
    sessionId: f.session.id,
    expectedRevision: 0,
    operationId: accepted.operationId,
  }
  const preparing = await f.store.call('transitionSessionLaunchTargetPreparation', {
    ...identity,
    expectedOperationVersion: 1,
    status: 'preparing',
    error: null,
  })
  const error = { code: 'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED', message: 'Recovery remains ambiguous' }
  const reconciling = await f.store.call('transitionSessionLaunchTargetPreparation', {
    ...identity,
    expectedOperationVersion: preparing.operationVersion,
    status: 'reconciling',
    error,
  })
  expect(reconciling).toMatchObject({ status: 'reconciling' })
  await f.preparations.close()

  let releaseFirst!: () => void
  let firstAttemptEntered!: () => void
  let settled!: () => void
  let retryEntered!: () => void
  const firstGate = new Promise<void>((resolveGate) => (releaseFirst = resolveGate))
  const firstEntered = new Promise<void>((resolveEntered) => (firstAttemptEntered = resolveEntered))
  const operationSettled = new Promise<void>((resolveSettled) => (settled = resolveSettled))
  const retryAttempt = new Promise<void>((resolveRetry) => (retryEntered = resolveRetry))
  let reconcileCalls = 0
  const baseTarget = await f.targets.get(f.session.id)
  const ambiguousTarget: SessionLaunchTarget = {
    ...baseTarget,
    resolution: { status: 'reconciling', ...error },
  }
  const preparations = new SessionLaunchTargetPreparationService(
    f.store,
    {
      prepare: async () => {
        throw new Error('recovery must not start a new preparation')
      },
      reconcile: async () => {
        reconcileCalls++
        if (reconcileCalls === 1) {
          firstAttemptEntered()
          await firstGate
        } else retryEntered()
        return ambiguousTarget
      },
      reconcileCancellation: async () => ambiguousTarget,
      readTarget: async () => ambiguousTarget,
    },
    () => settled(),
  )
  const resource = resources.at(-1)
  if (!resource) throw new Error('Preparation fixture resource was not registered')
  resource.preparations = preparations

  try {
    await preparations.reconcile(identity)
    await firstEntered
    expect(await preparations.start(start)).toEqual(accepted)
    releaseFirst()
    await operationSettled
    const retried = await Promise.race([
      retryAttempt.then(() => true),
      new Promise<boolean>((resolveTimeout) => setTimeout(() => resolveTimeout(false), 500)),
    ])
    expect(retried).toBeFalse()
    expect(reconcileCalls).toBe(1)
    expect(await preparations.read(identity)).toMatchObject({ status: 'reconciling' })
  } finally {
    releaseFirst()
  }
})
