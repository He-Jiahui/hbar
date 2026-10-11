import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Storage, createPathLayout, ensurePathLayout, createChatDatabaseFileScanner } from '@hbar/storage'
import {
  SettingsService,
  createChatDatabaseStatisticsService,
  createChatDatabaseMaintenanceService,
  createChatDatabaseScheduler,
  chatDatabaseCapacitySignature,
} from '@hbar/kernel'
import type {
  ChatDatabaseScope,
  ChatDatabaseOperation,
  ChatDatabasePolicy,
  ChatDatabasePreviewItem,
} from '@hbar/contracts/commands/chat-database'
import { latestDueSchedule, previewSchedule } from '../packages/kernel/src/schedule-service'

const disposers: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
})

async function fixture(hooks: { afterDelete?: (sessionId: string) => void } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-chat-auto-'))
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
      const result = await storage.call('chatDatabaseDeleteSession', input)
      if (result.deleted) hooks.afterDelete?.(input.sessionId)
      return result
    },
    deleted: (ids) => { deleted.push(...ids) },
  })
  const now = Date.now()
  const scheduler = createChatDatabaseScheduler(storage, settings, statistics, service, {
    start: false,
    now: () => now,
  })
  disposers.push(async () => {
    await scheduler.close()
    await service.close()
    await statistics.close()
    await storage.close()
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  })
  const workspace = await storage.call('createWorkspace', root, 'automation')
  async function policy(scope: ChatDatabaseScope, values: Partial<ChatDatabasePolicy>) {
    const saved = await settings.get(scope)
    await settings.apply({
      actorId: 'device',
      idempotencyKey: crypto.randomUUID(),
      schemaVersion: 1,
      scope,
      baselineRevisions: saved.revisions,
      changes: Object.entries(values).map(([name, value]) => ({
        op: 'set' as const,
        path: [{ kind: 'field' as const, name: `chatDatabase.${name}` }],
        value,
      })),
    })
  }
  async function old(
    title: string,
    days = 100,
    options: { archived?: boolean; parentId?: string; text?: string } = {},
  ) {
    const session = await storage.call('createSession', workspace.id, title, options.parentId)
    await storage.call('commit', session.id, 'fixture', 'user', [
      { type: 'text', text: options.text ?? `old ${title}` },
    ])
    await storage.call('updateSession', session.id, { archived: options.archived ?? true })
    while (!(await storage.call('chatDatabaseUsageBackfill', 250)).complete) {
      /* bounded backfill */
    }
    const db = new Database(layout.database, { strict: true })
    db.query('UPDATE sessions SET createdAt=? WHERE id=?').run(now - days * 86_400_000, session.id)
    db.query('UPDATE chat_database_usage SET lastActivityAt=? WHERE sessionId=?').run(
      now - days * 86_400_000,
      session.id,
    )
    db.close()
    return session
  }
  return {
    root,
    layout,
    storage,
    settings,
    statistics,
    service,
    scheduler,
    workspace,
    policy,
    old,
    deleted,
    active,
    now,
  }
}
async function settled(
  service: ReturnType<typeof createChatDatabaseMaintenanceService>,
  id: string,
): Promise<ChatDatabaseOperation> {
  for (let tries = 0; tries < 1500; tries++) {
    const state = await service.read(id)
    if (['completed', 'cancelled', 'failed', 'unknown'].includes(state.status)) return state
    await new Promise<void>((resolve) => setTimeout(resolve, 3))
  }
  throw new Error('Automatic cleanup did not settle')
}

test('task scopes contain only global and explicit overrides, including disabled children; inheritance removes the duplicate task', async () => {
  const f = await fixture()
  const child = await f.old('child')
  await f.policy({ kind: 'global' }, { autoEnabled: true })
  await f.policy({ kind: 'session', targetId: child.id }, { autoEnabled: false })
  expect((await f.storage.call('chatDatabaseTaskScopes', null, 50)).items.map((row) => row.scope)).toEqual([
    { kind: 'global' },
    { kind: 'session', targetId: child.id },
  ])
  expect(await f.scheduler.get({ kind: 'workspace', targetId: f.workspace.id })).toMatchObject({
    explicit: false,
    autoEnabled: false,
    nextDueAt: null,
  })
  const scope: ChatDatabaseScope = { kind: 'session', targetId: child.id }
  const saved = await f.settings.get(scope)
  await f.settings.apply({
    actorId: 'device',
    idempotencyKey: 'inherit',
    schemaVersion: 1,
    scope,
    baselineRevisions: saved.revisions,
    changes: [{ op: 'unset', path: [{ kind: 'field', name: 'chatDatabase.autoEnabled' }] }],
  })
  expect((await f.storage.call('chatDatabaseTaskScopes', null, 50)).items).toHaveLength(1)
  expect(await f.scheduler.get(scope)).toMatchObject({ explicit: false, autoEnabled: false })
})

test('saved daily schedule catches up once after restart, coalesces missed days and protects an explicitly disabled child tree', async () => {
  const f = await fixture()
  const eligible = await f.old('eligible')
  const parent = await f.old('parent')
  const child = await f.old('disabled child', 110, { parentId: parent.id })
  await f.policy({ kind: 'global' }, { autoEnabled: true, timezone: 'UTC', scheduleHour: 0, scheduleMinute: 0 })
  await f.policy({ kind: 'session', targetId: child.id }, { autoEnabled: false })
  await f.scheduler.check(f.now)
  const initial = await f.storage.call('chatDatabaseTaskRead', { kind: 'global' })
  expect(initial).not.toBeNull()
  if (!initial) throw new Error('Missing task cursor')
  await f.storage.call('chatDatabaseTaskSave', { ...initial, baselineAt: f.now - 10 * 86_400_000 })
  await f.scheduler.check(f.now)
  const task = await f.scheduler.get({ kind: 'global' })
  expect(task.operation?.trigger).toBe('schedule')
  if (!task.operation) throw new Error('Missing operation')
  const done = await settled(f.service, task.operation.operationId)
  expect(done).toMatchObject({ status: 'completed', deletedCount: 1 })
  expect(done.skipped).toContainEqual({ code: 'autoDisabled', count: 1 })
  expect(done.skipped).toContainEqual({ code: 'retainedChild', count: 1 })
  expect(f.deleted).toEqual([eligible.id])
  await f.scheduler.close()
  const restart = createChatDatabaseScheduler(f.storage, f.settings, f.statistics, f.service, {
    start: false,
    now: () => f.now,
  })
  try {
    await restart.check(f.now + 60_000)
    expect((await f.service.history({ scope: { kind: 'global' } })).items).toHaveLength(1)
    await restart.check(f.now + 8 * 86_400_000)
    const next = await restart.get({ kind: 'global' })
    if (!next.operation) throw new Error('Missing catch-up operation')
    expect(next.operation.operationId).not.toBe(task.operation.operationId)
    expect((await settled(f.service, next.operation.operationId)).status).toBe('completed')
    await restart.check(f.now + 8 * 86_400_000 + 60_000)
    expect((await f.service.history({ scope: { kind: 'global' } })).items).toHaveLength(2)
    expect(await f.storage.call('findSession', child.id)).not.toBeNull()
    expect(await f.storage.call('findSession', parent.id)).not.toBeNull()
  } finally {
    await restart.close()
  }
})

test('capacity fixes an oldest-ready-leaf subset and never expands it when SQLite remains above target', async () => {
  const f = await fixture()
  const parent = await f.old('old parent', 300)
  const child = await f.old('newer leaf', 120, { parentId: parent.id })
  const oldestLeaf = await f.old('oldest ready leaf', 200)
  await f.policy({ kind: 'global' }, { autoEnabled: true, capacityEnabled: true })
  const accepted = await f.service.automatic(
    { scope: { kind: 'global' }, trigger: 'capacity', totalBytes: 100, targetBytes: 99 },
    { actorId: 'host', idempotencyKey: 'fixed-small-budget' },
  )
  const done = await settled(f.service, accepted.operationId)
  expect(done).toMatchObject({
    status: 'completed',
    deletedCount: 1,
    candidateCount: 1,
    totalCount: 1,
    processedCount: 1,
  })
  expect(f.deleted).toEqual([oldestLeaf.id])
  expect(done.skipped).toContainEqual({ code: 'capacityTarget', count: 2 })
  expect(done.skipped).toContainEqual({ code: 'capacityUnreachable', count: 1 })
  expect(await f.storage.call('findSession', parent.id)).not.toBeNull()
  expect(await f.storage.call('findSession', child.id)).not.toBeNull()
  expect(
    await f.service.automatic(
      { scope: { kind: 'global' }, trigger: 'capacity', totalBytes: 100, targetBytes: 99 },
      { actorId: 'host', idempotencyKey: 'fixed-small-budget' },
    ),
  ).toEqual(done)
})

test('capacity first bypasses retention only where saved rules allow it and still obeys archive and live protection', async () => {
  const f = await fixture()
  const recent = await f.old('recent', 1)
  const retained = await f.old('retained', 1)
  const live = await f.old('active', 150)
  await f.old('not archived', 150, { archived: false })
  f.active.add(live.id)
  await f.policy({ kind: 'global' }, { autoEnabled: true, capacityEnabled: true, capacityFirst: true })
  await f.policy({ kind: 'session', targetId: retained.id }, { capacityFirst: false })
  const accepted = await f.service.automatic(
    { scope: { kind: 'global' }, trigger: 'capacity', totalBytes: 100_000, targetBytes: 0 },
    { actorId: 'host', idempotencyKey: 'priority' },
  )
  const done = await settled(f.service, accepted.operationId)
  expect(done.status).toBe('completed')
  expect(f.deleted).toEqual([recent.id])
  for (const code of ['retention', 'active', 'notArchived'])
    expect(done.skipped.find((skip) => skip.code === code)?.count).toBe(1)
})

test('capacity task uses complete attributable bytes, stops at 90 percent and suppresses unchanged physical-file retries', async () => {
  const f = await fixture()
  const oldest = await f.old('first', 200, { text: 'x'.repeat(400 * 1024) })
  await f.old('second', 180, { text: 'y'.repeat(400 * 1024) })
  await f.old('third', 160, { text: 'z'.repeat(400 * 1024) })
  const scope: ChatDatabaseScope = { kind: 'workspace', targetId: f.workspace.id }
  await f.policy(scope, { autoEnabled: true, scheduleEnabled: false, capacityEnabled: true, capacityLimitMiB: 1 })
  await f.scheduler.check(f.now)
  const task = await f.scheduler.get(scope)
  if (!task.operation) throw new Error('Missing quota operation')
  const done = await settled(f.service, task.operation.operationId)
  expect(done).toMatchObject({ status: 'completed', trigger: 'capacity', targetBytes: Math.floor(1_048_576 * 0.9) })
  expect(f.deleted[0]).toBe(oldest.id)
  expect(done.remainingBytes).toBeLessThanOrEqual(Math.floor(1_048_576 * 0.9))
  await f.scheduler.check(f.now + 60_000)
  await f.scheduler.check(f.now + 120_000)
  expect((await f.service.history({ scope })).items).toHaveLength(1)
  const report = await f.statistics.readComplete(scope)
  expect(
    chatDatabaseCapacitySignature(
      {
        ...report,
        disk: {
          ...report.disk,
          walBytes: report.disk.walBytes + 100_000,
          databaseBytes: report.disk.databaseBytes + 100_000,
          logBytes: report.disk.logBytes + 100_000,
        },
      },
      f.now,
    ),
  ).toBe(chatDatabaseCapacitySignature(report, f.now))
})

test('weekly IANA schedules follow DST and latest-due coalescing across the skipped spring hour', () => {
  const schedule = {
    spec: { kind: 'weekly' as const, hour: 2, minute: 30, weekdays: [0] },
    timezone: 'America/Los_Angeles',
  }
  const occurrences = previewSchedule(schedule, Date.parse('2026-03-07T00:00:00Z'))
  expect(occurrences[0]).toBe(Date.parse('2026-03-08T10:30:00Z'))
  expect(occurrences[1]).toBe(Date.parse('2026-03-15T09:30:00Z'))
  expect(
    latestDueSchedule({ ...schedule, from: Date.parse('2026-03-01T00:00:00Z') }, Date.parse('2026-03-20T00:00:00Z')),
  ).toBe(Date.parse('2026-03-15T09:30:00Z'))
})

test('a lost deletion acknowledgment resumes the original capacity subset and its receipt without adding another chat', async () => {
  let loseAck = true
  const f = await fixture({
    afterDelete() {
      if (loseAck) {
        loseAck = false
        throw new Error('lost acknowledged deletion')
      }
    },
  })
  const oldest = await f.old('oldest', 200)
  const retained = await f.old('outside budget', 180)
  await f.policy({ kind: 'global' }, { autoEnabled: true, capacityEnabled: true })
  const operation = await f.service.automatic(
    { scope: { kind: 'global' }, trigger: 'capacity', totalBytes: 100, targetBytes: 99 },
    { actorId: 'host', idempotencyKey: 'lost-ack' },
  )
  expect((await settled(f.service, operation.operationId)).status).toBe('unknown')
  expect(await f.storage.call('findSession', oldest.id)).toBeNull()
  await f.service.reconcile(operation.operationId, { actorId: 'device', idempotencyKey: 'reconcile-original' })
  expect(await settled(f.service, operation.operationId)).toMatchObject({
    status: 'completed',
    deletedCount: 1,
    processedCount: 1,
  })
  expect(await f.storage.call('findSession', retained.id)).not.toBeNull()
})

test('unchanged global physical usage does not repeatedly delete history, and a saved capacity change permits a new attempt', async () => {
  const f = await fixture()
  const active = await f.old('temporarily protected', 200)
  f.active.add(active.id)
  await f.policy(
    { kind: 'global' },
    { autoEnabled: true, scheduleEnabled: false, capacityEnabled: true, capacityLimitMiB: 1 },
  )
  await f.scheduler.check(f.now)
  const first = await f.scheduler.get({ kind: 'global' })
  if (!first.operation) throw new Error('Missing initial global quota job')
  expect((await settled(f.service, first.operation.operationId)).skipped).toContainEqual({
    code: 'capacityUnreachable',
    count: 1,
  })
  await f.scheduler.check(f.now + 60_000)
  await f.scheduler.check(f.now + 120_000)
  expect((await f.service.history({ scope: { kind: 'global' } })).items).toHaveLength(1)
  // Policy edits must not reuse a suppression signature from the old saved rules.
  f.active.clear()
  await f.policy({ kind: 'global' }, { retentionDays: 80 })
  await f.scheduler.check(f.now + 180_000)
  const changed = await f.scheduler.get({ kind: 'global' })
  if (!changed.operation) throw new Error('Missing changed quota job')
  expect(changed.operation.operationId).not.toBe(first.operation.operationId)
  expect(await settled(f.service, changed.operation.operationId)).toMatchObject({
    status: 'completed',
    deletedCount: 1,
  })
})

test('automatic acceptance and its task cursor commit atomically before deletion can start', async () => {
  const f = await fixture()
  const chat = await f.old('atomic acceptance')
  await f.policy({ kind: 'global' }, { autoEnabled: true, capacityEnabled: true })
  await f.scheduler.check(f.now)
  const state = await f.storage.call('chatDatabaseTaskRead', { kind: 'global' })
  if (!state) throw new Error('Missing task state')
  const db = new Database(f.layout.database, { strict: true })
  db.exec(
    "CREATE TRIGGER deny_automatic_cursor BEFORE UPDATE ON chat_database_schedule_runtime BEGIN SELECT RAISE(ABORT,'cursor cannot commit'); END;",
  )
  try {
    const failure = await f.service
      .automatic(
        { scope: { kind: 'global' }, trigger: 'capacity', totalBytes: 100, targetBytes: 99 },
        { actorId: 'host', idempotencyKey: 'atomic-accept' },
        state,
      )
      .then(
        () => null,
        (reason: unknown) => reason,
      )
    expect(failure).toBeInstanceOf(Error)
    expect((await f.service.history({ scope: { kind: 'global' } })).items).toHaveLength(0)
    expect(await f.storage.call('chatDatabasePending')).toBeNull()
    expect(await f.storage.call('findSession', chat.id)).not.toBeNull()
    db.exec('DROP TRIGGER deny_automatic_cursor')
    const accepted = await f.service.automatic(
      { scope: { kind: 'global' }, trigger: 'capacity', totalBytes: 100, targetBytes: 99 },
      { actorId: 'host', idempotencyKey: 'atomic-accept' },
      state,
    )
    expect((await f.storage.call('chatDatabaseTaskRead', { kind: 'global' }))?.lastOperationId).toBe(
      accepted.operationId,
    )
    expect(await settled(f.service, accepted.operationId)).toMatchObject({ status: 'completed', deletedCount: 1 })
  } finally {
    db.close()
  }
})

test('automatic storage selection prioritizes clearable cache and orphan attachments before chats', async () => {
  const f = await fixture()
  const session = await f.old('history')
  await f.policy({ kind: 'global' }, { autoEnabled: true, capacityEnabled: true })
  const accepted = await f.service.preview(
    { scope: { kind: 'global' }, kind: 'sessions' },
    { actorId: 'device', idempotencyKey: 'order-preview' },
  )
  await settled(f.service, accepted.operationId)
  const item: ChatDatabasePreviewItem = {
    kind: 'cache',
    id: 'cache-item',
    title: 'cache',
    workspaceId: null,
    expectedSeq: null,
    lastActivityAt: f.now,
    estimatedBytes: 10,
    depth: 0,
    policyRevisions: {},
    eligible: true,
    skipReason: null,
  }
  await f.storage.call('chatDatabasePreviewAppend', accepted.operationId, [
    { ...item, kind: 'attachments', id: 'orphan' },
    item,
  ])
  const selected = await f.storage.call('chatDatabaseAutomaticPlanStep', accepted.operationId, 15)
  expect(selected).toMatchObject({ plannedBytes: 20, selectedCount: 2, complete: true })
  const page = await f.storage.call('chatDatabaseAutomaticPlanPage', accepted.operationId, null, 50)
  expect(page.items.map((row) => row.kind)).toEqual(['cache', 'attachments'])
  expect(await f.storage.call('findSession', session.id)).not.toBeNull()
})
