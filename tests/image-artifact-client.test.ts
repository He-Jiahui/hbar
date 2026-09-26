import { afterEach, expect, spyOn, test } from 'bun:test'
import {
  HbarClient,
  IMAGE_ARTIFACT_CONCURRENCY,
  IMAGE_ARTIFACT_QUEUE_LIMIT,
  IMAGE_ARTIFACT_TIMEOUT_MS,
  MAX_IMAGE_ARTIFACT_BYTES,
  type ImageArtifactMime,
} from '@hbar/client'
import { HbarError, type ArtifactRef } from '@hbar/contracts'
import { z } from 'zod'

const fetchSpy = () => spyOn(globalThis, 'fetch')
let restore: (() => void) | undefined
const clients: HbarClient[] = []
afterEach(() => {
  for (const client of clients.splice(0)) client.disconnect()
  restore?.()
  restore = undefined
})
function client(base = 'http://image-fixture.invalid', token?: string) {
  const value = new HbarClient(base, token)
  clients.push(value)
  return value
}
function intercept(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const mock = fetchSpy().mockImplementation(asFetch(handler))
  restore = () => mock.mockRestore()
  return mock
}
function asFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return Object.assign(handler, { preconnect() {} })
}
function deferred<Value>() {
  let resolve!: (value: Value) => void
  let reject!: (error: Error) => void
  const promise = new Promise<Value>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return { promise, resolve, reject }
}
async function artifact(
  bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
  mime: ImageArtifactMime = 'image/png',
) {
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  const ref = {
    id: Buffer.from(hash).toString('hex'),
    name: '图片 screenshot.png',
    size: bytes.length,
    mime,
  }
  return { ref, bytes }
}
function response(bytes: Uint8Array, mime = 'image/png', headers: Record<string, string> = {}) {
  return new Response(new Uint8Array(bytes), { headers: { 'content-type': mime, ...headers } })
}
async function code(promise: Promise<unknown>) {
  try {
    await promise
    return 'resolved'
  } catch (error) {
    expect(error).toBeInstanceOf(HbarError)
    if (!(error instanceof HbarError)) throw error
    expect(error.message).not.toContain('secret')
    return error.code
  }
}
async function tick() {
  await Bun.sleep(0)
}

test('fixed authenticated GET before WebSocket connect preserves all bytes without exposing token or caption', async () => {
  const { ref, bytes } = await artifact()
  const mock = intercept(async (url, init) => {
    expect(String(url)).toBe(`https://host.test/api/artifacts/${ref.id}`)
    expect(init).toMatchObject({
      method: 'GET',
      credentials: 'include',
      redirect: 'error',
      cache: 'no-store',
      headers: { Authorization: 'Bearer private-fixture-token' },
    })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    return response(bytes, 'image/png; charset=binary', {
      'content-length': String(bytes.length),
      'content-disposition': 'inline; filename="first-caption.png"',
    })
  })
  const result = await client('https://host.test/path?not-an-artifact', 'private-fixture-token').readImageArtifact(ref)
  expect(result).toEqual({ artifactId: ref.id, mime: ref.mime, bytes })
  expect(mock).toHaveBeenCalledTimes(1)
})

test('cookie pairing remains available with no bearer and four exact image MIME types are accepted', async () => {
  const api = client()
  for (const mime of ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const) {
    const { ref, bytes } = await artifact(undefined, mime)
    const mock = intercept(async (_url, init) => {
      expect(init?.headers).toEqual({})
      return response(bytes, mime)
    })
    expect((await api.readImageArtifact(ref)).mime).toBe(mime)
    mock.mockRestore()
  }
})

test('invalid targets, unsupported MIME, zero/over-limit sizes and early cancellation perform no GET', async () => {
  const { ref } = await artifact()
  const mock = intercept(() => Promise.reject(new Error('must not fetch')))
  const api = client()
  expect(await code(api.readImageArtifact({ ...ref, id: '../secret' }))).toBe('INVALID_INPUT')
  expect(await code(api.readImageArtifact({ ...ref, mime: 'image/svg+xml' }))).toBe('UNSUPPORTED_IMAGE')
  expect(await code(api.readImageArtifact({ ...ref, size: 0 }))).toBe('INVALID_INPUT')
  expect(await code(api.readImageArtifact({ ...ref, size: MAX_IMAGE_ARTIFACT_BYTES + 1 }))).toBe('TOO_LARGE')
  expect(await code(api.readImageArtifact(ref, { signal: AbortSignal.abort() }))).toBe('CANCELLED')
  expect(mock).not.toHaveBeenCalled()
})

test('response status, MIME, advertised length, missing bytes and hash mismatch never return unverified bytes', async () => {
  const { ref, bytes } = await artifact()
  const api = client()
  const cases: [Response, string][] = [
    [new Response('secret raw HTML', { status: 401 }), 'UNAUTHORIZED'],
    [new Response('secret raw HTML', { status: 403 }), 'UNAUTHORIZED'],
    [new Response('secret raw HTML', { status: 404 }), 'NOT_FOUND'],
    [new Response('secret raw HTML', { status: 500 }), 'READ_FAILED'],
    [new Response(null, { status: 302, headers: { location: 'https://secret.invalid' } }), 'READ_FAILED'],
    [response(bytes, 'text/html'), 'CONTENT_MISMATCH'],
    [response(bytes, 'image/jpeg'), 'CONTENT_MISMATCH'],
    [response(bytes, 'image/png', { 'content-length': '999' }), 'CONTENT_MISMATCH'],
    [response(bytes, 'image/png', { 'content-length': '8x' }), 'CONTENT_MISMATCH'],
    [response(bytes.slice(0, -1)), 'CONTENT_MISMATCH'],
    [response(new Uint8Array(bytes.length)), 'CONTENT_MISMATCH'],
    [new Response(null, { headers: { 'content-type': 'image/png' } }), 'CONTENT_MISMATCH'],
  ]
  for (const [reply, expected] of cases) {
    const mock = intercept(() => Promise.resolve(reply))
    expect(await code(api.readImageArtifact(ref))).toBe(expected)
    expect(reply.body?.locked ?? false).toBe(false)
    mock.mockRestore()
  }
})

test('read errors are sanitized and redirects are forbidden even with a transport returning a redirected response', async () => {
  const { ref, bytes } = await artifact()
  const api = client()
  const redirected = response(bytes)
  Object.defineProperty(redirected, 'redirected', { value: true })
  const mock = intercept(() => Promise.resolve(redirected))
  expect(await code(api.readImageArtifact(ref))).toBe('CONTENT_MISMATCH')
  mock.mockImplementation(asFetch(() => Promise.reject(new Error('secret transport body'))))
  expect(await code(api.readImageArtifact(ref))).toBe('READ_FAILED')
})

test('stream limit is enforced cumulatively without Content-Length and reader is cancelled/released', async () => {
  const { ref } = await artifact()
  let cancelled = 0
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller
    },
    cancel() {
      cancelled += 1
    },
  })
  intercept(() => Promise.resolve(new Response(stream, { headers: { 'content-type': 'image/png' } })))
  const result = code(client().readImageArtifact({ ...ref, size: MAX_IMAGE_ARTIFACT_BYTES }))
  streamController?.enqueue(new Uint8Array(MAX_IMAGE_ARTIFACT_BYTES - 1))
  streamController?.enqueue(new Uint8Array(2))
  expect(await result).toBe('TOO_LARGE')
  expect(cancelled).toBe(1)
  expect(stream.locked).toBe(false)
})

test('one-byte and exactly 10MiB reads succeed while target-short streams are rejected', async () => {
  const api = client()
  for (const size of [1, MAX_IMAGE_ARTIFACT_BYTES]) {
    const { ref, bytes } = await artifact(new Uint8Array(size))
    const mock = intercept(() => Promise.resolve(response(bytes)))
    expect((await api.readImageArtifact(ref)).bytes.length).toBe(size)
    mock.mockRestore()
  }
})

test('reader errors and synchronous cancellation cleanup failure keep sanitized read failure and release the lock', async () => {
  const { ref } = await artifact()
  const stream = new ReadableStream<Uint8Array>()
  const reply = new Response(stream, { headers: { 'content-type': 'text/html' } })
  const reader = stream.getReader()
  const acquire = spyOn(stream, 'getReader').mockReturnValue(reader)
  const cancel = spyOn(reader, 'cancel').mockImplementation(() => {
    throw new Error('secret cancel detail')
  })
  intercept(() => Promise.resolve(reply))
  try {
    expect(await code(client().readImageArtifact(ref))).toBe('CONTENT_MISMATCH')
    expect(stream.locked).toBe(false)
  } finally {
    acquire.mockRestore()
    cancel.mockRestore()
  }
})

test('input capture is immutable across a delayed response and each read has independent returned bytes', async () => {
  const fixture = await artifact()
  const ref: ArtifactRef = { ...fixture.ref }
  const bytes = fixture.bytes
  const original = { ...ref }
  const gate = deferred<Response>()
  const mock = intercept(() => gate.promise)
  const api = client()
  const read = api.readImageArtifact(ref)
  ref.id = '0'.repeat(64)
  ref.mime = 'text/html'
  ref.size = 0
  gate.resolve(response(bytes))
  expect(await read).toMatchObject({ artifactId: original.id, mime: original.mime, bytes })
  mock.mockImplementation(asFetch(() => Promise.resolve(response(bytes))))
  const again = await api.readImageArtifact(original)
  again.bytes[0] = 0
  expect((await api.readImageArtifact(original)).bytes).toEqual(bytes)
})

test('two actual fetches plus twelve waiters are bounded; queued abort frees a wait slot without GET', async () => {
  const { ref, bytes } = await artifact()
  const gates: ReturnType<typeof deferred<Response>>[] = []
  const mock = intercept(() => {
    const gate = deferred<Response>()
    gates.push(gate)
    return gate.promise
  })
  const api = client()
  const controllers = Array.from(
    { length: IMAGE_ARTIFACT_CONCURRENCY + IMAGE_ARTIFACT_QUEUE_LIMIT },
    () => new AbortController(),
  )
  const results = controllers.map((controller) => code(api.readImageArtifact(ref, { signal: controller.signal })))
  expect(mock).toHaveBeenCalledTimes(2)
  expect(await code(api.readImageArtifact(ref))).toBe('BUSY')
  controllers[2]?.abort()
  expect(await results[2]).toBe('CANCELLED')
  const extra = code(api.readImageArtifact(ref))
  expect(mock).toHaveBeenCalledTimes(2)
  api.disconnect()
  gates.forEach((gate) => gate.resolve(response(bytes)))
  expect(await Promise.all(results)).toEqual(
    controllers.map((_, index) => (index === 2 ? 'CANCELLED' : 'DISCONNECTED')),
  )
  expect(await extra).toBe('DISCONNECTED')
  await tick()
  expect(mock).toHaveBeenCalledTimes(2)
  expect(await code(api.readImageArtifact(ref))).toBe('DISCONNECTED')
})

test('mid-stream cancellation cancels and releases the reader; fetch ignoring abort retains its real slot', async () => {
  const { ref, bytes } = await artifact()
  let cancelled = 0
  const stream = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled += 1
    },
  })
  const mock = intercept(() => Promise.resolve(new Response(stream, { headers: { 'content-type': 'image/png' } })))
  const api = client()
  const controller = new AbortController()
  const result = code(api.readImageArtifact(ref, { signal: controller.signal }))
  await tick()
  controller.abort()
  expect(await result).toBe('CANCELLED')
  await tick()
  expect(cancelled).toBe(1)
  expect(stream.locked).toBe(false)
  const gates: ReturnType<typeof deferred<Response>>[] = []
  mock.mockImplementation(
    asFetch(() => {
      const gate = deferred<Response>()
      gates.push(gate)
      return gate.promise
    }),
  )
  const firstAbort = new AbortController()
  const first = code(api.readImageArtifact(ref, { signal: firstAbort.signal }))
  const second = code(api.readImageArtifact(ref))
  firstAbort.abort()
  expect(await first).toBe('CANCELLED')
  const third = code(api.readImageArtifact(ref))
  expect(gates).toHaveLength(2)
  gates[0]?.resolve(response(bytes))
  await tick()
  expect(gates).toHaveLength(3)
  gates[1]?.resolve(response(bytes))
  gates[2]?.resolve(response(bytes))
  expect(await second).toBe('resolved')
  expect(await third).toBe('resolved')
})

test('total real deadline includes queue and retains aborted fetch slots until they settle', async () => {
  const { ref, bytes } = await artifact()
  const gates: ReturnType<typeof deferred<Response>>[] = []
  const mock = intercept(() => {
    const gate = deferred<Response>()
    gates.push(gate)
    return gate.promise
  })
  const api = client()
  const started = Date.now()
  const results = Array.from({ length: 3 }, () => code(api.readImageArtifact(ref)))
  expect(await Promise.all(results)).toEqual(['TIMEOUT', 'TIMEOUT', 'TIMEOUT'])
  expect(Date.now() - started).toBeGreaterThanOrEqual(IMAGE_ARTIFACT_TIMEOUT_MS - 100)
  expect(mock).toHaveBeenCalledTimes(2)
  const next = code(api.readImageArtifact(ref))
  expect(mock).toHaveBeenCalledTimes(2)
  api.disconnect()
  gates.forEach((gate) => gate.resolve(response(bytes)))
  expect(await next).toBe('DISCONNECTED')
  await tick()
}, 20_000)

test('deadline also covers hashing and a late hash never delivers bytes', async () => {
  const { ref, bytes } = await artifact()
  intercept(() => Promise.resolve(response(bytes)))
  const gate = deferred<ArrayBuffer>()
  const digest = spyOn(crypto.subtle, 'digest').mockImplementation(() => gate.promise)
  const now = spyOn(Date, 'now')
  const started = Date.now()
  try {
    const result = code(client().readImageArtifact(ref))
    await tick()
    now.mockReturnValue(started + IMAGE_ARTIFACT_TIMEOUT_MS + 100)
    gate.resolve(new ArrayBuffer(32))
    expect(await result).toBe('TIMEOUT')
  } finally {
    digest.mockRestore()
    now.mockRestore()
  }
})

test('Host identity, token replacement, revoked authorization and explicit disconnect fence reads', async () => {
  const { ref, bytes } = await artifact()
  let identity = 'first-host'
  let hellos = 0
  let closeCurrent = () => {}
  const wire = z.object({ id: z.number(), method: z.string() })
  const server = Bun.serve({
    port: 0,
    fetch(request, server) {
      return server.upgrade(request) ? undefined : new Response(null, { status: 404 })
    },
    websocket: {
      open(socket) {
        socket.subscribe('fixture')
        closeCurrent = () => {
          socket.close()
        }
      },
      message(socket, message) {
        const request = wire.parse(JSON.parse(String(message)) as unknown)
        hellos += 1
        socket.send(
          JSON.stringify({
            id: request.id,
            result: {
              instanceId: identity,
              protocol: 1,
              version: 'fixture',
              platform: 'test',
              addresses: [],
              activeRuns: 0,
              demo: true,
            },
          }),
        )
      },
    },
  })
  const gates: ReturnType<typeof deferred<Response>>[] = []
  const mock = intercept((url) => {
    if (String(url).endsWith('/auth/pair')) return Promise.resolve(Response.json({ token: 'new-fixture-token' }))
    const gate = deferred<Response>()
    gates.push(gate)
    return gate.promise
  })
  const api = client(server.url.origin, 'old-fixture-token')
  try {
    const beforeHello = code(api.readImageArtifact(ref))
    await api.connect()
    expect(await beforeHello).toBe('DISCONNECTED')
    gates.shift()?.resolve(response(bytes))
    await tick()
    const beforePair = code(api.readImageArtifact(ref))
    await api.pair('fixture-code', 'fixture-device')
    expect(await beforePair).toBe('DISCONNECTED')
    gates.shift()?.resolve(response(bytes))
    await tick()
    const beforeRevoked = code(api.readImageArtifact(ref))
    server.publish('fixture', JSON.stringify({ method: 'auth.revoked', params: { reason: 'fixture' } }))
    expect(await beforeRevoked).toBe('DISCONNECTED')
    const count = mock.mock.calls.length
    expect(await code(api.readImageArtifact(ref))).toBe('DISCONNECTED')
    expect(mock.mock.calls.length).toBe(count)
    gates.shift()?.resolve(response(bytes))
    await tick()
    // Direct connect after revocation must perform a fresh hello, not reuse a resolved promise.
    await api.connect()
    const beforeChanged = code(api.readImageArtifact(ref))
    const previousHello = hellos
    identity = 'second-host'
    closeCurrent()
    for (
      let attempt = 0;
      attempt < 200 && (hellos === previousHello || api.connectionStatus() !== 'connected');
      attempt++
    )
      await Bun.sleep(10)
    expect(api.connectionHost()?.instanceId).toBe('second-host')
    expect(await beforeChanged).toBe('DISCONNECTED')
    gates.shift()?.resolve(response(bytes))
    await tick()
    const valid = api.readImageArtifact(ref)
    gates.shift()?.resolve(response(bytes))
    expect((await valid).bytes).toEqual(bytes)
    const beforeSameHost = code(api.readImageArtifact(ref))
    const sameHello = hellos
    closeCurrent()
    for (let attempt = 0; attempt < 200 && (hellos === sameHello || api.connectionStatus() !== 'connected'); attempt++)
      await Bun.sleep(10)
    expect(hellos).toBeGreaterThan(sameHello)
    gates.shift()?.resolve(response(bytes))
    expect(await beforeSameHost).toBe('resolved')
  } finally {
    api.disconnect()
    await server.stop(true)
  }
})
