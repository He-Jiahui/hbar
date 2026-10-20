import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { visitSessionLogs } from '@hbar/storage'
import { parallelVisitSessionLogs } from '../packages/storage/src/session-log-scan'
import type { MetadataRow } from '../packages/storage/src/session-log-scan-protocol'
function line(seq: number, text = '', sessionId = 'parallel-session') {
  return (
    JSON.stringify({
      eventId: sessionId + '-' + seq,
      sessionId,
      seq,
      runId: null,
      stepId: null,
      type: 'diagnostic.note',
      data: { text },
      time: 1,
      version: 1,
    }) + '\n'
  )
}
function fixture() {
  return mkdtempSync(join(tmpdir(), 'hbar-parallel-scan-fixture-'))
}
function clean(root: string) {
  const absolute = realpathSync(root)
  const local = relative(realpathSync(tmpdir()), absolute)
  if (!local || isAbsolute(local) || local.startsWith('..') || !local.startsWith('hbar-parallel-scan-fixture-'))
    throw new Error('Owned parallel fixture mismatch')
  rmSync(absolute, { recursive: true })
}
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')
function baseline(root: string, excluded: ReadonlySet<string> = new Set()) {
  const rows: MetadataRow[] = []
  const scan = visitSessionLogs(root, excluded, (r) =>
    rows.push({
      eventId: r.event.eventId,
      sessionId: r.event.sessionId,
      seq: r.event.seq,
      relativePath: r.relativePath,
      offset: r.offset,
      length: r.length,
      hash: r.hash,
    }),
  )
  return { rows, scan }
}
function ordered(rows: readonly MetadataRow[]) {
  return [...rows].sort((a, b) =>
    a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : a.offset - b.offset,
  )
}
test('four bounded Workers preserve every metadata row and full UTF8/MiB framing across more files than Workers', async () => {
  const root = fixture()
  for (let file = 0; file < 9; file++) {
    const contents = Array.from({ length: 257 }, (_, i) =>
      line(i + 1, i === 128 ? '跨界🌊'.repeat(130_000) : '', 'session-' + file),
    ).join('')
    writeFileSync(join(root, file + '.jsonl'), contents)
  }
  const expected = baseline(root)
  const actual: MetadataRow[] = []
  const result = await parallelVisitSessionLogs(root, new Set(), (rows) => actual.push(...rows))
  expect(ordered(actual)).toEqual(ordered(expected.rows))
  expect(result.files).toEqual(expected.scan.files)
  expect(result.truncated).toEqual(expected.scan.truncated)
  expect(result.parallel.workers).toBe(4)
  expect(result.parallel.records).toBe(9 * 257)
  expect(result.parallel.maxBatchRows).toBe(128)
  expect(result.parallel.maxPendingRowsBound).toBe(512)
  expect(result.parallel.forcedWorkerTerminations).toBe(0)
  expect(result.parallel.allWorkersJoined).toBe(true)
  expect(result.parallel.naturalWorkerExitCodes).toEqual([0, 0, 0, 0])
  clean(root)
}, 20_000)

test('parallel scan preserves path order, event and filename exclusions and deferred tails without writes', async () => {
  const root = fixture()
  mkdirSync(join(root, 'nested'))
  mkdirSync(join(root, '.maintenance'))
  writeFileSync(join(root, 'z.jsonl'), line(2) + '{"unfinished":')
  writeFileSync(join(root, 'nested', '🌊.jsonl'), line(1) + line(3, 'excluded event', 'excluded'))
  writeFileSync(join(root, 'excluded.jsonl'), 'corrupt excluded filename\n')
  writeFileSync(join(root, '.maintenance', 'hidden.jsonl'), 'corrupt maintenance file\n')
  const paths = [join(root, 'z.jsonl'), join(root, 'nested', '🌊.jsonl')]
  const before = paths.map(hash)
  const expected = baseline(root, new Set(['excluded']))
  const rows: MetadataRow[] = []
  const actual = await parallelVisitSessionLogs(root, new Set(['excluded']), (batch) => rows.push(...batch))
  expect(ordered(rows)).toEqual(ordered(expected.rows))
  expect(actual.files).toEqual(expected.scan.files)
  expect(actual.truncated).toEqual(expected.scan.truncated)
  expect(actual.parallel.allWorkersJoined).toBe(true)
  expect(paths.map(hash)).toEqual(before)
  clean(root)
}, 20_000)

for (const kind of ['json', 'schema', 'cap'] as const)
  test(
    'parallel scan rejects complete corrupted record and preserves incomplete tail: ' + kind,
    async () => {
      const root = fixture()
      const path = join(root, 'source.jsonl')
      const bytes =
        (kind === 'json' ? '{"invalid":\n' : kind === 'schema' ? '{"version":2}\n' : line(1, 'large')) + '{"tail":'
      writeFileSync(path, bytes)
      await expect(
        parallelVisitSessionLogs(root, new Set(), () => undefined, kind === 'cap' ? { maxRecordBytes: 32 } : {}),
      ).rejects.toThrow(kind === 'cap' ? 'SESSION_LOG_RECORD_TOO_LARGE' : 'SESSION_LOG_CORRUPTED')
      expect(readFileSync(path, 'utf8')).toBe(bytes)
      clean(root)
    },
    20_000,
  )

test('already-cancelled parallel scan starts no work', async () => {
  const root = fixture()
  const controller = new AbortController()
  controller.abort()
  await expect(
    parallelVisitSessionLogs(
      root,
      new Set(),
      () => {
        throw new Error('unexpected row')
      },
      { signal: controller.signal },
    ),
  ).rejects.toThrow('SCAN_CANCELLED')
  clean(root)
})
test('cancellation during backpressure rejects after owned Worker cleanup and accepts no later batch', async () => {
  const root = fixture()
  for (let i = 0; i < 5; i++)
    writeFileSync(
      join(root, i + '.jsonl'),
      Array.from({ length: 257 }, (_, j) => line(j + 1, '', 'session-' + i)).join(''),
    )
  const controller = new AbortController()
  let callbacks = 0
  await expect(
    parallelVisitSessionLogs(
      root,
      new Set(),
      () => {
        callbacks++
        controller.abort()
      },
      { signal: controller.signal },
    ),
  ).rejects.toThrow('SCAN_CANCELLED')
  expect(callbacks).toBe(1)
  clean(root)
}, 20_000)
test('consumer SQL failure stops queued batches and joins owned Workers', async () => {
  const root = fixture()
  for (let i = 0; i < 5; i++)
    writeFileSync(
      join(root, i + '.jsonl'),
      Array.from({ length: 257 }, (_, j) => line(j + 1, '', 'session-' + i)).join(''),
    )
  let callbacks = 0
  await expect(
    parallelVisitSessionLogs(root, new Set(), () => {
      callbacks++
      throw new Error('owned SQL failure')
    }),
  ).rejects.toThrow('owned SQL failure')
  expect(callbacks).toBe(1)
  clean(root)
}, 20_000)
test('empty directory creates no parallel Worker', async () => {
  const root = fixture()
  const result = await parallelVisitSessionLogs(root, new Set(), () => undefined)
  expect(result.files).toEqual([])
  expect(result.parallel.workers).toBe(0)
  expect(result.parallel.allWorkersJoined).toBe(true)
  clean(root)
})

test.skipIf(process.platform !== 'win32')(
  'parallel scan retains an OS-supported path beyond the prototype protocol cap',
  async () => {
    const root = fixture()
    let deep = root
    for (let index = 0; index < 18; index++) deep = join(deep, String(index) + '-'.repeat(238))
    mkdirSync(deep, { recursive: true })
    writeFileSync(join(deep, 'deep.jsonl'), Array.from({ length: 257 }, (_, index) => line(index + 1)).join(''))
    const expected = baseline(root)
    const actual: MetadataRow[] = []
    const result = await parallelVisitSessionLogs(root, new Set(), (rows) => actual.push(...rows))
    expect(expected.scan.files[0]?.path.length).toBeGreaterThan(4000)
    expect(actual).toEqual(expected.rows)
    expect(result.files).toEqual(expected.scan.files)
    expect(result.parallel.allWorkersJoined).toBe(true)
    expect(result.parallel.naturalWorkerExitCodes).toEqual([0])
    clean(root)
  },
  20_000,
)
