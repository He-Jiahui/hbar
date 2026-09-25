import { z } from 'zod'
import { CommandError, defineCommand, type CommandExecutor, type CommandRegistry } from '@hbar/commands'
import { idSchema, thinkingLevelSchema } from '@hbar/contracts'
import { modelCommands, modelConfigurationSchema, modelWriteResultSchema } from '@hbar/contracts/commands/models'
import type { ModelConfiguration } from '@hbar/contracts/commands/models'
import { createState, type StateReader } from './state'
import type { ComposerModelState, NavigationState, SessionControlsState } from './types'

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
const output = z.strictObject({ sessionId: idSchema })

/** Local ViewModel actions; the Host wire contract remains modelCommands. */
export const composerModelCommands = {
  'composerModel.refresh': defineCommand(metadata('composerModel.refresh'), sessionInput, output),
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
}

interface ModelProjection {
  readonly reader: StateReader<SessionControlsState>
  refreshModel(sessionId: string, execution?: { readonly signal: AbortSignal }, retainCurrent?: boolean): Promise<void>
  commitModel(model: ModelConfiguration): void
}
type WriteOperation =
  | { readonly name: 'session.setModel'; readonly input: z.output<(typeof modelCommands)['session.setModel']['input']> }
  | {
      readonly name: 'session.setThinkingLevel'
      readonly input: z.output<(typeof modelCommands)['session.setThinkingLevel']['input']>
    }
type PendingWrite = WriteOperation & {
  readonly key: string
  status: 'submitting' | 'unknown'
  error: string | null
  inFlight: boolean
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
) {
  const state = createState<ComposerModelState>(initial(navigation.getSnapshot().sessionId), onSubscriberError)
  const pending = new Map<string, PendingWrite>()
  const reads = new Map<
    string,
    { readonly controller: AbortController; readonly generation: number; readonly promise: Promise<void> }
  >()
  let generation = 0
  const selected = (sessionId: string) =>
    !isDisposed() &&
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
    if (pending.has(sessionId))
      throw new CommandError('SUBMISSION_PENDING', 'Reconcile the pending model change before starting another')
  }

  const refresh = (sessionId: string, signal: AbortSignal): Promise<void> => {
    requireIdle(sessionId)
    const existing = reads.get(sessionId)
    if (existing?.generation === generation) return existing.promise
    if (existing || reads.size >= 4) throw new CommandError('BUSY', 'Model refresh capacity reached')
    const controller = new AbortController()
    const abort = () => {
      controller.abort()
      if (selected(sessionId)) state.replace({ ...state.reader.getSnapshot(), status: 'error', error: 'CANCELLED' })
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    const intent = generation
    const initialAction = state.reader.getSnapshot().action
    state.replace({ ...state.reader.getSnapshot(), status: 'loading', error: null })
    const promise = Promise.resolve().then(async () => {
      try {
        const executor = port()
        const [catalog] = await Promise.allSettled([
          executor.execute('model.list', {}, { signal: controller.signal }),
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
            state.reader.getSnapshot().action === initialAction
              ? { status: 'idle', error: null }
              : state.reader.getSnapshot().action,
        })
      } catch (error) {
        if (selected(sessionId) && intent === generation)
          state.replace({ ...state.reader.getSnapshot(), status: 'error', error: errorCode(error) })
        throw error
      } finally {
        signal.removeEventListener('abort', abort)
        if (reads.get(sessionId)?.controller === controller) reads.delete(sessionId)
      }
    })
    reads.set(sessionId, { controller, generation: intent, promise })
    return promise
  }

  const write = async (sessionId: string, operation: PendingWrite, signal: AbortSignal): Promise<void> => {
    if (operation.inFlight)
      throw new CommandError('SUBMISSION_PENDING', 'The original model request is still in flight')
    operation.inFlight = true
    operation.status = 'submitting'
    operation.error = null
    publishAction(sessionId, { status: 'submitting', error: null })
    const interrupted = () => {
      operation.status = 'unknown'
      operation.error = 'RESULT_UNKNOWN'
      publishAction(sessionId, { status: 'unknown', error: 'RESULT_UNKNOWN' })
    }
    signal.addEventListener('abort', interrupted, { once: true })
    try {
      if (signal.aborted) throw new CommandError('RESULT_UNKNOWN', 'Model request was interrupted')
      const raw = await port().execute(operation.name, operation.input, { idempotencyKey: operation.key, signal })
      const parsed = modelWriteResultSchema.safeParse(raw)
      if (
        !parsed.success ||
        parsed.data.sessionId !== sessionId ||
        (operation.name === 'session.setModel'
          ? parsed.data.modelId !== operation.input.modelId
          : parsed.data.thinkingLevel !== operation.input.thinkingLevel)
      )
        throw new CommandError('INVALID_OUTPUT', 'Model confirmation does not match the requested session')
      const { commitId: _commitId, revision: _revision, ...configuration } = parsed.data
      controls.commitModel(modelConfigurationSchema.parse(configuration))
      pending.delete(sessionId)
      publishAction(sessionId, { status: 'idle', error: null })
    } catch (error) {
      const code = errorCode(error)
      const unknown = [
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
    change: { modelId: string } | { thinkingLevel: z.output<typeof thinkingLevelSchema> },
    signal: AbortSignal,
  ) => {
    requireIdle(sessionId)
    try {
      const current = state.reader.getSnapshot()
      const configuration = controls.reader.getSnapshot().model
      if (
        ('modelId' in change && current.status !== 'ready') ||
        !configuration ||
        configuration.sessionId !== sessionId
      )
        throw new CommandError('MODEL_NOT_READY', 'Refresh the model catalog before changing configuration')
      if (pending.size >= 32) throw new CommandError('BUSY', 'Too many unresolved model changes')
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
      } else {
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
      }
      pending.set(sessionId, operation)
      await write(sessionId, operation, signal)
    } catch (error) {
      if (!pending.has(sessionId)) publishAction(sessionId, { status: 'failed', error: errorCode(error) })
      throw error
    }
  }

  local.register(composerModelCommands['composerModel.refresh'], async ({ sessionId }, context) => {
    await refresh(sessionId, context.signal)
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
  local.register(composerModelCommands['composerModel.reconcile'], async ({ sessionId }, context) => {
    assertSelected(sessionId)
    const operation = pending.get(sessionId)
    if (!operation || operation.status !== 'unknown')
      throw new CommandError('INVALID_INPUT', 'No unknown model change to reconcile')
    await write(sessionId, operation, context.signal)
    return { sessionId }
  })
  const offNavigation = navigation.subscribe(() => {
    const sessionId = navigation.getSnapshot().sessionId
    if (sessionId === state.reader.getSnapshot().sessionId) return
    generation += 1
    for (const read of reads.values()) read.controller.abort()
    const operation = sessionId ? pending.get(sessionId) : undefined
    state.replace(initial(sessionId, operation ? { status: operation.status, error: operation.error } : undefined))
  })
  return {
    reader: state.reader,
    dispose() {
      generation += 1
      offNavigation()
      for (const read of reads.values()) read.controller.abort()
      reads.clear()
      pending.clear()
      state.dispose()
    },
  }
}
