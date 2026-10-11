import { CommandError } from '@hbar/commands'
import {
  runtimeReloadSchema,
  runtimeSnapshotSchema,
  type RuntimeReload,
  type RuntimeSnapshot,
} from '@hbar/contracts/runtime'
import { createState, type StateReader } from './state'

export interface HostRuntimeStatusState {
  readonly snapshot: RuntimeSnapshot | null
  readonly operations: readonly RuntimeReload[]
  readonly syncing: boolean
  readonly errorCode: string | null
}

export interface HostRuntimeStatusPort {
  state(): HostRuntimeStatusState
  subscribe(listener: (state: HostRuntimeStatusState) => void): () => void
  refresh(): Promise<void>
}

export type HostRuntimePhase =
  | 'unavailable'
  | 'initializing'
  | 'serving'
  | 'preparing'
  | 'prepared'
  | 'waiting'
  | 'recovering'
  | 'failed'
  | 'restart_required'

/** A Host owns the projection; visible readers share one transport subscription. */
export function createHostRuntimeStatus(
  hostId: string,
  port: HostRuntimeStatusPort | undefined,
  onSubscriberError: (error: unknown) => void,
) {
  const state = createState<HostRuntimeStatusState>(
    { snapshot: null, operations: [], syncing: false, errorCode: null },
    onSubscriberError,
  )
  let readers = 0
  let unsubscribe: (() => void) | undefined
  let disposed = false
  function accept(value: HostRuntimeStatusState) {
    if (disposed) return
    const snapshot = value.snapshot ? runtimeSnapshotSchema.parse(value.snapshot) : null
    if (snapshot && snapshot.instanceId !== hostId)
      throw new CommandError('HOST_IDENTITY_MISMATCH', 'Runtime status belongs to a different Host')
    const ids = new Set<string>()
    for (const unit of snapshot?.units ?? []) {
      if (
        ids.has(unit.descriptor.id) ||
        new Set(unit.generations.map((generation) => generation.generation)).size !== unit.generations.length
      )
        throw new CommandError('INVALID_RUNTIME_STATUS', 'Runtime status contains duplicate identities')
      ids.add(unit.descriptor.id)
    }
    if (value.operations.length > 64)
      throw new CommandError('INVALID_RUNTIME_STATUS', 'Runtime operation history exceeds its capacity')
    const operations = value.operations.map((operation) => runtimeReloadSchema.parse(operation))
    state.replace({ snapshot, operations, syncing: value.syncing, errorCode: value.errorCode })
  }
  if (port) {
    try {
      accept(port.state())
    } catch (error) {
      onSubscriberError(error)
      state.replace({ snapshot: null, operations: [], syncing: false, errorCode: 'RUNTIME_STATUS_UNAVAILABLE' })
    }
  }
  const reader: StateReader<HostRuntimeStatusState> = Object.freeze({
    getSnapshot: state.reader.getSnapshot,
    subscribe(listener: () => void) {
      if (disposed) return () => undefined
      const off = state.reader.subscribe(listener)
      readers++
      if (readers === 1 && port) {
        try {
          unsubscribe = port.subscribe(accept)
        } catch (error) {
          onSubscriberError(error)
          state.replace({ ...state.reader.getSnapshot(), errorCode: 'RUNTIME_STATUS_UNAVAILABLE' })
        }
      }
      let closed = false
      return () => {
        if (closed) return
        closed = true
        off()
        readers--
        if (!readers) {
          unsubscribe?.()
          unsubscribe = undefined
        }
      }
    },
  })
  return {
    reader,
    async refresh() {
      if (disposed || !port) return
      try {
        await port.refresh()
      } catch (error) {
        onSubscriberError(error)
        state.replace({ ...state.reader.getSnapshot(), errorCode: 'RUNTIME_STATUS_UNAVAILABLE', syncing: false })
      }
    },
    dispose() {
      disposed = true
      unsubscribe?.()
      unsubscribe = undefined
      state.dispose()
    },
  }
}

export function hostRuntimePhase(state: HostRuntimeStatusState): HostRuntimePhase {
  const snapshot = state.snapshot
  if (!snapshot) return state.syncing ? 'initializing' : 'unavailable'
  if (
    snapshot.admission?.phase === 'recovering' ||
    snapshot.units.some((unit) =>
      unit.generations.some(
        (generation) => generation.role === 'default' && ['recovering', 'failed'].includes(generation.phase),
      ),
    )
  )
    return 'recovering'
  if (snapshot.admission?.phase === 'handover') return 'waiting'
  if (snapshot.admission?.phase === 'initializing') return 'initializing'
  const latest = state.operations.reduce<RuntimeReload | null>(
    (value, operation) => (!value || operation.updatedAt >= value.updatedAt ? operation : value),
    null,
  )
  const source = snapshot.sourceReload
  const updatePhase =
    source && source.phase !== 'idle' && source.updatedAt >= (latest?.updatedAt ?? 0) ? source.phase : latest?.phase
  if (updatePhase === 'restart_required') return 'restart_required'
  if (updatePhase === 'failed') return 'failed'
  if (
    updatePhase === 'waiting_capacity' ||
    snapshot.units.some((unit) =>
      unit.generations.some(
        (generation) =>
          generation.role === 'draining' && Object.values(generation.references).some((count) => count > 0),
      ),
    )
  )
    return 'waiting'
  if (
    updatePhase === 'building' ||
    updatePhase === 'applying' ||
    updatePhase === 'preparing' ||
    snapshot.units.some((unit) => unit.generations.some((generation) => generation.role === 'candidate'))
  )
    return 'preparing'
  if (updatePhase === 'prepared') return 'prepared'
  return state.errorCode || !snapshot.ready ? 'unavailable' : 'serving'
}
