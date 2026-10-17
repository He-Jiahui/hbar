import { z } from 'zod'
import { createHash } from 'node:crypto'
import { HbarError, idSchema, usageSchema } from '@hbar/contracts'
import type { Run, RunSource, SessionEvent, Usage } from '@hbar/contracts'
import { budgetReceiptSchema, setBudgetInputSchema } from '@hbar/contracts/commands/budget'
import type { BudgetReceipt, SetBudgetInput } from '@hbar/contracts/commands/budget'
import { appendModelContext, definePlugin, provide, readSessionEventPages } from '@hbar/plugin-sdk'
import type { HbarAPI, HookEvents, ModelRequest, ToolDefinition } from '@hbar/plugin-sdk'

const MAX_RESTORE_EVENTS = 100_000
const MAX_ACCOUNTED_RUNS = 512
const BUDGET_RESTORE_EVENT_TYPES = ['budget.created', 'budget.updated', 'budget.accounted', 'budget.cleared'] as const

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
  usageThroughSeq: z.number().int().nonnegative().default(0),
})
type PersistedBudget = z.infer<typeof persistedBudgetSchema>

const commandRecordSchema = z.strictObject({
  actorId: idSchema,
  idempotencyKey: z.string().min(1).max(128),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  requestId: z.string().min(1).max(128),
})
type CommandRecord = z.infer<typeof commandRecordSchema>
type StoredCommandReceipt = { hash: string; receipt: BudgetReceipt }
const budgetEventSchema = z.object({ budget: persistedBudgetSchema, command: commandRecordSchema.optional() })
const budgetClearedEventSchema = z.object({ sessionId: idSchema })
const createBudgetArgs = z.object({ limit: z.number().int().positive() })
const getBudgetArgs = z.object({})

function publicBudget(value: PersistedBudget): SessionBudget {
  const { accountedRuns: _accountedRuns, usageThroughSeq: _usageThroughSeq, ...budget } = value
  return budget
}

function tokenUsage(event: SessionEvent): number {
  if (event.type !== 'usage.recorded') return 0
  const parsed = usageSchema.safeParse(event.data)
  if (!parsed.success) return 0
  const usage: Usage = parsed.data
  return Math.max(0, usage.input - usage.cacheRead) + usage.output
}

function withPhase(budget: PersistedBudget): PersistedBudget {
  const phase: BudgetPhase =
    budget.phase === 'active' || budget.phase === 'exhausted'
      ? budget.usedTokens >= budget.limit
        ? 'exhausted'
        : 'active'
      : budget.phase
  return {
    ...budget,
    phase,
    remainingTokens: Math.max(0, budget.limit - budget.usedTokens),
  }
}

export class BudgetRuntime {
  private budgets = new Map<string, PersistedBudget>()
  private continuations = new Map<string, number>()
  private commandReceipts = new Map<string, Map<string, StoredCommandReceipt>>()
  private uncertainSessions = new Set<string>()
  private locks = new Map<string, Promise<void>>()
  private hydrated = false

  constructor(
    private api: HbarAPI,
    private maxLimit: number,
    private autoContinue = true,
    private maxContinuations = 16,
  ) {}

  async restore() {
    const sessions = await this.api.sessions.list()
    for (let offset = 0; offset < sessions.length; offset += 8) {
      await Promise.all(sessions.slice(offset, offset + 8).map((session) => this.restoreSession(session.id)))
    }
    this.hydrated = true
  }

  private async restoreSession(sessionId: string) {
    let highWaterSeq = 0
    this.budgets.delete(sessionId)
    this.commandReceipts.delete(sessionId)
    this.uncertainSessions.delete(sessionId)
    for await (const page of readSessionEventPages(this.api.sessions, {
      sessionId,
      types: BUDGET_RESTORE_EVENT_TYPES,
      limit: 500,
      maxReplyBytes: 1_048_576,
    })) {
      if (page.totalEventCount > MAX_RESTORE_EVENTS)
        throw new HbarError(
          'BUDGET_RESTORE_LIMIT',
          `Budget replay for ${sessionId} exceeded ${MAX_RESTORE_EVENTS} events`,
        )
      highWaterSeq = page.throughSeq
      for (const item of page.items) {
        if (item.kind !== 'event') continue
        const event = item.event
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
        // Older ledgers settled complete runs. Preserve their high-water mark
        // without replaying their already-charged usage into the new step ledger.
        const source = z.object({ budget: z.object({ usageThroughSeq: z.number().optional() }) }).parse(event.data)
        const budget = {
          ...parsed.data.budget,
          usageThroughSeq:
            source.budget.usageThroughSeq ??
            (event.type === 'budget.accounted'
              ? event.seq
              : (this.budgets.get(sessionId)?.usageThroughSeq ?? event.seq)),
        }
        this.budgets.set(sessionId, withPhase(budget))
        if (parsed.data.command) {
          const command = parsed.data.command
          const receipt = budgetReceiptSchema.parse({
            status: 'succeeded',
            commandId: 'session.setBudget',
            commandVersion: 1,
            requestId: command.requestId,
            idempotencyKey: command.idempotencyKey,
            eventId: event.eventId,
            revision: parsed.data.budget.revision,
            committedAt: event.time,
            budget: publicBudget(parsed.data.budget),
            accountingVersion: 1,
          })
          this.rememberCommand(sessionId, command, receipt)
        }
      }
    }
    // Usage facts may have committed just before the Host lost its step/end
    // callback. Reconcile them before exposing a budget or admitting a model.
    const prior = this.budgets.get(sessionId)
    if (prior && this.api.restoreMode !== 'projection') {
      let delta = 0
      let firstUsagePage = true
      for await (const page of readSessionEventPages(this.api.sessions, {
        sessionId,
        afterSeq: prior.usageThroughSeq,
        throughSeq: highWaterSeq,
        types: ['usage.recorded'],
        limit: 500,
        maxReplyBytes: 1_048_576,
      })) {
        if (firstUsagePage && page.totalEventCount > MAX_RESTORE_EVENTS)
          throw new HbarError(
            'BUDGET_RESTORE_LIMIT',
            `Budget replay for ${sessionId} exceeded ${MAX_RESTORE_EVENTS} events`,
          )
        firstUsagePage = false
        for (const item of page.items) if (item.kind === 'event') delta += tokenUsage(item.event)
      }
      delta = Math.max(0, Math.round(delta))
      if (delta > 0)
        await this.persist(
          sessionId,
          withPhase({
            ...prior,
            usedTokens: prior.usedTokens + delta,
            usageThroughSeq: highWaterSeq,
            revision: prior.revision + 1,
            updatedAt: Date.now(),
          }),
          'budget.accounted',
        )
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
      if (this.uncertainSessions.has(sessionId))
        throw new HbarError('RESULT_UNKNOWN', 'Budget state requires Host recovery')
      return await operation()
    } finally {
      release()
      if (this.locks.get(sessionId) === current) this.locks.delete(sessionId)
    }
  }

  async get(sessionId: string): Promise<SessionBudget | null> {
    await this.ready()
    await this.api.sessions.get(sessionId)
    if (this.uncertainSessions.has(sessionId))
      throw new HbarError('RESULT_UNKNOWN', 'Budget state requires Host recovery')
    const budget = this.budgets.get(sessionId)
    return budget ? publicBudget(budget) : null
  }

  async assertCanStart(sessionId: string, _source?: RunSource) {
    await this.ready()
    const budget = this.budgets.get(sessionId)
    if (budget?.phase === 'exhausted')
      throw new HbarError('BUDGET_EXHAUSTED', `Token budget exhausted (${budget.usedTokens}/${budget.limit})`)
  }

  async validateLimit(requestedLimit: number): Promise<void> {
    await this.ready()
    if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > this.maxLimit)
      throw new HbarError('BUDGET_INVALID', `Budget limit must be an integer between 1 and ${this.maxLimit}`)
  }
  async set(sessionId: string, requestedLimit: number): Promise<SessionBudget> {
    return this.serial(sessionId, () => this.setLocked(sessionId, requestedLimit))
  }

  private receiptKey(actorId: string, idempotencyKey: string): string {
    return JSON.stringify([actorId, idempotencyKey])
  }

  private rememberCommand(sessionId: string, command: CommandRecord, receipt: BudgetReceipt): void {
    const receipts = this.commandReceipts.get(sessionId) ?? new Map<string, StoredCommandReceipt>()
    const key = this.receiptKey(command.actorId, command.idempotencyKey)
    if (receipts.has(key)) throw new HbarError('BUDGET_REPLAY', 'Duplicate budget command key in durable history')
    receipts.set(key, { hash: command.inputHash, receipt })
    this.commandReceipts.set(sessionId, receipts)
  }

  async getCommandReceipt(sessionId: string, actorId: string, idempotencyKey: string): Promise<BudgetReceipt | null> {
    await this.ready()
    await this.api.sessions.get(sessionId)
    if (this.uncertainSessions.has(sessionId))
      throw new HbarError('RESULT_UNKNOWN', 'Budget receipt requires Host recovery')
    return this.commandReceipts.get(sessionId)?.get(this.receiptKey(actorId, idempotencyKey))?.receipt ?? null
  }

  async setCommand(
    input: SetBudgetInput,
    context: { actorId: string; idempotencyKey: string; requestId: string },
  ): Promise<BudgetReceipt> {
    const parsed = setBudgetInputSchema.parse(input)
    const command = commandRecordSchema.parse({
      ...context,
      inputHash: createHash('sha256')
        .update(JSON.stringify({ commandId: 'session.setBudget', version: 1, input: parsed }))
        .digest('hex'),
    })
    return this.serial(parsed.sessionId, async () => {
      const priorReceipt = this.commandReceipts
        .get(parsed.sessionId)
        ?.get(this.receiptKey(command.actorId, command.idempotencyKey))
      if (priorReceipt) {
        if (priorReceipt.hash !== command.inputHash)
          throw new HbarError('IDEMPOTENCY_CONFLICT', 'Key was already used with different budget input')
        return priorReceipt.receipt
      }
      const prior = this.budgets.get(parsed.sessionId)
      if (parsed.expectedRevision !== undefined && parsed.expectedRevision !== (prior?.revision ?? null))
        throw new HbarError('REVISION_CONFLICT', 'Budget revision changed; refresh before saving')
      const budget = await this.setLocked(parsed.sessionId, parsed.tokens, command)
      const receipt = this.commandReceipts
        .get(parsed.sessionId)
        ?.get(this.receiptKey(command.actorId, command.idempotencyKey))?.receipt
      if (!receipt || receipt.budget.revision !== budget.revision)
        throw new HbarError('RESULT_UNKNOWN', 'Budget was committed but its receipt is unavailable')
      return receipt
    })
  }

  private async setLocked(sessionId: string, requestedLimit: number, command?: CommandRecord): Promise<SessionBudget> {
    await this.validateLimit(requestedLimit)
    const prior = this.budgets.get(sessionId)
    if (prior && prior.phase === 'completed')
      throw new HbarError('BUDGET_COMPLETED', 'Completed budgets cannot be changed')
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
      usageThroughSeq: prior?.usageThroughSeq ?? (await this.api.sessions.get(sessionId)).seq,
    })
    await this.persist(sessionId, next, prior ? 'budget.updated' : 'budget.created', undefined, command)
    return publicBudget(next)
  }

  async clear(sessionId: string): Promise<{ cleared: boolean }> {
    return this.serial(sessionId, async () => {
      const cleared = this.budgets.has(sessionId)
      if (cleared) {
        await this.api.sessions.append(sessionId, 'budget.cleared', { sessionId })
        this.budgets.delete(sessionId)
        this.api.notify({ method: 'budget.cleared', params: { sessionId } })
        this.api.changed('budgets')
        await this.publishCommitted(sessionId, null)
      }
      return { cleared }
    })
  }

  async accountRun(event: HookEvents['run.end']) {
    return this.accountUsage(event.sessionId, event.runId, event)
  }
  async reconcileRun(run: Run): Promise<void> {
    await this.restoreSession(run.sessionId)
    await this.accountRun({ sessionId: run.sessionId, runId: run.id, status: run.status, run })
  }
  async refreshSession(sessionId: string): Promise<void> {
    if (this.api.restoreMode !== 'projection')
      throw new HbarError('RUNTIME_RESTART_REQUIRED', 'Budget handoff requires projection-only restore')
    await this.serial(sessionId, () => this.restoreSession(sessionId))
  }

  async accountStep(event: HookEvents['step.end']) {
    return this.accountUsage(event.sessionId, event.runId)
  }
  async accountPendingUsage(sessionId: string, runId: string): Promise<void> {
    await this.accountUsage(sessionId, runId)
  }

  private async accountUsage(sessionId: string, runId: string, finalRun?: HookEvents['run.end']) {
    return this.serial(sessionId, async () => {
      const prior = this.budgets.get(sessionId)
      if (!prior || prior.accountedRuns.includes(runId)) return
      let delta = 0
      let highWaterSeq = prior.usageThroughSeq
      let firstPage = true
      for await (const page of readSessionEventPages(this.api.sessions, {
        sessionId,
        afterSeq: prior.usageThroughSeq,
        types: ['usage.recorded'],
        limit: 500,
        maxReplyBytes: 1_048_576,
      })) {
        if (firstPage && page.remainingEventCount > MAX_RESTORE_EVENTS)
          throw new HbarError('BUDGET_ACCOUNTING_LIMIT', 'Unsettled budget usage exceeded the bounded replay window')
        firstPage = false
        highWaterSeq = page.throughSeq
        for (const item of page.items) if (item.kind === 'event') delta += tokenUsage(item.event)
      }
      delta = Math.max(0, Math.round(delta))
      if (delta === 0 && !finalRun) return
      const next = withPhase({
        ...prior,
        usedTokens: prior.usedTokens + delta,
        remainingTokens: Math.max(0, prior.limit - prior.usedTokens - delta),
        revision: prior.revision + 1,
        updatedAt: Date.now(),
        usageThroughSeq: highWaterSeq,
        accountedRuns: finalRun ? [...prior.accountedRuns, runId].slice(-MAX_ACCOUNTED_RUNS) : prior.accountedRuns,
      })
      // budget.committed projects exhaustion through the Goal owner. Budget
      // never mutates Goal state or requests its service during composition.
      await this.persist(sessionId, next, 'budget.accounted', runId)
      if (
        this.autoContinue &&
        finalRun?.status === 'completed' &&
        finalRun.run.input.mode !== 'plan' &&
        finalRun.run.input.source !== 'goal' &&
        next.phase === 'active' &&
        (this.continuations.get(sessionId) ?? 0) < this.maxContinuations
      ) {
        const admission = await this.api.hooks.dispatch('budget.beforeContinue', { sessionId, runId, allowed: true })
        if (!admission.allowed) return
        const count = (this.continuations.get(sessionId) ?? 0) + 1
        this.continuations.set(sessionId, count)
        try {
          await this.api.sessions.submit(
            sessionId,
            `budget-${crypto.randomUUID()}`,
            { text: '', images: [], source: 'system' },
            finalRun.run.modelId,
          )
        } catch (error) {
          await this.api.sessions.append(
            sessionId,
            'budget.continuation_failed',
            {
              error: error instanceof Error ? error.message : String(error),
            },
            runId,
          )
          await this.api.taskNotification?.(
            'retry_failed',
            sessionId,
            runId,
            '任务失败',
            '预算任务继续执行失败，请检查错误后重试。',
          )
        }
      }
    })
  }

  decorate(request: ModelRequest): ModelRequest {
    const sessionId = request.context?.sessionId
    if (sessionId && this.uncertainSessions.has(sessionId))
      throw new HbarError('RESULT_UNKNOWN', 'Budget state requires Host recovery')
    const budget = sessionId ? this.budgets.get(sessionId) : undefined
    if (!budget) return request
    if (budget.phase === 'exhausted' && request.context?.purpose !== 'context-inspection')
      throw new HbarError('BUDGET_EXHAUSTED', `Token budget exhausted (${budget.usedTokens}/${budget.limit})`)
    const prompt = [
      '<session_budget>',
      `Tokens used: ${budget.usedTokens}`,
      `Tokens remaining: ${budget.remainingTokens}`,
      `Token limit: ${budget.limit}`,
      'Continue working on the current user task, verify meaningful progress, and avoid unnecessary repetition.',
      '</session_budget>',
    ].join('\n')
    return appendModelContext(request, prompt)
  }

  private async persist(
    sessionId: string,
    budget: PersistedBudget,
    type: string,
    runId?: string,
    command?: CommandRecord,
  ) {
    let event: SessionEvent
    try {
      event = await this.api.sessions.append(sessionId, type, { budget, ...(command ? { command } : {}) }, runId)
    } catch (error) {
      // Canonical JSONL may have been appended before the SQLite projection failed.
      // Do not replay this key in-process until startup has reconciled the log.
      this.uncertainSessions.add(sessionId)
      throw error
    }
    this.budgets.set(sessionId, budget)
    if (command)
      this.rememberCommand(
        sessionId,
        command,
        budgetReceiptSchema.parse({
          status: 'succeeded',
          commandId: 'session.setBudget',
          commandVersion: 1,
          requestId: command.requestId,
          idempotencyKey: command.idempotencyKey,
          eventId: event.eventId,
          revision: budget.revision,
          committedAt: event.time,
          budget: publicBudget(budget),
          accountingVersion: 1,
        }),
      )
    this.api.notify({
      method: 'budget.updated',
      params: { sessionId, budget: publicBudget(budget), runId: event.runId },
    })
    this.api.changed('budgets')
    await this.publishCommitted(sessionId, publicBudget(budget))
  }

  private async publishCommitted(sessionId: string, budget: SessionBudget | null) {
    // A failed projection observer must not invalidate an already committed
    // command receipt. Its owner must fail closed and reconcile on restore.
    try {
      await this.api.hooks.dispatch('budget.committed', { sessionId, budget })
    } catch (error) {
      console.error('Budget observer failed:', error)
    }
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
  autoContinue: z.boolean().default(true),
  maxContinuations: z.number().int().min(0).max(100).default(16),
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
    const config = budgetConfigSchema.parse(rawConfig)
    const runtime = new BudgetRuntime(ctx.hbar.api, config.maxLimit, config.autoContinue, config.maxContinuations)
    await runtime.restore()
    provide<BudgetRuntime>(ctx, 'budget', runtime)
    ctx.hbar.api.hooks.on('context.build', (request) => runtime.decorate(request))
    ctx.hbar.api.hooks.on('run.end', (event) => runtime.accountRun(event))
    ctx.hbar.api.hooks.on('step.end', (event) => runtime.accountStep(event))
    for (const tool of budgetTools(runtime)) ctx.hbar.api.tools.register(tool)
  },
})

export default budgetPlugin
