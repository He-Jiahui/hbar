import { CommandError, createCommandClient, type CommandRegistry } from '@hbar/commands'
import {
  goalControlStatusSchema,
  MAX_PLAN_STEPS,
  type PlanState,
  type PlanStepStatus,
  type ThreadGoal,
} from '@hbar/contracts'
import { goalPlanWorkspaceCommands } from '@hbar/contracts/commands/goal-plan-workspace'
import { goalPlanCommands } from '@hbar/contracts/commands/goals'
import { createState, type StateReader } from './state'
import type {
  GoalPlanGoalDraftState,
  GoalPlanPlanDraftState,
  GoalPlanWorkspaceEntryState,
  GoalPlanWorkspaceState,
  RuntimeOptions,
  SurfaceState,
} from './types'

const MAX_PANELS = 8
const UNKNOWN_CODES = new Set(['RESULT_UNKNOWN', 'DISCONNECTED', 'TIMEOUT'])
export const goalControlStatuses = Object.freeze([...goalControlStatusSchema.options])

function code(reason: unknown): string {
  return reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
    ? reason.code
    : 'EXECUTION_FAILED'
}

function commandFailure(reason: unknown): CommandError {
  if (reason instanceof CommandError) return reason
  return new CommandError(code(reason), reason instanceof Error ? reason.message : 'Goal or plan operation failed')
}

function goalDraft(goal: ThreadGoal | null): GoalPlanGoalDraftState {
  return {
    objective: goal?.objective ?? '',
    status: goal?.status ?? 'active',
    tokenBudget: goal?.tokenBudget === null || goal?.tokenBudget === undefined ? '' : String(goal.tokenBudget),
    revision: 0,
    issues: {},
  }
}

function planDraft(plan: PlanState | null): GoalPlanPlanDraftState {
  return {
    explanation: plan?.explanation ?? '',
    newStep: '',
    steps: (plan?.plan ?? []).map((step, index) => ({ id: `step-${index}`, ...step })),
    revision: 0,
    issues: {},
  }
}

function goalDirty(goal: ThreadGoal | null, draft: GoalPlanGoalDraftState): boolean {
  return (
    draft.objective !== (goal?.objective ?? '') ||
    draft.status !== (goal?.status ?? 'active') ||
    draft.tokenBudget !==
      (goal?.tokenBudget === null || goal?.tokenBudget === undefined ? '' : String(goal.tokenBudget))
  )
}

function planDirty(plan: PlanState | null, draft: GoalPlanPlanDraftState): boolean {
  return (
    draft.explanation !== (plan?.explanation ?? '') ||
    draft.newStep !== '' ||
    JSON.stringify(draft.steps.map(({ step, status }) => ({ step, status }))) !== JSON.stringify(plan?.plan ?? [])
  )
}

function available(action: GoalPlanWorkspaceEntryState['goalAction'] | GoalPlanWorkspaceEntryState['planAction']) {
  if (action.status === 'submitting' || action.status === 'unknown')
    throw new CommandError('BUSY', 'Reconcile the pending operation before editing')
}

export function createGoalPlanWorkspace(
  local: CommandRegistry,
  options: RuntimeOptions,
  surfaces: StateReader<SurfaceState>,
  onSubscriberError: (error: unknown) => void,
  isDisposed: () => boolean,
) {
  const state = createState<GoalPlanWorkspaceState>({ entries: {} }, onSubscriberError)
  const client = options.goals ? createCommandClient(goalPlanCommands, options.goals) : null
  const generations = new Map<string, number>()

  const panel = (instanceId: string) => {
    const value = surfaces.getSnapshot().panels[instanceId]
    if (!value || value.panelId !== 'goals')
      throw new CommandError('COMMAND_NOT_FOUND', 'Goal and plan panel is not open')
    if (!value.sessionId) throw new CommandError('INVALID_INPUT', 'Goal and plan panel requires a session target')
    return { ...value, sessionId: value.sessionId }
  }
  const requireClient = () => {
    if (!client) throw new CommandError('CAPABILITY_UNAVAILABLE', 'Goal and plan commands are unavailable')
    return client
  }
  const replace = (entry: GoalPlanWorkspaceEntryState) => {
    const current = state.reader.getSnapshot()
    const entries = { ...current.entries, [entry.instanceId]: entry }
    const ids = Object.keys(entries)
    if (ids.length > MAX_PANELS)
      for (const id of ids) {
        if (id !== entry.instanceId && !surfaces.getSnapshot().panels[id]) {
          delete entries[id]
          break
        }
      }
    state.replace({ entries })
  }
  const summary = (entry: GoalPlanWorkspaceEntryState) => ({
    instanceId: entry.instanceId,
    sessionId: entry.sessionId,
    view: entry.view,
    status: entry.status,
    goalStatus: entry.goalAction.status,
    planStatus: entry.planAction.status,
    goalDirty: entry.goalDirty,
    planDirty: entry.planDirty,
    error: entry.goalAction.error ?? entry.planAction.error ?? entry.error,
  })
  const load = async (instanceId: string) => {
    const target = panel(instanceId)
    const previous = state.reader.getSnapshot().entries[instanceId]
    const sameTarget = previous?.sessionId === target.sessionId
    const generation = (generations.get(instanceId) ?? 0) + 1
    generations.set(instanceId, generation)
    const loading: GoalPlanWorkspaceEntryState = {
      instanceId,
      sessionId: target.sessionId,
      view: sameTarget ? previous.view : 'overview',
      status: 'loading',
      goal: sameTarget ? previous.goal : null,
      remainingTokens: sameTarget ? previous.remainingTokens : null,
      completionBudgetReport: sameTarget ? previous.completionBudgetReport : null,
      goalDraft: sameTarget ? previous.goalDraft : goalDraft(null),
      goalDirty: sameTarget ? previous.goalDirty : false,
      goalAction: sameTarget ? previous.goalAction : { status: 'idle', error: null },
      plan: sameTarget ? previous.plan : null,
      planDraft: sameTarget ? previous.planDraft : planDraft(null),
      planDirty: sameTarget ? previous.planDirty : false,
      planAction: sameTarget ? previous.planAction : { status: 'idle', error: null },
      error: null,
    }
    replace(loading)
    try {
      const [goalResponse, savedPlan] = await Promise.all([
        requireClient().execute('goal.get', { sessionId: target.sessionId }),
        requireClient().execute('plan.get', { sessionId: target.sessionId }),
      ])
      if (isDisposed() || generations.get(instanceId) !== generation)
        throw new CommandError('RESULT_UNKNOWN', 'Goal and plan refresh was superseded')
      const reconcileGoal = loading.goalAction.status === 'unknown' || !loading.goalDirty
      const reconcilePlan = loading.planAction.status === 'unknown' || !loading.planDirty
      const ready: GoalPlanWorkspaceEntryState = {
        ...loading,
        status: 'ready',
        goal: goalResponse.goal,
        remainingTokens: goalResponse.remainingTokens,
        completionBudgetReport: goalResponse.completionBudgetReport ?? null,
        goalDraft: reconcileGoal ? goalDraft(goalResponse.goal) : loading.goalDraft,
        goalDirty: reconcileGoal ? false : goalDirty(goalResponse.goal, loading.goalDraft),
        goalAction: { status: 'idle', error: null },
        plan: savedPlan,
        planDraft: reconcilePlan ? planDraft(savedPlan) : loading.planDraft,
        planDirty: reconcilePlan ? false : planDirty(savedPlan, loading.planDraft),
        planAction: { status: 'idle', error: null },
        error: null,
      }
      replace(ready)
      return summary(ready)
    } catch (reason) {
      if (isDisposed() || generations.get(instanceId) !== generation) throw reason
      const failed = { ...loading, status: 'error' as const, error: code(reason) }
      replace(failed)
      throw commandFailure(reason)
    }
  }
  const current = (instanceId: string) => {
    const entry = state.reader.getSnapshot().entries[instanceId]
    const target = panel(instanceId)
    if (!entry || entry.sessionId !== target.sessionId)
      throw new CommandError('RESULT_UNKNOWN', 'Refresh goal and plan panel target')
    return entry
  }
  const show = (instanceId: string, view: GoalPlanWorkspaceEntryState['view']) => {
    const entry = current(instanceId)
    const next = { ...entry, view }
    replace(next)
    return summary(next)
  }
  const setGoalField = (instanceId: string, field: 'objective' | 'tokenBudget' | 'status', value: string) => {
    const entry = current(instanceId)
    if (entry.view !== 'goal') throw new CommandError('INVALID_INPUT', 'Open the goal editor before editing it')
    available(entry.goalAction)
    const normalized = field === 'status' ? goalControlStatusSchema.safeParse(value) : null
    if (normalized && !normalized.success) throw new CommandError('INVALID_INPUT', 'Goal status is invalid')
    const issues = { ...entry.goalDraft.issues }
    delete issues[field]
    const goalDraftState = {
      ...entry.goalDraft,
      [field]: normalized?.success ? normalized.data : value,
      revision: entry.goalDraft.revision + 1,
      issues,
    } as GoalPlanGoalDraftState
    const next = {
      ...entry,
      goalDraft: goalDraftState,
      goalDirty: goalDirty(entry.goal, goalDraftState),
      goalAction: { status: 'idle' as const, error: null },
    }
    replace(next)
    return summary(next)
  }
  const saveGoal = async (instanceId: string) => {
    const entry = current(instanceId)
    if (entry.view !== 'goal') throw new CommandError('INVALID_INPUT', 'Open the goal editor before saving it')
    available(entry.goalAction)
    const tokenText = entry.goalDraft.tokenBudget.trim()
    const tokenBudget = tokenText ? Number(tokenText) : null
    const input = entry.goal
      ? {
          sessionId: entry.sessionId,
          objective: entry.goalDraft.objective,
          ...(entry.goalDraft.status === entry.goal.status ? {} : { status: entry.goalDraft.status }),
          tokenBudget,
          ...(entry.goal.goalId ? { expectedGoalId: entry.goal.goalId } : {}),
        }
      : {
          sessionId: entry.sessionId,
          objective: entry.goalDraft.objective,
          ...(tokenBudget === null ? {} : { tokenBudget }),
        }
    const definition = entry.goal ? goalPlanCommands['goal.set'] : goalPlanCommands['goal.create']
    const parsed = definition.input.safeParse(input)
    if (!parsed.success) {
      const fields = Object.fromEntries(
        parsed.error.issues.map((issue) => [String(issue.path[0] ?? 'goal'), 'INVALID_INPUT']),
      )
      const failed = {
        ...entry,
        goalDraft: { ...entry.goalDraft, issues: fields },
        goalAction: { status: 'failed' as const, error: 'INVALID_INPUT' },
      }
      replace(failed)
      throw new CommandError('INVALID_INPUT', 'Goal fields are invalid')
    }
    replace({ ...entry, goalAction: { status: 'submitting', error: null } })
    try {
      const response = entry.goal
        ? await requireClient().execute('goal.set', parsed.data as never)
        : await requireClient().execute('goal.create', parsed.data as never)
      const latest = current(instanceId)
      const next: GoalPlanWorkspaceEntryState = {
        ...latest,
        goal: response.goal,
        remainingTokens: response.remainingTokens,
        completionBudgetReport: response.completionBudgetReport ?? null,
        goalDraft: goalDraft(response.goal),
        goalDirty: false,
        goalAction: { status: 'succeeded', error: null },
      }
      replace(next)
      return summary(next)
    } catch (reason) {
      const latest = current(instanceId)
      const error = code(reason)
      const failed = {
        ...latest,
        goalAction: { status: UNKNOWN_CODES.has(error) ? ('unknown' as const) : ('failed' as const), error },
      }
      replace(failed)
      throw commandFailure(reason)
    }
  }
  const clearGoal = async (instanceId: string) => {
    const entry = current(instanceId)
    available(entry.goalAction)
    replace({ ...entry, goalAction: { status: 'submitting', error: null } })
    try {
      await requireClient().execute('goal.clear', { sessionId: entry.sessionId })
      const latest = current(instanceId)
      const next: GoalPlanWorkspaceEntryState = {
        ...latest,
        goal: null,
        remainingTokens: null,
        completionBudgetReport: null,
        goalDraft: goalDraft(null),
        goalDirty: false,
        goalAction: { status: 'succeeded', error: null },
      }
      replace(next)
      return summary(next)
    } catch (reason) {
      const latest = current(instanceId)
      const error = code(reason)
      const failed = {
        ...latest,
        goalAction: { status: UNKNOWN_CODES.has(error) ? ('unknown' as const) : ('failed' as const), error },
      }
      replace(failed)
      throw commandFailure(reason)
    }
  }
  const updatePlanDraft = (entry: GoalPlanWorkspaceEntryState, draft: GoalPlanPlanDraftState) => {
    const next = {
      ...entry,
      planDraft: draft,
      planDirty: planDirty(entry.plan, draft),
      planAction: { status: 'idle' as const, error: null },
    }
    replace(next)
    return summary(next)
  }
  const setExplanation = (instanceId: string, value: string) => {
    const entry = current(instanceId)
    if (entry.view !== 'plan') throw new CommandError('INVALID_INPUT', 'Open the plan editor before editing it')
    available(entry.planAction)
    return updatePlanDraft(entry, {
      ...entry.planDraft,
      explanation: value,
      revision: entry.planDraft.revision + 1,
    })
  }
  const setNewStep = (instanceId: string, value: string) => {
    const entry = current(instanceId)
    if (entry.view !== 'plan') throw new CommandError('INVALID_INPUT', 'Open the plan editor before editing it')
    available(entry.planAction)
    return updatePlanDraft(entry, { ...entry.planDraft, newStep: value, revision: entry.planDraft.revision + 1 })
  }
  const addStep = (instanceId: string) => {
    const entry = current(instanceId)
    if (entry.view !== 'plan') throw new CommandError('INVALID_INPUT', 'Open the plan editor before editing it')
    available(entry.planAction)
    const step = entry.planDraft.newStep.trim()
    if (!step) throw new CommandError('INVALID_INPUT', 'Plan step cannot be empty')
    if (entry.planDraft.steps.length >= MAX_PLAN_STEPS)
      throw new CommandError('LIMIT_EXCEEDED', 'Plan step limit reached')
    return updatePlanDraft(entry, {
      ...entry.planDraft,
      newStep: '',
      steps: [...entry.planDraft.steps, { id: crypto.randomUUID(), step, status: 'pending' }],
      revision: entry.planDraft.revision + 1,
    })
  }
  const setStep = (instanceId: string, stepId: string, step?: string, status?: PlanStepStatus) => {
    const entry = current(instanceId)
    if (entry.view !== 'plan') throw new CommandError('INVALID_INPUT', 'Open the plan editor before editing it')
    available(entry.planAction)
    if (step === undefined && status === undefined) throw new CommandError('INVALID_INPUT', 'Plan step change is empty')
    const steps = entry.planDraft.steps.map((item) =>
      item.id === stepId ? { ...item, ...(step === undefined ? {} : { step }), ...(status ? { status } : {}) } : item,
    )
    if (!steps.some((item) => item.id === stepId)) throw new CommandError('COMMAND_NOT_FOUND', 'Plan step not found')
    return updatePlanDraft(entry, { ...entry.planDraft, steps, revision: entry.planDraft.revision + 1 })
  }
  const moveStep = (instanceId: string, stepId: string, direction: -1 | 1) => {
    const entry = current(instanceId)
    if (entry.view !== 'plan') throw new CommandError('INVALID_INPUT', 'Open the plan editor before editing it')
    available(entry.planAction)
    const index = entry.planDraft.steps.findIndex((item) => item.id === stepId)
    const destination = index + direction
    if (index < 0) throw new CommandError('COMMAND_NOT_FOUND', 'Plan step not found')
    if (destination < 0 || destination >= entry.planDraft.steps.length) return summary(entry)
    const steps = [...entry.planDraft.steps]
    const [item] = steps.splice(index, 1)
    steps.splice(destination, 0, item!)
    return updatePlanDraft(entry, { ...entry.planDraft, steps, revision: entry.planDraft.revision + 1 })
  }
  const removeStep = (instanceId: string, stepId: string) => {
    const entry = current(instanceId)
    if (entry.view !== 'plan') throw new CommandError('INVALID_INPUT', 'Open the plan editor before editing it')
    available(entry.planAction)
    if (!entry.planDraft.steps.some((item) => item.id === stepId))
      throw new CommandError('COMMAND_NOT_FOUND', 'Plan step not found')
    return updatePlanDraft(entry, {
      ...entry.planDraft,
      steps: entry.planDraft.steps.filter((item) => item.id !== stepId),
      revision: entry.planDraft.revision + 1,
    })
  }
  const savePlan = async (instanceId: string) => {
    const entry = current(instanceId)
    if (entry.view !== 'plan') throw new CommandError('INVALID_INPUT', 'Open the plan editor before saving it')
    available(entry.planAction)
    const input = {
      sessionId: entry.sessionId,
      explanation: entry.planDraft.explanation.trim() || null,
      plan: entry.planDraft.steps.map(({ step, status }) => ({ step, status })),
    }
    const parsed = goalPlanCommands['plan.update'].input.safeParse(input)
    if (!parsed.success) {
      const failed = {
        ...entry,
        planDraft: { ...entry.planDraft, issues: { plan: 'INVALID_INPUT' } },
        planAction: { status: 'failed' as const, error: 'INVALID_INPUT' },
      }
      replace(failed)
      throw new CommandError('INVALID_INPUT', 'Plan fields are invalid')
    }
    replace({ ...entry, planAction: { status: 'submitting', error: null } })
    try {
      const saved = await requireClient().execute('plan.update', parsed.data)
      const latest = current(instanceId)
      const next: GoalPlanWorkspaceEntryState = {
        ...latest,
        plan: saved,
        planDraft: planDraft(saved),
        planDirty: false,
        planAction: { status: 'succeeded', error: null },
      }
      replace(next)
      return summary(next)
    } catch (reason) {
      const latest = current(instanceId)
      const error = code(reason)
      const failed = {
        ...latest,
        planAction: { status: UNKNOWN_CODES.has(error) ? ('unknown' as const) : ('failed' as const), error },
      }
      replace(failed)
      throw commandFailure(reason)
    }
  }
  const clearPlan = async (instanceId: string) => {
    const entry = current(instanceId)
    available(entry.planAction)
    replace({ ...entry, planAction: { status: 'submitting', error: null } })
    try {
      await requireClient().execute('plan.clear', { sessionId: entry.sessionId })
      const latest = current(instanceId)
      const next: GoalPlanWorkspaceEntryState = {
        ...latest,
        plan: null,
        planDraft: planDraft(null),
        planDirty: false,
        planAction: { status: 'succeeded', error: null },
      }
      replace(next)
      return summary(next)
    } catch (reason) {
      const latest = current(instanceId)
      const error = code(reason)
      const failed = {
        ...latest,
        planAction: { status: UNKNOWN_CODES.has(error) ? ('unknown' as const) : ('failed' as const), error },
      }
      replace(failed)
      throw commandFailure(reason)
    }
  }

  local.register(goalPlanWorkspaceCommands['goalPlanWorkspace.refresh'], ({ instanceId }) => load(instanceId))
  local.register(goalPlanWorkspaceCommands['goalPlanWorkspace.showOverview'], ({ instanceId }) =>
    show(instanceId, 'overview'),
  )
  local.register(goalPlanWorkspaceCommands['goalPlanWorkspace.showGoalEditor'], ({ instanceId }) =>
    show(instanceId, 'goal'),
  )
  local.register(goalPlanWorkspaceCommands['goalPlanWorkspace.showPlanEditor'], ({ instanceId }) =>
    show(instanceId, 'plan'),
  )
  local.register(goalPlanWorkspaceCommands['goalPlanWorkspace.setGoalField'], ({ instanceId, field, value }) =>
    setGoalField(instanceId, field, value),
  )
  local.register(goalPlanWorkspaceCommands['goalPlanWorkspace.saveGoal'], ({ instanceId }) => saveGoal(instanceId))
  local.register(goalPlanWorkspaceCommands['goalPlanWorkspace.clearGoal'], ({ instanceId }) => clearGoal(instanceId))
  local.register(goalPlanWorkspaceCommands['goalPlanWorkspace.setExplanation'], ({ instanceId, value }) =>
    setExplanation(instanceId, value),
  )
  local.register(goalPlanWorkspaceCommands['goalPlanWorkspace.setNewStep'], ({ instanceId, value }) =>
    setNewStep(instanceId, value),
  )
  local.register(goalPlanWorkspaceCommands['goalPlanWorkspace.addStep'], ({ instanceId }) => addStep(instanceId))
  local.register(goalPlanWorkspaceCommands['goalPlanWorkspace.setStep'], ({ instanceId, stepId, step, status }) =>
    setStep(instanceId, stepId, step, status),
  )
  local.register(goalPlanWorkspaceCommands['goalPlanWorkspace.moveStep'], ({ instanceId, stepId, direction }) =>
    moveStep(instanceId, stepId, direction),
  )
  local.register(goalPlanWorkspaceCommands['goalPlanWorkspace.removeStep'], ({ instanceId, stepId }) =>
    removeStep(instanceId, stepId),
  )
  local.register(goalPlanWorkspaceCommands['goalPlanWorkspace.savePlan'], ({ instanceId }) => savePlan(instanceId))
  local.register(goalPlanWorkspaceCommands['goalPlanWorkspace.clearPlan'], ({ instanceId }) => clearPlan(instanceId))
  return {
    reader: state.reader,
    dispose() {
      generations.clear()
      state.dispose()
    },
  }
}
