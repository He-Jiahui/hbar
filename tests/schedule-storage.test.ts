import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'
import { createScheduleStorage } from '../packages/storage/src/schedules'
import type { ScheduleDefinition } from '@hbar/contracts/commands/schedules'
import { HbarError } from '@hbar/contracts'

const schedule = (id: string, enabled = true): ScheduleDefinition => ({ id, workspaceId: 'w', name: id, input: 'x', modelId: 'm', timezone: 'UTC', target: { mode: 'new-session' }, spec: { kind: 'once', at: 10_000 }, enabled, revision: 0, createdAt: 1, updatedAt: 1 })
function fixture() { const db = new Database(':memory:'); db.exec('PRAGMA foreign_keys=ON; CREATE TABLE workspaces(id TEXT PRIMARY KEY); INSERT INTO workspaces VALUES (\'w\')'); const storage = createScheduleStorage(db); for (const value of [schedule('a'), schedule('b', false), schedule('c')]) db.query('INSERT INTO schedules VALUES(?,?,?,?,?,?)').run(value.id, value.workspaceId, JSON.stringify(value), 0, 1, 1); return { db, storage } }
describe('schedule storage recovery', () => {
  test('create update delete receipts replay by key and reject payload conflicts across reopen', () => {
    const root = mkdtempSync(join(tmpdir(), 'hbar-schedule-receipts-'))
    const path = join(root, 'receipts.sqlite')
    const input = { workspaceId: 'w', name: 'receipt', input: 'x', modelId: 'm', timezone: 'UTC', target: { mode: 'new-session' as const }, spec: { kind: 'once' as const, at: 4_102_444_800_000 } }
    try {
      const db = new Database(path)
      db.exec("PRAGMA foreign_keys=ON; CREATE TABLE workspaces(id TEXT PRIMARY KEY); INSERT INTO workspaces VALUES ('w')")
      const storage = createScheduleStorage(db)
      const createKey = { actorId: 'scheduler', idempotencyKey: 'create-key' }
      const created = storage.create(input, createKey)
      expect(storage.create(input, createKey)).toEqual(created)
      expect(() => storage.create({ ...input, name: 'changed' }, createKey)).toThrow(HbarError)
      const updatedInput = { ...input, scheduleId: created.id, expectedRevision: 0, name: 'updated' }
      const updateKey = { actorId: 'scheduler', idempotencyKey: 'update-key' }
      const updated = storage.update(updatedInput, updateKey)
      expect(storage.update(updatedInput, updateKey)).toEqual(updated)
      expect(() => storage.update({ ...updatedInput, name: 'conflict' }, updateKey)).toThrow(HbarError)
      const deleteKey = { actorId: 'scheduler', idempotencyKey: 'delete-key' }
      const deleted = storage.delete(created.id, updated.revision, deleteKey)
      db.close()
      const reopened = new Database(path)
      const next = createScheduleStorage(reopened)
      expect(next.delete(created.id, updated.revision, deleteKey)).toEqual(deleted)
      expect(next.get(created.id)).toBeNull()
      reopened.close()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  test('enabled schedules are paged with stable id cursor', () => { const { db, storage } = fixture(); try { expect(storage.enabledSchedules(null, 1).items.map((x) => x.id)).toEqual(['a']); expect(storage.enabledSchedules('a', 10).items.map((x) => x.id)).toEqual(['c']) } finally { db.close() } })
  test('claim is idempotent by stable occurrence key and runtime coalesces newest', () => { const { db, storage } = fixture(); try { const first = storage.claim('a', 100, 200); const again = storage.claim('a', 100, 201); expect(again?.id).toBe(first?.id); storage.recordCandidate('a', 90, 210); storage.recordCandidate('a', 120, 211); expect(storage.scheduleRuntime('a')?.pendingDueAt).toBe(120) } finally { db.close() } })
  test('runtime and occurrence survive reopening database', () => { const root = mkdtempSync(join(tmpdir(), 'hbar-schedule-')); const path = join(root, 'schedule.sqlite'); try { const db = new Database(path); db.exec('PRAGMA foreign_keys=ON; CREATE TABLE workspaces(id TEXT PRIMARY KEY); INSERT INTO workspaces VALUES (\'w\')'); const storage = createScheduleStorage(db); const value = schedule('persist'); db.query('INSERT OR REPLACE INTO schedules VALUES(?,?,?,?,?,?)').run(value.id, value.workspaceId, JSON.stringify(value), 0, 1, 1); storage.recordCandidate(value.id, 50, 60); db.close(); const reopened = new Database(path); const next = createScheduleStorage(reopened); expect(next.scheduleRuntime(value.id)?.pendingDueAt).toBe(50); reopened.close() } finally { rmSync(root, { recursive: true, force: true }) } })
})
