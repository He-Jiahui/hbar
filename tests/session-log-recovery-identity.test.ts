import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import { appendFile, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { Storage, createPathLayout, ensurePathLayout, visitSessionLogs, type RecoveredLogEvent } from '@hbar/storage'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) {
    const absolute = await realpath(root)
    const local = relative(await realpath(tmpdir()), absolute)
    if (!local || isAbsolute(local) || local.startsWith('..') || !local.startsWith('hbar-recovery-identity-'))
      throw new Error('Recovery fixture cleanup ownership mismatch')
    await rm(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-recovery-identity-'))
  roots.push(root)
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'system/paths.json'))
  await ensurePathLayout(layout)
  const storage = new Storage(layout.database, layout)
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'recovery identity fixture')
    const first = await storage.call('createSession', workspace.id, 'first')
    const second = await storage.call('createSession', workspace.id, 'second')
    for (const session of [first, second]) {
      await storage.call('append', session.id, 'diagnostic.note', { marker: 'first' })
      await storage.call('append', session.id, 'diagnostic.note', { marker: 'second' })
    }
    return {
      layout,
      first,
      second,
      firstEvents: await storage.call('events', first.id, 0),
      secondEvents: await storage.call('events', second.id, 0),
    }
  } finally {
    await storage.close()
  }
}
function records(root: string): RecoveredLogEvent[] {
  const result: RecoveredLogEvent[] = []
  visitSessionLogs(root, new Set(), (record) => result.push(record))
  return result
}
function removeProjection(database: Database, eventId: string) {
  database.query('DELETE FROM session_event_index WHERE eventId=?').run(eventId)
  database.query('DELETE FROM events WHERE eventId=?').run(eventId)
}

test('duplicate Session sequence with another event ID fails before restoring or truncating logs', async () => {
  const f = await fixture()
  const source = records(f.layout.sessions).find((record) => record.event.sessionId === f.first.id)
  if (!source) throw new Error('Expected a canonical fixture event')
  const database = new Database(f.layout.database, { strict: true })
  try {
    removeProjection(database, source.event.eventId)
  } finally {
    database.close()
  }
  const log = join(f.layout.sessions, source.relativePath)
  const tail = '{"unfinished":'
  await appendFile(log, JSON.stringify({ ...source.event, eventId: randomUUID() }) + '\n' + tail)
  const before = await readFile(log)
  const storage = new Storage(f.layout.database, f.layout)
  try {
    await expect(storage.call('ready')).rejects.toThrow('SESSION_LOG_CORRUPTED')
  } finally {
    await storage.close()
  }
  expect(await readFile(log)).toEqual(before)
  const after = new Database(f.layout.database, { readonly: true, strict: true })
  try {
    expect(after.query('SELECT eventId FROM session_event_index WHERE eventId=?').get(source.event.eventId)).toBeNull()
    expect(after.query('SELECT eventId FROM events WHERE eventId=?').get(source.event.eventId)).toBeNull()
  } finally {
    after.close()
  }
})

test('an index row with the wrong event ID at the same Session sequence fails before any repair', async () => {
  const f = await fixture()
  const canonical = records(f.layout.sessions).filter((record) => record.event.sessionId === f.first.id)
  const indexed = canonical[0]
  const missing = canonical.at(-1)
  if (!indexed || !missing || indexed.event.eventId === missing.event.eventId)
    throw new Error('Expected two canonical events')
  const changedId = randomUUID()
  const database = new Database(f.layout.database, { strict: true })
  try {
    database.query('UPDATE session_event_index SET eventId=? WHERE eventId=?').run(changedId, indexed.event.eventId)
    removeProjection(database, missing.event.eventId)
  } finally {
    database.close()
  }
  const log = join(f.layout.sessions, missing.relativePath)
  await appendFile(log, '{"unfinished":')
  const before = await readFile(log)
  const storage = new Storage(f.layout.database, f.layout)
  try {
    await expect(storage.call('ready')).rejects.toThrow('SESSION_LOG_CORRUPTED')
  } finally {
    await storage.close()
  }
  expect(await readFile(log)).toEqual(before)
  const after = new Database(f.layout.database, { readonly: true, strict: true })
  try {
    expect(after.query('SELECT eventId FROM session_event_index WHERE eventId=?').get(changedId)).not.toBeNull()
    expect(after.query('SELECT eventId FROM session_event_index WHERE eventId=?').get(missing.event.eventId)).toBeNull()
    expect(after.query('SELECT eventId FROM events WHERE eventId=?').get(missing.event.eventId)).toBeNull()
  } finally {
    after.close()
  }
})

test('equal sequence numbers in different Sessions remain distinct and missing projections restore completely', async () => {
  const f = await fixture()
  const first = f.firstEvents.at(-1)
  const second = f.secondEvents.at(-1)
  if (!first || !second) throw new Error('Expected events in both Sessions')
  expect(first.seq).toBe(second.seq)
  expect(first.eventId).not.toBe(second.eventId)
  const database = new Database(f.layout.database, { strict: true })
  try {
    removeProjection(database, first.eventId)
    removeProjection(database, second.eventId)
  } finally {
    database.close()
  }
  const storage = new Storage(f.layout.database, f.layout)
  try {
    await storage.call('ready')
    expect(await storage.call('events', f.first.id, 0)).toEqual(f.firstEvents)
    expect(await storage.call('events', f.second.id, 0)).toEqual(f.secondEvents)
  } finally {
    await storage.close()
  }
})

test('a NULL indexed event ID fails before truncating a tail or restoring any projection', async () => {
  const f = await fixture()
  const canonical = records(f.layout.sessions).filter((record) => record.event.sessionId === f.first.id)
  const indexed = canonical[0]
  const missing = canonical.at(-1)
  if (!indexed || !missing || indexed.event.eventId === missing.event.eventId)
    throw new Error('Expected two canonical events')
  const database = new Database(f.layout.database, { strict: true })
  try {
    database.query('UPDATE session_event_index SET eventId=NULL WHERE eventId=?').run(indexed.event.eventId)
    removeProjection(database, missing.event.eventId)
  } finally {
    database.close()
  }
  const log = join(f.layout.sessions, missing.relativePath)
  await appendFile(log, '{"unfinished":')
  const before = await readFile(log)
  const storage = new Storage(f.layout.database, f.layout)
  try {
    await expect(storage.call('ready')).rejects.toThrow('SESSION_LOG_CORRUPTED')
  } finally {
    await storage.close()
  }
  expect(await readFile(log)).toEqual(before)
  const after = new Database(f.layout.database, { readonly: true, strict: true })
  try {
    expect(after.query('SELECT 1 FROM session_event_index WHERE eventId IS NULL').get()).not.toBeNull()
    expect(after.query('SELECT eventId FROM session_event_index WHERE eventId=?').get(missing.event.eventId)).toBeNull()
    expect(after.query('SELECT eventId FROM events WHERE eventId=?').get(missing.event.eventId)).toBeNull()
  } finally {
    after.close()
  }
})
