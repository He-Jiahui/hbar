import { z } from 'zod'
import {
  HbarError,
  idSchema,
  planStateSchema,
  planStepSchema,
  runModeSchema,
  userInputOptionSchema,
  userInputPurposeSchema,
  userInputQuestionSchema,
  userInputRequestSchema,
  automationStateSchema,
} from '@hbar/contracts'
import type {
  AutomationState,
  PlanState,
  PlanStep,
  Run,
  RunMode,
  SessionEvent,
  UserInputQuestion,
} from '@hbar/contracts'
import { definePlugin, provide, readSessionEventPages } from '@hbar/plugin-sdk'
import type { HbarAPI, ModelRequest, ModeService, PlanService, ToolContext, ToolDefinition } from '@hbar/plugin-sdk'
import { PLAN_MODE_INSTRUCTIONS } from './instructions.ts'

const MAX_RESTORE_EVENTS = 100_000
const RESTORE_CONCURRENCY = 8

export const planConfigSchema = z.object({
  maxRestoreEvents: z.number().int().min(1_000).max(MAX_RESTORE_EVENTS).default(MAX_RESTORE_EVENTS),
  // Codex keeps the synchronous control tool Plan-only by default. Hosts may
  // explicitly enable it in Default mode for compatibility with that feature.
  allowDefaultModeRequestUserInput: z.boolean().default(true),
})
export type PlanConfig = z.infer<typeof planConfigSchema>

const restoredPlanSchema = planStateSchema.extend({ revision: z.number().int().positive().optional() })
const planUpdatedEventSchema = z.object({ plan: restoredPlanSchema })
const planClearedEventSchema = z.object({ sessionId: idSchema, revision: z.number().int().positive().optional() })
const modeChangedEventSchema = z.object({
  mode: runModeSchema,
  exitRunId: idSchema.optional(),
  callId: idSchema.optional(),
})
const planExitResolvedEventSchema = z.object({
  approval: z.object({
    sessionId: idSchema,
    runId: idSchema,
    callId: idSchema,
    tool: z.literal('exit_plan_mode'),
    status: z.enum(['allowed', 'denied']),
  }),
  mode: z.literal('default').nullable(),
  exitRunId: idSchema,
  callId: idSchema,
})
const exitPlanModeSchema = z.strictObject({ plan: z.string().trim().min(1).max(20_000) })
const updatePlanSchema = z.object({
  explanation: z.string().max(4_000).optional(),
  plan: z.array(planStepSchema).max(100),
})
const savePlanSchema = z.object({
  explanation: z.string().max(4_000).optional(),
  plan: z.array(planStepSchema).max(100),
})
// Keep model-facing optional fields optional in JSON Schema. Zod defaults are
// useful for wire normalization but otherwise make providers treat them as
// required properties before the tool call reaches the runtime.
const requestUserInputQuestionSchema = z.object({
  id: idSchema,
  header: z.string().trim().min(1).max(12),
  question: z.string().trim().min(1).max(4_000),
  options: z.array(userInputOptionSchema).max(3).optional(),
  isOther: z.boolean().optional(),
  isSecret: z.boolean().optional(),
  purpose: userInputPurposeSchema.optional(),
})
const requestUserInputSchema = z.object({ questions: z.array(requestUserInputQuestionSchema).min(1).max(3) })

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

class PlanRuntime implements PlanService {
  private plans = new Map<string, PlanState>()
  private sequences = new Map<string, number>()
  private revisions = new Map<string, number>()
  private modes = new Map<string, RunMode>()
  private exitedRuns = new Map<string, string>()
  private locks = new Map<string, Promise<void>>()
  private hydrated = false

  idleCheckpoint() {
    return { supported: true, requests: 0, resources: 0, background: this.locks.size, unconfirmed: 0 }
  }
  constructor(
    private api: HbarAPI,
    private config: PlanConfig,
  ) {}

  async restore() {
    const sessions = await this.api.sessions.list()
    for (let offset = 0; offset < sessions.length; offset += RESTORE_CONCURRENCY) {
      await Promise.all(
        sessions.slice(offset, offset + RESTORE_CONCURRENCY).map((session) => this.restoreSession(session.id)),
      )
    }
    this.hydrated = true
  }

  private async restoreSession(sessionId: string) {
    for await (const page of readSessionEventPages(this.api.sessions, {
      sessionId,
      types: ['plan_exit.resolved', 'plan.updated', 'plan.cleared', 'mode.changed'],
      limit: 500,
      maxReplyBytes: 1_048_576,
    })) {
      if (page.totalEventCount > this.config.maxRestoreEvents)
        throw new HbarError(
          'PLAN_RESTORE_LIMIT',
          `Plan replay for ${sessionId} exceeded ${this.config.maxRestoreEvents} events`,
        )
      for (const item of page.items) if (item.kind === 'event') this.applyEvent(sessionId, item.event)
    }
  }
  async refreshSession(sessionId: string): Promise<void> {
    await this.serial(sessionId, async () => {
      this.plans.delete(sessionId)
      this.sequences.delete(sessionId)
      this.revisions.delete(sessionId)
      this.modes.delete(sessionId)
      for (const [runId, owner] of this.exitedRuns) if (owner === sessionId) this.exitedRuns.delete(runId)
      await this.restoreSession(sessionId)
    })
  }

  private applyEvent(sessionId: string, event: SessionEvent) {
    if (event.type === 'plan_exit.resolved') {
      const parsed = planExitResolvedEventSchema.safeParse(event.data)
      if (
        !parsed.success ||
        event.sessionId !== sessionId ||
        parsed.data.approval.sessionId !== sessionId ||
        parsed.data.approval.runId !== event.runId ||
        parsed.data.exitRunId !== event.runId ||
        parsed.data.callId !== parsed.data.approval.callId ||
        (parsed.data.approval.status === 'allowed') !== (parsed.data.mode === 'default')
      )
        throw new HbarError('PLAN_REPLAY', `Invalid plan_exit.resolved event in ${sessionId}`)
      if (parsed.data.mode === 'default') {
        this.exitedRuns.set(parsed.data.exitRunId, sessionId)
        this.modes.set(sessionId, 'default')
      }
      return
    }
    if (event.type === 'plan.updated') {
      this.sequences.set(sessionId, event.seq)
      const parsed = planUpdatedEventSchema.safeParse(event.data)
      if (!parsed.success || parsed.data.plan.sessionId !== sessionId)
        throw new HbarError('PLAN_REPLAY', `Invalid plan.updated event in ${sessionId}`)
      const previousRevision = this.revisions.get(sessionId) ?? 0
      const revision = parsed.data.plan.revision ?? previousRevision + 1
      this.revisions.set(sessionId, Math.max(previousRevision, revision))
      this.plans.set(
        sessionId,
        planStateSchema.parse({
          ...parsed.data.plan,
          revision,
        }),
      )
      return
    }
    if (event.type === 'plan.cleared') {
      this.sequences.set(sessionId, event.seq)
      const parsed = planClearedEventSchema.safeParse(event.data)
      if (!parsed.success || parsed.data.sessionId !== sessionId)
        throw new HbarError('PLAN_REPLAY', `Invalid plan.cleared event in ${sessionId}`)
      this.plans.delete(sessionId)
      this.revisions.set(sessionId, Math.max(this.revisions.get(sessionId) ?? 0, parsed.data.revision ?? 0))
      return
    }
    if (event.type === 'mode.changed') {
      const parsed = modeChangedEventSchema.safeParse(event.data)
      if (!parsed.success) throw new HbarError('PLAN_REPLAY', `Invalid mode.changed event in ${sessionId}`)
      if (parsed.data.exitRunId) {
        if (parsed.data.mode !== 'default' || !parsed.data.callId || event.runId !== parsed.data.exitRunId)
          throw new HbarError('PLAN_REPLAY', `Invalid Plan exit event in ${sessionId}`)
        this.exitedRuns.set(parsed.data.exitRunId, sessionId)
      }
      this.modes.set(sessionId, parsed.data.mode)
    }
  }

  private async ready() {
    if (!this.hydrated) throw new HbarError('PLAN_UNAVAILABLE', 'Plan service has not finished restoring state')
  }

  private async serial<T>(sessionId: string, operation: () => Promise<T>) {
    const previous = this.locks.get(sessionId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => {
      release = resolve
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

  async get(sessionId: string) {
    await this.ready()
    await this.api.sessions.get(sessionId)
    return this.plans.get(sessionId) ?? null
  }

  async snapshot(sessionId: string) {
    await this.ready()
    await this.api.sessions.get(sessionId)
    return { value: this.plans.get(sessionId) ?? null, seq: this.sequences.get(sessionId) ?? 0 }
  }

  async withRevision(sessionId: string, revision: number | null, commit: () => Promise<void>) {
    return this.serial(sessionId, async () => {
      if ((this.plans.get(sessionId)?.revision ?? null) !== revision)
        throw new HbarError('PLAN_REVISION_CONFLICT', 'The plan changed before the dependent update was committed')
      await commit()
    })
  }

  async update(
    sessionId: string,
    steps: PlanStep[],
    explanation?: string | null,
    turnId?: string | null,
    expectedRevision?: number,
  ) {
    return this.serial(sessionId, async () => {
      const current = this.plans.get(sessionId)
      if (expectedRevision !== undefined && expectedRevision !== (current?.revision ?? 0))
        throw new HbarError('PLAN_REVISION_CONFLICT', 'The plan changed before this update was applied')
      // Codex accepts an empty checklist; an empty update is the wire-level
      // equivalent of clearing the current plan.
      const parsedSteps = z.array(planStepSchema).max(100).parse(steps)
      if (parsedSteps.filter((step) => step.status === 'in_progress').length > 1)
        throw new HbarError('PLAN_INVALID', 'An Agent Plan can have at most one in-progress step')
      const state = planStateSchema.parse({
        sessionId,
        revision: (this.revisions.get(sessionId) ?? 0) + 1,
        turnId: turnId ?? null,
        explanation: explanation === undefined ? null : explanation,
        plan: parsedSteps,
        updatedAt: Date.now(),
      })
      await this.persistPlan(state, turnId ?? undefined)
      return state
    })
  }

  async clear(sessionId: string, expectedRevision?: number) {
    return this.serial(sessionId, async () => {
      const current = this.plans.get(sessionId)
      if (expectedRevision !== undefined && expectedRevision !== (current?.revision ?? 0))
        throw new HbarError('PLAN_REVISION_CONFLICT', 'The plan changed before this update was applied')
      if (!current) return { cleared: false }
      const revision = (this.revisions.get(sessionId) ?? 0) + 1
      const event = await this.api.sessions.append(sessionId, 'plan.cleared', { sessionId, revision })
      this.plans.delete(sessionId)
      this.sequences.set(sessionId, event.seq)
      this.revisions.set(sessionId, revision)
      this.api.notify({ method: 'plan.cleared', params: { sessionId, seq: event.seq } })
      this.api.changed('plans')
      return { cleared: true }
    })
  }

  async getMode(sessionId: string) {
    await this.ready()
    await this.api.sessions.get(sessionId)
    return { mode: this.modes.get(sessionId) ?? 'default' }
  }

  effectiveMode(run: Run): RunMode {
    return this.exitedRuns.get(run.id) === run.sessionId ? 'default' : (run.input.mode ?? 'default')
  }

  async commitExit<T extends { modeEvent: SessionEvent | null }>(sessionId: string, commit: () => Promise<T>) {
    return this.serial(sessionId, async () => {
      const result = await commit()
      const event = result.modeEvent
      if (!event || event.sessionId !== sessionId || event.type !== 'plan_exit.resolved')
        throw new HbarError('PLAN_EXIT_INVALID', 'The Plan exit transition was not committed')
      const parsed = planExitResolvedEventSchema.safeParse(event.data)
      if (!parsed.success || parsed.data.mode !== 'default' || parsed.data.approval.status !== 'allowed')
        throw new HbarError('PLAN_EXIT_INVALID', 'The Plan exit transition was not approved')
      this.applyEvent(sessionId, event)
      this.api.notify({ method: 'mode.changed', params: { sessionId, mode: 'default' } })
      this.api.sessions.wake(sessionId)
      this.api.changed('modes')
      return result
    })
  }

  async setMode(sessionId: string, requested: RunMode) {
    return this.serial(sessionId, async () => {
      const mode = runModeSchema.parse(requested)
      if (this.modes.get(sessionId) === mode) return { mode }
      await this.api.sessions.append(sessionId, 'mode.changed', { mode })
      this.modes.set(sessionId, mode)
      this.api.notify({ method: 'mode.changed', params: { sessionId, mode } })
      this.api.sessions.wake(sessionId)
      this.api.changed('modes')
      return { mode }
    })
  }

  async requestUserInput(
    sessionId: string,
    runId: string,
    callId: string,
    mode: RunMode,
    questions: UserInputQuestion[],
    signal: AbortSignal,
  ) {
    if (!this.canRequestUserInput(mode))
      throw new HbarError(
        'PLAN_MODE',
        `request_user_input is unavailable in ${mode === 'plan' ? 'Plan' : 'Default'} mode`,
      )
    const normalizedQuestions = questions.map((question) => ({
      ...question,
      // Codex defaults these optional controls to false on the wire. Preserve
      // an explicit true value so providers can opt into a free-form choice.
      isOther: question.isOther ?? false,
      isSecret: question.isSecret ?? false,
    }))
    return this.api.userInput.request(
      userInputRequestSchema.parse({
        requestId: crypto.randomUUID(),
        sessionId,
        runId,
        callId,
        questions: normalizedQuestions,
        isBlocking: true,
        autoResolutionMs: undefined,
      }),
      signal,
    )
  }

  canRequestUserInput(mode: RunMode) {
    return mode === 'plan' || (mode === 'default' && this.config.allowDefaultModeRequestUserInput)
  }

  requestUserInputDescription() {
    return this.config.allowDefaultModeRequestUserInput
      ? 'Request user input for one to three short questions and wait for the response. Set purpose=decision only for task preferences, fact for missing user information, or authorization for permission changes. Mark secrets with isSecret. Facts, secrets, authorization and unclassified legacy questions require a human. Mark exactly one preferred choice recommended when applicable. Available in Default or Plan mode.'
      : 'Request user input for one to three short questions and wait for the response. Set purpose=decision only for task preferences, fact for missing user information, or authorization for permission changes. Mark secrets with isSecret. Facts, secrets, authorization and unclassified legacy questions require a human. Mark exactly one preferred choice recommended when applicable. Available in Plan mode.'
  }

  private async persistPlan(plan: PlanState, runId?: string) {
    const event = await this.api.sessions.append(plan.sessionId, 'plan.updated', { plan }, runId)
    this.plans.set(plan.sessionId, plan)
    this.sequences.set(plan.sessionId, event.seq)
    this.revisions.set(plan.sessionId, plan.revision)
    this.api.notify({ method: 'plan.updated', params: { ...plan, seq: event.seq } })
    this.api.changed('plans')
  }

  decorate(request: ModelRequest): ModelRequest {
    if (request.context?.mode !== 'plan') return request
    const current = this.plans.get(request.context.sessionId)
    const prior = current
      ? [
          'Current saved plan:',
          ...current.plan.map((step, index) => `${index + 1}. [${step.status}] ${escapeXml(step.step)}`),
          ...(current.explanation ? [`Notes: ${escapeXml(current.explanation)}`] : []),
        ].join('\n')
      : 'There is no saved plan yet.'
    const prompt = ['<plan_mode>', PLAN_MODE_INSTRUCTIONS, prior, '</plan_mode>'].join('\n')
    return { ...request, system: `${request.system}\n\n${prompt}` }
  }

  enforceReadOnly(name: string, context: ToolContext, tool: ToolDefinition) {
    const mode = this.effectiveMode(context.run)
    if (name === 'exit_plan_mode') {
      if (mode !== 'plan' || context.parentCallId)
        throw new HbarError('PLAN_MODE', 'Exit Plan mode is available only as a direct call in a Plan run')
      return
    }
    if (mode !== 'plan') return
    const stateMutation = ['create_goal', 'update_goal', 'set_budget', 'update_plan'].includes(name)
    if (stateMutation || (name !== 'save_plan' && tool.effect !== 'read'))
      throw new HbarError(
        'PLAN_READ_ONLY',
        `Plan mode cannot execute ${name}; switch back to default mode to make changes`,
      )
  }
}

function planTools(runtime: PlanRuntime): ToolDefinition[] {
  return [
    {
      name: 'exit_plan_mode',
      description:
        'Present the complete Markdown plan for explicit user approval. Approval exits Plan mode and continues this same Run in Default mode; denial returns feedback and keeps planning.',
      inputSchema: exitPlanModeSchema,
      effect: 'process',
      humanApproval: 'required',
      execute: async () => ({ text: 'Plan approved. Continue this Run in Default mode.' }),
    },
    {
      name: 'get_plan',
      description:
        'Read the authoritative Agent Plan and its current revision. Returns null when no plan has been published.',
      inputSchema: z.object({}),
      effect: 'read',
      execute: async (_args, context) => {
        const plan = await runtime.get(context.session.id)
        return { text: JSON.stringify(plan), details: plan }
      },
    },
    {
      name: 'update_plan',
      description:
        'Update the current TODO/checklist plan. Use concise steps, mark completed work accurately, and keep at most one in_progress step. This tool is not available in Plan mode.',
      inputSchema: updatePlanSchema,
      effect: 'read',
      execute: async (args, context) => {
        if (runtime.effectiveMode(context.run) === 'plan')
          throw new HbarError('PLAN_MODE', 'update_plan is a TODO/checklist tool and is not allowed in Plan mode')
        const parsed = updatePlanSchema.parse(args)
        const plan = await runtime.update(context.session.id, parsed.plan, parsed.explanation ?? null, context.run.id)
        return { text: 'Plan updated', details: plan }
      },
    },
    {
      name: 'save_plan',
      description:
        'Save a structured implementation plan while in Plan mode. This only persists the plan and never changes workspace files.',
      inputSchema: savePlanSchema,
      effect: 'read',
      execute: async (args, context) => {
        if (context.run.input.mode !== 'plan')
          throw new HbarError('PLAN_MODE', 'save_plan is only available in Plan mode')
        const parsed = savePlanSchema.parse(args)
        const plan = await runtime.update(context.session.id, parsed.plan, parsed.explanation ?? null, context.run.id)
        return { text: 'Structured plan saved', details: plan }
      },
    },
    {
      name: 'request_user_input',
      description: runtime.requestUserInputDescription(),
      inputSchema: requestUserInputSchema,
      effect: 'read',
      execute: async (args, context) => {
        const mode = runtime.effectiveMode(context.run)
        if (!runtime.canRequestUserInput(mode))
          throw new HbarError(
            'PLAN_MODE',
            `request_user_input is unavailable in ${mode === 'plan' ? 'Plan' : 'Default'} mode`,
          )
        const parsed = requestUserInputSchema.parse(args)
        const response = await runtime.requestUserInput(
          context.session.id,
          context.run.id,
          context.callId,
          mode,
          parsed.questions.map((question) => userInputQuestionSchema.parse(question)),
          context.signal,
        )
        return { text: JSON.stringify(response), details: response }
      },
    },
  ]
}

export const planPlugin = definePlugin({
  manifest: {
    id: 'plan.codex',
    packageName: '@hbar/plan',
    name: 'Codex plans',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    description: 'Durable plans and read-only planning mode',
    scope: 'host',
    required: true,
    provides: { plan: '1.0.0', mode: '1.0.0' },
    requires: { storage: '^1.0.0' },
    permissions: ['storage'],
  },
  configSchema: planConfigSchema,
  async apply(ctx, rawConfig) {
    const runtime = new PlanRuntime(ctx.hbar.api, planConfigSchema.parse(rawConfig))
    await runtime.restore()
    ctx.hbar.api.runtimeIdle?.register(() => runtime.idleCheckpoint())
    provide<PlanService>(ctx, 'plan', runtime)
    provide<ModeService>(ctx, 'mode', {
      get: (sessionId) => runtime.getMode(sessionId),
      set: (sessionId, mode) => runtime.setMode(sessionId, mode),
      effectiveMode: (run) => runtime.effectiveMode(run),
      commitExit: (sessionId, commit) => runtime.commitExit(sessionId, commit),
    })
    ctx.hbar.api.hooks.on('context.build', (request) => runtime.decorate(request))
    ctx.hbar.api.hooks.on('tool.admitting', ({ name, context, tool }) => runtime.enforceReadOnly(name, context, tool))
    ctx.hbar.api.hooks.on('run.end', async ({ sessionId, run, status }) => {
      if (status !== 'completed' || run.input.mode !== 'plan') return
      const current = await runtime.get(sessionId)
      if (!current?.plan.length) return
      let automation: AutomationState | undefined
      for await (const page of readSessionEventPages(ctx.hbar.api.sessions, {
        sessionId,
        types: ['automation.changed'],
        limit: 500,
        maxReplyBytes: 1_048_576,
      })) {
        for (const item of page.items) {
          if (item.kind !== 'event') continue
          const parsed = automationStateSchema.safeParse(item.event.data)
          if (parsed.success) automation = parsed.data
        }
      }
      if (!automation?.goalEnabled) return
      const objective = [current.explanation, ...current.plan.map((step, index) => `${index + 1}. ${step.step}`)]
        .filter(Boolean)
        .join('\n')
      await ctx.hbar.api.hooks.dispatch('plan.implementationRequested', {
        sessionId,
        run,
        objective,
        unattended: automation.unattended,
      })
    })
    ctx.hbar.api.hooks.on('goal.replaced', async ({ sessionId }) => {
      await runtime.clear(sessionId)
    })
    ctx.hbar.api.hooks.on('goal.cleared', async ({ sessionId }) => {
      await runtime.clear(sessionId)
    })
    for (const tool of planTools(runtime)) ctx.hbar.api.tools.register(tool)
  },
})

export { PlanRuntime }
export default planPlugin
