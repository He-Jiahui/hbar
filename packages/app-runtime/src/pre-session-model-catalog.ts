import { CommandError, type CommandExecutor } from '@hbar/commands'
import { modelCommands, type ModelDescriptor } from '@hbar/contracts/commands/models'
import { createModelReadQueue } from './model-read-queue'
import { createState } from './state'
import type { RuntimeOptions } from './types'

export interface PreSessionModelCatalogState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error'
  readonly models: readonly ModelDescriptor[]
  readonly error: string | null
}

export interface PreSessionModelCatalogActions {
  /** The visible landing owns this lease; hidden views do not trigger catalog reads. */
  retain(): () => void
  refresh(): void
}

/** Read-only catalog projection, deliberately separate from the draft's explicit model/effort choices. */
export function createPreSessionModelCatalog(
  models: CommandExecutor | undefined,
  events: RuntimeOptions['modelEvents'],
  onSubscriberError: (error: unknown) => void,
) {
  const state = createState<PreSessionModelCatalogState>({ status: 'idle', models: [], error: null }, onSubscriberError)
  const reads = createModelReadQueue()
  let consumers = 0
  let connected = true
  let disposed = false
  let scheduled = false
  let generation = 0
  let pending: { readonly cancel: () => void } | null = null
  const active = () => !disposed && connected && consumers > 0
  const cancel = () => {
    generation += 1
    pending?.cancel()
    pending = null
    reads.cancel()
  }
  const failure = (error: string) => state.replace({ status: 'error', models: [], error })
  const refresh = () => {
    if (disposed || consumers === 0) return
    cancel()
    if (!connected) {
      failure('DISCONNECTED')
      return
    }
    const current = state.reader.getSnapshot()
    // Keep a confirmed menu and its selected label stable while revalidating in the background.
    state.replace({ ...current, status: current.status === 'ready' ? 'ready' : 'loading', error: null })
    if (scheduled) return
    scheduled = true
    queueMicrotask(() => {
      scheduled = false
      if (!active()) return
      const intent = generation
      const controller = new AbortController()
      const live = () => active() && generation === intent && !controller.signal.aborted
      const timeout = setTimeout(() => {
        if (!live()) return
        controller.abort()
        failure('TIMEOUT')
      }, 10_000)
      const request = {
        cancel() {
          controller.abort()
          clearTimeout(timeout)
        },
      }
      pending = request
      void reads
        .run(async (signal) => {
          if (!models) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Model commands are unavailable')
          const value = await models.execute('model.list', {}, { signal })
          const parsed = modelCommands['model.list'].output.safeParse(value)
          if (!parsed.success || new Set(parsed.data.map((model) => model.id)).size !== parsed.data.length)
            throw new CommandError('INVALID_OUTPUT', 'Model catalog is invalid')
          return parsed.data
        }, controller.signal)
        .then((catalog) => {
          if (live()) state.replace({ status: 'ready', models: catalog, error: null })
        })
        .catch((error: unknown) => {
          if (!live()) return
          failure(
            error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
              ? error.code
              : 'EXECUTION_FAILED',
          )
        })
        .finally(() => {
          clearTimeout(timeout)
          if (pending === request) pending = null
        })
    })
  }
  const offEvents = events?.subscribe(refresh)
  const offConnection = events?.onConnection?.((next) => {
    if (disposed || next === connected) return
    connected = next
    if (consumers > 0) refresh()
  })
  const actions: PreSessionModelCatalogActions = Object.freeze({
    retain() {
      if (disposed) return () => undefined
      consumers += 1
      if (consumers === 1) refresh()
      let released = false
      return () => {
        if (released || disposed) return
        released = true
        consumers -= 1
        if (consumers !== 0) return
        cancel()
        state.replace({ ...state.reader.getSnapshot(), status: 'idle', error: null })
      }
    },
    refresh,
  })
  return {
    reader: state.reader,
    actions,
    dispose() {
      if (disposed) return
      disposed = true
      offEvents?.()
      offConnection?.()
      cancel()
      reads.dispose()
      state.dispose()
    },
  }
}
