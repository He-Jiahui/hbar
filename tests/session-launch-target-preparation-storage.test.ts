import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { Storage, STORAGE_SCHEMA_VERSION } from '@hbar/storage'

const roots: string[] = []
const stores = new Set<Storage>()
const prefix = 'hbar-session-launch-preparation-storage-'

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

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), prefix))
  roots.push(root)
  const path = join(root, 'storage.sqlite')
  const store = open(path)
  expect(await store.call('ready')).toEqual({ version: STORAGE_SCHEMA_VERSION })
  const workspace = await store.call('createWorkspace', root, 'project')
  const session = await store.call('createSession', workspace.id, 'launch target')
  return { root, path, store, workspace, session }
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

function startInput(sessionId: string, expectedRevision = 0, idempotencyKey = 'prepare-main') {
  return { actorId: 'test-actor', idempotencyKey, sessionId, expectedRevision }
}

test('preparation acceptance is exact, idempotent, fenced until ready, and exposes only a strict path-free snapshot', async () => {
  const f = await fixture()
  const accepted = await f.store.call('startSessionLaunchTargetPreparation', startInput(f.session.id))
  expect(accepted).toMatchObject({
    sessionId: f.session.id,
    workspaceId: f.workspace.id,
    targetRevision: 0,
  })
  expect(Object.keys(accepted).sort()).toEqual(['operationId', 'sessionId', 'targetRevision', 'workspaceId'])
  expect(await f.store.call('startSessionLaunchTargetPreparation', startInput(f.session.id))).toEqual(accepted)
  expect(await f.store.call('startSessionLaunchTargetPreparation', startInput(f.session.id, 0, 'join-main'))).toEqual(
    accepted,
  )

  const identity = {
    sessionId: f.session.id,
    expectedRevision: 0,
    operationId: accepted.operationId,
  }
  const queued = await f.store.call('sessionLaunchTargetPreparation', identity)
  expect(queued).toMatchObject({ schemaVersion: 1, operationVersion: 1, status: 'queued' })
  expect(Object.keys(queued).sort()).toEqual(
    [
      'createdAt',
      'operationId',
      'operationVersion',
      'schemaVersion',
      'sessionId',
      'status',
      'targetRevision',
      'updatedAt',
      'workspaceId',
    ].sort(),
  )
  await failure(f.store.call('sessionLaunchTargetPreparation', { ...identity, expectedRevision: 1 }), 'NOT_FOUND')
  await failure(
    f.store.call('sessionLaunchTargetPreparation', { ...identity, operationId: crypto.randomUUID() }),
    'NOT_FOUND',
  )

  const selection = { mode: 'isolated-worktree' as const, branch: { kind: 'new' as const, name: 'feature/fenced' } }
  await failure(
    f.store.call('setSessionLaunchTarget', {
      actorId: 'test-actor',
      idempotencyKey: 'blocked-selection',
      sessionId: f.session.id,
      expectedRevision: 0,
      selection,
    }),
    'BUSY',
  )
  expect(await f.store.call('sessionLaunchTarget', f.session.id)).toMatchObject({
    revision: 0,
    selection: { mode: 'shared-current' },
  })
  expect(
    await f.store.call('sessionLaunchTargetReceipt', {
      actorId: 'test-actor',
      idempotencyKey: 'blocked-selection',
      sessionId: f.session.id,
    }),
  ).toBeNull()

  const preparing = await f.store.call('transitionSessionLaunchTargetPreparation', {
    ...identity,
    expectedOperationVersion: 1,
    status: 'preparing',
    error: null,
  })
  expect(preparing).toMatchObject({ operationVersion: 2, status: 'preparing' })
  const stale = await f.store.call('transitionSessionLaunchTargetPreparation', {
    ...identity,
    expectedOperationVersion: 1,
    status: 'cancelled',
    error: null,
  })
  expect(stale).toEqual(preparing)

  const ready = await f.store.call('transitionSessionLaunchTargetPreparation', {
    ...identity,
    expectedOperationVersion: 2,
    status: 'ready',
    error: null,
  })
  expect(ready).toMatchObject({ operationVersion: 3, status: 'ready' })
  const changed = await f.store.call('setSessionLaunchTarget', {
    actorId: 'test-actor',
    idempotencyKey: 'unfenced-selection',
    sessionId: f.session.id,
    expectedRevision: 0,
    selection,
  })
  expect(changed).toMatchObject({ changed: true, revision: 1 })
  expect(await f.store.call('startSessionLaunchTargetPreparation', startInput(f.session.id))).toEqual(accepted)
})

test('nonterminal preparation atomically fences first Run binding while ready permits acceptance and replay', async () => {
  const f = await fixture()
  const accepted = await f.store.call('startSessionLaunchTargetPreparation', startInput(f.session.id))
  const identity = {
    sessionId: f.session.id,
    expectedRevision: 0,
    operationId: accepted.operationId,
  }
  const input = { text: 'first Run after preparation', images: [] }

  const expectBlockedFirstBinding = async (requestId: string) => {
    await failure(f.store.call('enqueue', f.session.id, requestId, input, 'test-model'), 'BUSY')
    expect(await f.store.call('runByRequest', f.session.id, requestId)).toBeNull()
    expect((await f.store.call('sessionLaunchTargetRuntime', f.session.id)).binding).toBeNull()
  }

  await expectBlockedFirstBinding('blocked-queued')
  const preparing = await f.store.call('transitionSessionLaunchTargetPreparation', {
    ...identity,
    expectedOperationVersion: 1,
    status: 'preparing',
    error: null,
  })
  await expectBlockedFirstBinding('blocked-preparing')
  const cancelRequested = await f.store.call('requestSessionLaunchTargetPreparationCancellation', identity)
  await expectBlockedFirstBinding('blocked-cancel-requested')
  const reconciling = await f.store.call('transitionSessionLaunchTargetPreparation', {
    ...identity,
    expectedOperationVersion: cancelRequested.operationVersion,
    status: 'reconciling',
    error: { code: 'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED', message: 'Inspect before accepting a Run' },
  })
  await expectBlockedFirstBinding('blocked-reconciling')
  const ready = await f.store.call('transitionSessionLaunchTargetPreparation', {
    ...identity,
    expectedOperationVersion: reconciling.operationVersion,
    status: 'ready',
    error: null,
  })
  expect(preparing).toMatchObject({ status: 'preparing' })
  expect(cancelRequested).toMatchObject({ status: 'cancel-requested' })
  expect(ready).toMatchObject({ status: 'ready' })

  const binding = {
    sessionId: f.session.id,
    expectedRevision: 0,
    selection: { mode: 'shared-current' as const },
    targetPath: f.workspace.path,
    branch: null,
    head: null,
  }
  const run = await f.store.call('enqueue', f.session.id, 'accepted-ready', input, 'test-model', undefined, binding)
  const replay = await f.store.call('enqueue', f.session.id, 'accepted-ready', input, 'test-model', undefined, binding)
  expect(replay.id).toBe(run.id)
  expect(await f.store.call('runByRequest', f.session.id, 'accepted-ready')).toMatchObject({ run: { id: run.id } })
  expect((await f.store.call('sessionLaunchTargetRuntime', f.session.id)).binding).toMatchObject({
    boundRunId: run.id,
    targetPath: f.workspace.path,
  })
})

test('cancellation intent survives a reconciling transition and never appears in the public DTO', async () => {
  const f = await fixture()
  const accepted = await f.store.call('startSessionLaunchTargetPreparation', startInput(f.session.id))
  const identity = { sessionId: f.session.id, expectedRevision: 0, operationId: accepted.operationId }
  const requested = await f.store.call('requestSessionLaunchTargetPreparationCancellation', identity)
  expect(requested).toMatchObject({ status: 'cancel-requested', operationVersion: 2 })
  const record = await f.store.call('sessionLaunchTargetPreparationRecord', identity)
  expect(record.cancellationRequested).toBe(true)

  const reconciling = await f.store.call('transitionSessionLaunchTargetPreparation', {
    ...identity,
    expectedOperationVersion: requested.operationVersion,
    status: 'reconciling',
    error: { code: 'SESSION_LAUNCH_TARGET_RECONCILE_REQUIRED', message: 'Inspect the persisted result' },
  })
  expect(reconciling).toMatchObject({ status: 'reconciling', operationVersion: 3 })
  expect((await f.store.call('sessionLaunchTargetPreparationRecord', identity)).cancellationRequested).toBe(true)
  const publicSnapshot = await f.store.call('sessionLaunchTargetPreparation', identity)
  expect(publicSnapshot).not.toHaveProperty('selection')
  expect(publicSnapshot).not.toHaveProperty('cancellationRequested')
  expect(publicSnapshot).not.toHaveProperty('targetPath')
  expect(publicSnapshot).not.toHaveProperty('cwd')
})

test('version-11 databases migrate the preparation tables without changing existing session data', async () => {
  const f = await fixture()
  await f.store.close()
  stores.delete(f.store)
  const db = new Database(f.path, { strict: true })
  try {
    db.exec(
      'DROP INDEX IF EXISTS node_run_workspace_mounts_session; DROP TABLE IF EXISTS node_run_workspace_mounts; DROP INDEX node_run_worktrees_session; DROP TABLE node_run_worktrees; DROP INDEX node_execution_intents_run_call; DROP TABLE node_execution_intents; ALTER TABLE approvals DROP COLUMN executionTarget;',
    )
    db.exec('DROP TABLE session_launch_target_preparation_receipts;')
    db.exec('DROP TABLE session_launch_target_preparation_operations;')
    db.exec('PRAGMA user_version=11;')
  } finally {
    db.close()
  }
  const reopened = open(f.path)
  expect(await reopened.call('ready')).toEqual({ version: STORAGE_SCHEMA_VERSION })
  expect(await reopened.call('session', f.session.id)).toMatchObject({ id: f.session.id, workspaceId: f.workspace.id })
  expect(await reopened.call('startSessionLaunchTargetPreparation', startInput(f.session.id))).toMatchObject({
    sessionId: f.session.id,
    targetRevision: 0,
  })
})

test('active preparation admission is globally bounded to four running plus sixty-four waiting intents', async () => {
  const f = await fixture()
  const sessions = [f.session]
  for (let index = 1; index < 69; index++)
    sessions.push(await f.store.call('createSession', f.workspace.id, `session ${index}`))
  for (const [index, session] of sessions.entries()) {
    if (index < 68) {
      await f.store.call('startSessionLaunchTargetPreparation', {
        ...startInput(session.id),
        idempotencyKey: `bounded-${index}`,
      })
    } else {
      await failure(
        f.store.call('startSessionLaunchTargetPreparation', {
          ...startInput(session.id),
          idempotencyKey: 'bounded-overflow',
        }),
        'BUSY',
      )
      expect(
        await f.store
          .call('sessionLaunchTargetPreparation', {
            sessionId: session.id,
            expectedRevision: 0,
            operationId: 'not-created',
          })
          .catch(() => null),
      ).toBeNull()
    }
  }
})
