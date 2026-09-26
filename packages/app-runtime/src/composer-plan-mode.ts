import { z } from 'zod'
import { CommandError, defineCommand, type CommandExecutor, type CommandRegistry } from '@hbar/commands'
import { idSchema } from '@hbar/contracts'
import { configurationCommands } from '@hbar/contracts/commands/configuration'
import { createState, type StateReader } from './state'
import type { NavigationState } from './types'
import type { SessionExecutionPreparationPort } from './session-execution-preparation'

export type ComposerPlanMode = 'default' | 'plan'
export interface ComposerPlanModeEntry {
  readonly sessionId: string
  readonly mode: ComposerPlanMode | null
  readonly status: 'loading' | 'ready' | 'pending' | 'unknown' | 'failed'
  readonly error: string | null
  readonly revision: number
}
export interface ComposerPlanModeState {
  readonly available: boolean
  readonly entries: Readonly<Record<string, ComposerPlanModeEntry>>
}

const metadata = (name: string) => ({
  id: name,
  version: 1,
  owner: 'hbar.app-runtime',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'session' as const,
  category: 'agent.goal.plan',
  visibility: 'internal' as const,
  titleKey: `commands.${name}.title`,
  descriptionKey: `commands.${name}.description`,
  surfaces: ['api'] as ('api' | 'palette' | 'cli' | 'tui')[],
})
const session = z.strictObject({ sessionId: idSchema })
const output = session.extend({ mode: z.enum(['default', 'plan']).nullable() })
export const composerPlanModeCommands = {
  'composerPlanMode.refresh': defineCommand(metadata('composerPlanMode.refresh'), session, output),
  'composerPlanMode.setMode': defineCommand(
    metadata('composerPlanMode.setMode'),
    session.extend({ mode: z.enum(['default', 'plan']), expectedRevision: z.number().int().nonnegative() }),
    output,
  ),
  'composerPlanMode.reconcile': defineCommand(metadata('composerPlanMode.reconcile'), session, output),
}

const unknownCodes = new Set([
  'RESULT_UNKNOWN',
  'DISCONNECTED',
  'CONNECTION_CLOSED',
  'TIMEOUT',
  'TIMED_OUT',
  'CANCELLED',
  'EXECUTION_FAILED',
  'INVALID_OUTPUT',
])
const code = (error: unknown) =>
  error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'

/** Host mode is a durable session fact. A lost write reply must not be replayed or projected as confirmed. */
export function createComposerPlanMode(
  local: CommandRegistry,
  options: {
    readonly configuration?: CommandExecutor
    readonly preparation?: SessionExecutionPreparationPort | undefined
    readonly events?: {
      subscribe(listener: (sessionId: string) => void): () => void
      onConnection?(listener: (connected: boolean) => void): () => void
    }
    readonly navigation: StateReader<NavigationState>
    readonly isSubmissionLocked: (sessionId: string) => boolean
    readonly onSubscriberError: (error: unknown) => void
  },
) {
  const state = createState<ComposerPlanModeState>(
    { available: Boolean(options.configuration), entries: {} },
    options.onSubscriberError,
  )
  let disposed = false
  const generations = new Map<string, number>()
  const pending = new Map<string, { readonly mode: ComposerPlanMode; readonly key: string }>()
  const inFlight = new Set<string>()
  const invalidated = new Set<string>()
  const current = (sessionId: string) => state.reader.getSnapshot().entries[sessionId]
  const publish = (entry: ComposerPlanModeEntry) => {
    if (disposed) return
    const snapshot = state.reader.getSnapshot()
    if (!snapshot.entries[entry.sessionId] && Object.keys(snapshot.entries).length >= 100)
      throw new CommandError('BUSY', 'Too many session mode projections are open')
    state.replace({ ...snapshot, entries: { ...snapshot.entries, [entry.sessionId]: entry } })
  }
  const selected = (sessionId: string) => {
    if (disposed) throw new CommandError('DISPOSED', 'Composer mode was disposed')
    if (options.navigation.getSnapshot().sessionId !== sessionId)
      throw new CommandError('STALE_TARGET', 'Composer mode belongs to another session')
    if (!options.configuration) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Session modes are unavailable')
    return options.configuration
  }
  const read = async (sessionId: string, reconcile: boolean) => {
    const configuration = selected(sessionId)
    if (inFlight.has(sessionId)) throw new CommandError('BUSY', 'Session mode operation is in progress')
    const uncertainty = pending.get(sessionId)
    if (uncertainty && !reconcile) throw new CommandError('RESULT_UNKNOWN', 'Reconcile the original session mode write')
    inFlight.add(sessionId)
    const generation = (generations.get(sessionId) ?? 0) + 1
    generations.set(sessionId, generation)
    publish({
      sessionId,
      mode: null,
      status: uncertainty ? 'unknown' : 'loading',
      error: null,
      revision: current(sessionId)?.revision ?? 0,
    })
    try {
      const result = configurationCommands['mode.get'].output.parse(
        await configuration.execute('mode.get', { sessionId }),
      )
      if (disposed || generations.get(sessionId) !== generation)
        throw new CommandError('STALE_TARGET', 'Mode read was superseded')
      if (invalidated.has(sessionId)) throw new CommandError('RESULT_UNKNOWN', 'Host mode changed during the read')
      if (uncertainty && result.mode !== uncertainty.mode) {
        publish({
          sessionId,
          mode: null,
          status: 'unknown',
          error: 'RESULT_UNKNOWN',
          revision: current(sessionId)?.revision ?? 0,
        })
        throw new CommandError('RESULT_UNKNOWN', 'The original mode write has not been confirmed')
      }
      pending.delete(sessionId)
      publish({
        sessionId,
        mode: result.mode,
        status: 'ready',
        error: null,
        revision: (current(sessionId)?.revision ?? 0) + 1,
      })
      return { sessionId, mode: result.mode }
    } catch (error) {
      if (!disposed && generations.get(sessionId) === generation && !pending.has(sessionId))
        publish({
          sessionId,
          mode: null,
          status: 'failed',
          error: code(error),
          revision: current(sessionId)?.revision ?? 0,
        })
      throw error
    } finally {
      inFlight.delete(sessionId)
      if (
        invalidated.delete(sessionId) &&
        !pending.has(sessionId) &&
        options.navigation.getSnapshot().sessionId === sessionId &&
        !disposed
      )
        queueMicrotask(() => {
          void local.execute('composerPlanMode.refresh', { sessionId }).catch(() => undefined)
        })
    }
  }
  local.register(composerPlanModeCommands['composerPlanMode.refresh'], ({ sessionId }) => read(sessionId, false))
  local.register(composerPlanModeCommands['composerPlanMode.reconcile'], ({ sessionId }) => read(sessionId, true))
  local.register(
    composerPlanModeCommands['composerPlanMode.setMode'],
    async ({ sessionId, mode, expectedRevision }, execution) => {
      const configuration = selected(sessionId)
      const before = current(sessionId)
      if (
        !before ||
        before.status !== 'ready' ||
        before.mode === null ||
        inFlight.has(sessionId) ||
        pending.has(sessionId)
      )
        throw new CommandError('BUSY', 'Read or reconcile the Host session mode before changing it')
      if (before.revision !== expectedRevision) throw new CommandError('VERSION_CONFLICT', 'Session mode changed')
      if (options.isSubmissionLocked(sessionId)) throw new CommandError('BUSY', 'Composer submission is in progress')
      inFlight.add(sessionId)
      const generation = (generations.get(sessionId) ?? 0) + 1
      generations.set(sessionId, generation)
      const operation = { mode, key: crypto.randomUUID() }
      pending.set(sessionId, operation)
      publish({ sessionId, mode: null, status: 'pending', error: null, revision: before.revision })
      let dispatched = false
      try {
        const target = options.preparation ? await options.preparation.capture(sessionId, execution.signal) : undefined
        selected(sessionId)
        if (target) options.preparation?.assertCanPrepare(target)
        if (execution.signal.aborted) throw new CommandError('CANCELLED', 'Session mode preparation was cancelled')
        if (before.mode === mode) {
          pending.delete(sessionId)
          publish(before)
          return { sessionId, mode }
        }
        dispatched = true
        const result = configurationCommands['mode.set'].output.parse(
          await configuration.execute('mode.set', { sessionId, mode }, { idempotencyKey: operation.key }),
        )
        if (result.mode !== mode)
          throw new CommandError('INVALID_OUTPUT', 'Host mode response differs from the request')
        if (disposed || generations.get(sessionId) !== generation)
          throw new CommandError('STALE_TARGET', 'Mode write was superseded')
        // The Host emits mode.changed before the reply. Re-read when that (or a paired client's)
        // notification raced this write, so the visible projection is the Host's latest fact.
        const actual = invalidated.delete(sessionId)
          ? configurationCommands['mode.get'].output.parse(await configuration.execute('mode.get', { sessionId })).mode
          : mode
        if (invalidated.has(sessionId))
          throw new CommandError('RESULT_UNKNOWN', 'Host mode changed during confirmation')
        pending.delete(sessionId)
        publish({ sessionId, mode: actual, status: 'ready', error: null, revision: before.revision + 1 })
        return { sessionId, mode: actual }
      } catch (error) {
        if (!disposed && generations.get(sessionId) === generation) {
          const unknown = dispatched && unknownCodes.has(code(error))
          if (!unknown) pending.delete(sessionId)
          publish({
            sessionId,
            mode: null,
            status: unknown ? 'unknown' : 'failed',
            error: code(error),
            revision: before.revision,
          })
        }
        throw error
      } finally {
        inFlight.delete(sessionId)
        if (
          invalidated.delete(sessionId) &&
          !pending.has(sessionId) &&
          options.navigation.getSnapshot().sessionId === sessionId &&
          !disposed
        )
          queueMicrotask(() => {
            void local.execute('composerPlanMode.refresh', { sessionId }).catch(() => undefined)
          })
      }
    },
  )

  let selectedSession = options.navigation.getSnapshot().sessionId
  const unsubscribe = options.navigation.subscribe(() => {
    const next = options.navigation.getSnapshot().sessionId
    if (next === selectedSession) return
    selectedSession = next
    if (next && options.configuration && !inFlight.has(next)) {
      const command = pending.has(next) ? 'composerPlanMode.reconcile' : 'composerPlanMode.refresh'
      void local.execute(command, { sessionId: next }).catch(() => undefined)
    }
  })
  if (selectedSession && options.configuration)
    void local.execute('composerPlanMode.refresh', { sessionId: selectedSession }).catch(() => undefined)
  const unsubscribeEvents = options.events?.subscribe((sessionId) => {
    if (disposed || options.navigation.getSnapshot().sessionId !== sessionId) return
    if (inFlight.has(sessionId)) {
      invalidated.add(sessionId)
      return
    }
    const value = current(sessionId)
    publish({
      sessionId,
      mode: null,
      status: pending.has(sessionId) ? 'unknown' : 'loading',
      error: null,
      revision: value?.revision ?? 0,
    })
    if (!pending.has(sessionId)) void local.execute('composerPlanMode.refresh', { sessionId }).catch(() => undefined)
  })
  const unsubscribeConnection = options.events?.onConnection?.((connected) => {
    const sessionId = options.navigation.getSnapshot().sessionId
    if (!sessionId || disposed) return
    const before = current(sessionId)
    if (!connected) {
      if (inFlight.has(sessionId)) invalidated.add(sessionId)
      if (before && !pending.has(sessionId)) publish({ ...before, mode: null, status: 'failed', error: 'DISCONNECTED' })
      return
    }
    if (inFlight.has(sessionId)) {
      invalidated.add(sessionId)
      return
    }
    if (!pending.has(sessionId)) void local.execute('composerPlanMode.refresh', { sessionId }).catch(() => undefined)
  })
  const capture = (sessionId: string): ComposerPlanMode => {
    if (!options.configuration) return 'default'
    selected(sessionId)
    const value = current(sessionId)
    if (!value || value.status !== 'ready' || !value.mode || inFlight.has(sessionId))
      throw new CommandError('BUSY', 'Confirm the Host mode before sending')
    return value.mode
  }
  return {
    reader: state.reader,
    /** Capture the confirmed mode for one Run; never substitute a stale value during a write. */
    capture,
    /** A send always reads Host truth, including after a reconnect that missed mode.changed. */
    async captureFresh(sessionId: string): Promise<ComposerPlanMode> {
      if (!options.configuration) return 'default'
      await read(sessionId, false)
      return capture(sessionId)
    },
    dispose() {
      disposed = true
      unsubscribe()
      unsubscribeEvents?.()
      unsubscribeConnection?.()
      state.dispose()
      pending.clear()
      inFlight.clear()
      invalidated.clear()
    },
  }
}
