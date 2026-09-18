import { CommandError, type CommandExecutor, type ExecuteOptions } from '@hbar/commands'
import { modelConfigurationSchema, modelWriteResultSchema } from '@hbar/contracts/commands/models'
import { usageQueryResultSchema } from '@hbar/contracts/commands/usage'
import { createState, type StateReader } from './state'
import type { BudgetCommandPort, NavigationState, SessionControlsState, SessionTimelineState } from './types'

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
  return error instanceof Error ? error.message : 'EXECUTION_FAILED'
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
  let generation = 0
  let observedTimeline = { sessionId: null as string | null, status: 'idle' as string, cursor: 0 }

  const load = async (sessionId: string | null) => {
    const intent = ++generation
    if (!sessionId) {
      state.replace(initial(null, 'idle'))
      return
    }
    const previous = state.reader.getSnapshot()
    state.replace(previous.sessionId === sessionId ? { ...previous, status: 'loading' } : initial(sessionId, 'loading'))
    const [modelResult, usageResult, budgetResult] = await Promise.allSettled([
      models?.execute('session.getModel', { sessionId }) ?? Promise.reject(new Error('CAPABILITY_UNAVAILABLE')),
      usage?.execute('usage.query', {
        scope: { kind: 'session', sessionId, includeDescendants: false },
        bucketMs: 60_000,
        maxBuckets: 120,
        maxSamples: 5_000,
        filters: {},
      }) ?? Promise.reject(new Error('CAPABILITY_UNAVAILABLE')),
      budget?.execute('session.getBudget', { sessionId }) ?? Promise.reject(new Error('CAPABILITY_UNAVAILABLE')),
    ])
    if (isDisposed() || intent !== generation || navigation.getSnapshot().sessionId !== sessionId) return
    const model = modelResult.status === 'fulfilled' ? modelConfigurationSchema.parse(modelResult.value) : null
    const usageReport = usageResult.status === 'fulfilled' ? usageQueryResultSchema.parse(usageResult.value) : null
    const sessionBudget = budgetResult.status === 'fulfilled' ? budgetResult.value : null
    const errors = {
      model: modelResult.status === 'rejected' ? code(modelResult.reason) : null,
      usage: usageResult.status === 'rejected' ? code(usageResult.reason) : null,
      budget: budgetResult.status === 'rejected' ? code(budgetResult.reason) : null,
    }
    state.replace({
      sessionId,
      status: Object.values(errors).some(Boolean) ? 'partial' : 'ready',
      model,
      usage: usageReport,
      budget: sessionBudget,
      errors,
    })
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

  return {
    reader: state.reader,
    async executeModel(name: string, input: unknown, options: ExecuteOptions = {}): Promise<unknown> {
      if (!models) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Model commands are unavailable')
      const persistent = name === 'session.setModel' || name === 'session.setThinkingLevel'
      try {
        const result = await models.execute(name, input, {
          ...options,
          ...(persistent ? { idempotencyKey: options.idempotencyKey ?? crypto.randomUUID() } : {}),
        })
        if (name === 'session.getModel') {
          const model = modelConfigurationSchema.parse(result)
          if (model.sessionId === navigation.getSnapshot().sessionId) {
            const current = state.reader.getSnapshot()
            state.replace({ ...current, model, errors: { ...current.errors, model: null } })
          }
        } else if (persistent) {
          const committed = modelWriteResultSchema.parse(result)
          if (committed.sessionId === navigation.getSnapshot().sessionId) void load(committed.sessionId)
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
          if (code(error) === 'RESULT_UNKNOWN') void load(sessionId)
        }
        throw error
      }
    },
    async executeUsage(name: string, input: unknown, options: ExecuteOptions = {}): Promise<unknown> {
      if (!usage) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Usage commands are unavailable')
      return usage.execute(name, input, options)
    },
    dispose() {
      generation += 1
      offNavigation()
      offTimeline()
      state.dispose()
    },
  }
}
