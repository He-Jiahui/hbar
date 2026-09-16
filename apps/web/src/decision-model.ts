import { create } from 'zustand'
import type { HbarClient } from '@hbar/client'
import type { HbarAppUiApprovalDecision, HbarAppUiDecisionState, HbarAppUiQuestionAnswer } from 'hbar-app-ui'
import { setApprovalMode, useConnection, useSessions } from './stores'
import { translate } from './locale'
import { useWorkbench } from './stores'

interface DecisionRecord {
  readonly source: HbarClient
  readonly state: HbarAppUiDecisionState
  readonly answers: Readonly<Record<string, HbarAppUiQuestionAnswer>>
}
export const useDecisionModel = create<{ records: Readonly<Record<string, DecisionRecord>> }>(() => ({ records: {} }))
export const IDLE_DECISION: HbarAppUiDecisionState = { status: 'idle' }
export const EMPTY_ANSWERS: Readonly<Record<string, HbarAppUiQuestionAnswer>> = {}
export function decisionKey(sessionId: string, kind: 'approval' | 'question', id: string): string {
  return JSON.stringify([sessionId, kind, id])
}
const MAX_SETTLED_DECISIONS = 100

function write(key: string, value: DecisionRecord) {
  useDecisionModel.setState((current) => {
    const records = Object.entries(current.records).filter(
      ([id, record]) => id !== key && record.source === value.source,
    )
    const pending = records.filter(([, record]) => record.state.status === 'pending')
    const settled = records.filter(([, record]) => record.state.status !== 'pending').slice(-MAX_SETTLED_DECISIONS)
    return { records: Object.fromEntries([...settled, ...pending, [key, value]]) }
  })
}
function recordFor(key: string, connection: HbarClient): DecisionRecord {
  const record = useDecisionModel.getState().records[key]
  return record?.source === connection ? record : { source: connection, state: IDLE_DECISION, answers: EMPTY_ANSWERS }
}

export function answerQuestion(
  sessionId: string,
  requestId: string,
  questionId: string,
  answer: HbarAppUiQuestionAnswer,
) {
  const request = useSessions.getState().snapshots[sessionId]?.userInputs.find((item) => item.requestId === requestId)
  if (!request?.questions.some((question) => question.id === questionId)) return
  const connection = useConnection.getState().client
  if (!connection) return
  const key = decisionKey(sessionId, 'question', requestId),
    record = recordFor(key, connection)
  if (record.state.status !== 'idle') return
  write(key, { ...record, state: IDLE_DECISION, answers: { ...record.answers, [questionId]: answer } })
}

export async function submitQuestionnaire(sessionId: string, requestId: string): Promise<void> {
  const connection = useConnection.getState().client
  if (!connection) return
  const key = decisionKey(sessionId, 'question', requestId),
    record = recordFor(key, connection)
  if (record.state.status !== 'idle') return
  const request = useSessions.getState().snapshots[sessionId]?.userInputs.find((item) => item.requestId === requestId)
  if (!request) return
  const locale = useWorkbench.getState().locale
  const valid = request.questions.every((question) => {
    const answer = record.answers[question.id]
    return (
      answer?.value.trim() &&
      (answer.kind === 'option'
        ? question.options?.some((option) => option.label === answer.value)
        : !question.options?.length || question.isOther !== false)
    )
  })
  if (!valid) {
    write(key, { ...record, state: { status: 'idle', error: translate(locale, 'chatAnswerAllQuestions') } })
    return
  }
  write(key, { ...record, state: { status: 'pending' } })
  try {
    const answers = Object.fromEntries(
      request.questions.map((question) => [question.id, { answers: [record.answers[question.id]!.value.trim()] }]),
    )
    const result = await connection.call('user_input.resolve', { requestId, answers })
    if (useConnection.getState().client !== connection) return
    write(key, {
      ...record,
      answers: result.accepted ? EMPTY_ANSWERS : record.answers,
      state: result.accepted
        ? { status: 'complete' }
        : { status: 'idle', error: translate(locale, 'chatInputHandled') },
    })
  } catch (cause) {
    if (useConnection.getState().client === connection)
      write(key, {
        ...record,
        state: {
          status: 'idle',
          error: cause instanceof Error ? cause.message : translate(locale, 'chatSubmitFailed'),
        },
      })
  }
}

export async function resolveApproval(
  sessionId: string,
  approvalId: string,
  decision: HbarAppUiApprovalDecision,
): Promise<void> {
  if (
    !useSessions
      .getState()
      .snapshots[sessionId]?.approvals.some((item) => item.id === approvalId && item.status === 'pending')
  )
    return
  const connection = useConnection.getState().client
  if (!connection) return
  const key = decisionKey(sessionId, 'approval', approvalId),
    record = recordFor(key, connection)
  if (record.state.status !== 'idle') return
  const locale = useWorkbench.getState().locale
  write(key, { ...record, state: { status: 'pending' } })
  try {
    if (decision === 'allow_always' && !(await setApprovalMode('allow')))
      throw new Error(translate(locale, 'saveFailure'))
    if (useConnection.getState().client !== connection) return
    await connection.call('approval.resolve', { approvalId, decision: decision === 'deny' ? 'denied' : 'allowed' })
    if (useConnection.getState().client === connection) write(key, { ...record, state: { status: 'complete' } })
  } catch (cause) {
    if (useConnection.getState().client === connection)
      write(key, {
        ...record,
        state: {
          status: 'idle',
          error: cause instanceof Error ? cause.message : translate(locale, 'approvalSubmitFailed'),
        },
      })
  }
}
