import { describe, expect, test } from 'bun:test'
import { zlibSync } from 'fflate'
import type { ArtifactRef } from '@hbar/contracts'
import type { ImageResourceLease } from '@hbar/app-runtime'
import {
  createImageResourceController,
  IMAGE_RESOURCE_QUEUE_LIMIT,
  IMAGE_RESOURCE_TIMEOUT_MS,
  IMAGE_THUMBNAIL_LIMIT,
  type DecodedImageResource,
  type ImageResourceEnvironment,
} from '../apps/web/src/image-resource-controller'

function png(): Uint8Array<ArrayBuffer> {
  const chunk = (name: string, data: Uint8Array): Uint8Array => {
    const bytes = new Uint8Array(data.length + 12)
    const view = new DataView(bytes.buffer)
    view.setUint32(0, data.length)
    bytes.set(new TextEncoder().encode(name), 4)
    bytes.set(data, 8)
    let crc = 0xffffffff
    for (const byte of bytes.subarray(4, -4)) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
    view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0)
    return bytes
  }
  const header = new Uint8Array(13)
  new DataView(header.buffer).setUint32(0, 2)
  new DataView(header.buffer).setUint32(4, 1)
  header[8] = 8
  header[9] = 6
  const chunks = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlibSync(new Uint8Array([0, 255, 0, 0, 255, 0, 255, 0, 255]))),
    chunk('IEND', new Uint8Array()),
  ]
  const bytes = new Uint8Array(chunks.reduce((size, value) => size + value.length, 0))
  let offset = 0
  for (const value of chunks) {
    bytes.set(value, offset)
    offset += value.length
  }
  return bytes
}

const bytes = png()
const artifact: ArtifactRef = { id: 'a'.repeat(64), name: 'image.png', mime: 'image/png', size: bytes.length }

function deferred<Value>() {
  let resolve!: (value: Value) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<Value>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function fixture(overrides: Partial<ImageResourceEnvironment> = {}) {
  const created: { url: string; blob: Blob }[] = []
  const revoked: string[] = []
  const timers = new Set<() => void>()
  let reads = 0
  let decodes = 0
  const environment: ImageResourceEnvironment = {
    async readImageArtifact(ref) {
      reads += 1
      return { artifactId: ref.id, mime: 'image/png', bytes }
    },
    async decode(blob, metadata, purpose) {
      decodes += 1
      expect(blob.type).toBe('image/png')
      expect(metadata).toMatchObject({ width: 2, height: 1, animated: false, frameCount: 1 })
      return {
        width: 2,
        height: 1,
        ...(purpose === 'thumbnail' ? { thumbnail: new Blob([bytes], { type: 'image/png' }) } : {}),
      }
    },
    createObjectURL(blob) {
      const url = `blob:test/${created.length}`
      created.push({ url, blob })
      return url
    },
    revokeObjectURL(url) {
      revoked.push(url)
    },
    now: () => 0,
    setTimer(callback, milliseconds) {
      expect(milliseconds).toBe(IMAGE_RESOURCE_TIMEOUT_MS)
      timers.add(callback)
      return callback
    },
    clearTimer(timer) {
      for (const entry of timers) if (timer === entry) timers.delete(entry)
    },
    ...overrides,
  }
  const controller = createImageResourceController(environment)
  const acquire = (purpose: 'full' | 'thumbnail' = 'thumbnail', abort = new AbortController()) =>
    controller.acquire(artifact, { purpose, signal: abort.signal })
  return {
    controller,
    acquire,
    created,
    revoked,
    timers,
    get reads() {
      return reads
    },
    get decodes() {
      return decodes
    },
  }
}

const flush = async (): Promise<void> => {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

// Observe first, trigger abort/resolve second, assert last. Bun's rejects matcher
// can synchronously wait and prevent a later line from triggering the rejection.
const outcome = (promise: Promise<unknown>) =>
  promise.then(
    () => ({ ok: true as const }),
    (error: unknown) => ({ ok: false as const, error }),
  )

describe('ephemeral browser image resources', () => {
  test('keeps verified originals for full viewing and releases each lease exactly once', async () => {
    const context = fixture()
    const full = await context.acquire('full')
    expect(context.created[0]?.blob.type).toBe('image/png')
    expect(new Uint8Array(await context.created[0]!.blob.arrayBuffer())).toEqual(bytes)
    expect(full).toMatchObject({ url: 'blob:test/0', width: 2, height: 1 })
    await expect(context.acquire('full')).rejects.toMatchObject({ code: 'BUSY' })
    full.release()
    full.release()
    const next = await context.acquire('full')
    expect(context.reads).toBe(2)
    expect(context.timers.size).toBe(0)
    context.controller.dispose()
    next.release()
    expect(context.revoked).toEqual(['blob:test/0', 'blob:test/1'])
  })

  test('retains bounded derived thumbnails, not twelve originals', async () => {
    const context = fixture({
      async decode() {
        return { width: 1, height: 1, thumbnail: new Blob(['small thumbnail'], { type: 'image/png' }) }
      },
    })
    const leases: ImageResourceLease[] = []
    for (let index = 0; index < IMAGE_THUMBNAIL_LIMIT; index += 1) leases.push(await context.acquire())
    expect(context.created.every(({ blob }) => blob.size === 15)).toBe(true)
    await expect(context.acquire()).rejects.toMatchObject({ code: 'BUSY' })
    leases[0]!.release()
    leases.push(await context.acquire())
    context.controller.invalidate()
    for (const lease of leases) lease.release()
    expect(context.revoked).toHaveLength(IMAGE_THUMBNAIL_LIMIT + 1)
    expect(new Set(context.revoked).size).toBe(context.revoked.length)
  })

  test('bounds total derived bytes independently of the item limit', async () => {
    const context = fixture({
      async decode() {
        return { width: 256, height: 256, thumbnail: new Blob([new Uint8Array(512 * 1024)], { type: 'image/png' }) }
      },
    })
    for (let index = 0; index < 16; index += 1) await context.acquire()
    await expect(context.acquire()).rejects.toMatchObject({ code: 'TOO_LARGE' })
    expect(context.created).toHaveLength(16)
    context.controller.dispose()
    expect(context.revoked).toHaveLength(16)
  })

  test('never releases the actual pipeline slot merely because the caller aborted', async () => {
    const first = deferred<DecodedImageResource>()
    let entered = 0
    const context = fixture({
      decode() {
        entered += 1
        return entered === 1 ? first.promise : Promise.resolve({ width: 2, height: 1 })
      },
    })
    const abort = new AbortController()
    const cancelled = context.acquire('full', abort)
    const cancellation = outcome(cancelled)
    await flush()
    abort.abort()
    expect(await cancellation).toMatchObject({ ok: false, error: { code: 'CANCELLED' } })
    const next = context.acquire('full')
    await flush()
    expect(entered).toBe(1)
    expect(context.created).toHaveLength(0)
    first.resolve({ width: 2, height: 1 })
    const lease = await next
    expect(entered).toBe(2)
    expect(context.created).toHaveLength(1)
    lease.release()
  })

  test('limits waiting work and prioritizes a requested full image', async () => {
    const first = deferred<DecodedImageResource>()
    const order: string[] = []
    const context = fixture({
      decode(_blob, _metadata, purpose) {
        order.push(purpose)
        return order.length === 1
          ? first.promise
          : Promise.resolve({ width: 2, height: 1, thumbnail: new Blob(['small'], { type: 'image/png' }) })
      },
    })
    const firstResult = context.acquire()
    await flush()
    const waiting = Array.from({ length: IMAGE_RESOURCE_QUEUE_LIMIT - 1 }, () => context.acquire())
    const full = context.acquire('full')
    await expect(context.acquire()).rejects.toMatchObject({ code: 'BUSY' })
    first.resolve({ width: 2, height: 1, thumbnail: new Blob(['small'], { type: 'image/png' }) })
    await Promise.all([firstResult, full, ...waiting])
    expect(order.slice(0, 3)).toEqual(['thumbnail', 'full', 'thumbnail'])
    context.controller.dispose()
    expect(context.revoked).toHaveLength(IMAGE_RESOURCE_QUEUE_LIMIT + 1)
  })

  test('timeouts abort queued and active work, discard late bytes and do not create URLs', async () => {
    const pending = deferred<DecodedImageResource>()
    let aborted = false
    const context = fixture({
      decode(_blob, _metadata, _purpose, signal) {
        signal.addEventListener('abort', () => {
          aborted = true
        })
        return pending.promise
      },
    })
    const first = outcome(context.acquire())
    const second = outcome(context.acquire())
    await flush()
    for (const timer of [...context.timers]) timer()
    expect(await first).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } })
    expect(await second).toMatchObject({ ok: false, error: { code: 'TIMEOUT' } })
    expect(aborted).toBe(true)
    pending.resolve({ width: 2, height: 1, thumbnail: new Blob(['small'], { type: 'image/png' }) })
    await flush()
    expect(context.created).toHaveLength(0)
    expect(context.reads).toBe(1)
    expect(context.timers.size).toBe(0)
  })

  test('identity invalidation revokes displayed images and prevents late generation publication', async () => {
    const pending = deferred<DecodedImageResource>()
    let count = 0
    const context = fixture({
      decode() {
        count += 1
        return count === 2 ? pending.promise : Promise.resolve({ width: 2, height: 1 })
      },
    })
    const ready = await context.acquire('full')
    ready.release()
    const late = outcome(context.acquire('full'))
    await flush()
    context.controller.invalidate()
    expect(await late).toMatchObject({ ok: false, error: { code: 'DISCONNECTED' } })
    const fresh = context.acquire('full')
    pending.resolve({ width: 2, height: 1 })
    await fresh
    expect(context.created).toHaveLength(2)
    context.controller.dispose()
    expect(context.revoked).toEqual(['blob:test/0', 'blob:test/1'])
    await expect(context.acquire()).rejects.toMatchObject({ code: 'DISCONNECTED' })
  })

  test('a delayed deadline callback cannot publish decoding which already passed its total deadline', async () => {
    let now = 0
    const context = fixture({
      now: () => now,
      async decode() {
        now = IMAGE_RESOURCE_TIMEOUT_MS + 1
        return { width: 2, height: 1 }
      },
    })
    await expect(context.acquire('full')).rejects.toMatchObject({ code: 'TIMEOUT' })
    expect(context.created).toHaveLength(0)
    expect(context.timers.size).toBe(0)
  })

  test('preflight and identity checks run before any decoder or object URL allocation', async () => {
    const malformed = fixture({
      async readImageArtifact(ref) {
        return { artifactId: ref.id, mime: 'image/png', bytes: new Uint8Array(ref.size) }
      },
    })
    await expect(malformed.acquire()).rejects.toMatchObject({ code: 'INVALID_IMAGE' })
    expect(malformed.decodes).toBe(0)
    expect(malformed.created).toHaveLength(0)
    const mismatch = fixture({
      async readImageArtifact() {
        return { artifactId: 'b'.repeat(64), mime: 'image/png', bytes }
      },
    })
    await expect(mismatch.acquire()).rejects.toMatchObject({ code: 'CONTENT_MISMATCH' })
    expect(mismatch.decodes).toBe(0)
    const early = fixture()
    const abort = new AbortController()
    abort.abort()
    await expect(early.acquire('full', abort)).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(early.reads).toBe(0)
  })

  test('rejects missing, oversized and wrong-type derived images, but allows orientation exchange', async () => {
    for (const decoded of [
      { width: 1, height: 1 },
      { width: 257, height: 1, thumbnail: new Blob(['a'], { type: 'image/png' }) },
      { width: 1, height: 1, thumbnail: new Blob(['a'], { type: 'image/svg+xml' }) },
      { width: 1, height: 1, thumbnail: new Blob([new Uint8Array(512 * 1024 + 1)], { type: 'image/png' }) },
    ]) {
      const context = fixture({
        async decode() {
          return decoded
        },
      })
      await expect(context.acquire()).rejects.toBeInstanceOf(Error)
      expect(context.created).toHaveLength(0)
    }
    const oriented = fixture({
      async decode() {
        return { width: 1, height: 2 }
      },
    })
    await oriented.acquire('full')
    oriented.controller.dispose()
    const wrong = fixture({
      async decode() {
        return { width: 10, height: 10 }
      },
    })
    await expect(wrong.acquire('full')).rejects.toMatchObject({ code: 'CONTENT_MISMATCH' })
  })
})
