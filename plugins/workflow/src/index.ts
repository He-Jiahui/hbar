import { createHash } from 'node:crypto'
import { isAbsolute, relative, resolve } from 'node:path'
import { z } from 'zod'
import {
  HbarError,
  MAX_WORKFLOW_EVIDENCE,
  WORKFLOW_SCHEMA_VERSION,
  workflowPlanItemSchema,
  workflowPlanSchema,
  workflowScopeSchema,
  workflowSnapshotSchema,
  workflowStateSchema,
} from '@hbar/contracts'
import type {
  Run,
  SessionEvent,
  WorkflowAcceptanceCheck,
  WorkflowPlan,
  WorkflowPlanItem,
  WorkflowPlanItemInput,
  WorkflowScope,
  WorkflowSnapshot,
  WorkflowStartCommand,
  WorkflowState,
  WorkflowWorkItem,
} from '@hbar/contracts'
import {
  workflowCheckpointInputSchema,
  workflowExpandScopeInputSchema,
  workflowPlanSaveInputSchema,
  workflowStartInputSchema,
} from '@hbar/contracts/commands/workflows'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type {
  GoalService,
  HbarAPI,
  ModelRequest,
  ToolContext,
  ToolDefinition,
  ToolResult,
  WorkflowService,
} from '@hbar/plugin-sdk'

const MAX_RESTORE_EVENTS = 100_000
const RESTORE_CONCURRENCY = 8
const CONTROL_TOOLS = new Set([
  'get_goal',
  'get_workflow',
  'workflow_start',
  'workflow_update',
  'save_workflow_plan',
  'request_user_input',
])

export const workflowConfigSchema = z.object({
  maxExplorationCalls: z.number().int().min(1).max(32).default(8),
  maxRestoreEvents: z.number().int().min(1_000).max(MAX_RESTORE_EVENTS).default(MAX_RESTORE_EVENTS),
})
export type WorkflowConfig = z.output<typeof workflowConfigSchema>

const planSavedEventSchema = z.strictObject({ plan: workflowPlanSchema })
const workflowStartedEventSchema = z.strictObject({ plan: workflowPlanSchema, workflow: workflowStateSchema })
const workflowUpdatedEventSchema = z.object({ workflow: workflowStateSchema })

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function unique(values: readonly string[]) {
  return [...new Set(values)]
}

function mergeScope(current: WorkflowScope, addition: WorkflowScope): WorkflowScope {
  return workflowScopeSchema.parse({
    readPaths: unique([...current.readPaths, ...addition.readPaths]),
    writePaths: unique([...current.writePaths, ...addition.writePaths]),
    tools: unique([...current.tools, ...addition.tools]),
  })
}

function checksOf(item: WorkflowPlanItem, now: number): WorkflowAcceptanceCheck[] {
  return item.acceptanceChecks.map((check) => ({
    ...check,
    status: 'pending',
    evidenceId: null,
    updatedAt: now,
  }))
}

function workItemsOf(items: WorkflowPlanItem[], now: number): WorkflowWorkItem[] {
  return items.map((item, index) => ({
    ...item,
    status: index === 0 ? 'in_progress' : 'pending',
    owner: { kind: 'main' },
    acceptanceChecks: checksOf(item, now),
    startedAt: index === 0 ? now : null,
    completedAt: null,
  }))
}

function requiredChecksPass(item: WorkflowWorkItem) {
  return item.acceptanceChecks
    .filter((check) => check.required)
    .every((check) => check.status === 'passed' || check.status === 'accepted')
}

function relativeToolPath(workspace: string, value: string) {
  const absolute = resolve(workspace, value)
  const path = relative(workspace, absolute).replaceAll('\\', '/') || '.'
  if (path === '..' || path.startsWith('../') || isAbsolute(path))
    throw new HbarError('WORKFLOW_SCOPE_REQUIRED', `Tool path is outside the workflow workspace: ${value}`)
  return path
}

function argumentPaths(workspace: string, value: unknown, key = ''): string[] {
  if (typeof value === 'string' && ['path', 'paths', 'cwd', 'root', 'directory'].includes(key.toLowerCase()))
    return [relativeToolPath(workspace, value)]
  if (Array.isArray(value)) return value.flatMap((entry) => argumentPaths(workspace, entry, key))
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([childKey, entry]) => argumentPaths(workspace, entry, childKey))
}

function pathAllowed(path: string, allowed: readonly string[]) {
  return allowed.some((entry) => {
    const normalized = entry.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '') || '.'
    return normalized === '.' || path === normalized || path.startsWith(`${normalized}/`)
  })
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonical(entry)]),
  )
}

function hashValue(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex')
}

function expectedArgumentsMatch(expected: Record<string, unknown> | undefined, actual: Record<string, unknown>) {
  if (!expected) return true
  return Object.entries(expected).every(
    ([key, value]) =>
      Object.hasOwn(actual, key) && JSON.stringify(canonical(actual[key])) === JSON.stringify(canonical(value)),
  )
}

function evaluateToolCheck(
  check: WorkflowAcceptanceCheck,
  name: string,
  args: Record<string, unknown>,
  result: ToolResult,
): 'passed' | 'failed' | null {
  if (check.verifier.kind === 'tool') {
    if (check.verifier.toolName !== name || !expectedArgumentsMatch(check.verifier.expectedArguments, args)) return null
    return result.isError ? 'failed' : 'passed'
  }
  if (check.verifier.kind === 'workspace') {
    if (name !== 'read_file' || args.path !== check.verifier.path) return null
    if (result.isError) return 'failed'
    if (check.verifier.expectation.kind === 'exists') return 'passed'
    if (check.verifier.expectation.kind === 'textContains')
      return result.text.includes(check.verifier.expectation.value) ? 'passed' : 'failed'
    return createHash('sha256').update(result.text).digest('hex') === check.verifier.expectation.value
      ? 'passed'
      : 'failed'
  }
  if (check.verifier.kind === 'browser')
    return name.startsWith('browser_')
      ? !result.isError && result.text.includes(check.verifier.assertion)
        ? 'passed'
        : 'failed'
      : null
  return null
}

export class WorkflowRuntime implements WorkflowService {
  private plans = new Map<string, WorkflowPlan>()
  private workflows = new Map<string, WorkflowState>()
  private locks = new Map<string, Promise<void>>()
  private hydrated = false

  constructor(
    private api: HbarAPI,
    private goals: GoalService,
    private config: WorkflowConfig,
  ) {}

  async restore() {
    const sessions = await this.api.sessions.list()
    for (let offset = 0; offset < sessions.length; offset += RESTORE_CONCURRENCY)
      await Promise.all(
        sessions.slice(offset, offset + RESTORE_CONCURRENCY).map((session) => this.restoreSession(session.id)),
      )
    this.hydrated = true
  }

  private async restoreSession(sessionId: string) {
    const events = await this.api.sessions.events(sessionId, 0, this.config.maxRestoreEvents + 1)
    if (events.length > this.config.maxRestoreEvents)
      throw new HbarError(
        'WORKFLOW_RESTORE_LIMIT',
        `Workflow replay for ${sessionId} exceeded ${this.config.maxRestoreEvents} events`,
      )
    for (const event of events) this.applyEvent(sessionId, event)
  }

  private applyEvent(sessionId: string, event: SessionEvent) {
    if (event.type === 'workflow.plan.saved') {
      const parsed = planSavedEventSchema.safeParse(event.data)
      if (!parsed.success || parsed.data.plan.sessionId !== sessionId)
        throw new HbarError('WORKFLOW_REPLAY', `Invalid workflow.plan.saved event in ${sessionId}`)
      this.plans.set(sessionId, parsed.data.plan)
      return
    }
    if (event.type === 'workflow.started') {
      const parsed = workflowStartedEventSchema.safeParse(event.data)
      if (
        !parsed.success ||
        parsed.data.plan.sessionId !== sessionId ||
        parsed.data.workflow.sessionId !== sessionId ||
        parsed.data.workflow.planId !== parsed.data.plan.planId
      )
        throw new HbarError('WORKFLOW_REPLAY', `Invalid workflow.started event in ${sessionId}`)
      this.plans.set(sessionId, parsed.data.plan)
      this.workflows.set(sessionId, parsed.data.workflow)
      return
    }
    if (event.type === 'workflow.updated') {
      const parsed = workflowUpdatedEventSchema.safeParse(event.data)
      if (!parsed.success || parsed.data.workflow.sessionId !== sessionId)
        throw new HbarError('WORKFLOW_REPLAY', `Invalid workflow.updated event in ${sessionId}`)
      this.workflows.set(sessionId, parsed.data.workflow)
    }
  }

  private async ready() {
    if (!this.hydrated) throw new HbarError('WORKFLOW_UNAVAILABLE', 'Workflow service has not finished restoring state')
  }

  private async serial<T>(sessionId: string, operation: () => Promise<T>) {
    const previous = this.locks.get(sessionId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolveLock) => {
      release = resolveLock
    })
    this.locks.set(sessionId, current)
    await previous
    try {
      await this.ready()
      await this.api.sessions.get(sessionId)
      return await operation()
    } finally {
      release()
      if (this.locks.get(sessionId) === current) this.locks.delete(sessionId)
    }
  }

  private snapshot(sessionId: string): WorkflowSnapshot {
    return workflowSnapshotSchema.parse({
      plan: this.plans.get(sessionId) ?? null,
      workflow: this.workflows.get(sessionId) ?? null,
    })
  }

  async get(sessionId: string) {
    await this.ready()
    await this.api.sessions.get(sessionId)
    return this.snapshot(sessionId)
  }

  private publish(sessionId: string) {
    const snapshot = this.snapshot(sessionId)
    this.api.notify({ method: 'workflow.updated', params: { sessionId, snapshot } })
    this.api.changed('workflows')
    return snapshot
  }

  private async persistPlan(plan: WorkflowPlan, runId?: string) {
    await this.api.sessions.append(plan.sessionId, 'workflow.plan.saved', { plan }, runId)
    this.plans.set(plan.sessionId, plan)
    return this.publish(plan.sessionId)
  }

  private async persistStarted(plan: WorkflowPlan, workflow: WorkflowState, runId?: string) {
    await this.api.sessions.append(plan.sessionId, 'workflow.started', { plan, workflow }, runId)
    this.plans.set(plan.sessionId, plan)
    this.workflows.set(plan.sessionId, workflow)
    return this.publish(plan.sessionId)
  }

  private async persistWorkflow(workflow: WorkflowState, runId?: string, data: Record<string, unknown> = {}) {
    await this.api.sessions.append(workflow.sessionId, 'workflow.updated', { workflow, ...data }, runId)
    this.workflows.set(workflow.sessionId, workflow)
    return this.publish(workflow.sessionId)
  }

  async savePlan(
    sessionId: string,
    objective: string,
    items: WorkflowPlanItemInput[],
    expectedRevision?: number | null,
  ) {
    return this.serial(sessionId, async () => {
      const current = this.plans.get(sessionId)
      if ((expectedRevision ?? null) !== (current?.revision ?? null))
        throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'The workflow plan changed before this update was applied')
      const now = Date.now()
      const parsedItems = z.array(workflowPlanItemSchema).min(1).parse(items)
      const plan = workflowPlanSchema.parse({
        schemaVersion: WORKFLOW_SCHEMA_VERSION,
        planId: current?.planId ?? crypto.randomUUID(),
        sessionId,
        revision: (current?.revision ?? 0) + 1,
        phase: 'draft',
        objective,
        items: parsedItems,
        createdAt: current?.createdAt ?? now,
        updatedAt: now,
      })
      return this.persistPlan(plan)
    })
  }

  private async goalFor(sessionId: string, objective: string, tokenBudget?: number, run?: Run) {
    const current = await this.goals.get(sessionId)
    if (!current.goal || current.goal.status === 'complete')
      return (await this.goals.create(sessionId, objective, tokenBudget, run?.id, run?.startedAt ?? run?.createdAt))
        .goal
    if (current.goal.objective !== objective)
      throw new HbarError('WORKFLOW_GOAL_CONFLICT', 'An unfinished goal with a different objective already exists')
    if (current.goal.status !== 'active')
      throw new HbarError('WORKFLOW_GOAL_CONFLICT', `The existing goal is ${current.goal.status}`)
    return current.goal
  }

  private stateFor(
    sessionId: string,
    plan: WorkflowPlan,
    goalId: string,
    now: number,
    startCommand: WorkflowStartCommand | null,
  ): WorkflowState {
    return workflowStateSchema.parse({
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      workflowId: crypto.randomUUID(),
      sessionId,
      goalId,
      planId: plan.planId,
      planRevision: plan.revision,
      revision: 1,
      status: 'active',
      activeItemId: plan.items[0]!.id,
      explorationCount: 0,
      workItems: workItemsOf(plan.items, now),
      scopeExpansions: [],
      delegations: [],
      evidence: [],
      startCommand,
      createdAt: now,
      updatedAt: now,
    })
  }

  async start(
    sessionId: string,
    objective: string,
    items: WorkflowPlanItemInput[],
    tokenBudget?: number,
    run?: Run,
    command?: WorkflowStartCommand,
  ) {
    return this.serial(sessionId, async () => {
      const existing = this.workflows.get(sessionId)
      if (
        command &&
        existing?.startCommand?.actorId === command.actorId &&
        existing.startCommand.idempotencyKey === command.idempotencyKey
      ) {
        if (existing.startCommand.inputHash !== command.inputHash)
          throw new HbarError('IDEMPOTENCY_CONFLICT', 'Workflow key was used with different input')
        return this.snapshot(sessionId)
      }
      if (existing && existing.status !== 'completed')
        throw new HbarError('WORKFLOW_EXISTS', 'An unfinished workflow already exists for this session')
      const parsedItems = z.array(workflowPlanItemSchema).min(1).parse(items)
      const now = Date.now()
      const currentPlan = this.plans.get(sessionId)
      const plan = workflowPlanSchema.parse({
        schemaVersion: WORKFLOW_SCHEMA_VERSION,
        planId: currentPlan?.planId ?? crypto.randomUUID(),
        sessionId,
        revision: (currentPlan?.revision ?? 0) + 1,
        phase: 'active',
        objective,
        items: parsedItems,
        createdAt: currentPlan?.createdAt ?? now,
        updatedAt: now,
      })
      const goal = await this.goalFor(sessionId, plan.objective, tokenBudget, run)
      if (!goal) throw new HbarError('WORKFLOW_GOAL', 'Workflow goal creation returned no goal')
      const workflow = this.stateFor(sessionId, plan, goal.goalId ?? goal.threadId, now, command ?? null)
      return this.persistStarted(plan, workflow, run?.id)
    })
  }

  async activate(sessionId: string, planRevision: number, tokenBudget?: number, run?: Run) {
    return this.serial(sessionId, async () => {
      const existing = this.workflows.get(sessionId)
      if (existing && existing.status !== 'completed') {
        if (existing.planRevision === planRevision) return this.snapshot(sessionId)
        throw new HbarError('WORKFLOW_EXISTS', 'An unfinished workflow already exists for this session')
      }
      const current = this.plans.get(sessionId)
      if (!current || current.phase !== 'draft' || current.revision !== planRevision)
        throw new HbarError(
          'WORKFLOW_REVISION_CONFLICT',
          'The requested workflow plan revision is not the current draft',
        )
      const now = Date.now()
      const plan = workflowPlanSchema.parse({ ...current, phase: 'active', updatedAt: now })
      const goal = await this.goalFor(sessionId, plan.objective, tokenBudget, run)
      if (!goal) throw new HbarError('WORKFLOW_GOAL', 'Workflow goal creation returned no goal')
      const workflow = this.stateFor(sessionId, plan, goal.goalId ?? goal.threadId, now, null)
      return this.persistStarted(plan, workflow, run?.id)
    })
  }

  private current(sessionId: string, expectedRevision: number) {
    const workflow = this.workflows.get(sessionId)
    if (!workflow) throw new HbarError('WORKFLOW_NOT_FOUND', 'No workflow exists for this session')
    if (workflow.revision !== expectedRevision)
      throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'The workflow changed before this update was applied')
    if (workflow.status === 'completed') throw new HbarError('WORKFLOW_COMPLETE', 'The workflow is already complete')
    return workflow
  }

  async expandScope(
    sessionId: string,
    itemId: string,
    scopeValue: WorkflowScope,
    reason: string,
    expectedRevision: number,
  ) {
    return this.serial(sessionId, async () => {
      const current = this.current(sessionId, expectedRevision)
      const scope = workflowScopeSchema.parse(scopeValue)
      const item = current.workItems.find((candidate) => candidate.id === itemId)
      if (!item) throw new HbarError('WORKFLOW_ITEM_NOT_FOUND', 'The workflow item does not exist')
      const now = Date.now()
      const workflow = workflowStateSchema.parse({
        ...current,
        revision: current.revision + 1,
        status: current.status === 'blocked' ? 'active' : current.status,
        activeItemId: itemId,
        explorationCount: 0,
        workItems: current.workItems.map((candidate) =>
          candidate.id === itemId
            ? {
                ...candidate,
                scope: mergeScope(candidate.scope, scope),
                status: 'in_progress',
                startedAt: candidate.startedAt ?? now,
              }
            : candidate,
        ),
        scopeExpansions: [
          ...current.scopeExpansions,
          { expansionId: crypto.randomUUID(), itemId, scope, reason, createdAt: now },
        ],
        updatedAt: now,
      })
      return this.persistWorkflow(workflow, undefined, { checkpoint: { kind: 'scope', itemId, reason } })
    })
  }

  async checkpoint(
    sessionId: string,
    itemId: string,
    outcome: 'progress' | 'revise' | 'complete' | 'blocked',
    summary: string,
    nextItemId: string | null | undefined,
    expectedRevision: number,
  ) {
    return this.serial(sessionId, async () => {
      const current = this.current(sessionId, expectedRevision)
      const item = current.workItems.find((candidate) => candidate.id === itemId)
      if (!item) throw new HbarError('WORKFLOW_ITEM_NOT_FOUND', 'The workflow item does not exist')
      if (outcome === 'complete' && !requiredChecksPass(item))
        throw new HbarError('WORKFLOW_ACCEPTANCE_PENDING', 'Required acceptance checks are not satisfied')
      const now = Date.now()
      const remaining = current.workItems.filter(
        (candidate) => candidate.id !== itemId && candidate.status !== 'completed',
      )
      const requestedNext = nextItemId
        ? remaining.find((candidate) => candidate.id === nextItemId)
        : outcome === 'complete'
          ? remaining.find((candidate) => candidate.status === 'pending')
          : undefined
      if (nextItemId && !requestedNext)
        throw new HbarError('WORKFLOW_ITEM_NOT_FOUND', 'The next workflow item is unavailable')
      const workItems = current.workItems.map((candidate) => {
        if (candidate.id === itemId)
          return {
            ...candidate,
            status:
              outcome === 'blocked'
                ? ('blocked' as const)
                : outcome === 'complete'
                  ? ('completed' as const)
                  : ('in_progress' as const),
            startedAt: candidate.startedAt ?? now,
            completedAt: outcome === 'complete' ? now : null,
          }
        if (requestedNext?.id === candidate.id)
          return { ...candidate, status: 'in_progress' as const, startedAt: candidate.startedAt ?? now }
        return candidate
      })
      const workflow = workflowStateSchema.parse({
        ...current,
        revision: current.revision + 1,
        status: outcome === 'blocked' ? 'blocked' : 'active',
        activeItemId: outcome === 'blocked' ? itemId : (requestedNext?.id ?? (outcome === 'complete' ? null : itemId)),
        explorationCount: 0,
        workItems,
        updatedAt: now,
      })
      return this.persistWorkflow(workflow, undefined, { checkpoint: { kind: outcome, itemId, summary } })
    })
  }

  async acceptCheck(
    sessionId: string,
    itemId: string,
    checkId: string,
    decision: 'accepted' | 'rejected',
    note: string | null | undefined,
    expectedRevision: number,
    actorId: string,
  ) {
    return this.serial(sessionId, async () => {
      const current = this.current(sessionId, expectedRevision)
      const item = current.workItems.find((candidate) => candidate.id === itemId)
      const check = item?.acceptanceChecks.find((candidate) => candidate.id === checkId)
      if (!item || !check) throw new HbarError('WORKFLOW_CHECK_NOT_FOUND', 'The acceptance check does not exist')
      if (check.verifier.kind !== 'user')
        throw new HbarError('WORKFLOW_CHECK_INVALID', 'Only user-verifiable checks can be accepted manually')
      const now = Date.now()
      const evidenceId = crypto.randomUUID()
      const workflow = workflowStateSchema.parse({
        ...current,
        revision: current.revision + 1,
        workItems: current.workItems.map((candidate) =>
          candidate.id === itemId
            ? {
                ...candidate,
                acceptanceChecks: candidate.acceptanceChecks.map((candidateCheck) =>
                  candidateCheck.id === checkId
                    ? { ...candidateCheck, status: decision, evidenceId, updatedAt: now }
                    : candidateCheck,
                ),
              }
            : candidate,
        ),
        evidence: [
          ...current.evidence,
          {
            evidenceId,
            itemId,
            checkId,
            planRevision: current.planRevision,
            workspaceRevision: null,
            createdAt: now,
            source: 'user',
            outcome: decision,
            actorId,
            note: note ?? null,
          },
        ],
        updatedAt: now,
      })
      return this.persistWorkflow(workflow)
    })
  }

  private assertCompletable(workflow: WorkflowState) {
    const pendingItems = workflow.workItems.filter((item) => item.status !== 'completed')
    const pendingChecks = workflow.workItems.flatMap((item) =>
      item.acceptanceChecks.filter(
        (check) => check.required && check.status !== 'passed' && check.status !== 'accepted',
      ),
    )
    const pendingDelegations = workflow.delegations.filter(
      (delegation) => !['applied', 'cancelled'].includes(delegation.status),
    )
    if (pendingItems.length || pendingChecks.length || pendingDelegations.length)
      throw new HbarError(
        'WORKFLOW_ACCEPTANCE_PENDING',
        `Workflow completion requires ${pendingItems.length} work items, ${pendingChecks.length} checks, and ${pendingDelegations.length} delegations to settle`,
      )
  }

  guardCompletion(sessionId: string, goalId?: string) {
    const workflow = this.workflows.get(sessionId)
    if (!workflow || workflow.status === 'completed') return
    if (goalId && workflow.goalId && workflow.goalId !== goalId) return
    this.assertCompletable(workflow)
  }

  async complete(sessionId: string, expectedRevision: number, runId?: string) {
    return this.serial(sessionId, async () => {
      const current = this.current(sessionId, expectedRevision)
      this.assertCompletable(current)
      await this.goals.update(sessionId, 'complete', runId)
      const now = Date.now()
      const workflow = workflowStateSchema.parse({
        ...current,
        revision: current.revision + 1,
        status: 'completed',
        activeItemId: null,
        explorationCount: 0,
        updatedAt: now,
      })
      return this.persistWorkflow(workflow, runId)
    })
  }

  async autoActivate(event: { sessionId: string; runId: string; run: Run }) {
    if (event.run.input.mode === 'plan' || event.run.input.source === 'goal') return
    const plan = this.plans.get(event.sessionId)
    const workflow = this.workflows.get(event.sessionId)
    if (!plan || plan.phase !== 'draft' || (workflow && workflow.status !== 'completed')) return
    await this.activate(event.sessionId, plan.revision, undefined, event.run)
  }

  decorate(request: ModelRequest): ModelRequest {
    const sessionId = request.context?.sessionId
    const workflow = sessionId ? this.workflows.get(sessionId) : undefined
    if (!workflow || workflow.status === 'completed') {
      const guidance = [
        '<workflow_guidance>',
        'For a multi-step task that needs repository changes, verification, or delegation, decide whether to call workflow_start.',
        'Keep simple questions and one-step reads lightweight.',
        '</workflow_guidance>',
      ].join('\n')
      return { ...request, system: `${request.system}\n\n${guidance}` }
    }
    const item = workflow.workItems.find((candidate) => candidate.id === workflow.activeItemId)
    const checks =
      item?.acceptanceChecks.filter((check) => check.required && !['passed', 'accepted'].includes(check.status)) ?? []
    const prompt = [
      '<focus_workflow>',
      `Status: ${workflow.status}`,
      `Revision: ${workflow.revision}`,
      `Current item: ${item ? escapeXml(item.title) : 'none'}`,
      `Exploration: ${workflow.explorationCount}/${this.config.maxExplorationCalls}`,
      `Allowed read paths: ${item?.scope.readPaths.map(escapeXml).join(', ') || 'none'}`,
      `Allowed write paths: ${item?.scope.writePaths.map(escapeXml).join(', ') || 'none'}`,
      `Allowed tools: ${item?.scope.tools.map(escapeXml).join(', ') || 'none'}`,
      `Pending required checks: ${checks.map((check) => escapeXml(check.description)).join('; ') || 'none'}`,
      'Stay on the current item. Expand scope explicitly with a reason before accessing anything outside it.',
      'Use the stable loop: orient, bounded exploration, act or delegate, verify, checkpoint.',
      '</focus_workflow>',
    ].join('\n')
    return { ...request, system: `${request.system}\n\n${prompt}` }
  }

  async beforeTool(name: string, args: Record<string, unknown>, context: ToolContext, tool: ToolDefinition) {
    if (CONTROL_TOOLS.has(name)) return
    const workflow = this.workflows.get(context.session.id)
    if (!workflow || workflow.status === 'completed') return
    if (workflow.status === 'blocked')
      throw new HbarError('WORKFLOW_CHECKPOINT_REQUIRED', 'Revise the blocked workflow item before using more tools')
    const item = workflow.workItems.find((candidate) => candidate.id === workflow.activeItemId)
    if (!item) throw new HbarError('WORKFLOW_CHECKPOINT_REQUIRED', 'Select an active workflow item before using tools')
    if (!item.scope.tools.includes(name))
      throw new HbarError('WORKFLOW_SCOPE_REQUIRED', `Tool ${name} is outside the current workflow scope`)
    const allowedPaths =
      tool.effect === 'read' ? [...item.scope.readPaths, ...item.scope.writePaths] : item.scope.writePaths
    const paths = argumentPaths(context.workspace.path, args)
    const rejected = paths.find((path) => !pathAllowed(path, allowedPaths))
    if (rejected)
      throw new HbarError('WORKFLOW_SCOPE_REQUIRED', `Path ${rejected} is outside the current workflow scope`)
    if (tool.effect !== 'read') return
    await this.serial(context.session.id, async () => {
      const current = this.workflows.get(context.session.id)
      if (!current || current.workflowId !== workflow.workflowId) return
      if (current.explorationCount >= this.config.maxExplorationCalls)
        throw new HbarError(
          'WORKFLOW_CHECKPOINT_REQUIRED',
          `Record a checkpoint after ${this.config.maxExplorationCalls} exploration calls`,
        )
      const next = workflowStateSchema.parse({
        ...current,
        revision: current.revision + 1,
        explorationCount: current.explorationCount + 1,
        updatedAt: Date.now(),
      })
      await this.persistWorkflow(next, context.run.id)
    })
  }

  async settleTool(
    name: string,
    args: Record<string, unknown>,
    result: ToolResult,
    context: ToolContext,
    tool: ToolDefinition,
  ) {
    await this.serial(context.session.id, async () => {
      const current = this.workflows.get(context.session.id)
      if (!current || current.status === 'completed' || !current.activeItemId) return
      const item = current.workItems.find((candidate) => candidate.id === current.activeItemId)
      if (!item) return
      const evaluations = item.acceptanceChecks.flatMap((check) => {
        if (check.verifier.kind === 'user') return []
        const outcome = evaluateToolCheck(check, name, args, result)
        return outcome ? [{ check, outcome }] : []
      })
      const marksVerification = tool.effect !== 'read' && !result.isError
      if (!evaluations.length && !marksVerification) return
      const now = Date.now()
      const argumentsHash = hashValue(args)
      const resultHash = hashValue({ text: result.text, isError: Boolean(result.isError), details: result.details })
      const evidence = evaluations.map(({ check, outcome }) => ({
        evidenceId: crypto.randomUUID(),
        itemId: item.id,
        checkId: check.id,
        planRevision: current.planRevision,
        workspaceRevision: null,
        createdAt: now,
        source: 'tool' as const,
        outcome,
        runId: context.run.id,
        callId: context.callId,
        toolName: name,
        argumentsHash,
        resultHash,
      }))
      const evidenceByCheck = new Map(evidence.map((entry) => [entry.checkId, entry]))
      const blocksItem = evidence.some((entry) => {
        if (entry.outcome !== 'failed') return false
        let streak = 1
        for (let index = current.evidence.length - 1; index >= 0; index--) {
          const prior = current.evidence[index]
          if (!prior || prior.checkId !== entry.checkId) continue
          if (prior.source !== 'tool' || prior.outcome !== 'failed' || prior.resultHash !== entry.resultHash) break
          streak++
        }
        return streak >= 3
      })
      const workItems = current.workItems.map((candidate) => {
        if (candidate.id !== item.id) return candidate
        return {
          ...candidate,
          status: blocksItem ? ('blocked' as const) : marksVerification ? ('verifying' as const) : candidate.status,
          acceptanceChecks: candidate.acceptanceChecks.map((check) => {
            const proof = evidenceByCheck.get(check.id)
            return proof ? { ...check, status: proof.outcome, evidenceId: proof.evidenceId, updatedAt: now } : check
          }),
        }
      })
      const workflow = workflowStateSchema.parse({
        ...current,
        revision: current.revision + 1,
        status: blocksItem ? 'blocked' : current.status,
        workItems,
        evidence: [...current.evidence, ...evidence].slice(-MAX_WORKFLOW_EVIDENCE),
        updatedAt: now,
      })
      await this.persistWorkflow(workflow, context.run.id, {
        verification: {
          name,
          callId: context.callId,
          checks: evaluations.map(({ check }) => check.id),
          blocked: blocksItem,
        },
      })
    })
  }
}

const startToolSchema = workflowStartInputSchema.omit({ sessionId: true })
const savePlanToolSchema = workflowPlanSaveInputSchema.omit({ sessionId: true })
const updateToolSchema = z.discriminatedUnion('action', [
  workflowExpandScopeInputSchema.omit({ sessionId: true }).extend({ action: z.literal('expand_scope') }),
  workflowCheckpointInputSchema.omit({ sessionId: true }).extend({ action: z.literal('checkpoint') }),
  z.strictObject({ action: z.literal('complete'), expectedRevision: z.number().int().positive() }),
])

function toolsFor(runtime: WorkflowRuntime): ToolDefinition[] {
  return [
    {
      name: 'get_workflow',
      description: 'Read the current focused workflow, TODO items, scope, evidence, and revision.',
      inputSchema: z.object({}),
      effect: 'read',
      execute: async (_args, context) => {
        const result = await runtime.get(context.session.id)
        return { text: JSON.stringify(result), details: result }
      },
    },
    {
      name: 'save_workflow_plan',
      description: 'Save a decision-complete workflow draft with TODO items, bounded scope, and acceptance checks.',
      inputSchema: savePlanToolSchema,
      effect: 'read',
      execute: async (args, context) => {
        const parsed = savePlanToolSchema.parse(args)
        const result = await runtime.savePlan(
          context.session.id,
          parsed.objective,
          parsed.items,
          parsed.expectedRevision,
        )
        return { text: JSON.stringify(result), details: result }
      },
    },
    {
      name: 'workflow_start',
      description:
        'Start a focused workflow when the task is multi-step and requires changes, verification, or delegation. Keep simple tasks lightweight.',
      inputSchema: startToolSchema,
      effect: 'read',
      execute: async (args, context) => {
        const parsed = startToolSchema.parse(args)
        const result = await runtime.start(
          context.session.id,
          parsed.objective,
          parsed.items,
          parsed.tokenBudget,
          context.run,
        )
        return { text: JSON.stringify(result), details: result }
      },
    },
    {
      name: 'workflow_update',
      description:
        'Expand the current focus scope, record a checkpoint, complete a verified work item, or complete the workflow.',
      inputSchema: updateToolSchema,
      effect: 'read',
      execute: async (args, context) => {
        const parsed = updateToolSchema.parse(args)
        const result =
          parsed.action === 'expand_scope'
            ? await runtime.expandScope(
                context.session.id,
                parsed.itemId,
                parsed.scope,
                parsed.reason,
                parsed.expectedRevision,
              )
            : parsed.action === 'checkpoint'
              ? await runtime.checkpoint(
                  context.session.id,
                  parsed.itemId,
                  parsed.outcome,
                  parsed.summary,
                  parsed.nextItemId,
                  parsed.expectedRevision,
                )
              : await runtime.complete(context.session.id, parsed.expectedRevision, context.run.id)
        return { text: JSON.stringify(result), details: result }
      },
    },
  ]
}

export const workflowPlugin = definePlugin({
  manifest: {
    id: 'workflow.focus',
    packageName: '@hbar/workflow',
    name: 'Focused workflows',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    description: 'Durable focus, bounded exploration, checkpoints, and evidence-gated completion',
    scope: 'host',
    required: true,
    provides: { workflow: '1.0.0' },
    requires: { goal: '^1.0.0', storage: '^1.0.0' },
    permissions: ['storage'],
  },
  configSchema: workflowConfigSchema,
  async apply(ctx, rawConfig) {
    const api = ctx.hbar.api
    const runtime = new WorkflowRuntime(api, api.service<GoalService>('goal'), workflowConfigSchema.parse(rawConfig))
    await runtime.restore()
    provide<WorkflowService>(ctx, 'workflow', runtime)
    api.hooks.on('run.start', (event) => runtime.autoActivate(event))
    api.hooks.on('context.build', (request) => runtime.decorate(request))
    api.hooks.on('tool.before', async (event) => {
      await runtime.beforeTool(event.name, event.args, event.context, event.tool)
      return event
    })
    api.hooks.on('tool.settled', (event) =>
      runtime.settleTool(event.name, event.args, event.result, event.context, event.tool),
    )
    api.hooks.on('goal.beforeComplete', (event) => runtime.guardCompletion(event.sessionId, event.goal.goalId))
    for (const tool of toolsFor(runtime)) api.tools.register(tool)
  },
})

export default workflowPlugin
