import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Storage } from '@hbar/storage'
import type { ScheduleCreateInput } from '@hbar/contracts/commands/schedules'
import { createScheduleStorage } from '../packages/storage/src/schedules'
import { removeOwnedTestDirectory } from './owned-temp-directory'

const input = (workspaceId: string): ScheduleCreateInput => ({
  workspaceId,
  name: 'Original schedule',
  input: 'The original authorized task',
  modelId: 'original-model',
  timezone: 'UTC',
  target: { mode: 'new-session' },
  spec: { kind: 'once', at: Date.now() + 60_000 },
})
function fixture() {
  const db = new Database(':memory:')
  db.exec(
    "PRAGMA foreign_keys=ON; CREATE TABLE workspaces(id TEXT PRIMARY KEY); INSERT INTO workspaces VALUES('workspace')",
  )
  return { db, storage: createScheduleStorage(db) }
}

test('each occurrence pins the actual authorizer and immutable revision, including later edits by another actor', () => {
  const f = fixture()
  try {
    const originalInput = input('workspace')
    const original = f.storage.create(originalInput, { actorId: 'creator', idempotencyKey: 'create' })
    const first = f.storage.claim(original.id, 100, 100)
    if (!first) throw new Error('Missing original occurrence')
    expect(f.storage.execution(first.id)).toMatchObject({
      authorization: { actorId: 'creator', commandId: 'schedule.create', idempotencyKey: 'create' },
      schedule: original,
    })
    const edited = f.storage.update(
      {
        ...originalInput,
        scheduleId: original.id,
        expectedRevision: original.revision,
        input: 'The explicitly edited task',
        modelId: 'edited-model',
      },
      { actorId: 'editor', idempotencyKey: 'edit' },
    )
    expect(f.storage.execution(first.id)?.schedule).toEqual(original)
    expect(f.storage.claim(original.id, 100, 200)?.id).toBe(first.id)
    f.storage.transition(first.id, 'completed', 'original-run')
    const second = f.storage.claim(original.id, 200, 200)
    if (!second) throw new Error('Missing edited occurrence')
    expect(f.storage.execution(second.id)).toMatchObject({
      authorization: { actorId: 'editor', commandId: 'schedule.update' },
      schedule: edited,
    })
    expect(f.storage.execution(first.id)?.authorization.actorId).toBe('creator')
  } finally {
    f.db.close()
  }
})

test('an unattributed revision cannot borrow a previous or subsequent management identity', () => {
  const f = fixture()
  try {
    const originalInput = input('workspace')
    const original = f.storage.create(originalInput)
    const first = f.storage.claim(original.id, 100, 100)
    if (!first) throw new Error('Missing unattributed occurrence')
    expect(f.storage.execution(first.id)).toBeNull()
    const edited = f.storage.update(
      { ...originalInput, scheduleId: original.id, expectedRevision: original.revision },
      { actorId: 'editor', idempotencyKey: 'edit' },
    )
    expect(f.storage.execution(first.id)).toBeNull()
    f.storage.transition(first.id, 'failed')
    const second = f.storage.claim(original.id, 200, 200)
    if (!second) throw new Error('Missing authorized occurrence')
    expect(f.storage.execution(second.id)?.authorization.actorId).toBe('editor')
    f.storage.transition(second.id, 'completed')
    f.storage.update({
      ...originalInput,
      scheduleId: original.id,
      expectedRevision: edited.revision,
      input: 'Unattributed update',
    })
    const third = f.storage.claim(original.id, 300, 300)
    if (!third) throw new Error('Missing unattributed update')
    expect(f.storage.execution(third.id)).toBeNull()
  } finally {
    f.db.close()
  }
})

test('ambiguous or changed original receipts are rejected without publishing an occurrence', () => {
  const f = fixture()
  try {
    const original = f.storage.create(input('workspace'), { actorId: 'creator', idempotencyKey: 'create' })
    f.db
      .query('INSERT INTO entity_command_receipts VALUES(?,?,?,?,?)')
      .run('different-actor', 'conflicting-key', 'schedule.create', 'injected', JSON.stringify(original))
    expect(() => f.storage.claim(original.id, 100, 100)).toThrow('ambiguous authorization')
    expect(f.storage.occurrences(original.id, null, 10).items).toEqual([])
    f.db.query('DELETE FROM entity_command_receipts WHERE actorId=?').run('different-actor')
    f.db
      .query('UPDATE schedules SET data=? WHERE id=?')
      .run(JSON.stringify({ ...original, input: 'Changed projection' }), original.id)
    expect(() => f.storage.claim(original.id, 100, 100)).toThrow('differs from its original management receipt')
    expect(f.storage.scheduleRuntime(original.id)).toBeNull()
  } finally {
    f.db.close()
  }
})

test('a frozen execution detects receipt mutation and follows occurrence deletion', () => {
  const f = fixture()
  try {
    const original = f.storage.create(input('workspace'), { actorId: 'creator', idempotencyKey: 'create' })
    const occurrence = f.storage.claim(original.id, 100, 100)
    if (!occurrence) throw new Error('Missing original occurrence')
    f.db
      .query('UPDATE entity_command_receipts SET resultJson=?')
      .run(JSON.stringify({ ...original, input: 'Changed immutable receipt' }))
    expect(() => f.storage.execution(occurrence.id)).toThrow('differs from its receipt')
    f.db.query('DELETE FROM schedule_occurrences WHERE id=?').run(occurrence.id)
    expect(f.storage.execution(occurrence.id)).toBeNull()
  } finally {
    f.db.close()
  }
})

test('real Worker freezes schedule execution provenance across restart and a later definition edit', async () => {
  const prefix = 'hbar-schedule-principal-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const path = join(root, 'state.sqlite')
  let storage = new Storage(path)
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'Original workspace')
    const originalInput = input(workspace.id)
    const original = await storage.call('createSchedule', originalInput, {
      actorId: 'creator',
      idempotencyKey: 'create',
    })
    const occurrence = await storage.call('claimScheduleOccurrence', original.id, 100, 100)
    if (!occurrence) throw new Error('Missing Worker occurrence')
    const frozen = await storage.call('scheduleExecution', occurrence.id)
    expect(frozen).toMatchObject({ authorization: { actorId: 'creator' }, schedule: original })
    await storage.call(
      'updateSchedule',
      { ...originalInput, scheduleId: original.id, expectedRevision: original.revision, input: 'A later task' },
      { actorId: 'editor', idempotencyKey: 'edit' },
    )
    await storage.close()
    storage = new Storage(path)
    await storage.call('ready')
    expect(await storage.call('scheduleExecution', occurrence.id)).toEqual(frozen)
    expect((await storage.call('schedule', original.id))?.input).toBe('A later task')
    expect((await storage.call('claimScheduleOccurrence', original.id, 100, 200))?.id).toBe(occurrence.id)
    expect(await storage.call('scheduleExecution', occurrence.id)).toEqual(frozen)
  } finally {
    await storage.close()
    await removeOwnedTestDirectory(root, prefix)
  }
})
