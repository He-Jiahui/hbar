import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage, type WorkspaceOrganizationMutationInput } from '@hbar/storage'
import {
  WORKSPACE_ORGANIZATION_MAX_BYTES,
  workspaceOrganizationSnapshotSchema,
  type WorkspaceOrganizationApplyInput,
  type WorkspaceOrganizationSnapshot,
} from '@hbar/contracts/commands/workspace-organization'

const roots: string[] = []
const stores = new Set<Storage>()
afterEach(async () => {
  for (const store of stores) await store.close()
  stores.clear()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
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
  const root = await mkdtemp(join(tmpdir(), 'hbar-workspace-organization-'))
  roots.push(root)
  const path = join(root, 'storage.sqlite')
  const store = open(path)
  expect(await store.call('ready')).toEqual({ version: 10 })
  const workspace = await store.call('createWorkspace', root, 'same display name')
  return { root, path, store, workspace }
}

function input(
  workspaceId: string,
  options: Partial<{
    expectedRevision: number
    expectedHidden: boolean
    hidden: boolean
    actorId: string
    idempotencyKey: string
  }> = {},
): WorkspaceOrganizationMutationInput {
  return {
    actorId: options.actorId ?? 'actor-a',
    idempotencyKey: options.idempotencyKey ?? crypto.randomUUID(),
    request: {
      expectedRevision: options.expectedRevision ?? 0,
      change: {
        kind: 'setHidden',
        workspaceId,
        expectedHidden: options.expectedHidden ?? false,
        hidden: options.hidden ?? true,
      },
    },
  }
}

function restore(expectedRevision: number): WorkspaceOrganizationMutationInput {
  return {
    actorId: 'actor-a',
    idempotencyKey: crypto.randomUUID(),
    request: { expectedRevision, change: { kind: 'restoreHidden' } },
  }
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

function inspect<T>(path: string, inspectDatabase: (db: Database) => T): T {
  const db = new Database(path, { strict: true })
  db.exec('PRAGMA busy_timeout=5000;')
  try {
    return inspectDatabase(db)
  } finally {
    db.close()
  }
}

function receiptCount(path: string): number | undefined {
  return inspect(
    path,
    (db) =>
      db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM workspace_organization_receipts').get()?.count,
  )
}

function seedSnapshot(path: string, value: unknown) {
  inspect(path, (db) =>
    db.query('INSERT OR REPLACE INTO workspace_organization_state VALUES(1,?)').run(JSON.stringify(value)),
  )
}

test('organization is initially a read-only empty snapshot; hide uses stable IDs and preserves unrelated state', async () => {
  const f = await fixture()
  const other = await f.store.call('createWorkspace', join(f.root, 'second'), f.workspace.name)
  const session = await f.store.call('createSession', f.workspace.id, 'original')
  await f.store.call('setSetting', 'client-presentation', 'unchanged')
  expect(await f.store.call('workspaceOrganization')).toEqual({ schemaVersion: 1, revision: 0, hiddenWorkspaceIds: [] })
  expect(inspect(f.path, (db) => db.query('SELECT * FROM workspace_organization_state').all())).toEqual([])
  const request = input(f.workspace.id)
  const result = await f.store.call('applyWorkspaceOrganization', request)
  expect(result).toMatchObject({ revision: 1, changed: true, request: request.request })
  expect(await f.store.call('workspaceOrganization')).toEqual({
    schemaVersion: 1,
    revision: 1,
    hiddenWorkspaceIds: [f.workspace.id],
  })
  expect((await f.store.call('workspaces')).map((workspace) => workspace.id).sort()).toEqual(
    [f.workspace.id, other.id].sort(),
  )
  expect(await f.store.call('session', session.id)).toEqual(session)
  expect(await f.store.call('getSetting', 'client-presentation')).toBe('unchanged')
  expect(await f.store.call('settingsLayers', ['global'])).toEqual([])
})

test('receipt survives restart and lost acknowledgement; journal replay precedes stale CAS without rolling current state back', async () => {
  const f = await fixture()
  const request = input(f.workspace.id)
  const result = await f.store.call('applyWorkspaceOrganization', request)
  const unhide = await f.store.call(
    'applyWorkspaceOrganization',
    input(f.workspace.id, {
      expectedRevision: 1,
      expectedHidden: true,
      hidden: false,
    }),
  )
  await close(f.store)
  const restarted = open(f.path)
  await restarted.call('ready')
  expect(await restarted.call('workspaceOrganizationReceipt', request)).toEqual(result)
  expect(await restarted.call('applyWorkspaceOrganization', request)).toEqual(result)
  expect(await restarted.call('workspaceOrganization')).toEqual({
    schemaVersion: 1,
    revision: unhide.revision,
    hiddenWorkspaceIds: [],
  })
  expect(receiptCount(f.path)).toBe(2)
  expect(await restarted.call('workspaceOrganizationReceipt', { ...request, actorId: 'another-actor' })).toBeNull()
  expect(await restarted.call('workspaceOrganizationReceipt', { ...request, idempotencyKey: 'unknown-key' })).toBeNull()
  const different = { ...request, request: { ...request.request, expectedRevision: 2 } }
  await failure(restarted.call('workspaceOrganizationReceipt', different), 'IDEMPOTENCY_CONFLICT')
  await failure(restarted.call('applyWorkspaceOrganization', different), 'IDEMPOTENCY_CONFLICT')
  expect(receiptCount(f.path)).toBe(2)
})

test('no-op is acknowledged once without bumping revision, but stale revision and expectedHidden still conflict', async () => {
  const f = await fixture()
  const initialNoop = restore(0)
  const emptyReceipt = await f.store.call('applyWorkspaceOrganization', initialNoop)
  expect(emptyReceipt).toMatchObject({ changed: false, revision: 0 })
  expect(await f.store.call('applyWorkspaceOrganization', initialNoop)).toEqual(emptyReceipt)
  await f.store.call('applyWorkspaceOrganization', input(f.workspace.id))
  const same = input(f.workspace.id, { expectedRevision: 1, expectedHidden: true })
  expect(await f.store.call('applyWorkspaceOrganization', same)).toMatchObject({ changed: false, revision: 1 })
  await failure(f.store.call('applyWorkspaceOrganization', input(f.workspace.id)), 'COMMAND_CONFLICT')
  await failure(
    f.store.call('applyWorkspaceOrganization', input(f.workspace.id, { expectedRevision: 1 })),
    'COMMAND_CONFLICT',
  )
  await failure(f.store.call('applyWorkspaceOrganization', restore(0)), 'COMMAND_CONFLICT')
  expect(receiptCount(f.path)).toBe(3)
  expect(await f.store.call('applyWorkspaceOrganization', restore(1))).toMatchObject({ changed: true, revision: 2 })
})

test('hide requires an existing workspace; unhide and restore permit missing stable IDs without deleting cached unknown IDs', async () => {
  const f = await fixture()
  await failure(f.store.call('applyWorkspaceOrganization', input('missing-workspace')), 'NOT_FOUND')
  seedSnapshot(f.path, { schemaVersion: 1, revision: 4, hiddenWorkspaceIds: ['missing-workspace', 'another-missing'] })
  expect(await f.store.call('workspaceOrganization')).toMatchObject({
    hiddenWorkspaceIds: ['missing-workspace', 'another-missing'],
  })
  await f.store.call(
    'applyWorkspaceOrganization',
    input('missing-workspace', {
      expectedRevision: 4,
      expectedHidden: true,
      hidden: false,
    }),
  )
  expect(await f.store.call('workspaceOrganization')).toMatchObject({ hiddenWorkspaceIds: ['another-missing'] })
  expect(await f.store.call('applyWorkspaceOrganization', restore(5))).toMatchObject({ changed: true, revision: 6 })
})

test('two Workers migrate an existing v6 database safely and serialize CAS without lost unrelated changes', async () => {
  const f = await fixture()
  const other = await f.store.call('createWorkspace', join(f.root, 'other'), 'other')
  await close(f.store)
  inspect(f.path, (db) =>
    db.exec(
      'DROP TABLE workspace_organization_state; DROP TABLE workspace_organization_receipts; PRAGMA user_version=6;',
    ),
  )
  const a = open(f.path)
  const b = open(f.path)
  expect(await Promise.all([a.call('ready'), b.call('ready')])).toEqual([{ version: 10 }, { version: 10 }])
  const requests = [input(f.workspace.id), input(other.id)]
  const results = await Promise.allSettled(
    requests.map((request, index) => (index === 0 ? a : b).call('applyWorkspaceOrganization', request)),
  )
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'COMMAND_CONFLICT' } })
  const current = await b.call('workspaceOrganization')
  expect(current.revision).toBe(1)
  expect(current.hiddenWorkspaceIds).toHaveLength(1)
  const missingId = current.hiddenWorkspaceIds.includes(f.workspace.id) ? other.id : f.workspace.id
  await b.call('applyWorkspaceOrganization', input(missingId, { expectedRevision: 1 }))
  expect((await a.call('workspaceOrganization')).hiddenWorkspaceIds.sort()).toEqual([f.workspace.id, other.id].sort())
  expect(receiptCount(f.path)).toBe(2)
})

test('concurrent identical actor/key calls on two Workers return one commit and one durable receipt', async () => {
  const f = await fixture()
  const second = open(f.path)
  await second.call('ready')
  const request = input(f.workspace.id)
  const [a, b] = await Promise.all([
    f.store.call('applyWorkspaceOrganization', request),
    second.call('applyWorkspaceOrganization', request),
  ])
  expect(a).toEqual(b)
  expect(receiptCount(f.path)).toBe(1)
  expect((await second.call('workspaceOrganization')).revision).toBe(1)
})

test('malformed input never creates a receipt or state row', async () => {
  const f = await fixture()
  const request = input(f.workspace.id)
  const badInputs: WorkspaceOrganizationMutationInput[] = [
    { ...request, actorId: '' },
    { ...request, idempotencyKey: 'x'.repeat(129) },
    { ...request, request: { ...request.request, expectedRevision: -1 } },
    { ...request, request: { ...request.request, expectedRevision: Number.MAX_SAFE_INTEGER + 1 } },
    input(''),
  ]
  for (const bad of badInputs) await failure(f.store.call('applyWorkspaceOrganization', bad), 'INVALID_INPUT')
  expect(receiptCount(f.path)).toBe(0)
  expect(await f.store.call('workspaceOrganization')).toEqual({ schemaVersion: 1, revision: 0, hiddenWorkspaceIds: [] })
})

test('2000 IDs and the encoded UTF-8 byte budget are independently enforced before any write', async () => {
  const f = await fixture()
  const ids = Array.from({ length: 2000 }, (_, index) => `workspace-${index}`)
  const full: WorkspaceOrganizationSnapshot = { schemaVersion: 1, revision: 8, hiddenWorkspaceIds: ids }
  expect(workspaceOrganizationSnapshotSchema.safeParse(full).success).toBe(true)
  seedSnapshot(f.path, full)
  await failure(
    f.store.call('applyWorkspaceOrganization', input(f.workspace.id, { expectedRevision: 8 })),
    'INPUT_TOO_LARGE',
  )
  expect(await f.store.call('workspaceOrganization')).toEqual(full)
  const longIds: string[] = []
  let next = ''
  for (let index = 0; index < 2000; index++) {
    next = `${index}-` + '界'.repeat(150)
    const candidate = { schemaVersion: 1, revision: 10, hiddenWorkspaceIds: [...longIds, next] }
    if (new TextEncoder().encode(JSON.stringify(candidate)).byteLength > WORKSPACE_ORGANIZATION_MAX_BYTES) break
    longIds.push(next)
  }
  const byteFull: WorkspaceOrganizationSnapshot = { schemaVersion: 1, revision: 9, hiddenWorkspaceIds: longIds }
  expect(longIds.length).toBeLessThan(2000)
  expect(workspaceOrganizationSnapshotSchema.safeParse(byteFull).success).toBe(true)
  seedSnapshot(f.path, byteFull)
  inspect(f.path, (db) =>
    db.query('INSERT INTO workspaces VALUES(?,?,?,?)').run(next, join(f.root, 'long'), 'long', Date.now()),
  )
  await failure(f.store.call('applyWorkspaceOrganization', input(next, { expectedRevision: 9 })), 'INPUT_TOO_LARGE')
  expect(await f.store.call('workspaceOrganization')).toEqual(byteFull)
  expect(receiptCount(f.path)).toBe(0)
})

test('future or corrupted state cannot be silently replaced by Restore', async () => {
  const f = await fixture()
  const invalid: { snapshot: unknown; code: string }[] = [
    { snapshot: { schemaVersion: 2, revision: 0, hiddenWorkspaceIds: [] }, code: 'VERSION_MISMATCH' },
    { snapshot: { schemaVersion: 1, revision: -1, hiddenWorkspaceIds: [] }, code: 'INVALID_STATE' },
    {
      snapshot: { schemaVersion: 1, revision: 0, hiddenWorkspaceIds: ['duplicate', 'duplicate'] },
      code: 'INVALID_STATE',
    },
    {
      snapshot: {
        schemaVersion: 1,
        revision: 0,
        hiddenWorkspaceIds: Array.from({ length: 2001 }, (_, index) => String(index)),
      },
      code: 'INVALID_STATE',
    },
  ]
  for (const item of invalid) {
    seedSnapshot(f.path, item.snapshot)
    await failure(f.store.call('workspaceOrganization'), item.code)
    await failure(f.store.call('applyWorkspaceOrganization', restore(0)), item.code)
    expect(
      inspect(
        f.path,
        (db) =>
          db.query<{ snapshotJson: string }, []>('SELECT snapshotJson FROM workspace_organization_state').get()
            ?.snapshotJson,
      ),
    ).toBe(JSON.stringify(item.snapshot))
  }
  inspect(f.path, (db) => db.query('UPDATE workspace_organization_state SET snapshotJson=?').run('{invalid'))
  await failure(f.store.call('applyWorkspaceOrganization', restore(0)), 'INVALID_STATE')
  expect(receiptCount(f.path)).toBe(0)
})

test('state and receipt roll back together if the journal insert fails', async () => {
  const f = await fixture()
  inspect(f.path, (db) =>
    db.exec(
      "CREATE TRIGGER reject_organization_receipt BEFORE INSERT ON workspace_organization_receipts BEGIN SELECT RAISE(ABORT, 'fixture journal failure'); END;",
    ),
  )
  await failure(f.store.call('applyWorkspaceOrganization', input(f.workspace.id)), 'STORAGE_ERROR')
  expect(await f.store.call('workspaceOrganization')).toEqual({ schemaVersion: 1, revision: 0, hiddenWorkspaceIds: [] })
  expect(receiptCount(f.path)).toBe(0)
})

test('corrupt receipt is rejected rather than reused as proof; request keys use normalized field order', async () => {
  const f = await fixture()
  const request = input(f.workspace.id)
  const result = await f.store.call('applyWorkspaceOrganization', request)
  const reordered: WorkspaceOrganizationApplyInput = {
    change: { hidden: true, workspaceId: f.workspace.id, expectedHidden: false, kind: 'setHidden' },
    expectedRevision: 0,
  }
  expect(await f.store.call('workspaceOrganizationReceipt', { ...request, request: reordered })).toEqual(result)
  inspect(f.path, (db) =>
    db
      .query('UPDATE workspace_organization_receipts SET receiptJson=?')
      .run(JSON.stringify({ ...result, revision: 100 })),
  )
  await failure(f.store.call('workspaceOrganizationReceipt', request), 'INVALID_STATE')
  await failure(f.store.call('applyWorkspaceOrganization', request), 'INVALID_STATE')
  expect((await f.store.call('workspaceOrganization')).revision).toBe(1)
  expect(receiptCount(f.path)).toBe(1)
})

test('same actor/key cannot change workspace, hidden state or operation kind', async () => {
  const f = await fixture()
  const request = input(f.workspace.id)
  await f.store.call('applyWorkspaceOrganization', request)
  const alternatives = [
    input('other-workspace', { idempotencyKey: request.idempotencyKey }),
    input(f.workspace.id, { idempotencyKey: request.idempotencyKey, hidden: false }),
    { ...restore(0), idempotencyKey: request.idempotencyKey },
  ]
  for (const alternative of alternatives) {
    await failure(f.store.call('workspaceOrganizationReceipt', alternative), 'IDEMPOTENCY_CONFLICT')
    await failure(f.store.call('applyWorkspaceOrganization', alternative), 'IDEMPOTENCY_CONFLICT')
  }
  expect((await f.store.call('workspaceOrganization')).hiddenWorkspaceIds).toEqual([f.workspace.id])
  expect(receiptCount(f.path)).toBe(1)
})

test('safe-integer revision exhaustion fails a changed operation without state or receipt writes', async () => {
  const f = await fixture()
  const current: WorkspaceOrganizationSnapshot = {
    schemaVersion: 1,
    revision: Number.MAX_SAFE_INTEGER,
    hiddenWorkspaceIds: [f.workspace.id],
  }
  seedSnapshot(f.path, current)
  await failure(f.store.call('applyWorkspaceOrganization', restore(Number.MAX_SAFE_INTEGER)), 'INVALID_STATE')
  expect(await f.store.call('workspaceOrganization')).toEqual(current)
  expect(receiptCount(f.path)).toBe(0)
  const noop = input(f.workspace.id, { expectedRevision: Number.MAX_SAFE_INTEGER, expectedHidden: true })
  expect(await f.store.call('applyWorkspaceOrganization', noop)).toMatchObject({
    changed: false,
    revision: Number.MAX_SAFE_INTEGER,
  })
  expect(receiptCount(f.path)).toBe(1)
})

test('stored JSON is bounded before decoding and malformed journal records cannot authorize replay', async () => {
  const f = await fixture()
  const request = input(f.workspace.id)
  const result = await f.store.call('applyWorkspaceOrganization', request)
  const oversized = ' '.repeat(WORKSPACE_ORGANIZATION_MAX_BYTES) + '{}'
  const oversizedUtf8 = JSON.stringify('界'.repeat(Math.floor(WORKSPACE_ORGANIZATION_MAX_BYTES / 2)))
  for (const snapshotJson of [oversized, oversizedUtf8]) {
    inspect(f.path, (db) => db.query('UPDATE workspace_organization_state SET snapshotJson=?').run(snapshotJson))
    await failure(f.store.call('workspaceOrganization'), 'INVALID_STATE')
    await failure(f.store.call('applyWorkspaceOrganization', restore(1)), 'INVALID_STATE')
    expect(
      inspect(
        f.path,
        (db) =>
          db.query<{ snapshotJson: string }, []>('SELECT snapshotJson FROM workspace_organization_state').get()
            ?.snapshotJson,
      ),
    ).toBe(snapshotJson)
  }
  seedSnapshot(f.path, { schemaVersion: 1, revision: 1, hiddenWorkspaceIds: [f.workspace.id] })
  const malformed = [
    '{invalid',
    oversized,
    JSON.stringify({ ...result, changed: false }),
    JSON.stringify({ ...result, request: { ...result.request, change: { kind: 'restoreHidden' } } }),
  ]
  for (const receiptJson of malformed) {
    inspect(f.path, (db) => db.query('UPDATE workspace_organization_receipts SET receiptJson=?').run(receiptJson))
    await failure(f.store.call('workspaceOrganizationReceipt', request), 'INVALID_STATE')
    await failure(f.store.call('applyWorkspaceOrganization', request), 'INVALID_STATE')
  }
  expect((await f.store.call('workspaceOrganization')).revision).toBe(1)
  expect(receiptCount(f.path)).toBe(1)
})

test('Worker startup waits for a held database lock before configuring WAL and migrating v6', async () => {
  const f = await fixture()
  await close(f.store)
  const blocker = new Database(f.path, { strict: true })
  blocker.exec(
    'DROP TABLE workspace_organization_state; DROP TABLE workspace_organization_receipts; PRAGMA user_version=6; PRAGMA journal_mode=DELETE; BEGIN EXCLUSIVE;',
  )
  const contender = open(f.path)
  let settled = false
  const ready = contender.call('ready').then(
    (result) => {
      settled = true
      return { ok: true, result }
    },
    (error: unknown) => {
      settled = true
      return { ok: false, error }
    },
  )
  let settledWhileLocked: boolean
  try {
    // The lock is held by this test's connection, not a mocked timeout or a delayed Storage response.
    await Bun.sleep(500)
    settledWhileLocked = settled
  } finally {
    blocker.exec('ROLLBACK;')
    blocker.close()
  }
  const result = await ready
  expect(settledWhileLocked).toBe(false)
  expect(result).toEqual({ ok: true, result: { version: 10 } })
  expect(await contender.call('workspaceOrganization')).toEqual({
    schemaVersion: 1,
    revision: 0,
    hiddenWorkspaceIds: [],
  })
})

test('twenty bounded two-Worker v6 startup rounds preserve migration and one-winner CAS', async () => {
  const f = await fixture()
  await close(f.store)
  for (let round = 0; round < 20; round++) {
    inspect(f.path, (db) =>
      db.exec(
        'DROP TABLE workspace_organization_state; DROP TABLE workspace_organization_receipts; PRAGMA user_version=6;',
      ),
    )
    const a = open(f.path)
    const b = open(f.path)
    try {
      expect(await Promise.all([a.call('ready'), b.call('ready')])).toEqual([{ version: 10 }, { version: 10 }])
      const results = await Promise.allSettled([
        a.call('applyWorkspaceOrganization', input(f.workspace.id)),
        b.call('applyWorkspaceOrganization', input(f.workspace.id)),
      ])
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
      expect(results.find((result) => result.status === 'rejected')).toMatchObject({
        reason: { code: 'COMMAND_CONFLICT' },
      })
      expect(await a.call('workspaceOrganization')).toEqual({
        schemaVersion: 1,
        revision: 1,
        hiddenWorkspaceIds: [f.workspace.id],
      })
      expect(receiptCount(f.path)).toBe(1)
    } finally {
      await close(a)
      await close(b)
    }
  }
}, 20000)
