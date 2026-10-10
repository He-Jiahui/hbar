import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import type { DiagnosticEvent } from '@hbar/contracts'
import { DiagnosticJournal } from '@hbar/kernel/diagnostics'

const roots: string[] = []

afterEach(async () => {
  const temporary = await realpath(tmpdir())
  while (roots.length) {
    const root = roots.pop()
    if (root === undefined) break
    const owned = await realpath(root)
    if (dirname(owned) !== temporary || !basename(owned).startsWith('hbar-diagnostic-journal-'))
      throw new Error('unexpected test root')
    await rm(root, { recursive: true, force: true })
  }
})

function event(overrides: Partial<DiagnosticEvent> = {}): DiagnosticEvent {
  return {
    schemaVersion: 1,
    time: 1,
    monotonicMs: 2,
    component: 'storage',
    level: 'info',
    event: 'storage.request.completed',
    outcome: 'success',
    method: 'sessionSummary',
    ...overrides,
  }
}

async function root() {
  const value = await mkdtemp(join(tmpdir(), 'hbar-diagnostic-journal-'))
  roots.push(value)
  return value
}

test('keeps a bounded redacted ring and writes asynchronously', async () => {
  const journal = new DiagnosticJournal({ root: await root(), enabled: true, ringEntries: 2, queueEntries: 8 })
  journal.emit(event({ requestId: 'request-1' }))
  journal.emit(event({ requestId: 'request-2' }))
  journal.emit(event({ requestId: 'request-3' }))
  const snapshot = await journal.close()
  expect(snapshot.ringEntries).toBe(2)
  expect(journal.recent().map((item) => item.requestId)).toEqual(['request-2', 'request-3'])
  expect(snapshot.dropped).toBe(0)
  const text = await readFile(journal.filePath, 'utf8')
  expect(text.split('\n').filter(Boolean)).toHaveLength(3)
  expect(text).not.toContain('token')
  expect(text).not.toContain('payload')
})

test('retains failures when normal coverage is disabled and counts queue overflow', async () => {
  const journal = new DiagnosticJournal({ root: await root(), enabled: false, queueEntries: 1 })
  journal.emit(event({ event: 'storage.request.completed', level: 'info' }))
  journal.emit(event({ event: 'storage.worker_error', level: 'error', errorCode: 'STORAGE_WORKER_FAILED' }))
  journal.emit(event({ event: 'storage.worker_exit', level: 'error', errorCode: 'STORAGE_WORKER_EXITED' }))
  const snapshot = await journal.close()
  expect(snapshot.ringEntries).toBe(2)
  expect(snapshot.dropped).toBeGreaterThanOrEqual(1)
  expect(snapshot.writeFailures).toBe(0)
})

test('writes warning, slow and fixed lifecycle facts while filtering fast success info', async () => {
  const journal = new DiagnosticJournal({ root: await root(), enabled: false, queueEntries: 8 })
  journal.emit(event({ event: 'storage.request.completed', level: 'info' }))
  journal.emit(event({ event: 'rpc.completed', level: 'info', durationMs: 125 }))
  journal.emit(event({ event: 'run.cancelled', component: 'kernel', level: 'warn', outcome: 'skipped' }))
  journal.emit(event({ event: 'sqlite.configured', component: 'sqlite', level: 'info', workerState: 'ready' }))
  const snapshot = await journal.close()
  const lines = (await readFile(journal.filePath, 'utf8')).trim().split('\n').filter(Boolean)
  expect(snapshot.dropped).toBe(0)
  expect(lines).toHaveLength(3)
  expect(lines.join('\n')).toContain('rpc.completed')
  expect(lines.join('\n')).toContain('sqlite.configured')
  expect(lines.join('\n')).toContain('run.cancelled')
  expect(lines.join('\n')).not.toContain('storage.request.completed')
})

test('rolls files at the configured bound and limits retained generations', async () => {
  const rootPath = await root()
  const journal = new DiagnosticJournal({ root: rootPath, enabled: true, maxBytes: 512, retention: 2 })
  for (let index = 0; index < 12; index++) journal.emit(event({ requestId: `request-${index}` }))
  await journal.close()
  const files = await readdir(rootPath)
  expect(files.filter((name) => name.startsWith('hbar-diagnostics.jsonl'))).toHaveLength(3)
  for (const file of files.filter((name) => name.startsWith('hbar-diagnostics.jsonl')))
    expect((await Bun.file(join(rootPath, file)).size).valueOf()).toBeLessThanOrEqual(512)
})

test('rejects extra fields without throwing into the caller', async () => {
  const journal = new DiagnosticJournal({ root: await root(), enabled: true })
  const unsafe = { ...event(), apiKey: 'secret' }
  journal.emit(unsafe)
  const invalidVersion = event()
  Reflect.set(invalidVersion, 'schemaVersion', 2)
  journal.emit(invalidVersion)
  const snapshot = await journal.close()
  expect(snapshot.invalid).toBe(2)
  expect(snapshot.dropped).toBe(2)
})

test('contains throwing getters and repeated close calls without changing counters', async () => {
  const journal = new DiagnosticJournal({ root: await root(), enabled: true })
  const getterEvent = event()
  Object.defineProperty(getterEvent, 'method', {
    enumerable: true,
    configurable: true,
    get: () => {
      throw new Error('method getter')
    },
  })
  expect(() => journal.emit(getterEvent)).not.toThrow()
  const first = await journal.close()
  const second = await journal.close()
  expect(first.dropped).toBe(1)
  expect(second.dropped).toBe(first.dropped)
})

test('contains filesystem failures without throwing into emit or close', async () => {
  const rootPath = await root()
  const occupied = join(rootPath, 'occupied')
  await Bun.write(occupied, 'file')
  const journal = new DiagnosticJournal({ root: occupied, enabled: true })
  expect(() => journal.emit(event({ level: 'error', errorCode: 'STORAGE_ERROR' }))).not.toThrow()
  const snapshot = await journal.close()
  expect(snapshot.writeFailures).toBe(1)
  expect(snapshot.dropped).toBeGreaterThanOrEqual(1)
})

test('rejects path traversal in the journal file name', async () => {
  const rootPath = await root()
  expect(() => new DiagnosticJournal({ root: rootPath, fileName: '../outside.jsonl' })).toThrow()
})
