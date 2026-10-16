import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { CommandResultPayloads } from '../apps/host/src/command-result-payloads'

async function failure(action: Promise<unknown>): Promise<unknown> {
  try {
    await action
  } catch (error) {
    return error
  }
  throw new Error('Expected payload rejection')
}
const source = { actorId: 'source', sessionId: 'session', operationKey: 'result' }

test('result publication has two physical slots and a bounded queue that releases after all accepted writes', async () => {
  let release: () => void = () => {
    throw new Error('Not initialized')
  }
  const gate = new Promise<void>((done) => {
    release = done
  })
  let active = 0,
    maximum = 0,
    writes = 0
  const payloads = new CommandResultPayloads({
    write: async (_source, index, bytes) => {
      active++
      maximum = Math.max(active, maximum)
      try {
        await gate
        writes++
        return {
          id: createHash('sha256').update(bytes).digest('hex'),
          name: `chunk-${index}`,
          size: bytes.byteLength,
          mime: 'application/octet-stream',
        }
      } finally {
        active--
      }
    },
    read: () => Promise.reject(new Error('Not used')),
  })
  const operations = Array.from({ length: 130 }, () => payloads.save({ text: 'x'.repeat(70_000) }, source))
  try {
    expect(await failure(payloads.save({ text: 'overflow' }, source))).toMatchObject({ code: 'BUSY' })
    expect(active).toBe(2)
    release()
    const results = await Promise.all(operations)
    expect(results.every((value) => value.kind === 'artifacts')).toBe(true)
    expect({ maximum, writes, active }).toEqual({ maximum: 2, writes: 130, active: 0 })
    expect(await payloads.save({ after: true }, source)).toEqual({ kind: 'inline', json: '{"after":true}' })
  } finally {
    release()
    await Promise.allSettled(operations)
  }
})

test('artifact manifests require exact committed hashes, complete UTF-8 JSON, and the same structural bounds', async () => {
  let data = new TextEncoder().encode('{"n":1e400}')
  const payloads = new CommandResultPayloads({
    write: (_source, _index, bytes) =>
      Promise.resolve({
        id: 'a'.repeat(64),
        name: 'invalid',
        size: bytes.byteLength,
        mime: 'application/octet-stream',
      }),
    read: () => Promise.resolve(data),
  })
  expect(await failure(payloads.save({ text: 'x'.repeat(70_000) }, source))).toMatchObject({
    code: 'COMMAND_RECEIPT_ARTIFACT',
  })
  for (const bytes of [
    data,
    new Uint8Array([255]),
    new TextEncoder().encode('{"incomplete":'),
    new TextEncoder().encode('['.repeat(70) + '0' + ']'.repeat(70)),
  ]) {
    data = bytes
    const hash = createHash('sha256').update(data).digest('hex')
    expect(
      await failure(
        payloads.read({
          kind: 'artifacts',
          sha256: hash,
          bytes: data.byteLength,
          chunks: [{ id: hash, name: 'invalid', mime: 'application/octet-stream', size: data.byteLength }],
        }),
      ),
    ).toMatchObject({ code: 'COMMAND_RECEIPT_ARTIFACT' })
  }
})
