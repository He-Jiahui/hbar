import { afterEach, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sessionEventSchema } from '@hbar/contracts'
import { visitSessionLogs, type RecoveredLogEvent } from '@hbar/storage'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-reused-log-buffer-'))
  roots.push(root)
  return { root, path: join(root, 'source.jsonl') }
}
function line(seq: number, text: string) {
  return (
    JSON.stringify({
      eventId: 'reused-buffer-' + seq,
      sessionId: 'reused-buffer-session',
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
test('retained event values, lengths and hashes survive buffer reuse across MiB and UTF-8 boundaries', async () => {
  const { root, path } = await fixture()
  const first = line(1, 'x'.repeat(1_048_575 - Buffer.byteLength(line(1, ''))))
  expect(Buffer.byteLength(first)).toBe(1_048_575)
  const contents = [first, line(2, '跨界🌊'.repeat(350_000)), line(3, ''), line(4, 'retained')]
  const bytes = Buffer.from(contents.join(''))
  await writeFile(path, bytes)
  const records: RecoveredLogEvent[] = []
  const scan = visitSessionLogs(root, new Set(), (record) => records.push(record))
  expect(scan.truncated).toEqual([])
  expect(records).toHaveLength(contents.length)
  let offset = 0
  for (const [index, raw] of contents.entries()) {
    const record = records[index]
    expect(record?.event).toEqual(sessionEventSchema.parse(JSON.parse(raw)))
    expect(record?.offset).toBe(offset)
    expect(record?.length).toBe(Buffer.byteLength(raw))
    expect(record?.hash).toBe(createHash('sha256').update(raw.slice(0, -1)).digest('hex'))
    offset += Buffer.byteLength(raw)
  }
  expect(await readFile(path)).toEqual(bytes)
})
test('a short final MiB read ignores stale delimiters and complete records still enforce the configured cap', async () => {
  const { root, path } = await fixture()
  const first = line(1, 'x'.repeat(1_048_575 - Buffer.byteLength(line(1, ''))))
  const tail = ' '.repeat(512) + '{"unfinished":"🌊'
  const bytes = Buffer.from(first + tail)
  await writeFile(path, bytes)
  const records: RecoveredLogEvent[] = []
  const scan = visitSessionLogs(root, new Set(), (record) => records.push(record))
  expect(records).toHaveLength(1)
  expect(scan.truncated).toEqual([
    { path, relativePath: 'source.jsonl', offset: Buffer.byteLength(first), originalSize: bytes.length },
  ])
  expect(await readFile(path)).toEqual(bytes)
  const oversized = Buffer.from(line(2, 'x'.repeat(1_048_576)))
  await writeFile(path, oversized)
  expect(() => visitSessionLogs(root, new Set(), () => undefined, { maxRecordBytes: 1_048_576 })).toThrow(
    'SESSION_LOG_RECORD_TOO_LARGE',
  )
  expect(await readFile(path)).toEqual(oversized)
})

test('retained records and offsets stay independent across files and nested scans', async () => {
  const { root, path } = await fixture()
  const nested = await fixture()
  const first = line(1, '跨文件🌊'.repeat(160_000))
  const second = line(2, 'short second file')
  const nestedLine = line(3, 'nested scan')
  const tail = '{"unfinished":'
  await writeFile(path, first)
  await writeFile(join(root, 'z-last.jsonl'), second + tail)
  await writeFile(nested.path, nestedLine)
  const records: RecoveredLogEvent[] = []
  const nestedRecords: RecoveredLogEvent[] = []
  const scan = visitSessionLogs(root, new Set(), (record) => {
    records.push(record)
    if (record.event.seq === 1) visitSessionLogs(nested.root, new Set(), (item) => nestedRecords.push(item))
  })
  expect(records.map((record) => record.event)).toEqual(
    [first, second].map((raw) => sessionEventSchema.parse(JSON.parse(raw))),
  )
  expect(nestedRecords.map((record) => record.event)).toEqual([sessionEventSchema.parse(JSON.parse(nestedLine))])
  expect(records.map(({ relativePath, offset, length, hash }) => ({ relativePath, offset, length, hash }))).toEqual(
    [first, second].map((raw, index) => ({
      relativePath: index === 0 ? 'source.jsonl' : 'z-last.jsonl',
      offset: 0,
      length: Buffer.byteLength(raw),
      hash: createHash('sha256').update(raw.slice(0, -1)).digest('hex'),
    })),
  )
  expect(scan.truncated).toEqual([
    {
      path: join(root, 'z-last.jsonl'),
      relativePath: 'z-last.jsonl',
      offset: Buffer.byteLength(second),
      originalSize: Buffer.byteLength(second + tail),
    },
  ])
  expect(await readFile(path, 'utf8')).toBe(first)
  expect(await readFile(join(root, 'z-last.jsonl'), 'utf8')).toBe(second + tail)
})
