import { expect, test } from 'bun:test'
import { agentToolOpenIdentity } from '../packages/app-react/src/agent-tool-open-model'
import type { SessionToolRow } from '../packages/app-react/src/session-message-model'
import type { AgentToolResult } from '@hbar/contracts/commands/agents'

const details: AgentToolResult = {
  agentId: 'child',
  parentSessionId: 'parent',
  sessionId: 'child',
  requestId: 'request',
  profileId: 'explore',
  objective: '检查本次导航 — 长说明应保留来源',
  modelId: 'model',
  status: 'queued',
}
function row(overrides: Partial<SessionToolRow> = {}): SessionToolRow {
  return {
    kind: 'tool',
    id: 'call:agent',
    name: 'agent',
    call: { type: 'tool_call', name: 'agent', callId: 'call', args: {} },
    result: { type: 'tool_result', name: 'agent', callId: 'call', text: 'not parsed', isError: false, details },
    ...overrides,
  }
}
test('Agent open entrance uses the typed successful result identity without parsing output text', () => {
  expect(agentToolOpenIdentity(row(), 'parent')).toEqual(details)
  expect(agentToolOpenIdentity(row(), 'other')).toBeNull()
  const { call: _call, ...withoutCall } = row()
  const { result: _result, ...withoutResult } = row()
  expect(agentToolOpenIdentity(withoutCall, 'parent')).toBeNull()
  expect(agentToolOpenIdentity(withoutResult, 'parent')).toBeNull()
})
test('failed, malformed, mismatched, self-target and ordinary results do not gain Agent navigation', () => {
  const result = row().result
  if (!result) throw new Error('Missing test result')
  for (const changed of [
    { ...result, isError: true },
    { ...result, outcome: { kind: 'failed' as const, executionStarted: true } },
    { ...result, details: undefined, text: JSON.stringify(details) },
    { ...result, callId: 'other' },
    { ...result, name: 'read_file' },
    { ...result, details: { ...details, sessionId: 'parent' } },
    { ...result, details: { ...details, profileId: 'imaginary' } },
    { ...result, details: { ...details, objective: 'x'.repeat(4_001) } },
  ])
    expect(agentToolOpenIdentity(row({ result: changed }), 'parent')).toBeNull()
  expect(agentToolOpenIdentity(row({ name: 'read_file' }), 'parent')).toBeNull()
})
