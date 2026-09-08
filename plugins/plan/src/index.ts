import { z } from 'zod'
import {
  HbarError,
  idSchema,
  planStateSchema,
  planStepSchema,
  runModeSchema,
  userInputQuestionSchema,
  userInputRequestSchema,
} from '@hbar/contracts'
import type { PlanState, PlanStep, RunMode, SessionEvent, UserInputQuestion } from '@hbar/contracts'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { HbarAPI, ModelRequest, ModeService, PlanService, ToolContext, ToolDefinition } from '@hbar/plugin-sdk'
import { PLAN_MODE_INSTRUCTIONS } from './instructions.ts'

const MAX_RESTORE_EVENTS = 100_000
const RESTORE_CONCURRENCY = 8

export const planConfigSchema = z.object({
  maxRestoreEvents: z.number().int().min(1_000).max(MAX_RESTORE_EVENTS).default(MAX_RESTORE_EVENTS),
})
export type PlanConfig = z.infer<typeof planConfigSchema>

const planUpdatedEventSchema = z.object({ plan: planStateSchema })
const planClearedEventSchema = z.object({ sessionId: idSchema })
const modeChangedEventSchema = z.object({ mode: runModeSchema })
const updatePlanSchema = z.object({
  explanation: z.string().max(4_000).optional(),
  plan: z.array(planStepSchema).max(100),
})
const requestUserInputSchema = z.object({ questions: z.array(userInputQuestionSchema).min(1).max(3) })

function escapeXml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

class PlanRuntime implements PlanService {
  private plans = new Map<string, PlanState>()
  private modes = new Map<string, RunMode>()
  private locks = new Map<string, Promise<void>>()
  private hydrated = false

  constructor(
    private api: HbarAPI,
    private config: PlanConfig,
  ) {}

  async restore() {
    const sessions = await this.api.sessions.list()
    for (let offset = 0; offset < sessions.length; offset += RESTORE_CONCURRENCY) {
      await Promise.all(sessions.slice(offset, offset + RESTORE_CONCURRENCY).map((session) => this.restoreSession(session.id)))
    }
    this.hydrated = true
  }

  private async restoreSession(sessionId: string) {
    const events = await this.api.sessions.events(sessionId, 0, this.config.maxRestoreEvents + 1)
    if (events.length > this.config.maxRestoreEvents)
      throw new HbarError('PLAN_RESTORE_LIMIT', `Plan replay for ${sessionId} exceeded ${this.config.maxRestoreEvents} events`)
    for (const event of events) this.applyEvent(sessionId, event)
  }

  private applyEvent(sessionId: string, event: SessionEvent) {
    if (event.type === 'plan.updated') {
      const parsed = planUpdatedEventSchema.safeParse(event.data)
      if (!parsed.success || parsed.data.plan.sessionId !== sessionId)
        throw new HbarError('PLAN_REPLAY', `Invalid plan.updated event in ${sessionId}`)
      this.plans.set(sessionId, parsed.data.plan)
      return
    }
    if (event.type === 'plan.cleared') {
      const parsed = planClearedEventSchema.safeParse(event.data)
      if (!parsed.success || parsed.data.sessionId !== sessionId)
        throw new HbarError('PLAN_REPLAY', `Invalid plan.cleared event in ${sessionId}`)
      this.plans.delete(sessionId)
      return
    }
    if (event.type === 'mode.changed') {
      const parsed = modeChangedEventSchema.safeParse(event.data)
      if (!parsed.success) throw new HbarError('PLAN_REPLAY', `Invalid mode.changed event in ${sessionId}`)
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

  async update(sessionId: string, steps: PlanStep[], explanation?: string | null, turnId?: string | null) {
    return this.serial(sessionId, async () => {
      // Codex accepts an empty checklist; an empty update is the wire-level
      // equivalent of clearing the current plan.
      const parsedSteps = z.array(planStepSchema).max(100).parse(steps)
      const state = planStateSchema.parse({
        sessionId,
        turnId: turnId ?? null,
        explanation: explanation === undefined ? null : explanation,
        plan: parsedSteps,
        updatedAt: Date.now(),
      })
      await this.persistPlan(state, turnId ?? undefined)
      return state
    })
  }

  async clear(sessionId: string) {
    return this.serial(sessionId, async () => {
      if (!this.plans.has(sessionId)) return { cleared: false }
      await this.api.sessions.append(sessionId, 'plan.cleared', { sessionId })
      this.plans.delete(sessionId)
      this.api.notify({ method: 'plan.cleared', params: { sessionId } })
      this.api.changed('plans')
      return { cleared: true }
    })
  }

  async getMode(sessionId: string) {
    await this.ready()
    await this.api.sessions.get(sessionId)
    return { mode: this.modes.get(sessionId) ?? 'default' }
  }

  async setMode(sessionId: string, requested: RunMode) {
    return this.serial(sessionId, async () => {
      const mode = runModeSchema.parse(requested)
      if (this.modes.get(sessionId) === mode) return { mode }
      await this.api.sessions.append(sessionId, 'mode.changed', { mode })
      this.modes.set(sessionId, mode)
      this.api.notify({ method: 'mode.changed', params: { sessionId, mode } })
      this.api.changed('modes')
      return { mode }
    })
  }

  async requestUserInput(
    sessionId: string,
    runId: string,
    callId: string,
    questions: UserInputQuestion[],
    signal: AbortSignal,
  ) {
    return this.api.userInput.request(
      userInputRequestSchema.parse({
        requestId: crypto.randomUUID(),
        sessionId,
        runId,
        callId,
        questions,
        isBlocking: true,
      }),
      signal,
    )
  }

  private async persistPlan(plan: PlanState, runId?: string) {
    await this.api.sessions.append(plan.sessionId, 'plan.updated', { plan }, runId)
    this.plans.set(plan.sessionId, plan)
    this.api.notify({ method: 'plan.updated', params: plan })
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
    const prompt = [
      '<plan_mode>',
      PLAN_MODE_INSTRUCTIONS,
      prior,
      '</plan_mode>',
    ].join('\n')
    return { ...request, system: `${request.system}\n\n${prompt}` }
  }

  enforceReadOnly(name: string, context: ToolContext, tool: ToolDefinition) {
    if (context.run.input.mode !== 'plan') return
    if (name !== 'update_plan' && tool.effect !== 'read')
      throw new HbarError('PLAN_READ_ONLY', `Plan mode cannot execute ${name}; switch back to default mode to make changes`)
  }
}

function planTools(runtime: PlanRuntime): ToolDefinition[] {
  return [
    {
      name: 'update_plan',
      description: 'Update the current TODO/checklist plan. Use concise steps, mark completed work accurately, and keep at most one in_progress step. This tool is not available in Plan mode.',
      inputSchema: updatePlanSchema,
      effect: 'read',
      execute: async (args, context) => {
        if (context.run.input.mode === 'plan')
          throw new HbarError('PLAN_MODE', 'update_plan is a TODO/checklist tool and is not allowed in Plan mode')
        const parsed = updatePlanSchema.parse(args)
        const plan = await runtime.update(context.session.id, parsed.plan, parsed.explanation ?? null, context.run.id)
        return { text: 'Plan updated', details: plan }
      },
    },
    {
      name: 'request_user_input',
      description: 'Request user input for one to three short questions and wait for the response. This tool is only available in Plan mode.',
      inputSchema: requestUserInputSchema,
      effect: 'read',
      execute: async (args, context) => {
        if (context.run.input.mode !== 'plan')
          throw new HbarError('PLAN_MODE', 'request_user_input is unavailable in Default mode')
        const parsed = requestUserInputSchema.parse(args)
        const response = await runtime.requestUserInput(
          context.session.id,
          context.run.id,
          context.callId,
          parsed.questions,
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
    provide<PlanService>(ctx, 'plan', runtime)
    provide<ModeService>(ctx, 'mode', {
      get: (sessionId) => runtime.getMode(sessionId),
      set: (sessionId, mode) => runtime.setMode(sessionId, mode),
    })
    ctx.hbar.api.hooks.on('context.build', (request) => runtime.decorate(request))
    ctx.hbar.api.hooks.on('tool.before', ({ name, context, tool }) => runtime.enforceReadOnly(name, context, tool))
    for (const tool of planTools(runtime)) ctx.hbar.api.tools.register(tool)
  },
})

export { PlanRuntime }
export default planPlugin
