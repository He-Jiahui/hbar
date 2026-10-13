import { afterEach, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_MAX_SESSION_LOG_RECORD_BYTES,
  SessionLogRecoveryError,
  Storage,
  createPathLayout,
  ensurePathLayout,
  truncateSessionLogTails,
  visitSessionLogs,
} from '@hbar/storage'

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

async function layoutFixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-streaming-log-recovery-'))
  roots.push(root)
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'system', 'paths.json'))
  await ensurePathLayout(layout)
  return { root, layout }
}

async function logFiles(root: string): Promise<string[]> {
  const output: string[] = []
  async function visit(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name)
      if (entry.isDirectory()) await visit(child)
      else if (entry.name.endsWith('.jsonl')) output.push(child)
    }
  }
  await visit(root)
  return output.sort()
}

async function writeLargeEventFile(path: string, firstSeq: number, count: number, text: string): Promise<void> {
  const stream = createWriteStream(path)
  const finished = once(stream, 'finish')
  for (let index = 0; index < count; index++) {
    const event = {
      eventId: `memory-check-${firstSeq + index}`,
      sessionId: 'memory-check-session',
      seq: firstSeq + index,
      runId: null,
      stepId: null,
      type: 'diagnostic.note',
      data: { text },
      time: 1,
      version: 1,
    }
    if (!stream.write(`${JSON.stringify(event)}\n`)) await once(stream, 'drain')
  }
  stream.end()
  await finished
}

test('storage recovery restores a missing SQLite event projection from canonical logs', async () => {
  const { root, layout } = await layoutFixture()
  let storage = new Storage(layout.database, layout)
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'streaming recovery fixture')
  const session = await storage.call('createSession', workspace.id, 'indexed recovery')
  await storage.call('append', session.id, 'diagnostic.note', { marker: 'restore-missing' })
  const expected = await storage.call('events', session.id, 0)
  await storage.close()

  const database = new Database(layout.database)
  const missing = database
    .query<{ eventId: string }, [string]>(
      'SELECT eventId FROM session_event_index WHERE sessionId=? ORDER BY seq DESC LIMIT 1',
    )
    .get(session.id)
  if (!missing) throw new Error('Fixture requires an indexed event')
  database.query('DELETE FROM session_event_index WHERE eventId=?').run(missing.eventId)
  database.query('DELETE FROM events WHERE eventId=?').run(missing.eventId)
  database.close()

  storage = new Storage(layout.database, layout)
  await storage.call('ready')
  expect(await storage.call('events', session.id, 0)).toEqual(expected)
  await storage.close()

  const repaired = new Database(layout.database)
  expect(
    repaired
      .query<{ eventId: string }, [string]>('SELECT eventId FROM session_event_index WHERE eventId=?')
      .get(missing.eventId),
  ).not.toBeNull()
  repaired.close()
})

test('recovery validates every existing index before restoring any missing event', async () => {
  const { root, layout } = await layoutFixture()
  let storage = new Storage(layout.database, layout)
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'index validation fixture')
  const session = await storage.call('createSession', workspace.id, 'conflicting index')
  await storage.call('append', session.id, 'diagnostic.note', { marker: 'keep-indexed' })
  await storage.call('append', session.id, 'diagnostic.note', { marker: 'restore-missing' })
  await storage.close()

  const database = new Database(layout.database)
  const rows = database
    .query<{ eventId: string }, [string]>('SELECT eventId FROM session_event_index WHERE sessionId=? ORDER BY seq')
    .all(session.id)
  const indexed = rows[0]
  const missing = rows.at(-1)
  if (!indexed || !missing || indexed.eventId === missing.eventId)
    throw new Error('Fixture requires two distinct events')
  database
    .query('UPDATE session_event_index SET contentHash=? WHERE eventId=?')
    .run('conflicting-hash', indexed.eventId)
  database.query('DELETE FROM session_event_index WHERE eventId=?').run(missing.eventId)
  database.query('DELETE FROM events WHERE eventId=?').run(missing.eventId)
  database.close()

  storage = new Storage(layout.database, layout)
  await expect(storage.call('ready')).rejects.toThrow('SESSION_LOG_CORRUPTED')
  await storage.close()

  const afterFailure = new Database(layout.database)
  expect(
    afterFailure
      .query<{ eventId: string }, [string]>('SELECT eventId FROM session_event_index WHERE eventId=?')
      .get(missing.eventId),
  ).toBeNull()
  expect(
    afterFailure
      .query<{ contentHash: string }, [string]>('SELECT contentHash FROM session_event_index WHERE eventId=?')
      .get(indexed.eventId)?.contentHash,
  ).toBe('conflicting-hash')
  expect(
    afterFailure
      .query<{ eventId: string }, [string]>('SELECT eventId FROM events WHERE eventId=?')
      .get(missing.eventId),
  ).toBeNull()
  afterFailure.close()
})

test('startup rejects duplicate event identities across log files before accepting any projection', async () => {
  const { root, layout } = await layoutFixture()
  let storage = new Storage(layout.database, layout)
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'duplicate log fixture')
  const session = await storage.call('createSession', workspace.id, 'duplicate event')
  await storage.call('append', session.id, 'diagnostic.note', { marker: 'duplicate' })
  await storage.close()

  const source = (await logFiles(layout.sessions))[0]
  if (!source) throw new Error('Expected one canonical log file')
  const duplicate = join(layout.sessions, 'duplicate-project', '2026', '10', '13', 'duplicate.jsonl')
  await mkdir(join(layout.sessions, 'duplicate-project', '2026', '10', '13'), { recursive: true })
  await Bun.write(duplicate, await readFile(source))
  storage = new Storage(layout.database, layout)
  await expect(storage.call('ready')).rejects.toThrow('SESSION_LOG_CORRUPTED')
  await storage.close()

  const database = new Database(layout.database)
  expect(
    database.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM session_event_index').get()?.count,
  ).toBeGreaterThan(0)
  database.close()
})

test('a complete malformed log prevents truncating an incomplete tail in another file', async () => {
  const { root, layout } = await layoutFixture()
  let storage = new Storage(layout.database, layout)
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'malformed log fixture')
  await storage.call('createSession', workspace.id, 'tail log')
  await storage.call('createSession', workspace.id, 'malformed log')
  const [tailLog, malformedLog] = await logFiles(layout.sessions)
  if (!tailLog || !malformedLog) throw new Error('Fixture requires two canonical log files')
  await storage.close()

  const tail = '{"eventId":"unfinished"'
  const malformed = '{"eventId":"complete-but-invalid"}\n'
  await appendFile(tailLog, tail)
  await appendFile(malformedLog, malformed)
  storage = new Storage(layout.database, layout)
  await expect(storage.call('ready')).rejects.toThrow('SESSION_LOG_CORRUPTED')
  await storage.close()
  expect((await readFile(tailLog, 'utf8')).endsWith(tail)).toBe(true)
})

test('a complete malformed record fails closed and an oversized record is not truncated', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-streaming-log-parser-'))
  roots.push(root)
  const malformed = join(root, 'malformed.jsonl')
  const malformedBytes = '{"eventId":"no-schema"}\n'
  await writeFile(malformed, malformedBytes)
  expect(() => visitSessionLogs(root, new Set(), () => undefined)).toThrow(
    expect.objectContaining({ code: 'SESSION_LOG_CORRUPTED' } satisfies Partial<SessionLogRecoveryError>),
  )
  expect(await readFile(malformed, 'utf8')).toBe(malformedBytes)

  await rm(malformed)
  const oversized = join(root, 'oversized.jsonl')
  const oversizedBytes = `${'x'.repeat(80)}\n`
  await writeFile(oversized, oversizedBytes)
  let visited = 0
  expect(() => visitSessionLogs(root, new Set(), () => visited++, { maxRecordBytes: 64 })).toThrow(
    expect.objectContaining({ code: 'SESSION_LOG_RECORD_TOO_LARGE' } satisfies Partial<SessionLogRecoveryError>),
  )
  expect(visited).toBe(0)
  expect(await readFile(oversized, 'utf8')).toBe(oversizedBytes)

  const oversizedTail = 'x'.repeat(80)
  await writeFile(oversized, oversizedTail)
  const tailScan = visitSessionLogs(root, new Set(), () => visited++, { maxRecordBytes: 64 })
  expect(tailScan.truncated).toHaveLength(1)
  expect(tailScan.truncated[0]?.offset).toBe(0)
  expect(await readFile(oversized, 'utf8')).toBe(oversizedTail)
  truncateSessionLogTails(tailScan.truncated)
  expect(await readFile(oversized, 'utf8')).toBe('')

  expect(DEFAULT_MAX_SESSION_LOG_RECORD_BYTES).toBe(64 * 1024 * 1024)
})

test('streaming log memory remains bounded when total payload grows beyond the record limit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-streaming-log-memory-'))
  roots.push(root)
  const text = 'x'.repeat(40 * 1024)
  const eventsPerFile = 512
  const fileCount = 4
  for (let fileIndex = 0; fileIndex < fileCount; fileIndex++) {
    const directory = join(root, `project-${fileIndex}`)
    await mkdir(directory, { recursive: true })
    await writeLargeEventFile(
      join(directory, `session-${fileIndex}.jsonl`),
      fileIndex * eventsPerFile + 1,
      eventsPerFile,
      text,
    )
  }

  Bun.gc(true)
  const heapBefore = process.memoryUsage().heapUsed
  const heapSamples: number[] = []
  let count = 0
  const scan = visitSessionLogs(root, new Set(), () => {
    count++
    if (count % 32 === 0) {
      Bun.gc(true)
      heapSamples.push(process.memoryUsage().heapUsed)
    }
  })
  const totalBytes = scan.files.reduce((total, file) => total + file.size, 0)
  const heapGrowth = Math.max(...heapSamples) - heapBefore
  expect(count).toBe(eventsPerFile * fileCount)
  expect(totalBytes).toBeGreaterThan(64 * 1024 * 1024)
  expect(heapGrowth).toBeLessThan(32 * 1024 * 1024)
}, 60_000)

test('incomplete final record is reported without truncating until validation is committed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-streaming-log-tail-'))
  roots.push(root)
  const log = join(root, 'tail.jsonl')
  const tail = '{"eventId":"unfinished"'
  const valid = JSON.stringify({
    eventId: 'valid-event',
    sessionId: 'valid-session',
    seq: 1,
    runId: null,
    stepId: null,
    type: 'diagnostic.note',
    data: {},
    time: 1,
    version: 1,
  })
  await appendFile(log, `${valid}\n${tail}`)
  const scan = visitSessionLogs(root, new Set(), () => undefined)
  expect(scan.truncated).toEqual([
    {
      path: log,
      relativePath: 'tail.jsonl',
      offset: Buffer.byteLength(`${valid}\n`),
      originalSize: Buffer.byteLength(`${valid}\n${tail}`),
    },
  ])
  expect(await readFile(log, 'utf8')).toBe(`${valid}\n${tail}`)
})
