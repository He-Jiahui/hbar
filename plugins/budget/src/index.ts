import { z } from 'zod'
import { HbarError, idSchema, usageSchema } from '@hbar/contracts'
import type { SessionEvent, Usage } from '@hbar/contracts'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { HbarAPI, HookEvents, ModelRequest, ToolDefinition } from '@hbar/plugin-sdk'

const MAX_RESTORE_EVENTS = 100_000
const MAX_ACCOUNTED_RUNS = 512

export const budgetPhaseSchema = z.enum(['active', 'exhausted', 'completed', 'stopped'])
export type BudgetPhase = z.infer<typeof budgetPhaseSchema>

export const sessionBudgetSchema = z.object({
  sessionId: idSchema,
  budgetId: idSchema,
  limit: z.number().int().positive(),
  phase: budgetPhaseSchema,
  usedTokens: z.number().int().nonnegative(),
  remainingTokens: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type SessionBudget = z.infer<typeof sessionBudgetSchema>

const persistedBudgetSchema = sessionBudgetSchema.extend({
  accountedRuns: z.array(idSchema).max(MAX_ACCOUNTED_RUNS).default([]),
})
type PersistedBudget = z.infer<typeof persistedBudgetSchema>

const budgetEventSchema = z.object({ budget: persistedBudgetSchema })
const budgetClearedEventSchema = z.object({ sessionId: idSchema })
const createBudgetArgs = z.object({ limit: z.number().int().positive() })
const getBudgetArgs = z.object({})

function publicBudget(value: PersistedBudget): SessionBudget {
  const { accountedRuns: _accountedRuns, ...budget } = value
  return budget
}

function tokenDelta(events: SessionEvent[], runId: string): number {
  let total = 0
  for (const event of events) {
    if (event.runId !== runId || event.type !== 'usage.recorded') continue
    const parsed = usageSchema.safeParse(event.data)
    if (!parsed.success) continue
    const usage: Usage = parsed.data
    total += Math.max(0, usage.input - usage.cacheRead) + usage.output
  }
  return Math.max(0, Math.round(total))
}

function withPhase(budget: PersistedBudget): PersistedBudget {
  const phase: BudgetPhase = budget.phase === 'active' || budget.phase === 'exhausted'
    ? budget.usedTokens >= budget.limit ? 'exhausted' : 'active'
    : budget.phase
  return {
    ...budget,
    phase,
    remainingTokens: Math.max(0, budget.limit - budget.usedTokens),
  }
}

export class BudgetRuntime {
  private budgets = new Map<string, PersistedBudget>()
  private locks = new Map<string, Promise<void>>()
  private hydrated = false

  constructor(
    private api: HbarAPI,
    private maxLimit: number,
  ) {}

  async restore() {
    const sessions = await this.api.sessions.list()
    for (let offset = 0; offset < sessions.length; offset += 8) {
      await Promise.all(sessions.slice(offset, offset + 8).map((session) => this.restoreSession(session.id)))
    }
    this.hydrated = true
  }

  private async restoreSession(sessionId: string) {
    const events = await this.api.sessions.events(sessionId, 0, MAX_RESTORE_EVENTS + 1)
    if (events.length > MAX_RESTORE_EVENTS)
      throw new HbarError('BUDGET_RESTORE_LIMIT', `Budget replay for ${sessionId} exceeded ${MAX_RESTORE_EVENTS} events`)
    for (const event of events) {
      if (event.type === 'budget.cleared') {
        const parsed = budgetClearedEventSchema.safeParse(event.data)
        if (!parsed.success || parsed.data.sessionId !== sessionId)
          throw new HbarError('BUDGET_REPLAY', `Invalid budget.cleared event in ${sessionId}`)
        this.budgets.delete(sessionId)
        continue
      }
      if (!['budget.created', 'budget.updated', 'budget.accounted'].includes(event.type)) continue
      const parsed = budgetEventSchema.safeParse(event.data)
      if (!parsed.success || parsed.data.budget.sessionId !== sessionId)
        throw new HbarError('BUDGET_REPLAY', `Invalid ${event.type} event in ${sessionId}`)
      this.budgets.set(sessionId, withPhase(parsed.data.budget))
    }
  }

  private async ready() {
    if (!this.hydrated) throw new HbarError('BUDGET_UNAVAILABLE', 'Budget service has not finished restoring state')
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

  async get(sessionId: string): Promise<SessionBudget | null> {
    await this.ready()
    await this.api.sessions.get(sessionId)
    const budget = this.budgets.get(sessionId)
    return budget ? publicBudget(budget) : null
  }

  async set(sessionId: string, requestedLimit: number): Promise<SessionBudget> {
    return this.serial(sessionId, async () => {
      if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > this.maxLimit)
        throw new HbarError('BUDGET_INVALID', `Budget limit must be an integer between 1 and ${this.maxLimit}`)
      const prior = this.budgets.get(sessionId)
      if (prior && prior.phase === 'completed') throw new HbarError('BUDGET_COMPLETED', 'Completed budgets cannot be changed')
      if (prior && prior.phase === 'stopped') throw new HbarError('BUDGET_STOPPED', 'Stopped budgets cannot be changed')
      if (prior && requestedLimit < prior.limit)
        throw new HbarError('BUDGET_DECREASE', 'An active budget can only be increased')
      const now = Date.now()
      const next: PersistedBudget = withPhase({
        sessionId,
        budgetId: prior?.budgetId ?? crypto.randomUUID(),
        limit: requestedLimit,
        phase: prior?.phase ?? 'active',
        usedTokens: prior?.usedTokens ?? 0,
        remainingTokens: Math.max(0, requestedLimit - (prior?.usedTokens ?? 0)),
        revision: (prior?.revision ?? 0) + 1,
        createdAt: prior?.createdAt ?? now,
        updatedAt: now,
        accountedRuns: prior?.accountedRuns ?? [],
      })
      await this.persist(sessionId, next, prior ? 'budget.updated' : 'budget.created')
      return publicBudget(next)
    })
  }

  async clear(sessionId: string): Promise<{ cleared: boolean }> {
    return this.serial(sessionId, async () => {
      const cleared = this.budgets.has(sessionId)
      if (cleared) {
        await this.api.sessions.append(sessionId, 'budget.cleared', { sessionId })
        this.budgets.delete(sessionId)
        this.api.notify({ method: 'budget.cleared', params: { sessionId } })
        this.api.changed('budgets')
      }
      return { cleared }
    })
  }

  async accountRun(event: HookEvents['run.end']) {
    return this.serial(event.sessionId, async () => {
      const prior = this.budgets.get(event.sessionId)
      if (!prior || prior.accountedRuns.includes(event.runId)) return
      const events = await this.api.sessions.events(event.sessionId, 0, MAX_RESTORE_EVENTS)
      const delta = tokenDelta(events, event.runId)
      const next = withPhase({
        ...prior,
        usedTokens: prior.usedTokens + delta,
        remainingTokens: Math.max(0, prior.limit - prior.usedTokens - delta),
        revision: prior.revision + 1,
        updatedAt: Date.now(),
        accountedRuns: [...prior.accountedRuns, event.runId].slice(-MAX_ACCOUNTED_RUNS),
      })
      await this.persist(event.sessionId, next, 'budget.accounted', event.runId)
    })
  }

  decorate(request: ModelRequest): ModelRequest {
    const sessionId = request.context?.sessionId
    const budget = sessionId ? this.budgets.get(sessionId) : undefined
    if (!budget) return request
    if (budget.phase === 'exhausted')
      throw new HbarError('BUDGET_EXHAUSTED', `Token budget exhausted (${budget.usedTokens}/${budget.limit})`)
    const prompt = [
      '<session_budget>',
      `Tokens used: ${budget.usedTokens}`,
      `Tokens remaining: ${budget.remainingTokens}`,
      `Token limit: ${budget.limit}`,
      'Respect the remaining token budget and avoid unnecessary repetition.',
      '</session_budget>',
    ].join('\n')
    return { ...request, system: `${request.system}\n\n${prompt}` }
  }

  private async persist(sessionId: string, budget: PersistedBudget, type: string, runId?: string) {
    const event = await this.api.sessions.append(sessionId, type, { budget }, runId)
    this.budgets.set(sessionId, budget)
    this.api.notify({ method: 'budget.updated', params: { sessionId, budget: publicBudget(budget), runId: event.runId } })
    this.api.changed('budgets')
  }
}

function budgetTools(runtime: BudgetRuntime): ToolDefinition[] {
  return [
    {
      name: 'get_budget',
      description: 'Get the token budget and current usage for this thread.',
      inputSchema: getBudgetArgs,
      effect: 'read',
      execute: async (_args, context) => {
        const budget = await runtime.get(context.session.id)
        return { text: JSON.stringify(budget), details: budget }
      },
    },
    {
      name: 'set_budget',
      description: 'Set or increase the token budget for this thread when explicitly requested by the user.',
      inputSchema: createBudgetArgs,
      effect: 'read',
      execute: async (args, context) => {
        const parsed = createBudgetArgs.parse(args)
        const budget = await runtime.set(context.session.id, parsed.limit)
        return { text: JSON.stringify(budget), details: budget }
      },
    },
  ]
}

export const budgetConfigSchema = z.object({
  maxLimit: z.number().int().positive().max(1_000_000_000).default(10_000_000),
})

export const budgetPlugin = definePlugin({
  manifest: {
    id: 'budget.codex',
    packageName: '@hbar/budget',
    name: 'Codex token budgets',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    description: 'Persistent per-session token budget accounting and exhaustion guard',
    scope: 'host',
    required: true,
    provides: { budget: '1.0.0' },
    requires: { storage: '^1.0.0' },
    permissions: ['storage'],
  },
  configSchema: budgetConfigSchema,
  async apply(ctx, rawConfig) {
    const runtime = new BudgetRuntime(ctx.hbar.api, budgetConfigSchema.parse(rawConfig).maxLimit)
    await runtime.restore()
    provide<BudgetRuntime>(ctx, 'budget', runtime)
    ctx.hbar.api.hooks.on('context.build', (request) => runtime.decorate(request))
    ctx.hbar.api.hooks.on('run.end', (event) => runtime.accountRun(event))
    for (const tool of budgetTools(runtime)) ctx.hbar.api.tools.register(tool)
  },
})

export default budgetPlugin
