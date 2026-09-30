import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import {
  sessionLaunchSelectionSchema,
  type SessionLaunchSelection,
} from '@hbar/contracts/commands/session-launch-target'
import { Storage } from '@hbar/storage'

const roots: string[] = []
const stores = new Set<Storage>()
const prefix = 'hbar-session-launch-target-storage-'

afterEach(async () => {
  for (const store of stores) await store.close()
  stores.clear()
  for (const root of roots.splice(0)) {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith(prefix))
      throw new Error('Refusing to remove an unowned test directory')
    await rm(root, { recursive: true, force: true })
  }
})

function open(path: string) {
  const store = new Storage(path)
  stores.add(store)
  return store
}

async function close(store: Storage) {
  await store.close()
  stores.delete(store)
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), prefix))
  roots.push(root)
  const path = join(root, 'storage.sqlite')
  const store = open(path)
  expect(await store.call('ready')).toEqual({ version: 12 })
  const workspace = await store.call('createWorkspace', root, 'project')
  const first = await store.call('createSession', workspace.id, 'first')
  const second = await store.call('createSession', workspace.id, 'second')
  return { root, path, store, workspace, first, second }
}

function selection(name: string) {
  return { mode: 'isolated-worktree' as const, branch: { kind: 'existing' as const, name } }
}

function request(sessionId: string, selectionValue: SessionLaunchSelection, expectedRevision = 0) {
  return { sessionId, expectedRevision, selection: selectionValue }
}

async function failure(operation: Promise<unknown>, code: string) {
  let caught: unknown
  try {
    await operation
  } catch (error) {
    caught = error
  }
  expect(caught).toMatchObject({ code })
}

function inspect(path: string, action: (db: Database) => void) {
  const db = new Database(path, { strict: true })
  try {
    action(db)
  } finally {
    db.close()
  }
}

test('contract accepts captured local shared branches and Host-resolved worktrees, never a client path', () => {
  expect(sessionLaunchSelectionSchema.safeParse({ mode: 'shared-current' }).success).toBeTrue()
  expect(sessionLaunchSelectionSchema.safeParse(selection('feature/target')).success).toBeTrue()
  expect(
    sessionLaunchSelectionSchema.safeParse({
      mode: 'shared-branch',
      branch: { ref: 'refs/heads/feature/target', tipOid: 'a'.repeat(40) },
    }).success,
  ).toBeTrue()
  expect(
    sessionLaunchSelectionSchema.safeParse({
      mode: 'shared-branch',
      branch: { ref: 'refs/remotes/origin/main', tipOid: 'a'.repeat(40) },
    }).success,
  ).toBeFalse()
  expect(
    sessionLaunchSelectionSchema.safeParse({
      mode: 'shared-branch',
      branch: { ref: 'refs/heads/main', tipOid: 'a'.repeat(41) },
    }).success,
  ).toBeFalse()
  expect(
    sessionLaunchSelectionSchema.safeParse({
      mode: 'isolated-worktree',
      branch: { kind: 'new', name: 'feature/new', startPoint: 'main' },
    }).success,
  ).toBeTrue()
  expect(
    sessionLaunchSelectionSchema.safeParse({
      mode: 'isolated-worktree',
      branch: { kind: 'derived', baseRef: 'refs/heads/feature/base' },
    }).success,
  ).toBeTrue()
  expect(
    sessionLaunchSelectionSchema.safeParse({
      mode: 'isolated-worktree',
      branch: { kind: 'derived', baseRef: 'refs/remotes/origin/main' },
    }).success,
  ).toBeFalse()
  for (const invalid of [
    { mode: 'shared-current', path: 'D:/untrusted' },
    { mode: 'shared-branch-switch', branch: 'feature/target' },
    { mode: 'isolated-worktree', path: 'D:/untrusted', branch: { kind: 'existing', name: 'main' } },
    { mode: 'isolated-worktree', branch: { kind: 'new', name: 'feature/new', force: true } },
  ])
    expect(sessionLaunchSelectionSchema.safeParse(invalid).success).toBeFalse()
})

test('shared-branch binds only the ready captured ref at the workspace path and reports queued shared work', async () => {
  const f = await fixture()
  const chosen = {
    mode: 'shared-branch' as const,
    branch: { ref: 'refs/heads/feature/target', tipOid: 'a'.repeat(40) },
  }
  await f.store.call('setSessionLaunchTarget', {
    actorId: 'shared-test',
    idempotencyKey: 'choose-shared',
    ...request(f.first.id, chosen),
  })
  const binding = {
    sessionId: f.first.id,
    expectedRevision: 1,
    selection: chosen,
    targetPath: f.workspace.path,
    branch: 'feature/target',
    head: chosen.branch.tipOid,
  }
  await failure(
    f.store.call(
      'enqueue',
      f.first.id,
      'unprepared-shared',
      { text: 'hello', images: [] },
      'demo/mock',
      undefined,
      binding,
    ),
    'SESSION_LAUNCH_TARGET_UNRESOLVED',
  )
  await f.store.call('beginSessionLaunchTargetPreparation', {
    sessionId: f.first.id,
    expectedRevision: 1,
    selection: chosen,
    targetPath: f.workspace.path,
    branch: 'feature/target',
    requestedHead: chosen.branch.tipOid,
  })
  await f.store.call('updateSessionLaunchTargetPreparation', {
    sessionId: f.first.id,
    revision: 1,
    targetPath: f.workspace.path,
    state: 'ready',
    resolvedHead: chosen.branch.tipOid,
  })
  await failure(
    f.store.call('enqueue', f.first.id, 'wrong-path', { text: 'hello', images: [] }, 'demo/mock', undefined, {
      ...binding,
      targetPath: join(f.root, 'other'),
    }),
    'SESSION_LAUNCH_TARGET_UNRESOLVED',
  )
  await f.store.call(
    'enqueue',
    f.first.id,
    'prepared-shared',
    { text: 'hello', images: [] },
    'demo/mock',
    undefined,
    binding,
  )
  expect((await f.store.call('sessionLaunchTargetRuntime', f.first.id)).binding).toMatchObject(binding)
  expect(await f.store.call('activeSharedCheckoutPaths')).toEqual([f.workspace.path])
})

test('revisioned selections are session-owned, durable, idempotent, and lock after first accepted Run', async () => {
  const f = await fixture()
  const defaultTarget = await f.store.call('sessionLaunchTarget', f.first.id)
  expect(defaultTarget).toMatchObject({
    sessionId: f.first.id,
    workspaceId: f.workspace.id,
    revision: 0,
    selection: { mode: 'shared-current' },
    locked: false,
  })

  const firstRequest = request(f.first.id, selection('feature/target'))
  const mutation = {
    actorId: 'actor-a',
    idempotencyKey: 'select-feature',
    ...firstRequest,
  }
  const receipt = await f.store.call('setSessionLaunchTarget', mutation)
  expect(receipt).toMatchObject({ revision: 1, changed: true, request: firstRequest })
  expect(await f.store.call('setSessionLaunchTarget', mutation)).toEqual(receipt)
  expect(
    await f.store.call('sessionLaunchTargetReceipt', {
      actorId: 'actor-a',
      idempotencyKey: 'select-feature',
      sessionId: f.first.id,
    }),
  ).toEqual(receipt)
  expect(await f.store.call('sessionLaunchTarget', f.first.id)).toMatchObject({
    revision: 1,
    selection: selection('feature/target'),
  })
  expect(await f.store.call('sessionLaunchTarget', f.second.id)).toMatchObject({
    sessionId: f.second.id,
    workspaceId: f.workspace.id,
    revision: 0,
    selection: { mode: 'shared-current' },
    locked: false,
  })

  await failure(
    f.store.call('setSessionLaunchTarget', {
      actorId: 'actor-a',
      idempotencyKey: 'stale',
      ...request(f.first.id, selection('feature/other')),
    }),
    'COMMAND_CONFLICT',
  )
  await failure(
    f.store.call('setSessionLaunchTarget', {
      ...mutation,
      selection: selection('feature/other'),
    }),
    'IDEMPOTENCY_CONFLICT',
  )

  const launchTarget = {
    sessionId: f.first.id,
    expectedRevision: 1,
    selection: selection('feature/target'),
    targetPath: join(f.root, 'managed-feature-target'),
    branch: 'feature/target',
    requestedHead: 'a'.repeat(40),
  }
  await f.store.call('beginSessionLaunchTargetPreparation', launchTarget)
  await f.store.call('updateSessionLaunchTargetPreparation', {
    sessionId: f.first.id,
    revision: 1,
    targetPath: launchTarget.targetPath,
    state: 'ready',
    resolvedHead: launchTarget.requestedHead,
  })
  expect(await f.store.call('sessionLaunchTargetBindingForPath', launchTarget.targetPath)).toBeNull()

  await close(f.store)
  const reopened = open(f.path)
  await reopened.call('ready')
  expect(await reopened.call('sessionLaunchTarget', f.first.id)).toMatchObject({
    revision: 1,
    selection: selection('feature/target'),
    locked: false,
  })

  await reopened.call('enqueue', f.first.id, 'first-run', { text: 'hello', images: [] }, 'demo/mock', undefined, {
    sessionId: f.first.id,
    expectedRevision: launchTarget.expectedRevision,
    selection: launchTarget.selection,
    targetPath: launchTarget.targetPath,
    branch: launchTarget.branch,
    head: launchTarget.requestedHead,
  })
  const boundTarget = await reopened.call('sessionLaunchTargetBindingForPath', launchTarget.targetPath)
  if (!boundTarget) throw new Error('Accepted Run did not persist its isolated target binding')
  expect(boundTarget).toMatchObject({
    sessionId: f.first.id,
    selection: launchTarget.selection,
    targetPath: launchTarget.targetPath,
    branch: launchTarget.branch,
  })
  expect(boundTarget.boundRunId.length).toBeGreaterThan(0)
  expect(await reopened.call('sessionLaunchTargetBindingForPath', `${launchTarget.targetPath}/child`)).toBeNull()
  expect(await reopened.call('sessionLaunchTarget', f.first.id)).toMatchObject({ locked: true })
  await failure(
    reopened.call('setSessionLaunchTarget', {
      actorId: 'actor-a',
      idempotencyKey: 'after-first-run',
      ...request(f.first.id, { mode: 'shared-current' }, 1),
    }),
    'SESSION_LAUNCH_TARGET_LOCKED',
  )
  expect(await reopened.call('sessionLaunchTarget', f.second.id)).toMatchObject({ locked: false })
})

test('session ownership is derived from the persisted Session; missing and archived targets cannot be changed', async () => {
  const f = await fixture()
  await failure(f.store.call('sessionLaunchTarget', 'missing-session'), 'NOT_FOUND')
  await failure(
    f.store.call('setSessionLaunchTarget', {
      actorId: 'actor-a',
      idempotencyKey: 'missing',
      ...request('missing-session', selection('feature/target')),
    }),
    'NOT_FOUND',
  )
  await f.store.call('updateSession', f.first.id, { archived: true })
  await failure(
    f.store.call('setSessionLaunchTarget', {
      actorId: 'actor-a',
      idempotencyKey: 'archived',
      ...request(f.first.id, selection('feature/target')),
    }),
    'SESSION_ARCHIVED',
  )
})

test('v9 databases migrate concurrently to v11 before serializing two stale launch-target revisions', async () => {
  const f = await fixture()
  await close(f.store)
  inspect(f.path, (db) => {
    db.exec('DROP TABLE session_launch_target_receipts; DROP TABLE session_launch_targets; PRAGMA user_version=9;')
  })
  const a = open(f.path)
  const b = open(f.path)
  expect(await Promise.all([a.call('ready'), b.call('ready')])).toEqual([{ version: 12 }, { version: 12 }])

  const writes = await Promise.allSettled([
    a.call('setSessionLaunchTarget', {
      actorId: 'actor-a',
      idempotencyKey: 'worker-a',
      ...request(f.first.id, selection('feature/a')),
    }),
    b.call('setSessionLaunchTarget', {
      actorId: 'actor-b',
      idempotencyKey: 'worker-b',
      ...request(f.first.id, selection('feature/b')),
    }),
  ])
  expect(writes.filter((write) => write.status === 'fulfilled')).toHaveLength(1)
  expect(writes.find((write) => write.status === 'rejected')).toMatchObject({
    reason: { code: 'COMMAND_CONFLICT' },
  })
  expect(await a.call('sessionLaunchTarget', f.first.id)).toMatchObject({ revision: 1 })
})
