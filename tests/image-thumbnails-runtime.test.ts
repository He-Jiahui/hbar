import { expect, test } from 'bun:test'
import {
  createImageThumbnails,
  IMAGE_THUMBNAILS_MAX_ITEMS,
  type ImageResourceLease,
  type ImageResourcePort,
  type ImageThumbnails,
  type ImageThumbnailsRequest,
} from '@hbar/app-runtime'

const artifact = (id = 'a', name = '同名 image.png') => ({ id: id.repeat(64), name, mime: 'image/png', size: 100 })
const request = (sourceId = 'host/session/collection', keys = ['first', 'second']): ImageThumbnailsRequest => ({
  sourceId,
  items: keys.map((key) => ({ key, artifact: artifact() })),
})
const turn = () => Bun.sleep(0)

test('thumbnail DOM error releases just the exact rendered occurrence and explicit retry performs one acquire', async () => {
  const context = fixture()
  context.owner.activate(request())
  const first = context.settle(0)
  await turn()
  const second = context.settle(1)
  await turn()
  const state = context.owner.reader.getSnapshot()
  const rendered = state.items[0]
  if (!rendered || !state.sourceId) throw new Error('Missing rendered thumbnail')
  context.owner.reportDecodeFailure(state.sourceId, rendered)
  context.owner.reportDecodeFailure(state.sourceId, rendered)
  expect(first.releases).toBe(1)
  expect(second.releases).toBe(0)
  expect(context.owner.reader.getSnapshot().items[0]).toMatchObject({
    status: 'failed',
    error: 'DECODE_FAILED',
    resource: null,
  })
  expect(context.calls).toHaveLength(2)
  context.owner.retry(rendered.key)
  expect(context.calls).toHaveLength(3)
  expect(context.calls[2]?.ref).toEqual(context.calls[0]?.ref)
  context.settle(2)
  await turn()
  expect(context.owner.reader.getSnapshot().items[0]?.status).toBe('ready')
  context.owner.dispose()
})

test('thumbnail ABA ignores old rendered state with identical key and URL', async () => {
  const context = fixture()
  context.owner.activate(request('A', ['same']))
  const first = context.settle(0, 'same-url')
  await turn()
  const old = context.owner.reader.getSnapshot().items[0]
  context.owner.deactivate()
  context.owner.activate(request('A', ['same']))
  const next = context.settle(1, 'same-url')
  await turn()
  const current = context.owner.reader.getSnapshot()
  if (!old) throw new Error('Missing old thumbnail')
  expect(current.items[0]?.resource?.url).toBe(old.resource?.url)
  context.owner.reportDecodeFailure('A', old)
  expect(context.owner.reader.getSnapshot()).toBe(current)
  expect(first.releases).toBe(1)
  expect(next.releases).toBe(0)
  context.owner.dispose()
})
function fixture(validate: (value: ImageThumbnailsRequest) => boolean = () => true) {
  const calls: {
    ref: Parameters<ImageResourcePort['acquire']>[0]
    signal: AbortSignal
    resolve(value: ImageResourceLease): void
    reject(error: unknown): void
  }[] = []
  let current = true
  let actual = 0
  let maximum = 0
  const owner = createImageThumbnails({
    resources: {
      acquire(ref, options) {
        expect(options.purpose).toBe('thumbnail')
        actual++
        maximum = Math.max(maximum, actual)
        const deferred = Promise.withResolvers<ImageResourceLease>()
        calls.push({ ref, signal: options.signal, resolve: deferred.resolve, reject: deferred.reject })
        return deferred.promise.finally(() => {
          actual--
        })
      },
    },
    isCurrent: (value) => current && validate(value),
  })
  const lease = (name: string, overrides: Partial<ImageResourceLease> = {}) => {
    const result = {
      releases: 0,
      lease: {
        url: `blob:https://fixture/${name}`,
        width: 128,
        height: 64,
        release() {
          result.releases++
        },
        ...overrides,
      },
    }
    return result
  }
  const settle = (index: number, name = String(index), overrides: Partial<ImageResourceLease> = {}) => {
    const entry = lease(name, overrides)
    const call = calls[index]
    if (!call) throw new Error('Missing fixture acquisition')
    call.resolve(entry.lease)
    return entry
  }
  return {
    owner,
    calls,
    settle,
    lease,
    setCurrent(value: boolean) {
      current = value
    },
    counts: () => ({ actual, maximum }),
  }
}

test('only activated visible collection reads serially; same-hash occurrences own separate bounded leases', async () => {
  const context = fixture()
  expect(context.calls).toHaveLength(0)
  expect(context.owner.reader.getSnapshot()).toEqual({ active: false, sourceId: null, items: [] })
  const input = request()
  context.owner.activate(input)
  expect(context.calls).toHaveLength(1)
  expect(context.owner.reader.getSnapshot().items.map((item) => item.status)).toEqual(['loading', 'idle'])
  const first = context.settle(0)
  await turn()
  expect(context.calls).toHaveLength(2)
  const second = context.settle(1)
  await turn()
  expect(context.owner.reader.getSnapshot().items.map((item) => item.resource?.url)).toEqual([
    first.lease.url,
    second.lease.url,
  ])
  expect(context.counts()).toEqual({ actual: 0, maximum: 1 })
  const snapshot = context.owner.reader.getSnapshot()
  expect(JSON.stringify(snapshot)).not.toContain('release')
  expect(JSON.stringify(snapshot)).not.toContain('bytes')
  context.owner.activate(input)
  context.owner.revalidate()
  expect(context.owner.reader.getSnapshot()).toBe(snapshot)
  context.owner.deactivate()
  context.owner.deactivate()
  expect(first.releases).toBe(1)
  expect(second.releases).toBe(1)
  context.owner.dispose()
})

test('capture is immutable and caption-only updates/reorder keep ready and in-flight occurrences', async () => {
  const context = fixture()
  const mutable = {
    sourceId: 'source',
    items: [
      { key: 'one', artifact: artifact() },
      { key: 'two', artifact: artifact('b') },
    ],
  }
  context.owner.activate(mutable)
  mutable.items[0]!.artifact.name = 'mutated caller'
  expect(context.calls[0]?.ref.name).toBe('同名 image.png')
  const first = context.settle(0)
  await turn()
  const next = {
    sourceId: 'source',
    items: [
      { key: 'two', artifact: artifact('b') },
      { key: 'one', artifact: artifact('a', '新版标题') },
    ],
  }
  context.owner.activate(next)
  expect(context.calls).toHaveLength(2)
  expect(context.calls[1]?.signal.aborted).toBe(false)
  expect(first.releases).toBe(0)
  context.settle(1)
  await turn()
  expect(context.owner.reader.getSnapshot().items.map((item) => item.key)).toEqual(['two', 'one'])
  expect(context.owner.reader.getSnapshot().items[1]?.artifact.name).toBe('新版标题')
  expect(Object.isFrozen(context.owner.reader.getSnapshot().items[1]?.artifact)).toBe(true)
  context.owner.dispose()
})

test('removed and changed artifacts release, unchanged remaining occurrence does not reread', async () => {
  const context = fixture()
  context.owner.activate(request())
  const first = context.settle(0)
  await turn()
  const second = context.settle(1)
  await turn()
  context.owner.activate({
    ...request(),
    items: [
      { key: 'second', artifact: artifact() },
      { key: 'first', artifact: artifact('b') },
    ],
  })
  expect(first.releases).toBe(1)
  expect(second.releases).toBe(0)
  expect(context.calls).toHaveLength(3)
  const changed = context.settle(2)
  await turn()
  context.owner.activate(request('host/session/collection', ['second']))
  expect(changed.releases).toBe(1)
  expect(context.calls).toHaveLength(3)
  context.owner.dispose()
  expect(second.releases).toBe(1)
})

test('A-B-A and a hundred updates keep one actual acquire and only latest bounded collection', async () => {
  const context = fixture()
  context.owner.activate(request('A', ['same']))
  for (let index = 0; index < 100; index++) context.owner.activate(request(index % 2 ? 'A' : 'B', ['same']))
  expect(context.calls).toHaveLength(1)
  expect(context.calls[0]?.signal.aborted).toBe(true)
  expect(context.counts().actual).toBe(1)
  const late = context.settle(0, 'old-A')
  await turn()
  expect(late.releases).toBe(1)
  expect(context.calls).toHaveLength(2)
  expect(context.owner.reader.getSnapshot().sourceId).toBe('A')
  const fresh = context.settle(1, 'new-A')
  await turn()
  expect(context.owner.reader.getSnapshot().items[0]?.resource?.url).toBe(fresh.lease.url)
  expect(context.counts().maximum).toBe(1)
  context.owner.dispose()
})

test('offscreen/deactivate drops waiting work and late successes; remount has fresh ownership', async () => {
  const context = fixture()
  context.owner.activate(request())
  context.owner.deactivate()
  expect(context.calls[0]?.signal.aborted).toBe(true)
  context.owner.activate(request())
  const stale = context.settle(0)
  await turn()
  expect(stale.releases).toBe(1)
  expect(context.calls).toHaveLength(2)
  context.owner.dispose()
  const disposed = context.settle(1)
  await turn()
  expect(disposed.releases).toBe(1)
  expect(context.calls).toHaveLength(2)
  expect(context.owner.reader.getSnapshot().active).toBe(false)
  expect(() => context.owner.activate(request())).toThrow('disposed')
})

test('capacity is explicit: zero, duplicate keys and thirteen reject without truncation or writes', async () => {
  const context = fixture()
  expect(() => context.owner.activate(request('source', []))).toThrow('Invalid')
  expect(() => context.owner.activate(request('source', ['same', 'same']))).toThrow('Invalid')
  try {
    context.owner.activate(
      request(
        'source',
        Array.from({ length: 13 }, (_, index) => String(index)),
      ),
    )
  } catch (error) {
    expect(error).toMatchObject({ code: 'TOO_LARGE' })
  }
  expect(context.calls).toHaveLength(0)
  context.owner.activate(
    request(
      'source',
      Array.from({ length: IMAGE_THUMBNAILS_MAX_ITEMS }, (_, index) => String(index)),
    ),
  )
  const leases = []
  for (let index = 0; index < IMAGE_THUMBNAILS_MAX_ITEMS; index++) {
    leases.push(context.settle(index))
    await turn()
  }
  expect(context.owner.reader.getSnapshot().items).toHaveLength(12)
  expect(context.calls).toHaveLength(12)
  context.owner.deactivate()
  expect(leases.every((item) => item.releases === 1)).toBe(true)
})

test('failure stays per occurrence and does not busy-poll; retry is explicit and only failed target reads', async () => {
  const context = fixture()
  context.owner.activate(request())
  context.calls[0]?.reject({ code: 'BUSY', message: 'private detail' })
  await turn()
  context.settle(1)
  await turn()
  expect(context.owner.reader.getSnapshot().items.map((item) => item.status)).toEqual(['failed', 'ready'])
  expect(context.owner.reader.getSnapshot().items[0]?.error).toBe('BUSY')
  context.owner.activate(request())
  context.owner.revalidate()
  await turn()
  expect(context.calls).toHaveLength(2)
  expect(() => context.owner.retry('second')).toThrow('Only failed')
  context.owner.retry('first')
  expect(context.calls).toHaveLength(3)
  context.calls[2]?.reject(new Error('secret response body'))
  await turn()
  expect(context.owner.reader.getSnapshot().items[0]?.error).toBe('READ_FAILED')
  expect(JSON.stringify(context.owner.reader.getSnapshot())).not.toContain('secret')
  context.owner.dispose()
})

test('canonical source invalidation and thrown callback fail closed at dispatch/receipt/revalidate', async () => {
  const context = fixture()
  context.setCurrent(false)
  context.owner.activate(request())
  expect(context.calls).toHaveLength(0)
  context.setCurrent(true)
  context.owner.activate(request())
  context.setCurrent(false)
  const stale = context.settle(0)
  await turn()
  expect(stale.releases).toBe(1)
  expect(context.owner.reader.getSnapshot().active).toBe(false)
  context.setCurrent(true)
  context.owner.activate(request('new', ['one']))
  const ready = context.settle(1)
  await turn()
  context.setCurrent(false)
  context.owner.revalidate()
  expect(ready.releases).toBe(1)
  context.owner.dispose()
  const throwing = fixture(() => {
    throw new Error('canonical unavailable')
  })
  throwing.owner.activate(request())
  expect(throwing.calls).toHaveLength(0)
  throwing.owner.dispose()
})

test('invalid lease is released and sanitized, and throwing release permanently fails closed', async () => {
  const context = fixture()
  context.owner.activate(request('source', ['one']))
  const malformed = context.settle(0, 'bad', { url: 'https://arbitrary.invalid/private' })
  await turn()
  expect(malformed.releases).toBe(1)
  expect(context.owner.reader.getSnapshot().items[0]?.error).toBe('INVALID_IMAGE')
  context.owner.retry('one')
  context.settle(1, 'throws', {
    release() {
      throw new Error('cleanup failed')
    },
  })
  await turn()
  context.owner.deactivate()
  expect(context.owner.reader.getSnapshot().active).toBe(false)
  expect(() => context.owner.activate(request())).toThrow('disposed')
})

test('subscriber and canonical callback reentry cannot dispatch or publish a superseded source', async () => {
  let owner: ImageThumbnails | undefined
  let redirected = false
  const context = fixture((value) => {
    if (value.sourceId === 'old' && !redirected) {
      redirected = true
      owner?.activate(request('new', ['new']))
    }
    return true
  })
  owner = context.owner
  owner.activate(request('old', ['old']))
  expect(owner.reader.getSnapshot().sourceId).toBe('new')
  expect(context.calls).toHaveLength(1)
  const off = owner.reader.subscribe(() => {
    if (owner?.reader.getSnapshot().items[0]?.status === 'ready') owner.deactivate()
  })
  const ready = context.settle(0)
  await turn()
  expect(ready.releases).toBe(1)
  expect(owner.reader.getSnapshot().active).toBe(false)
  off()
  owner.dispose()
})

test('loading subscriber deactivation prevents the dispatch and subscriber reporting failures cannot leak resources', async () => {
  const context = fixture()
  const off = context.owner.reader.subscribe(() => {
    if (context.owner.reader.getSnapshot().items[0]?.status === 'loading') context.owner.deactivate()
  })
  context.owner.activate(request())
  await turn()
  expect(context.calls).toHaveLength(0)
  expect(context.owner.reader.getSnapshot().active).toBe(false)
  off()
  context.owner.dispose()
  let releases = 0
  const reporting = createImageThumbnails({
    resources: {
      acquire: () =>
        Promise.resolve({
          url: 'blob:fixture',
          width: 1,
          height: 1,
          release() {
            releases++
          },
        }),
    },
    isCurrent: () => true,
    onSubscriberError() {
      throw new Error('reporter failure')
    },
  })
  reporting.reader.subscribe(() => {
    throw new Error('listener failure')
  })
  reporting.activate(request('source', ['one']))
  await turn()
  expect(reporting.reader.getSnapshot().items[0]?.status).toBe('ready')
  reporting.dispose()
  expect(releases).toBe(1)
})
