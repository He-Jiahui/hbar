import { z } from 'zod'
import { defineCommand } from '@hbar/commands'
import { contentBlockSchema, sessionEventSchema } from '@hbar/contracts'
import { interactionCommands } from '@hbar/contracts/commands/interaction'
import { questionnaireFact, type QuestionnaireFact } from './interaction-presentations'
import type { InteractionActionState, InteractionRecoveryPort, SessionTimelineState } from './types'

export const interactionRecoveryCommands = {
  'interaction.reconcile': defineCommand(
    {
      id: 'interaction.reconcile',
      version: 1,
      owner: 'hbar.interaction',
      kind: 'command',
      execution: 'client',
      stateEffect: 'application',
      scope: 'session',
      category: 'run.approval',
      visibility: 'internal',
      titleKey: 'commands.interaction.reconcile.title',
      descriptionKey: 'commands.interaction.reconcile.description',
      surfaces: ['api'],
    },
    z.strictObject({ sessionId: z.string().min(1), actionId: z.string().min(1) }),
    z.strictObject({ confirmed: z.boolean() }),
  ),
}

// session.follow returns all retained events up to 2,000; above that it returns reset, not another page.
const followSchema = z.object({
  events: z.array(sessionEventSchema).max(2_000),
  cursor: z.number().int().nonnegative(),
  reset: z.boolean(),
})
const approvalResolutionSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  runId: z.string(),
  callId: z.string(),
  tool: z.string(),
  status: z.enum(['allowed', 'denied', 'cancelled']),
})
const messageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(['user', 'assistant', 'tool', 'system']),
  content: z.array(contentBlockSchema),
})

export async function readInteractionResolution(
  action: InteractionActionState,
  port: InteractionRecoveryPort,
): Promise<{
  readonly resolution: NonNullable<InteractionActionState['resolution']>
  readonly questionnaire?: QuestionnaireFact
} | null> {
  if (action.kind === 'approval' && action.approval?.tool === 'exit_plan_mode' && port.getPlanExit) {
    const original = action.approval
    const result = interactionCommands['planExit.get'].output.parse(
      await port.getPlanExit({
        sessionId: action.sessionId,
        approvalId: action.targetId,
        runId: original.runId,
        callId: original.callId,
      }),
    )
    if (
      result.sessionId !== action.sessionId ||
      result.approvalId !== action.targetId ||
      result.runId !== original.runId ||
      result.callId !== original.callId ||
      result.status === 'pending'
    )
      return null
    return { resolution: { kind: 'approval', status: result.status } }
  }
  if (action.startCursor === undefined) return null
  const page = followSchema.parse(await port.follow(action.sessionId, action.startCursor))
  if (page.reset || page.cursor < action.startCursor) return null
  let previous = action.startCursor
  for (const event of page.events) {
    if (event.sessionId !== action.sessionId || event.seq <= previous || event.seq > page.cursor) return null
    previous = event.seq
  }
  if (action.kind === 'approval' && action.approval) {
    const original = action.approval
    let status: 'allowed' | 'denied' | 'cancelled' | null = null
    for (const event of page.events) {
      if (!['approval.resolved', 'plan_exit.resolved'].includes(event.type) || event.runId !== original.runId) continue
      const data =
        event.type === 'plan_exit.resolved' && event.data && typeof event.data === 'object' && 'approval' in event.data
          ? event.data.approval
          : event.data
      const parsed = approvalResolutionSchema.safeParse(data)
      if (!parsed.success) continue
      const value = parsed.data
      if (
        value.id !== action.targetId ||
        value.sessionId !== action.sessionId ||
        value.runId !== original.runId ||
        value.callId !== original.callId ||
        value.tool !== original.tool
      )
        continue
      if (status && status !== value.status) return null
      status = value.status
    }
    return status ? { resolution: { kind: 'approval', status } } : null
  }
  if (action.kind !== 'questionnaire' || !action.request) return null
  const messages: SessionTimelineState['messages'][number][] = []
  for (const event of page.events) {
    if (event.type !== 'message.committed' || event.runId !== action.request.runId) continue
    const parsed = messageSchema.safeParse(event.data)
    if (parsed.success)
      messages.push({
        ...parsed.data,
        sessionId: event.sessionId,
        runId: action.request.runId,
        seq: event.seq,
        createdAt: event.time,
      })
  }
  const fact = questionnaireFact(action.request, messages, page.events)
  return fact ? { resolution: { kind: 'questionnaire', status: fact.status }, questionnaire: fact } : null
}
