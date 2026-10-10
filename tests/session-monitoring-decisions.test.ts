import { expect, test } from 'bun:test'
import { projectSessionDecisions } from '@hbar/app-runtime'
import type { Approval, Message } from '@hbar/contracts'
import { monitoringDecisions, settledSessionDecision } from '../packages/app-react/src/session-monitoring-decisions'

const approval = (id: string, status: Approval['status']): Approval => ({
  id,
  sessionId: 'session',
  runId: 'run',
  callId: `call-${id}`,
  tool: 'write_file',
  args: { path: 'example.txt', text: 'source' },
  status,
  createdAt: 1,
})
const call = (value: Approval): Message => ({
  id: `message-${value.id}`,
  sessionId: value.sessionId,
  runId: value.runId,
  role: 'assistant',
  seq: 1,
  createdAt: 1,
  content: [{ type: 'tool_call', callId: value.callId, name: value.tool, args: value.args }],
})

test('settled linked and unlinked confirmations share status history, while pending input stays in conversation', () => {
  const linked = approval('linked', 'allowed')
  const unmatched = approval('old', 'denied')
  const pending = approval('pending', 'pending')
  const foreign = { ...approval('foreign', 'cancelled'), sessionId: 'other' }
  const projection = projectSessionDecisions({
    sessionId: 'session',
    messages: [call(linked), call(pending)],
    approvals: [linked, unmatched, pending, foreign],
    userInputs: [],
    events: [],
    actions: {},
  })
  const settled = monitoringDecisions(projection, {})
  expect(settled.map((decision) => decision.id)).toEqual(['old', 'linked'])
  expect(settled.every((decision) => settledSessionDecision(decision, {}))).toBe(true)
  expect(
    [...projection.byMessage.values()]
      .flatMap((rows) => [...rows.values()].flat())
      .filter((decision) => !settledSessionDecision(decision, {}))
      .map((decision) => decision.id),
  ).toEqual(['pending'])
})

test('duplicate projections keep one historical identity without changing original approval data', () => {
  const value = approval('same', 'cancelled')
  const projection = projectSessionDecisions({
    sessionId: 'session',
    messages: [],
    approvals: [value, value],
    userInputs: [],
    events: [],
    actions: {},
  })
  const settled = monitoringDecisions(projection, {})
  expect(settled).toHaveLength(1)
  const decision = settled[0]
  if (!decision || decision.kind !== 'approval') throw new Error('Missing approval record')
  expect(decision.approval).toBe(value)
})
