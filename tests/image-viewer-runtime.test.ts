import { expect, test } from 'bun:test'
import { CommandError } from '@hbar/commands'
import {
  createImageViewer,
  IMAGE_VIEWER_MAX_ITEMS,
  type ImageResourceLease,
  type ImageResourcePort,
  type ImageViewer,
  type ImageViewerRequest,
  type ImageViewerSource,
} from '@hbar/app-runtime'

const artifact = (id = 'a', name = '同名 image.png') => ({ id: id.repeat(64), name, mime: 'image/png', size: 100 })
const draft: ImageViewerSource = { kind: 'draft', sessionId: 'session-a', draftRevision: 7 }
function request(activeKey = 'occurrence-a', source: ImageViewerSource = draft): ImageViewerRequest {
  return {
    source,
    items: [
      { key: 'occurrence-a', artifact: artifact('a') },
      { key: 'occurrence-b', artifact: artifact('b') },
    ],
    activeKey,
  }
}

function fixture(validate: (request: ImageViewerRequest) => boolean = () => true) {
  const calls: {
    readonly artifact: Parameters<ImageResourcePort['acquire']>[0]
    readonly signal: AbortSignal
    readonly purpose: 'full' | 'thumbnail'
    readonly resolve: (lease: ImageResourceLease) => void
    readonly reject: (error: unknown) => void
  }[] = []
  const leases: { readonly lease: ImageResourceLease; releases: number }[] = []
  const validations: ImageViewerRequest[] = []
  let allowed = true
  let actual = 0
  let maximumActual = 0
  let live = 0
  let maximumLive = 0
  let writes = 0
  const resources = {
    acquire(ref: Parameters<ImageResourcePort['acquire']>[0], options: Parameters<ImageResourcePort['acquire']>[1]) {
      const deferred = Promise.withResolvers<ImageResourceLease>()
      actual++
      maximumActual = Math.max(maximumActual, actual)
      calls.push({
        artifact: ref,
        signal: options.signal,
        purpose: options.purpose,
        resolve: deferred.resolve,
        reject: deferred.reject,
      })
      // Deliberately ignore abort. The actual slot ends only on real settlement.
      return deferred.promise.finally(() => {
        actual--
      })
    },
    upload() {
      writes++
    },
    remove() {
      writes++
    },
  }
  const viewer = createImageViewer({
    resources,
    isCurrent(value) {
      validations.push(value)
      return allowed && validate(value)
    },
  })
  const makeLease = (
    name = 'image',
    properties: Partial<Pick<ImageResourceLease, 'url' | 'width' | 'height'>> = {},
  ) => {
    live++
    maximumLive = Math.max(maximumLive, live)
    const entry = {
      releases: 0,
      lease: {
        url: `blob:http://fixture.invalid/${name}`,
        width: 640,
        height: 480,
        ...properties,
        release() {
          entry.releases++
          if (entry.releases === 1) live--
        },
      },
    }
    leases.push(entry)
    return entry
  }
  return {
    viewer,
    calls,
    leases,
    validations,
    makeLease,
    setCurrent(value: boolean) {
      allowed = value
    },
    counts: () => ({ actual, maximumActual, live, maximumLive, writes }),
    settle(
      index: number,
      name = `image-${index}`,
      properties: Partial<Pick<ImageResourceLease, 'url' | 'width' | 'height'>> = {},
    ) {
      const call = calls[index]
      if (!call) throw new Error('Missing captured acquire')
      const result = makeLease(name, properties)
      call.resolve(result.lease)
      return result
    },
    reject(index: number, error: unknown) {
      const call = calls[index]
      if (!call) throw new Error('Missing captured acquire')
      call.reject(error)
    },
  }
}
const turn = () => Bun.sleep(0)

test('DOM decode failure binds the exact ready snapshot, releases once and retries only the original read', async () => {
  const testbed = fixture()
  testbed.viewer.open(request())
  const first = testbed.settle(0)
  await turn()
  const rendered = testbed.viewer.reader.getSnapshot()
  testbed.viewer.reportDecodeFailure(rendered)
  testbed.viewer.reportDecodeFailure(rendered)
  expect(first.releases).toBe(1)
  expect(testbed.viewer.reader.getSnapshot()).toMatchObject({
    status: 'failed',
    error: 'DECODE_FAILED',
    resource: null,
  })
  expect(testbed.calls).toHaveLength(1)
  testbed.viewer.retry()
  expect(testbed.calls).toHaveLength(2)
  expect(testbed.calls[1]?.artifact).toEqual(testbed.calls[0]?.artifact)
  testbed.settle(1)
  await turn()
  expect(testbed.viewer.reader.getSnapshot().status).toBe('ready')
  expect(testbed.counts().writes).toBe(0)
  testbed.viewer.dispose()
})

test('old DOM decode error cannot damage ABA gallery even when the occurrence and URL repeat', async () => {
  const testbed = fixture()
  testbed.viewer.open(request())
  const first = testbed.settle(0, 'reused-url')
  await turn()
  const old = testbed.viewer.reader.getSnapshot()
  testbed.viewer.close()
  testbed.viewer.open(request())
  const next = testbed.settle(1, 'reused-url')
  await turn()
  const current = testbed.viewer.reader.getSnapshot()
  expect(current.resource?.url).toBe(old.resource?.url)
  testbed.viewer.reportDecodeFailure(old)
  expect(testbed.viewer.reader.getSnapshot()).toBe(current)
  expect(first.releases).toBe(1)
  expect(next.releases).toBe(0)
  testbed.viewer.dispose()
})

test('viewer captures immutable source/occurrences, publishes only safe metadata, and closes without writes', async () => {
  const testbed = fixture()
  const mutable = {
    ...request(),
    source: { ...draft },
    items: [...request().items].map((item) => ({ ...item, artifact: { ...item.artifact } })),
  }
  try {
    testbed.viewer.open(mutable)
    expect(testbed.viewer.reader.getSnapshot().status).toBe('loading')
    mutable.source.sessionId = 'mutated-after-open'
    const first = mutable.items[0]
    if (!first) throw new Error('Missing fixture item')
    first.artifact.name = 'mutated caption'
    mutable.items.pop()
    expect(testbed.calls[0]?.purpose).toBe('full')
    expect(testbed.calls[0]?.artifact.name).toBe('同名 image.png')
    const retained = testbed.viewer.reader.getSnapshot().request
    expect(retained?.source).toMatchObject({ sessionId: 'session-a' })
    expect(retained?.items).toHaveLength(2)
    expect(Object.isFrozen(retained?.source)).toBe(true)
    expect(Object.isFrozen(retained?.items[0]?.artifact)).toBe(true)
    const resource = testbed.settle(0)
    await turn()
    const state = testbed.viewer.reader.getSnapshot()
    expect(state).toMatchObject({
      status: 'ready',
      resource: { url: resource.lease.url, width: 640, height: 480 },
      error: null,
    })
    expect(Object.keys(state.resource ?? {}).sort()).toEqual(['height', 'url', 'width'])
    expect(JSON.stringify(state)).not.toContain('bytes')
    testbed.viewer.close()
    testbed.viewer.close()
    expect(testbed.viewer.reader.getSnapshot()).toEqual({
      status: 'closed',
      request: null,
      resource: null,
      error: null,
    })
    expect(resource.releases).toBe(1)
    expect(testbed.counts()).toEqual({ actual: 0, maximumActual: 1, live: 0, maximumLive: 1, writes: 0 })
  } finally {
    testbed.viewer.dispose()
  }
})

test('switching releases the ready full lease before acquiring its next occurrence', async () => {
  const testbed = fixture()
  try {
    testbed.viewer.open(request())
    const first = testbed.settle(0)
    await turn()
    testbed.viewer.select('occurrence-b')
    expect(first.releases).toBe(1)
    expect(testbed.viewer.reader.getSnapshot()).toMatchObject({
      status: 'loading',
      resource: null,
      request: { activeKey: 'occurrence-b' },
    })
    expect(testbed.calls[1]?.artifact.id).toBe('b'.repeat(64))
    testbed.settle(1)
    await turn()
    expect(testbed.counts().maximumLive).toBe(1)
    testbed.viewer.close()
    testbed.viewer.open(request('occurrence-b'))
    expect(testbed.calls).toHaveLength(3)
    testbed.settle(2)
    await turn()
    expect(testbed.counts().writes).toBe(0)
  } finally {
    testbed.viewer.dispose()
  }
})

test('A-B-A uses a new generation and one latest intention without pretending Abort freed the actual slot', async () => {
  const testbed = fixture()
  const seen: string[] = []
  const unsubscribe = testbed.viewer.reader.subscribe(() => {
    const state = testbed.viewer.reader.getSnapshot()
    if (state.status === 'ready') seen.push(state.resource.url)
  })
  try {
    testbed.viewer.open(request())
    testbed.viewer.select('occurrence-b')
    testbed.viewer.select('occurrence-a')
    expect(testbed.calls).toHaveLength(1)
    expect(testbed.calls[0]?.signal.aborted).toBe(true)
    expect(testbed.counts().actual).toBe(1)
    const stale = testbed.settle(0, 'old-A')
    await turn()
    expect(stale.releases).toBe(1)
    expect(seen).toEqual([])
    expect(testbed.calls).toHaveLength(2)
    expect(testbed.calls[1]?.artifact.id).toBe('a'.repeat(64))
    const fresh = testbed.settle(1, 'new-A')
    await turn()
    expect(seen).toEqual([fresh.lease.url])
    expect(testbed.counts().maximumActual).toBe(1)
    expect(testbed.counts().maximumLive).toBe(1)
    expect(testbed.counts().writes).toBe(0)
  } finally {
    unsubscribe()
    testbed.viewer.dispose()
  }
})

test('many rapid selections retain only the newest candidate while an uncooperative acquisition settles', async () => {
  const testbed = fixture()
  try {
    testbed.viewer.open(request())
    for (let index = 0; index < 100; index++) testbed.viewer.select(index % 2 ? 'occurrence-b' : 'occurrence-a')
    expect(testbed.calls).toHaveLength(1)
    testbed.reject(0, new Error('Private body and credential must never appear'))
    await turn()
    expect(testbed.calls).toHaveLength(2)
    expect(testbed.viewer.reader.getSnapshot()).toMatchObject({
      status: 'loading',
      error: null,
      request: { activeKey: 'occurrence-b' },
    })
    testbed.settle(1, 'latest')
    await turn()
    expect(testbed.viewer.reader.getSnapshot().status).toBe('ready')
    expect(testbed.counts().maximumActual).toBe(1)
  } finally {
    testbed.viewer.dispose()
  }
})

test('closing drops queued work, and a late success is released without reopening the gallery', async () => {
  const testbed = fixture()
  testbed.viewer.open(request())
  testbed.viewer.select('occurrence-b')
  testbed.viewer.close()
  const late = testbed.settle(0)
  await turn()
  expect(late.releases).toBe(1)
  expect(testbed.calls).toHaveLength(1)
  expect(testbed.viewer.reader.getSnapshot().status).toBe('closed')
  expect(testbed.counts().writes).toBe(0)
  testbed.viewer.dispose()
})

test('close then reopen does not consume the old receipt even with the same source and active key', async () => {
  const testbed = fixture()
  try {
    testbed.viewer.open(request())
    testbed.viewer.close()
    testbed.viewer.open(request())
    expect(testbed.calls).toHaveLength(1)
    testbed.reject(0, { code: 'UNAUTHORIZED', message: 'stale private text' })
    await turn()
    expect(testbed.calls).toHaveLength(2)
    expect(testbed.viewer.reader.getSnapshot()).toMatchObject({ status: 'loading', error: null })
    testbed.settle(1, 'reopened')
    await turn()
    expect(testbed.viewer.reader.getSnapshot().status).toBe('ready')
  } finally {
    testbed.viewer.dispose()
  }
})

test('source membership invalidation closes ready content; text-only draft revision policy remains canonical-owned', async () => {
  let canonicalRevision = 7
  const checked: { captured: number; canonical: number }[] = []
  const testbed = fixture((value) => {
    if (value.source.kind === 'draft')
      checked.push({ captured: value.source.draftRevision, canonical: canonicalRevision })
    return value.source.kind !== 'pre-session-draft' && value.source.sessionId === 'session-a'
  })
  try {
    testbed.viewer.open(request())
    const current = testbed.settle(0)
    await turn()
    // The canonical source has changed, but its image membership is unchanged.
    // The injected validator deliberately does not require revision equality.
    canonicalRevision = 8
    testbed.viewer.revalidate()
    expect(checked.at(-1)).toEqual({ captured: 7, canonical: 8 })
    expect(testbed.viewer.reader.getSnapshot().status).toBe('ready')
    expect(testbed.calls).toHaveLength(1)
    testbed.setCurrent(false)
    testbed.viewer.revalidate()
    expect(current.releases).toBe(1)
    expect(testbed.viewer.reader.getSnapshot().status).toBe('closed')
    expect(testbed.counts().writes).toBe(0)
  } finally {
    testbed.viewer.dispose()
  }
})

for (const result of ['success', 'error'] as const) {
  test(`canonical membership is rechecked before publishing a late ${result}`, async () => {
    const testbed = fixture()
    try {
      testbed.viewer.open(request())
      testbed.setCurrent(false)
      if (result === 'success') testbed.settle(0, 'removed')
      else testbed.reject(0, { code: 'READ_FAILED' })
      await turn()
      expect(testbed.viewer.reader.getSnapshot().status).toBe('closed')
      expect(testbed.leases.every((item) => item.releases === 1)).toBe(true)
      expect(testbed.counts().live).toBe(0)
    } finally {
      testbed.viewer.dispose()
    }
  })
}

test('every action validates its original source and an invalid source dispatches no resource read', async () => {
  const testbed = fixture()
  try {
    testbed.setCurrent(false)
    testbed.viewer.open(request())
    expect(testbed.calls).toEqual([])
    expect(testbed.viewer.reader.getSnapshot().status).toBe('closed')
    testbed.setCurrent(true)
    testbed.viewer.open(request())
    testbed.reject(0, { code: 'READ_FAILED' })
    await turn()
    testbed.setCurrent(false)
    testbed.viewer.retry()
    expect(testbed.viewer.reader.getSnapshot().status).toBe('closed')
    expect(testbed.calls).toHaveLength(1)
    testbed.setCurrent(true)
    testbed.viewer.open(request())
    testbed.setCurrent(false)
    testbed.viewer.select('occurrence-b')
    expect(testbed.viewer.reader.getSnapshot().status).toBe('closed')
    testbed.settle(1)
    await turn()
    expect(testbed.calls).toHaveLength(2)
    expect(testbed.counts().live).toBe(0)
  } finally {
    testbed.viewer.dispose()
  }
})

test('same filename and same hash remain separate occurrences with an explicit active identity', async () => {
  const testbed = fixture()
  try {
    const same = artifact()
    testbed.viewer.open({
      source: { kind: 'message', sessionId: 'session-a', messageId: 'message-a', messageSeq: 17 },
      items: [
        { key: 'block-1', artifact: same },
        { key: 'block-5', artifact: same },
      ],
      activeKey: 'block-5',
    })
    testbed.settle(0)
    await turn()
    expect(testbed.viewer.reader.getSnapshot().request).toMatchObject({
      source: { messageId: 'message-a', messageSeq: 17 },
      activeKey: 'block-5',
    })
    testbed.viewer.select('block-1')
    testbed.settle(1)
    await turn()
    expect(testbed.viewer.reader.getSnapshot().request?.activeKey).toBe('block-1')
    expect(testbed.viewer.reader.getSnapshot().request?.items).toHaveLength(2)
  } finally {
    testbed.viewer.dispose()
  }
})

test('strict gallery capacity and identities reject malformed targets without reading or replacing a valid gallery', async () => {
  const testbed = fixture()
  try {
    const items = Array.from({ length: IMAGE_VIEWER_MAX_ITEMS }, (_, index) => ({
      key: `block-${index}`,
      artifact: artifact(),
    }))
    testbed.viewer.open({ source: draft, items, activeKey: 'block-0' })
    const original = testbed.viewer.reader.getSnapshot()
    expect(original.request?.items).toHaveLength(12)
    expect(() =>
      testbed.viewer.open({
        source: draft,
        items: [...items, { key: 'block-12', artifact: artifact() }],
        activeKey: 'block-0',
      }),
    ).toThrow(expect.objectContaining({ code: 'TOO_LARGE' }))
    const invalid: ImageViewerRequest[] = [
      { ...request(), items: [] },
      { ...request(), activeKey: 'missing' },
      { ...request(), source: { ...draft, sessionId: '' } },
      { ...request(), source: { kind: 'draft', sessionId: 's', draftRevision: -1 } },
      { ...request(), source: { kind: 'message', sessionId: 's', messageId: 'm', messageSeq: 0 } },
      {
        ...request(),
        items: [
          { key: 'same', artifact: artifact() },
          { key: 'same', artifact: artifact('b') },
        ],
        activeKey: 'same',
      },
      { ...request(), items: [{ key: 'occurrence-a', artifact: { ...artifact(), id: 'not-a-hash' } }] },
    ]
    for (const value of invalid)
      expect(() => testbed.viewer.open(value)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }))
    expect(() => testbed.viewer.select('missing')).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }))
    expect(testbed.viewer.reader.getSnapshot()).toBe(original)
    expect(testbed.calls).toHaveLength(1)
    testbed.settle(0)
    await turn()
    expect(testbed.counts().writes).toBe(0)
  } finally {
    testbed.viewer.dispose()
  }
})

for (const code of [
  'INVALID_INPUT',
  'UNSUPPORTED_IMAGE',
  'TOO_LARGE',
  'BUSY',
  'CANCELLED',
  'TIMEOUT',
  'UNAUTHORIZED',
  'NOT_FOUND',
  'READ_FAILED',
  'CONTENT_MISMATCH',
  'DISCONNECTED',
  'INVALID_IMAGE',
  'DECODE_FAILED',
  'UNAVAILABLE',
  'PRIVATE_UNRECOGNIZED',
] as const) {
  test(`resource failure exposes only the safe code (${code}), and explicit retry acquires fresh data`, async () => {
    const testbed = fixture()
    try {
      testbed.viewer.open(request())
      expect(() => testbed.viewer.retry()).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }))
      testbed.reject(0, { code, message: 'secret bearer and private server body' })
      await turn()
      expect(testbed.viewer.reader.getSnapshot()).toMatchObject({
        status: 'failed',
        error: code === 'PRIVATE_UNRECOGNIZED' ? 'READ_FAILED' : code,
        resource: null,
      })
      expect(JSON.stringify(testbed.viewer.reader.getSnapshot())).not.toContain('secret')
      testbed.viewer.retry()
      expect(testbed.calls).toHaveLength(2)
      testbed.settle(1, 'retried')
      await turn()
      expect(testbed.viewer.reader.getSnapshot().status).toBe('ready')
      expect(() => testbed.viewer.retry()).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }))
      expect(testbed.counts().writes).toBe(0)
    } finally {
      testbed.viewer.dispose()
    }
  })
}

for (const properties of [
  { url: 'https://untrusted.invalid/image.png' },
  { url: 'data:image/png;base64,not-allowed' },
  { url: 'blob:' },
  { width: 0 },
  { width: Infinity },
  { height: 1.2 },
]) {
  test(`invalid lease metadata is released before failure (${JSON.stringify(properties)})`, async () => {
    const testbed = fixture()
    try {
      testbed.viewer.open(request())
      const invalid = testbed.settle(0, 'invalid', properties)
      await turn()
      expect(invalid.releases).toBe(1)
      expect(testbed.viewer.reader.getSnapshot()).toMatchObject({
        status: 'failed',
        resource: null,
        error: 'INVALID_IMAGE',
      })
      expect(testbed.counts().live).toBe(0)
    } finally {
      testbed.viewer.dispose()
    }
  })
}

test('dispose closes and releases late resources once, removes subscriptions and cannot be restarted', async () => {
  const testbed = fixture()
  let publications = 0
  testbed.viewer.reader.subscribe(() => {
    publications++
  })
  testbed.viewer.open(request())
  testbed.viewer.dispose()
  const afterDispose = publications
  expect(testbed.calls[0]?.signal.aborted).toBe(true)
  expect(() => testbed.viewer.open(request())).toThrow(expect.objectContaining({ code: 'DISCONNECTED' }))
  expect(() => testbed.viewer.select('occurrence-a')).toThrow(expect.objectContaining({ code: 'DISCONNECTED' }))
  expect(() => testbed.viewer.retry()).toThrow(expect.objectContaining({ code: 'DISCONNECTED' }))
  testbed.viewer.close()
  testbed.viewer.revalidate()
  testbed.viewer.dispose()
  const late = testbed.settle(0)
  await turn()
  expect(late.releases).toBe(1)
  expect(publications).toBe(afterDispose)
  expect(testbed.viewer.reader.getSnapshot().status).toBe('closed')
  expect(testbed.calls).toHaveLength(1)
  expect(testbed.counts().writes).toBe(0)
})

test('a subscriber closing during loading cannot start a read after the closed publication', () => {
  const testbed = fixture()
  const unsubscribe = testbed.viewer.reader.subscribe(() => {
    if (testbed.viewer.reader.getSnapshot().status === 'loading') testbed.viewer.close()
  })
  testbed.viewer.open(request())
  expect(testbed.calls).toEqual([])
  expect(testbed.viewer.reader.getSnapshot().status).toBe('closed')
  unsubscribe()
  testbed.viewer.dispose()
})

test('a throwing membership validator fails closed and does not expose its exception', () => {
  let reads = 0
  const viewer = createImageViewer({
    resources: {
      acquire() {
        reads++
        return Promise.reject(new Error('must not read'))
      },
    },
    isCurrent() {
      throw new CommandError('PRIVATE_CODE', 'private membership body')
    },
  })
  viewer.open(request())
  expect(viewer.reader.getSnapshot()).toEqual({ status: 'closed', request: null, resource: null, error: null })
  expect(reads).toBe(0)
  viewer.dispose()
})

for (const when of ['open', 'publish'] as const) {
  test(`membership validation cannot close a newer owner created during ${when}`, async () => {
    const host: { viewer?: ImageViewer } = {}
    let retarget = when === 'open'
    const testbed = fixture((value) => {
      if (retarget && value.activeKey === 'occurrence-a') {
        retarget = false
        host.viewer?.open(request('occurrence-b'))
        return false
      }
      return true
    })
    host.viewer = testbed.viewer
    try {
      testbed.viewer.open(request())
      if (when === 'publish') {
        retarget = true
        const obsolete = testbed.settle(0, 'obsolete-A')
        await turn()
        expect(obsolete.releases).toBe(1)
      }
      const index = when === 'open' ? 0 : 1
      expect(testbed.calls[index]?.artifact.id).toBe('b'.repeat(64))
      expect(testbed.viewer.reader.getSnapshot()).toMatchObject({
        status: 'loading',
        request: { activeKey: 'occurrence-b' },
      })
      testbed.settle(index, 'newer-B')
      await turn()
      expect(testbed.viewer.reader.getSnapshot()).toMatchObject({
        status: 'ready',
        request: { activeKey: 'occurrence-b' },
      })
      expect(testbed.counts().writes).toBe(0)
    } finally {
      testbed.viewer.dispose()
    }
  })
}

test('an adapter cleanup failure stops the owner instead of claiming capacity has been released', async () => {
  const testbed = fixture()
  const first = testbed.calls
  let cleanupCalls = 0
  testbed.viewer.open(request())
  first[0]?.resolve({
    url: 'blob:http://fixture.invalid/cannot-release',
    width: 10,
    height: 10,
    release() {
      cleanupCalls++
      throw new Error('private adapter cleanup failure')
    },
  })
  await turn()
  expect(testbed.viewer.reader.getSnapshot().status).toBe('ready')
  testbed.viewer.select('occurrence-b')
  expect(cleanupCalls).toBe(1)
  expect(testbed.viewer.reader.getSnapshot().status).toBe('closed')
  expect(testbed.calls).toHaveLength(1)
  expect(() => testbed.viewer.open(request())).toThrow(expect.objectContaining({ code: 'DISCONNECTED' }))
  testbed.viewer.dispose()
  expect(cleanupCalls).toBe(1)
})

test('an exception with a throwing code accessor cannot escape or publish private text', async () => {
  const testbed = fixture()
  try {
    testbed.viewer.open(request())
    const malformed: object = Object.defineProperty({}, 'code', {
      get() {
        throw new Error('private accessor')
      },
    })
    testbed.reject(0, malformed)
    await turn()
    expect(testbed.viewer.reader.getSnapshot()).toMatchObject({
      status: 'failed',
      resource: null,
      error: 'READ_FAILED',
    })
    expect(JSON.stringify(testbed.viewer.reader.getSnapshot())).not.toContain('private')
  } finally {
    testbed.viewer.dispose()
  }
})
