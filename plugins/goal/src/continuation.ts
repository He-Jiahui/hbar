import { createHash } from 'node:crypto'
import { z } from 'zod'
import { goalContinuationSchema } from '@hbar/contracts'
import type { GoalContinuation, SessionEvent } from '@hbar/contracts'

export const continuationIntentSchema = goalContinuationSchema.extend({
  goalId: z.string().min(1).max(160),
  modelId: z.string().min(1).max(160),
  text: z.string().max(200_000).default(''),
})
export type ContinuationIntent = z.infer<typeof continuationIntentSchema>
export function continuationState(intent: ContinuationIntent): GoalContinuation {
  return goalContinuationSchema.parse(intent)
}
const queries = new Set([
  'get_goal',
  'get_plan',
  'get_workflow',
  'get_budget',
  'list_agents',
  'agent_status',
  'update_plan',
  'update_goal',
  'create_goal',
])
const resultSchema = z.object({
  content: z.array(
    z
      .object({
        type: z.string(),
        name: z.string().optional(),
        text: z.string().optional(),
        isError: z.boolean().optional(),
      })
      .passthrough(),
  ),
})

/** Count new durable results, not a repeated query, revision number or error. */
export function auditProgress(events: SessionEvent[], runId: string, known: string[]) {
  const keys = new Set(known)
  let toolCalls = 0
  let progress = false
  for (const event of events) {
    if (event.runId !== runId) continue
    const facts: unknown[] = []
    if (event.type === 'message.committed') {
      const parsed = resultSchema.safeParse(event.data)
      if (!parsed.success) continue
      for (const block of parsed.data.content) {
        if (block.type === 'tool_call') toolCalls++
        if (block.type === 'tool_result' && !block.isError && !queries.has(block.name ?? ''))
          facts.push({ name: block.name, text: block.text })
      }
    }
    if (event.type === 'plan.updated') {
      const parsed = z.object({ plan: z.object({ plan: z.array(z.unknown()) }) }).safeParse(event.data)
      if (parsed.success) facts.push({ plan: parsed.data.plan.plan })
    }
    for (const fact of facts) {
      const key = createHash('sha256').update(JSON.stringify(fact)).digest('hex')
      if (!keys.has(key)) {
        keys.add(key)
        progress = true
      }
    }
  }
  return { toolCalls, progress, keys: [...keys].slice(-512) }
}
