import { HbarError, type Run, type ThreadGoal, type PlanState } from '@hbar/contracts'
import type { Session } from '@hbar/contracts/directory'
import {
  delegatedSourceContextSchema,
  type DelegatedSourceContext,
  type ContextSummaryExcerpt,
} from '@hbar/contracts/delegated-context'

interface ContextPorts {
  run(id: string): Promise<Run>
  session(id: string): Promise<Session>
  goal(id: string): Promise<ThreadGoal | null>
  plan(id: string): Promise<PlanState | null>
  summary(id: string): Promise<ContextSummaryExcerpt | null>
}
function excerpt(text: string, limit: number) {
  if (text.length <= limit) return { text, truncated: false }
  const marker = '\n[truncated]\n'
  const headLength = Math.floor((limit - marker.length) * 0.7)
  let head = text.slice(0, headLength)
  let tail = text.slice(-(limit - marker.length - headLength))
  const end = head.charCodeAt(head.length - 1)
  if (end >= 0xd800 && end <= 0xdbff) head = head.slice(0, -1)
  const start = tail.charCodeAt(0)
  if (start >= 0xdc00 && start <= 0xdfff) tail = tail.slice(1)
  return { text: head + marker + tail, truncated: true }
}

/** Text and current plan context only. No history scan, attachment, model credential or permission grant. */
export async function captureDelegatedContext(
  source: { sessionId: string; runId: string },
  ports: ContextPorts,
): Promise<DelegatedSourceContext> {
  const [run, session, goal, plan, summary] = await Promise.all([
    ports.run(source.runId),
    ports.session(source.sessionId),
    ports.goal(source.sessionId),
    ports.plan(source.sessionId),
    ports.summary(source.sessionId),
  ])
  if (
    run.sessionId !== source.sessionId ||
    session.id !== source.sessionId ||
    (goal && goal.threadId !== source.sessionId) ||
    (plan && plan.sessionId !== source.sessionId)
  )
    throw new HbarError('DELEGATION_CONTEXT_UNAVAILABLE', 'The context must belong to the original source')
  const focused = plan?.plan.findIndex((step) => step.status === 'in_progress') ?? -1
  const pending = plan?.plan.findIndex((step) => step.status === 'pending') ?? -1
  const first = Math.max(0, (focused >= 0 ? focused : pending >= 0 ? pending : (plan?.plan.length ?? 0)) - 2)
  const planStart = Math.min(first, Math.max(0, (plan?.plan.length ?? 0) - 8))
  return delegatedSourceContextSchema.parse({
    version: 1,
    ...source,
    capturedAt: Date.now(),
    sessionTitle: excerpt(session.title, 200).text,
    task: excerpt(run.input.text, 2_000),
    ...(goal
      ? {
          goal: {
            ...(goal.goalId ? { goalId: goal.goalId } : {}),
            status: goal.status,
            objective: excerpt(goal.objective, 2_000),
          },
        }
      : {}),
    ...(plan
      ? {
          plan: {
            revision: plan.revision,
            turnId: plan.turnId,
            explanation: plan.explanation === null ? null : excerpt(plan.explanation, 1_000),
            totalSteps: plan.plan.length,
            steps: plan.plan.slice(planStart, planStart + 8).map((step, offset) => ({
              index: planStart + offset,
              ...excerpt(step.step, 240),
              status: step.status,
            })),
          },
        }
      : {}),
    ...(summary ? { summary } : {}),
  })
}
