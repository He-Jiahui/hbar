import {
  createAppRuntime,
  projectSessionDraftImages,
  type ImageResourceLease,
  type ImageResourcePort,
  type SessionDraftState,
  type StateReader,
} from '@hbar/app-runtime'

function observed<Value>(initial: Value) {
  let value = initial
  const listeners = new Set<() => void>()
  const reader: StateReader<Value> = {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  return {
    reader,
    set(next: Value) {
      value = next
      for (const listener of [...listeners]) listener()
    },
    get: () => value,
    listeners: () => listeners.size,
  }
}
export function sessionImagesFixture(automatic = true) {
  const runtime = createAppRuntime({
    instanceId: 'image-hooks',
    hostId: 'host',
    directory: { execute: () => Promise.resolve({ items: [], nextCursor: null }) },
  })
  const draft: SessionDraftState = {
    sessionId: 'session-a',
    revision: 1,
    text: 'Keep draft',
    mentions: [],
    attachments: ['a', 'b'].map((value) => ({
      kind: 'image',
      artifact: { id: value.repeat(64), name: '图片.png', mime: 'image/png', size: 10 },
    })),
    attachmentTransfers: [],
    uploading: 0,
    uploadError: null,
    status: 'idle',
    error: null,
    lastOperationId: null,
  }
  const navigation = observed({
    ...runtime.view.state.navigation.getSnapshot(),
    sessionId: 'session-a',
    workspaceId: 'workspace',
  })
  const drafts = observed({ 'session-a': draft })
  const timeline = observed({ ...runtime.view.state.timeline.getSnapshot(), sessionId: 'session-a' })
  const view = {
    ...runtime.view,
    state: { ...runtime.view.state, navigation: navigation.reader, drafts: drafts.reader, timeline: timeline.reader },
  }
  const calls: {
    purpose: 'thumbnail' | 'full'
    signal: AbortSignal
    resolve(value: ImageResourceLease): void
    reject(error: unknown): void
  }[] = []
  const leases: { releases: number; lease: ImageResourceLease; purpose: 'thumbnail' | 'full' }[] = []
  let active = 0
  let maximum = 0
  const makeLease = (index: number) => {
    const call = calls[index]
    if (!call) throw new Error('Missing fixture call')
    const entry = {
      releases: 0,
      purpose: call.purpose,
      lease: {
        url: `blob:https://fixture/${index}`,
        width: 64,
        height: 32,
        release() {
          entry.releases++
        },
      },
    }
    leases.push(entry)
    return entry
  }
  const resources: ImageResourcePort = {
    acquire(_ref, options) {
      const deferred = Promise.withResolvers<ImageResourceLease>()
      active++
      maximum = Math.max(maximum, active)
      calls.push({
        purpose: options.purpose,
        signal: options.signal,
        resolve: deferred.resolve,
        reject: deferred.reject,
      })
      if (automatic) deferred.resolve(makeLease(calls.length - 1).lease)
      return deferred.promise.finally(() => {
        active--
      })
    },
  }
  const project = () => {
    const result = projectSessionDraftImages({ hostIdentity: 'host', draft: drafts.get()['session-a'] })
    if (!result) throw new Error('Missing image projection')
    return result
  }
  return {
    runtime,
    view,
    resources,
    navigation,
    drafts,
    timeline,
    calls,
    leases,
    project,
    makeLease,
    settle(index: number) {
      const lease = makeLease(index)
      calls[index]?.resolve(lease.lease)
      return lease
    },
    counts: () => ({
      calls: calls.length,
      live: leases.filter((lease) => lease.releases === 0).length,
      releases: leases.reduce((sum, lease) => sum + lease.releases, 0),
      active,
      maximum,
      subscriptions: navigation.listeners() + drafts.listeners() + timeline.listeners(),
    }),
  }
}
