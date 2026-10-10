import { z } from 'zod'
import {
  userInputQuestionSchema,
  userInputResponseSchema,
  type Approval,
  type UserInputRequest,
  type UserInputResponse,
} from '@hbar/contracts'
import type { InteractionActionState, InteractionState, SessionTimelineState } from './types'

type Message = SessionTimelineState['messages'][number]
type Call = Extract<Message['content'][number], { type: 'tool_call' }>
export type QuestionnaireFact =
  | { readonly status: 'answered'; readonly answers: UserInputResponse['answers'] }
  | { readonly status: 'cancelled' | 'failed'; readonly answers: null }

const questionsSchema = z.object({ questions: z.array(userInputQuestionSchema).min(1).max(3) })
const cancellationSchema = z.object({ requestId: z.string(), sessionId: z.string(), cancelled: z.literal(true) })

/** A missing live request is not evidence of either an answer or cancellation. */
export function questionnaireFact(
  request: Pick<UserInputRequest, 'sessionId' | 'runId' | 'callId' | 'questions'> & {
    readonly requestId: string | null
  },
  messages: readonly Message[],
  events: SessionTimelineState['events'],
): QuestionnaireFact | null {
  if (
    request.requestId &&
    events.some((event) => {
      if (
        event.sessionId !== request.sessionId ||
        event.runId !== request.runId ||
        event.type !== 'user_input.resolved'
      )
        return false
      const data = cancellationSchema.safeParse(event.data)
      return data.success && data.data.sessionId === request.sessionId && data.data.requestId === request.requestId
    })
  )
    return { status: 'cancelled', answers: null }
  const results = messages.flatMap((message) =>
    message.sessionId === request.sessionId && message.runId === request.runId
      ? message.content.filter(
          (block) =>
            block.type === 'tool_result' && block.callId === request.callId && block.name === 'request_user_input',
        )
      : [],
  )
  const result = results.length === 1 ? results[0] : undefined
  if (result?.type === 'tool_result') {
    if (result.isError) return { status: 'failed', answers: null }
    let raw: unknown = result.details
    if (raw === undefined) {
      try {
        raw = JSON.parse(result.text)
      } catch {
        return null
      }
    }
    const parsed = userInputResponseSchema.safeParse(raw)
    if (
      parsed.success &&
      Object.keys(parsed.data.answers).every((id) => request.questions.some((question) => question.id === id)) &&
      request.questions.every((question) => parsed.data.answers[question.id]?.answers.some((answer) => answer.trim()))
    )
      return { status: 'answered', answers: parsed.data.answers }
  }
  return null
}

export type SessionDecision =
  | {
      readonly kind: 'approval'
      readonly id: string
      readonly sessionId: string
      readonly runId: string
      readonly callId: string
      readonly tool: string
      readonly approval: Readonly<Approval>
    }
  | {
      readonly kind: 'questionnaire'
      readonly id: string
      readonly sessionId: string
      readonly runId: string
      readonly callId: string
      readonly tool: string
      readonly requestId: string | null
      readonly questions: UserInputRequest['questions']
      readonly pending: boolean
      readonly fact: QuestionnaireFact | null
    }

export interface SessionDecisionProjection {
  readonly byMessage: ReadonlyMap<string, ReadonlyMap<string, readonly SessionDecision[]>>
  readonly fallback: readonly SessionDecision[]
  /** Settled decisions whose tool call is outside the loaded window; hosts may reveal them through a bounded history view. */
  readonly settledHistory: readonly SessionDecision[]
}
export function sessionDecisionAction(
  decision: SessionDecision,
  actions: InteractionState,
): InteractionActionState | undefined {
  const action =
    actions[decision.kind === 'approval' ? `approval:${decision.id}` : `questionnaire:${decision.requestId ?? ''}`]
  return action?.sessionId === decision.sessionId ? action : undefined
}

/** Exact immutable facts only. Ambiguous/missing calls retain their Run-area fallback. */
export function projectSessionDecisions(
  input: Pick<SessionTimelineState, 'sessionId' | 'messages' | 'approvals' | 'userInputs' | 'events'> & {
    readonly actions: InteractionState
  },
): SessionDecisionProjection {
  const calls = new Map<string, { message: Message; call: Call }[]>()
  const scoped = (sessionId: string, runId: string, callId: string) => JSON.stringify([sessionId, runId, callId])
  for (const message of input.messages) {
    if (message.sessionId !== input.sessionId || message.role !== 'assistant') continue
    for (const call of message.content)
      if (call.type === 'tool_call') {
        const key = scoped(message.sessionId, message.runId, call.callId)
        calls.set(key, [...(calls.get(key) ?? []), { message, call }])
      }
  }
  const decisions: SessionDecision[] = input.approvals
    .filter((value) => value.sessionId === input.sessionId)
    .map((approval) => ({
      kind: 'approval',
      id: approval.id,
      sessionId: approval.sessionId,
      runId: approval.runId,
      callId: approval.callId,
      tool: approval.tool,
      approval,
    }))
  for (const action of Object.values(input.actions)) {
    const approval = action.approval
    if (
      approval &&
      approval.sessionId === input.sessionId &&
      !decisions.some((decision) => decision.kind === 'approval' && decision.id === approval.id)
    )
      decisions.push({
        kind: 'approval',
        id: approval.id,
        sessionId: approval.sessionId,
        runId: approval.runId,
        callId: approval.callId,
        tool: approval.tool,
        approval,
      })
  }
  const requests = new Map(
    input.userInputs
      .filter((request) => request.sessionId === input.sessionId)
      .map((request) => [request.requestId, request]),
  )
  for (const action of Object.values(input.actions))
    if (action.sessionId === input.sessionId && action.request && !requests.has(action.request.requestId))
      requests.set(action.request.requestId, action.request)
  const knownCalls = new Set<string>()
  for (const request of requests.values()) {
    const key = scoped(request.sessionId, request.runId, request.callId)
    knownCalls.add(key)
    decisions.push({
      kind: 'questionnaire',
      id: request.requestId,
      sessionId: request.sessionId,
      runId: request.runId,
      callId: request.callId,
      tool: 'request_user_input',
      requestId: request.requestId,
      questions: request.questions,
      pending: input.userInputs.some(
        (item) => item.requestId === request.requestId && item.sessionId === request.sessionId,
      ),
      fact:
        questionnaireFact(request, input.messages, input.events) ??
        (input.actions[`questionnaire:${request.requestId}`]?.sessionId === request.sessionId
          ? (input.actions[`questionnaire:${request.requestId}`]?.questionnaireFact ?? null)
          : null),
    })
  }
  for (const [key, matches] of calls) {
    if (knownCalls.has(key) || matches.length !== 1) continue
    const match = matches[0]!
    if (match.call.name !== 'request_user_input') continue
    const parsed = questionsSchema.safeParse(match.call.args)
    if (
      !parsed.success ||
      new Set(parsed.data.questions.map((question) => question.id)).size !== parsed.data.questions.length
    )
      continue
    const request = {
      sessionId: match.message.sessionId,
      runId: match.message.runId,
      callId: match.call.callId,
      requestId: null,
      questions: parsed.data.questions,
    }
    const fact = questionnaireFact(request, input.messages, input.events)
    if (fact)
      decisions.push({
        kind: 'questionnaire',
        id: `history:${key}`,
        ...request,
        tool: match.call.name,
        pending: false,
        fact,
      })
  }
  const byMessage = new Map<string, Map<string, SessionDecision[]>>()
  const fallback: SessionDecision[] = []
  const settledHistory: SessionDecision[] = []
  for (const decision of decisions) {
    const matches = calls.get(scoped(decision.sessionId, decision.runId, decision.callId))
    const match = matches?.length === 1 && matches[0]?.call.name === decision.tool ? matches[0] : undefined
    if (!match) {
      const action = sessionDecisionAction(decision, input.actions)
      const uncertain = action?.status === 'unknown' || action?.status === 'submitting' || action?.status === 'failed'
      const actionable =
        decision.kind === 'approval'
          ? decision.approval.status === 'pending'
          : decision.pending || decision.fact === null
      if (actionable || uncertain) fallback.push(decision)
      else settledHistory.push(decision)
      continue
    }
    const rows = byMessage.get(match.message.id) ?? new Map<string, SessionDecision[]>()
    const key = JSON.stringify([decision.callId, decision.tool])
    rows.set(key, [...(rows.get(key) ?? []), decision])
    byMessage.set(match.message.id, rows)
  }
  return { byMessage, fallback, settledHistory }
}
