import { z } from 'zod'
import { CommandError, defineCommand, type CommandExecutor, type CommandRegistry } from '@hbar/commands'
import { idSchema, maximumContextWindow, thinkingLevelSchema } from '@hbar/contracts'
import {
  modelCommands,
  modelConfigurationSchema,
  modelReceiptSchema,
  modelWriteResultSchema,
} from '@hbar/contracts/commands/models'
import type { ModelConfiguration } from '@hbar/contracts/commands/models'
import { createState, type StateReader } from './state'
import { createModelReadQueue } from './model-read-queue'
import type { ComposerModelState, NavigationState, SessionControlsState } from './types'
import type { SessionExecutionPreparationPort } from './session-execution-preparation'
import type { SessionExecutionTarget } from './session-execution-access'

const metadata = (id: string) => ({
  id,
  version: 1,
  owner: 'hbar.app-runtime',
  kind: 'command' as const,
  execution: 'client' as const,
  stateEffect: 'application' as const,
  scope: 'session' as const,
  category: 'model.configuration',
  titleKey: `commands.${id}.title`,
  descriptionKey: `commands.${id}.description`,
  surfaces: ['api'] as ('cli' | 'tui' | 'api' | 'palette')[],
  visibility: 'internal' as const,
  cancelMode: 'cooperative' as const,
  maxConcurrent: 8,
})
const sessionInput = z.strictObject({ sessionId: idSchema })
const refreshInput = sessionInput.extend({ retainReady: z.boolean().optional() })
const output = z.strictObject({ sessionId: idSchema })

/** Local ViewModel actions; the Host wire contract remains modelCommands. */
export const composerModelCommands = {
  'composerModel.refresh': defineCommand(metadata('composerModel.refresh'), refreshInput, output),
  'composerModel.selectModel': defineCommand(
    metadata('composerModel.selectModel'),
    sessionInput.extend({ modelId: idSchema }),
    output,
  ),
  'composerModel.selectThinking': defineCommand(
    metadata('composerModel.selectThinking'),
    sessionInput.extend({ thinkingLevel: thinkingLevelSchema }),
    output,
  ),
  'composerModel.reconcile': defineCommand(metadata('composerModel.reconcile'), sessionInput, output),
  'composerModel.selectMaxMode': defineCommand(
    metadata('composerModel.selectMaxMode'),
    sessionInput.extend({ enabled: z.boolean() }),
    output,
  ),
}

interface ModelProjection {
  readonly reader: StateReader<SessionControlsState>
  refreshModel(sessionId: string, execution?: { readonly signal: AbortSignal }, retainCurrent?: boolean): Promise<void>
  readModel(sessionId: string, execution?: { readonly signal: AbortSignal }): Promise<ModelConfiguration>
  commitModel(model: ModelConfiguration, expectedGeneration?: number): boolean
  captureModelGeneration(): number
  invalidateModels(): void
  setConnected(connected: boolean): void
}
type WriteOperation =
  | { readonly name: 'session.setModel'; readonly input: z.output<(typeof modelCommands)['session.setModel']['input']> }
  | {
      readonly name: 'session.setThinkingLevel'
      readonly input: z.output<(typeof modelCommands)['session.setThinkingLevel']['input']>
    }
  | {
      readonly name: 'session.setMaxMode'
      readonly input: z.output<(typeof modelCommands)['session.setMaxMode']['input']>
    }
type PendingWrite = WriteOperation & {
  readonly key: string
  status: 'submitting' | 'unknown'
  error: string | null
  inFlight: boolean
}

function matchesWrite(
  configuration: Pick<ModelConfiguration, 'modelId' | 'thinkingLevel' | 'maxMode'>,
  operation: WriteOperation,
): boolean {
  switch (operation.name) {
    case 'session.setModel':
      return configuration.modelId === operation.input.modelId
    case 'session.setThinkingLevel':
      return configuration.thinkingLevel === operation.input.thinkingLevel
    case 'session.setMaxMode':
      return configuration.maxMode === operation.input.enabled
  }
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'EXECUTION_FAILED'
}

function initial(
  sessionId: string | null,
  action: ComposerModelState['action'] = { status: 'idle', error: null },
): ComposerModelState {
  return { sessionId, status: 'idle', models: [], error: null, action }
}

export function createComposerModel(
  local: CommandRegistry,
  models: CommandExecutor | undefined,
  navigation: StateReader<NavigationState>,
  controls: ModelProjection,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
  preparation?: SessionExecutionPreparationPort,
  isRunActive?: (sessionId: string) => boolean,
) {
  const state = createState<ComposerModelState>(initial(navigation.getSnapshot().sessionId), onSubscriberError)
  const catalogReads = createModelReadQueue()
  let disposed = false
  let connected = true
  let catalogRequested = false
  let scheduledCatalog = false
  const inactive = () => disposed || isDisposed()
  const pending = new Map<string, PendingWrite>()
  const preparing = new Set<string>()
  let read: {
    readonly sessionId: string
    readonly controller: AbortController
    readonly generation: number
    readonly promise: Promise<void>
  } | null = null
  let generation = 0
  const selected = (sessionId: string) =>
    !inactive() &&
    navigation.getSnapshot().sessionId === sessionId &&
    state.reader.getSnapshot().sessionId === sessionId
  const assertSelected = (sessionId: string) => {
    if (!selected(sessionId)) throw new CommandError('STALE_TARGET', 'The composer no longer belongs to this session')
  }
  const port = () => {
    if (!models) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Model commands are unavailable')
    return models
  }
  const publishAction = (sessionId: string, action: ComposerModelState['action']) => {
    if (selected(sessionId)) state.replace({ ...state.reader.getSnapshot(), action })
  }
  const requireIdle = (sessionId: string) => {
    assertSelected(sessionId)
    if (pending.has(sessionId) || preparing.has(sessionId))
      throw new CommandError('SUBMISSION_PENDING', 'Reconcile the pending model change before starting another')
  }

  const refresh = (sessionId: string, signal: AbortSignal, automatic = false, retainReady = false): Promise<void> => {
    if (automatic) assertSelected(sessionId)
    else requireIdle(sessionId)
    if (!connected) throw new CommandError('DISCONNECTED', 'Model commands need a connection')
    catalogRequested = true
    if (read?.sessionId === sessionId && read.generation === generation) return read.promise
    const controller = new AbortController()
    const intent = generation
    const abort = () => {
      controller.abort()
      if (selected(sessionId) && intent === generation)
        state.replace({ ...state.reader.getSnapshot(), status: 'error', error: 'CANCELLED' })
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    const initialAction = state.reader.getSnapshot().action
    // A previously confirmed catalog stays selectable during picker revalidation.
    // The Host still validates the model and settings revision on every write.
    const status = retainReady && state.reader.getSnapshot().status === 'ready' ? 'ready' : 'loading'
    state.replace({ ...state.reader.getSnapshot(), status, error: null })
    const promise = Promise.resolve().then(async () => {
      try {
        const executor = port()
        const [catalog] = await Promise.allSettled([
          catalogReads.run(
            (readSignal) => executor.execute('model.list', {}, { signal: readSignal }),
            controller.signal,
          ),
          controls.refreshModel(sessionId, { signal: controller.signal }, true),
        ])
        if (controller.signal.aborted && selected(sessionId) && intent === generation)
          throw new CommandError('CANCELLED', 'Model refresh was cancelled')
        if (catalog.status === 'rejected') throw catalog.reason
        const parsed = modelCommands['model.list'].output.safeParse(catalog.value)
        if (!parsed.success || new Set(parsed.data.map((model) => model.id)).size !== parsed.data.length)
          throw new CommandError('INVALID_OUTPUT', 'Model catalog is invalid')
        if (!selected(sessionId) || intent !== generation) return
        const configuration = controls.reader.getSnapshot()
        if (!configuration.model || configuration.model.sessionId !== sessionId)
          throw new CommandError(
            configuration.errors.model ?? 'MODEL_NOT_READY',
            'Current model configuration is unavailable',
          )
        state.replace({
          ...state.reader.getSnapshot(),
          models: parsed.data,
          status: 'ready',
          error: null,
          action:
            !automatic && state.reader.getSnapshot().action === initialAction
              ? { status: 'idle', error: null }
              : state.reader.getSnapshot().action,
        })
      } catch (error) {
        if (selected(sessionId) && intent === generation)
          state.replace({ ...state.reader.getSnapshot(), status: 'error', error: errorCode(error) })
        throw error
      } finally {
        signal.removeEventListener('abort', abort)
        if (read?.controller === controller) read = null
      }
    })
    read = { sessionId, controller, generation: intent, promise }
    return promise
  }

  const invalidateCatalog = () => {
    if (inactive()) return
    generation += 1
    read?.controller.abort()
    catalogReads.cancel()
    const current = state.reader.getSnapshot()
    state.replace({
      ...current,
      models: [],
      status: catalogRequested ? (connected ? 'loading' : 'error') : 'idle',
      error: connected || !catalogRequested ? null : 'DISCONNECTED',
    })
    if (!connected || !catalogRequested || !current.sessionId || scheduledCatalog) return
    scheduledCatalog = true
    queueMicrotask(() => {
      scheduledCatalog = false
      const sessionId = navigation.getSnapshot().sessionId
      if (!inactive() && connected && catalogRequested && sessionId)
        void refresh(sessionId, new AbortController().signal, true).catch(() => {})
    })
  }
  const invalidateModels = () => {
    if (inactive()) return
    controls.invalidateModels()
    invalidateCatalog()
  }
  const setConnected = (value: boolean) => {
    if (inactive() || connected === value) return
    connected = value
    controls.setConnected(value)
    invalidateCatalog()
  }

  const write = async (
    sessionId: string,
    operation: PendingWrite,
    signal: AbortSignal,
    target?: SessionExecutionTarget,
  ): Promise<void> => {
    if (operation.inFlight)
      throw new CommandError('SUBMISSION_PENDING', 'The original model request is still in flight')
    operation.inFlight = true
    operation.status = 'submitting'
    operation.error = null
    publishAction(sessionId, { status: 'submitting', error: null })
    let dispatched = false
    const interrupted = () => {
      if (!dispatched) return
      operation.status = 'unknown'
      operation.error = 'RESULT_UNKNOWN'
      publishAction(sessionId, { status: 'unknown', error: 'RESULT_UNKNOWN' })
    }
    signal.addEventListener('abort', interrupted, { once: true })
    try {
      if (signal.aborted) throw new CommandError('CANCELLED', 'Model request was cancelled before dispatch')
      if (target) preparation?.assertCanPrepare(target)
      const executor = port()
      const projectionGeneration = controls.captureModelGeneration()
      dispatched = true
      const raw = await executor.execute(operation.name, operation.input, { idempotencyKey: operation.key, signal })
      const parsed = modelWriteResultSchema.safeParse(raw)
      if (!parsed.success || parsed.data.sessionId !== sessionId || !matchesWrite(parsed.data, operation))
        throw new CommandError('INVALID_OUTPUT', 'Model confirmation does not match the requested session')
      const { commitId: _commitId, revision: _revision, ...configuration } = parsed.data
      const projected = controls.commitModel(modelConfigurationSchema.parse(configuration), projectionGeneration)
      if (!projected && selected(sessionId)) void controls.refreshModel(sessionId)
      pending.delete(sessionId)
      publishAction(sessionId, { status: 'idle', error: null })
    } catch (error) {
      const code = errorCode(error)
      const unknown =
        dispatched &&
        [
          'RESULT_UNKNOWN',
          'CANCELLED',
          'TIMEOUT',
          'TIMED_OUT',
          'DISCONNECTED',
          'CONNECTION_CLOSED',
          'EXECUTION_FAILED',
          'INVALID_OUTPUT',
        ].includes(code)
      if (unknown) {
        operation.status = 'unknown'
        operation.error = code
      } else pending.delete(sessionId)
      publishAction(sessionId, { status: unknown ? 'unknown' : 'failed', error: code })
      throw new CommandError(code, unknown ? 'Model change needs same-key reconciliation' : 'Model change was rejected')
    } finally {
      operation.inFlight = false
      signal.removeEventListener('abort', interrupted)
    }
  }

  const select = async (
    sessionId: string,
    change: { modelId: string } | { thinkingLevel: z.output<typeof thinkingLevelSchema> } | { enabled: boolean },
    signal: AbortSignal,
  ) => {
    requireIdle(sessionId)
    if (isRunActive?.(sessionId)) throw new CommandError('BUSY', 'Wait for the active Run before changing models')
    const intent = generation
    try {
      const current = state.reader.getSnapshot()
      const configuration = controls.reader.getSnapshot().model
      if (
        ('modelId' in change && current.status !== 'ready') ||
        !configuration ||
        configuration.sessionId !== sessionId
      )
        throw new CommandError('MODEL_NOT_READY', 'Refresh the model catalog before changing configuration')
      if (pending.size + preparing.size >= 32) throw new CommandError('BUSY', 'Too many unresolved model changes')
      preparing.add(sessionId)
      publishAction(sessionId, { status: 'submitting', error: null })
      const target = preparation ? await preparation.capture(sessionId, signal) : undefined
      if (generation !== intent) throw new CommandError('STALE_TARGET', 'Model preparation belongs to an old selection')
      assertSelected(sessionId)
      if (target) preparation?.assertCanPrepare(target)
      if (isRunActive?.(sessionId)) throw new CommandError('BUSY', 'Wait for the active Run before changing models')
      const baselineRevisions = { ...configuration.revisions }
      let operation: PendingWrite
      if ('modelId' in change) {
        if (!current.models.some((model) => model.id === change.modelId))
          throw new CommandError('MODEL_NOT_FOUND', 'Model is not in the current catalog')
        operation = {
          name: 'session.setModel',
          input: { sessionId, modelId: change.modelId, baselineRevisions },
          key: crypto.randomUUID(),
          status: 'submitting',
          error: null,
          inFlight: false,
        }
      } else if ('thinkingLevel' in change) {
        if (!configuration.model?.thinkingLevels.includes(change.thinkingLevel))
          throw new CommandError('INVALID_INPUT', 'Thinking level is not supported by the selected model')
        operation = {
          name: 'session.setThinkingLevel',
          input: { sessionId, thinkingLevel: change.thinkingLevel, baselineRevisions },
          key: crypto.randomUUID(),
          status: 'submitting',
          error: null,
          inFlight: false,
        }
      } else {
        if (
          !configuration.model ||
          (change.enabled && maximumContextWindow(configuration.model) <= configuration.model.contextWindow)
        )
          throw new CommandError('MAX_MODE_UNSUPPORTED', 'The selected model has no expanded context tier')
        operation = {
          name: 'session.setMaxMode',
          input: { sessionId, enabled: change.enabled, baselineRevisions },
          key: crypto.randomUUID(),
          status: 'submitting',
          error: null,
          inFlight: false,
        }
      }
      pending.set(sessionId, operation)
      preparing.delete(sessionId)
      await write(sessionId, operation, signal, target)
    } catch (error) {
      if (!pending.has(sessionId)) publishAction(sessionId, { status: 'failed', error: errorCode(error) })
      throw error
    } finally {
      preparing.delete(sessionId)
    }
  }

  local.register(composerModelCommands['composerModel.refresh'], async ({ sessionId, retainReady }, context) => {
    await refresh(sessionId, context.signal, false, retainReady)
    return { sessionId }
  })
  local.register(composerModelCommands['composerModel.selectModel'], async ({ sessionId, modelId }, context) => {
    await select(sessionId, { modelId }, context.signal)
    return { sessionId }
  })
  local.register(
    composerModelCommands['composerModel.selectThinking'],
    async ({ sessionId, thinkingLevel }, context) => {
      await select(sessionId, { thinkingLevel }, context.signal)
      return { sessionId }
    },
  )
  local.register(composerModelCommands['composerModel.selectMaxMode'], async ({ sessionId, enabled }, context) => {
    await select(sessionId, { enabled }, context.signal)
    return { sessionId }
  })
  local.register(composerModelCommands['composerModel.reconcile'], async ({ sessionId }, context) => {
    assertSelected(sessionId)
    const operation = pending.get(sessionId)
    if (!operation || operation.status !== 'unknown')
      throw new CommandError('INVALID_INPUT', 'No unknown model change to reconcile')
    if (operation.inFlight)
      throw new CommandError('SUBMISSION_PENDING', 'The original model request is still in flight')
    operation.inFlight = true
    try {
      const receipt = modelReceiptSchema
        .nullable()
        .safeParse(
          await port().execute(
            'session.getModelReceipt',
            { sessionId, idempotencyKey: operation.key },
            { signal: context.signal },
          ),
        )
      if (inactive() || pending.get(sessionId) !== operation || context.signal.aborted)
        throw new CommandError('RESULT_UNKNOWN', 'Model receipt recovery no longer belongs to this owner')
      const layerId = `settings:session:${sessionId}`
      const baseline = operation.input.baselineRevisions
      const result = receipt.success ? receipt.data : null
      if (
        !result ||
        result.sessionId !== sessionId ||
        result.idempotencyKey !== operation.key ||
        !matchesWrite(result, operation) ||
        !Object.hasOwn(baseline, layerId) ||
        Object.keys(result.revisions).sort().join('\0') !== Object.keys(baseline).sort().join('\0') ||
        Object.entries(baseline).some(
          ([id, revision]) => result.revisions[id] !== revision + (id === layerId ? 1 : 0),
        ) ||
        result.revision !== result.revisions[layerId]
      )
        throw new CommandError('RESULT_UNKNOWN', 'The original model write has not been confirmed')
      const projectionGeneration = controls.captureModelGeneration()
      const current = await controls.readModel(sessionId, { signal: context.signal })
      if (inactive() || pending.get(sessionId) !== operation || context.signal.aborted)
        throw new CommandError('RESULT_UNKNOWN', 'Model receipt recovery no longer belongs to this owner')
      if (
        !current ||
        current.sessionId !== sessionId ||
        Object.keys(current.revisions).sort().join('\0') !== Object.keys(result.revisions).sort().join('\0') ||
        Object.entries(result.revisions).some(([id, revision]) => (current.revisions[id] ?? -1) < revision)
      )
        throw new CommandError('RESULT_UNKNOWN', 'Current model target could not be verified')
      // The old receipt confirms the operation, but only a fresh read owns the visible model projection.
      const projected = controls.commitModel(current, projectionGeneration)
      if (!projected && selected(sessionId)) void controls.refreshModel(sessionId)
      pending.delete(sessionId)
      publishAction(sessionId, { status: 'idle', error: null })
    } catch (error) {
      operation.status = 'unknown'
      operation.error = errorCode(error)
      publishAction(sessionId, { status: 'unknown', error: operation.error })
      throw new CommandError('RESULT_UNKNOWN', 'Model receipt recovery is uncertain; do not replay the write')
    } finally {
      operation.inFlight = false
    }
    return { sessionId }
  })
  const offNavigation = navigation.subscribe(() => {
    const sessionId = navigation.getSnapshot().sessionId
    if (sessionId === state.reader.getSnapshot().sessionId) return
    generation += 1
    catalogRequested = false
    read?.controller.abort()
    catalogReads.cancel()
    const operation = sessionId ? pending.get(sessionId) : undefined
    state.replace(initial(sessionId, operation ? { status: operation.status, error: operation.error } : undefined))
  })
  return {
    reader: state.reader,
    invalidateModels,
    setConnected,
    dispose() {
      disposed = true
      generation += 1
      offNavigation()
      read?.controller.abort()
      catalogReads.dispose()
      read = null
      pending.clear()
      preparing.clear()
      state.dispose()
    },
  }
}
