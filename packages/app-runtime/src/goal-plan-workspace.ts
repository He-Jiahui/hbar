import { CommandError, createCommandClient, type CommandRegistry } from '@hbar/commands'
import {
  goalControlStatusSchema,
  MAX_PLAN_STEPS,
  type PlanState,
  type PlanStepStatus,
  type ThreadGoal,
} from '@hbar/contracts'
import { goalPlanWorkspaceCommands } from '@hbar/contracts/commands/goal-plan-workspace'
import { goalPlanCommands, goalPlanSnapshotSchema } from '@hbar/contracts/commands/goals'
import type { GoalPlanChange, GoalPlanSnapshot } from '@hbar/contracts/commands/goals'
import { GoalPlanFeed } from './goal-plan-feed'
import type { SessionExecutionPreparationPort } from './session-execution-preparation'
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
  const fields = {
    objective: goal?.objective ?? '',
    status: goal?.status ?? 'active',
    tokenBudget: goal?.tokenBudget === null || goal?.tokenBudget === undefined ? '' : String(goal.tokenBudget),
  }
  return {
    ...fields,
    baseline: { ...fields, goalId: goal?.goalId ?? null, exists: goal !== null },
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

function goalDirty(draft: GoalPlanGoalDraftState): boolean {
  return (
    draft.objective !== draft.baseline.objective ||
    draft.status !== draft.baseline.status ||
    draft.tokenBudget !== draft.baseline.tokenBudget
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
  preparation?: SessionExecutionPreparationPort,
) {
  const state = createState<GoalPlanWorkspaceState>({ entries: {} }, onSubscriberError)
  const client = options.goals ? createCommandClient(goalPlanCommands, options.goals) : null
  const generations = new Map<string, number>()
  const detachedPanels = new Set<string>()
  const goalOperations = new Map<string, { sessionId: string; token: symbol }>()
  const pendingGoal = (instanceId: string, sessionId: string) => goalOperations.get(instanceId)?.sessionId === sessionId
  const isTarget = (instanceId: string, sessionId: string) =>
    !isDisposed() && surfaces.getSnapshot().panels[instanceId]?.sessionId === sessionId
  const feed = new GoalPlanFeed(options.goals, applyChange, (instanceId) => {
    void load(instanceId, true).catch(() => {})
  })
  const offSurfaces = surfaces.subscribe(() => {
    for (const [id, entry] of Object.entries(state.reader.getSnapshot().entries)) {
      if (isTarget(id, entry.sessionId)) {
        // The View may reuse a cached same-session entry on reopen. Restore
        // the subscription and reconcile while preserving unsaved drafts.
        if (detachedPanels.delete(id)) void load(id).catch(() => {})
        continue
      }
      detachedPanels.add(id)
      generations.set(id, (generations.get(id) ?? 0) + 1)
      goalOperations.delete(id)
      feed.close(id)
    }
  })

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
          detachedPanels.delete(id)
          feed.close(id)
          break
        }
      }
    state.replace({ entries })
  }
  function applyChange(instanceId: string, change: GoalPlanChange) {
    const entry = state.reader.getSnapshot().entries[instanceId]
    if (!entry || entry.sessionId !== change.sessionId || !isTarget(instanceId, change.sessionId)) return
    if (change.kind === 'goal') {
      const preserve = entry.goalDirty || pendingGoal(instanceId, change.sessionId)
      replace({
        ...entry,
        goal: change.goal,
        remainingTokens:
          change.goal?.tokenBudget == null ? null : Math.max(0, change.goal.tokenBudget - change.goal.tokensUsed),
        goalDraft: preserve ? entry.goalDraft : goalDraft(change.goal),
        goalDirty: preserve && goalDirty(entry.goalDraft),
      })
    } else
      replace({ ...entry, plan: change.plan, planDraft: entry.planDirty ? entry.planDraft : planDraft(change.plan) })
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
  const load = async (instanceId: string, background = false) => {
    const target = panel(instanceId)
    detachedPanels.delete(instanceId)
    const previous = state.reader.getSnapshot().entries[instanceId]
    const sameTarget = previous?.sessionId === target.sessionId
    const generation = (generations.get(instanceId) ?? 0) + 1
    generations.set(instanceId, generation)
    const loading: GoalPlanWorkspaceEntryState = {
      instanceId,
      sessionId: target.sessionId,
      view: sameTarget ? previous.view : 'overview',
      status: background && sameTarget ? previous.status : 'loading',
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
    feed.open(instanceId, target.sessionId)
    try {
      let snapshot: GoalPlanSnapshot | undefined
      const [goalResponse, savedPlan] = options.goals?.snapshot
        ? await options.goals.snapshot(target.sessionId).then((value) => {
            snapshot = goalPlanSnapshotSchema.parse(value)
            if (
              snapshot.sessionId !== target.sessionId ||
              (snapshot.goal && snapshot.goal.threadId !== target.sessionId) ||
              (snapshot.plan && snapshot.plan.sessionId !== target.sessionId)
            )
              throw new CommandError('INVALID_OUTPUT', 'Snapshot belongs to another session')
            return [snapshot, snapshot.plan] as const
          })
        : await Promise.all([
            requireClient().execute('goal.get', { sessionId: target.sessionId }),
            requireClient().execute('plan.get', { sessionId: target.sessionId }),
          ])
      if (!isTarget(instanceId, target.sessionId) || generations.get(instanceId) !== generation)
        throw new CommandError('RESULT_UNKNOWN', 'Goal and plan refresh was superseded')
      const latest = state.reader.getSnapshot().entries[instanceId] ?? loading
      const reconcileGoal =
        !pendingGoal(instanceId, target.sessionId) && (latest.goalAction.status === 'unknown' || !latest.goalDirty)
      const reconcilePlan = latest.planAction.status === 'unknown' || !latest.planDirty
      const ready: GoalPlanWorkspaceEntryState = {
        ...latest,
        status: 'ready',
        goal: goalResponse.goal,
        remainingTokens: goalResponse.remainingTokens,
        completionBudgetReport: goalResponse.completionBudgetReport ?? null,
        goalDraft: reconcileGoal ? goalDraft(goalResponse.goal) : latest.goalDraft,
        goalDirty: reconcileGoal ? false : goalDirty(latest.goalDraft),
        goalAction:
          background || pendingGoal(instanceId, target.sessionId) ? latest.goalAction : { status: 'idle', error: null },
        plan: savedPlan,
        planDraft: reconcilePlan ? planDraft(savedPlan) : latest.planDraft,
        planDirty: reconcilePlan ? false : planDirty(savedPlan, latest.planDraft),
        planAction: background ? latest.planAction : { status: 'idle', error: null },
        error: null,
      }
      replace(ready)
      if (snapshot) feed.finish(instanceId, snapshot)
      return summary(state.reader.getSnapshot().entries[instanceId] ?? ready)
    } catch (reason) {
      if (!isTarget(instanceId, target.sessionId) || generations.get(instanceId) !== generation) throw reason
      feed.close(instanceId)
      const failed = {
        ...(state.reader.getSnapshot().entries[instanceId] ?? loading),
        status: 'error' as const,
        error: code(reason),
      }
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
      goalDirty: goalDirty(goalDraftState),
      goalAction: { status: 'idle' as const, error: null },
    }
    replace(next)
    return summary(next)
  }
  const saveGoal = async (instanceId: string) => {
    const entry = current(instanceId)
    if (entry.view !== 'goal') throw new CommandError('INVALID_INPUT', 'Open the goal editor before saving it')
    available(entry.goalAction)
    if (pendingGoal(instanceId, entry.sessionId)) throw new CommandError('BUSY', 'A Goal operation is still pending')
    const tokenText = entry.goalDraft.tokenBudget.trim()
    const tokenBudget = tokenText ? Number(tokenText) : null
    const baseline = entry.goalDraft.baseline
    const input = baseline.exists
      ? {
          sessionId: entry.sessionId,
          ...(entry.goalDraft.objective === baseline.objective ? {} : { objective: entry.goalDraft.objective }),
          ...(entry.goalDraft.status === baseline.status ? {} : { status: entry.goalDraft.status }),
          ...(entry.goalDraft.tokenBudget === baseline.tokenBudget ? {} : { tokenBudget }),
          ...(baseline.goalId ? { expectedGoalId: baseline.goalId } : {}),
        }
      : {
          sessionId: entry.sessionId,
          objective: entry.goalDraft.objective,
          ...(tokenBudget === null ? {} : { tokenBudget }),
        }
    const definition = baseline.exists ? goalPlanCommands['goal.set'] : goalPlanCommands['goal.create']
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
    const operation = Symbol('goal-save')
    const factVersion = feed.version(instanceId)
    goalOperations.set(instanceId, { sessionId: entry.sessionId, token: operation })
    const ownsOperation = () =>
      isTarget(instanceId, entry.sessionId) && goalOperations.get(instanceId)?.token === operation
    replace({ ...entry, goalAction: { status: 'submitting', error: null } })
    let dispatched = false
    try {
      const target = await preparation?.capture(entry.sessionId)
      if (!ownsOperation()) throw new CommandError('STALE_TARGET', 'Goal preparation belongs to a previous panel')
      const scoped = panel(instanceId)
      if (target && scoped.workspaceId !== null && scoped.workspaceId !== target.workspaceId)
        throw new CommandError('STALE_TARGET', 'Goal panel workspace no longer matches the captured Session')
      if (target) preparation?.assertCanPrepare(target)
      dispatched = true
      const response = baseline.exists
        ? await requireClient().execute('goal.set', parsed.data as never)
        : await requireClient().execute('goal.create', parsed.data as never)
      if (!ownsOperation()) throw new CommandError('RESULT_UNKNOWN', 'Goal save belongs to a previous panel target')
      const latest = current(instanceId)
      if (latest.goal?.goalId !== entry.goal?.goalId && latest.goal?.goalId !== response.goal?.goalId)
        throw new CommandError('GOAL_CONFLICT', 'A newer Goal superseded this save response')
      const next: GoalPlanWorkspaceEntryState = {
        ...latest,
        goal: feed.version(instanceId) > factVersion ? latest.goal : response.goal,
        remainingTokens: feed.version(instanceId) > factVersion ? latest.remainingTokens : response.remainingTokens,
        completionBudgetReport: response.completionBudgetReport ?? null,
        goalDraft: goalDraft(feed.version(instanceId) > factVersion ? latest.goal : response.goal),
        goalDirty: false,
        goalAction: { status: 'succeeded', error: null },
      }
      replace(next)
      return summary(next)
    } catch (reason) {
      if (!ownsOperation()) throw commandFailure(reason)
      const latest = current(instanceId)
      const error = code(reason)
      const failed = {
        ...latest,
        goalAction: {
          status: dispatched && UNKNOWN_CODES.has(error) ? ('unknown' as const) : ('failed' as const),
          error,
        },
      }
      replace(failed)
      throw commandFailure(reason)
    } finally {
      if (goalOperations.get(instanceId)?.token === operation) goalOperations.delete(instanceId)
    }
  }
  const clearGoal = async (instanceId: string) => {
    const entry = current(instanceId)
    available(entry.goalAction)
    if (pendingGoal(instanceId, entry.sessionId)) throw new CommandError('BUSY', 'A Goal operation is still pending')
    const operation = Symbol('goal-clear')
    goalOperations.set(instanceId, { sessionId: entry.sessionId, token: operation })
    const ownsOperation = () =>
      isTarget(instanceId, entry.sessionId) && goalOperations.get(instanceId)?.token === operation
    replace({ ...entry, goalAction: { status: 'submitting', error: null } })
    try {
      await requireClient().execute('goal.clear', {
        sessionId: entry.sessionId,
        ...(entry.goal?.goalId ? { expectedGoalId: entry.goal.goalId } : {}),
      })
      if (!ownsOperation()) throw new CommandError('RESULT_UNKNOWN', 'Goal clear belongs to a previous panel target')
      const latest = current(instanceId)
      if (latest.goal && latest.goal.goalId !== entry.goal?.goalId)
        throw new CommandError('GOAL_CONFLICT', 'A newer Goal superseded this clear response')
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
      if (!ownsOperation()) throw commandFailure(reason)
      const latest = current(instanceId)
      const error = code(reason)
      const failed = {
        ...latest,
        goalAction: { status: UNKNOWN_CODES.has(error) ? ('unknown' as const) : ('failed' as const), error },
      }
      replace(failed)
      throw commandFailure(reason)
    } finally {
      if (goalOperations.get(instanceId)?.token === operation) goalOperations.delete(instanceId)
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
    let dispatched = false
    try {
      const target = await preparation?.capture(entry.sessionId)
      if (!isTarget(instanceId, entry.sessionId))
        throw new CommandError('STALE_TARGET', 'Plan preparation belongs to a previous panel')
      const scoped = panel(instanceId)
      if (target && scoped.workspaceId !== null && scoped.workspaceId !== target.workspaceId)
        throw new CommandError('STALE_TARGET', 'Plan panel workspace no longer matches the captured Session')
      if (target) preparation?.assertCanPrepare(target)
      dispatched = true
      const saved = await requireClient().execute('plan.update', parsed.data)
      if (!isTarget(instanceId, entry.sessionId))
        throw new CommandError('RESULT_UNKNOWN', 'Plan save belongs to a previous panel target')
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
      if (!isTarget(instanceId, entry.sessionId)) throw commandFailure(reason)
      const latest = current(instanceId)
      const error = code(reason)
      const failed = {
        ...latest,
        planAction: {
          status: dispatched && UNKNOWN_CODES.has(error) ? ('unknown' as const) : ('failed' as const),
          error,
        },
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
  local.register(goalPlanWorkspaceCommands['goalPlanWorkspace.discardGoalEdits'], ({ instanceId }) => {
    const entry = current(instanceId)
    available(entry.goalAction)
    if (pendingGoal(instanceId, entry.sessionId)) throw new CommandError('BUSY', 'A Goal operation is still pending')
    const next = {
      ...entry,
      goalDraft: goalDraft(entry.goal),
      goalDirty: false,
      goalAction: { status: 'idle' as const, error: null },
    }
    replace(next)
    return summary(next)
  })
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
      offSurfaces()
      feed.dispose()
      generations.clear()
      detachedPanels.clear()
      goalOperations.clear()
      state.dispose()
    },
  }
}
