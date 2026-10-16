import { expect, test } from 'bun:test'
import { withProviderResponseDiagnostics } from '../plugins/pi-driver/src/provider-http-diagnostics'

test('physical cancellation waits for the original reader and does not report its closed read as EOF', async () => {
  const entered = Promise.withResolvers<void>(),
    cancel = Promise.withResolvers<void>()
  const physical: string[] = []
  let eof = 0
  const source = new ReadableStream<Uint8Array>({
    pull() {
      entered.resolve()
    },
    async cancel() {
      await cancel.promise
    },
  })
  const observed = withProviderResponseDiagnostics(
    Object.assign(async () => new Response(source), { preconnect() {} }),
    () => {},
    undefined,
    undefined,
    () => {
      eof++
    },
    (kind) => physical.push(kind),
  )
  const response = await observed('http://fixture.invalid')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Missing physical response')
  const read = reader.read()
  await entered.promise
  const cancelling = reader.cancel('caller stopped')
  try {
    await Bun.sleep(10)
    expect(physical).toEqual([])
    expect(eof).toBe(0)
    cancel.resolve()
    await cancelling
    expect(await read).toEqual({ value: undefined, done: true })
    expect(physical).toEqual(['cancelled'])
    expect(eof).toBe(0)
  } finally {
    cancel.resolve()
    await cancelling
  }
})

test('natural EOF produces exactly one physical settlement after the original body is consumed', async () => {
  const physical: string[] = []
  let eof = 0
  const observed = withProviderResponseDiagnostics(
    Object.assign(async () => new Response('body'), { preconnect() {} }),
    () => {},
    undefined,
    undefined,
    () => {
      eof++
    },
    (kind) => physical.push(kind),
  )
  const response = await observed('http://fixture.invalid')
  expect(await response.text()).toBe('body')
  expect(eof).toBe(1)
  expect(physical).toEqual(['eof'])
})

test('a rejected underlying cancellation cannot fabricate physical settlement or EOF', async () => {
  const error = new Error('actual cancellation failed'),
    physical: string[] = []
  let eof = 0
  const source = new ReadableStream<Uint8Array>({
    cancel() {
      throw error
    },
  })
  const observed = withProviderResponseDiagnostics(
    Object.assign(async () => new Response(source), { preconnect() {} }),
    () => {},
    undefined,
    undefined,
    () => {
      eof++
    },
    (kind) => physical.push(kind),
  )
  const reader = (await observed('http://fixture.invalid')).body?.getReader()
  if (!reader) throw new Error('Missing physical reader')
  const read = reader.read()
  await expect(reader.cancel('stop')).rejects.toBe(error)
  expect(await read).toEqual({ value: undefined, done: true })
  expect(physical).toEqual([])
  expect(eof).toBe(0)
})

test('fetch rejection and an absent response body settle once without changing original transport behavior', async () => {
  const error = new TypeError('local fixture failure'),
    physical: string[] = []
  const failed = withProviderResponseDiagnostics(
    Object.assign(
      async () => {
        throw error
      },
      { preconnect() {} },
    ),
    () => {},
    undefined,
    undefined,
    undefined,
    (kind) => physical.push(kind),
  )
  await expect(failed('http://fixture.invalid')).rejects.toBe(error)
  const empty = withProviderResponseDiagnostics(
    Object.assign(async () => new Response(null, { status: 204 }), { preconnect() {} }),
    () => {},
    undefined,
    undefined,
    undefined,
    (kind) => {
      physical.push(kind)
      throw new Error('receipt observer failed')
    },
  )
  expect((await empty('http://fixture.invalid')).status).toBe(204)
  expect(physical).toEqual(['failed', 'eof'])
})
