import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { HbarError, type ArtifactRef } from '@hbar/contracts'
import {
  COMMAND_RECEIPT_INLINE_BYTES,
  COMMAND_RESULT_PAGE_BYTES,
  commandReceiptPayloadSchema,
  commandResultPageRequestSchema,
  commandResultPageSchema,
  type CommandReceiptPayload,
} from '@hbar/contracts/command-execution'
import { CommandResultPayloads } from '../apps/host/src/command-result-payloads'

const encode = (text: string) => new TextEncoder().encode(text)
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const source = { actorId: 'reader', sessionId: 'session', operationKey: 'page' }
async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected result page rejection')
}
function fixture(parts: Uint8Array[] = [], customRead?: (index: number, artifact: ArtifactRef) => Promise<Uint8Array>) {
  const hash = createHash('sha256')
  for (const part of parts) hash.update(part)
  const artifacts = parts.map((part, index) => ({
    id: sha(part),
    name: `part-${index}`,
    size: part.byteLength,
    mime: 'application/octet-stream',
  }))
  const reads: number[] = []
  const payloads = new CommandResultPayloads({
    write: () => Promise.reject(new Error('A bounded page must not create another result artifact')),
    read: (artifact) => {
      const index = artifacts.findIndex((item) => item.id === artifact.id)
      reads.push(index)
      const bytes = parts[index]
      if (!bytes) return Promise.reject(new Error('Unknown page artifact'))
      return customRead ? customRead(index, artifact) : Promise.resolve(bytes.slice())
    },
  })
  const payload = parts.length
    ? commandReceiptPayloadSchema.parse({
        kind: 'artifacts',
        sha256: hash.digest('hex'),
        bytes: parts.reduce((sum, part) => sum + part.byteLength, 0),
        chunks: artifacts,
      })
    : undefined
  return { payloads, payload, reads }
}

test('inline pages preserve complete UTF-8 characters, combining marks and literal BOM data', async () => {
  const json = JSON.stringify({ text: 'a🙂\uFEFF边界e\u0301尾' })
  const payload: CommandReceiptPayload = { kind: 'inline', json }
  const f = fixture()
  let offset = 0
  let digest: string | undefined
  let output = ''
  let finished = false
  for (let index = 0; index < 100; index++) {
    const page = await f.payloads.readPage(payload, { offset, limit: 4, ...(digest ? { expectedSha256: digest } : {}) })
    expect(page.integrity).toBe('inline')
    expect(encode(page.content).byteLength).toBeLessThanOrEqual(4)
    output += page.content
    digest = page.sha256
    if (page.nextOffset === null) {
      finished = true
      break
    }
    expect(page.nextOffset).toBeGreaterThan(offset)
    offset = page.nextOffset
  }
  expect(finished).toBe(true)
  expect(output).toBe(json)
  expect(digest).toBe(sha(encode(json)))
  expect(f.reads).toEqual([])
})

test('a page starting on U+FEFF preserves its bytes and middle-character offsets fail', async () => {
  const f = fixture()
  const json = JSON.stringify('\uFEFFa🙂')
  const payload: CommandReceiptPayload = { kind: 'inline', json }
  const digest = sha(encode(json))
  expect((await f.payloads.readPage(payload, { offset: 1, limit: 4, expectedSha256: digest })).content).toBe('\uFEFFa')
  expect(await failure(f.payloads.readPage(payload, { offset: 2, expectedSha256: digest }))).toMatchObject({
    code: 'COMMAND_RESULT_OFFSET_INVALID',
  })
  expect(await failure(f.payloads.readPage(payload, { offset: 1, expectedSha256: '0'.repeat(64) }))).toMatchObject({
    code: 'COMMAND_RESULT_VIEW_CHANGED',
  })
})

test('requests require a continued-view hash, bounded limits and a valid terminal cursor', async () => {
  expect(commandResultPageRequestSchema.safeParse({ offset: 1 }).success).toBe(false)
  for (const limit of [0, 3, COMMAND_RESULT_PAGE_BYTES + 1])
    expect(commandResultPageRequestSchema.safeParse({ limit }).success).toBe(false)
  expect(commandResultPageRequestSchema.safeParse({ actorId: 'spoofed' }).success).toBe(false)
  const f = fixture()
  const payload: CommandReceiptPayload = { kind: 'inline', json: 'null' }
  const digest = sha(encode('null'))
  expect(await f.payloads.readPage(payload, { offset: 4, expectedSha256: digest })).toMatchObject({
    content: '',
    offset: 4,
    totalBytes: 4,
    nextOffset: null,
  })
  expect(await failure(f.payloads.readPage(payload, { offset: 5, expectedSha256: digest }))).toMatchObject({
    code: 'COMMAND_RESULT_OFFSET_INVALID',
  })
  expect(
    commandResultPageSchema.safeParse({
      encoding: 'utf8',
      integrity: 'inline',
      offset: 0,
      nextOffset: 1,
      totalBytes: 1,
      sha256: digest,
      content: 'a',
    }).success,
  ).toBe(false)
})

test('a 32 MiB manifest page reads only the selected neighboring chunks and preserves a split BOM', async () => {
  const block = 10 * 1024 * 1024
  const parts = [
    new Uint8Array(block).fill(65),
    new Uint8Array(block).fill(66),
    new Uint8Array(block).fill(67),
    new Uint8Array(2 * 1024 * 1024).fill(68),
  ]
  parts[0]?.set([34], 0)
  parts[0]?.set([0xef], block - 1)
  parts[1]?.set([0xbb, 0xbf], 0)
  const last = parts[3]
  if (!last) throw new Error('Missing final part')
  last[last.length - 1] = 34
  const f = fixture(parts)
  const payload = f.payload
  if (!payload || payload.kind !== 'artifacts') throw new Error('Missing manifest')
  const page = await f.payloads.readPage(payload, { offset: block - 1, limit: 4, expectedSha256: payload.sha256 })
  expect(page).toMatchObject({
    content: '\uFEFFB',
    integrity: 'selected_chunks',
    nextOffset: block + 3,
    totalBytes: 32 * 1024 * 1024,
  })
  expect(f.reads).toEqual([0, 1])
  const tail = await f.payloads.readPage(payload, { offset: payload.bytes - 3, expectedSha256: payload.sha256 })
  expect(tail).toMatchObject({ content: 'DD"', nextOffset: null })
  expect(f.reads).toEqual([0, 1, 3])
})

test('selected artifacts must match their committed length and checksum', async () => {
  for (const corrupt of ['length', 'hash'] as const) {
    const bytes = encode('"data"')
    const f = fixture([bytes], () =>
      Promise.resolve(corrupt === 'length' ? bytes.subarray(1) : new Uint8Array(bytes.length).fill(65)),
    )
    if (!f.payload) throw new Error('Missing manifest')
    expect(await failure(f.payloads.readPage(f.payload, {}))).toMatchObject({ code: 'COMMAND_RECEIPT_ARTIFACT' })
  }
})

test('invalid UTF-8 and incomplete final characters fail without silently truncating committed data', async () => {
  for (const bytes of [new Uint8Array([0x80]), new Uint8Array([0xff]), new Uint8Array([0x22, 0xf0, 0x9f])]) {
    const f = fixture([bytes])
    if (!f.payload) throw new Error('Missing manifest')
    expect(await failure(f.payloads.readPage(f.payload, {}))).toMatchObject({ code: 'COMMAND_RECEIPT_ARTIFACT' })
  }
})

test('cancelled queued readers release their waiter without reading or freeing physical work early', async () => {
  const bytes = encode('"value"')
  const gate = Promise.withResolvers<Uint8Array>()
  const f = fixture([bytes], () => gate.promise)
  if (!f.payload) throw new Error('Missing manifest')
  const first = f.payloads.readPage(f.payload, {})
  const second = f.payloads.readPage(f.payload, {})
  const controller = new AbortController()
  const queued = f.payloads.readPage(f.payload, {}, controller.signal)
  try {
    expect(f.reads).toHaveLength(2)
    controller.abort(new HbarError('USER_CANCELLED', 'Cancel queued read'))
    expect(await failure(queued)).toMatchObject({ code: 'USER_CANCELLED' })
    expect(f.reads).toHaveLength(2)
    gate.resolve(bytes)
    await Promise.all([first, second])
    expect((await f.payloads.readPage(f.payload, {})).content).toBe('"value"')
    expect(f.reads).toHaveLength(3)
  } finally {
    gate.resolve(bytes)
    await Promise.allSettled([first, second, queued])
  }
})

test('cancellation between artifact reads prevents the next chunk and returns its slot after physical completion', async () => {
  const controller = new AbortController()
  const parts = [encode('"abc'), encode('def"')]
  const f = fixture(parts, (index) => {
    if (index === 0) controller.abort(new HbarError('USER_CANCELLED', 'Stop after the first chunk'))
    const bytes = parts[index]
    return bytes ? Promise.resolve(bytes) : Promise.reject(new Error('Missing bytes'))
  })
  if (!f.payload) throw new Error('Missing manifest')
  expect(await failure(f.payloads.readPage(f.payload, {}, controller.signal))).toMatchObject({ code: 'USER_CANCELLED' })
  expect(f.reads).toEqual([0])
  expect((await f.payloads.readPage(f.payload, {})).content).toBe('"abcdef"')
  expect(f.reads).toEqual([0, 0, 1])
})

test('worst-case escaped pages and reserved metadata still save inline instead of creating a recursive result reference', async () => {
  const f = fixture()
  expect(
    commandResultPageSchema.safeParse({
      encoding: 'utf8',
      integrity: 'inline',
      offset: 0,
      nextOffset: null,
      totalBytes: COMMAND_RESULT_PAGE_BYTES * 3,
      sha256: 'a'.repeat(64),
      content: '界'.repeat(COMMAND_RESULT_PAGE_BYTES),
    }).success,
  ).toBe(false)
  const page = commandResultPageSchema.parse({
    encoding: 'utf8',
    integrity: 'selected_chunks',
    offset: 0,
    nextOffset: null,
    totalBytes: COMMAND_RESULT_PAGE_BYTES,
    sha256: 'a'.repeat(64),
    content: '\u0000'.repeat(COMMAND_RESULT_PAGE_BYTES),
  })
  const saved = await f.payloads.save({ ok: true, result: { ...page, reservedMetadata: 'm'.repeat(8192) } }, source)
  expect(saved.kind).toBe('inline')
  if (saved.kind !== 'inline') throw new Error('Recursive result reference')
  expect(encode(saved.json).byteLength).toBeLessThanOrEqual(COMMAND_RECEIPT_INLINE_BYTES)
})
