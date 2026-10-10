import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, basename } from 'node:path'
import { Storage, type WorkspaceDisplayNamesMutationInput } from '@hbar/storage'
import {
  WORKSPACE_DISPLAY_NAMES_MAX_BYTES,
  workspaceDisplayNameSchema,
  workspaceDisplayNamesSnapshotSchema,
  type WorkspaceDisplayNamesSnapshot,
} from '@hbar/contracts/commands/workspace-display-names'

const roots: string[] = []
const stores = new Set<Storage>()
const prefix = 'hbar-display-names-storage-'
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
  expect(await store.call('ready')).toEqual({ version: 23 })
  const workspace = await store.call('createWorkspace', root, 'folder')
  return { root, path, store, workspace }
}
function input(
  workspaceId: string,
  displayName: string | null = '项目 Alpha',
  expectedRevision = 0,
  expectedDisplayName: string | null = null,
): WorkspaceDisplayNamesMutationInput {
  return {
    actorId: 'actor-a',
    idempotencyKey: crypto.randomUUID(),
    request: { workspaceId, displayName, expectedRevision, expectedDisplayName },
  }
}
function inspect<T>(path: string, action: (db: Database) => T): T {
  const db = new Database(path, { strict: true })
  db.exec('PRAGMA busy_timeout=5000;')
  try {
    return action(db)
  } finally {
    db.close()
  }
}
function seed(path: string, value: unknown) {
  inspect(path, (db) =>
    db.query('INSERT OR REPLACE INTO workspace_display_names_state VALUES(1,?)').run(JSON.stringify(value)),
  )
}
function count(path: string) {
  return inspect(
    path,
    (db) =>
      db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM workspace_display_names_receipts').get()?.count,
  )
}

async function failure(operation: Promise<unknown>, code: string) {
  // Await Worker message delivery before invoking Bun's synchronous assertion matcher.
  let caught: unknown
  try {
    await operation
  } catch (error) {
    caught = error
  }
  expect(caught).toMatchObject({ code })
}

test('single-line label capacity is exactly 80 UTF-16 units, with no empty, surrounding whitespace or controls', () => {
  for (const value of ['a', '中'.repeat(80), '😀'.repeat(40), 'research / alpha', 'A  B', '👩‍💻', 'مشروع', 'café'])
    expect(workspaceDisplayNameSchema.safeParse(value).success).toBe(true)
  for (const value of [
    '',
    ' ',
    ' a',
    'a ',
    'a\nb',
    'a\tb',
    'a\u0000b',
    'a\u2028b',
    'a\u2029b',
    'x'.repeat(81),
    '😀'.repeat(41),
    '\u200b',
    '\u0301',
    'A\u202eB',
    '\ud800',
    '\udfff',
  ])
    expect(workspaceDisplayNameSchema.safeParse(value).success).toBe(false)
})

test('alias save/reset leaves canonical directory, same-name project, sessions, hidden state and settings unchanged', async () => {
  const f = await fixture()
  const other = await f.store.call('createWorkspace', join(f.root, 'other'), f.workspace.name)
  const session = await f.store.call('createSession', f.workspace.id, 'keep session title')
  await f.store.call('setSetting', 'presentation', 'unchanged')
  const hiddenRequest = {
    actorId: 'actor-a',
    idempotencyKey: 'hidden',
    request: {
      expectedRevision: 0,
      change: { kind: 'setHidden' as const, workspaceId: f.workspace.id, expectedHidden: false, hidden: true },
    },
  }
  const hidden = await f.store.call('applyWorkspaceOrganization', hiddenRequest)
  expect(await f.store.call('workspaceDisplayNames')).toEqual({ schemaVersion: 1, revision: 0, entries: [] })
  expect(inspect(f.path, (db) => db.query('SELECT * FROM workspace_display_names_state').all())).toEqual([])
  const result = await f.store.call('applyWorkspaceDisplayNames', input(f.workspace.id))
  expect(result).toMatchObject({ changed: true, revision: 1 })
  await f.store.call('applyWorkspaceDisplayNames', input(other.id, '项目 Alpha', 1))
  expect((await f.store.call('workspaceDisplayNames')).entries).toHaveLength(2)
  await f.store.call('applyWorkspaceDisplayNames', input(f.workspace.id, null, 2, '项目 Alpha'))
  expect(await f.store.call('workspaceDisplayNames')).toEqual({
    schemaVersion: 1,
    revision: 3,
    entries: [{ workspaceId: other.id, displayName: '项目 Alpha' }],
  })
  expect(await f.store.call('workspace', f.workspace.id)).toEqual(f.workspace)
  expect(await f.store.call('workspace', other.id)).toEqual(other)
  expect(await f.store.call('session', session.id)).toEqual(session)
  expect(await f.store.call('getSetting', 'presentation')).toBe('unchanged')
  expect(await f.store.call('workspaceOrganization')).toEqual({
    schemaVersion: 1,
    revision: 1,
    hiddenWorkspaceIds: [f.workspace.id],
  })
  expect(await f.store.call('workspaceOrganizationReceipt', hiddenRequest)).toEqual(hidden)
})

test('exact journal survives restart; replay precedes stale CAS and does not roll newer state back', async () => {
  const f = await fixture()
  const request = input(f.workspace.id)
  const receipt = await f.store.call('applyWorkspaceDisplayNames', request)
  await f.store.call('applyWorkspaceDisplayNames', input(f.workspace.id, 'Beta', 1, '项目 Alpha'))
  await close(f.store)
  const restarted = open(f.path)
  await restarted.call('ready')
  expect(await restarted.call('workspaceDisplayNamesReceipt', request)).toEqual(receipt)
  expect(await restarted.call('applyWorkspaceDisplayNames', request)).toEqual(receipt)
  expect(await restarted.call('workspaceDisplayNames')).toEqual({
    schemaVersion: 1,
    revision: 2,
    entries: [{ workspaceId: f.workspace.id, displayName: 'Beta' }],
  })
  expect(await restarted.call('workspaceDisplayNamesReceipt', { ...request, actorId: 'actor-b' })).toBeNull()
  expect(await restarted.call('workspaceDisplayNamesReceipt', { ...request, idempotencyKey: 'missing' })).toBeNull()
  for (const change of [
    { workspaceId: 'another' },
    { displayName: 'another' },
    { expectedRevision: 1 },
    { expectedDisplayName: 'another' },
  ]) {
    const mismatch = { ...request, request: { ...request.request, ...change } }
    await failure(restarted.call('applyWorkspaceDisplayNames', mismatch), 'IDEMPOTENCY_CONFLICT')
    await failure(restarted.call('workspaceDisplayNamesReceipt', mismatch), 'IDEMPOTENCY_CONFLICT')
  }
  expect(count(f.path)).toBe(2)
})

test('no-op receipts are durable; both expected revision and captured alias are enforced', async () => {
  const f = await fixture()
  const noop = input(f.workspace.id, null)
  const receipt = await f.store.call('applyWorkspaceDisplayNames', noop)
  expect(receipt).toMatchObject({ changed: false, revision: 0 })
  expect(await f.store.call('applyWorkspaceDisplayNames', noop)).toEqual(receipt)
  await f.store.call('applyWorkspaceDisplayNames', input(f.workspace.id))
  await failure(f.store.call('applyWorkspaceDisplayNames', input(f.workspace.id)), 'COMMAND_CONFLICT')
  await failure(f.store.call('applyWorkspaceDisplayNames', input(f.workspace.id, 'Beta', 1)), 'COMMAND_CONFLICT')
  expect(
    await f.store.call('applyWorkspaceDisplayNames', input(f.workspace.id, '项目 Alpha', 1, '项目 Alpha')),
  ).toMatchObject({ changed: false, revision: 1 })
  expect(count(f.path)).toBe(3)
})

test('new aliases require existing identity but stale entries can be reset without touching other unknown identities', async () => {
  const f = await fixture()
  await failure(f.store.call('applyWorkspaceDisplayNames', input('missing')), 'NOT_FOUND')
  seed(f.path, {
    schemaVersion: 1,
    revision: 4,
    entries: [
      { workspaceId: 'missing', displayName: 'Old' },
      { workspaceId: 'also-missing', displayName: 'Keep' },
    ],
  })
  await f.store.call('applyWorkspaceDisplayNames', input('missing', null, 4, 'Old'))
  expect(await f.store.call('workspaceDisplayNames')).toEqual({
    schemaVersion: 1,
    revision: 5,
    entries: [{ workspaceId: 'also-missing', displayName: 'Keep' }],
  })
})

for (const version of [6, 7]) {
  test(`two Workers migrate v${version} to v11 preserving existing organization receipts, then serialize CAS`, async () => {
    const f = await fixture()
    const hiddenRequest = {
      actorId: 'actor-a',
      idempotencyKey: 'legacy-hidden',
      request: { expectedRevision: 0, change: { kind: 'restoreHidden' as const } },
    }
    const hiddenReceipt = await f.store.call('applyWorkspaceOrganization', hiddenRequest)
    await close(f.store)
    inspect(f.path, (db) => {
      db.exec('DROP TABLE workspace_display_names_state; DROP TABLE workspace_display_names_receipts;')
      db.exec(version === 6 ? 'PRAGMA user_version=6;' : 'PRAGMA user_version=7;')
    })
    const a = open(f.path)
    const b = open(f.path)
    expect(await Promise.all([a.call('ready'), b.call('ready')])).toEqual([{ version: 23 }, { version: 23 }])
    const writes = await Promise.allSettled([
      a.call('applyWorkspaceDisplayNames', input(f.workspace.id, 'A')),
      b.call('applyWorkspaceDisplayNames', input(f.workspace.id, 'B')),
    ])
    expect(writes.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(writes.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'COMMAND_CONFLICT' },
    })
    expect((await a.call('workspaceDisplayNames')).revision).toBe(1)
    expect(await b.call('workspaceOrganizationReceipt', hiddenRequest)).toEqual(hiddenReceipt)
    expect(await b.call('workspaceOrganization')).toEqual({ schemaVersion: 1, revision: 0, hiddenWorkspaceIds: [] })
  })
}

test('identical concurrent actor/key calls yield one commit; different actors do not share receipts', async () => {
  const f = await fixture()
  const b = open(f.path)
  await b.call('ready')
  const request = input(f.workspace.id)
  const results = await Promise.all([
    f.store.call('applyWorkspaceDisplayNames', request),
    b.call('applyWorkspaceDisplayNames', request),
  ])
  expect(results[0]).toEqual(results[1])
  expect(count(f.path)).toBe(1)
  await failure(b.call('applyWorkspaceDisplayNames', { ...request, actorId: 'actor-b' }), 'COMMAND_CONFLICT')
})

test('2000 aliases allow replacement/reset but reject append atomically; byte budget independently rejects large Unicode state', async () => {
  const f = await fixture()
  const entries = Array.from({ length: 2000 }, (_, index) => ({ workspaceId: `id-${index}`, displayName: 'name' }))
  entries[0] = { workspaceId: f.workspace.id, displayName: 'name' }
  seed(f.path, { schemaVersion: 1, revision: 3, entries })
  expect(workspaceDisplayNamesSnapshotSchema.safeParse({ schemaVersion: 1, revision: 3, entries }).success).toBe(true)
  await f.store.call('applyWorkspaceDisplayNames', input(f.workspace.id, 'replacement', 3, 'name'))
  const other = await f.store.call('createWorkspace', join(f.root, 'second'), 'second')
  await failure(f.store.call('applyWorkspaceDisplayNames', input(other.id, 'extra', 4)), 'INPUT_TOO_LARGE')
  expect((await f.store.call('workspaceDisplayNames')).revision).toBe(4)
  expect(count(f.path)).toBe(1)
  await f.store.call('applyWorkspaceDisplayNames', input(f.workspace.id, null, 4, 'replacement'))
  await f.store.call('applyWorkspaceDisplayNames', input(other.id, 'extra', 5))
  expect((await f.store.call('workspaceDisplayNames')).entries).toHaveLength(2000)
  const large: WorkspaceDisplayNamesSnapshot = { schemaVersion: 1, revision: 10, entries: [] }
  for (let index = 0; index < 2000; index++) {
    const entry = { workspaceId: `id-${index}`, displayName: '界'.repeat(80) }
    large.entries.push(entry)
    if (new TextEncoder().encode(JSON.stringify(large)).byteLength > WORKSPACE_DISPLAY_NAMES_MAX_BYTES - 300) {
      large.entries.pop()
      break
    }
  }
  expect(workspaceDisplayNamesSnapshotSchema.safeParse(large).success).toBe(true)
  seed(f.path, large)
  // Fill the remaining byte allowance with a valid long workspace ID, not an entry-count violation.
  const longId = '界'.repeat(160)
  inspect(f.path, (db) =>
    db
      .query('INSERT INTO workspaces(id,path,name,createdAt) VALUES(?,?,?,?)')
      .run(longId, 'fixture-long-path', 'long', 0),
  )
  await failure(f.store.call('applyWorkspaceDisplayNames', input(longId, '界'.repeat(80), 10)), 'INPUT_TOO_LARGE')
  expect(await f.store.call('workspaceDisplayNames')).toEqual(large)
  expect(count(f.path)).toBe(3)
})

test('malformed, unsupported, duplicate and overflow state fails closed without overwriting evidence', async () => {
  const f = await fixture()
  for (const [value, code] of [
    [{ schemaVersion: 2, revision: 0, entries: [] }, 'VERSION_MISMATCH'],
    [
      {
        schemaVersion: 1,
        revision: 0,
        entries: [
          { workspaceId: 'same', displayName: 'A' },
          { workspaceId: 'same', displayName: 'B' },
        ],
      },
      'INVALID_STATE',
    ],
    [{ schemaVersion: 1, revision: -1, entries: [] }, 'INVALID_STATE'],
    [{ schemaVersion: 1, revision: Number.MAX_SAFE_INTEGER, entries: [] }, 'INVALID_STATE'],
  ] as const) {
    seed(f.path, value)
    await failure(
      f.store.call('applyWorkspaceDisplayNames', input(f.workspace.id, 'A', value.revision)),
      value.revision < 0 ? 'INVALID_INPUT' : code,
    )
    expect(
      inspect(
        f.path,
        (db) =>
          db.query<{ snapshotJson: string }, []>('SELECT snapshotJson FROM workspace_display_names_state').get()
            ?.snapshotJson,
      ),
    ).toBe(JSON.stringify(value))
  }
  expect(count(f.path)).toBe(0)
})

test('corrupt exact receipts reject read/replay and never mutate a newer valid state', async () => {
  const f = await fixture()
  const request = input(f.workspace.id)
  const receipt = await f.store.call('applyWorkspaceDisplayNames', request)
  for (const value of [
    '{broken',
    JSON.stringify({ ...receipt, revision: 99 }),
    JSON.stringify({ ...receipt, request: { ...request.request, displayName: 'wrong' } }),
  ]) {
    inspect(f.path, (db) => db.query('UPDATE workspace_display_names_receipts SET receiptJson=?').run(value))
    await failure(f.store.call('workspaceDisplayNamesReceipt', request), 'INVALID_STATE')
    await failure(f.store.call('applyWorkspaceDisplayNames', request), 'INVALID_STATE')
    expect((await f.store.call('workspaceDisplayNames')).revision).toBe(1)
  }
  expect(count(f.path)).toBe(1)
})

test('journal failure atomically rolls the alias back; no-op remains valid at safe revision exhaustion', async () => {
  const f = await fixture()
  inspect(f.path, (db) =>
    db.exec(
      "CREATE TRIGGER reject_display_name_receipt BEFORE INSERT ON workspace_display_names_receipts BEGIN SELECT RAISE(ABORT, 'fixture receipt failure'); END;",
    ),
  )
  await failure(f.store.call('applyWorkspaceDisplayNames', input(f.workspace.id)), 'STORAGE_ERROR')
  expect(await f.store.call('workspaceDisplayNames')).toEqual({ schemaVersion: 1, revision: 0, entries: [] })
  expect(count(f.path)).toBe(0)
  inspect(f.path, (db) => db.exec('DROP TRIGGER reject_display_name_receipt;'))
  seed(f.path, { schemaVersion: 1, revision: Number.MAX_SAFE_INTEGER, entries: [] })
  expect(
    await f.store.call('applyWorkspaceDisplayNames', input(f.workspace.id, null, Number.MAX_SAFE_INTEGER)),
  ).toMatchObject({ changed: false, revision: Number.MAX_SAFE_INTEGER })
  expect(count(f.path)).toBe(1)
})

test('stored JSON has a pre-decode UTF-8 budget and malformed requests cannot be reused as receipts', async () => {
  const f = await fixture()
  const request = input(f.workspace.id)
  await f.store.call('applyWorkspaceDisplayNames', request)
  const valid = await f.store.call('workspaceDisplayNames')
  for (const snapshotJson of [
    '{broken',
    ' '.repeat(WORKSPACE_DISPLAY_NAMES_MAX_BYTES) + '{}',
    JSON.stringify('界'.repeat(Math.floor(WORKSPACE_DISPLAY_NAMES_MAX_BYTES / 2))),
  ]) {
    inspect(f.path, (db) => db.query('UPDATE workspace_display_names_state SET snapshotJson=?').run(snapshotJson))
    await failure(f.store.call('workspaceDisplayNames'), 'INVALID_STATE')
    await failure(
      f.store.call('applyWorkspaceDisplayNames', input(f.workspace.id, null, 1, '项目 Alpha')),
      'INVALID_STATE',
    )
    expect(
      inspect(
        f.path,
        (db) =>
          db.query<{ snapshotJson: string }, []>('SELECT snapshotJson FROM workspace_display_names_state').get()
            ?.snapshotJson,
      ),
    ).toBe(snapshotJson)
  }
  seed(f.path, valid)
  inspect(f.path, (db) => db.query('UPDATE workspace_display_names_receipts SET requestJson=?').run('{broken'))
  await failure(f.store.call('workspaceDisplayNamesReceipt', request), 'INVALID_STATE')
  await failure(f.store.call('applyWorkspaceDisplayNames', request), 'INVALID_STATE')
  expect(await f.store.call('workspaceDisplayNames')).toEqual(valid)
  expect(count(f.path)).toBe(1)
})
