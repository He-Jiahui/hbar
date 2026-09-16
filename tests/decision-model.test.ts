import { afterEach, expect, spyOn, test } from 'bun:test'
import { HbarClient } from '../packages/client/src/index'
import { emptyUsage, type SessionSnapshot } from '@hbar/contracts'
import { useConnection, useSessions } from '../apps/web/src/stores'
import {
  answerQuestion,
  decisionKey,
  resolveApproval,
  submitQuestionnaire,
  useDecisionModel,
} from '../apps/web/src/decision-model'

const initialConnection = useConnection.getState()
const initialSessions = useSessions.getState()
afterEach(() => {
  useConnection.setState(initialConnection)
  useSessions.setState(initialSessions)
  useDecisionModel.setState({ records: {} })
})

function setup() {
  const connection = new HbarClient('http://localhost:1', 'test')
  const snapshot: SessionSnapshot = {
    session: {
      id: 'session',
      workspaceId: 'workspace',
      title: 'Decision',
      archived: false,
      parentId: null,
      createdAt: 0,
      updatedAt: 0,
      seq: 0,
    },
    approvals: [
      {
        id: 'approval',
        sessionId: 'session',
        runId: 'run',
        callId: 'call',
        tool: 'write',
        args: {},
        status: 'pending',
        createdAt: 0,
      },
    ],
    userInputs: [
      {
        requestId: 'question',
        sessionId: 'session',
        runId: 'run',
        callId: 'call',
        isBlocking: true,
        questions: [{ id: 'answer', header: 'Answer', question: 'Enter the answer', isOther: false, isSecret: true }],
      },
    ],
    messages: [],
    runs: [],
    streams: [],
    usage: emptyUsage(),
    cursor: 0,
    hasOlder: false,
  }
  useConnection.setState({ client: connection })
  useSessions.setState({ snapshots: { session: snapshot } })
  return connection
}

test('approval ignores duplicate submission and a result from a previous connection', async () => {
  const connection = setup()
  let finish!: () => void
  const call = spyOn(connection, 'call').mockReturnValueOnce(
    new Promise<null>((resolve) => {
      finish = () => resolve(null)
    }),
  )
  const first = resolveApproval('session', 'approval', 'allow')
  await resolveApproval('session', 'approval', 'deny')
  expect(call).toHaveBeenCalledTimes(1)
  const key = decisionKey('session', 'approval', 'approval')
  const pending = useDecisionModel.getState().records[key]
  expect(pending?.state.status).toBe('pending')
  useConnection.setState({ client: new HbarClient('http://localhost:2', 'test') })
  finish()
  await first
  expect(useDecisionModel.getState().records[key]).toBe(pending)
})

test('questionnaire retains answers on failure, retries, and clears secret values only after acceptance', async () => {
  const connection = setup()
  const call = spyOn(connection, 'call')
    .mockRejectedValueOnce(new Error('Temporary failure'))
    .mockResolvedValueOnce({ accepted: true })
  answerQuestion('session', 'question', 'answer', { kind: 'custom', value: 'secret answer' })
  await submitQuestionnaire('session', 'question')
  const key = decisionKey('session', 'question', 'question')
  expect(useDecisionModel.getState().records[key]?.state).toEqual({ status: 'idle', error: 'Temporary failure' })
  expect(useDecisionModel.getState().records[key]?.answers.answer?.value).toBe('secret answer')
  await submitQuestionnaire('session', 'question')
  expect(call).toHaveBeenLastCalledWith('user_input.resolve', {
    requestId: 'question',
    answers: { answer: { answers: ['secret answer'] } },
  })
  expect(useDecisionModel.getState().records[key]?.state.status).toBe('complete')
  expect(useDecisionModel.getState().records[key]?.answers).toEqual({})
})

test('removed targets and disconnected actions cannot dispatch to another target', async () => {
  const connection = setup()
  const call = spyOn(connection, 'call')
  useSessions.setState({ snapshots: {} })
  await resolveApproval('session', 'approval', 'allow')
  await submitQuestionnaire('session', 'question')
  useConnection.setState({ client: null })
  await submitQuestionnaire('session', 'question')
  expect(call).not.toHaveBeenCalled()
})
