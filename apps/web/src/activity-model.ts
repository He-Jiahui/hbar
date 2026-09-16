import { createStore } from 'zustand/vanilla'
import type { RpcResults, SessionEvent } from '@hbar/contracts'
import policy from './activity-policy.json'

interface TraceState {
  readonly source: object
  readonly events: readonly SessionEvent[]
  readonly cursor: number
  readonly loading: boolean
  readonly partial: boolean
  readonly selectedId?: string | undefined
  readonly error?: string | undefined
}
export function createActivityModel(dependencies: {
  identity(): object | null
  resetError(): string
  follow(sessionId: string, cursor: number): Promise<RpcResults['session.follow']>
}) {
  const store = createStore<{ traces: Readonly<Record<string, TraceState>> }>(() => ({ traces: {} }))
  const requests = new Map<string, { source: object; target: number; promise: Promise<void> }>()
  function write(sessionId: string, record: TraceState) {
    store.setState((state) => ({
      traces: Object.fromEntries([
        ...Object.entries(state.traces)
          .filter(([id, value]) => id !== sessionId && value.source === record.source)
          .slice(-(policy.cachedSessions - 1)),
        [sessionId, record],
      ]),
    }))
  }
  async function load(sessionId: string, target: number): Promise<void> {
    const source = dependencies.identity()
    if (!source || !sessionId) return
    const pending = requests.get(sessionId)
    if (pending?.source === source) {
      pending.target = Math.max(pending.target, target)
      return pending.promise
    }
    const existing = store.getState().traces[sessionId]
    let record: TraceState =
      existing?.source === source
        ? existing
        : {
            source,
            events: [],
            cursor: Math.max(0, target - policy.initialEventWindow),
            loading: false,
            partial: target > policy.initialEventWindow,
          }
    const request = { source, target, promise: Promise.resolve() }
    requests.set(sessionId, request)
    request.promise = (async () => {
      write(sessionId, { ...record, loading: true, error: undefined })
      try {
        let resets = 0
        do {
          const cursor = record.cursor
          const result = await dependencies.follow(sessionId, cursor)
          if (dependencies.identity() !== source || requests.get(sessionId) !== request) return
          if (result.reset) {
            record = {
              ...record,
              events: [],
              selectedId: undefined,
              cursor: Math.max(0, result.cursor - policy.initialEventWindow),
              partial: true,
            }
            write(sessionId, { ...record, loading: true })
            if (++resets >= policy.resetRecoveryAttempts) throw new Error(dependencies.resetError())
            continue
          }
          const merged = [
            ...new Map([...record.events, ...result.events].map((event) => [event.eventId, event])).values(),
          ].sort((a, b) => a.seq - b.seq)
          const events = merged.slice(-policy.retainedEvents)
          const selectedId = store.getState().traces[sessionId]?.selectedId
          record = {
            source,
            events,
            cursor: result.cursor,
            loading: false,
            partial: record.partial || merged.length > events.length,
            selectedId: events.some((event) => event.eventId === selectedId) ? selectedId : undefined,
          }
          write(sessionId, record)
          if (result.cursor <= cursor || result.cursor >= request.target) break
        } while (dependencies.identity() === source)
      } catch (cause) {
        if (dependencies.identity() === source && requests.get(sessionId) === request)
          write(sessionId, { ...record, loading: false, error: cause instanceof Error ? cause.message : String(cause) })
      } finally {
        if (requests.get(sessionId) === request) requests.delete(sessionId)
      }
    })()
    return request.promise
  }
  return {
    store,
    load,
    select(sessionId: string, id: string | undefined) {
      const record = store.getState().traces[sessionId]
      if (!record || record.source !== dependencies.identity()) return
      write(sessionId, { ...record, selectedId: record.events.some((event) => event.eventId === id) ? id : undefined })
    },
  }
}
