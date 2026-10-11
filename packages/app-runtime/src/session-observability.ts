import { CommandError } from '@hbar/commands'
import {
  sessionObservabilityReportSchema,
  type SessionObservabilityInput,
  type SessionObservabilityReport,
  type ObservabilityScope,
  type ObservabilityDetail,
} from '@hbar/contracts/session-observability'
import { createState, type StateReader } from './state'

export interface SessionObservabilityState {
  readonly sessionId: string
  readonly scope: ObservabilityScope
  readonly anchor: number | null
  readonly detail: ObservabilityDetail
  readonly status: 'idle' | 'loading' | 'error'
  readonly error: string | null
  readonly report: SessionObservabilityReport | null
  readonly connected: boolean
  readonly page: number
  readonly firstPage: number
}
export interface SessionObservabilityReader {
  readonly reader: StateReader<SessionObservabilityState>
  /** Releasing the last view disposes after React's same-turn effect reattachment boundary. */
  retain(): () => void
  setConnected(connected: boolean): void
  select(scope: ObservabilityScope, anchor?: number): void
  detail(detail: ObservabilityDetail): void
  nextPage(): void
  previousPage(): void
  refresh(): void
  dispose(): void
}

export function createSessionObservabilityReaders(options: {
  readonly read?: ((input: SessionObservabilityInput) => Promise<SessionObservabilityReport>) | undefined
  readonly updates?: StateReader<{ readonly sessionId: string | null; readonly cursor: number }> | undefined
  readonly onSubscriberError?: ((error: unknown) => void) | undefined
}) {
  const owners = new Set<SessionObservabilityReader>()
  let disposed = false
  return {
    available: Boolean(options.read),
    create(sessionId: string): SessionObservabilityReader {
      if (disposed) throw new CommandError('DISPOSED', 'Session statistics readers are disposed')
      if (owners.size >= 16) throw new CommandError('CAPACITY_LIMIT', 'Too many Session statistics readers')
      const state = createState<SessionObservabilityState>(
        {
          sessionId,
          scope: 'session',
          anchor: null,
          detail: 'skills',
          status: 'idle',
          error: null,
          report: null,
          connected: false,
          page: 1,
          firstPage: 1,
        },
        options.onSubscriberError ?? (() => {}),
      )
      let closed = false,
        generation = 0,
        inFlight = false,
        dirty = false
      let timer: ReturnType<typeof setTimeout> | undefined
      let polling: ReturnType<typeof setInterval> | undefined
      let unsubscribe: (() => void) | undefined
      let cursor: number | undefined
      let leases = 0
      const pages: (string | undefined)[] = [undefined]
      const replace = (change: Partial<SessionObservabilityState>) =>
        state.replace({ ...state.reader.getSnapshot(), ...change })
      const schedule = () => {
        if (closed || disposed || !state.reader.getSnapshot().connected || !options.read) return
        dirty = true
        if (inFlight || timer) return
        timer = setTimeout(() => {
          timer = undefined
          void load()
        }, 250)
      }
      const load = async () => {
        const read = options.read
        if (!read || inFlight || closed || disposed || !state.reader.getSnapshot().connected) return
        inFlight = true
        dirty = false
        const selection = generation
        const current = state.reader.getSnapshot()
        replace({ status: 'loading', error: null })
        try {
          const after = pages[current.page - current.firstPage]
          const report = sessionObservabilityReportSchema.parse(
            await read({
              sessionId,
              scope: current.scope,
              detail: current.detail,
              ...(current.anchor === null ? {} : { anchor: current.anchor }),
              ...(after ? { after } : {}),
              limit: 20,
            }),
          )
          if (closed || disposed || selection !== generation) return
          if (
            report.sessionId !== sessionId ||
            report.range.scope !== current.scope ||
            report.detail !== current.detail ||
            (current.anchor !== null && report.range.anchor !== current.anchor)
          )
            throw new CommandError('INVALID_STATE', 'Session statistics identity mismatch')
          replace({ report, status: 'idle', error: null })
        } catch (error) {
          if (!closed && !disposed && selection === generation)
            replace({ status: 'error', error: error instanceof CommandError ? error.code : 'STATISTICS_UNAVAILABLE' })
        } finally {
          inFlight = false
          if (dirty) schedule()
        }
      }
      const reset = (change: Partial<SessionObservabilityState>, clearReport: boolean) => {
        generation++
        pages.splice(0, pages.length, undefined)
        replace({ ...change, page: 1, firstPage: 1, error: null, ...(clearReport ? { report: null } : {}) })
        schedule()
      }
      const owner: SessionObservabilityReader = {
        reader: state.reader,
        retain() {
          if (closed || disposed) return () => {}
          owners.add(owner)
          leases++
          let released = false
          return () => {
            if (released) return
            released = true
            leases--
            queueMicrotask(() => {
              if (leases === 0) owner.dispose()
            })
          }
        },
        setConnected(connected) {
          if (closed || disposed || state.reader.getSnapshot().connected === connected) return
          owners.add(owner)
          generation++
          replace({ connected, status: 'idle' })
          clearInterval(polling)
          unsubscribe?.()
          unsubscribe = undefined
          if (connected) {
            polling = setInterval(schedule, 5_000)
            unsubscribe = options.updates?.subscribe(() => {
              const snapshot = options.updates?.getSnapshot()
              if (snapshot?.sessionId === sessionId && snapshot.cursor !== cursor) {
                cursor = snapshot.cursor
                schedule()
              }
            })
            schedule()
          } else {
            clearTimeout(timer)
            timer = undefined
            dirty = false
          }
        },
        select: (scope, anchor) => reset({ scope, anchor: anchor ?? null }, true),
        detail: (detail) => reset({ detail }, false),
        nextPage() {
          const current = state.reader.getSnapshot()
          if (!current.report?.nextCursor || current.status === 'loading') return
          generation++
          pages[current.page - current.firstPage + 1] = current.report.nextCursor
          pages.splice(current.page - current.firstPage + 2)
          const firstPage = current.firstPage + Number(pages.length > 100)
          if (pages.length > 100) pages.shift()
          replace({
            page: current.page + 1,
            firstPage,
            ...(current.scope !== 'session' && current.anchor === null ? { anchor: current.report.range.anchor } : {}),
          })
          schedule()
        },
        previousPage() {
          const current = state.reader.getSnapshot()
          if (current.page <= current.firstPage || current.status === 'loading') return
          generation++
          replace({ page: current.page - 1 })
          schedule()
        },
        refresh: schedule,
        dispose() {
          if (closed) return
          closed = true
          generation++
          clearTimeout(timer)
          clearInterval(polling)
          unsubscribe?.()
          owners.delete(owner)
          state.dispose()
        },
      }
      return owner
    },
    dispose() {
      disposed = true
      for (const owner of owners) owner.dispose()
    },
  }
}
