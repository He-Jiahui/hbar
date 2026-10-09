import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  Storage,
  createPathLayout,
  ensurePathLayout,
  createChatDatabaseFileScanner,
  type ChatDatabaseDeleteInput,
  type ChatDatabaseDeleteResult,
} from '@hbar/storage'
import {
  SettingsService,
  createChatDatabaseStatisticsService,
  createChatDatabaseMaintenanceService,
} from '@hbar/kernel'
import type { ChatDatabaseOperation, ChatDatabasePreviewInput } from '@hbar/contracts/commands/chat-database'
import {
  createChatDatabaseDeletionStorage,
  type ChatDatabaseDeletionStage,
} from '../packages/storage/src/chat-database-deletion'

const resources: {
  root: string
  storage: Storage
  service: ReturnType<typeof createChatDatabaseMaintenanceService>
  statistics: ReturnType<typeof createChatDatabaseStatisticsService>
}[] = []
afterEach(async () => {
  for (const resource of resources.splice(0)) {
    await resource.service.close()
    await resource.statistics.close()
    await resource.storage.close()
    await rm(resource.root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
async function fixture(
  hooks: {
    beforeDelete?: () => Promise<void>
    afterDelete?: (input: ChatDatabaseDeleteInput, result: ChatDatabaseDeleteResult) => void
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-chat-cleanup-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'paths.json'))
  await ensurePathLayout(layout)
  const storage = new Storage(layout.database, layout)
  await storage.call('ready')
  const settings = new SettingsService(storage)
  const statistics = createChatDatabaseStatisticsService(storage, settings, createChatDatabaseFileScanner(layout))
  const deleted: string[] = []
  const active = new Set<string>()
  const service = createChatDatabaseMaintenanceService(storage, settings, statistics, {
    protection: (id) => (active.has(id) ? 'active' : null),
    async removeSession(input) {
      await hooks.beforeDelete?.()
      const result = await storage.call('chatDatabaseDeleteSession', input)
      hooks.afterDelete?.(input, result)
      return result
    },
    deleted: (ids) => deleted.push(...ids),
  })
  const resource = { root, storage, service, statistics }
  resources.push(resource)
  const workspace = await storage.call('createWorkspace', root, 'test')
  async function old(title: string, archived = true, parentId?: string) {
    const session = await storage.call('createSession', workspace.id, title, parentId)
    await storage.call('commit', session.id, 'fixture', 'user', [{ type: 'text', text: `history ${title}` }])
    await storage.call('updateSession', session.id, { archived })
    while (!(await storage.call('chatDatabaseUsageBackfill', 250)).complete) {
      /* bounded backfill */
    }
    const db = new Database(layout.database, { strict: true })
    const time = Date.now() - 100 * 86_400_000
    db.query('UPDATE sessions SET createdAt=? WHERE id=?').run(time, session.id)
    db.query('UPDATE chat_database_usage SET lastActivityAt=? WHERE sessionId=?').run(time, session.id)
    db.close()
    return storage.call('session', session.id)
  }
  return { ...resource, layout, settings, workspace, old, deleted, active }
}
async function settled(
  service: ReturnType<typeof createChatDatabaseMaintenanceService>,
  id: string,
): Promise<ChatDatabaseOperation> {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const value = await service.read(id)
    if (['completed', 'cancelled', 'failed', 'unknown'].includes(value.status)) return value
    await new Promise<void>((resolve) => setTimeout(resolve, 5))
  }
  throw new Error('Maintenance did not settle')
}
async function preview(
  f: Awaited<ReturnType<typeof fixture>>,
  input: ChatDatabasePreviewInput = { scope: { kind: 'global' }, kind: 'sessions' },
) {
  const accepted = await f.service.preview(input, { actorId: 'device', idempotencyKey: crypto.randomUUID() })
  const result = await settled(f.service, accepted.operationId)
  expect(result.status).toBe('completed')
  return result
}
async function cleanup(f: Awaited<ReturnType<typeof fixture>>, fixed: ChatDatabaseOperation) {
  const accepted = await f.service.cleanup(
    { previewId: fixed.operationId },
    { actorId: 'device', idempotencyKey: crypto.randomUUID() },
  )
  return settled(f.service, accepted.operationId)
}
const errorOf = <Value>(task: Promise<Value>) =>
  task.then(
    () => null,
    (reason: unknown) => reason,
  )

test('manual preview uses saved retention/archive rules and deletion removes history, settings and search', async () => {
  const f = await fixture()
  const candidate = await f.old('候选聊天')
  await f.storage.call('setSettings', 'session', candidate.id, { 'legacy.fixture': 'session data' })
  const unarchived = await f.old('kept', false)
  const recent = await f.storage.call('createSession', f.workspace.id, 'recent')
  await f.storage.call('updateSession', recent.id, { archived: true })
  const scoped = await f.settings.get({ kind: 'session', targetId: candidate.id })
  await f.settings.apply({
    actorId: 'device',
    idempotencyKey: 'local-rule',
    schemaVersion: 1,
    scope: { kind: 'session', targetId: candidate.id },
    baselineRevisions: scoped.revisions,
    changes: [{ op: 'set', path: [{ kind: 'field', name: 'chatDatabase.retentionDays' }], value: 30 }],
  })
  while (!(await f.storage.call('searchIndexStep')).complete) {
    /* index the canonical messages before deleting */
  }
  const indexed = new Database(f.layout.database, { strict: true })
  expect(
    indexed
      .query<{ count: number }, [string]>('SELECT COUNT(*) AS count FROM session_search_documents WHERE sessionId=?')
      .get(candidate.id)?.count,
  ).toBeGreaterThan(0)
  indexed.close()
  const fixed = await preview(f)
  expect(fixed.candidateCount).toBe(1)
  expect(fixed.skipped.find((item) => item.code === 'notArchived')?.count).toBe(1)
  expect(fixed.skipped.find((item) => item.code === 'retention')?.count).toBe(1)
  const page = await f.service.page({ previewId: fixed.operationId, limit: 100 })
  expect(page.items.find((item) => item.id === candidate.id)?.eligible).toBe(true)
  const done = await cleanup(f, fixed)
  expect(done).toMatchObject({ status: 'completed', deletedCount: 1 })
  expect(done.reclaimedBytes).toBeGreaterThan(0)
  expect(done.reusableDatabaseBytes).toBeGreaterThanOrEqual(0)
  expect(await f.storage.call('findSession', candidate.id)).toBeNull()
  expect(await f.storage.call('findSession', unarchived.id)).not.toBeNull()
  expect(await f.storage.call('findSession', recent.id)).not.toBeNull()
  const db = new Database(f.layout.database, { strict: true })
  for (const table of [
    'events',
    'messages',
    'session_event_index',
    'session_log_files',
    'chat_database_usage',
    'session_search_documents',
  ])
    expect(
      db
        .query<{ count: number }, [string]>(`SELECT COUNT(*) AS count FROM ${table} WHERE sessionId=?`)
        .get(candidate.id)?.count,
    ).toBe(0)
  expect(db.query('SELECT id FROM settings_layers WHERE kind=? AND targetId=?').get('session', candidate.id)).toBeNull()
  db.close()
  expect(f.deleted).toEqual([candidate.id])
  expect(await errorOf(stat(join(f.layout.settings, 'sessions', `${candidate.id}.json`)))).toMatchObject({
    code: 'ENOENT',
  })
  expect(
    await errorOf(f.storage.call('setSettings', 'session', candidate.id, { 'legacy.fixture': 'old replay' })),
  ).toMatchObject({ code: 'SESSION_DELETED' })
  expect(
    (await f.storage.call('searchSessions', { query: 'history', source: 'conversation' })).items.some(
      (item) => item.sessionId === candidate.id,
    ),
  ).toBe(false)
})

test('fixed preview never adds later candidates and revalidates sequence, new Run and policy revisions', async () => {
  const f = await fixture()
  const global = await f.settings.get({ kind: 'global' })
  await f.settings.apply({
    actorId: 'device',
    idempotencyKey: 'include-unarchived',
    schemaVersion: 1,
    scope: { kind: 'global' },
    baselineRevisions: global.revisions,
    changes: [{ op: 'set', path: [{ kind: 'field', name: 'chatDatabase.archivedOnly' }], value: false }],
  })
  const renamed = await f.old('renamed')
  const queued = await f.old('queued', false)
  const changedRule = await f.old('rule')
  const fixed = await preview(f)
  const later = await f.old('outside preview')
  await f.storage.call('updateSession', renamed.id, { title: 'new name' })
  await f.storage.call('enqueue', queued.id, 'new-run', { text: 'queued', images: [] }, 'demo')
  const saved = await f.settings.get({ kind: 'session', targetId: changedRule.id })
  await f.settings.apply({
    actorId: 'device',
    idempotencyKey: 'changed-rule',
    schemaVersion: 1,
    scope: { kind: 'session', targetId: changedRule.id },
    baselineRevisions: saved.revisions,
    changes: [{ op: 'set', path: [{ kind: 'field', name: 'chatDatabase.retentionDays' }], value: 200 }],
  })
  const done = await cleanup(f, fixed)
  expect(done).toMatchObject({ status: 'completed', deletedCount: 0 })
  expect(done.skipped.map((skip) => skip.code)).toContain('changed')
  expect(done.skipped.map((skip) => skip.code)).toContain('policyChanged')
  for (const session of [renamed, queued, changedRule, later])
    expect(await f.storage.call('findSession', session.id)).not.toBeNull()
})

test('a retained child protects its parent; an eligible tree is deleted leaves first', async () => {
  const f = await fixture()
  const protectedParent = await f.old('protected parent')
  await f.old('retained child', false, protectedParent.id)
  const parent = await f.old('eligible parent')
  const child = await f.old('eligible child', true, parent.id)
  const fixed = await preview(f)
  expect(
    (await f.service.page({ previewId: fixed.operationId, limit: 100 })).items.find(
      (item) => item.id === protectedParent.id,
    ),
  ).toMatchObject({ eligible: false, skipReason: 'retainedChild' })
  const done = await cleanup(f, fixed)
  expect(done.deletedCount).toBe(2)
  expect(f.deleted).toEqual([child.id, parent.id])
  expect(await f.storage.call('findSession', protectedParent.id)).not.toBeNull()
})

test('a moved session deletes its canonical logs in every historical project directory', async () => {
  const f = await fixture()
  const session = await f.old('moved history')
  const other = await f.storage.call('createWorkspace', join(f.root, 'other'), 'other')
  await f.storage.call('moveSession', session.id, other.id)
  await f.storage.call('commit', session.id, 'after-move', 'user', [{ type: 'text', text: 'new project log' }])
  const db = new Database(f.layout.database, { strict: true })
  const paths = db
    .query<{ path: string }, [string]>('SELECT path FROM session_log_files WHERE sessionId=?')
    .all(session.id)
  db.query('UPDATE chat_database_usage SET lastActivityAt=? WHERE sessionId=?').run(
    Date.now() - 100 * 86_400_000,
    session.id,
  )
  db.close()
  expect(new Set(paths.map((item) => item.path.split('/')[0])).size).toBe(2)
  const done = await cleanup(f, await preview(f))
  expect(done).toMatchObject({ status: 'completed', deletedCount: 1 })
  for (const path of paths)
    expect(await errorOf(stat(join(f.layout.sessions, path.path)))).toMatchObject({ code: 'ENOENT' })
})

test('idempotency receipts reconcile one operation, reject changed input, and expired previews cannot delete', async () => {
  const f = await fixture()
  await f.old('candidate')
  const input: ChatDatabasePreviewInput = { scope: { kind: 'global' }, kind: 'sessions' }
  const identity = { actorId: 'device', idempotencyKey: 'same-preview' }
  const accepted = await f.service.preview(input, identity)
  expect((await f.service.preview(input, identity)).operationId).toBe(accepted.operationId)
  const fixed = await settled(f.service, accepted.operationId)
  expect((await f.service.receipt(identity))?.operationId).toBe(fixed.operationId)
  expect(
    await errorOf(f.service.preview({ ...input, scope: { kind: 'workspace', targetId: f.workspace.id } }, identity)),
  ).toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  await f.storage.call('chatDatabaseOperationUpdate', fixed.operationId, { expiresAt: Date.now() - 1 })
  expect(
    await errorOf(
      f.service.cleanup({ previewId: fixed.operationId }, { actorId: 'device', idempotencyKey: 'expired' }),
    ),
  ).toMatchObject({ code: 'PREVIEW_EXPIRED' })
  expect((await f.storage.call('chatDatabaseUsage', { kind: 'global' })).sessionCount).toBe(1)
})

test('durable and live activity, interrupted runs, user input, preparations and enabled schedule targets are protected', async () => {
  const f = await fixture()
  const global = await f.settings.get({ kind: 'global' })
  await f.settings.apply({
    actorId: 'device',
    idempotencyKey: 'activity-policy',
    schemaVersion: 1,
    scope: { kind: 'global' },
    baselineRevisions: global.revisions,
    changes: [{ op: 'set', path: [{ kind: 'field', name: 'chatDatabase.archivedOnly' }], value: false }],
  })
  const expected = new Map<string, string>()
  for (const [status, reason] of [
    ['queued', 'queued'],
    ['running', 'active'],
    ['waiting_approval', 'approval'],
    ['interrupted', 'resume'],
  ] as const) {
    const session = await f.old(status, false)
    const run = await f.storage.call('enqueue', session.id, `run-${status}`, { text: status, images: [] }, 'demo')
    if (status !== 'queued') await f.storage.call('setRun', run.id, status)
    expected.set(session.id, reason)
  }
  const input = await f.old('pending input')
  await f.storage.call('append', input.id, 'user_input.requested', { requestId: 'pending-request' })
  expected.set(input.id, 'userInput')
  const preparation = await f.old('preparation', false)
  await f.storage.call('startSessionLaunchTargetPreparation', {
    sessionId: preparation.id,
    expectedRevision: 0,
    actorId: 'device',
    idempotencyKey: 'prepare',
  })
  expected.set(preparation.id, 'preparation')
  const scheduled = await f.old('scheduled')
  await f.storage.call('createSchedule', {
    workspaceId: f.workspace.id,
    name: 'retained target',
    input: 'scheduled',
    modelId: 'demo',
    timezone: 'UTC',
    target: { mode: 'existing-session', sessionId: scheduled.id },
    spec: { kind: 'daily', hour: 1, minute: 0 },
  })
  expected.set(scheduled.id, 'schedule')
  const live = await f.old('live domain')
  f.active.add(live.id)
  expected.set(live.id, 'active')
  const fixed = await preview(f)
  const page = await f.service.page({ previewId: fixed.operationId, limit: 100 })
  for (const [id, reason] of expected)
    expect(page.items.find((item) => item.id === id)).toMatchObject({ eligible: false, skipReason: reason })
  expect(fixed.candidateCount).toBe(0)
})

test('preview pages enforce the 100-item bound and keep a stable cursor at 101 entries', async () => {
  const f = await fixture()
  for (let index = 0; index < 101; index++) await f.storage.call('createSession', f.workspace.id, `session ${index}`)
  const fixed = await preview(f)
  const first = await f.service.page({ previewId: fixed.operationId, limit: 100 })
  const second = await f.service.page({ previewId: fixed.operationId, after: first.next, limit: 100 })
  expect(first.items).toHaveLength(100)
  expect(second.items).toHaveLength(1)
  expect(second.next).toBeNull()
  expect(await errorOf(f.service.page({ previewId: fixed.operationId, limit: 101 }))).toBeInstanceOf(Error)
})

test('cancellation settles at a deletion boundary and reports the already deleted part', async () => {
  let started!: () => void
  let release!: () => void
  const entered = new Promise<void>((resolve) => {
    started = resolve
  })
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  let calls = 0
  const f = await fixture({
    beforeDelete: async () => {
      if (calls++ === 0) {
        started()
        await gate
      }
    },
  })
  await f.old('first')
  await f.old('second')
  const fixed = await preview(f)
  const accepted = await f.service.cleanup(
    { previewId: fixed.operationId },
    { actorId: 'device', idempotencyKey: 'cancel-cleanup' },
  )
  await entered
  const cancellation = await f.service.cancel(accepted.operationId, {
    actorId: 'device',
    idempotencyKey: 'cancel-intent',
  })
  expect(cancellation).toMatchObject({ status: 'cancelRequested', cancellationRequested: true })
  release()
  const done = await settled(f.service, accepted.operationId)
  expect(done).toMatchObject({ status: 'cancelled', deletedCount: 1, processedCount: 1 })
  expect((await f.storage.call('chatDatabaseUsage', { kind: 'global' })).sessionCount).toBe(1)
  expect((await f.service.receipt({ actorId: 'device', idempotencyKey: 'cancel-cleanup' }))?.status).toBe('cancelled')
})

test('lost deletion acknowledgement reconciles its original ID without duplicating counts or expanding candidates', async () => {
  let lose = true
  const f = await fixture({
    afterDelete: () => {
      if (lose) {
        lose = false
        throw new Error('lost acknowledgement')
      }
    },
  })
  await f.old('first')
  await f.old('second')
  const fixed = await preview(f)
  const accepted = await f.service.cleanup(
    { previewId: fixed.operationId },
    { actorId: 'device', idempotencyKey: 'lost-cleanup' },
  )
  const unknown = await settled(f.service, accepted.operationId)
  expect(unknown).toMatchObject({ status: 'unknown', processedCount: 0 })
  const outside = await f.old('outside original preview')
  await f.service.reconcile(accepted.operationId, { actorId: 'device', idempotencyKey: 'reconcile-original' })
  const done = await settled(f.service, accepted.operationId)
  expect(done).toMatchObject({ status: 'completed', deletedCount: 2, processedCount: 2 })
  expect(await f.storage.call('findSession', outside.id)).not.toBeNull()
  expect((await f.service.receipt({ actorId: 'device', idempotencyKey: 'lost-cleanup' }))?.operationId).toBe(
    done.operationId,
  )
  const repeated = await f.service.reconcile(accepted.operationId, {
    actorId: 'device',
    idempotencyKey: 'reconcile-original',
  })
  expect(repeated).toMatchObject({ status: 'completed', deletedCount: 2 })
})

test('Host restart resumes a persisted cleanup and reconciles a committed deletion before advancing its cursor', async () => {
  let lose = true
  const f = await fixture({
    afterDelete: () => {
      if (lose) {
        lose = false
        throw new Error('lost before shutdown')
      }
    },
  })
  await f.old('first')
  await f.old('second')
  const fixed = await preview(f)
  const accepted = await f.service.cleanup(
    { previewId: fixed.operationId },
    { actorId: 'device', idempotencyKey: 'restart-cleanup' },
  )
  expect((await settled(f.service, accepted.operationId)).status).toBe('unknown')
  await f.service.close()
  await f.statistics.close()
  await f.storage.close()
  const reopened = new Storage(f.layout.database, f.layout)
  await reopened.call('ready')
  const settings = new SettingsService(reopened)
  const statistics = createChatDatabaseStatisticsService(reopened, settings, createChatDatabaseFileScanner(f.layout))
  const restored = createChatDatabaseMaintenanceService(reopened, settings, statistics, {
    protection: () => null,
    removeSession: (input) => reopened.call('chatDatabaseDeleteSession', input),
    deleted: () => undefined,
  })
  try {
    let done = await restored.read(accepted.operationId)
    for (let attempt = 0; attempt < 200 && done.status !== 'completed'; attempt++) {
      await new Promise<void>((resolve) => setTimeout(resolve, 5))
      done = await restored.read(accepted.operationId)
    }
    expect(done).toMatchObject({ status: 'completed', deletedCount: 2, processedCount: 2 })
    expect((await restored.receipt({ actorId: 'device', idempotencyKey: 'restart-cleanup' }))?.operationId).toBe(
      accepted.operationId,
    )
    expect((await reopened.call('chatDatabaseUsage', { kind: 'global' })).sessionCount).toBe(0)
  } finally {
    await restored.close()
    await statistics.close()
    await reopened.close()
  }
})

test('an old Fork request cannot recreate a deleted child after rebuilding the SQLite projection', async () => {
  const f = await fixture()
  const parent = await f.old('retained parent', false)
  const request = { actorId: 'device', idempotencyKey: 'original-fork', sessionId: parent.id }
  const child = await f.storage.call('forkSessionCommand', request)
  await f.storage.call('updateSession', child.id, { archived: true })
  const db = new Database(f.layout.database, { strict: true })
  db.query('UPDATE chat_database_usage SET lastActivityAt=? WHERE sessionId=?').run(
    Date.now() - 100 * 86_400_000,
    child.id,
  )
  db.close()
  expect((await cleanup(f, await preview(f))).deletedCount).toBe(1)
  await f.service.close()
  await f.statistics.close()
  await f.storage.close()
  for (const suffix of ['', '-wal', '-shm']) await rm(`${f.layout.database}${suffix}`, { force: true })
  const rebuilt = new Storage(f.layout.database, f.layout)
  try {
    await rebuilt.call('ready')
    expect(await rebuilt.call('findSession', parent.id)).not.toBeNull()
    expect(await rebuilt.call('findSession', child.id)).toBeNull()
    expect(await errorOf(rebuilt.call('forkSessionCommand', request))).toMatchObject({ code: 'SESSION_DELETED' })
    expect((await rebuilt.call('sessions')).map((session) => session.id)).toEqual([parent.id])
  } finally {
    await rebuilt.close()
  }
})

for (const stage of ['marked', 'projected', 'unlinked'] satisfies ChatDatabaseDeletionStage[])
  test(`crash after ${stage} cannot resurrect a deleted session through restart or a database rebuild`, async () => {
    const f = await fixture()
    const identity = {
      actorId: 'device',
      idempotencyKey: 'original-create',
      workspaceId: f.workspace.id,
      title: 'deleted request',
    }
    const session = await f.storage.call('createSessionCommand', identity)
    await f.storage.call('commit', session.id, 'fixture', 'user', [{ type: 'text', text: 'do not restore this' }])
    const surviving = await f.storage.call('createSession', f.workspace.id, 'survivor')
    const usage = await f.storage.call('chatDatabaseUsage', { kind: 'session', targetId: session.id })
    const latest = await f.storage.call('session', session.id)
    await f.service.close()
    await f.statistics.close()
    await f.storage.close()
    const db = new Database(f.layout.database, { strict: true })
    db.exec('PRAGMA foreign_keys=ON;')
    const deletion = createChatDatabaseDeletionStorage(db, f.layout.sessions, (current) => {
      if (current === stage) throw new Error('simulated process termination')
    })
    expect(() =>
      deletion.remove({
        sessionId: session.id,
        operationId: crypto.randomUUID(),
        expectedSeq: latest.seq,
        expectedActivityAt: usage.lastActivityAt!,
      }),
    ).toThrow('simulated process termination')
    db.close()
    for (const rebuild of [false, true]) {
      if (rebuild) for (const suffix of ['', '-wal', '-shm']) await rm(`${f.layout.database}${suffix}`, { force: true })
      const reopened = new Storage(f.layout.database, f.layout)
      try {
        await reopened.call('ready')
        expect(await reopened.call('findSession', session.id)).toBeNull()
        expect(await reopened.call('findSession', surviving.id)).not.toBeNull()
        expect(await errorOf(reopened.call('createSessionCommand', identity))).toMatchObject({
          code: 'SESSION_DELETED',
        })
        expect((await reopened.call('sessions')).map((item) => item.id)).toEqual([surviving.id])
      } finally {
        await reopened.close()
      }
    }
  })
