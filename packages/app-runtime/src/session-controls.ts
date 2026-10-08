import { CommandError, type CommandExecutor, type ExecuteOptions } from '@hbar/commands'
import {
  modelConfigurationSchema,
  modelWriteResultSchema,
  modelCommands,
  COMPACTION_PERCENT_SETTING,
  sessionContextUsageSchema,
  type ModelConfiguration,
} from '@hbar/contracts/commands/models'
import type { SettingsApplyInput } from '@hbar/contracts/commands/settings'
import { usageQueryResultSchema } from '@hbar/contracts/commands/usage'
import { createState, type StateReader } from './state'
import { createModelReadQueue } from './model-read-queue'
import type { BudgetCommandPort, NavigationState, SessionControlsState, SessionTimelineState } from './types'

function initial(sessionId: string | null, status: SessionControlsState['status']): SessionControlsState {
  return {
    sessionId,
    status,
    model: null,
    usage: null,
    budget: null,
    context: null,
    contextStatus: sessionId ? 'loading' : 'idle',
    errors: { model: null, usage: null, budget: null, context: null },
  }
}

function code(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code
  return 'EXECUTION_FAILED'
}

export function createSessionControls(
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
  const contextReads = createModelReadQueue()
  let contextGeneration = 0
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
  const initialTimeline = timeline.getSnapshot()
  let observedTimeline = {
    sessionId: initialTimeline.sessionId,
    status: initialTimeline.status,
    cursor: initialTimeline.cursor,
  }

  const invalidateContext = () => {
    contextGeneration += 1
    contextReads.cancel()
    const current = state.reader.getSnapshot()
    state.replace({
      ...current,
      context: null,
      contextStatus: connected ? 'loading' : 'error',
      errors: { ...current.errors, context: connected ? null : 'DISCONNECTED' },
    })
  }
  const refreshContext = async (sessionId: string) => {
    if (inactive() || !connected || navigation.getSnapshot().sessionId !== sessionId) return
    const intent = ++contextGeneration
    contextReads.cancel()
    const current = state.reader.getSnapshot()
    state.replace({ ...current, contextStatus: 'loading', errors: { ...current.errors, context: null } })
    try {
      const result = await contextReads.run(async (signal) => {
        if (!models) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Context commands are unavailable')
        return models.execute(
          'session.getContextUsage',
          { sessionId },
          { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) },
        )
      })
      const context = sessionContextUsageSchema.parse(result)
      if (context.sessionId !== sessionId)
        throw new CommandError('INVALID_OUTPUT', 'Context belongs to another session')
      if (inactive() || !connected || intent !== contextGeneration || navigation.getSnapshot().sessionId !== sessionId)
        return
      const latest = state.reader.getSnapshot()
      state.replace({ ...latest, context, contextStatus: 'ready', errors: { ...latest.errors, context: null } })
    } catch (error) {
      if (inactive() || !connected || intent !== contextGeneration || navigation.getSnapshot().sessionId !== sessionId)
        return
      const latest = state.reader.getSnapshot()
      state.replace({
        ...latest,
        context: null,
        contextStatus: 'error',
        errors: { ...latest.errors, context: code(error) },
      })
    }
  }

  const load = async (sessionId: string | null) => {
    const intent = ++generation
    pendingLoad = intent
    if (!sessionId) {
      invalidateContext()
      modelGeneration += 1
      modelReads.cancel()
      pendingLoad = null
      pendingModel = null
      state.replace(initial(null, 'idle'))
      return
    }
    const previous = state.reader.getSnapshot()
    if (previous.sessionId !== sessionId) invalidateContext()
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
    const usageReport = usageResult.status === 'fulfilled' ? usageQueryResultSchema.parse(usageResult.value) : null
    const sessionBudget = budgetResult.status === 'fulfilled' ? budgetResult.value : null
    const errors = {
      model: current.errors.model,
      usage: usageResult.status === 'rejected' ? code(usageResult.reason) : null,
      budget: budgetResult.status === 'rejected' ? code(budgetResult.reason) : null,
      context: current.errors.context ?? null,
    }
    state.replace({
      sessionId,
      status: pendingModel !== null ? 'loading' : errors.model || errors.usage || errors.budget ? 'partial' : 'ready',
      model: current.model,
      usage: usageReport,
      budget: sessionBudget,
      context: current.context ?? null,
      contextStatus: current.contextStatus ?? 'idle',
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
    contextGeneration += 1
    contextReads.cancel()
    pendingModel = null
    const errors = { ...current.errors, model: null }
    state.replace({
      ...current,
      model,
      context: null,
      contextStatus: 'loading',
      errors,
      status: pendingLoad !== null ? 'loading' : errors.model || errors.usage || errors.budget ? 'partial' : 'ready',
    })
    void refreshContext(model.sessionId)
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
    if (!retainCurrent) invalidateContext()
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
        status: pendingLoad !== null ? 'loading' : errors.model || errors.usage || errors.budget ? 'partial' : 'ready',
      })
      void refreshContext(sessionId)
      if (currentRead?.generation === intent) currentRead = null
    })()
    currentRead = { sessionId, generation: intent, promise }
    return promise
  }

  const invalidateModels = () => {
    if (inactive()) return
    modelGeneration += 1
    modelReads.cancel()
    invalidateContext()
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
    // Snapshot recovery can advance the committed cursor with no retained event
    // rows. Refresh on that revision too; stream-only frames keep the same cursor.
    else if (current.sessionId && (current.cursor !== previous.cursor || previous.status !== 'ready'))
      void refreshContext(current.sessionId)
  })
  void load(selected)

  return {
    reader: state.reader,
    invalidateModels,
    setConnected,
    captureModelGeneration: () => modelGeneration,
    refreshModel,
    refreshContext,
    invalidateContext,
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
      const affectsContext = input.changes.some(
        ({ path }) => path.length === 1 && path[0]?.kind === 'field' && path[0].name === COMPACTION_PERCENT_SETTING,
      )
      if ((!affectsModel && !affectsContext) || !selection.sessionId) return
      if (input.scope.kind === 'session' && input.scope.targetId !== selection.sessionId) return
      if (input.scope.kind === 'workspace' && input.scope.targetId !== selection.workspaceId) return
      if (affectsModel) await refreshModel(selection.sessionId)
      else {
        invalidateContext()
        await refreshContext(selection.sessionId)
      }
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
      contextGeneration += 1
      offNavigation()
      offTimeline()
      modelReads.dispose()
      contextReads.dispose()
      currentRead = null
      state.dispose()
    },
  }
}
