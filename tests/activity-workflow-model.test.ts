import { expect, test } from 'bun:test'
import { workflowSnapshotSchema } from '@hbar/contracts'
import type { WorkflowWorkspaceEntryState } from '@hbar/app-runtime'
import { agentRecordSchema } from '@hbar/contracts/commands/agents'
import { projectActivityWorkflow } from '../packages/app-react/src/activity-workflow-model'

function entry(count: number): WorkflowWorkspaceEntryState {
  return {
    instanceId: 'activity',
    sessionId: 'parent',
    status: 'ready',
    agents: {},
    visibleEvidence: 0,
    actions: {},
    error: null,
    snapshot: workflowSnapshotSchema.parse({
      plan: null,
      workflow: {
        schemaVersion: 2,
        workflowId: 'workflow',
        sessionId: 'parent',
        goalId: null,
        planRevision: 1,
        revision: 1,
        status: 'active',
        explorationCount: 0,
        focus: null,
        scopeExpansions: [],
        evidence: [],
        createdAt: 1,
        updatedAt: 1,
        delegations: Array.from({ length: count }, (_, index) => ({
          delegationId: `delegation-${index}`,
          itemId: 'focus',
          agentId: `agent-${index}`,
          modelId: 'local-fixture',
          tokenBudget: null,
          status: 'queued',
          patchId: null,
          createdAt: index,
          updatedAt: index,
        })),
      },
    }),
  }
}
const agent = agentRecordSchema.parse({
  agentId: 'agent-0',
  parentSessionId: 'parent',
  sessionId: 'child',
  runId: 'run',
  requestId: 'request',
  objective: '核对很长的工作流目标',
  modelId: 'local-fixture',
  tokenBudget: null,
  status: 'running',
  error: null,
  createdAt: 0,
  updatedAt: 1,
})
test('Workflow Activity respects the public delegation bound and never invents a queued child', () => {
  for (const count of [0, 1, 128]) {
    const view = projectActivityWorkflow(entry(count), 'parent', [])
    expect(view.other).toHaveLength(count)
    expect(view.representedAgentIds.size).toBe(0)
  }
  expect(() => entry(129)).toThrow()
  expect(projectActivityWorkflow(entry(1), 'other', [agent]).workflow).toBeNull()
})
test('verified live Agent records are represented once and newer delegation status wins', () => {
  const original = entry(1)
  const workflow = original.snapshot.workflow
  if (!workflow || !workflow.delegations[0]) throw new Error('Missing fixture Workflow')
  const current = {
    ...original,
    snapshot: {
      ...original.snapshot,
      workflow: {
        ...workflow,
        delegations: [
          ...workflow.delegations,
          { ...workflow.delegations[0], delegationId: 'newer', status: 'failed' as const, updatedAt: 2 },
        ],
      },
    },
  }
  const view = projectActivityWorkflow(current, 'parent', [agent])
  expect(view.other).toHaveLength(1)
  expect(view.other[0]?.delegation.status).toBe('failed')
  expect(view.settled(view.other)).toBe(1)
  expect([...view.representedAgentIds]).toEqual([agent.agentId])
  expect(view.other[0]?.agent?.sessionId).toBe('child')
  expect(
    projectActivityWorkflow(current, 'parent', [{ ...agent, parentSessionId: 'foreign' }]).representedAgentIds.size,
  ).toBe(0)
})

test('actual focus groups only its own delegates and a replaced focus cannot relabel older work', () => {
  const original = entry(2)
  const workflow = original.snapshot.workflow
  if (!workflow) throw new Error('Missing Workflow')
  const focus = {
    focusId: 'focus',
    planRevision: 1,
    stepIndex: 0,
    stepTextHash: 'a'.repeat(64),
    title: '当前步骤的长标题',
    status: 'delegated' as const,
    scope: { readPaths: [], writePaths: [], tools: [] },
    acceptanceChecks: [],
    completionPolicy: 'agent' as const,
    startedAt: 1,
    completedAt: null,
  }
  const current = { ...original, snapshot: { ...original.snapshot, workflow: { ...workflow, focus } } }
  expect(projectActivityWorkflow(current, 'parent', [agent]).focused).toHaveLength(2)
  const replaced = {
    ...current,
    snapshot: {
      ...current.snapshot,
      workflow: { ...current.snapshot.workflow, focus: { ...focus, focusId: 'new-focus' } },
    },
  }
  const view = projectActivityWorkflow(replaced, 'parent', [agent])
  expect(view.focused).toHaveLength(0)
  expect(view.other).toHaveLength(2)
  expect(view.workflow?.focus?.title).toBe(focus.title)
})
