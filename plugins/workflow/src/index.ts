import type { WorkflowRecoveryLifecycle } from '@hbar/plugin-sdk/workflow-recovery'
import { createHash } from 'node:crypto'
import { isAbsolute, relative, resolve } from 'node:path'
import { z } from 'zod'
import {
  HbarError,
  contentBlockSchema,
  MAX_WORKFLOW_EVIDENCE,
  workflowFocusPlanItemSchema,
  MAX_WORKFLOW_TARGET_DISPATCHES,
  MAX_WORKFLOW_TARGET_SESSIONS,
  WORKFLOW_SCHEMA_VERSION,
  workflowPlanItemsSchema,
  workflowPlanSchema,
  workflowScopeSchema,
  workflowSnapshotSchema,
  workflowStateSchema,
  workflowTargetDispatchPublicSchema,
} from '@hbar/contracts'
import type {
  Run,
  PlanState,
  SessionEvent,
  WorkflowAcceptanceCheck,
  WorkflowCompletionPolicy,
  WorkflowPlan,
  WorkflowPlanItem,
  WorkflowPlanItemInput,
  WorkflowFocusPlanItemInput,
  WorkflowPublicState,
  WorkflowScope,
  WorkflowSnapshot,
  WorkflowStartCommand,
  WorkflowTargetDispatch,
  WorkflowState,
  WorkflowWorkItem,
} from '@hbar/contracts'
import type { PeerMessageReceipt } from '@hbar/contracts/commands/run'
import { workflowDelegateInputSchema, workflowFocusInputSchema } from '@hbar/contracts/commands/workflows'
import { appendModelContext, definePlugin, provide, readSessionEventPages, SKILL_TOOL_NAMES } from '@hbar/plugin-sdk'
import type {
  AgentService,
  HookEvents,
  GitService,
  GoalService,
  HbarAPI,
  ModelRequest,
  ToolContext,
  ToolDefinition,
  ToolResult,
  PlanService,
  WorkflowService,
} from '@hbar/plugin-sdk'
import {
  workflowUpdateActionSchema,
  workflowUpdateToolSchema,
  workflowCheckpointToolSchema,
  workflowExpandScopeToolSchema as legacyExpandScopeToolSchema,
} from './update-tool-schema'
import { workflowModelResult } from './model-view'

// Model tools expose one complete CAS identity. Keep numeric revision support
// on the public command and legacy workflow_update, never choose between both.
export const workflowExpandScopeToolSchema = z
  .strictObject({
    itemId: legacyExpandScopeToolSchema.shape.itemId,
    scope: legacyExpandScopeToolSchema.shape.scope,
    reason: legacyExpandScopeToolSchema.shape.reason,
    expectedFocusRevision: legacyExpandScopeToolSchema.shape.expectedFocusRevision.unwrap(),
    expectedPlanRevision: legacyExpandScopeToolSchema.shape.expectedPlanRevision.unwrap(),
  })
  .describe('Do not supply expectedRevision. Use current focus+plan revisions; refresh stale state.')

const MAX_RESTORE_EVENTS = 100_000
const RESTORE_CONCURRENCY = 8
type CheckpointRevision = Parameters<WorkflowService['checkpoint']>[5]
const FOCUS_TOOLS = new Set(['workflow_checkpoint', 'workflow_expand_scope'])
// Skill resources are bounded instruction reads. Their load grants no task-tool or path scope.
const CONTROL_TOOLS = new Set([
  ...SKILL_TOOL_NAMES,
  'workflow_execute',
  ...FOCUS_TOOLS,
  'apply_agent_patch',
  'delegate_work',
  'get_agent_result',
  'get_goal',
  'create_goal',
  'update_goal',
  'get_plan',
  'update_plan',
  'get_workflow',
  'workflow_focus',
  'workflow_review_submit',
  'workflow_start',
  'workflow_update',
  'save_workflow_plan',
  'request_user_input',
  'exit_plan_mode',
])
const REPAIR_TOOLS = new Set([
  ...FOCUS_TOOLS,
  'get_goal',
  'update_goal',
  'get_plan',
  'update_plan',
  'get_workflow',
  'workflow_focus',
  'workflow_update',
  'exit_plan_mode',
])

export const workflowConfigSchema = z.object({
  maxExplorationCalls: z.number().int().min(1).max(32).default(8),
  maxConcurrentAgents: z.number().int().min(1).max(8).default(3),
  reviewTokenBudget: z.number().int().min(1).max(1_000_000).default(16_000),
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

function publicWorkflowStatus(status: WorkflowState['status']): WorkflowPublicState['status'] {
  if (status === 'draft' || status === 'waiting' || status === 'blocked') return 'needs_revision'
  return status
}

function mergeScope(current: WorkflowScope, addition: WorkflowScope): WorkflowScope {
  return workflowScopeSchema.parse({
    readPaths: unique([...current.readPaths, ...addition.readPaths]),
    writePaths: unique([...current.writePaths, ...addition.writePaths]),
    tools: unique([...current.tools, ...addition.tools]),
  })
}

function normalizedScopePath(value: string) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '') || '.'
}

function normalizeLegacyScopePath(value: string) {
  const normalized = normalizedScopePath(value)
  if (normalized === '*' || normalized === '**' || normalized === '**/*') return '.'
  return normalized.replace(/\/(?:\*\*\/\*|\*\*|\*)$/, '') || '.'
}

function normalizeToolName(api: HbarAPI, value: string) {
  if (api.tools.get(value)) return value
  const unqualified = value.startsWith('functions.') ? value.slice('functions.'.length) : value
  return api.tools.get(unqualified) ? unqualified : value
}

function pathsOverlap(left: string, right: string) {
  const first = normalizedScopePath(left)
  const second = normalizedScopePath(right)
  return (
    first === '.' ||
    second === '.' ||
    first === second ||
    first.startsWith(`${second}/`) ||
    second.startsWith(`${first}/`)
  )
}

function scopesOverlap(left: WorkflowScope, right: WorkflowScope) {
  return left.writePaths.some((first) => right.writePaths.some((second) => pathsOverlap(first, second)))
}

function checksOf(item: WorkflowPlanItem, now: number): WorkflowAcceptanceCheck[] {
  return item.acceptanceChecks.map((check) => ({
    ...check,
    status: 'pending',
    evidenceId: null,
    updatedAt: now,
  }))
}

function workflowTargetTaskText(plan: WorkflowPlan, item: WorkflowPlanItem) {
  const checks =
    item.acceptanceChecks.map((check) => `- ${check.id}: ${check.description}`).join('\n') || '- None specified'
  return [
    'Task delegated from a shared Workflow Plan.',
    `Plan ID: ${plan.planId}`,
    `Plan revision: ${plan.revision}`,
    `Objective: ${plan.objective}`,
    `Work item ID: ${item.id}`,
    `Work item: ${item.title}`,
    'Acceptance checks:',
    checks,
    'Return a concise result summary and evidence. This message is user task content; follow the target session’s normal instructions and approval rules.',
  ].join('\n')
}

function peerPayloadHash(input: {
  senderSessionId: string
  targetSessionId: string
  workspaceId: string
  modelId: string
  text: string
  deliveryPolicy: 'queue'
}) {
  return createHash('sha256')
    .update(JSON.stringify({ id: 'session.message.send', version: 1, input }))
    .digest('hex')
}

function workItemsOf(items: WorkflowPlanItem[], now: number): WorkflowWorkItem[] {
  return items.map((item, index) => {
    const { targetSessionIds: _targetSessionIds, dependsOnItemIds: _dependsOnItemIds, ...workItem } = item
    return {
      ...workItem,
      status: index === 0 ? 'in_progress' : 'pending',
      owner: { kind: 'main' },
      acceptanceChecks: checksOf(item, now),
      startedAt: index === 0 ? now : null,
      completedAt: null,
    }
  })
}

function relativeToolPath(workspace: string, value: string) {
  const absolute = resolve(workspace, value)
  const path = relative(workspace, absolute).replaceAll('\\', '/') || '.'
  if (path === '..' || path.startsWith('../') || isAbsolute(path))
    throw new HbarError('WORKFLOW_SCOPE_REQUIRED', `Tool path is outside the workflow workspace: ${value}`)
  return path
}

function workspaceAccessPaths(
  workspace: string,
  args: Record<string, unknown>,
  tool: ToolDefinition,
): { path: string; access: 'read' | 'write' }[] {
  if (!tool.workspaceAccess || tool.workspaceAccess.kind === 'none') return []
  if (tool.workspaceAccess.kind === 'workspace')
    return [{ path: '.', access: tool.effect === 'read' ? 'read' : 'write' }]
  return tool.workspaceAccess.arguments.flatMap((argument) => {
    const value = args[argument.field]
    const values = value === undefined ? ['.'] : Array.isArray(value) ? value : [value]
    return values.flatMap((entry) =>
      typeof entry === 'string' ? [{ path: relativeToolPath(workspace, entry), access: argument.access }] : [],
    )
  })
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

function normalizeLegacyEventValue(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) {
    const entries = value as unknown[]
    if (key === 'readPaths' || key === 'writePaths')
      return entries.map((entry) => (typeof entry === 'string' ? normalizeLegacyScopePath(entry) : entry))
    if (key === 'tools')
      return entries.map((entry) =>
        typeof entry === 'string' && entry.startsWith('functions.') ? entry.slice('functions.'.length) : entry,
      )
    return entries.map((entry) => normalizeLegacyEventValue(entry))
  }
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([childKey, entry]) => [
      childKey,
      childKey === 'schemaVersion' && entry === 1
        ? WORKFLOW_SCHEMA_VERSION
        : childKey === 'toolName' && typeof entry === 'string' && entry.startsWith('functions.')
          ? entry.slice('functions.'.length)
          : normalizeLegacyEventValue(entry, childKey),
    ]),
  )
}

function expectedArgumentsMatch(expected: Record<string, unknown> | undefined, actual: Record<string, unknown>) {
  if (!expected) return true
  return Object.entries(expected).every(
    ([key, value]) =>
      Object.hasOwn(actual, key) && JSON.stringify(canonical(actual[key])) === JSON.stringify(canonical(value)),
  )
}

function valueAtPath(value: unknown, path: readonly (string | number)[]) {
  let current = value
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined
      current = current[segment]
      continue
    }
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, segment)) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

function evaluateToolCheck(
  check: WorkflowAcceptanceCheck,
  name: string,
  args: Record<string, unknown>,
  result: ToolResult,
  workspacePath?: string,
): 'passed' | 'failed' | null {
  if (check.verifier.kind === 'tool') {
    if (check.verifier.toolName !== name || !expectedArgumentsMatch(check.verifier.expectedArguments, args)) return null
    if (result.isError) return 'failed'
    const predicate = check.verifier.result
    if (predicate.kind === 'success') return 'passed'
    if (predicate.kind === 'textContains') return result.text.includes(predicate.value) ? 'passed' : 'failed'
    const actual = valueAtPath(result.details, predicate.path)
    if (predicate.kind === 'booleanTrue') return actual === true ? 'passed' : 'failed'
    return JSON.stringify(canonical(actual)) === JSON.stringify(canonical(predicate.value)) ? 'passed' : 'failed'
  }
  if (check.verifier.kind === 'workspace') {
    if (name !== 'read_file' || !workspacePath || typeof args.path !== 'string') return null
    // Workspace verifiers are defined in workspace-relative paths, while a
    // native read_file call may use either a relative or absolute path. Keep
    // the comparison inside the authorized workspace and canonicalize both
    // forms before matching. A ranged read cannot prove a whole-file check.
    const requested = resolve(workspacePath, args.path)
    const relativePath = relative(workspacePath, requested).replaceAll('\\', '/') || '.'
    if (
      relativePath === '..' ||
      relativePath.startsWith('../') ||
      isAbsolute(relativePath) ||
      normalizedScopePath(relativePath) !== normalizedScopePath(check.verifier.path) ||
      args.startLine !== undefined ||
      args.lineCount !== undefined
    )
      return null
    if (result.isError) return 'failed'
    if (check.verifier.expectation.kind === 'exists') return 'passed'
    if (
      (result.details &&
        typeof result.details === 'object' &&
        'truncated' in result.details &&
        result.details.truncated === true) ||
      result.content?.some((entry) => entry.type === 'image')
    )
      return null
    if (check.verifier.expectation.kind === 'textContains')
      return result.text.includes(check.verifier.expectation.value) ? 'passed' : 'failed'
    return createHash('sha256').update(result.text).digest('hex') === check.verifier.expectation.value
      ? 'passed'
      : 'failed'
  }
  // Browser string assertions are retained only for v1 replay. New focus
  // definitions must use structured tool results or agent/reviewer judgment.
  if (check.verifier.kind === 'browser') return null
  return null
}

export class WorkflowRuntime implements WorkflowService {
  // Hook RPCs deserialize a fresh ToolContext at every stage. Object identity is not authority.
  private readonly toolTargets = new Map<
    string,
    {
      workflowId: string
      focusRevision: number
      planRevision: number
      itemId: string | null
      sessionId: string
      runId: string
      workspaceId: string
      workspacePath: string
      name: string
      argsHash: string
      executing: boolean
    }
  >()
  private plans = new Map<string, WorkflowPlan>()
  private agentPlanSnapshots = new Map<string, PlanState>()
  private workflows = new Map<string, WorkflowState>()
  private locks = new Map<string, Promise<void>>()
  private targetRunBindings = new Map<string, { sourceSessionId: string; dispatchId: string }>()
  private targetDispatchIndex = new Map<string, { sourceSessionId: string; dispatchId: string }>()
  private hydrated = false
  private agentPlans: PlanService
  private git: GitService | null

  constructor(
    private api: HbarAPI,
    private goals: GoalService,
    private agents: AgentService,
    private config: WorkflowConfig,
    agentPlans?: PlanService,
    git?: GitService,
  ) {
    this.agentPlans = agentPlans ?? api.service<PlanService>('plan')
    this.git = git ?? null
  }

  async restore() {
    const sessions = await this.api.sessions.list()
    for (let offset = 0; offset < sessions.length; offset += RESTORE_CONCURRENCY)
      await Promise.all(
        sessions.slice(offset, offset + RESTORE_CONCURRENCY).map((session) => this.restoreSession(session.id)),
      )
    this.hydrated = true
  }

  private async restoreSession(sessionId: string) {
    for await (const page of readSessionEventPages(this.api.sessions, {
      sessionId,
      types: [
        'workflow.plan.saved',
        'workflow.started',
        'workflow.updated',
        'workflow.migrated.v2',
        'workflow.focus.set',
      ],
      limit: 500,
      maxReplyBytes: 1_048_576,
    })) {
      if (page.totalEventCount > this.config.maxRestoreEvents)
        throw new HbarError(
          'WORKFLOW_RESTORE_LIMIT',
          `Workflow replay for ${sessionId} exceeded ${this.config.maxRestoreEvents} events`,
        )
      for (const item of page.items) if (item.kind === 'event') this.applyEvent(sessionId, item.event)
    }
    if (this.api.restoreMode === 'projection') {
      const plan = await this.agentPlans.get(sessionId)
      if (plan) this.agentPlanSnapshots.set(sessionId, plan)
      return
    }
    const interrupted = this.workflows.get(sessionId)
    if (interrupted?.pendingMutations?.length) {
      await this.persistWorkflow(
        workflowStateSchema.parse({
          ...interrupted,
          revision: interrupted.revision + 1,
          status: ['completed', 'cancelled'].includes(interrupted.status) ? interrupted.status : 'needs_revision',
          pendingMutations: [],
          updatedAt: Date.now(),
        }),
        undefined,
        {
          diagnosis:
            'A workspace mutation did not settle before restart; inspect its outcome and reverify before completing. Do not replay it blindly.',
        },
      )
    }
    await this.migrateLegacySession(sessionId)
    await this.recoverTransition(sessionId)
    const plan = await this.agentPlans.get(sessionId)
    if (plan) this.agentPlanSnapshots.set(sessionId, plan)
  }

  private async migrateLegacySession(sessionId: string) {
    const workflow = this.workflows.get(sessionId)
    const legacyPlan = this.plans.get(sessionId)
    if (
      !workflow ||
      !legacyPlan ||
      workflow.activeStepIndex !== null ||
      workflow.executionModel === 'focus_v2' ||
      ['completed', 'cancelled'].includes(workflow.status)
    )
      return
    let agentPlan = await this.agentPlans.get(sessionId)
    if (!agentPlan) {
      const activeId = workflow.activeItemId
      let selected = false
      agentPlan = await this.agentPlans.update(
        sessionId,
        workflow.workItems.map((item) => {
          if (item.status === 'completed') return { step: item.title, status: 'completed' as const }
          if (!selected && (item.id === activeId || item.status === 'in_progress')) {
            selected = true
            return { step: item.title, status: 'in_progress' as const }
          }
          return { step: item.title, status: 'pending' as const }
        }),
        `Migrated legacy Workflow plan ${legacyPlan.planId}`,
        null,
        0,
      )
    }
    const active = workflow.workItems.find((item) => item.id === workflow.activeItemId)
    const stepIndex = active ? agentPlan.plan.findIndex((step) => step.step === active.title) : -1
    const compatible = stepIndex >= 0
    this.agentPlanSnapshots.set(sessionId, agentPlan)
    const migrated = workflowStateSchema.parse({
      ...workflow,
      executionModel: 'focus_v2',
      canonicalPlanRevision: this.plans.get(sessionId)?.revision,
      planRevision: agentPlan.revision,
      activeStepIndex: compatible ? stepIndex : null,
      activeStepTextHash: compatible ? hashValue(agentPlan.plan[stepIndex]!.step) : null,
      status: compatible ? workflow.status : 'needs_revision',
      updatedAt: Date.now(),
    })
    await this.api.sessions.append(sessionId, 'workflow.migrated.v2', { workflow: migrated })
    this.workflows.set(sessionId, migrated)
  }

  private async recoverTransition(sessionId: string) {
    const workflow = this.workflows.get(sessionId)
    const intent = workflow?.transitionIntent
    if (!workflow || !intent) return
    const canonicalPlan = this.plans.get(sessionId)
    const projectedCompleted = new Set(
      workflow.workItems.filter((item) => item.status === 'completed').map((item) => item.id),
    )
    projectedCompleted.add(intent.itemId)
    const projectedWorkItems = workflow.workItems.map((item) =>
      item.id === intent.itemId
        ? { ...item, status: 'completed' as const, completedAt: item.completedAt ?? Date.now() }
        : item,
    )
    const canonicalRevisionMatches =
      canonicalPlan?.revision === workflow.canonicalPlanRevision ||
      (workflow.canonicalPlanRevision === undefined &&
        canonicalPlan?.items.every((item) => !item.dependsOnItemIds?.length))
    const intentItem = canonicalPlan?.items.find((item) => item.id === intent.itemId)
    const canonicalIntentMatches =
      intentItem?.id === intent.itemId && hashValue(intentItem.title) === intent.stepTextHash
    const canonicalReadyForRecovery = Boolean(
      canonicalPlan &&
      canonicalPlan.phase === 'active' &&
      canonicalPlan.planId === workflow.planId &&
      canonicalRevisionMatches &&
      canonicalIntentMatches,
    )
    const followingItem =
      canonicalReadyForRecovery && canonicalPlan
        ? this.firstReadyPending(canonicalPlan, { ...workflow, workItems: projectedWorkItems }, projectedCompleted)
        : undefined
    let agentPlan = await this.agentPlans.get(sessionId)
    const legacyFollowingIndex =
      canonicalReadyForRecovery &&
      canonicalPlan?.items.length === 1 &&
      canonicalPlan.items[0]?.id === intent.itemId &&
      !canonicalPlan.items[0]?.dependsOnItemIds?.length &&
      agentPlan?.revision === intent.planRevision &&
      hashValue(agentPlan.plan[intent.stepIndex]?.step ?? '') === intent.stepTextHash
        ? agentPlan.plan.findIndex((step, index) => index > intent.stepIndex && step.status === 'pending')
        : -1
    const followingIndex =
      followingItem && canonicalPlan
        ? canonicalPlan.items.findIndex((item) => item.id === followingItem.id)
        : legacyFollowingIndex
    if (
      canonicalReadyForRecovery &&
      agentPlan?.revision === intent.planRevision &&
      hashValue(agentPlan.plan[intent.stepIndex]?.step ?? '') === intent.stepTextHash
    ) {
      agentPlan = await this.agentPlans.update(
        sessionId,
        agentPlan.plan.map((step, index) => ({
          ...step,
          status:
            index === intent.stepIndex
              ? ('completed' as const)
              : index === followingIndex
                ? ('in_progress' as const)
                : step.status,
        })),
        intent.summary,
        agentPlan.turnId,
        agentPlan.revision,
      )
    }
    const transitionApplied =
      canonicalReadyForRecovery &&
      agentPlan?.revision === intent.planRevision + 1 &&
      agentPlan.plan[intent.stepIndex]?.status === 'completed' &&
      hashValue(agentPlan.plan[intent.stepIndex]?.step ?? '') === intent.stepTextHash
    if (agentPlan) this.agentPlanSnapshots.set(sessionId, agentPlan)
    const now = Date.now()
    const projection = this.plans.get(sessionId)
    const nextCanonicalPlanRevision =
      transitionApplied && projection ? projection.revision + 1 : workflow.canonicalPlanRevision
    const recovered = workflowStateSchema.parse({
      ...workflow,
      revision: workflow.revision + 1,
      planRevision: transitionApplied ? agentPlan!.revision : workflow.planRevision,
      canonicalPlanRevision: nextCanonicalPlanRevision,
      status: transitionApplied
        ? agentPlan!.plan.every((step) => step.status === 'completed')
          ? 'completed'
          : 'active'
        : 'needs_revision',
      activeItemId: transitionApplied ? null : workflow.activeItemId,
      activeStepIndex: transitionApplied ? null : workflow.activeStepIndex,
      activeStepTextHash: transitionApplied ? null : workflow.activeStepTextHash,
      workItems: transitionApplied
        ? workflow.workItems.map((item) =>
            item.id === intent.itemId
              ? { ...item, status: 'completed' as const, completedAt: item.completedAt ?? now }
              : item,
          )
        : workflow.workItems,
      transitionIntent: null,
      updatedAt: now,
    })
    await this.api.sessions.append(sessionId, 'workflow.updated', {
      workflow: recovered,
      transition: { operationId: intent.operationId, status: transitionApplied ? 'recovered' : 'stale' },
    })
    this.workflows.set(sessionId, recovered)
    if (projection && transitionApplied)
      this.plans.set(
        sessionId,
        workflowPlanSchema.parse({
          ...projection,
          revision: nextCanonicalPlanRevision!,
          phase: recovered.status === 'completed' ? 'archived' : 'active',
          updatedAt: agentPlan!.updatedAt,
        }),
      )
  }

  private applyEvent(sessionId: string, event: SessionEvent) {
    if (event.type === 'workflow.plan.saved') {
      const parsed = planSavedEventSchema.safeParse(normalizeLegacyEventValue(event.data))
      if (!parsed.success || parsed.data.plan.sessionId !== sessionId)
        throw new HbarError('WORKFLOW_REPLAY', `Invalid workflow.plan.saved event in ${sessionId}`)
      this.plans.set(sessionId, parsed.data.plan)
      return
    }
    if (event.type === 'workflow.started') {
      const parsed = workflowStartedEventSchema.safeParse(normalizeLegacyEventValue(event.data))
      if (
        !parsed.success ||
        parsed.data.plan.sessionId !== sessionId ||
        parsed.data.workflow.sessionId !== sessionId ||
        parsed.data.workflow.planId !== parsed.data.plan.planId
      )
        throw new HbarError('WORKFLOW_REPLAY', `Invalid workflow.started event in ${sessionId}`)
      this.plans.set(sessionId, parsed.data.plan)
      this.workflows.set(sessionId, parsed.data.workflow)
      this.indexTargetDispatches(sessionId, parsed.data.workflow)
      return
    }
    if (event.type === 'workflow.updated' || event.type === 'workflow.migrated.v2') {
      const parsed = workflowUpdatedEventSchema.safeParse(normalizeLegacyEventValue(event.data))
      if (!parsed.success || parsed.data.workflow.sessionId !== sessionId)
        throw new HbarError('WORKFLOW_REPLAY', `Invalid workflow.updated event in ${sessionId}`)
      this.workflows.set(sessionId, parsed.data.workflow)
      this.indexTargetDispatches(sessionId, parsed.data.workflow)
      return
    }
    if (event.type === 'workflow.focus.set') {
      const parsed = workflowStartedEventSchema.safeParse(normalizeLegacyEventValue(event.data))
      if (!parsed.success || parsed.data.workflow.sessionId !== sessionId)
        throw new HbarError('WORKFLOW_REPLAY', `Invalid workflow.focus.set event in ${sessionId}`)
      this.plans.set(sessionId, parsed.data.plan)
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
    const internal = this.workflows.get(sessionId)
    let workflow: WorkflowSnapshot['workflow'] = null
    if (internal) {
      const {
        activeItemId,
        activeStepIndex,
        activeStepTextHash,
        workItems,
        targetDispatches: _targetDispatches,
        startCommand: _startCommand,
        planId: _planId,
        canonicalPlanRevision: _canonicalPlanRevision,
        completionPolicy: _completionPolicy,
        ...state
      } = internal
      const item = workItems.find((candidate) => candidate.id === activeItemId)
      workflow = {
        ...state,
        status: publicWorkflowStatus(internal.status),
        focus:
          item && activeStepIndex !== null && activeStepTextHash
            ? {
                focusId: item.id,
                planRevision: internal.planRevision,
                stepIndex: activeStepIndex,
                stepTextHash: activeStepTextHash,
                title: item.title,
                status: item.status,
                scope: item.scope,
                acceptanceChecks: item.acceptanceChecks,
                completionPolicy: internal.completionPolicy,
                startedAt: item.startedAt,
                completedAt: item.completedAt,
              }
            : null,
      }
      void _startCommand
      void _planId
      void _canonicalPlanRevision
      void _completionPolicy
      void _targetDispatches
    }
    return workflowSnapshotSchema.parse({
      workflowPlan: this.plans.get(sessionId) ?? null,
      plan: this.agentPlanSnapshots.get(sessionId) ?? null,
      workflow,
      targetDispatches: (internal?.targetDispatches ?? []).map((dispatch) => {
        const {
          actorId: _actorId,
          messageText: _messageText,
          idempotencyKey: _idempotencyKey,
          peerIdempotencyKey: _peerIdempotencyKey,
          commandHash: _commandHash,
          requestHash: _requestHash,
          modelId: _modelId,
          targetRunStartSeq: _targetRunStartSeq,
          ...publicDispatch
        } = dispatch
        return workflowTargetDispatchPublicSchema.parse(publicDispatch)
      }),
    })
  }

  async get(sessionId: string) {
    await this.ready()
    await this.api.sessions.get(sessionId)
    const plan = await this.agentPlans.get(sessionId)
    if (plan) this.agentPlanSnapshots.set(sessionId, plan)
    else this.agentPlanSnapshots.delete(sessionId)
    const workflow = this.workflows.get(sessionId)
    if (
      plan &&
      workflow &&
      !['completed', 'cancelled', 'needs_revision'].includes(workflow.status) &&
      workflow.planRevision !== plan.revision
    )
      await this.markNeedsRevision(sessionId, workflow, 'The authoritative Agent Plan changed; replace the focus.')
    return this.snapshot(sessionId)
  }

  private normalizeFocusItem(value: WorkflowFocusPlanItemInput) {
    const normalized = workflowFocusPlanItemSchema.parse({
      ...value,
      scope: {
        readPaths: unique((value.scope.readPaths ?? []).map(normalizedScopePath)),
        writePaths: unique((value.scope.writePaths ?? []).map(normalizedScopePath)),
        tools: unique((value.scope.tools ?? []).map((name) => normalizeToolName(this.api, name))),
      },
      acceptanceChecks: value.acceptanceChecks.map((check) => ({
        ...check,
        verifier:
          check.verifier.kind === 'tool'
            ? { ...check.verifier, toolName: normalizeToolName(this.api, check.verifier.toolName) }
            : check.verifier.kind === 'workspace'
              ? { ...check.verifier, path: normalizedScopePath(check.verifier.path) }
              : check.verifier,
      })),
    })
    for (const name of normalized.scope.tools) {
      const tool = this.api.tools.get(name)
      if (!tool) throw new HbarError('WORKFLOW_TOOL_UNKNOWN', `Tool ${name} is not registered`)
      if (
        tool.workspaceAccess?.kind === 'workspace' &&
        tool.effect !== 'read' &&
        !normalized.scope.writePaths.includes('.')
      )
        throw new HbarError(
          'WORKFLOW_SCOPE_REQUIRED',
          `Workspace-wide tool ${name} requires an explicit write prefix of .`,
        )
    }
    for (const check of normalized.acceptanceChecks)
      if (check.verifier.kind === 'browser')
        throw new HbarError(
          'WORKFLOW_CHECK_INVALID',
          'Browser string assertions are legacy history; use a structured tool predicate or agent review',
        )
      else if (check.verifier.kind === 'tool' && !this.api.tools.get(check.verifier.toolName))
        throw new HbarError('WORKFLOW_TOOL_UNKNOWN', `Verifier tool ${check.verifier.toolName} is not registered`)
    return normalized
  }

  private itemReady(
    plan: WorkflowPlan,
    workflow: WorkflowState,
    itemId: string,
    additionallyCompleted: ReadonlySet<string> = new Set(),
  ) {
    if (plan.phase !== 'active' || workflow.planId !== plan.planId)
      throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'Readiness belongs to a stale Workflow Plan revision')
    const planItem = plan.items.find((item) => item.id === itemId)
    if (!planItem) throw new HbarError('WORKFLOW_ITEM_NOT_FOUND', `Workflow item ${itemId} does not exist`)
    if (
      workflow.canonicalPlanRevision !== plan.revision &&
      (workflow.canonicalPlanRevision !== undefined || (planItem.dependsOnItemIds?.length ?? 0) > 0)
    )
      throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'Readiness belongs to a stale canonical Plan revision')
    return (planItem.dependsOnItemIds ?? []).every((dependencyId) => {
      if (additionallyCompleted.has(dependencyId)) return true
      const dependency = workflow.workItems.find((item) => item.id === dependencyId)
      return dependency?.status === 'completed' && dependency.completedAt !== null
    })
  }

  private firstReadyPending(plan: WorkflowPlan, workflow: WorkflowState, completed = new Set<string>()) {
    return workflow.workItems.find(
      (item) => item.status === 'pending' && this.itemReady(plan, workflow, item.id, completed),
    )
  }

  private async validateTargetSessions(sessionId: string, items: readonly WorkflowPlanItemInput[]) {
    const targetSessionIds = unique(items.flatMap((item) => item.targetSessionIds ?? []))
    if (!targetSessionIds.length) return
    if (targetSessionIds.length > MAX_WORKFLOW_TARGET_SESSIONS)
      throw new HbarError('WORKFLOW_TARGET_LIMIT', 'A workflow plan may bind at most 16 target sessions')
    const source = await this.api.sessions.get(sessionId)
    const targets = await Promise.all(targetSessionIds.map((targetSessionId) => this.api.sessions.get(targetSessionId)))
    for (const target of targets) {
      if (target.id === source.id)
        throw new HbarError('WORKFLOW_TARGET_SELF', 'A workflow target must be a different session')
      if (target.archived) throw new HbarError('ARCHIVED', `Workflow target session ${target.id} is archived`)
      if (target.workspaceId !== source.workspaceId)
        throw new HbarError('WORKFLOW_TARGET_WORKSPACE', 'Workflow targets must belong to the same workspace')
    }
  }

  private async markNeedsRevision(sessionId: string, current: WorkflowState, reason: string) {
    let reviewerAgentId: string | null = null
    const result = await this.serial(sessionId, async () => {
      const latest = this.workflows.get(sessionId)
      if (!latest || latest.workflowId !== current.workflowId || latest.status === 'needs_revision')
        return this.snapshot(sessionId)
      if (latest.review?.reviewerAgentId && ['queued', 'running'].includes(latest.review.status))
        reviewerAgentId = latest.review.reviewerAgentId
      const next = workflowStateSchema.parse({
        ...latest,
        revision: latest.revision + 1,
        status: 'needs_revision',
        review: latest.review
          ? { ...latest.review, status: 'stale' as const, summary: reason, updatedAt: Date.now() }
          : null,
        updatedAt: Date.now(),
      })
      return this.persistWorkflow(next, undefined, { diagnosis: reason })
    })
    if (reviewerAgentId) await this.agents.cancel(sessionId, reviewerAgentId).catch(() => {})
    return result
  }

  async focus(
    sessionId: string,
    stepIndex: number,
    itemValue: WorkflowFocusPlanItemInput,
    completionPolicy: WorkflowCompletionPolicy,
    expectedPlanRevision: number,
  ) {
    return this.serial(sessionId, async () => {
      const agentPlan = await this.agentPlans.get(sessionId)
      if (!agentPlan)
        throw new HbarError('WORKFLOW_PLAN_REQUIRED', 'Publish an Agent Plan before setting workflow focus')
      if (agentPlan.revision !== expectedPlanRevision)
        throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'The Agent Plan changed before focus was applied')
      const step = agentPlan.plan[stepIndex]
      this.agentPlanSnapshots.set(sessionId, agentPlan)
      if (!step) throw new HbarError('WORKFLOW_ITEM_NOT_FOUND', 'The Agent Plan step does not exist')
      if (step.status === 'completed')
        throw new HbarError('WORKFLOW_ITEM_COMPLETE', 'A completed Agent Plan step cannot become the active focus')
      const current = this.workflows.get(sessionId)
      if (current) this.assertNoMutations(current)
      const canonicalPlan = this.plans.get(sessionId)
      const goal = await this.goals.get(sessionId)
      const continuingCanonicalPlan = Boolean(
        current &&
        canonicalPlan &&
        canonicalPlan.phase === 'active' &&
        current.planId === canonicalPlan.planId &&
        current.canonicalPlanRevision === canonicalPlan.revision &&
        current.planRevision === agentPlan.revision &&
        current.status === 'active' &&
        (current.activeItemId === null
          ? current.activeStepIndex === null &&
            current.activeStepTextHash === null &&
            canonicalPlan.items[stepIndex]?.id === itemValue.id
          : current.activeItemId === canonicalPlan.items[stepIndex]?.id &&
            current.activeStepIndex === stepIndex &&
            current.activeStepTextHash === hashValue(step.step)),
      )
      let item = this.normalizeFocusItem({ ...itemValue, title: step.step })
      let plan: WorkflowPlan
      if (continuingCanonicalPlan && current && canonicalPlan) {
        const nextIndex = agentPlan.plan.findIndex((candidate) => candidate.status === 'in_progress')
        if (stepIndex !== nextIndex)
          throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'Focus must select the current Agent Plan successor')
        const canonicalItem = canonicalPlan.items[stepIndex]
        if (
          !canonicalItem ||
          canonicalItem.id !== item.id ||
          canonicalItem.title !== step.step ||
          !this.itemReady(canonicalPlan, current, canonicalItem.id)
        )
          throw new HbarError('WORKFLOW_DEPENDENCY_PENDING', 'The selected canonical Plan item is not ready to focus')
        const { dependsOnItemIds: _dependsOnItemIds, ...canonicalFocusDefinition } = canonicalItem
        const canonicalFocusItem = this.normalizeFocusItem({ ...canonicalFocusDefinition, title: step.step })
        if (
          hashValue({ scope: canonicalFocusItem.scope, acceptanceChecks: canonicalFocusItem.acceptanceChecks }) !==
            hashValue({ scope: item.scope, acceptanceChecks: item.acceptanceChecks }) ||
          hashValue(canonicalFocusItem.targetSessionIds ?? []) !== hashValue(item.targetSessionIds ?? [])
        )
          throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'Focus scope and checks must match the canonical Plan item')
        item = workflowFocusPlanItemSchema.parse({ ...canonicalFocusDefinition, title: step.step })
        plan = canonicalPlan
      } else {
        if (
          canonicalPlan?.phase === 'active' &&
          current?.planId === canonicalPlan.planId &&
          (canonicalPlan.items.length > 1 ||
            canonicalPlan.items.some((candidate) => (candidate.dependsOnItemIds?.length ?? 0) > 0))
        )
          throw new HbarError(
            'WORKFLOW_REVISION_CONFLICT',
            'A dependency Plan can only focus its current ready successor without replacing the canonical Plan',
          )
        plan = workflowPlanSchema.parse({
          schemaVersion: WORKFLOW_SCHEMA_VERSION,
          planId: `agent-plan-${sessionId}`,
          sessionId,
          revision: agentPlan.revision,
          phase: 'active',
          objective: goal.goal?.objective ?? agentPlan.explanation ?? step.step,
          items: [item],
          createdAt: current?.createdAt ?? Date.now(),
          updatedAt: agentPlan.updatedAt,
        })
      }
      await this.validateTargetSessions(sessionId, [item])
      if (
        !continuingCanonicalPlan &&
        completionPolicy !== 'user' &&
        item.acceptanceChecks.some((check) => check.verifier.kind === 'user')
      )
        throw new HbarError(
          'WORKFLOW_CHECK_INVALID',
          'User acceptance checks require the explicitly selected user completion policy',
        )
      const now = Date.now()
      const workflow =
        continuingCanonicalPlan && current
          ? workflowStateSchema.parse({
              ...current,
              executionModel: 'focus_v2',
              focusRevision: current.revision + 1,
              canonicalPlanRevision: plan.revision,
              planRevision: agentPlan.revision,
              activeStepIndex: stepIndex,
              activeStepTextHash: hashValue(step.step),
              revision: current.revision + 1,
              status: 'active',
              activeItemId: item.id,
              workItems: current.workItems.map((candidate) =>
                candidate.id === item.id
                  ? { ...candidate, status: 'in_progress' as const, startedAt: candidate.startedAt ?? now }
                  : candidate,
              ),
              review: null,
              rejection: null,
              transitionIntent: null,
              updatedAt: now,
            })
          : workflowStateSchema.parse({
              schemaVersion: WORKFLOW_SCHEMA_VERSION,
              executionModel: 'focus_v2',
              workflowId: current?.workflowId ?? crypto.randomUUID(),
              focusRevision: (current?.revision ?? 0) + 1,
              sessionId,
              goalId: goal.goal ? (goal.goal.goalId ?? goal.goal.threadId) : null,
              planId: plan.planId,
              canonicalPlanRevision: plan.revision,
              planRevision: agentPlan.revision,
              activeStepIndex: stepIndex,
              activeStepTextHash: hashValue(step.step),
              revision: (current?.revision ?? 0) + 1,
              status: 'active',
              activeItemId: item.id,
              explorationCount: 0,
              workItems: workItemsOf([item], now),
              scopeExpansions: current?.scopeExpansions ?? [],
              delegations: current?.delegations ?? [],
              evidence: [],
              completionPolicy,
              rejection: null,
              startCommand: null,
              createdAt: current?.createdAt ?? now,
              updatedAt: now,
            })
      await this.api.sessions.append(sessionId, 'workflow.focus.set', { plan, workflow })
      this.plans.set(sessionId, plan)
      this.workflows.set(sessionId, workflow)
      return this.publish(sessionId)
    })
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

  async pendingRecoverySessions(after: string) {
    const ids = [...this.workflows.entries()]
      .filter(([id, workflow]) => id > after && Boolean(workflow.pendingMutations?.length))
      .map(([id]) => id)
      .sort()
      .slice(0, 101)
    return { sessionIds: ids.slice(0, 100), nextAfter: ids.length > 100 ? (ids[99] ?? null) : null }
  }

  async recoverPendingMutations(
    sessionId: string,
    commit: Parameters<WorkflowRecoveryLifecycle['recoverPendingMutations']>[1],
  ): Promise<void> {
    await this.serial(sessionId, async () => {
      const current = this.workflows.get(sessionId)
      if (!current?.pendingMutations?.length) return
      if (['completed', 'cancelled'].includes(current.status))
        throw new HbarError(
          'WORKFLOW_RECOVERY_CONFLICT',
          'Terminal Workflow cannot recover pending mutation implicitly',
        )
      const next = workflowStateSchema.parse({
        ...current,
        status: 'needs_revision',
        pendingMutations: [],
        revision: current.revision + 1,
        updatedAt: Date.now(),
      })
      // Only the parent lifecycle port supplies this commit. Ordinary capability callers never receive it.
      await commit({ current: structuredClone(current), next: structuredClone(next) })
      this.workflows.set(sessionId, next)
      this.indexTargetDispatches(sessionId, next)
    })
  }
  private async persistWorkflow(workflow: WorkflowState, runId?: string, data: Record<string, unknown> = {}) {
    await this.api.sessions.append(workflow.sessionId, 'workflow.updated', { workflow, ...data }, runId)
    this.workflows.set(workflow.sessionId, workflow)
    this.indexTargetDispatches(workflow.sessionId, workflow)
    this.api.sessions.wake(workflow.sessionId)
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
      const activeWorkflow = this.workflows.get(sessionId)
      if (activeWorkflow) this.assertNoMutations(activeWorkflow)
      if ((expectedRevision ?? null) !== (current?.revision ?? null))
        throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'The workflow plan changed before this update was applied')
      const now = Date.now()
      const parsedItems = workflowPlanItemsSchema.parse(items)
      await this.validateTargetSessions(sessionId, parsedItems)
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

  private async publishLegacyAgentPlan(sessionId: string, plan: WorkflowPlan) {
    const current = await this.agentPlans.get(sessionId)
    const updated = await this.agentPlans.update(
      sessionId,
      plan.items.map((item, index) => ({ step: item.title, status: index === 0 ? 'in_progress' : 'pending' })),
      `Migrated legacy Workflow plan ${plan.planId}`,
      null,
      current?.revision ?? 0,
    )
    this.agentPlanSnapshots.set(sessionId, updated)
    return updated
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
      canonicalPlanRevision: plan.revision,
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
      const parsedItems = workflowPlanItemsSchema.parse(items)
      await this.validateTargetSessions(sessionId, parsedItems)
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
      const agentPlan = await this.publishLegacyAgentPlan(sessionId, plan)
      const workflow = workflowStateSchema.parse({
        ...this.stateFor(sessionId, plan, goal.goalId ?? goal.threadId, now, command ?? null),
        executionModel: 'focus_v2',
        planRevision: agentPlan.revision,
        activeStepIndex: 0,
        activeStepTextHash: hashValue(agentPlan.plan[0]?.step ?? ''),
        completionPolicy: plan.items.some((item) =>
          item.acceptanceChecks.some((check) => check.verifier.kind === 'user'),
        )
          ? 'user'
          : 'agent',
      })
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
      const agentPlan = await this.publishLegacyAgentPlan(sessionId, plan)
      const workflow = workflowStateSchema.parse({
        ...this.stateFor(sessionId, plan, goal.goalId ?? goal.threadId, now, null),
        executionModel: 'focus_v2',
        planRevision: agentPlan.revision,
        activeStepIndex: 0,
        activeStepTextHash: hashValue(agentPlan.plan[0]?.step ?? ''),
        completionPolicy: plan.items.some((item) =>
          item.acceptanceChecks.some((check) => check.verifier.kind === 'user'),
        )
          ? 'user'
          : 'agent',
      })
      return this.persistStarted(plan, workflow, run?.id)
    })
  }

  private current(sessionId: string, expectedRevision: CheckpointRevision) {
    const workflow = this.workflows.get(sessionId)
    if (!workflow) throw new HbarError('WORKFLOW_NOT_FOUND', 'No workflow exists for this session')
    this.assertNoMutations(workflow)
    const matches =
      typeof expectedRevision === 'number'
        ? workflow.revision === expectedRevision
        : workflow.executionModel === 'focus_v2' &&
          workflow.focusRevision === expectedRevision.focusRevision &&
          workflow.planRevision === expectedRevision.planRevision
    if (!matches)
      throw new HbarError(
        'WORKFLOW_REVISION_CONFLICT',
        `The workflow changed before this update was applied. Current expectedRevision=${workflow.revision}, expectedFocusRevision=${workflow.focusRevision ?? 'unavailable'}, itemId=${JSON.stringify(workflow.activeItemId)}, planRevision=${workflow.planRevision}, status=${workflow.status}. Tool settlement can advance revision but not focusRevision. Revalidate the current focus and checks before retrying; do not replay completed side effects.`,
      )
    if (['completed', 'cancelled'].includes(workflow.status))
      throw new HbarError('WORKFLOW_COMPLETE', 'The workflow is already settled')
    return workflow
  }

  async expandScope(
    sessionId: string,
    itemId: string,
    scopeValue: WorkflowScope,
    reason: string,
    expectedRevision: CheckpointRevision,
  ) {
    return this.serial(sessionId, async () => {
      const current = this.current(sessionId, expectedRevision)
      if (typeof expectedRevision !== 'number') {
        const plan = await this.agentPlans.get(sessionId)
        if (current.activeItemId !== itemId || plan?.revision !== expectedRevision.planRevision)
          throw new HbarError(
            'WORKFLOW_REVISION_CONFLICT',
            'Scope expansion does not target the current Agent Plan focus',
          )
      }
      const scope = workflowScopeSchema.parse({
        readPaths: unique(scopeValue.readPaths.map(normalizedScopePath)),
        writePaths: unique(scopeValue.writePaths.map(normalizedScopePath)),
        tools: unique(scopeValue.tools.map((name) => normalizeToolName(this.api, name))),
      })
      const item = current.workItems.find((candidate) => candidate.id === itemId)
      if (!item) throw new HbarError('WORKFLOW_ITEM_NOT_FOUND', 'The workflow item does not exist')
      const mergedScope = mergeScope(item.scope, scope)
      this.normalizeFocusItem({
        id: item.id,
        title: item.title,
        scope: mergedScope,
        acceptanceChecks: item.acceptanceChecks.map(({ id, description, required, verifier }) => ({
          id,
          description,
          required,
          verifier,
        })),
      })
      if (JSON.stringify(canonical(mergedScope)) === JSON.stringify(canonical(item.scope)))
        throw new HbarError('WORKFLOW_SCOPE_NOOP', 'The requested scope expansion adds no capability')
      const now = Date.now()
      const workflow = workflowStateSchema.parse({
        ...current,
        revision: current.revision + 1,
        status: ['blocked', 'needs_revision'].includes(current.status) ? 'active' : current.status,
        // Union-only scope growth keeps the same Plan step and acceptance
        // definition. Replacement, not bookkeeping or expansion, changes ownership.
        activeItemId: itemId,
        explorationCount: 0,
        workItems: current.workItems.map((candidate) =>
          candidate.id === itemId
            ? {
                ...candidate,
                scope: mergedScope,
                status: 'in_progress',
                startedAt: candidate.startedAt ?? now,
              }
            : candidate,
        ),
        scopeExpansions: [
          ...current.scopeExpansions,
          { expansionId: crypto.randomUUID(), itemId, scope, reason, createdAt: now },
        ],
        rejection: null,
        updatedAt: now,
      })
      return this.persistWorkflow(workflow, undefined, { checkpoint: { kind: 'scope', itemId, reason } })
    })
  }

  private async workspaceFingerprint(sessionId: string) {
    if (!this.git) throw new HbarError('WORKFLOW_REVIEW_UNAVAILABLE', 'Git service is required for review agents')
    const session = await this.api.sessions.get(sessionId)
    const workspace = await this.api.sessions.workspace(session.workspaceId)
    const [status, diff] = await Promise.all([this.git.status(workspace.path), this.git.diff(workspace.path)])
    return hashValue({ head: status.head, entries: status.entries, diff: diff.diff, truncated: diff.truncated })
  }

  private async startReviewLocked(
    current: WorkflowState,
    item: WorkflowWorkItem,
    summary: string,
    evidenceIds: string[],
    modelId: string,
  ) {
    const fingerprint = await this.workspaceFingerprint(current.sessionId)
    const reviewId = crypto.randomUUID()
    const now = Date.now()
    const evidenceId = crypto.randomUUID()
    const waiting = workflowStateSchema.parse({
      ...current,
      revision: current.revision + 1,
      status: 'waiting_review',
      evidence: [
        ...current.evidence,
        {
          evidenceId,
          itemId: item.id,
          checkId: 'agent-conclusion',
          planRevision: current.planRevision,
          workspaceRevision: fingerprint,
          createdAt: now,
          source: 'agent',
          outcome: 'passed',
          agentId: 'main',
          resultHash: hashValue({ summary, evidenceIds }),
        },
      ].slice(-MAX_WORKFLOW_EVIDENCE),
      review: {
        reviewId,
        planRevision: current.planRevision,
        stepTextHash: current.activeStepTextHash!,
        workspaceFingerprint: fingerprint,
        resumeModelId: modelId,
        reviewerAgentId: null,
        status: 'queued',
        summary: null,
        createdAt: now,
        updatedAt: now,
      },
      updatedAt: now,
    })
    await this.persistWorkflow(waiting, undefined, { review: { reviewId, status: 'queued' } })
    const readTools = item.scope.tools.filter((name) => this.api.tools.get(name)?.effect === 'read')
    const goal = await this.goals.get(current.sessionId)
    const reviewBudget =
      goal.remainingTokens === null
        ? this.config.reviewTokenBudget
        : Math.min(this.config.reviewTokenBudget, goal.remainingTokens)
    if (reviewBudget < 1)
      throw new HbarError('WORKFLOW_REVIEW_BUDGET', 'No Goal budget remains for reviewer verification')
    const reviewer = await this.agents.create(
      {
        parentSessionId: current.sessionId,
        objective: [
          `Review the completed Agent Plan step: ${item.title}`,
          `Review id: ${reviewId}`,
          `Plan revision: ${current.planRevision}`,
          `Agent conclusion: ${summary}`,
          `Evidence ids: ${evidenceIds.join(', ') || 'none'}`,
          'Inspect only the provided read scope. Do not modify files or run processes.',
          'Finish by calling workflow_review_submit with this review id, an approved or rejected verdict, and a concise summary.',
        ].join('\n'),
        title: `Review: ${item.title}`.slice(0, 160),
        modelId,
        tokenBudget: reviewBudget,
        approval: 'deny',
        reviewTask: {
          reviewId,
          planRevision: current.planRevision,
          stepTextHash: current.activeStepTextHash!,
          workspaceFingerprint: fingerprint,
          scope: {
            readPaths: unique([...item.scope.readPaths, ...item.scope.writePaths]),
            writePaths: [],
            tools: unique([...readTools, 'workflow_review_submit']),
          },
        },
      },
      {
        actorId: `workflow:${current.workflowId}`,
        idempotencyKey: reviewId,
        requestId: `review-${reviewId}`,
      },
    )
    const latest = this.workflows.get(current.sessionId)
    if (!latest?.review || latest.review.reviewId !== reviewId) return this.snapshot(current.sessionId)
    const failed = reviewer.status === 'failed'
    const updated = workflowStateSchema.parse({
      ...latest,
      revision: latest.revision + 1,
      status: failed ? 'active' : 'waiting_review',
      review: {
        ...latest.review,
        reviewerAgentId: reviewer.agentId,
        status: failed ? 'rejected' : 'running',
        summary: failed ? (reviewer.error ?? 'Reviewer failed to start') : null,
        updatedAt: Date.now(),
      },
      updatedAt: Date.now(),
    })
    return this.persistWorkflow(updated, undefined, {
      review: { reviewId, reviewerAgentId: reviewer.agentId, status: updated.review!.status },
    })
  }

  async checkpoint(
    sessionId: string,
    itemId: string,
    outcome: 'progress' | 'revise' | 'complete' | 'blocked',
    summary: string,
    nextItemId: string | null | undefined,
    expectedRevision: CheckpointRevision,
    evidenceIds: string[] = [],
    reviewModelId?: string,
    callerRunId?: string,
  ) {
    const cancelAgentIds: string[] = []
    await this.serial(sessionId, async () => {
      const current = this.current(sessionId, expectedRevision)
      if (outcome === 'complete') this.assertNoMutations(current)
      if (typeof expectedRevision !== 'number' && current.activeItemId !== itemId)
        throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'The checkpoint does not target the current focus')
      const item = current.workItems.find((candidate) => candidate.id === itemId)
      if (!item) throw new HbarError('WORKFLOW_ITEM_NOT_FOUND', 'The workflow item does not exist')
      const plan = this.plans.get(sessionId)
      if (
        !plan ||
        plan.planId !== current.planId ||
        (current.canonicalPlanRevision !== undefined && plan.revision !== current.canonicalPlanRevision)
      )
        throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'The checkpoint belongs to a stale Workflow Plan revision')
      if (outcome === 'complete' && !this.itemReady(plan, current, itemId))
        throw new HbarError('WORKFLOW_DEPENDENCY_PENDING', `Workflow item ${itemId} has unfinished dependencies`)
      if (outcome === 'complete') this.assertTargetItemsSucceeded(sessionId, current, itemId)
      const pendingRequired = item.acceptanceChecks.filter(
        (check) => check.required && !['passed', 'accepted'].includes(check.status),
      )
      if (outcome === 'complete' && pendingRequired.some((check) => check.verifier.kind !== 'user')) {
        const automated = pendingRequired.filter((check) => check.verifier.kind !== 'user')
        const missing = automated.slice(0, 5).map((check) => ({
          checkId: check.id.slice(0, 64),
          verifier: check.verifier.kind,
          ...(check.verifier.kind === 'tool' ? { toolName: check.verifier.toolName.slice(0, 64) } : {}),
        }))
        throw new HbarError(
          'WORKFLOW_ACCEPTANCE_PENDING',
          `Required automated checks are not satisfied. Missing: ${JSON.stringify(missing)}${automated.length > 5 ? `; ${automated.length - 5} more` : ''}. Evidence comes from actual matching registered tool settlement; there is no workflow_verify tool. Obey execution restrictions: leave unrun checks pending and use checkpoint outcome="progress" to record delivered work and untested facts. Do not run forbidden checks or expand scope to bypass restrictions.`,
        )
      }
      if (outcome === 'complete') {
        const validEvidence = new Set(
          current.evidence
            .filter((entry) => entry.itemId === itemId && entry.planRevision === current.planRevision)
            .map((entry) => entry.evidenceId),
        )
        const invalidEvidence = evidenceIds.find((evidenceId) => !validEvidence.has(evidenceId))
        if (invalidEvidence)
          throw new HbarError(
            'WORKFLOW_EVIDENCE_STALE',
            `Evidence ${invalidEvidence} does not belong to the current Plan focus. Use Host-issued evidence IDs, not acceptance-check IDs; omit evidenceIds to select the current focus's verified evidence. Do not replay already successful writes.`,
          )
      }
      if (
        outcome === 'complete' &&
        current.completionPolicy === 'user' &&
        pendingRequired.some((check) => check.verifier.kind === 'user')
      ) {
        const now = Date.now()
        await this.persistWorkflow(
          workflowStateSchema.parse({
            ...current,
            revision: current.revision + 1,
            status: 'waiting_user',
            workItems: current.workItems.map((candidate) =>
              candidate.id === itemId ? { ...candidate, status: 'verifying' as const } : candidate,
            ),
            updatedAt: now,
          }),
          undefined,
          { checkpoint: { kind: 'waiting_user', itemId, summary } },
        )
        return
      }
      if (outcome === 'complete' && current.completionPolicy === 'review_agent') {
        if (!reviewModelId)
          throw new HbarError(
            'WORKFLOW_REVIEW_UNAVAILABLE',
            'A review model is required to start reviewer verification',
          )
        await this.startReviewLocked(current, item, summary, evidenceIds, reviewModelId)
        return
      }
      const agentPlan = await this.agentPlans.get(sessionId)
      if (
        !agentPlan ||
        agentPlan.revision !== current.planRevision ||
        current.activeStepIndex === null ||
        hashValue(agentPlan.plan[current.activeStepIndex]?.step ?? '') !== current.activeStepTextHash
      )
        throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'The workflow focus belongs to a stale Agent Plan')
      const now = Date.now()
      const remaining = current.workItems.filter(
        (candidate) => candidate.id !== itemId && candidate.status !== 'completed',
      )
      const completedAfterCheckpoint = new Set(
        current.workItems.filter((candidate) => candidate.status === 'completed').map((candidate) => candidate.id),
      )
      if (outcome === 'complete') completedAfterCheckpoint.add(itemId)
      const requestedNext = nextItemId
        ? remaining.find(
            (candidate) =>
              candidate.id === nextItemId &&
              candidate.status === 'pending' &&
              this.itemReady(plan, current, candidate.id, completedAfterCheckpoint),
          )
        : outcome === 'complete'
          ? this.firstReadyPending(plan, { ...current, workItems: remaining }, completedAfterCheckpoint)
          : undefined
      if (nextItemId && !requestedNext)
        throw new HbarError(
          'WORKFLOW_DEPENDENCY_PENDING',
          'The requested next item is unavailable or has unfinished dependencies',
        )
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
        return candidate
      })
      const delegations = current.delegations.map((delegation) => {
        if (
          outcome !== 'revise' ||
          delegation.itemId !== itemId ||
          ['applied', 'cancelled', 'failed'].includes(delegation.status)
        )
          return delegation
        if (delegation.agentId) cancelAgentIds.push(delegation.agentId)
        return { ...delegation, status: 'cancelled' as const, updatedAt: now }
      })
      let nextPlan = agentPlan
      let transitionBase = current
      let nextCanonicalPlanRevision = current.canonicalPlanRevision
      if (outcome === 'complete') {
        const operationId = crypto.randomUUID()
        transitionBase = workflowStateSchema.parse({
          ...current,
          revision: current.revision + 1,
          evidence:
            current.completionPolicy === 'agent'
              ? [
                  ...current.evidence,
                  {
                    evidenceId: crypto.randomUUID(),
                    itemId,
                    checkId: 'agent-conclusion',
                    planRevision: current.planRevision,
                    workspaceRevision: null,
                    createdAt: now,
                    source: 'agent' as const,
                    outcome: 'passed' as const,
                    agentId: 'main',
                    resultHash: hashValue({ summary, evidenceIds }),
                  },
                ].slice(-MAX_WORKFLOW_EVIDENCE)
              : current.evidence,
          transitionIntent: {
            operationId,
            planRevision: agentPlan.revision,
            stepIndex: current.activeStepIndex!,
            stepTextHash: current.activeStepTextHash!,
            itemId,
            summary,
            createdAt: now,
          },
          updatedAt: now,
        })
        await this.persistWorkflow(transitionBase, undefined, {
          transition: { operationId, status: 'intent_recorded' },
        })
        const legacyFollowingIndex =
          !requestedNext &&
          outcome === 'complete' &&
          plan.items.length === 1 &&
          plan.items[0]?.id === itemId &&
          !plan.items[0]?.dependsOnItemIds?.length &&
          hashValue(agentPlan.plan[current.activeStepIndex!]?.step ?? '') === current.activeStepTextHash
            ? agentPlan.plan.findIndex((step, index) => index > current.activeStepIndex! && step.status === 'pending')
            : -1
        const followingIndex = requestedNext
          ? plan.items.findIndex((candidate) => candidate.id === requestedNext.id)
          : legacyFollowingIndex
        const agentPlanSteps = agentPlan.plan.map((step, index) => ({
          ...step,
          status:
            index === current.activeStepIndex
              ? ('completed' as const)
              : index === followingIndex
                ? ('in_progress' as const)
                : step.status,
        }))
        nextPlan = await this.agentPlans.update(
          sessionId,
          agentPlanSteps,
          summary,
          callerRunId ?? agentPlan.turnId,
          agentPlan.revision,
        )
        this.agentPlanSnapshots.set(sessionId, nextPlan)
        const projection = this.plans.get(sessionId)
        if (projection) {
          nextCanonicalPlanRevision = projection.revision + 1
          this.plans.set(
            sessionId,
            workflowPlanSchema.parse({
              ...projection,
              revision: nextCanonicalPlanRevision,
              phase: agentPlanSteps.every((step) => step.status === 'completed') ? 'archived' : 'active',
              updatedAt: nextPlan.updatedAt,
            }),
          )
        }
      }
      const planCompleted = nextPlan.plan.every((step) => step.status === 'completed')
      const workflow = workflowStateSchema.parse({
        ...transitionBase,
        revision: transitionBase.revision + 1,
        planRevision: nextPlan.revision,
        canonicalPlanRevision: outcome === 'complete' ? nextCanonicalPlanRevision : current.canonicalPlanRevision,
        status:
          outcome === 'blocked' ? 'needs_revision' : outcome === 'complete' && planCompleted ? 'completed' : 'active',
        activeItemId: outcome === 'blocked' ? itemId : outcome === 'complete' ? null : (requestedNext?.id ?? itemId),
        activeStepIndex: outcome === 'complete' ? null : current.activeStepIndex,
        activeStepTextHash: outcome === 'complete' ? null : current.activeStepTextHash,
        explorationCount: 0,
        workItems,
        delegations,
        rejection: null,
        transitionIntent: null,
        updatedAt: now,
      })
      return this.persistWorkflow(workflow, undefined, { checkpoint: { kind: outcome, itemId, summary } })
    })
    for (const agentId of cancelAgentIds) await this.agents.cancel(sessionId, agentId)
    return this.snapshot(sessionId)
  }

  private focusPackage(workflow: WorkflowState, item: WorkflowWorkItem) {
    return [
      `Goal: ${this.plans.get(workflow.sessionId)?.objective ?? item.title}`,
      `Work item: ${item.title}`,
      `Item id: ${item.id}`,
      `Plan revision: ${workflow.planRevision}`,
      `Read paths: ${item.scope.readPaths.join(', ') || 'none'}`,
      `Write paths: ${item.scope.writePaths.join(', ') || 'none'}`,
      `Allowed tools: ${item.scope.tools.join(', ') || 'none'}`,
      `Acceptance: ${item.acceptanceChecks.map((check) => `${check.id}: ${check.description}`).join('; ') || 'none'}`,
      'Work only on this item. Return a bounded patch and a concise result summary.',
    ].join('\n')
  }

  private async startQueuedLocked(initial: WorkflowState) {
    let workflow = initial
    for (;;) {
      const running = workflow.delegations.filter((delegation) => delegation.status === 'running').length
      const queued = workflow.delegations.find((delegation) => delegation.status === 'queued')
      if (!queued || running >= this.config.maxConcurrentAgents) return workflow
      const item = workflow.workItems.find((candidate) => candidate.id === queued.itemId)
      if (!item) throw new HbarError('WORKFLOW_ITEM_NOT_FOUND', 'Queued delegation item no longer exists')
      let agentId: string | null = null
      let status: 'running' | 'failed' = 'running'
      try {
        const plan = this.plans.get(workflow.sessionId)
        if (!plan || !this.itemReady(plan, workflow, item.id))
          throw new HbarError('WORKFLOW_DEPENDENCY_PENDING', 'Queued item is no longer ready for delegation')
        const agent = await this.agents.create(
          {
            parentSessionId: workflow.sessionId,
            objective: this.focusPackage(workflow, item),
            title: item.title,
            modelId: queued.modelId,
            tokenBudget: queued.tokenBudget ?? undefined,
            approval: 'allow',
            patchTask: {
              itemId: item.id,
              planRevision: workflow.planRevision,
              scope: item.scope,
              acceptanceChecks: item.acceptanceChecks.map(({ id, description, required, verifier }) => ({
                id,
                description,
                required,
                verifier,
              })),
            },
          },
          {
            actorId: `workflow:${workflow.workflowId}`,
            idempotencyKey: queued.delegationId,
            requestId: `delegation-${queued.delegationId}`,
          },
        )
        agentId = agent.agentId
        if (agent.status === 'failed') status = 'failed'
      } catch {
        status = 'failed'
      }
      const now = Date.now()
      const delegations = workflow.delegations.map((delegation) =>
        delegation.delegationId === queued.delegationId
          ? { ...delegation, agentId, status, updatedAt: now }
          : delegation,
      )
      const workItems = workflow.workItems.map((candidate) =>
        candidate.id === item.id
          ? {
              ...candidate,
              status: status === 'failed' ? ('in_progress' as const) : ('delegated' as const),
              owner: agentId ? { kind: 'agent' as const, agentId } : { kind: 'main' as const },
              startedAt: candidate.startedAt ?? now,
            }
          : candidate,
      )
      workflow = workflowStateSchema.parse({
        ...workflow,
        revision: workflow.revision + 1,
        status: status === 'failed' ? 'active' : workflow.status,
        activeItemId: status === 'failed' ? item.id : workflow.activeItemId,
        delegations,
        workItems,
        updatedAt: now,
      })
      await this.persistWorkflow(workflow, undefined, {
        delegation: { delegationId: queued.delegationId, agentId, status },
      })
    }
  }

  async delegate(
    sessionId: string,
    itemIds: string[],
    modelId: string,
    tokenBudget: number | undefined,
    expectedRevision: number,
  ) {
    return this.serial(sessionId, async () => {
      const current = this.current(sessionId, expectedRevision)
      const plan = this.plans.get(sessionId)
      if (
        !plan ||
        plan.planId !== current.planId ||
        (current.canonicalPlanRevision !== undefined && plan.revision !== current.canonicalPlanRevision)
      )
        throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'Delegation belongs to a stale Workflow Plan revision')
      if (new Set(itemIds).size !== itemIds.length)
        throw new HbarError('WORKFLOW_DELEGATION_CONFLICT', 'Delegated item ids must be unique')
      const items = itemIds.map((itemId) => {
        const item = current.workItems.find((candidate) => candidate.id === itemId)
        if (!item) throw new HbarError('WORKFLOW_ITEM_NOT_FOUND', `Workflow item ${itemId} does not exist`)
        if (!this.itemReady(plan, current, itemId))
          throw new HbarError('WORKFLOW_DEPENDENCY_PENDING', `Workflow item ${itemId} has unfinished dependencies`)
        if (!['pending', 'in_progress'].includes(item.status))
          throw new HbarError('WORKFLOW_DELEGATION_CONFLICT', `Workflow item ${itemId} is not available to delegate`)
        if (!item.scope.writePaths.length)
          throw new HbarError('WORKFLOW_DELEGATION_CONFLICT', `Workflow item ${itemId} has no patch write scope`)
        if (!item.acceptanceChecks.length)
          throw new HbarError('WORKFLOW_DELEGATION_CONFLICT', `Workflow item ${itemId} has no acceptance checks`)
        return item
      })
      for (let index = 0; index < items.length; index++)
        for (let other = index + 1; other < items.length; other++)
          if (scopesOverlap(items[index]!.scope, items[other]!.scope))
            throw new HbarError('WORKFLOW_DELEGATION_CONFLICT', 'Delegated write scopes overlap')
      const unsettled = current.delegations.filter(
        (delegation) => !['applied', 'cancelled', 'failed'].includes(delegation.status),
      )
      for (const item of items)
        for (const delegation of unsettled) {
          const delegatedItem = current.workItems.find((candidate) => candidate.id === delegation.itemId)
          if (delegatedItem && scopesOverlap(item.scope, delegatedItem.scope))
            throw new HbarError('WORKFLOW_DELEGATION_CONFLICT', 'Write scope overlaps an unsettled delegation')
        }
      const goal = await this.goals.get(sessionId)
      const reserved = current.delegations
        .filter((delegation) => !['cancelled', 'failed'].includes(delegation.status))
        .reduce((total, delegation) => total + (delegation.tokenBudget ?? 0), 0)
      const available = goal.remainingTokens === null ? null : goal.remainingTokens - reserved
      const perAgent =
        tokenBudget ?? (available === null ? null : Math.floor(available / Math.max(2, items.length + 1)))
      if (available !== null && (perAgent === null || perAgent < 1 || perAgent * items.length > available))
        throw new HbarError('WORKFLOW_DELEGATION_CONFLICT', 'Delegated token budgets exceed the Goal remainder')
      const now = Date.now()
      const additions = items.map((item) => ({
        delegationId: crypto.randomUUID(),
        itemId: item.id,
        agentId: null,
        modelId,
        tokenBudget: perAgent,
        status: 'queued' as const,
        patchId: null,
        createdAt: now,
        updatedAt: now,
      }))
      let workItems = current.workItems.map((candidate) =>
        itemIds.includes(candidate.id)
          ? {
              ...candidate,
              status: 'delegated' as const,
              owner: { kind: 'main' as const },
              startedAt: candidate.startedAt ?? now,
            }
          : candidate,
      )
      let next = workItems.find(
        (candidate) =>
          candidate.owner.kind === 'main' &&
          candidate.status === 'in_progress' &&
          this.itemReady(plan, { ...current, workItems }, candidate.id),
      )
      if (!next) {
        next = workItems.find(
          (candidate) =>
            candidate.owner.kind === 'main' &&
            candidate.status === 'pending' &&
            this.itemReady(plan, { ...current, workItems }, candidate.id),
        )
        if (next)
          workItems = workItems.map((candidate) =>
            candidate.id === next!.id
              ? { ...candidate, status: 'in_progress' as const, startedAt: candidate.startedAt ?? now }
              : candidate,
          )
      }
      const workflow = workflowStateSchema.parse({
        ...current,
        revision: current.revision + 1,
        status: next ? 'active' : 'waiting',
        activeItemId: next?.id ?? null,
        explorationCount: 0,
        workItems,
        delegations: [...current.delegations, ...additions],
        updatedAt: now,
      })
      await this.persistWorkflow(workflow, undefined, {
        delegation: { queued: additions.map((entry) => entry.delegationId) },
      })
      await this.startQueuedLocked(workflow)
      return this.snapshot(sessionId)
    })
  }

  async handleAgentPatch(event: {
    parentSessionId: string
    agentId: string
    patch: import('@hbar/contracts').AgentPatch | null
    status: 'ready' | 'applied' | 'conflict' | 'rejected'
  }) {
    if (!this.workflows.has(event.parentSessionId)) return
    await this.serial(event.parentSessionId, async () => {
      const current = this.workflows.get(event.parentSessionId)
      if (!current || current.status === 'completed') return
      const delegation = current.delegations.find((candidate) => candidate.agentId === event.agentId)
      if (!delegation) return
      if (delegation.status === 'cancelled') {
        await this.startQueuedLocked(current)
        return
      }
      const status =
        event.status === 'ready'
          ? ('patch_ready' as const)
          : event.status === 'rejected'
            ? ('failed' as const)
            : event.status
      const now = Date.now()
      const workflow = workflowStateSchema.parse({
        ...current,
        revision: current.revision + 1,
        status: 'active',
        activeItemId: delegation.itemId,
        delegations: current.delegations.map((candidate) =>
          candidate.delegationId === delegation.delegationId
            ? { ...candidate, status, patchId: event.patch?.patchId ?? candidate.patchId, updatedAt: now }
            : candidate,
        ),
        workItems: current.workItems.map((item) =>
          item.id === delegation.itemId
            ? {
                ...item,
                status:
                  status === 'patch_ready' || status === 'applied' ? ('verifying' as const) : ('in_progress' as const),
                owner: { kind: 'main' as const },
              }
            : item,
        ),
        updatedAt: now,
      })
      await this.persistWorkflow(workflow, undefined, {
        delegation: { delegationId: delegation.delegationId, patchId: event.patch?.patchId ?? null, status },
      })
      await this.startQueuedLocked(workflow)
    })
  }

  async handleAgentSettled(event: {
    parentSessionId: string
    agentId: string
    status: import('@hbar/contracts/commands/agents').AgentRecord['status']
  }) {
    if (!['cancelRequested', 'cancelled', 'failed', 'interrupted'].includes(event.status)) return
    if (!this.workflows.has(event.parentSessionId)) return
    await this.serial(event.parentSessionId, async () => {
      const current = this.workflows.get(event.parentSessionId)
      const review = current?.review
      if (
        !current ||
        !review ||
        review.reviewerAgentId !== event.agentId ||
        !['queued', 'running'].includes(review.status)
      )
        return
      const now = Date.now()
      await this.persistWorkflow(
        workflowStateSchema.parse({
          ...current,
          revision: current.revision + 1,
          status: 'active',
          review: {
            ...review,
            status: 'cancelled',
            summary: event.status,
            updatedAt: now,
          },
          updatedAt: now,
        }),
        undefined,
        { review: { reviewId: review.reviewId, status: 'cancelled' } },
      )
    })
  }

  async resumeDelegations() {
    for (const [sessionId, workflow] of this.workflows)
      if (workflow.status !== 'completed' && workflow.delegations.some((delegation) => delegation.status === 'queued'))
        await this.serial(sessionId, () => this.startQueuedLocked(this.workflows.get(sessionId) ?? workflow))
  }

  async cancelForGoal(sessionId: string, goalId: string) {
    const cancel: string[] = []
    const cancelTargetRunIds: string[] = []
    await this.serial(sessionId, async () => {
      const current = this.workflows.get(sessionId)
      if (!current || current.goalId !== goalId || ['completed', 'cancelled'].includes(current.status)) return
      for (const delegation of current.delegations)
        if (delegation.agentId && !['applied', 'cancelled', 'failed'].includes(delegation.status))
          cancel.push(delegation.agentId)
      if (current.review?.reviewerAgentId && ['queued', 'running'].includes(current.review.status))
        cancel.push(current.review.reviewerAgentId)
      for (const dispatch of current.targetDispatches)
        if (
          dispatch.operationId &&
          ['queued', 'running', 'waiting_approval', 'cancel_requested'].includes(dispatch.status)
        )
          cancelTargetRunIds.push(dispatch.operationId)
      const now = Date.now()
      await this.persistWorkflow(
        workflowStateSchema.parse({
          ...current,
          revision: current.revision + 1,
          status: 'cancelled',
          activeItemId: null,
          activeStepIndex: null,
          activeStepTextHash: null,
          delegations: current.delegations.map((delegation) =>
            ['applied', 'cancelled', 'failed'].includes(delegation.status)
              ? delegation
              : { ...delegation, status: 'cancelled' as const, updatedAt: now },
          ),
          review: current.review ? { ...current.review, status: 'cancelled' as const, updatedAt: now } : null,
          targetDispatches: current.targetDispatches.map((dispatch) =>
            cancelTargetRunIds.includes(dispatch.operationId ?? '')
              ? { ...dispatch, status: 'cancel_requested' as const, updatedAt: now }
              : dispatch,
          ),
          updatedAt: now,
        }),
        undefined,
        { cancelledForGoal: goalId },
      )
    })
    for (const agentId of cancel) await this.agents.cancel(sessionId, agentId)
    for (const runId of cancelTargetRunIds) await this.api.sessions.cancel(runId).catch(() => {})
  }

  async agentResult(sessionId: string, agentId: string) {
    const workflow = this.workflows.get(sessionId)
    if (!workflow?.delegations.some((delegation) => delegation.agentId === agentId))
      throw new HbarError('AGENT_NOT_FOUND', 'Agent is not delegated by this workflow')
    return this.agents.result(sessionId, agentId)
  }

  async applyAgentPatch(sessionId: string, agentId: string, planRevision: number) {
    const workflow = this.workflows.get(sessionId)
    const delegation = workflow?.delegations.find((candidate) => candidate.agentId === agentId)
    if (!workflow || !delegation) throw new HbarError('AGENT_NOT_FOUND', 'Agent is not delegated by this workflow')
    if (workflow.planRevision !== planRevision)
      throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'The agent patch belongs to a stale workflow plan')
    if (!delegation.patchId || !['patch_ready', 'conflict'].includes(delegation.status))
      throw new HbarError('AGENT_PATCH_UNAVAILABLE', 'The delegated agent has no patch ready to apply')
    return this.agents.applyPatch(sessionId, agentId, planRevision, {
      actorId: `workflow:${workflow.workflowId}`,
      idempotencyKey: `${delegation.delegationId}:${delegation.patchId}`,
      requestId: `apply-${delegation.patchId}`,
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
      if (current.completionPolicy !== 'user' || current.status !== 'waiting_user' || current.activeItemId !== itemId)
        throw new HbarError(
          'WORKFLOW_CHECK_INVALID',
          'Manual acceptance is limited to the current focus while it is waiting for user review',
        )
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
        status: decision === 'accepted' ? 'verifying' : 'needs_revision',
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

  async startReviewer(event: HookEvents['run.start']) {
    await this.bindTargetRun(event)
    const session = await this.api.sessions.get(event.sessionId)
    if (!session.parentId || !this.workflows.has(session.parentId)) return
    const assigned = await this.serial(session.parentId, async () => {
      const review = this.workflows.get(session.parentId!)?.review
      return review?.reviewerAgentId === event.sessionId && ['queued', 'running'].includes(review.status)
    })
    if (!assigned || (await this.goals.get(event.sessionId)).goal) return
    await this.goals.create(
      event.sessionId,
      event.run.input.text,
      undefined,
      event.runId,
      event.run.startedAt ?? event.run.createdAt,
    )
  }

  private targetDispatchForRun(run: Run) {
    const provenance = run.input.peerMessage
    if (!provenance || provenance.targetSessionId !== run.sessionId || provenance.deliveryPolicy !== 'queue')
      return null
    const indexed = this.targetDispatchIndex.get(provenance.idempotencyKey)
    if (!indexed) return null
    const workflow = this.workflows.get(indexed.sourceSessionId)
    const plan = this.plans.get(indexed.sourceSessionId)
    const dispatch = workflow?.targetDispatches.find((candidate) => candidate.dispatchId === indexed.dispatchId)
    const planItem = plan?.items.find((candidate) => candidate.id === dispatch?.itemId)
    if (
      !workflow ||
      !plan ||
      !dispatch ||
      !planItem?.targetSessionIds?.includes(run.sessionId) ||
      provenance.senderSessionId !== indexed.sourceSessionId ||
      dispatch.targetSessionId !== run.sessionId ||
      dispatch.workspaceId !== provenance.workspaceId ||
      dispatch.actorId !== provenance.actorId ||
      dispatch.peerIdempotencyKey !== provenance.idempotencyKey ||
      dispatch.workflowRevision > workflow.revision ||
      dispatch.planId !== workflow.planId ||
      dispatch.planRevision !== workflow.planRevision
    )
      return null
    return { sourceSessionId: indexed.sourceSessionId, workflow, dispatch }
  }

  private indexTargetDispatches(sessionId: string, workflow: WorkflowState) {
    for (const dispatch of workflow.targetDispatches)
      this.targetDispatchIndex.set(dispatch.peerIdempotencyKey, {
        sourceSessionId: sessionId,
        dispatchId: dispatch.dispatchId,
      })
  }

  private async bindTargetRun(event: HookEvents['run.start']) {
    const match = this.targetDispatchForRun(event.run)
    if (!match) return
    this.targetRunBindings.set(event.runId, {
      sourceSessionId: match.sourceSessionId,
      dispatchId: match.dispatch.dispatchId,
    })
    await this.serial(match.sourceSessionId, async () => {
      const current = this.workflows.get(match.sourceSessionId)
      const dispatch = current?.targetDispatches.find((entry) => entry.dispatchId === match.dispatch.dispatchId)
      if (
        !current ||
        !dispatch ||
        dispatch.planRevision !== current.planRevision ||
        dispatch.targetSessionId !== event.sessionId
      )
        return
      if (
        !['dispatching', 'result_unknown', 'queued', 'running', 'waiting_approval', 'cancel_requested'].includes(
          dispatch.status,
        )
      ) {
        await this.api.sessions.cancel(event.runId).catch(() => {})
        return
      }
      const source = await this.api.sessions.get(match.sourceSessionId)
      const target = await this.api.sessions.get(event.sessionId)
      const targetWorkflow = this.workflows.get(event.sessionId)
      const staleReason =
        current.status === 'cancelled' ||
        ['completed', 'archived'].includes(this.plans.get(match.sourceSessionId)?.phase ?? 'draft')
          ? 'PARENT_CANCELLED'
          : event.run.input.peerMessage?.payloadHash !== dispatch.requestHash ||
              event.run.input.text !== dispatch.messageText ||
              event.run.modelId !== dispatch.modelId
            ? 'WORKFLOW_TARGET_PAYLOAD_CHANGED'
            : dispatch.status === 'cancel_requested'
              ? 'TARGET_CANCEL_REQUESTED'
              : !['active', 'verifying'].includes(current.status)
                ? 'PARENT_WORKFLOW_NOT_ACTIVE'
                : target.archived || target.workspaceId !== dispatch.workspaceId
                  ? 'WORKFLOW_TARGET_STALE'
                  : source.workspaceId !== dispatch.workspaceId
                    ? 'WORKFLOW_SOURCE_STALE'
                    : targetWorkflow && !['completed', 'cancelled'].includes(targetWorkflow.status)
                      ? 'WORKFLOW_TARGET_BUSY'
                      : null
      if (staleReason) {
        await this.api.sessions.cancel(event.runId).catch(() => {})
        const now = Date.now()
        const stopped = workflowStateSchema.parse({
          ...current,
          revision: current.revision + 1,
          targetDispatches: current.targetDispatches.map((entry) =>
            entry.dispatchId === dispatch.dispatchId
              ? {
                  ...entry,
                  status: 'stale' as const,
                  operationId: event.runId,
                  targetRunId: event.runId,
                  errorCode: staleReason,
                  updatedAt: now,
                  completedAt: now,
                }
              : entry,
          ),
          updatedAt: now,
        })
        await this.persistWorkflow(stopped, event.runId, {
          targetRunRejected: { dispatchId: dispatch.dispatchId, reason: staleReason },
        })
        return
      }
      if (dispatch.targetRunId && dispatch.targetRunId !== event.runId)
        throw new HbarError('WORKFLOW_DISPATCH_CONFLICT', 'A target dispatch was started by a different Run')
      if (dispatch.targetRunId === event.runId && dispatch.status === 'running') return
      const now = Date.now()
      const next = workflowStateSchema.parse({
        ...current,
        revision: current.revision + 1,
        targetDispatches: current.targetDispatches.map((entry) =>
          entry.dispatchId === dispatch.dispatchId
            ? {
                ...entry,
                status: 'running' as const,
                operationId: event.runId,
                targetRunId: event.runId,
                updatedAt: now,
              }
            : entry,
        ),
        updatedAt: now,
      })
      await this.persistWorkflow(next, event.runId, {
        targetRunStarted: { dispatchId: dispatch.dispatchId, targetRunId: event.runId },
      })
    })
  }

  private async targetRunSummary(sessionId: string, runId: string, startSeq: number | null) {
    if (startSeq === null) return null
    let cursor = Math.max(0, startSeq)
    const text: string[] = []
    for (let pageIndex = 0; pageIndex < 8; pageIndex++) {
      const events = await this.api.sessions.events(sessionId, cursor, 2_000)
      if (!events.length) break
      let settled = false
      for (const event of events) {
        cursor = event.seq
        if (event.type === 'message.committed' && event.runId === runId) {
          const parsed = z
            .object({ role: z.enum(['user', 'assistant', 'tool', 'system']), content: z.array(contentBlockSchema) })
            .safeParse(event.data)
          if (parsed.success && parsed.data.role === 'assistant') {
            text.push(...parsed.data.content.filter((block) => block.type === 'text').map((block) => block.text))
          }
        }
        if (event.runId === runId && event.type === 'run.settled') {
          settled = true
          break
        }
      }
      if (settled || events.length < 2_000) break
    }
    const summary = text.filter(Boolean).join('\n').trim().slice(-2_000)
    return summary || null
  }

  async settleTargetRun(event: HookEvents['run.end']) {
    for (const [key, target] of this.toolTargets)
      if (target.sessionId === event.sessionId && target.runId === event.runId) this.toolTargets.delete(key)
    const inMemoryBinding = this.targetRunBindings.get(event.runId)
    const recoveredBinding = inMemoryBinding ? null : this.targetDispatchForRun(event.run)
    if (!inMemoryBinding && !recoveredBinding) return
    const sourceSessionId = inMemoryBinding?.sourceSessionId ?? recoveredBinding!.sourceSessionId
    const dispatchId = inMemoryBinding?.dispatchId ?? recoveredBinding!.dispatch.dispatchId
    await this.serial(sourceSessionId, async () => {
      const workflow = this.workflows.get(sourceSessionId)
      const dispatch = workflow?.targetDispatches.find((entry) => entry.dispatchId === dispatchId)
      if (!workflow || !dispatch || dispatch.targetRunId !== event.runId || dispatch.completedAt !== null) return
      const resultSummary = await this.targetRunSummary(event.sessionId, event.runId, dispatch.targetRunStartSeq)
      const terminal = event.status
      const status = terminal === 'completed' ? 'succeeded' : terminal === 'cancelled' ? 'cancelled' : 'failed'
      const now = Date.now()
      const next = workflowStateSchema.parse({
        ...workflow,
        revision: workflow.revision + 1,
        targetDispatches: workflow.targetDispatches.map((entry) =>
          entry.dispatchId === dispatchId
            ? {
                ...entry,
                status,
                terminalRunStatus: terminal,
                resultSummary: terminal === 'completed' ? resultSummary : (event.run.error ?? terminal).slice(0, 2_000),
                resultHash: hashValue({ runId: event.runId, status: terminal, error: event.run.error, resultSummary }),
                errorCode: terminal === 'completed' ? null : 'TARGET_RUN_TERMINAL',
                updatedAt: now,
                completedAt: now,
              }
            : entry,
        ),
        updatedAt: now,
      })
      await this.persistWorkflow(next, event.runId, {
        targetRunEnded: { dispatchId, status, terminalRunStatus: terminal },
      })
    })
    this.targetRunBindings.delete(event.runId)
  }

  async submitReview(reviewerSessionId: string, reviewId: string, verdict: 'approved' | 'rejected', summary: string) {
    const target = [...this.workflows.entries()].find(([, workflow]) => workflow.review?.reviewId === reviewId)
    if (!target) throw new HbarError('WORKFLOW_REVIEW_NOT_FOUND', 'The review request does not exist')
    const [sessionId] = target
    const reviewerSession = await this.api.sessions.get(reviewerSessionId)
    if (reviewerSession.parentId !== sessionId)
      throw new HbarError('WORKFLOW_REVIEW_FORBIDDEN', 'Only the assigned direct review agent can submit this verdict')
    const reviewerGoal = (await this.goals.get(reviewerSessionId)).goal
    let resumeModelId: string | null = null
    let result!: WorkflowSnapshot
    await this.serial(sessionId, async () => {
      const current = this.workflows.get(sessionId)
      const review = current?.review
      if (!current || !review || review.reviewId !== reviewId)
        throw new HbarError('WORKFLOW_REVIEW_NOT_FOUND', 'The review request is no longer current')
      if (review.reviewerAgentId && review.reviewerAgentId !== reviewerSessionId)
        throw new HbarError('WORKFLOW_REVIEW_FORBIDDEN', 'The verdict came from a different review agent')
      if (review.status !== 'running' && review.status !== 'queued')
        throw new HbarError('WORKFLOW_REVIEW_SETTLED', 'The review request is already settled')
      const plan = await this.agentPlans.get(sessionId)
      const fingerprint = await this.workspaceFingerprint(sessionId)
      const stale =
        !plan ||
        plan.revision !== review.planRevision ||
        current.activeStepTextHash !== review.stepTextHash ||
        fingerprint !== review.workspaceFingerprint
      const now = Date.now()
      if (stale) {
        result = await this.persistWorkflow(
          workflowStateSchema.parse({
            ...current,
            revision: current.revision + 1,
            status: 'needs_revision',
            review: { ...review, status: 'stale', summary, updatedAt: now },
            updatedAt: now,
          }),
          undefined,
          { review: { reviewId, status: 'stale' } },
        )
        return
      }
      const item = current.workItems.find((candidate) => candidate.id === current.activeItemId)
      if (!item || current.activeStepIndex === null)
        throw new HbarError('WORKFLOW_REVIEW_STALE', 'The reviewed focus is no longer active')
      const canonicalPlan = this.plans.get(sessionId)
      const canonicalItem = canonicalPlan?.items[current.activeStepIndex]
      if (
        !canonicalPlan ||
        canonicalPlan.planId !== current.planId ||
        (current.canonicalPlanRevision !== undefined && canonicalPlan.revision !== current.canonicalPlanRevision) ||
        !canonicalItem ||
        canonicalItem.id !== item.id ||
        canonicalItem.title !== plan.plan[current.activeStepIndex]?.step ||
        !this.itemReady(canonicalPlan, current, item.id)
      )
        throw new HbarError(
          'WORKFLOW_REVISION_CONFLICT',
          'The reviewed item no longer matches the current canonical Plan',
        )
      const reviewerEvidence = {
        evidenceId: crypto.randomUUID(),
        itemId: item.id,
        checkId: 'review-verdict',
        planRevision: current.planRevision,
        workspaceRevision: fingerprint,
        createdAt: now,
        source: 'reviewer' as const,
        outcome: verdict,
        reviewId,
        agentId: reviewerSessionId,
        summary,
        resultHash: hashValue({ verdict, summary, fingerprint }),
      }
      if (verdict === 'rejected') {
        resumeModelId = review.resumeModelId
        result = await this.persistWorkflow(
          workflowStateSchema.parse({
            ...current,
            revision: current.revision + 1,
            status: 'needs_revision',
            evidence: [...current.evidence, reviewerEvidence].slice(-MAX_WORKFLOW_EVIDENCE),
            review: { ...review, status: 'rejected', summary, updatedAt: now },
            updatedAt: now,
          }),
          undefined,
          { review: { reviewId, status: 'rejected', summary } },
        )
        return
      }
      const operationId = crypto.randomUUID()
      const transition = workflowStateSchema.parse({
        ...current,
        revision: current.revision + 1,
        evidence: [...current.evidence, reviewerEvidence].slice(-MAX_WORKFLOW_EVIDENCE),
        review: { ...review, status: 'approved', summary, updatedAt: now },
        transitionIntent: {
          operationId,
          planRevision: plan.revision,
          stepIndex: current.activeStepIndex,
          stepTextHash: current.activeStepTextHash!,
          itemId: item.id,
          summary,
          createdAt: now,
        },
        updatedAt: now,
      })
      await this.persistWorkflow(transition, undefined, {
        transition: { operationId, status: 'review_approved' },
      })
      const completedIds = new Set(
        current.workItems.filter((candidate) => candidate.status === 'completed').map((candidate) => candidate.id),
      )
      completedIds.add(item.id)
      const projectedWorkItems = current.workItems.map((candidate) =>
        candidate.id === item.id
          ? { ...candidate, status: 'completed' as const, completedAt: candidate.completedAt ?? now }
          : candidate,
      )
      const followingItem = this.firstReadyPending(
        canonicalPlan,
        { ...current, workItems: projectedWorkItems },
        completedIds,
      )
      const legacyFollowingIndex =
        !followingItem &&
        canonicalPlan.items.length === 1 &&
        canonicalPlan.items[0]?.id === item.id &&
        !canonicalPlan.items[0]?.dependsOnItemIds?.length &&
        hashValue(plan.plan[current.activeStepIndex]?.step ?? '') === current.activeStepTextHash
          ? plan.plan.findIndex((step, index) => index > current.activeStepIndex! && step.status === 'pending')
          : -1
      const followingIndex = followingItem
        ? canonicalPlan.items.findIndex((candidate) => candidate.id === followingItem.id)
        : legacyFollowingIndex
      const updatedPlan = await this.agentPlans.update(
        sessionId,
        plan.plan.map((step, index) => ({
          ...step,
          status:
            index === current.activeStepIndex
              ? ('completed' as const)
              : index === followingIndex
                ? ('in_progress' as const)
                : step.status,
        })),
        summary,
        plan.turnId,
        plan.revision,
      )
      this.agentPlanSnapshots.set(sessionId, updatedPlan)
      const completed = updatedPlan.plan.every((step) => step.status === 'completed')
      const projection = this.plans.get(sessionId)
      const nextCanonicalPlanRevision = projection ? projection.revision + 1 : current.canonicalPlanRevision
      if (projection)
        this.plans.set(
          sessionId,
          workflowPlanSchema.parse({
            ...projection,
            revision: nextCanonicalPlanRevision!,
            phase: completed ? 'archived' : 'active',
            updatedAt: updatedPlan.updatedAt,
          }),
        )
      resumeModelId = review.resumeModelId
      result = await this.persistWorkflow(
        workflowStateSchema.parse({
          ...transition,
          revision: transition.revision + 1,
          planRevision: updatedPlan.revision,
          canonicalPlanRevision: nextCanonicalPlanRevision,
          status: completed ? 'completed' : 'active',
          activeItemId: null,
          activeStepIndex: null,
          activeStepTextHash: null,
          workItems: transition.workItems.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, status: 'completed' as const, completedAt: candidate.completedAt ?? now }
              : candidate,
          ),
          transitionIntent: null,
          updatedAt: now,
        }),
        undefined,
        { review: { reviewId, status: 'approved', summary } },
      )
    })
    if (reviewerGoal?.goalId) {
      try {
        await this.goals.set(reviewerSessionId, {
          expectedGoalId: reviewerGoal.goalId,
          status: result.workflow?.review?.status === 'stale' ? 'paused' : 'complete',
        })
      } catch (error) {
        if (!(error instanceof HbarError && error.code === 'GOAL_CONFLICT')) throw error
      }
    }
    const current = result.workflow
    if (resumeModelId && current && current.review?.status !== 'stale') {
      const goal = await this.goals.get(sessionId)
      if (goal.goal?.goalId && ['active', 'budget_limited'].includes(goal.goal.status))
        await this.goals.requestContinuation(sessionId, {
          goalId: goal.goal.goalId,
          trigger: `workflow-review-${reviewId}`,
          modelId: resumeModelId,
          text:
            verdict === 'approved'
              ? `Independent review approved the prior focus: ${summary}. Continue the authoritative Agent Plan and Goal.`
              : `Independent review rejected the prior focus: ${summary}. Revise the focus and continue without asking the user to decide.`,
        })
    }
    return result
  }

  private assertCompletable(workflow: WorkflowState) {
    this.assertNoMutations(workflow)
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

  private assertTargetItemsSucceeded(sessionId: string, workflow: WorkflowState, itemId?: string) {
    const plan = this.plans.get(sessionId)
    if (
      !plan ||
      plan.planId !== workflow.planId ||
      plan.revision !== (workflow.canonicalPlanRevision ?? workflow.planRevision)
    )
      throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'Target results belong to a different Plan revision')
    const completedItemIds = itemId
      ? [itemId]
      : workflow.workItems.filter((item) => item.status === 'completed').map((item) => item.id)
    for (const completedItemId of completedItemIds) {
      const planItem = plan.items.find((item) => item.id === completedItemId)
      if (!planItem?.targetSessionIds?.length) continue
      for (const targetSessionId of planItem.targetSessionIds) {
        const result = workflow.targetDispatches.find(
          (dispatch) =>
            dispatch.planId === plan.planId &&
            dispatch.planRevision === plan.revision &&
            dispatch.itemId === completedItemId &&
            dispatch.targetSessionId === targetSessionId,
        )
        if (!result || result.status !== 'succeeded' || !result.resultHash)
          throw new HbarError(
            'WORKFLOW_TARGET_PENDING',
            `Target WorkItem ${completedItemId} for session ${targetSessionId} must succeed and be reviewed before completion`,
          )
      }
    }
  }

  async guardCompletion(sessionId: string, goalId: string | undefined, commit: () => Promise<void>) {
    const observed = this.workflows.get(sessionId)
    const plan = await this.agentPlans.get(sessionId)
    return () =>
      this.serial(sessionId, async () => {
        const workflow = this.workflows.get(sessionId)
        if (workflow?.workflowId !== observed?.workflowId || workflow?.revision !== observed?.revision)
          throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'The workflow changed before goal completion')
        await this.agentPlans.withRevision(sessionId, plan?.revision ?? null, async () => {
          if (workflow && (!goalId || !workflow.goalId || workflow.goalId === goalId)) {
            this.assertCompletable(workflow)
            this.assertTargetItemsSucceeded(sessionId, workflow)
            if (workflow.status !== 'completed' || workflow.planRevision !== plan?.revision)
              throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'Complete the current Agent Plan workflow first')
          }
          if (plan?.plan.some((step) => step.status !== 'completed'))
            throw new HbarError('PLAN_INCOMPLETE', 'Complete the remaining Agent Plan steps before completing the Goal')
          await commit()
        })
      })
  }

  canAutoContinue(sessionId: string) {
    const workflow = this.workflows.get(sessionId)
    if (!workflow || ['completed', 'cancelled'].includes(workflow.status)) return true
    // Verification of agent-owned/tool-owned checks is still an executable
    // phase. Only user review, blocked work, delegation, and pending user
    // checks must hold automatic Goal continuation.
    if (!['active', 'verifying'].includes(workflow.status)) return false
    if (!workflow.activeItemId) return true
    const item = workflow.workItems.find((candidate) => candidate.id === workflow.activeItemId)
    if (!item || item.owner.kind !== 'main' || ['blocked', 'delegated', 'completed'].includes(item.status)) return false
    return !item.acceptanceChecks.some(
      (check) => check.required && check.verifier.kind === 'user' && check.status === 'pending',
    )
  }

  continuationPolicy(sessionId: string): {
    allowed: boolean
    reason?: 'workflow_wait' | 'repair'
    recoveryKey?: string
  } {
    const workflow = this.workflows.get(sessionId)
    if (workflow && ['blocked', 'needs_revision'].includes(workflow.status))
      return {
        allowed: true,
        reason: 'repair',
        recoveryKey: `${workflow.workflowId}:${workflow.activeStepTextHash ?? 'unfocused'}`,
      }
    const allowed = this.canAutoContinue(sessionId)
    return allowed ? { allowed } : { allowed, reason: 'workflow_wait' }
  }

  selectTools(event: HookEvents['tools.select']): HookEvents['tools.select'] {
    const targetBinding = this.targetRunBindings.get(event.runId)
    if (targetBinding) {
      const dispatch = this.workflows
        .get(targetBinding.sourceSessionId)
        ?.targetDispatches.find((entry) => entry.dispatchId === targetBinding.dispatchId)
      const localWorkflow = this.workflows.get(event.sessionId)
      return {
        ...event,
        tools:
          localWorkflow && !['completed', 'cancelled'].includes(localWorkflow.status)
            ? []
            : event.tools.filter((tool) => dispatch?.scope.tools.includes(tool.name) ?? false),
      }
    }
    const workflow = this.workflows.get(event.sessionId)
    return workflow && ['blocked', 'needs_revision'].includes(workflow.status)
      ? { ...event, tools: event.tools.filter((tool) => REPAIR_TOOLS.has(tool.name)) }
      : event
  }

  async prepareTargetDispatch(
    sessionId: string,
    planId: string,
    planRevision: number,
    itemIds: string[],
    modelId: string,
    command: WorkflowStartCommand,
  ) {
    return this.serial(sessionId, async () => {
      const plan = this.plans.get(sessionId)
      const workflow = this.workflows.get(sessionId)
      if (!plan || !workflow || plan.phase !== 'active')
        throw new HbarError('WORKFLOW_PLAN_REQUIRED', 'An active canonical Workflow Plan is required')
      if (plan.planId !== planId || plan.revision !== planRevision || workflow.planId !== planId)
        throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'The Workflow Plan changed before target dispatch')
      if (!itemIds.length || new Set(itemIds).size !== itemIds.length)
        throw new HbarError('INVALID_INPUT', 'Target dispatch item IDs must be non-empty and unique')
      if (workflow.status !== 'active' && workflow.status !== 'verifying')
        throw new HbarError('WORKFLOW_NOT_ACTIVE', 'Only an active Workflow can dispatch target work')
      const source = await this.api.sessions.get(sessionId)
      const prior = workflow.targetDispatches.filter(
        (dispatch) => dispatch.actorId === command.actorId && dispatch.idempotencyKey === command.idempotencyKey,
      )
      if (prior.length) {
        if (prior.some((dispatch) => dispatch.commandHash !== command.inputHash))
          throw new HbarError('IDEMPOTENCY_CONFLICT', 'Workflow dispatch key was used with different input')
        return { dispatches: prior, createdDispatchIds: [] }
      }
      for (const itemId of itemIds) {
        const workItem = workflow.workItems.find((item) => item.id === itemId)
        if (!workItem) throw new HbarError('WORKFLOW_ITEM_NOT_FOUND', `Workflow item ${itemId} does not exist`)
        if (!this.itemReady(plan, workflow, itemId))
          throw new HbarError('WORKFLOW_DEPENDENCY_PENDING', `Workflow item ${itemId} has unfinished dependencies`)
      }
      const now = Date.now()
      const created: WorkflowTargetDispatch[] = []
      for (const itemId of itemIds) {
        const planItem = plan.items.find((item) => item.id === itemId)
        const workItem = workflow.workItems.find((item) => item.id === itemId)
        if (!planItem || !workItem)
          throw new HbarError('WORKFLOW_ITEM_NOT_FOUND', `Workflow item ${itemId} does not exist`)
        const targetSessionIds = planItem.targetSessionIds ?? []
        if (!targetSessionIds.length)
          throw new HbarError('WORKFLOW_TARGET_REQUIRED', `Workflow item ${itemId} has no assigned target sessions`)
        for (const targetSessionId of targetSessionIds) {
          const target = await this.api.sessions.get(targetSessionId)
          if (target.id === source.id || target.archived || target.workspaceId !== source.workspaceId)
            throw new HbarError('WORKFLOW_TARGET_STALE', `Workflow target session ${targetSessionId} is unavailable`)
          const targetWorkflow = this.workflows.get(targetSessionId)
          if (targetWorkflow && !['completed', 'cancelled'].includes(targetWorkflow.status))
            throw new HbarError(
              'WORKFLOW_TARGET_BUSY',
              `Workflow target session ${targetSessionId} already owns an active Workflow`,
            )
          const dispatchId = `wfd-${hashValue(
            JSON.stringify([
              command.actorId,
              source.workspaceId,
              sessionId,
              command.idempotencyKey,
              planId,
              planRevision,
              workflow.revision,
              itemId,
              targetSessionId,
            ]),
          ).slice(0, 48)}`
          if (workflow.targetDispatches.some((entry) => entry.dispatchId === dispatchId))
            throw new HbarError('WORKFLOW_DISPATCH_CONFLICT', 'A matching target dispatch already exists')
          const peerIdempotencyKey = `workflow-target-${dispatchId}`
          const messageText = workflowTargetTaskText(plan, planItem)
          if (messageText.length > 20_000)
            throw new HbarError('WORKFLOW_TARGET_LIMIT', `WorkItem ${itemId} message exceeds the peer messaging limit`)
          const peerRequestHash = peerPayloadHash({
            senderSessionId: sessionId,
            targetSessionId,
            workspaceId: source.workspaceId,
            modelId,
            text: messageText,
            deliveryPolicy: 'queue',
          })
          created.push({
            dispatchId,
            workflowId: workflow.workflowId,
            planId,
            planRevision,
            workflowRevision: workflow.revision,
            itemId,
            targetSessionId,
            workspaceId: source.workspaceId,
            messageText,
            actorId: command.actorId,
            idempotencyKey: command.idempotencyKey,
            peerIdempotencyKey,
            commandHash: command.inputHash,
            requestHash: peerRequestHash,
            modelId,
            scope: workItem.scope,
            status: 'dispatching',
            delivery: null,
            operationId: null,
            targetRunId: null,
            targetRunStartSeq: null,
            terminalRunStatus: null,
            resultSummary: null,
            resultHash: null,
            errorCode: null,
            createdAt: now,
            updatedAt: now,
            completedAt: null,
          })
          const unsettled = [...workflow.targetDispatches, ...created].filter(
            (entry) => !['succeeded', 'failed', 'cancelled', 'stale'].includes(entry.status),
          )
          const currentDispatch = created[created.length - 1]!
          if (
            unsettled.some(
              (entry) =>
                entry.dispatchId !== currentDispatch.dispatchId && scopesOverlap(entry.scope, currentDispatch.scope),
            )
          )
            throw new HbarError(
              'WORKFLOW_TARGET_SCOPE_CONFLICT',
              'Concurrent target WorkItems cannot have overlapping write paths',
            )
        }
      }
      if (workflow.targetDispatches.length + created.length > MAX_WORKFLOW_TARGET_DISPATCHES)
        throw new HbarError('WORKFLOW_TARGET_LIMIT', 'Workflow target dispatch journal is full')
      const next = workflowStateSchema.parse({
        ...workflow,
        revision: workflow.revision + 1,
        targetDispatches: [...workflow.targetDispatches, ...created],
        updatedAt: now,
      })
      await this.persistWorkflow(next, undefined, {
        targetDispatchIntent: {
          actorId: command.actorId,
          idempotencyKey: command.idempotencyKey,
          commandHash: command.inputHash,
        },
      })
      return { dispatches: created, createdDispatchIds: created.map((entry) => entry.dispatchId) }
    })
  }

  async prepareTargetReconciliation(
    sessionId: string,
    planId: string,
    planRevision: number,
    dispatchIds: string[],
    actorId: string,
  ) {
    return this.serial(sessionId, async () => {
      const workflow = this.workflows.get(sessionId)
      const plan = this.plans.get(sessionId)
      if (!workflow) throw new HbarError('WORKFLOW_NOT_FOUND', 'Workflow not found')
      const selected = workflow.targetDispatches.filter((dispatch) => dispatchIds.includes(dispatch.dispatchId))
      if (selected.length !== dispatchIds.length)
        throw new HbarError('WORKFLOW_DISPATCH_NOT_FOUND', 'One or more target dispatches do not exist')
      if (
        selected.some(
          (dispatch) =>
            dispatch.actorId !== actorId || dispatch.planId !== planId || dispatch.planRevision !== planRevision,
        )
      )
        throw new HbarError('FORBIDDEN', 'Target dispatch belongs to a different actor or Plan revision')
      if (
        !plan ||
        plan.planId !== planId ||
        plan.revision !== planRevision ||
        plan.phase !== 'active' ||
        !['active', 'verifying'].includes(workflow.status) ||
        selected.some((dispatch) => dispatch.workflowId !== workflow.workflowId)
      )
        return { dispatches: selected, retryDispatchIds: [] }
      const retryable = new Set(['result_unknown', 'dispatching'])
      const ids = new Set(
        selected.filter((dispatch) => retryable.has(dispatch.status)).map((dispatch) => dispatch.dispatchId),
      )
      if (!ids.size) return { dispatches: selected, retryDispatchIds: [] }
      const now = Date.now()
      const next = workflowStateSchema.parse({
        ...workflow,
        revision: workflow.revision + 1,
        targetDispatches: workflow.targetDispatches.map((dispatch) =>
          ids.has(dispatch.dispatchId) ? { ...dispatch, status: 'dispatching' as const, updatedAt: now } : dispatch,
        ),
        updatedAt: now,
      })
      await this.persistWorkflow(next, undefined, { targetDispatchReconciliation: [...ids] })
      return {
        dispatches: next.targetDispatches.filter((dispatch) => dispatchIds.includes(dispatch.dispatchId)),
        retryDispatchIds: [...ids],
      }
    })
  }

  async recordTargetDispatchReceipt(
    sessionId: string,
    dispatchId: string,
    receipt: PeerMessageReceipt,
    runStartSeq?: number,
  ) {
    return this.serial(sessionId, async () => {
      const workflow = this.workflows.get(sessionId)
      if (!workflow) throw new HbarError('WORKFLOW_NOT_FOUND', 'Workflow not found')
      const current = workflow.targetDispatches.find((entry) => entry.dispatchId === dispatchId)
      if (!current) throw new HbarError('WORKFLOW_DISPATCH_NOT_FOUND', 'Target dispatch not found')
      if (
        receipt.senderSessionId !== sessionId ||
        receipt.targetSessionId !== current.targetSessionId ||
        receipt.workspaceId !== current.workspaceId ||
        receipt.idempotencyKey !== current.peerIdempotencyKey ||
        receipt.operationId !== receipt.targetRunId ||
        (receipt.delivery !== 'new_run' && receipt.delivery !== 'queued')
      )
        throw new HbarError('RESULT_UNKNOWN', 'Peer receipt does not match the frozen target dispatch')
      const targetRunStartSeq = runStartSeq ?? current.targetRunStartSeq ?? Math.max(0, receipt.sessionSeq - 1)
      const sameCanonicalReceipt =
        current.operationId === receipt.operationId &&
        current.targetRunId === receipt.targetRunId &&
        current.targetRunStartSeq === targetRunStartSeq &&
        current.delivery === receipt.delivery
      if (sameCanonicalReceipt) return this.snapshot(sessionId)
      if (['succeeded', 'failed', 'cancelled'].includes(current.status)) {
        const resultSummary =
          current.status === 'succeeded'
            ? ((await this.targetRunSummary(current.targetSessionId, receipt.operationId, targetRunStartSeq)) ??
              current.resultSummary)
            : current.resultSummary
        const now = Date.now()
        const next = workflowStateSchema.parse({
          ...workflow,
          revision: workflow.revision + 1,
          targetDispatches: workflow.targetDispatches.map((entry) =>
            entry.dispatchId === dispatchId
              ? {
                  ...entry,
                  targetRunStartSeq,
                  delivery: receipt.delivery === 'new_run' ? ('new_run' as const) : ('queued' as const),
                  ...(current.status === 'succeeded'
                    ? {
                        resultSummary,
                        resultHash: hashValue({
                          runId: receipt.operationId,
                          status: current.terminalRunStatus ?? current.status,
                          error: null,
                          resultSummary,
                        }),
                      }
                    : {}),
                  updatedAt: now,
                }
              : entry,
          ),
          updatedAt: now,
        })
        return this.persistWorkflow(next, undefined, {
          targetDispatchReceiptCursorReconciled: { dispatchId, operationId: receipt.operationId },
        })
      }
      if (
        current.status !== 'stale' &&
        current.status !== 'dispatching' &&
        current.status !== 'result_unknown' &&
        current.status !== 'running' &&
        current.status !== 'queued' &&
        current.status !== 'waiting_approval' &&
        current.status !== 'cancel_requested'
      )
        throw new HbarError('WORKFLOW_DISPATCH_CONFLICT', 'Target dispatch already has a canonical outcome')
      if (current.status === 'stale') {
        const next = workflowStateSchema.parse({
          ...workflow,
          revision: workflow.revision + 1,
          targetDispatches: workflow.targetDispatches.map((entry) =>
            entry.dispatchId === dispatchId
              ? {
                  ...entry,
                  operationId: receipt.operationId,
                  targetRunId: receipt.targetRunId,
                  targetRunStartSeq,
                  delivery: receipt.delivery === 'new_run' ? ('new_run' as const) : ('queued' as const),
                  updatedAt: Date.now(),
                }
              : entry,
          ),
          updatedAt: Date.now(),
        })
        return this.persistWorkflow(next, undefined, {
          targetDispatchReceiptAfterStale: { dispatchId, operationId: receipt.operationId },
        })
      }
      const now = Date.now()
      const next = workflowStateSchema.parse({
        ...workflow,
        revision: workflow.revision + 1,
        targetDispatches: workflow.targetDispatches.map((entry) =>
          entry.dispatchId === dispatchId
            ? {
                ...entry,
                status:
                  entry.targetRunId === receipt.targetRunId
                    ? entry.status
                    : receipt.status === 'queued'
                      ? ('queued' as const)
                      : ('running' as const),
                delivery: receipt.delivery === 'new_run' ? ('new_run' as const) : ('queued' as const),
                operationId: receipt.operationId,
                targetRunId: receipt.targetRunId,
                targetRunStartSeq,
                updatedAt: now,
                errorCode: null,
              }
            : entry,
        ),
        updatedAt: now,
      })
      return this.persistWorkflow(next, undefined, {
        targetDispatchReceipt: { dispatchId, operationId: receipt.operationId },
      })
    })
  }

  async recordTargetDispatchStale(sessionId: string, dispatchId: string, reason: string) {
    return this.serial(sessionId, async () => {
      const workflow = this.workflows.get(sessionId)
      if (!workflow) throw new HbarError('WORKFLOW_NOT_FOUND', 'Workflow not found')
      const dispatch = workflow.targetDispatches.find((entry) => entry.dispatchId === dispatchId)
      if (!dispatch) throw new HbarError('WORKFLOW_DISPATCH_NOT_FOUND', 'Target dispatch not found')
      if (['succeeded', 'failed', 'cancelled'].includes(dispatch.status)) return this.snapshot(sessionId)
      if (dispatch.status === 'stale' && dispatch.errorCode === reason.slice(0, 128)) return this.snapshot(sessionId)
      const now = Date.now()
      const next = workflowStateSchema.parse({
        ...workflow,
        revision: workflow.revision + 1,
        targetDispatches: workflow.targetDispatches.map((entry) =>
          entry.dispatchId === dispatchId
            ? { ...entry, status: 'stale' as const, errorCode: reason.slice(0, 128), updatedAt: now, completedAt: now }
            : entry,
        ),
        updatedAt: now,
      })
      return this.persistWorkflow(next, undefined, { targetDispatchStale: { dispatchId, reason } })
    })
  }

  async recordTargetDispatchFailure(
    sessionId: string,
    dispatchId: string,
    errorCode: string,
    outcome: 'known_failure' | 'unknown',
  ) {
    return this.serial(sessionId, async () => {
      const workflow = this.workflows.get(sessionId)
      if (!workflow) throw new HbarError('WORKFLOW_NOT_FOUND', 'Workflow not found')
      const current = workflow.targetDispatches.find((entry) => entry.dispatchId === dispatchId)
      if (!current) throw new HbarError('WORKFLOW_DISPATCH_NOT_FOUND', 'Target dispatch not found')
      if (['stale', 'succeeded', 'failed', 'cancelled'].includes(current.status)) return this.snapshot(sessionId)
      if (current.operationId)
        throw new HbarError('RESULT_UNKNOWN', 'Accepted target Run status requires canonical reconciliation')
      const now = Date.now()
      const next = workflowStateSchema.parse({
        ...workflow,
        revision: workflow.revision + 1,
        targetDispatches: workflow.targetDispatches.map((entry) =>
          entry.dispatchId === dispatchId
            ? {
                ...entry,
                status: outcome === 'unknown' ? ('result_unknown' as const) : ('failed' as const),
                errorCode,
                updatedAt: now,
                completedAt: outcome === 'known_failure' ? now : null,
              }
            : entry,
        ),
        updatedAt: now,
      })
      return this.persistWorkflow(next, undefined, { targetDispatchFailure: { dispatchId, outcome, errorCode } })
    })
  }

  async recordTargetRunStatus(
    sessionId: string,
    dispatchId: string,
    status: 'queued' | 'running' | 'waiting_approval' | 'cancel_requested' | 'succeeded' | 'failed' | 'cancelled',
    runStatus?: 'completed' | 'failed' | 'cancelled' | 'interrupted',
    error?: string | null,
  ) {
    return this.serial(sessionId, async () => {
      const workflow = this.workflows.get(sessionId)
      const dispatch = workflow?.targetDispatches.find((entry) => entry.dispatchId === dispatchId)
      if (!workflow || !dispatch || !dispatch.operationId)
        throw new HbarError(
          'WORKFLOW_DISPATCH_NOT_FOUND',
          'An accepted target Run is required for status reconciliation',
        )
      if (dispatch.targetRunId !== dispatch.operationId)
        throw new HbarError('RESULT_UNKNOWN', 'Target dispatch operation does not match its Run identity')
      const terminal = ['succeeded', 'failed', 'cancelled'].includes(status)
      if (dispatch.completedAt !== null) {
        if (dispatch.status !== status || (runStatus && dispatch.terminalRunStatus !== runStatus))
          throw new HbarError(
            'RESULT_UNKNOWN',
            'Canonical target Run status conflicts with its recorded terminal result',
          )
        if (status === 'succeeded' && dispatch.resultSummary === null && dispatch.targetRunStartSeq !== null) {
          const resultSummary = await this.targetRunSummary(
            dispatch.targetSessionId,
            dispatch.operationId,
            dispatch.targetRunStartSeq,
          )
          if (resultSummary) {
            const next = workflowStateSchema.parse({
              ...workflow,
              revision: workflow.revision + 1,
              targetDispatches: workflow.targetDispatches.map((entry) =>
                entry.dispatchId === dispatchId
                  ? {
                      ...entry,
                      resultSummary,
                      resultHash: hashValue({
                        runId: dispatch.operationId,
                        status: runStatus ?? status,
                        error: null,
                        resultSummary,
                      }),
                      updatedAt: Date.now(),
                    }
                  : entry,
              ),
              updatedAt: Date.now(),
            })
            return this.persistWorkflow(next, dispatch.operationId, {
              targetRunSummaryReconciled: { dispatchId, operationId: dispatch.operationId },
            })
          }
        }
        return this.snapshot(sessionId)
      }
      const resultSummary = terminal
        ? await this.targetRunSummary(dispatch.targetSessionId, dispatch.operationId, dispatch.targetRunStartSeq)
        : null
      const now = Date.now()
      const next = workflowStateSchema.parse({
        ...workflow,
        revision: workflow.revision + 1,
        targetDispatches: workflow.targetDispatches.map((entry) =>
          entry.dispatchId === dispatchId
            ? {
                ...entry,
                status: entry.status === 'stale' ? ('stale' as const) : status,
                terminalRunStatus: runStatus ?? entry.terminalRunStatus,
                resultSummary:
                  status === 'succeeded' ? resultSummary : error ? error.slice(0, 2_000) : entry.resultSummary,
                resultHash: terminal
                  ? hashValue({
                      runId: dispatch.operationId,
                      status: runStatus ?? status,
                      error: error ?? null,
                      resultSummary,
                    })
                  : entry.resultHash,
                errorCode: status === 'succeeded' ? null : error ? 'TARGET_RUN_TERMINAL' : entry.errorCode,
                updatedAt: now,
                completedAt: terminal ? now : null,
              }
            : entry,
        ),
        updatedAt: now,
      })
      return this.persistWorkflow(next, dispatch.operationId, {
        targetRunReconciled: {
          dispatchId,
          operationId: dispatch.operationId,
          status,
          terminalRunStatus: runStatus ?? null,
        },
      })
    })
  }

  async prepareTargetCancellation(
    sessionId: string,
    planId: string,
    planRevision: number,
    dispatchId: string,
    actorId: string,
  ) {
    return this.serial(sessionId, async () => {
      const workflow = this.workflows.get(sessionId)
      const plan = this.plans.get(sessionId)
      if (!workflow || !plan || plan.planId !== planId || plan.revision !== planRevision)
        throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'The Workflow Plan changed before cancellation')
      const dispatch = workflow.targetDispatches.find((entry) => entry.dispatchId === dispatchId)
      if (!dispatch) throw new HbarError('WORKFLOW_DISPATCH_NOT_FOUND', 'Target dispatch not found')
      if (dispatch.actorId !== actorId) throw new HbarError('FORBIDDEN', 'Target dispatch belongs to a different actor')
      if (
        !dispatch.operationId ||
        !['queued', 'running', 'waiting_approval', 'cancel_requested'].includes(dispatch.status)
      )
        throw new HbarError('WORKFLOW_DISPATCH_CONFLICT', 'Only an accepted target Run can be cancelled')
      if (dispatch.status === 'cancel_requested') return dispatch
      const now = Date.now()
      const next = workflowStateSchema.parse({
        ...workflow,
        revision: workflow.revision + 1,
        targetDispatches: workflow.targetDispatches.map((entry) =>
          entry.dispatchId === dispatchId ? { ...entry, status: 'cancel_requested' as const, updatedAt: now } : entry,
        ),
        updatedAt: now,
      })
      await this.persistWorkflow(next, undefined, {
        targetCancellationIntent: { dispatchId, operationId: dispatch.operationId },
      })
      return next.targetDispatches.find((entry) => entry.dispatchId === dispatchId)!
    })
  }

  async recordTargetCancellation(
    sessionId: string,
    dispatchId: string,
    status: 'cancel_requested' | 'succeeded' | 'cancelled' | 'failed',
    errorCode?: string,
    terminalRunStatus?: 'completed' | 'failed' | 'cancelled' | 'interrupted',
  ) {
    return this.serial(sessionId, async () => {
      const workflow = this.workflows.get(sessionId)
      if (!workflow) throw new HbarError('WORKFLOW_NOT_FOUND', 'Workflow not found')
      const current = workflow.targetDispatches.find((entry) => entry.dispatchId === dispatchId)
      if (!current) throw new HbarError('WORKFLOW_DISPATCH_NOT_FOUND', 'Target dispatch not found')
      const terminal = ['succeeded', 'cancelled', 'failed'].includes(status)
      const resultSummary =
        status === 'succeeded' && current.operationId
          ? await this.targetRunSummary(current.targetSessionId, current.operationId, current.targetRunStartSeq)
          : null
      const now = Date.now()
      const next = workflowStateSchema.parse({
        ...workflow,
        revision: workflow.revision + 1,
        targetDispatches: workflow.targetDispatches.map((entry) =>
          entry.dispatchId === dispatchId
            ? {
                ...entry,
                status: entry.status === 'stale' ? ('stale' as const) : status,
                terminalRunStatus: terminalRunStatus ?? entry.terminalRunStatus,
                resultSummary: status === 'succeeded' ? resultSummary : entry.resultSummary,
                resultHash: terminal
                  ? hashValue({
                      runId: current.operationId,
                      status: terminalRunStatus ?? status,
                      errorCode: errorCode ?? null,
                      resultSummary,
                    })
                  : entry.resultHash,
                errorCode: status === 'succeeded' ? null : (errorCode ?? null),
                updatedAt: now,
                completedAt: terminal ? now : null,
              }
            : entry,
        ),
        updatedAt: now,
      })
      return this.persistWorkflow(next, undefined, { targetCancellationResult: { dispatchId, status } })
    })
  }

  async complete(sessionId: string, expectedRevision: number, runId?: string) {
    return this.serial(sessionId, async () => {
      const current = this.current(sessionId, expectedRevision)
      this.assertCompletable(current)
      this.assertTargetItemsSucceeded(sessionId, current)
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

  async decorate(request: ModelRequest): Promise<ModelRequest> {
    const sessionId = request.context?.sessionId
    const plan = sessionId ? await this.agentPlans.get(sessionId) : null
    const workflow = sessionId ? this.workflows.get(sessionId) : undefined
    if (!workflow || workflow.status === 'completed') {
      const guidance = [
        '<workflow_guidance>',
        'For a multi-step task that needs repository changes, verification, or delegation, maintain one Agent Plan with get_plan and update_plan, then call workflow_focus for its current in_progress step.',
        'Keep simple questions and one-step reads lightweight.',
        '</workflow_guidance>',
      ].join('\n')
      return { ...request, system: `${request.system}\n\n${guidance}` }
    }
    const item = workflow.workItems.find((candidate) => candidate.id === workflow.activeItemId)
    const step = workflow.activeStepIndex === null ? undefined : plan?.plan[workflow.activeStepIndex]
    const currentFocus = Boolean(
      item &&
      step &&
      step.status === 'in_progress' &&
      plan?.revision === workflow.planRevision &&
      hashValue(step.step) === workflow.activeStepTextHash,
    )
    const executable = currentFocus && ['active', 'verifying'].includes(workflow.status)
    const needsFocus =
      workflow.status !== 'cancelled' && (!currentFocus || ['blocked', 'needs_revision'].includes(workflow.status))
    const nextIndex = plan?.plan.findIndex((candidate) => candidate.status === 'in_progress') ?? -1
    const checks =
      item?.acceptanceChecks.filter((check) => check.required && !['passed', 'accepted'].includes(check.status)) ?? []
    const recentFailures = workflow.evidence.filter((entry) => entry.outcome === 'failed').slice(-3)
    const prompt = [
      '<focus_workflow>',
      `Status: ${workflow.status}`,
      `Revision: ${workflow.revision}`,
      ...(workflow.focusRevision === undefined
        ? []
        : [`Focus revision: ${workflow.focusRevision} (stable across read/write bookkeeping)`]),
      `Plan revision: ${workflow.planRevision}`,
      `Current Agent Plan revision: ${plan?.revision ?? 'none'}`,
      `Focus validity: ${currentFocus ? 'current' : 'stale'}`,
      `Completion policy: ${workflow.completionPolicy}`,
      `Item ID: ${item ? escapeXml(item.id) : 'none'}`,
      `Current item: ${item ? escapeXml(item.title) : 'none'}`,
      `Exploration: ${workflow.explorationCount}/${this.config.maxExplorationCalls}`,
      `Allowed read paths: ${item?.scope.readPaths.map(escapeXml).join(', ') || 'none'}`,
      `Allowed write paths: ${item?.scope.writePaths.map(escapeXml).join(', ') || 'none'}`,
      `Allowed tools: ${item?.scope.tools.map(escapeXml).join(', ') || 'none'}`,
      `Required checks: ${escapeXml(JSON.stringify(item?.acceptanceChecks.filter((check) => check.required).map(({ id, description, status, verifier, evidenceId }) => ({ id, description, status, verifier, evidenceId })) ?? []))}`,
      ...(workflow.delegations.length
        ? [
            `Delegations: ${workflow.delegations.map((entry) => `${escapeXml(entry.itemId)}=${entry.status}`).join(', ')}`,
          ]
        : []),
      ...(recentFailures.length
        ? [`Recent failed checks: ${recentFailures.map((entry) => escapeXml(entry.checkId)).join(', ')}`]
        : []),
      'Fresh Host snapshot; do not query again just to repeat these facts. Stay within the authorized task and explicitly expand scope with a reason before outside access.',
      ...(workflow.completionPolicy === 'user'
        ? [
            "Completion requires explicit user acceptance; do not accept on the user's behalf or switch policy to bypass it.",
          ]
        : workflow.completionPolicy === 'review_agent'
          ? ['Completion requires the assigned read-only reviewer; do not substitute your own acceptance.']
          : []),
      ...(workflow.status === 'waiting_user'
        ? ['Await the explicit user acceptance; do not replace the focus to bypass it.']
        : workflow.status === 'cancelled'
          ? ['This Workflow is cancelled; do not resume it without an authorized new task.']
          : []),
      ...(needsFocus
        ? [
            `Next focus step: ${nextIndex < 0 ? 'none' : escapeXml(JSON.stringify({ stepIndex: nextIndex, step: plan?.plan[nextIndex]?.step }))}`,
            'Execution is not ready. Preserve task and acceptance requirements. Use update_plan if no in_progress step exists, then workflow_focus for the current Agent Plan revision. Do not execute the stale scope or request completion using its old versions.',
          ]
        : []),
      ...(executable && item && !checks.length
        ? [
            workflow.focusRevision === undefined
              ? `After verifying the objective, use workflow_update with action="checkpoint", itemId=${JSON.stringify(item.id)}, outcome="complete", expectedRevision=${workflow.revision}, and a concise summary.`
              : `After verifying, use workflow_checkpoint with itemId=${JSON.stringify(item.id)}, outcome="complete", expectedFocusRevision=${workflow.focusRevision}, expectedPlanRevision=${workflow.planRevision}, and a concise summary. If unavailable, use workflow_update action="checkpoint" with current expectedRevision.`,
          ]
        : []),
      ...(executable
        ? [
            'Batch known-input text calls with workflow_execute when available (otherwise sequential tools): authorized scope repair, write, read-back, workflow_checkpoint complete, update_goal complete. Normal gates apply; errors/images stop, earlier effects remain. Only Host-tool-verified checks allow same-batch completion; inspect interpretive checks before completing. Host refuses missing/failed verification; claim success after settlement.',
            'For a known scope-repair path, mark the probe continueOnScopeDenied:true and immediately follow with workflow_expand_scope, then verification and guarded completion in the same batch. Only Host-confirmed pre-execution scope denial may continue; every other failure stops. No user authority is added.',
            'Omitted batch checkpoint/scope versions bind to its starting focus/Plan snapshot; explicit versions remain strict. Scope expansion preserves that identity. A complete checkpoint advances Plan and finishes Workflow at the last step; do not duplicate with update_plan or workflow complete.',
          ]
        : []),
      '</focus_workflow>',
    ].join('\n')
    return appendModelContext(request, prompt)
  }

  private async rejectTool(
    name: string,
    path: string | null,
    reason: string,
    context: ToolContext,
    workflow: WorkflowState,
  ) {
    const fingerprint = hashValue({
      name,
      path,
      reason,
      planRevision: workflow.planRevision,
      activeStepTextHash: workflow.activeStepTextHash,
    })
    const rejected = await this.serial(context.session.id, async () => {
      const current = this.workflows.get(context.session.id)
      if (!current || current.workflowId !== workflow.workflowId) return
      const count = current.rejection?.fingerprint === fingerprint ? current.rejection.count + 1 : 1
      const next = workflowStateSchema.parse({
        ...current,
        revision: current.revision + 1,
        status: count >= 3 ? 'needs_revision' : current.status,
        rejection: { fingerprint, toolName: name, path, reason, count, updatedAt: Date.now() },
        updatedAt: Date.now(),
      })
      await this.persistWorkflow(next, context.run.id, { rejection: { fingerprint, count, reason } })
      return next
    })
    const recovery = rejected?.activeItemId
      ? `To correct scope within the authorized task, use workflow_expand_scope (or workflow_update action="expand_scope") with itemId=${JSON.stringify(rejected.activeItemId)}, expectedRevision=${rejected.revision}, a bounded scope and reason. This does not grant new user permission. If the Agent Plan changed, inspect get_plan and replace workflow_focus instead.`
      : 'Inspect get_workflow to recover the current focus before retrying.'
    throw new HbarError(
      'WORKFLOW_SCOPE_REQUIRED',
      `${reason}${rejected?.status === 'needs_revision' ? '; repeated denial moved the workflow to needs_revision' : ''}\n${recovery}`,
    )
  }

  async beforeTool(name: string, args: Record<string, unknown>, context: ToolContext, tool: ToolDefinition) {
    const targetBinding = this.targetRunBindings.get(context.run.id)
    if (targetBinding) {
      const sourceWorkflow = this.workflows.get(targetBinding.sourceSessionId)
      const dispatch = sourceWorkflow?.targetDispatches.find((entry) => entry.dispatchId === targetBinding.dispatchId)
      const item = sourceWorkflow?.workItems.find((entry) => entry.id === dispatch?.itemId)
      const localWorkflow = this.workflows.get(context.session.id)
      if (
        !sourceWorkflow ||
        !dispatch ||
        !item ||
        (localWorkflow && !['completed', 'cancelled'].includes(localWorkflow.status)) ||
        dispatch.planRevision !== sourceWorkflow.planRevision ||
        hashValue(item.scope) !== hashValue(dispatch.scope) ||
        !['active', 'verifying'].includes(sourceWorkflow.status) ||
        dispatch.targetRunId !== context.run.id ||
        dispatch.status !== 'running'
      )
        throw new HbarError(
          'WORKFLOW_REVISION_CONFLICT',
          'The parent WorkItem scope changed before target tool execution',
        )
      const [sourceSession, targetSession] = await Promise.all([
        this.api.sessions.get(targetBinding.sourceSessionId),
        this.api.sessions.get(context.session.id),
      ])
      if (
        sourceSession.workspaceId !== dispatch.workspaceId ||
        targetSession.workspaceId !== dispatch.workspaceId ||
        sourceSession.archived ||
        targetSession.archived
      )
        throw new HbarError(
          'WORKFLOW_TARGET_STALE',
          'A bound Workflow session moved or was archived before tool execution',
        )
      if (!dispatch.scope.tools.includes(name))
        throw new HbarError('WORKFLOW_SCOPE_REQUIRED', `Tool ${name} is outside the frozen parent WorkItem scope`)
      const paths = workspaceAccessPaths(context.workspace.path, args, tool)
      const rejected = paths.find(({ path, access }) => {
        const allowedPaths =
          access === 'read' ? [...dispatch.scope.readPaths, ...dispatch.scope.writePaths] : dispatch.scope.writePaths
        return !pathAllowed(path, allowedPaths)
      })
      if (rejected)
        throw new HbarError(
          'WORKFLOW_SCOPE_REQUIRED',
          `Path ${rejected.path} is outside the frozen parent WorkItem scope (${rejected.access})`,
        )
      return
    }
    const workflow = this.workflows.get(context.session.id)
    if (workflow && ['blocked', 'needs_revision'].includes(workflow.status) && !REPAIR_TOOLS.has(name))
      throw new HbarError(
        'WORKFLOW_REPAIR_ONLY',
        'Only Goal, Plan and Workflow inspection or revision tools are available during recovery',
      )
    if (CONTROL_TOOLS.has(name)) return
    if (workflow?.status === 'completed' && tool.effect !== 'read') {
      const goal = (await this.goals.get(context.session.id)).goal
      if (goal?.status === 'active' && (goal.goalId ?? goal.threadId) === workflow.goalId)
        throw new HbarError(
          'WORKFLOW_FOCUS_REQUIRED',
          'The current Goal already checkpointed this result. Add or revise its Agent Plan and focus before further workspace mutations; otherwise complete the Goal.',
        )
    }
    if (!workflow || ['completed', 'cancelled'].includes(workflow.status)) return
    if (['blocked', 'needs_revision'].includes(workflow.status))
      throw new HbarError('WORKFLOW_CHECKPOINT_REQUIRED', 'Revise the blocked workflow item before using more tools')
    const plan = await this.agentPlans.get(context.session.id)
    if (!plan || plan.revision !== workflow.planRevision) {
      await this.markNeedsRevision(context.session.id, workflow, 'The authoritative Agent Plan changed.')
      throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'Replace workflow focus for the current Agent Plan revision')
    }
    const item = workflow.workItems.find((candidate) => candidate.id === workflow.activeItemId)
    if (!item) throw new HbarError('WORKFLOW_CHECKPOINT_REQUIRED', 'Select an active workflow item before using tools')
    if (!item.scope.tools.includes(name))
      return this.rejectTool(name, null, `Tool ${name} is outside the current workflow scope`, context, workflow)
    const paths = workspaceAccessPaths(context.workspace.path, args, tool)
    const rejected = paths.find(({ path, access }) => {
      const allowedPaths =
        access === 'read' ? [...item.scope.readPaths, ...item.scope.writePaths] : item.scope.writePaths
      return !pathAllowed(path, allowedPaths)
    })
    if (rejected)
      return this.rejectTool(
        name,
        rejected.path,
        `Path ${rejected.path} is outside the current workflow scope (${rejected.access})`,
        context,
        workflow,
      )
    if (tool.effect !== 'read') {
      this.rememberToolTarget(name, args, context, workflow)
      return
    }
    await this.serial(context.session.id, async () => {
      const current = this.workflows.get(context.session.id)
      if (!current || current.workflowId !== workflow.workflowId || current.focusRevision !== workflow.focusRevision)
        throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'The workflow focus changed during tool admission')
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
      this.rememberToolTarget(name, args, context, next)
    })
  }

  private assertNoMutations(workflow: WorkflowState) {
    if (workflow.pendingMutations?.length)
      throw new HbarError(
        'WORKFLOW_TOOL_IN_FLIGHT',
        'Wait for the current workspace mutation to settle before changing or completing its focus',
      )
    if (
      !['cancelled', 'completed'].includes(workflow.status) &&
      workflow.targetDispatches.some((dispatch) =>
        ['dispatching', 'result_unknown', 'queued', 'running', 'waiting_approval', 'cancel_requested'].includes(
          dispatch.status,
        ),
      )
    )
      throw new HbarError(
        'WORKFLOW_TARGET_IN_FLIGHT',
        'Wait for every dispatched target WorkItem to settle or cancel before changing or completing the parent Plan',
      )
  }

  private toolTargetKey(context: ToolContext) {
    return JSON.stringify([context.session.id, context.run.id, context.callId])
  }

  private rememberToolTarget(
    name: string,
    args: Record<string, unknown>,
    context: ToolContext,
    workflow: WorkflowState,
  ) {
    const key = this.toolTargetKey(context)
    if (context.run.sessionId !== context.session.id || context.session.workspaceId !== context.workspace.id)
      throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'Tool admission identity does not match its session')
    if (this.toolTargets.has(key))
      throw new HbarError('WORKFLOW_TOOL_IN_FLIGHT', 'This tool call already has a workflow admission')
    if (this.toolTargets.size >= 4096)
      throw new HbarError('WORKFLOW_TOOL_IN_FLIGHT', 'Workflow tool admission capacity is full; wait for settlement')
    this.toolTargets.set(key, {
      workflowId: workflow.workflowId,
      focusRevision: workflow.focusRevision ?? workflow.createdAt,
      planRevision: workflow.planRevision,
      itemId: workflow.activeItemId,
      sessionId: context.session.id,
      runId: context.run.id,
      workspaceId: context.workspace.id,
      workspacePath: context.workspace.path,
      name,
      argsHash: hashValue(args),
      executing: false,
    })
  }

  private admittedTool(name: string, args: Record<string, unknown>, context: ToolContext) {
    const target = this.toolTargets.get(this.toolTargetKey(context))
    return target &&
      target.name === name &&
      target.argsHash === hashValue(args) &&
      target.workspaceId === context.workspace.id &&
      target.workspacePath === context.workspace.path &&
      context.run.sessionId === context.session.id &&
      context.session.workspaceId === context.workspace.id
      ? target
      : undefined
  }

  private ownsToolResult(name: string, args: Record<string, unknown>, context: ToolContext, workflow: WorkflowState) {
    const target = this.admittedTool(name, args, context)
    return (
      target?.workflowId === workflow.workflowId &&
      target.focusRevision === (workflow.focusRevision ?? workflow.createdAt) &&
      target.planRevision === workflow.planRevision &&
      target.itemId === workflow.activeItemId
    )
  }

  async beginTool(name: string, args: Record<string, unknown>, context: ToolContext, tool: ToolDefinition) {
    if (context.run.sessionId !== context.session.id || context.session.workspaceId !== context.workspace.id)
      throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'Tool execution identity does not match its session')
    const targetBinding = this.targetRunBindings.get(context.run.id)
    if (targetBinding) {
      await this.serial(targetBinding.sourceSessionId, async () => {
        const current = this.workflows.get(targetBinding.sourceSessionId)
        const dispatch = current?.targetDispatches.find((entry) => entry.dispatchId === targetBinding.dispatchId)
        if (
          !current ||
          !dispatch ||
          dispatch.targetRunId !== context.run.id ||
          dispatch.planRevision !== current.planRevision
        )
          throw new HbarError(
            'WORKFLOW_REVISION_CONFLICT',
            'The parent WorkItem changed before target mutation admission',
          )
        if (!['active', 'verifying'].includes(current.status) || dispatch.status !== 'running')
          throw new HbarError(
            'WORKFLOW_REVISION_CONFLICT',
            'The parent WorkItem was cancelled before target mutation admission',
          )
        const targetSession = await this.api.sessions.get(context.session.id)
        const sourceSession = await this.api.sessions.get(targetBinding.sourceSessionId)
        if (
          targetSession.workspaceId !== dispatch.workspaceId ||
          sourceSession.workspaceId !== dispatch.workspaceId ||
          targetSession.archived ||
          sourceSession.archived
        )
          throw new HbarError(
            'WORKFLOW_TARGET_STALE',
            'A bound Workflow session moved or was archived before mutation admission',
          )
        if (tool.effect === 'read') return
        if (
          current.pendingMutations?.some((entry) => entry.callId === context.callId && entry.runId === context.run.id)
        )
          return
        const next = workflowStateSchema.parse({
          ...current,
          revision: current.revision + 1,
          pendingMutations: [
            ...(current.pendingMutations ?? []),
            { callId: context.callId, runId: context.run.id, toolName: name },
          ],
          updatedAt: Date.now(),
        })
        await this.persistWorkflow(next, context.run.id, {
          targetMutationIntent: { dispatchId: dispatch.dispatchId, callId: context.callId, toolName: name },
        })
      })
      return
    }
    if (CONTROL_TOOLS.has(name)) return
    await this.serial(context.session.id, async () => {
      const current = this.workflows.get(context.session.id)
      if (
        !current ||
        (['completed', 'cancelled'].includes(current.status) && !this.toolTargets.has(this.toolTargetKey(context)))
      )
        return
      if (
        !this.ownsToolResult(name, args, context, current) ||
        ['completed', 'cancelled', 'needs_revision'].includes(current.status)
      )
        throw new HbarError('WORKFLOW_REVISION_CONFLICT', 'The admitted workflow focus changed before tool execution')
      const target = this.admittedTool(name, args, context)
      if (!target || target.executing)
        throw new HbarError('WORKFLOW_TOOL_IN_FLIGHT', 'This workflow admission already began execution')
      target.executing = true
      if (tool.effect === 'read') return
      this.assertNoMutations(current)
      const now = Date.now()
      await this.persistWorkflow(
        workflowStateSchema.parse({
          ...current,
          revision: current.revision + 1,
          status: 'verifying',
          pendingMutations: [{ callId: context.callId, runId: context.run.id, toolName: name }],
          workItems: current.workItems.map((item) =>
            item.id === current.activeItemId
              ? {
                  ...item,
                  status: 'verifying',
                  acceptanceChecks: item.acceptanceChecks.map((check) => ({
                    ...check,
                    status: 'pending',
                    evidenceId: null,
                    updatedAt: now,
                  })),
                }
              : item,
          ),
          updatedAt: now,
        }),
        context.run.id,
        { verificationInvalidated: { callId: context.callId, toolName: name } },
      )
    })
  }

  async settleTool(
    name: string,
    args: Record<string, unknown>,
    result: ToolResult,
    context: ToolContext,
    tool: ToolDefinition,
  ) {
    if (name === 'exit_plan_mode') return
    const targetBinding = this.targetRunBindings.get(context.run.id)
    if (targetBinding) {
      await this.serial(targetBinding.sourceSessionId, async () => {
        const current = this.workflows.get(targetBinding.sourceSessionId)
        if (!current) return
        const pendingMutations = (current.pendingMutations ?? []).filter(
          (entry) => entry.callId !== context.callId || entry.runId !== context.run.id,
        )
        if (pendingMutations.length === (current.pendingMutations?.length ?? 0)) return
        const next = workflowStateSchema.parse({
          ...current,
          revision: current.revision + 1,
          pendingMutations,
          updatedAt: Date.now(),
        })
        await this.persistWorkflow(next, context.run.id, {
          targetMutationSettled: {
            dispatchId: targetBinding.dispatchId,
            callId: context.callId,
            toolName: name,
            isError: Boolean(result.isError),
            resultHash: hashValue({ text: result.text, details: result.details }),
          },
        })
      })
      return
    }
    await this.serial(context.session.id, async () => {
      const current = this.workflows.get(context.session.id)
      if (!CONTROL_TOOLS.has(name) && !this.admittedTool(name, args, context)) return
      if (!current) {
        this.toolTargets.delete(this.toolTargetKey(context))
        return
      }
      const pendingMutations = (current.pendingMutations ?? []).filter(
        (entry) => entry.callId !== context.callId || entry.runId !== context.run.id,
      )
      const mutationSettled = pendingMutations.length !== (current.pendingMutations?.length ?? 0)
      if (
        current.status === 'completed' ||
        !current.activeItemId ||
        (!CONTROL_TOOLS.has(name) && !this.ownsToolResult(name, args, context, current))
      ) {
        if (this.admittedTool(name, args, context)) this.toolTargets.delete(this.toolTargetKey(context))
        if (mutationSettled)
          await this.persistWorkflow(
            workflowStateSchema.parse({
              ...current,
              revision: current.revision + 1,
              pendingMutations,
              updatedAt: Date.now(),
            }),
            context.run.id,
          )
        return
      }
      this.toolTargets.delete(this.toolTargetKey(context))
      const item = current.workItems.find((candidate) => candidate.id === current.activeItemId)
      if (!item) return
      const evaluations = item.acceptanceChecks.flatMap((check) => {
        if (check.verifier.kind === 'user') return []
        const outcome = evaluateToolCheck(check, name, args, result, context.workspace.path)
        return outcome ? [{ check, outcome }] : []
      })
      const marksVerification = tool.effect !== 'read' && !result.isError
      if (!evaluations.length && !marksVerification && !mutationSettled) {
        // Inspection must not invalidate the revision it just returned. Only
        // successful execution progress can clear a recorded scope rejection.
        if (current.rejection && !result.isError && !CONTROL_TOOLS.has(name))
          await this.persistWorkflow(
            workflowStateSchema.parse({
              ...current,
              revision: current.revision + 1,
              rejection: null,
              updatedAt: Date.now(),
            }),
            context.run.id,
          )
        return
      }
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
            return proof
              ? { ...check, status: proof.outcome, evidenceId: proof.evidenceId, updatedAt: now }
              : mutationSettled
                ? { ...check, status: 'pending' as const, evidenceId: null, updatedAt: now }
                : check
          }),
        }
      })
      const workflow = workflowStateSchema.parse({
        ...current,
        revision: current.revision + 1,
        status: blocksItem ? 'needs_revision' : marksVerification ? 'verifying' : current.status,
        workItems,
        evidence: [...current.evidence, ...evidence].slice(-MAX_WORKFLOW_EVIDENCE),
        pendingMutations,
        rejection: null,
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

const focusToolSchema = workflowFocusInputSchema.omit({ sessionId: true })
const delegateToolSchema = workflowDelegateInputSchema.omit({ sessionId: true })
const agentResultToolSchema = z.strictObject({ agentId: z.string().min(1).max(160) })
const reviewSubmitToolSchema = z.strictObject({
  reviewId: z.string().min(1).max(160),
  verdict: z.enum(['approved', 'rejected']),
  summary: z.string().trim().min(1).max(4_000),
})
const applyPatchToolSchema = z.strictObject({
  agentId: z.string().min(1).max(160),
  planRevision: z.number().int().positive(),
})
function toolsFor(runtime: WorkflowRuntime): ToolDefinition[] {
  return [
    {
      name: 'workflow_execute',
      description:
        'Execute 1-8 known-input tools in order through Run scope, permissions and verification gates. Prefer one sequence for write, read-back, checkpoint and Goal completion. Omitted checkpoint/scope versions bind to the starting focus/Plan; explicit versions stay strict. Stops on errors/images, except a call marked continueOnScopeDenied may continue to an immediately following workflow_expand_scope after a Host-confirmed pre-execution scope denial. Earlier effects remain; no recursion or new authority.',
      inputSchema: z.strictObject({
        calls: z
          .array(
            z.strictObject({
              name: z.string().min(1).max(160),
              arguments: z.record(z.string(), z.unknown()),
              continueOnScopeDenied: z.boolean().optional(),
            }),
          )
          .min(1)
          .max(8),
      }),
      effect: 'read',
      workspaceAccess: { kind: 'none' },
      execute: async (args, context) => {
        const current = await runtime.get(context.session.id)
        if (!current.workflow?.focus || !['active', 'verifying'].includes(current.workflow.status))
          throw new HbarError('WORKFLOW_FOCUS_REQUIRED', 'A current executable focus is required for a sequence')
        if (!context.executeSequence)
          throw new HbarError('TOOL_SEQUENCE_UNAVAILABLE', 'This execution context cannot start a nested sequence')
        const calls = z
          .array(
            z.strictObject({
              name: z.string(),
              arguments: z.record(z.string(), z.unknown()),
              continueOnScopeDenied: z.boolean().optional(),
            }),
          )
          .parse(args.calls)
        if (
          calls.some((call, index) => call.continueOnScopeDenied && calls[index + 1]?.name !== 'workflow_expand_scope')
        )
          throw new HbarError(
            'WORKFLOW_SEQUENCE_RECOVERY',
            'A scope-denial continuation must immediately attempt workflow_expand_scope',
          )
        // Bind omitted checkpoint preconditions once, never to a later state produced by child calls.
        const bound = calls.map((call) =>
          (call.name === 'workflow_checkpoint' ||
            (call.name === 'workflow_expand_scope' && call.arguments.expectedRevision === undefined)) &&
          current.workflow?.focusRevision !== undefined
            ? {
                ...call,
                arguments: {
                  expectedFocusRevision: current.workflow.focusRevision,
                  expectedPlanRevision: current.workflow.planRevision,
                  ...call.arguments,
                },
              }
            : call,
        )
        const results = await context.executeSequence(bound)
        return {
          text: JSON.stringify({ completed: results.length, requested: calls.length, results }),
          isError: results.some((result) => result.isError && !result.continuedScopeDenial),
        }
      },
    },
    {
      name: 'get_workflow',
      description: 'Read the authoritative Agent Plan and its current workflow focus, scope, evidence, and revision.',
      inputSchema: z.object({}),
      effect: 'read',
      execute: async (_args, context) => {
        const result = await runtime.get(context.session.id)
        return workflowModelResult(result)
      },
    },
    {
      name: 'workflow_focus',
      description:
        'Set or replace the bounded execution focus for one current Agent Plan step. Tool names and path prefixes are validated before persistence.',
      inputSchema: focusToolSchema,
      effect: 'read',
      execute: async (args, context) => {
        const parsed = focusToolSchema.parse(args)
        const result = await runtime.focus(
          context.session.id,
          parsed.stepIndex,
          parsed.item,
          parsed.completionPolicy,
          parsed.expectedPlanRevision,
        )
        return workflowModelResult(result)
      },
    },
    {
      name: 'workflow_review_submit',
      description: 'Submit the assigned read-only workflow review verdict. Available only to the review agent.',
      inputSchema: reviewSubmitToolSchema,
      effect: 'read',
      workspaceAccess: { kind: 'none' },
      execute: async (args, context) => {
        const parsed = reviewSubmitToolSchema.parse(args)
        const result = await runtime.submitReview(context.session.id, parsed.reviewId, parsed.verdict, parsed.summary)
        return workflowModelResult(result)
      },
    },
    {
      name: 'workflow_update',
      description:
        'Expand the current focus scope, record a checkpoint, complete a verified work item, or complete the workflow. Supply fields for the selected action only; fields belonging to other actions are ignored.',
      inputSchema: workflowUpdateToolSchema,
      effect: 'read',
      execute: async (args, context) => {
        const parsed = workflowUpdateActionSchema.parse(args)
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
                  parsed.evidenceIds,
                  context.run.modelId,
                  context.run.id,
                )
              : await runtime.complete(context.session.id, parsed.expectedRevision, context.run.id)
        return workflowModelResult(result)
      },
    },
    {
      name: 'workflow_checkpoint',
      description:
        'Request a guarded focus checkpoint. May follow Host-tool verification in the same sequential batch; missing/failed checks refuse completion. Focus and Plan versions survive bookkeeping and scope expansion, not replacement. Complete also advances Plan. Evidence comes from matching registered tool settlement, not a workflow_verify tool. Leave unrun checks pending; progress records delivery without claiming completion.',
      inputSchema: workflowCheckpointToolSchema,
      effect: 'read',
      execute: async (args, context) => {
        const parsed = workflowCheckpointToolSchema.parse(args)
        return workflowModelResult(
          await runtime.checkpoint(
            context.session.id,
            parsed.itemId,
            parsed.outcome,
            parsed.summary,
            null,
            { focusRevision: parsed.expectedFocusRevision, planRevision: parsed.expectedPlanRevision },
            parsed.evidenceIds,
            context.run.modelId,
            context.run.id,
          ),
        )
      },
    },
    {
      name: 'workflow_expand_scope',
      description:
        'Correct the current focus scope within the authorized task. Provide bounded paths/tools, a reason, and current expectedFocusRevision plus expectedPlanRevision. Do not supply expectedRevision; refresh workflow state when stale. Does not grant new user permission.',
      inputSchema: workflowExpandScopeToolSchema,
      effect: 'read',
      execute: async (args, context) => {
        const parsed = workflowExpandScopeToolSchema.parse(args)
        const revision = { focusRevision: parsed.expectedFocusRevision, planRevision: parsed.expectedPlanRevision }
        return workflowModelResult(
          await runtime.expandScope(context.session.id, parsed.itemId, parsed.scope, parsed.reason, revision),
        )
      },
    },
    {
      name: 'delegate_work',
      description: 'Delegate independent workflow items to isolated child agents with bounded scopes and budgets.',
      inputSchema: delegateToolSchema,
      effect: 'read',
      execute: async (args, context) => {
        const parsed = delegateToolSchema.parse(args)
        const result = await runtime.delegate(
          context.session.id,
          parsed.itemIds,
          parsed.modelId,
          parsed.tokenBudget,
          parsed.expectedRevision,
        )
        return workflowModelResult(result)
      },
    },
    {
      name: 'get_agent_result',
      description: 'Read the durable result and patch metadata for one agent delegated by this workflow.',
      inputSchema: agentResultToolSchema,
      effect: 'read',
      execute: async (args, context) => {
        const parsed = agentResultToolSchema.parse(args)
        const result = await runtime.agentResult(context.session.id, parsed.agentId)
        return { text: JSON.stringify(result), details: result }
      },
    },
    {
      name: 'apply_agent_patch',
      description: 'Apply a ready isolated agent patch after Host scope, revision, integrity, and conflict checks.',
      inputSchema: applyPatchToolSchema,
      effect: 'write',
      execute: async (args, context) => {
        const parsed = applyPatchToolSchema.parse(args)
        const result = await runtime.applyAgentPatch(context.session.id, parsed.agentId, parsed.planRevision)
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
    requires: { agent: '^1.0.0', git: '^1.0.0', goal: '^1.0.0', plan: '^1.0.0', storage: '^1.0.0' },
    permissions: ['storage'],
  },
  configSchema: workflowConfigSchema,
  async apply(ctx, rawConfig) {
    const api = ctx.hbar.api
    const runtime = new WorkflowRuntime(
      api,
      api.service<GoalService>('goal'),
      api.service<AgentService>('agent'),
      workflowConfigSchema.parse(rawConfig),
      api.service<PlanService>('plan'),
      api.service<GitService>('git'),
    )
    await runtime.restore()
    if (api.restoreMode !== 'projection') await runtime.resumeDelegations()
    provide<WorkflowService>(ctx, 'workflow', runtime)
    api.hooks.on('run.start', (event) => runtime.startReviewer(event))
    api.hooks.on('run.end', (event) => runtime.settleTargetRun(event))
    api.hooks.on('context.build', (request) => runtime.decorate(request))
    api.hooks.on('tool.before', async (event) => {
      await runtime.beforeTool(event.name, event.args, event.context, event.tool)
      return event
    })
    api.hooks.on('tool.settled', (event) =>
      runtime.settleTool(event.name, event.args, event.result, event.context, event.tool),
    )
    api.hooks.on('tool.executing', (event) => runtime.beginTool(event.name, event.args, event.context, event.tool))
    api.hooks.on('goal.beforeComplete', async (event) => ({
      ...event,
      commit: await runtime.guardCompletion(event.sessionId, event.goal.goalId, event.commit),
    }))
    api.hooks.on('goal.beforeContinue', (event) => {
      const policy = runtime.continuationPolicy(event.sessionId)
      return { ...event, ...policy, allowed: event.allowed && policy.allowed }
    })
    api.hooks.on('tools.select', (event) => runtime.selectTools(event))
    // Keep the selected Run manifest stable across focus/scope changes. Current
    // authority is carried by the Host context and enforced by tool.before.
    api.hooks.on('goal.replaced', (event) =>
      runtime.cancelForGoal(event.sessionId, event.previous.goalId ?? event.previous.threadId),
    )
    api.hooks.on('goal.cleared', (event) =>
      runtime.cancelForGoal(event.sessionId, event.previous.goalId ?? event.previous.threadId),
    )
    api.hooks.on('agent.patch', (event) => runtime.handleAgentPatch(event))
    api.hooks.on('agent.settled', (event) => runtime.handleAgentSettled(event))
    for (const tool of toolsFor(runtime)) api.tools.register(tool)
  },
})

export default workflowPlugin
