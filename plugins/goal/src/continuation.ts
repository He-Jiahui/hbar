import { createHash } from 'node:crypto'
import { z } from 'zod'
import { goalContinuationSchema, workflowSnapshotSchema } from '@hbar/contracts'
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
        if (block.type === 'tool_result' && !block.isError && !queries.has(block.name ?? '')) {
          if (block.name === 'workflow_focus' || block.name === 'workflow_update') {
            const snapshot = workflowSnapshotSchema.safeParse(block.details)
            if (!snapshot.success) continue
            const workflow = snapshot.data.workflow
            const focus = workflow?.focus
            facts.push({
              workflow: workflow?.status,
              plan: snapshot.data.plan?.plan,
              focus: focus
                ? {
                    step: focus.stepIndex,
                    title: focus.title,
                    status: focus.status,
                    policy: focus.completionPolicy,
                    scope: {
                      tools: [...focus.scope.tools].sort(),
                      readPaths: [...focus.scope.readPaths].sort(),
                      writePaths: [...focus.scope.writePaths].sort(),
                    },
                    checks: focus.acceptanceChecks.map((check) => ({
                      required: check.required,
                      verifier: check.verifier,
                      status: check.status,
                    })),
                  }
                : null,
              evidence: [
                ...new Set(
                  workflow?.evidence.map((evidence) =>
                    JSON.stringify({
                      source: evidence.source,
                      outcome: evidence.outcome,
                      resultHash: 'resultHash' in evidence ? evidence.resultHash : null,
                    }),
                  ) ?? [],
                ),
              ].sort(),
            })
          } else facts.push({ name: block.name, text: block.text })
        }
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
