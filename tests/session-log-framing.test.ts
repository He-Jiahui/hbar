import { afterEach, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sessionEventSchema } from '@hbar/contracts'
import { visitSessionLogs, type RecoveredLogEvent } from '@hbar/storage'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-native-log-framing-'))
  roots.push(root)
  return root
}

function event(seq: number, text: string, sessionId = 'framing-session') {
  return {
    eventId: `framing-${sessionId}-${seq}`,
    sessionId,
    seq,
    runId: null,
    stepId: null,
    type: 'diagnostic.note',
    data: { text },
    time: 1,
    version: 1,
  }
}

function line(seq: number, text: string, sessionId?: string) {
  return `${JSON.stringify(event(seq, text, sessionId))}\n`
}

test('native framing preserves every byte offset and hash across chunk boundaries and UTF-8 splits', async () => {
  const root = await fixture()
  const empty = line(1, '')
  const prefix = line(1, 'x'.repeat(65535 - Buffer.byteLength(empty)))
  expect(Buffer.byteLength(prefix)).toBe(65535)
  const contents = [prefix, line(2, '换行🌊'.repeat(16000)), line(3, 'last')]
  await writeFile(join(root, 'source.jsonl'), contents.join(''))
  const records: RecoveredLogEvent[] = []
  const result = visitSessionLogs(root, new Set(), (record) => records.push(record))
  expect(result.truncated).toEqual([])
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
})

test('the short final read ignores stale newlines left in the reusable buffer', async () => {
  const root = await fixture()
  const complete = line(1, 'x'.repeat(65535 - Buffer.byteLength(line(1, ''))))
  const tail = ' '.repeat(512) + '{"eventId":"unfinished"'
  const bytes = Buffer.from(complete + tail)
  expect(bytes.length).toBeGreaterThan(65536)
  const path = join(root, 'source.jsonl')
  await writeFile(path, bytes)
  const records: RecoveredLogEvent[] = []
  const scan = visitSessionLogs(root, new Set(), (record) => records.push(record))
  expect(records).toHaveLength(1)
  expect(scan.truncated).toEqual([
    { path, relativePath: 'source.jsonl', offset: Buffer.byteLength(complete), originalSize: bytes.length },
  ])
  expect(await readFile(path)).toEqual(bytes)
})

test('blank lines, CRLF and adjacent newlines retain canonical record lengths', async () => {
  const root = await fixture()
  const first = `${JSON.stringify(event(1, 'first'))}\r\n`
  const second = line(2, 'second')
  await writeFile(join(root, 'source.jsonl'), `\n${first}\n\n${second}\n`)
  const records: RecoveredLogEvent[] = []
  visitSessionLogs(root, new Set(), (record) => records.push(record))
  expect(records.map((record) => [record.offset, record.length])).toEqual([
    [1, Buffer.byteLength(first)],
    [1 + Buffer.byteLength(first) + 2, Buffer.byteLength(second)],
  ])
  expect(records[0]?.hash).toBe(createHash('sha256').update(first.slice(0, -1)).digest('hex'))
})

test('complete malformed and oversized records fail without editing source bytes', async () => {
  const root = await fixture()
  const path = join(root, 'source.jsonl')
  const malformed = `${line(1, 'valid')}{"invalid":true}\n`
  await writeFile(path, malformed)
  expect(() => visitSessionLogs(root, new Set(), () => undefined)).toThrow('SESSION_LOG_CORRUPTED')
  expect(await readFile(path, 'utf8')).toBe(malformed)
  const oversized = line(2, 'x'.repeat(70000))
  await writeFile(path, oversized)
  expect(() => visitSessionLogs(root, new Set(), () => undefined, { maxRecordBytes: 65536 })).toThrow(
    'SESSION_LOG_RECORD_TOO_LARGE',
  )
  expect(await readFile(path, 'utf8')).toBe(oversized)
})

test('file order and excluded sessions still follow the original visit contract', async () => {
  const root = await fixture()
  await mkdir(join(root, 'z'))
  await mkdir(join(root, 'a'))
  await writeFile(join(root, 'z', 'source.jsonl'), line(3, 'last'))
  await writeFile(join(root, 'a', 'source.jsonl'), line(1, 'excluded', 'skip') + line(2, 'first'))
  await writeFile(join(root, 'skip.jsonl'), 'not a canonical record\n')
  const records: RecoveredLogEvent[] = []
  const result = visitSessionLogs(root, new Set(['skip']), (record) => records.push(record))
  expect(records.map((record) => [record.event.seq, record.relativePath])).toEqual([
    [2, 'a/source.jsonl'],
    [3, 'z/source.jsonl'],
  ])
  expect(result.files.map((file) => file.path)).toEqual(['a/source.jsonl', 'z/source.jsonl'])
})
