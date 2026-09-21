import { expect, test } from 'bun:test'
import { describeCommand } from '@hbar/commands'
import {
  WORKFLOW_SCHEMA_VERSION,
  agentPatchSchema,
  workflowPlanSchema,
  workflowStateSchema,
} from '@hbar/contracts/workflow'
import { workflowCommands } from '@hbar/contracts/commands/workflows'

const item = {
  id: 'inspect',
  title: 'Inspect the relevant implementation',
  scope: { readPaths: ['packages/contracts'], writePaths: [], tools: ['workspace_search'] },
  acceptanceChecks: [
    {
      id: 'contracts-test',
      description: 'The focused contracts test passes',
      verifier: { kind: 'tool' as const, toolName: 'exec', expectedArguments: { command: 'bun test' } },
    },
  ],
}

test('workflow contracts describe versioned plans, focus state, and command metadata', () => {
  const plan = workflowPlanSchema.parse({
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    planId: 'plan-1',
    sessionId: 'session-1',
    revision: 1,
    phase: 'draft',
    objective: 'Implement a focused workflow',
    items: [item],
    createdAt: 1,
    updatedAt: 1,
  })
  const state = workflowStateSchema.parse({
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    workflowId: 'workflow-1',
    sessionId: 'session-1',
    goalId: null,
    planId: plan.planId,
    planRevision: plan.revision,
    revision: 1,
    status: 'active',
    activeItemId: item.id,
    explorationCount: 0,
    workItems: [
      {
        ...item,
        status: 'in_progress',
        owner: { kind: 'main' },
        acceptanceChecks: item.acceptanceChecks.map((check) => ({
          ...check,
          required: true,
          status: 'pending',
          evidenceId: null,
          updatedAt: 1,
        })),
        startedAt: 1,
        completedAt: null,
      },
    ],
    scopeExpansions: [],
    delegations: [],
    evidence: [],
    createdAt: 1,
    updatedAt: 1,
  })

  expect(state.activeItemId).toBe('inspect')
  expect(describeCommand(workflowCommands['workflow.start']).metadata).toMatchObject({
    owner: 'hbar.workflow',
    idempotency: 'required',
    stateEffect: 'persistent',
  })
  expect(describeCommand(workflowCommands['workflow.get']).metadata).toMatchObject({
    kind: 'query',
    stateEffect: 'none',
  })
})

test('workflow scopes reject paths outside the workspace', () => {
  const input = workflowCommands['workflow.start'].input
  for (const path of ['../secrets.txt', 'C:/secrets.txt', '/etc/passwd']) {
    expect(
      input.safeParse({
        sessionId: 'session-1',
        objective: 'Inspect one path',
        items: [{ ...item, scope: { readPaths: [path], writePaths: [], tools: [] } }],
      }).success,
    ).toBeFalse()
  }
})

test('agent patches bind every file to before and after hashes', () => {
  const hash = 'a'.repeat(64)
  expect(
    agentPatchSchema.parse({
      patchId: 'patch-1',
      agentId: 'agent-1',
      parentSessionId: 'session-1',
      itemId: 'inspect',
      planRevision: 1,
      status: 'ready',
      artifactId: 'artifact-1',
      artifactSha256: hash,
      files: [{ path: 'src/index.ts', operation: 'update', beforeSha256: hash, afterSha256: hash }],
      summary: 'Updated one file',
      createdAt: 1,
      appliedAt: null,
    }).files,
  ).toHaveLength(1)
  expect(
    agentPatchSchema.safeParse({
      patchId: 'patch-1',
      agentId: 'agent-1',
      parentSessionId: 'session-1',
      itemId: 'inspect',
      planRevision: 1,
      status: 'ready',
      artifactId: 'artifact-1',
      artifactSha256: hash,
      files: [{ path: '../outside.ts', operation: 'update', beforeSha256: hash, afterSha256: hash }],
      summary: '',
      createdAt: 1,
      appliedAt: null,
    }).success,
  ).toBeFalse()
})
