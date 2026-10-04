import { createStore } from 'zustand/vanilla'
import { CommandError } from '@hbar/commands'
import { sessionPageSchema, type SessionListInput } from '@hbar/contracts/directory'
import type { StateReader } from '@hbar/app-runtime'

export interface WorkspaceSessionTargetsState {
  readonly workspaceId: string | null
  readonly sessionIds: readonly string[]
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly error: string | null
  readonly capacityReached: boolean
}
export interface WorkspaceSessionTargetsPort {
  list(input: SessionListInput, signal: AbortSignal): Promise<unknown>
}

/** Owns only catalog IDs; session facts remain in the Runtime directory projection. */
export function createWorkspaceSessionTargets(port: WorkspaceSessionTargetsPort) {
  const store = createStore<WorkspaceSessionTargetsState>(() => ({
    workspaceId: null,
    sessionIds: [],
    status: 'idle',
    error: null,
    capacityReached: false,
  }))
  let disposed = false
  let generation = 0
  let active: AbortController | undefined
  let pending: Promise<void> | undefined
  let leases = 0
  let releaseEpoch = 0
  const subscriptions = new Set<() => void>()
  const reader: StateReader<WorkspaceSessionTargetsState> = {
    getSnapshot: store.getState,
    subscribe(listener) {
      if (disposed) return () => undefined
      const unsubscribe = store.subscribe(listener)
      subscriptions.add(unsubscribe)
      return () => {
        subscriptions.delete(unsubscribe)
        unsubscribe()
      }
    },
  }
  const refresh = (workspaceId: string): Promise<void> => {
    if (disposed) return Promise.reject(new CommandError('DISPOSED', 'Session target catalog was disposed'))
    if (pending && reader.getSnapshot().workspaceId === workspaceId) return pending
    active?.abort(new CommandError('QUERY_SUPERSEDED', 'Session target workspace changed'))
    const token = ++generation
    const controller = new AbortController()
    active = controller
    store.setState({ workspaceId, sessionIds: [], status: 'loading', error: null, capacityReached: false }, true)
    const timeout = setTimeout(
      () => controller.abort(new CommandError('TIMEOUT', 'Session target query timed out')),
      10_000,
    )
    let removeAbort: () => void = () => undefined
    const interrupted = new Promise<never>((_resolve, reject) => {
      const onAbort = () =>
        reject(
          controller.signal.reason instanceof Error
            ? controller.signal.reason
            : new CommandError('CANCELLED', 'Session target query interrupted'),
        )
      controller.signal.addEventListener('abort', onAbort, { once: true })
      removeAbort = () => controller.signal.removeEventListener('abort', onAbort)
    })
    const operation = (async () => {
      const ids = new Set<string>()
      let after: string | null = null
      const cursors = new Set<string>()
      for (let pageIndex = 0; pageIndex < 4; pageIndex++) {
        const result = await Promise.race([
          port.list({ workspaceId, limit: 100, ...(after ? { after } : {}) }, controller.signal),
          interrupted,
        ])
        const page = sessionPageSchema.parse(result)
        if (disposed || token !== generation || controller.signal.aborted) return
        if (page.items.some((session) => session.workspaceId !== workspaceId))
          throw new CommandError('INVALID_OUTPUT', 'Session target page belongs to another workspace')
        for (const session of page.items) if (!session.archived) ids.add(session.id)
        after = page.nextCursor
        if (!after) break
        if (cursors.has(after)) throw new CommandError('INVALID_OUTPUT', 'Session target cursor did not advance')
        cursors.add(after)
      }
      if (!disposed && token === generation)
        store.setState(
          {
            workspaceId,
            sessionIds: [...ids].slice(0, 400),
            status: 'ready',
            error: null,
            capacityReached: after !== null,
          },
          true,
        )
    })()
      .catch((reason: unknown) => {
        if (disposed || token !== generation) return
        const error =
          reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
            ? reason.code
            : 'QUERY_FAILED'
        store.setState({ workspaceId, sessionIds: [], status: 'error', error, capacityReached: false }, true)
      })
      .finally(() => {
        clearTimeout(timeout)
        removeAbort()
        if (pending === operation) pending = undefined
        if (active === controller) active = undefined
      })
    pending = operation
    return operation
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    generation++
    active?.abort(new CommandError('DISPOSED', 'Session target catalog was disposed'))
    for (const unsubscribe of subscriptions) unsubscribe()
    subscriptions.clear()
  }
  return {
    reader,
    refresh,
    dispose,
    retain() {
      leases++
      releaseEpoch++
      let released = false
      return () => {
        if (released) return
        released = true
        leases--
        const epoch = ++releaseEpoch
        queueMicrotask(() => {
          if (leases === 0 && epoch === releaseEpoch) dispose()
        })
      }
    },
  }
}
