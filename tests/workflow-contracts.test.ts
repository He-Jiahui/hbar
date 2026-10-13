import { expect, test } from 'bun:test'
import { describeCommand } from '@hbar/commands'
import {
  MAX_WORKFLOW_DELEGATIONS,
  MAX_WORKFLOW_DEPENDENCIES_PER_ITEM,
  MAX_WORKFLOW_DEPENDENCY_EDGES,
  MAX_WORKFLOW_EVIDENCE,
  MAX_WORKFLOW_ITEMS,
  WORKFLOW_SCHEMA_VERSION,
  agentPatchSchema,
  workflowPlanSchema,
  workflowWorkItemSchema,
  workflowSnapshotSchema,
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

test('workflow plan targets are optional for legacy items, unique per item, and globally bounded', () => {
  const base = {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    planId: 'plan-targets',
    sessionId: 'parent-session',
    revision: 2,
    phase: 'draft' as const,
    objective: 'Run independent work items in existing sessions',
    items: [{ ...item, targetSessionIds: ['target-a', 'target-b'] }],
    createdAt: 1,
    updatedAt: 2,
  }
  const plan = workflowPlanSchema.parse(base)
  expect(plan.items[0]?.targetSessionIds).toEqual(['target-a', 'target-b'])
  expect(workflowSnapshotSchema.parse({ plan: null, workflowPlan: plan, workflow: null })).toMatchObject({
    workflowPlan: {
      planId: plan.planId,
      revision: plan.revision,
      items: [{ targetSessionIds: ['target-a', 'target-b'] }],
    },
    targetDispatches: [],
  })
  expect(workflowPlanSchema.parse({ ...base, items: [item] }).items[0]?.targetSessionIds).toBeUndefined()
  expect(
    workflowPlanSchema.safeParse({ ...base, items: [{ ...item, targetSessionIds: ['target-a', 'target-a'] }] }).success,
  ).toBe(false)
  expect(
    workflowPlanSchema.safeParse({
      ...base,
      items: Array.from({ length: 3 }, (_, index) => ({
        ...item,
        id: `item-${index}`,
        targetSessionIds: Array.from({ length: 8 }, (_, targetIndex) => `target-${index}-${targetIndex}`),
      })),
    }).success,
  ).toBe(false)
})

test('workflow Plan dependencies are optional, bounded, unique, same-Plan, and topological', () => {
  const base = {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    planId: 'plan-dependencies',
    sessionId: 'session-dependencies',
    revision: 1,
    phase: 'draft' as const,
    objective: 'Validate item ordering',
    createdAt: 1,
    updatedAt: 1,
  }
  const parseItems = (items: unknown[]) => workflowPlanSchema.safeParse({ ...base, items })
  const dependencyPlan = parseItems([
    { ...item, id: 'a' },
    { ...item, id: 'b', dependsOnItemIds: ['a'] },
  ])
  expect(dependencyPlan.success).toBe(true)
  if (dependencyPlan.success) expect(dependencyPlan.data.items[0]?.dependsOnItemIds).toBeUndefined()
  expect(
    parseItems([
      { ...item, id: 'a' },
      { ...item, id: 'b' },
    ]).success,
  ).toBe(true)
  expect(parseItems([{ ...item, id: 'a', dependsOnItemIds: ['a'] }]).success).toBe(false)
  expect(parseItems([{ ...item, id: 'a', dependsOnItemIds: ['missing'] }]).success).toBe(false)
  expect(
    parseItems([
      { ...item, id: 'a', dependsOnItemIds: ['b'] },
      { ...item, id: 'b', dependsOnItemIds: ['a'] },
    ]).success,
  ).toBe(false)
  expect(
    parseItems([
      { ...item, id: 'a' },
      { ...item, id: 'b', dependsOnItemIds: ['a', 'a'] },
    ]).success,
  ).toBe(false)
  expect(
    parseItems([
      { ...item, id: 'a' },
      { ...item, id: 'b', dependsOnItemIds: ['a'] },
      { ...item, id: 'c', dependsOnItemIds: ['a', 'b'] },
    ]).success,
  ).toBe(true)
  expect(MAX_WORKFLOW_DEPENDENCIES_PER_ITEM).toBe(99)
  const maximumPerItem = Array.from({ length: 100 }, (_, index) => ({
    ...item,
    id: `dep-${index}`,
    ...(index === 99
      ? { dependsOnItemIds: Array.from({ length: 99 }, (_, dependencyIndex) => `dep-${dependencyIndex}`) }
      : {}),
  }))
  expect(parseItems(maximumPerItem).success).toBe(true)
  const excessiveTotal = Array.from({ length: 47 }, (_, index) => ({
    ...item,
    id: `edge-${index}`,
    dependsOnItemIds: Array.from({ length: index }, (_, dependencyIndex) => `edge-${dependencyIndex}`),
  }))
  expect(excessiveTotal.reduce((total, entry) => total + (entry.dependsOnItemIds?.length ?? 0), 0)).toBeGreaterThan(
    MAX_WORKFLOW_DEPENDENCY_EDGES,
  )
  expect(parseItems(excessiveTotal).success).toBe(false)
})

test('dependency metadata is rejected by legacy focus and strict WorkItem contracts', () => {
  expect(
    workflowCommands['workflow.focus.set'].input.safeParse({
      sessionId: 'session-1',
      stepIndex: 0,
      item: { ...item, dependsOnItemIds: ['another-item'] },
      expectedPlanRevision: 1,
    }).success,
  ).toBe(false)
  expect(
    workflowWorkItemSchema.safeParse({
      ...item,
      dependsOnItemIds: ['another-item'],
      status: 'pending',
      owner: { kind: 'main' },
      startedAt: null,
      completedAt: null,
      acceptanceChecks: [],
    }).success,
  ).toBe(false)
})

test('workflow scopes reject paths outside the workspace', () => {
  const input = workflowCommands['workflow.start'].input
  for (const path of ['../secrets.txt', 'C:/secrets.txt', '/etc/passwd', 'apps/web/**', '**/*']) {
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

test('workflow TODO contracts enforce empty, single, capacity, overflow, and duplicate-ID boundaries', () => {
  const input = workflowCommands['workflow.start'].input
  const parseItems = (items: unknown[]) =>
    input.safeParse({ sessionId: 'session-1', objective: 'Exercise TODO capacity', items })
  const items = Array.from({ length: MAX_WORKFLOW_ITEMS }, (_, index) => ({
    ...item,
    id: `item-${index}`,
    title: `Item ${index}`,
  }))

  expect(parseItems([]).success).toBeFalse()
  expect(parseItems([item]).success).toBeTrue()
  expect(parseItems(items).success).toBeTrue()
  expect(parseItems([...items, { ...item, id: 'overflow' }]).success).toBeFalse()
  expect(
    parseItems([
      { ...item, id: 'duplicate' },
      { ...item, id: 'duplicate' },
    ]).success,
  ).toBeFalse()
  expect(
    parseItems([
      {
        ...item,
        acceptanceChecks: [item.acceptanceChecks[0], item.acceptanceChecks[0]],
      },
    ]).success,
  ).toBeFalse()
})

test('workflow evidence and Agent lists accept capacity and reject overflow or duplicate IDs', () => {
  const workItem = {
    ...item,
    status: 'in_progress' as const,
    owner: { kind: 'main' as const },
    acceptanceChecks: item.acceptanceChecks.map((check) => ({
      ...check,
      required: true,
      status: 'pending' as const,
      evidenceId: null,
      updatedAt: 1,
    })),
    startedAt: 1,
    completedAt: null,
  }
  const baseState = {
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    workflowId: 'workflow-capacity',
    sessionId: 'session-1',
    goalId: null,
    planId: 'plan-capacity',
    planRevision: 1,
    revision: 1,
    status: 'active' as const,
    activeItemId: item.id,
    explorationCount: 0,
    workItems: [workItem],
    scopeExpansions: [],
    delegations: [],
    evidence: [],
    createdAt: 1,
    updatedAt: 1,
  }
  const delegations = Array.from({ length: MAX_WORKFLOW_DELEGATIONS }, (_, index) => ({
    delegationId: `delegation-${index}`,
    itemId: item.id,
    agentId: null,
    modelId: 'local-fixture',
    tokenBudget: null,
    status: 'queued' as const,
    patchId: null,
    createdAt: 1,
    updatedAt: 1,
  }))
  const evidence = Array.from({ length: MAX_WORKFLOW_EVIDENCE }, (_, index) => ({
    evidenceId: `evidence-${index}`,
    itemId: item.id,
    checkId: 'contracts-test',
    planRevision: 1,
    workspaceRevision: null,
    createdAt: 1,
    source: 'user' as const,
    outcome: 'accepted' as const,
    actorId: 'user-1',
    note: null,
  }))

  expect(workflowStateSchema.safeParse({ ...baseState, delegations, evidence }).success).toBeTrue()
  expect(
    workflowStateSchema.safeParse({
      ...baseState,
      delegations: [...delegations, { ...delegations[0]!, delegationId: 'delegation-overflow' }],
    }).success,
  ).toBeFalse()
  expect(
    workflowStateSchema.safeParse({
      ...baseState,
      evidence: [...evidence, { ...evidence[0]!, evidenceId: 'evidence-overflow' }],
    }).success,
  ).toBeFalse()
  expect(
    workflowStateSchema.safeParse({ ...baseState, delegations: [delegations[0]!, delegations[0]!] }).success,
  ).toBeFalse()
  expect(workflowStateSchema.safeParse({ ...baseState, evidence: [evidence[0]!, evidence[0]!] }).success).toBeFalse()
})
