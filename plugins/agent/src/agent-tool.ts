import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { agentProfileIdSchema, agentToolResultSchema, type AgentProfileId } from '@hbar/contracts/commands/agents'
import type { AgentService, HookEvents, SessionService, ToolContext, ToolDefinition } from '@hbar/plugin-sdk'

export const AGENT_TOOL_NAME = 'agent'
export const AGENT_TOOL_INSTRUCTIONS =
  'For a user `/agent <subagent_type> <prompt>` request, use the `agent` tool. Set `subagent_type` to the token after `/agent` and pass the exact remaining prompt unchanged as `prompt`.'
const MAX_ADVERTISED_INSTRUCTIONS = 16_000

export const agentToolInputSchema = z.strictObject({
  subagent_type: agentProfileIdSchema,
  prompt: z.string().trim().min(1).max(4_000),
})

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function modelActorId(sessionId: string): string {
  const prefix = 'model-agent:'
  const direct = `${prefix}${sessionId}`
  return direct.length <= 160 ? direct : `${prefix}${digest(sessionId)}`
}

function callKey(context: ToolContext): string {
  return `model-agent:${digest(`${context.run.id}\u0000${context.callId}`)}`
}

function requestId(context: ToolContext): string {
  return `model-agent:${digest(`${context.session.id}\u0000${context.run.id}\u0000${context.callId}`)}`
}

async function assertCurrentParent(sessions: SessionService, context: ToolContext) {
  if (context.run.status !== 'running')
    throw new HbarError('STALE_TARGET', 'The Agent tool requires a running parent Run')
  if (context.run.sessionId !== context.session.id)
    throw new HbarError('STALE_TARGET', 'The Agent tool Run does not belong to its Session')
  if (context.workspace.id !== context.session.workspaceId)
    throw new HbarError('STALE_TARGET', 'The Agent tool workspace does not belong to its Session')

  const current = await sessions.get(context.session.id)
  if (current.id !== context.session.id || current.workspaceId !== context.session.workspaceId)
    throw new HbarError('STALE_TARGET', 'The Agent tool Session target changed')
  if (current.archived) throw new HbarError('SESSION_ARCHIVED', 'Restore the Session before creating an Agent')

  const workspace = await sessions.workspace(current.workspaceId)
  if (workspace.id !== context.workspace.id)
    throw new HbarError('STALE_TARGET', 'The Agent tool workspace target changed')
  const canonicalPath = (path: string) => (process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path))
  if (canonicalPath(workspace.path) !== canonicalPath(context.workspace.path))
    throw new HbarError(
      'AGENT_EXECUTION_TARGET_UNSUPPORTED',
      'Child Agent cannot inherit this isolated execution checkout',
    )

  const snapshot = await sessions.snapshot(current.id)
  const run = snapshot.runs.find((candidate) => candidate.id === context.run.id)
  if (
    !run ||
    run.status !== 'running' ||
    run.sessionId !== current.id ||
    run.requestId !== context.run.requestId ||
    run.modelId !== context.run.modelId ||
    run.input.approval !== context.run.input.approval ||
    run.input.thinking !== context.run.input.thinking
  )
    throw new HbarError('STALE_TARGET', 'The Agent tool Run target changed')
  return { session: current, run }
}

export function createAgentTool(agents: AgentService, sessions: SessionService): ToolDefinition {
  return {
    name: AGENT_TOOL_NAME,
    description:
      'Create a bounded read-only child Agent. Preserve the exact user prompt and choose the requested Agent profile.',
    inputSchema: agentToolInputSchema,
    effect: 'write',
    execute: async (rawArgs, context) => {
      const args = agentToolInputSchema.parse(rawArgs)
      const target = await assertCurrentParent(sessions, context)
      context.signal.throwIfAborted()
      const profileId: AgentProfileId = args.subagent_type
      const record = await agents.create(
        {
          parentSessionId: target.session.id,
          objective: args.prompt,
          profileId,
          modelId: target.run.modelId,
          ...(target.run.input.thinking ? { thinkingLevel: target.run.input.thinking } : {}),
          approval: target.run.input.approval ?? 'deny',
        },
        {
          actorId: modelActorId(target.session.id),
          idempotencyKey: callKey(context),
          requestId: requestId(context),
        },
      )
      if (
        record.profileId !== profileId ||
        record.parentSessionId !== target.session.id ||
        record.objective !== args.prompt ||
        record.modelId !== target.run.modelId
      )
        throw new HbarError('INVALID_OUTPUT', 'The Agent service returned a different target or task')
      const identity = agentToolResultSchema.parse({
        agentId: record.agentId,
        parentSessionId: record.parentSessionId,
        sessionId: record.sessionId,
        requestId: record.requestId,
        profileId: record.profileId,
        objective: record.objective,
        modelId: record.modelId,
        status: record.status,
      })
      return { text: JSON.stringify(identity), details: identity }
    },
  }
}

export function advertiseAgentTool(event: HookEvents['tools.advertise']): HookEvents['tools.advertise'] {
  if (!event.tools.some((tool) => tool.name === AGENT_TOOL_NAME)) return event
  const existing = event.instructions?.trim() ?? ''
  if (existing.length + (existing ? 2 : 0) + AGENT_TOOL_INSTRUCTIONS.length > MAX_ADVERTISED_INSTRUCTIONS)
    return { ...event, tools: event.tools.filter((tool) => tool.name !== AGENT_TOOL_NAME) }
  const instructions = existing ? `${existing}\n\n${AGENT_TOOL_INSTRUCTIONS}` : AGENT_TOOL_INSTRUCTIONS
  return { ...event, instructions }
}
