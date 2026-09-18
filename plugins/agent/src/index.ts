import { createHash } from 'node:crypto'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { agentCreateInputSchema, agentRecordSchema } from '@hbar/contracts/commands/agents'
import type { AgentCreateInput, AgentRecord } from '@hbar/contracts/commands/agents'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { AgentService, BudgetService, HbarAPI, SessionService } from '@hbar/plugin-sdk'

const MAX_CHILDREN = 128
const MAX_SCANNED_CHILD_SESSIONS = 2_000
const commandSchema = z.strictObject({
  actorId: z.string().min(1).max(160),
  idempotencyKey: z.string().min(1).max(128),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  requestId: z.string().min(1).max(160),
})
const createdSchema = z.strictObject({
  agentId: z.string().min(1).max(160),
  parentSessionId: z.string().min(1).max(160),
  sessionId: z.string().min(1).max(160),
  requestId: z.string().min(1).max(160),
  objective: z.string().min(1).max(4_000),
  modelId: z.string().min(1).max(160),
  tokenBudget: z.number().int().positive().max(1_000_000_000).nullable(),
  createdAt: z.number().int().nonnegative(),
  command: commandSchema,
})
type CreatedAgent = z.output<typeof createdSchema>

const inputHash = (input: AgentCreateInput): string =>
  createHash('sha256')
    .update(JSON.stringify(agentCreateInputSchema.parse(input)))
    .digest('hex')

export class AgentRuntime implements AgentService {
  private createLocks = new Map<string, Promise<void>>()

  constructor(
    private sessions: SessionService,
    private budgets: BudgetService,
    private notify: HbarAPI['notify'],
    private changed: HbarAPI['changed'],
  ) {}

  private async created(sessionId: string): Promise<CreatedAgent | null> {
    const events = await this.sessions.events(sessionId, 0, 100)
    for (const event of events) {
      if (event.type !== 'agent.created') continue
      const parsed = createdSchema.safeParse(event.data)
      if (parsed.success) return parsed.data
    }
    return null
  }

  private async record(seed: CreatedAgent): Promise<AgentRecord> {
    const snapshot = await this.sessions.snapshot(seed.sessionId)
    const run = snapshot.runs.find((candidate) => candidate.requestId === seed.requestId) ?? null
    const cancelRequested = run
      ? (await this.sessions.events(seed.sessionId, 0, 100_000)).some(
          (event) => event.runId === run.id && event.type === 'run.cancelRequested',
        )
      : false
    const failed = snapshot.session.seq
      ? (await this.sessions.events(seed.sessionId, 0, 100)).find((event) => event.type === 'agent.failed')
      : undefined
    const failedData = z.object({ error: z.string().max(4_000) }).safeParse(failed?.data)
    return agentRecordSchema.parse({
      agentId: seed.agentId,
      parentSessionId: seed.parentSessionId,
      sessionId: seed.sessionId,
      runId: run?.id ?? null,
      requestId: seed.requestId,
      objective: seed.objective,
      modelId: seed.modelId,
      tokenBudget: seed.tokenBudget,
      status: run
        ? cancelRequested && ['running', 'waiting_approval'].includes(run.status)
          ? 'cancelRequested'
          : run.status
        : failedData.success
          ? 'failed'
          : 'created',
      error: run?.error ?? (failedData.success ? failedData.data.error : null),
      createdAt: seed.createdAt,
      updatedAt: run?.endedAt ?? run?.startedAt ?? run?.createdAt ?? failed?.time ?? seed.createdAt,
    })
  }

  private async children(parentSessionId: string): Promise<{ seed: CreatedAgent; record: AgentRecord }[]> {
    await this.sessions.get(parentSessionId)
    const result: { seed: CreatedAgent; record: AgentRecord }[] = []
    let after: string | undefined
    let scanned = 0
    for (;;) {
      const candidates = await this.sessions.children(parentSessionId, after, 200)
      scanned += candidates.length
      if (scanned > MAX_SCANNED_CHILD_SESSIONS) throw new HbarError('AGENT_LIMIT', 'Too many child sessions')
      for (const session of candidates) {
        const seed = await this.created(session.id)
        if (seed) result.push({ seed, record: await this.record(seed) })
        if (result.length > MAX_CHILDREN) throw new HbarError('AGENT_LIMIT', 'Too many direct child agents')
      }
      if (candidates.length < 200) break
      after = candidates.at(-1)!.id
    }
    return result.sort((left, right) => left.record.agentId.localeCompare(right.record.agentId))
  }

  async create(
    input: AgentCreateInput,
    context: { actorId: string; idempotencyKey: string; requestId: string },
  ): Promise<AgentRecord> {
    const parsed = agentCreateInputSchema.parse(input)
    const key = `${parsed.parentSessionId}\u0000${context.actorId}\u0000${context.idempotencyKey}`
    const previous = this.createLocks.get(key) ?? Promise.resolve()
    const operation = previous.catch(() => {}).then(() => this.createLocked(parsed, context))
    const tail = operation.then(
      () => undefined,
      () => undefined,
    )
    this.createLocks.set(key, tail)
    try {
      return await operation
    } finally {
      if (this.createLocks.get(key) === tail) this.createLocks.delete(key)
    }
  }

  private async createLocked(
    parsed: AgentCreateInput,
    context: { actorId: string; idempotencyKey: string; requestId: string },
  ): Promise<AgentRecord> {
    const hash = inputHash(parsed)
    const existing = (await this.children(parsed.parentSessionId)).find(
      ({ seed }) => seed.command.actorId === context.actorId && seed.command.idempotencyKey === context.idempotencyKey,
    )
    if (existing) {
      if (existing.seed.command.inputHash !== hash)
        throw new HbarError('IDEMPOTENCY_CONFLICT', 'Key was already used with different agent input')
      if (existing.record.runId || existing.record.status === 'failed') return existing.record
      return this.start(existing.seed, parsed)
    }
    const parent = await this.sessions.get(parsed.parentSessionId)
    const child = await this.sessions.create(
      parent.workspaceId,
      parsed.title ?? parsed.objective.replaceAll(/\s+/g, ' ').slice(0, 80),
      parent.id,
    )
    const seed = createdSchema.parse({
      agentId: child.id,
      parentSessionId: parent.id,
      sessionId: child.id,
      requestId: `agent-${crypto.randomUUID()}`,
      objective: parsed.objective,
      modelId: parsed.modelId,
      tokenBudget: parsed.tokenBudget ?? null,
      createdAt: Date.now(),
      command: { ...context, inputHash: hash },
    })
    await this.sessions.append(child.id, 'agent.created', seed)
    await this.sessions.append(parent.id, 'agent.childCreated', seed)
    return this.start(seed, parsed)
  }

  private async start(seed: CreatedAgent, input: AgentCreateInput): Promise<AgentRecord> {
    try {
      if (seed.tokenBudget !== null && !(await this.budgets.get(seed.sessionId)))
        await this.budgets.set(seed.sessionId, seed.tokenBudget)
      await this.sessions.submit(
        seed.sessionId,
        seed.requestId,
        {
          text: seed.objective,
          images: [],
          files: [],
          source: 'system',
          approval: input.approval,
          ...(input.thinkingLevel ? { thinking: input.thinkingLevel } : {}),
        },
        seed.modelId,
      )
      this.notify({ method: 'host.changed', params: { kind: 'sessions' } })
      this.changed('agents')
      return this.record(seed)
    } catch (error) {
      await this.sessions.append(seed.sessionId, 'agent.failed', {
        error: error instanceof Error ? error.message.slice(0, 4_000) : String(error).slice(0, 4_000),
      })
      this.changed('agents')
      return this.record(seed)
    }
  }

  async list(parentSessionId: string, after?: string, limit = 50) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new HbarError('INVALID_INPUT', 'Agent list limit must be from 1 to 100')
    const items = (await this.children(parentSessionId)).map(({ record }) => record)
    const filtered = after ? items.filter((item) => item.agentId > after) : items
    const page = filtered.slice(0, limit)
    return { items: page, nextCursor: filtered.length > limit ? (page.at(-1)?.agentId ?? null) : null }
  }

  async cancel(parentSessionId: string, agentId: string): Promise<AgentRecord> {
    const descendants: AgentRecord[] = []
    const visit = async (parentId: string): Promise<void> => {
      for (const child of (await this.children(parentId)).map(({ record }) => record)) {
        if (descendants.length >= MAX_CHILDREN)
          throw new HbarError('AGENT_LIMIT', 'Agent cancellation tree is too large')
        descendants.push(child)
        await visit(child.sessionId)
      }
    }
    const direct = (await this.children(parentSessionId)).find(({ record }) => record.agentId === agentId)
    if (!direct) throw new HbarError('AGENT_NOT_FOUND', 'Agent is not a direct child of the target session')
    await visit(direct.record.sessionId)
    for (const record of [...descendants.reverse(), direct.record]) {
      if (record.runId && ['queued', 'running', 'waiting_approval', 'cancelRequested'].includes(record.status))
        await this.sessions.cancel(record.runId)
    }
    await this.sessions.append(parentSessionId, 'agent.cancelRequested', { agentId })
    this.changed('agents')
    return this.record(direct.seed)
  }
}

export const agentPlugin = definePlugin({
  manifest: {
    id: 'agent.codex',
    packageName: '@hbar/agent',
    name: 'Codex child agents',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    description: 'Persistent parent-child agent sessions, budgets, and cancellation propagation',
    scope: 'host',
    required: true,
    provides: { agent: '1.0.0' },
    requires: { budget: '^1.0.0' },
    permissions: ['storage'],
  },
  apply(ctx) {
    provide<AgentService>(
      ctx,
      'agent',
      new AgentRuntime(
        ctx.hbar.api.sessions,
        ctx.hbar.api.service<BudgetService>('budget'),
        ctx.hbar.api.notify,
        ctx.hbar.api.changed,
      ),
    )
  },
})

export default agentPlugin
