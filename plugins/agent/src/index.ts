import { createHash } from 'node:crypto'
import { z } from 'zod'
import { agentPatchSchema, HbarError } from '@hbar/contracts'
import type { AgentPatch, Run, WorkflowScope } from '@hbar/contracts'
import {
  agentCreateInputSchema,
  agentDispatchConfigurationSchema,
  agentPatchTaskSchema,
  agentProfileIdSchema,
  agentRecordSchema,
  agentReviewTaskSchema,
} from '@hbar/contracts/commands/agents'
import type {
  AgentCreateInput,
  AgentDispatchConfiguration,
  AgentPatchTask,
  AgentProfileId,
  AgentRecord,
  AgentPolicySetInput,
} from '@hbar/contracts/commands/agents'
import { definePlugin, provide, SKILL_TOOL_NAMES } from '@hbar/plugin-sdk'
import type {
  AgentService,
  BudgetService,
  GitService,
  HbarAPI,
  HookEvents,
  SessionService,
  ToolContext,
  ToolDefinition,
  ModelRegistry,
} from '@hbar/plugin-sdk'
import {
  applyFiles,
  argumentPaths,
  buildPatchFiles,
  collectScopeFiles,
  hashValue,
  pathAllowed,
  synchronizeScope,
} from './patches'
import { advertiseAgentTool, createAgentTool } from './agent-tool'

const MAX_CHILDREN = 128
const MAX_SCANNED_CHILD_SESSIONS = 2_000
const MAX_AGENT_EVENTS = 100_000
const PROFILE_DEFINITIONS = {
  explore: {
    instructions:
      'You are an Explore child agent. Investigate the assigned objective using read-only workspace tools. Do not modify files, run processes, or claim changes were made. Report findings with concrete file paths and uncertainty.',
    toolNames: new Set([
      ...SKILL_TOOL_NAMES,
      'read_file',
      'search_text',
      'find_files',
      'list_directory',
      'git_info',
      'git_status',
      'git_diff',
      'git_log',
      'git_stats',
      'git_diff_to_remote',
    ]),
  },
} satisfies Record<AgentProfileId, { readonly instructions: string; readonly toolNames: ReadonlySet<string> }>

function profileAllowsTool(profileId: AgentProfileId, tool: ToolDefinition): boolean {
  return tool.effect === 'read' && PROFILE_DEFINITIONS[profileId].toolNames.has(tool.name)
}

const commandSchema = z.strictObject({
  actorId: z.string().min(1).max(160),
  idempotencyKey: z.string().min(1).max(128),
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  requestId: z.string().min(1).max(160),
})
const fileSnapshotSchema = z.strictObject({
  path: z.string().min(1).max(4_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
})
const isolationSchema = z.strictObject({
  worktreeKey: z.string().min(1).max(160),
  workspaceId: z.string().min(1).max(160),
  workspacePath: z.string().min(1).max(4_000),
  parentWorkspaceId: z.string().min(1).max(160),
  parentWorkspacePath: z.string().min(1).max(4_000),
  baseline: z.array(fileSnapshotSchema),
})
const createdSchema = z.strictObject({
  agentId: z.string().min(1).max(160),
  parentSessionId: z.string().min(1).max(160),
  sessionId: z.string().min(1).max(160),
  requestId: z.string().min(1).max(160),
  objective: z.string().min(1).max(4_000),
  profileId: agentProfileIdSchema.optional(),
  modelId: z.string().min(1).max(160),
  configuration: agentDispatchConfigurationSchema.optional(),
  tokenBudget: z.number().int().positive().max(1_000_000_000).nullable(),
  patchTask: agentPatchTaskSchema.optional(),
  reviewTask: agentReviewTaskSchema.optional(),
  isolation: isolationSchema.optional(),
  createdAt: z.number().int().nonnegative(),
  command: commandSchema,
})
const patchEventSchema = z.strictObject({ patch: agentPatchSchema })
const patchRejectedEventSchema = z.strictObject({
  error: z.string().min(1).max(4_000),
  summary: z.string().max(4_000),
  updatedAt: z.number().int().nonnegative(),
})
const patchCommandEventSchema = z.strictObject({
  patchId: z.string().min(1).max(160),
  planRevision: z.number().int().positive(),
  status: z.enum(['applied', 'conflict', 'rejected']),
  command: commandSchema,
})

type CreatedAgent = z.output<typeof createdSchema>
type PatchCommand = z.output<typeof patchCommandEventSchema>

const inputHash = (input: AgentCreateInput): string =>
  createHash('sha256')
    .update(JSON.stringify(agentCreateInputSchema.parse(input)))
    .digest('hex')

function summaryForRun(snapshot: Awaited<ReturnType<SessionService['snapshot']>>, runId: string) {
  return snapshot.messages
    .filter((message) => message.runId === runId && message.role === 'assistant')
    .flatMap((message) => message.content)
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .slice(0, 4_000)
}

function mergedScope(scope: WorkflowScope) {
  return [...new Set([...scope.readPaths, ...scope.writePaths])]
}

function ensurePatchPaths(patch: AgentPatch, task: AgentPatchTask) {
  const rejected = patch.files.find((file) => !pathAllowed(file.path, task.scope.writePaths))
  if (rejected)
    throw new HbarError('AGENT_PATCH_SCOPE', `Patch path is outside the delegated write scope: ${rejected.path}`)
}

export class AgentRuntime implements AgentService {
  private createLocks = new Map<string, Promise<void>>()
  private applyLocks = new Map<string, Promise<void>>()

  constructor(
    private sessions: SessionService,
    private budgets: BudgetService,
    private git: GitService,
    private api: HbarAPI,
  ) {}

  async policy(parentSessionId: string) {
    const port = this.sessions.agentConfiguration
    if (!port) throw new HbarError('CAPABILITY_UNAVAILABLE', 'Host agent configuration is unavailable')
    return port.policy(parentSessionId)
  }

  async setPolicy(input: AgentPolicySetInput, context: { actorId: string; idempotencyKey: string }) {
    const port = this.sessions.agentConfiguration
    if (!port) throw new HbarError('CAPABILITY_UNAVAILABLE', 'Host agent configuration is unavailable')
    return port.setPolicy(input, context)
  }

  private async events(sessionId: string) {
    return this.sessions.events(sessionId, 0, MAX_AGENT_EVENTS)
  }

  private async created(sessionId: string): Promise<CreatedAgent | null> {
    const events = await this.sessions.events(sessionId, 0, 100)
    for (const event of events) {
      if (event.type !== 'agent.created') continue
      const parsed = createdSchema.safeParse(event.data)
      if (parsed.success) return parsed.data
    }
    return null
  }

  private async patchState(sessionId: string) {
    const events = await this.events(sessionId)
    let patch: AgentPatch | null = null
    let rejection: z.output<typeof patchRejectedEventSchema> | null = null
    const commands: PatchCommand[] = []
    for (const event of events) {
      if (event.type === 'agent.patch.updated') {
        const parsed = patchEventSchema.safeParse(event.data)
        if (parsed.success) patch = parsed.data.patch
      } else if (event.type === 'agent.patch.rejected') {
        const parsed = patchRejectedEventSchema.safeParse(event.data)
        if (parsed.success) rejection = parsed.data
      } else if (event.type === 'agent.patch.command') {
        const parsed = patchCommandEventSchema.safeParse(event.data)
        if (parsed.success) commands.push(parsed.data)
      }
    }
    return { patch, rejection, commands }
  }

  private async record(seed: CreatedAgent): Promise<AgentRecord> {
    const snapshot = await this.sessions.snapshot(seed.sessionId)
    const run = snapshot.runs.find((candidate) => candidate.requestId === seed.requestId) ?? null
    const events = snapshot.session.seq ? await this.events(seed.sessionId) : []
    const cancelRequested = run
      ? events.some((event) => event.runId === run.id && event.type === 'run.cancelRequested')
      : false
    const failed = events.find((event) => event.type === 'agent.failed')
    const failedData = z.object({ error: z.string().max(4_000) }).safeParse(failed?.data)
    const { patch, rejection } = await this.patchState(seed.sessionId)
    const resultSummary = run ? summaryForRun(snapshot, run.id) : ''
    return agentRecordSchema.parse({
      agentId: seed.agentId,
      parentSessionId: seed.parentSessionId,
      sessionId: seed.sessionId,
      runId: run?.id ?? null,
      requestId: seed.requestId,
      objective: seed.objective,
      ...(seed.profileId ? { profileId: seed.profileId } : {}),
      modelId: seed.modelId,
      tokenBudget: seed.tokenBudget,
      status: run
        ? cancelRequested && ['running', 'waiting_approval'].includes(run.status)
          ? 'cancelRequested'
          : run.status
        : failedData.success
          ? 'failed'
          : 'created',
      error: run?.error ?? (failedData.success ? failedData.data.error : (rejection?.error ?? null)),
      patch,
      resultSummary: resultSummary || rejection?.summary || null,
      isolated: Boolean(seed.isolation),
      ...(seed.configuration ? { dispatchConfiguration: seed.configuration } : {}),
      ...(this.sessions.agentConfiguration
        ? { configuration: await this.sessions.agentConfiguration.read(seed.sessionId) }
        : {}),
      createdAt: seed.createdAt,
      updatedAt: Math.max(
        run?.endedAt ?? run?.startedAt ?? run?.createdAt ?? failed?.time ?? seed.createdAt,
        patch?.appliedAt ?? patch?.createdAt ?? rejection?.updatedAt ?? 0,
      ),
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
    context: { actorId: string; idempotencyKey: string; requestId: string; parentRunId?: string },
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

  private async isolatedSeed(
    parsed: AgentCreateInput & {
      modelId: string
      patchTask: AgentPatchTask
      configuration: AgentDispatchConfiguration
    },
    context: { actorId: string; idempotencyKey: string; requestId: string },
    hash: string,
  ): Promise<CreatedAgent> {
    const parent = await this.sessions.get(parsed.parentSessionId)
    const parentWorkspace = await this.sessions.workspace(parent.workspaceId)
    const worktreeKey = `agent-${crypto.randomUUID()}`
    const worktree = await this.git.worktree(parentWorkspace.path, {
      operation: 'add',
      path: worktreeKey,
      branch: 'HEAD',
    })
    if (Array.isArray(worktree)) throw new HbarError('AGENT_PATCH_WORKTREE', 'Git returned an invalid worktree')
    try {
      await synchronizeScope(parentWorkspace.path, worktree.path, mergedScope(parsed.patchTask.scope))
      const baseline = [...(await collectScopeFiles(parentWorkspace.path, parsed.patchTask.scope.writePaths)).values()]
      const workspace = await this.sessions.createWorkspace(worktree.path)
      const child = await this.sessions.create(
        workspace.id,
        parsed.title ?? parsed.objective.replaceAll(/\s+/g, ' ').slice(0, 80),
        parent.id,
      )
      return createdSchema.parse({
        agentId: child.id,
        parentSessionId: parent.id,
        sessionId: child.id,
        requestId: `agent-${crypto.randomUUID()}`,
        objective: parsed.objective,
        ...(parsed.profileId ? { profileId: parsed.profileId } : {}),
        modelId: parsed.modelId,
        configuration: parsed.configuration,
        tokenBudget: parsed.tokenBudget ?? null,
        patchTask: parsed.patchTask,
        isolation: {
          worktreeKey,
          workspaceId: workspace.id,
          workspacePath: worktree.path,
          parentWorkspaceId: parentWorkspace.id,
          parentWorkspacePath: parentWorkspace.path,
          baseline,
        },
        createdAt: Date.now(),
        command: {
          actorId: context.actorId,
          idempotencyKey: context.idempotencyKey,
          requestId: context.requestId,
          inputHash: hash,
        },
      })
    } catch (error) {
      await this.git
        .worktree(parentWorkspace.path, { operation: 'remove', path: worktreeKey, force: true })
        .catch(() => {})
      throw error
    }
  }

  private async createLocked(
    parsed: AgentCreateInput,
    context: { actorId: string; idempotencyKey: string; requestId: string; parentRunId?: string },
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
    const configuration = await this.resolveConfiguration(parsed, context.parentRunId)
    const resolved = { ...parsed, modelId: configuration.modelId, configuration }
    let seed: CreatedAgent
    if (parsed.patchTask) seed = await this.isolatedSeed({ ...resolved, patchTask: parsed.patchTask }, context, hash)
    else {
      const parent = await this.sessions.get(parsed.parentSessionId)
      const child = await this.sessions.create(
        parent.workspaceId,
        parsed.title ?? parsed.objective.replaceAll(/\s+/g, ' ').slice(0, 80),
        parent.id,
      )
      seed = createdSchema.parse({
        agentId: child.id,
        parentSessionId: parent.id,
        sessionId: child.id,
        requestId: `agent-${crypto.randomUUID()}`,
        objective: parsed.objective,
        ...(parsed.profileId ? { profileId: parsed.profileId } : {}),
        modelId: configuration.modelId,
        configuration,
        tokenBudget: parsed.tokenBudget ?? null,
        reviewTask: parsed.reviewTask,
        createdAt: Date.now(),
        command: {
          actorId: context.actorId,
          idempotencyKey: context.idempotencyKey,
          requestId: context.requestId,
          inputHash: hash,
        },
      })
    }
    try {
      await this.sessions.append(seed.sessionId, 'agent.created', seed)
      await this.sessions.append(seed.parentSessionId, 'agent.childCreated', seed)
    } catch (error) {
      if (seed.isolation)
        await this.git
          .worktree(seed.isolation.parentWorkspacePath, {
            operation: 'remove',
            path: seed.isolation.worktreeKey,
            force: true,
          })
          .catch(() => {})
      throw error
    }
    return this.start(seed, parsed)
  }

  private async start(seed: CreatedAgent, input: AgentCreateInput): Promise<AgentRecord> {
    try {
      const configuration = seed.configuration ?? (await this.resolveConfiguration(input))
      if (!this.sessions.agentConfiguration)
        throw new HbarError('CAPABILITY_UNAVAILABLE', 'Host agent configuration is unavailable')
      await this.sessions.agentConfiguration.initialize(seed.sessionId, configuration, seed.command.actorId)
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
          approval: configuration.approval,
          ...(configuration.sandbox ? { sandbox: configuration.sandbox } : {}),
          thinking: configuration.thinkingLevel,
        },
        seed.modelId,
      )
      this.api.notify({ method: 'host.changed', params: { kind: 'sessions' } })
      this.api.changed('agents')
      return this.record(seed)
    } catch (error) {
      await this.sessions.append(seed.sessionId, 'agent.failed', {
        error: error instanceof Error ? error.message.slice(0, 4_000) : String(error).slice(0, 4_000),
      })
      this.api.changed('agents')
      return this.record(seed)
    }
  }

  private async resolveConfiguration(
    input: AgentCreateInput,
    parentRunId?: string,
  ): Promise<AgentDispatchConfiguration> {
    const port = this.sessions.agentConfiguration
    if (!port) throw new HbarError('CAPABILITY_UNAVAILABLE', 'Host agent configuration is unavailable')
    const parent = await port.read(input.parentSessionId, parentRunId)
    const policy = input.difficulty ? await port.policy(input.parentSessionId) : null
    const candidates = policy?.candidates.filter((candidate) => candidate.difficulty === input.difficulty) ?? []
    const candidate = candidates.sort(
      (left, right) =>
        right.weight - left.weight || (left.modelId < right.modelId ? -1 : left.modelId > right.modelId ? 1 : 0),
    )[0]
    // An empty tier deliberately inherits. A removed/unsupported selected candidate fails closed, never silently downgrades effort.
    const modelId = candidate?.modelId ?? input.modelId ?? parent.modelId
    if (!modelId) throw new HbarError('MODEL_NOT_FOUND', 'Select a parent or child model before dispatch')
    const model = await this.api.service<ModelRegistry>('models').get(modelId)
    const explicitThinking = candidate?.thinkingLevel ?? input.thinkingLevel
    if (explicitThinking && !model.thinkingLevels.includes(explicitThinking))
      throw new HbarError('THINKING_LEVEL_UNSUPPORTED', `${explicitThinking} is unavailable for ${modelId}`)
    const inheritedThinking =
      parent.thinkingLevel && model.thinkingLevels.includes(parent.thinkingLevel) ? parent.thinkingLevel : null
    const thinkingLevel = explicitThinking ?? inheritedThinking ?? model.defaultThinkingLevel
    const approval = input.approval ?? parent.approval
    const sandboxProfileId = input.sandboxProfileId ?? input.sandbox?.profileId ?? parent.sandboxProfileId
    const sandbox = input.sandbox ?? (input.sandboxProfileId ? undefined : parent.sandbox)
    return agentDispatchConfigurationSchema.parse({
      modelId,
      thinkingLevel,
      approval,
      sandboxProfileId,
      ...(approval === 'sandbox' && sandbox ? { sandbox } : {}),
      ...(candidate && policy
        ? {
            selection: {
              difficulty: candidate.difficulty,
              weight: candidate.weight,
              sourceLayer: policy.sourceLayer,
              candidateCount: candidates.length,
            },
          }
        : {}),
      sources: {
        model: candidate
          ? 'policy'
          : input.modelId && !(parentRunId && input.modelId === parent.modelId)
            ? 'override'
            : 'parent',
        thinking: candidate
          ? 'policy'
          : input.thinkingLevel && !(parentRunId && input.thinkingLevel === parent.thinkingLevel)
            ? 'override'
            : inheritedThinking
              ? 'parent'
              : 'default',
        approval: input.approval && !(parentRunId && input.approval === parent.approval) ? 'override' : 'parent',
        sandbox: input.sandboxProfileId ? 'override' : 'parent',
      },
    })
  }

  private async removeWorktree(seed: CreatedAgent) {
    if (!seed.isolation) return
    await this.git
      .worktree(seed.isolation.parentWorkspacePath, {
        operation: 'remove',
        path: seed.isolation.worktreeKey,
        force: true,
      })
      .catch((error) => console.error('Failed to remove agent worktree:', error))
  }

  private async rejectPatch(seed: CreatedAgent, error: unknown, summary: string) {
    const message = error instanceof Error ? error.message.slice(0, 4_000) : String(error).slice(0, 4_000)
    const data = patchRejectedEventSchema.parse({ error: message, summary, updatedAt: Date.now() })
    await this.sessions.append(seed.sessionId, 'agent.patch.rejected', data)
    await this.sessions.append(seed.parentSessionId, 'agent.patch.rejected', { ...data, agentId: seed.agentId })
    await this.api.hooks.dispatch('agent.patch', {
      parentSessionId: seed.parentSessionId,
      agentId: seed.agentId,
      patch: null,
      status: 'rejected',
    })
    await this.removeWorktree(seed)
  }

  async finish(event: { sessionId: string; runId: string; status: Run['status'] }) {
    // Guidance consumes only a queued user operation; it is not an Agent
    // execution settlement and must not publish a reviewer/patch outcome.
    if (event.status === 'guided') return
    const seed = await this.created(event.sessionId)
    if (seed?.reviewTask) {
      await this.api.hooks.dispatch('agent.settled', {
        parentSessionId: seed.parentSessionId,
        agentId: seed.agentId,
        status: event.status,
      })
      return
    }
    if (!seed?.patchTask || !seed.isolation) return
    const snapshot = await this.sessions.snapshot(event.sessionId)
    if (seed.requestId !== snapshot.runs.find((run) => run.id === event.runId)?.requestId) return
    const state = await this.patchState(seed.sessionId)
    if (state.patch || state.rejection) return
    const summary = summaryForRun(snapshot, event.runId)
    if (event.status !== 'completed') {
      await this.rejectPatch(seed, new HbarError('AGENT_PATCH_REJECTED', `Agent run ended as ${event.status}`), summary)
      return
    }
    try {
      const files = await buildPatchFiles(seed.isolation.workspacePath, seed.patchTask.scope, seed.isolation.baseline)
      if (!files.length) throw new HbarError('AGENT_PATCH_EMPTY', 'Agent completed without changing its write scope')
      const artifactSha256 = hashValue({
        agentId: seed.agentId,
        itemId: seed.patchTask.itemId,
        planRevision: seed.patchTask.planRevision,
        files,
      })
      const patch = agentPatchSchema.parse({
        patchId: crypto.randomUUID(),
        agentId: seed.agentId,
        parentSessionId: seed.parentSessionId,
        itemId: seed.patchTask.itemId,
        planRevision: seed.patchTask.planRevision,
        status: 'ready',
        artifactId: `patch-${artifactSha256}`,
        artifactSha256,
        files,
        summary,
        createdAt: Date.now(),
        appliedAt: null,
      })
      await this.persistPatch(seed, patch)
      await this.api.hooks.dispatch('agent.patch', {
        parentSessionId: seed.parentSessionId,
        agentId: seed.agentId,
        patch,
        status: 'ready',
      })
    } catch (error) {
      await this.rejectPatch(seed, error, summary)
    } finally {
      this.api.changed('agents')
    }
  }

  /** Agent work is complete after its owning Run settles; budget continuation
   * must not manufacture an empty follow-up Run for the child session. */
  async beforeBudgetContinue(event: HookEvents['budget.beforeContinue']) {
    if (!event.allowed) return event
    const seed = await this.created(event.sessionId)
    if (!seed) return event
    const snapshot = await this.sessions.snapshot(event.sessionId)
    const owningRun = snapshot.runs.find((run) => run.requestId === seed.requestId)
    if (owningRun?.status === 'completed') return { ...event, allowed: false }
    return event
  }

  private async persistPatch(seed: CreatedAgent, patch: AgentPatch) {
    const data = patchEventSchema.parse({ patch })
    await this.sessions.append(seed.sessionId, 'agent.patch.updated', data)
    await this.sessions.append(seed.parentSessionId, 'agent.patch.updated', data)
  }

  async selectProfileTools(event: HookEvents['tools.select']): Promise<HookEvents['tools.select']> {
    const profileId = (await this.created(event.sessionId))?.profileId
    if (!profileId) return event
    return { ...event, tools: event.tools.filter((tool) => profileAllowsTool(profileId, tool)) }
  }

  async advertiseProfile(event: HookEvents['tools.advertise']): Promise<HookEvents['tools.advertise']> {
    const seed = await this.created(event.sessionId)
    if (!seed?.profileId) return event
    return {
      ...event,
      instructions: [event.instructions, PROFILE_DEFINITIONS[seed.profileId].instructions].filter(Boolean).join('\n\n'),
    }
  }

  async advertiseTaskGuidance(event: HookEvents['tools.advertise']): Promise<HookEvents['tools.advertise']> {
    const seed = await this.created(event.sessionId)
    if (!seed?.patchTask) return event
    const processGuidance =
      seed.patchTask.allowProcessTools === true
        ? 'This isolated patch task explicitly permits process-effect tools only when their names are listed in the delegated tool scope. Process side effects are not constrained by the read/write file paths. Host policy and this child Run approval mode still apply; this does not grant administrator privileges or OS-level confinement.'
        : 'Process-effect tools are disabled for this isolated patch task. File path scope does not constrain process side effects. Do not attempt shell or other process tools.'
    return {
      ...event,
      instructions: [event.instructions, processGuidance].filter(Boolean).join('\n\n'),
    }
  }

  async beforeTool(name: string, args: Record<string, unknown>, context: ToolContext, tool: ToolDefinition) {
    const seed = await this.created(context.session.id)
    if (seed?.profileId && !profileAllowsTool(seed.profileId, tool))
      throw new HbarError('AGENT_PROFILE_TOOL', `Tool ${name} is unavailable to the ${seed.profileId} profile`)
    if (seed?.reviewTask) {
      if (!seed.reviewTask.scope.tools.includes(name))
        throw new HbarError('AGENT_REVIEW_SCOPE', `Tool ${name} is outside the read-only review scope`)
      if (name === 'workflow_review_submit') return
      if (tool.effect !== 'read')
        throw new HbarError('AGENT_REVIEW_SCOPE', `Review agents cannot use ${tool.effect} tools`)
      const rejected = argumentPaths(context.workspace.path, args).find(
        (path) => !pathAllowed(path, seed.reviewTask!.scope.readPaths),
      )
      if (rejected) throw new HbarError('AGENT_REVIEW_SCOPE', `Path ${rejected} is outside the read-only review scope`)
      return
    }
    if (!seed?.patchTask || !seed.isolation) return
    if (!seed.patchTask.scope.tools.includes(name))
      throw new HbarError('AGENT_PATCH_SCOPE', `Tool ${name} is outside the delegated scope`)
    if (tool.effect === 'process' && seed.patchTask.allowProcessTools !== true)
      throw new HbarError(
        'AGENT_PATCH_SCOPE',
        `Process tool ${name} is disabled for this isolated patch task; explicit process access must be enabled and remains outside the delegated file path boundary`,
      )
    const allowed =
      tool.effect === 'read'
        ? [...seed.patchTask.scope.readPaths, ...seed.patchTask.scope.writePaths]
        : seed.patchTask.scope.writePaths
    const rejected = argumentPaths(context.workspace.path, args).find((path) => !pathAllowed(path, allowed))
    if (rejected)
      throw new HbarError('AGENT_PATCH_SCOPE', `Path ${rejected} is outside the delegated ${tool.effect} scope`)
  }

  async list(parentSessionId: string, after?: string, limit = 50) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new HbarError('INVALID_INPUT', 'Agent list limit must be from 1 to 100')
    const items = (await this.children(parentSessionId)).map(({ record }) => record)
    const filtered = after ? items.filter((item) => item.agentId > after) : items
    const page = filtered.slice(0, limit)
    return { items: page, nextCursor: filtered.length > limit ? (page.at(-1)?.agentId ?? null) : null }
  }

  async result(parentSessionId: string, agentId: string) {
    const direct = (await this.children(parentSessionId)).find(({ record }) => record.agentId === agentId)
    if (!direct) throw new HbarError('AGENT_NOT_FOUND', 'Agent is not a direct child of the target session')
    return direct.record
  }

  async applyPatch(
    parentSessionId: string,
    agentId: string,
    planRevision: number,
    context: { actorId: string; idempotencyKey: string; requestId: string },
  ): Promise<AgentRecord> {
    const key = `${parentSessionId}\u0000${agentId}`
    const previous = this.applyLocks.get(key) ?? Promise.resolve()
    const operation = previous
      .catch(() => {})
      .then(() => this.applyPatchLocked(parentSessionId, agentId, planRevision, context))
    const tail = operation.then(
      () => undefined,
      () => undefined,
    )
    this.applyLocks.set(key, tail)
    try {
      return await operation
    } finally {
      if (this.applyLocks.get(key) === tail) this.applyLocks.delete(key)
    }
  }

  private async applyPatchLocked(
    parentSessionId: string,
    agentId: string,
    planRevision: number,
    context: { actorId: string; idempotencyKey: string; requestId: string },
  ) {
    const direct = (await this.children(parentSessionId)).find(({ record }) => record.agentId === agentId)
    if (!direct) throw new HbarError('AGENT_NOT_FOUND', 'Agent is not a direct child of the target session')
    const { seed } = direct
    if (!seed.patchTask || !seed.isolation)
      throw new HbarError('AGENT_PATCH_UNAVAILABLE', 'Agent has no isolated patch')
    const state = await this.patchState(seed.sessionId)
    if (!state.patch) throw new HbarError('AGENT_PATCH_UNAVAILABLE', 'Agent patch is not ready')
    if (state.patch.planRevision !== planRevision || seed.patchTask.planRevision !== planRevision)
      throw new HbarError('AGENT_PATCH_REVISION', 'Agent patch belongs to a different workflow revision')
    const hash = hashValue({ parentSessionId, agentId, planRevision })
    const duplicate = state.commands.find(
      (entry) => entry.command.actorId === context.actorId && entry.command.idempotencyKey === context.idempotencyKey,
    )
    if (duplicate) {
      if (duplicate.command.inputHash !== hash)
        throw new HbarError('IDEMPOTENCY_CONFLICT', 'Key was already used with different patch input')
      return this.record(seed)
    }
    if (state.patch.status === 'applied') return this.record(seed)
    ensurePatchPaths(state.patch, seed.patchTask)
    let patch: AgentPatch
    let outcome: PatchCommand['status']
    try {
      await applyFiles(seed.isolation.parentWorkspacePath, seed.isolation.workspacePath, state.patch.files)
      patch = agentPatchSchema.parse({ ...state.patch, status: 'applied', appliedAt: Date.now() })
      outcome = 'applied'
    } catch (error) {
      const conflict = error instanceof HbarError && error.code === 'AGENT_PATCH_CONFLICT'
      patch = agentPatchSchema.parse({ ...state.patch, status: conflict ? 'conflict' : 'rejected' })
      outcome = conflict ? 'conflict' : 'rejected'
    }
    await this.persistPatch(seed, patch)
    await this.sessions.append(
      seed.sessionId,
      'agent.patch.command',
      patchCommandEventSchema.parse({
        patchId: patch.patchId,
        planRevision,
        status: outcome,
        command: { ...context, inputHash: hash },
      }),
    )
    await this.api.hooks.dispatch('agent.patch', {
      parentSessionId,
      agentId,
      patch,
      status: outcome,
    })
    if (outcome === 'applied' || outcome === 'rejected') await this.removeWorktree(seed)
    this.api.changed('agents')
    return this.record(seed)
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
    if (direct.record.patch && ['ready', 'conflict'].includes(direct.record.patch.status)) {
      const patch = agentPatchSchema.parse({ ...direct.record.patch, status: 'rejected' })
      await this.persistPatch(direct.seed, patch)
      await this.api.hooks.dispatch('agent.patch', {
        parentSessionId,
        agentId,
        patch,
        status: 'rejected',
      })
      await this.removeWorktree(direct.seed)
    }
    await visit(direct.record.sessionId)
    for (const record of [...descendants.reverse(), direct.record]) {
      if (record.runId && ['queued', 'running', 'waiting_approval', 'cancelRequested'].includes(record.status))
        await this.sessions.cancel(record.runId)
    }
    await this.sessions.append(parentSessionId, 'agent.cancelRequested', { agentId })
    this.api.changed('agents')
    const updated = await this.record(direct.seed)
    if (direct.seed.reviewTask)
      await this.api.hooks.dispatch('agent.settled', {
        parentSessionId,
        agentId,
        status: updated.status,
      })
    return updated
  }
}

export const agentPlugin = definePlugin({
  manifest: {
    id: 'agent.codex',
    packageName: '@hbar/agent',
    name: 'Codex child agents',
    version: '1.0.0',
    apiVersion: '^1.0.0',
    description: 'Persistent isolated child agents, budgets, patch review, and cancellation propagation',
    scope: 'host',
    required: true,
    provides: { agent: '1.0.0' },
    requires: { budget: '^1.0.0', git: '^1.0.0', models: '^1.0.0' },
    permissions: ['storage'],
  },
  apply(ctx) {
    const api = ctx.hbar.api
    const runtime = new AgentRuntime(
      api.sessions,
      api.service<BudgetService>('budget'),
      api.service<GitService>('git'),
      api,
    )
    provide<AgentService>(ctx, 'agent', runtime)
    api.tools.register(createAgentTool(runtime, api.sessions))
    api.hooks.on('tools.advertise', (event) => advertiseAgentTool(event))
    api.hooks.on('tools.select', (event) => runtime.selectProfileTools(event))
    api.hooks.on('tools.advertise', (event) => runtime.advertiseProfile(event))
    api.hooks.on('tools.advertise', (event) => runtime.advertiseTaskGuidance(event))
    api.hooks.on('tool.before', async (event) => {
      await runtime.beforeTool(event.name, event.args, event.context, event.tool)
      return event
    })
    api.hooks.on('run.end', (event) => runtime.finish(event))
    api.hooks.on('budget.beforeContinue', (event) => runtime.beforeBudgetContinue(event))
  },
})

export default agentPlugin
