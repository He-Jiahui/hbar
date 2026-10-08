import {
  CommandError,
  defineCommand,
  type CommandRegistry,
  type CommandExecutor,
  type ExecuteOptions,
} from '@hbar/commands'
import { z } from 'zod'
import {
  modelConfigurationSchema,
  modelWriteResultSchema,
  modelCommands,
  type ModelConfiguration,
} from '@hbar/contracts/commands/models'
import type { SettingsApplyInput } from '@hbar/contracts/commands/settings'
import { usageQueryResultSchema } from '@hbar/contracts/commands/usage'
import { createState, type StateReader } from './state'
import { createModelReadQueue } from './model-read-queue'
import type { BudgetCommandPort, NavigationState, SessionControlsState, SessionTimelineState } from './types'

export const sessionControlsCommands = {
  'sessionControls.refresh': defineCommand(
    {
      id: 'sessionControls.refresh',
      version: 1,
      owner: 'hbar.session-controls',
      kind: 'command',
      execution: 'client',
      stateEffect: 'application',
      scope: 'client',
      category: 'monitoring.usage',
      visibility: 'internal',
      surfaces: ['api'],
      titleKey: 'commands.sessionControls.refresh.title',
      descriptionKey: 'commands.sessionControls.refresh.description',
    },
    z.strictObject({ sessionId: z.string().min(1).max(160) }),
    z.strictObject({ sessionId: z.string().min(1).max(160), status: z.enum(['idle', 'loading', 'ready', 'partial']) }),
  ),
}

function initial(sessionId: string | null, status: SessionControlsState['status']): SessionControlsState {
  return {
    sessionId,
    status,
    model: null,
    usage: null,
    budget: null,
    errors: { model: null, usage: null, budget: null },
  }
}

function code(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code
  return 'EXECUTION_FAILED'
}

export function createSessionControls(
  local: CommandRegistry,
  models: CommandExecutor | undefined,
  usage: CommandExecutor | undefined,
  budget: BudgetCommandPort | undefined,
  navigation: StateReader<NavigationState>,
  timeline: StateReader<SessionTimelineState>,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<SessionControlsState>(initial(null, 'idle'), onSubscriberError)
  const modelReads = createModelReadQueue()
  let disposed = false
  let connected = true
  const inactive = () => disposed || isDisposed()
  let generation = 0
  // A settings confirmation can invalidate only the model while a previous
  // full load still owns its usage/budget reads. Neither result may erase the other.
  let modelGeneration = 0
  let pendingLoad: number | null = null
  let pendingModel: number | null = null
  let scheduledModel = false
  let currentRead: { sessionId: string; generation: number; promise: Promise<void> } | null = null
  let observedTimeline = { sessionId: null as string | null, status: 'idle' as string, cursor: 0 }

  const load = async (sessionId: string | null) => {
    const intent = ++generation
    pendingLoad = intent
    if (!sessionId) {
      modelGeneration += 1
      modelReads.cancel()
      pendingLoad = null
      pendingModel = null
      state.replace(initial(null, 'idle'))
      return
    }
    const previous = state.reader.getSnapshot()
    state.replace(previous.sessionId === sessionId ? { ...previous, status: 'loading' } : initial(sessionId, 'loading'))
    const [, usageResult, budgetResult] = await Promise.allSettled([
      refreshModel(sessionId, {}, true),
      usage?.execute('usage.query', {
        scope: { kind: 'session', sessionId, includeDescendants: false },
        bucketMs: 60_000,
        maxBuckets: 120,
        maxSamples: 5_000,
        filters: {},
      }) ?? Promise.reject(new CommandError('CAPABILITY_UNAVAILABLE', 'Usage commands are unavailable')),
      budget?.execute('session.getBudget', { sessionId }) ??
        Promise.reject(new CommandError('CAPABILITY_UNAVAILABLE', 'Budget commands are unavailable')),
    ])
    if (inactive() || intent !== generation || navigation.getSnapshot().sessionId !== sessionId) return
    pendingLoad = null
    const current = state.reader.getSnapshot()
    const parsedUsage = usageResult.status === 'fulfilled' ? usageQueryResultSchema.safeParse(usageResult.value) : null
    const validUsage =
      parsedUsage?.success &&
      parsedUsage.data.scope.kind === 'session' &&
      parsedUsage.data.scope.sessionId === sessionId
    const usageReport = validUsage ? parsedUsage.data : current.usage
    const sessionBudget = budgetResult.status === 'fulfilled' ? budgetResult.value : null
    const errors = {
      model: current.errors.model,
      usage: usageResult.status === 'rejected' ? code(usageResult.reason) : validUsage ? null : 'INVALID_OUTPUT',
      budget: budgetResult.status === 'rejected' ? code(budgetResult.reason) : null,
    }
    state.replace({
      sessionId,
      status: pendingModel !== null ? 'loading' : Object.values(errors).some(Boolean) ? 'partial' : 'ready',
      model: current.model,
      usage: usageReport,
      budget: sessionBudget,
      errors,
    })
  }

  const commitModel = (model: ModelConfiguration, expectedGeneration = modelGeneration): boolean => {
    if (
      inactive() ||
      !connected ||
      expectedGeneration !== modelGeneration ||
      navigation.getSnapshot().sessionId !== model.sessionId
    )
      return false
    const current = state.reader.getSnapshot()
    if (current.sessionId !== model.sessionId) return false
    // A delayed confirmation cannot roll back a newer confirmed settings layer.
    if (
      current.model &&
      Object.entries(current.model.revisions).some(([layer, revision]) => revision > (model.revisions[layer] ?? 0))
    )
      return false
    modelGeneration += 1
    modelReads.cancel()
    pendingModel = null
    const errors = { ...current.errors, model: null }
    state.replace({
      ...current,
      model,
      errors,
      status: pendingLoad !== null ? 'loading' : Object.values(errors).some(Boolean) ? 'partial' : 'ready',
    })
    return true
  }

  const readModel = (
    sessionId: string,
    execution: ExecuteOptions = {},
    projection = false,
  ): Promise<ModelConfiguration> =>
    modelReads.run(
      async (signal) => {
        if (inactive()) throw new CommandError('CANCELLED', 'Model projection was disposed')
        if (!connected) throw new CommandError('DISCONNECTED', 'Model reads need a connection')
        if (!models) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Model commands are unavailable')
        const result = await models.execute('session.getModel', { sessionId }, { ...execution, signal })
        if (execution.signal?.aborted) throw new CommandError('CANCELLED', 'Model refresh was cancelled')
        const parsed = modelConfigurationSchema.safeParse(result)
        if (!parsed.success || parsed.data.sessionId !== sessionId)
          throw new CommandError('INVALID_OUTPUT', 'Model response does not match the requested session')
        return parsed.data
      },
      execution.signal,
      projection ? 'projection' : 'captured',
    )

  const refreshModel = (sessionId: string, execution: ExecuteOptions = {}, retainCurrent = false): Promise<void> => {
    if (inactive() || navigation.getSnapshot().sessionId !== sessionId) return Promise.resolve()
    if (!connected) {
      const current = state.reader.getSnapshot()
      state.replace({
        ...current,
        model: null,
        status: 'partial',
        errors: { ...current.errors, model: 'DISCONNECTED' },
      })
      return Promise.resolve()
    }
    if (retainCurrent && currentRead?.sessionId === sessionId && currentRead.generation === modelGeneration)
      return currentRead.promise
    const intent = ++modelGeneration
    modelReads.cancel()
    pendingModel = intent
    const previous = state.reader.getSnapshot()
    // Confirmed settings writes invalidate the old send configuration. Opening
    // a read-only picker may retain its label until the fresh read settles.
    state.replace({
      ...previous,
      model: retainCurrent ? previous.model : null,
      errors: { ...previous.errors, model: null },
      status: 'loading',
    })
    const promise = (async () => {
      let model: ModelConfiguration | null = null
      let error: string | null = null
      try {
        model = await readModel(sessionId, execution, true)
      } catch (failure) {
        error = code(failure)
      }
      if (inactive() || intent !== modelGeneration || navigation.getSnapshot().sessionId !== sessionId) return
      pendingModel = null
      const current = state.reader.getSnapshot()
      const errors = { ...current.errors, model: error }
      state.replace({
        ...current,
        model,
        errors,
        status: pendingLoad !== null ? 'loading' : Object.values(errors).some(Boolean) ? 'partial' : 'ready',
      })
      if (currentRead?.generation === intent) currentRead = null
    })()
    currentRead = { sessionId, generation: intent, promise }
    return promise
  }

  const invalidateModels = () => {
    if (inactive()) return
    modelGeneration += 1
    modelReads.cancel()
    const current = state.reader.getSnapshot()
    const sessionId = navigation.getSnapshot().sessionId
    pendingModel = connected && sessionId ? modelGeneration : null
    if (sessionId && current.sessionId === sessionId)
      state.replace({
        ...current,
        model: null,
        status: connected ? 'loading' : 'partial',
        errors: { ...current.errors, model: connected ? null : 'DISCONNECTED' },
      })
    if (!connected || !sessionId || scheduledModel) return
    scheduledModel = true
    queueMicrotask(() => {
      scheduledModel = false
      const selectedId = navigation.getSnapshot().sessionId
      if (!inactive() && connected && selectedId) void refreshModel(selectedId)
    })
  }
  const setConnected = (value: boolean) => {
    if (inactive() || connected === value) return
    connected = value
    invalidateModels()
  }

  let selected = navigation.getSnapshot().sessionId
  const offNavigation = navigation.subscribe(() => {
    const next = navigation.getSnapshot().sessionId
    if (next === selected) return
    selected = next
    void load(next)
  })
  const offTimeline = timeline.subscribe(() => {
    const current = timeline.getSnapshot()
    const previous = observedTimeline
    observedTimeline = { sessionId: current.sessionId, status: current.status, cursor: current.cursor }
    if (current.status !== 'ready' || current.sessionId !== navigation.getSnapshot().sessionId) return
    const eventType = current.events.at(-1)?.type ?? ''
    const relevantEvent =
      current.cursor !== previous.cursor &&
      (eventType === 'usage.recorded' || eventType === 'run.settled' || eventType.startsWith('budget.'))
    const resynced = previous.status !== 'ready' && state.reader.getSnapshot().status !== 'loading'
    if (relevantEvent || resynced) void load(current.sessionId)
  })
  void load(selected)

  local.register(sessionControlsCommands['sessionControls.refresh'], async ({ sessionId }) => {
    if (inactive()) throw new CommandError('CANCELLED', 'Session controls are disposed')
    if (navigation.getSnapshot().sessionId !== sessionId)
      throw new CommandError('TARGET_CHANGED', 'The refresh target is no longer selected')
    if (!connected) throw new CommandError('DISCONNECTED', 'Session controls need a connection')
    if (state.reader.getSnapshot().status === 'loading') throw new CommandError('BUSY', 'Session controls are loading')
    await load(sessionId)
    if (navigation.getSnapshot().sessionId !== sessionId)
      throw new CommandError('TARGET_CHANGED', 'The refresh target changed before its response')
    return { sessionId, status: state.reader.getSnapshot().status }
  })

  return {
    reader: state.reader,
    invalidateModels,
    setConnected,
    captureModelGeneration: () => modelGeneration,
    refreshModel,
    readModel,
    commitModel,
    async settingsCommitted(input: SettingsApplyInput): Promise<void> {
      if (inactive()) return
      const selection = navigation.getSnapshot()
      const affectsModel = input.changes.some(
        ({ path }) =>
          path.length === 1 &&
          path[0]?.kind === 'field' &&
          (path[0].name === 'provider.model' || path[0].name === 'provider.thinkingLevel'),
      )
      if (!affectsModel || !selection.sessionId) return
      if (input.scope.kind === 'session' && input.scope.targetId !== selection.sessionId) return
      if (input.scope.kind === 'workspace' && input.scope.targetId !== selection.workspaceId) return
      await refreshModel(selection.sessionId)
    },
    async executeModel(name: string, input: unknown, options: ExecuteOptions = {}): Promise<unknown> {
      if (!models) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Model commands are unavailable')
      const persistent = name === 'session.setModel' || name === 'session.setThinkingLevel'
      const readGeneration = modelGeneration
      try {
        const result =
          name === 'session.getModel'
            ? await readModel(modelCommands[name].input.parse(input).sessionId, options)
            : await models.execute(name, input, {
                ...options,
                ...(persistent ? { idempotencyKey: options.idempotencyKey ?? crypto.randomUUID() } : {}),
              })
        if (name === 'session.getModel') {
          const model = modelConfigurationSchema.parse(result)
          commitModel(model, readGeneration)
        } else if (persistent) {
          const committed = modelWriteResultSchema.parse(result)
          if (committed.sessionId === navigation.getSnapshot().sessionId) void refreshModel(committed.sessionId)
        }
        return result
      } catch (error) {
        const sessionId =
          input && typeof input === 'object' && 'sessionId' in input && typeof input.sessionId === 'string'
            ? input.sessionId
            : null
        if (persistent && sessionId === navigation.getSnapshot().sessionId) {
          const current = state.reader.getSnapshot()
          state.replace({ ...current, status: 'partial', errors: { ...current.errors, model: code(error) } })
          if (code(error) === 'RESULT_UNKNOWN' && sessionId) void refreshModel(sessionId)
        }
        throw error
      }
    },
    async executeUsage(name: string, input: unknown, options: ExecuteOptions = {}): Promise<unknown> {
      if (!usage) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Usage commands are unavailable')
      return usage.execute(name, input, options)
    },
    dispose() {
      disposed = true
      generation += 1
      modelGeneration += 1
      offNavigation()
      offTimeline()
      modelReads.dispose()
      currentRead = null
      state.dispose()
    },
  }
}
