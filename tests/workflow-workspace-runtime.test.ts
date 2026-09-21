import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import {
  WORKFLOW_SCHEMA_VERSION,
  workflowPlanSchema,
  workflowSnapshotSchema,
  workflowStateSchema,
} from '@hbar/contracts'
import type { WorkflowSnapshot } from '@hbar/contracts'
import { agentRecordSchema } from '@hbar/contracts/commands/agents'
import type { WorkflowWorkspacePort } from '@hbar/app-runtime'

const workspace = { id: 'workspace', path: 'D:/workspace', name: 'Workspace', createdAt: 1 }
const session = {
  id: 'session',
  workspaceId: workspace.id,
  title: 'Workflow session',
  archived: false,
  parentId: null,
  createdAt: 2,
  updatedAt: 3,
  seq: 4,
}

function snapshot(revision = 1, activeItemId: string | null = 'implement'): WorkflowSnapshot {
  const plan = workflowPlanSchema.parse({
    schemaVersion: WORKFLOW_SCHEMA_VERSION,
    planId: 'plan',
    sessionId: session.id,
    revision: 1,
    phase: 'active',
    objective: 'Ship verified work',
    items: [
      {
        id: 'implement',
        title: 'Implement the workflow',
        scope: { readPaths: ['src'], writePaths: ['src/workflow.ts'], tools: ['read_file', 'write_file'] },
        acceptanceChecks: [
          {
            id: 'review',
            description: 'The user reviews the integrated result',
            required: true,
            verifier: { kind: 'user' },
          },
        ],
      },
    ],
    createdAt: 10,
    updatedAt: 10,
  })
  const evidence = Array.from({ length: 21 }, (_, index) => ({
    evidenceId: `evidence-${index}`,
    itemId: 'implement',
    checkId: 'review',
    planRevision: 1,
    workspaceRevision: null,
    createdAt: 100 + index,
    source: 'user' as const,
    outcome: 'rejected' as const,
    actorId: 'reviewer',
    note: null,
  }))
  return workflowSnapshotSchema.parse({
    plan,
    workflow: workflowStateSchema.parse({
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      workflowId: 'workflow',
      sessionId: session.id,
      goalId: 'goal',
      planId: plan.planId,
      planRevision: plan.revision,
      revision,
      status: 'active',
      activeItemId,
      explorationCount: 0,
      workItems: [
        {
          ...plan.items[0]!,
          status: 'verifying',
          owner: { kind: 'main' },
          acceptanceChecks: [
            {
              ...plan.items[0]!.acceptanceChecks[0]!,
              status: 'pending',
              evidenceId: null,
              updatedAt: 10,
            },
          ],
          startedAt: 10,
          completedAt: null,
        },
      ],
      scopeExpansions: [],
      delegations: [
        {
          delegationId: 'delegation',
          itemId: 'implement',
          agentId: 'agent',
          modelId: 'local-fixture',
          tokenBudget: 100,
          status: 'patch_ready',
          patchId: 'patch',
          createdAt: 11,
          updatedAt: 12,
        },
      ],
      evidence,
      startCommand: null,
      createdAt: 10,
      updatedAt: 12,
    }),
  })
}

const agent = agentRecordSchema.parse({
  agentId: 'agent',
  parentSessionId: session.id,
  sessionId: 'agent-session',
  runId: 'agent-run',
  requestId: 'agent-request',
  objective: 'Implement the workflow',
  modelId: 'local-fixture',
  tokenBudget: 100,
  status: 'completed',
  error: null,
  isolated: true,
  resultSummary: 'Prepared the isolated patch.',
  patch: {
    patchId: 'patch',
    agentId: 'agent',
    parentSessionId: session.id,
    itemId: 'implement',
    planRevision: 1,
    status: 'ready',
    artifactId: 'artifact',
    artifactSha256: 'a'.repeat(64),
    files: [
      {
        path: 'src/workflow.ts',
        operation: 'update',
        beforeSha256: 'b'.repeat(64),
        afterSha256: 'c'.repeat(64),
      },
    ],
    summary: 'Prepared the isolated patch.',
    createdAt: 12,
    appliedAt: null,
  },
  createdAt: 11,
  updatedAt: 12,
})

function directory() {
  return {
    async execute(name: string) {
      if (name === 'session.get') return session
      if (name === 'workspace.get') return workspace
      if (name === 'session.list') return { items: [session], nextCursor: null }
      if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
      throw new Error(`Unsupported directory command: ${name}`)
    },
  }
}

test('workflow workspace projects Host facts, pages evidence, and reconciles row actions', async () => {
  let current = snapshot()
  let listener: ((value: WorkflowSnapshot) => void) | undefined
  const workflows: WorkflowWorkspacePort = {
    watch(_sessionId, callback) {
      listener = callback
      return () => {
        listener = undefined
      }
    },
    async execute(name: string, input: unknown) {
      if (name === 'workflow.get') return current
      if (name === 'workflow.acceptCheck') {
        const value = input as { itemId: string; checkId: string; expectedRevision: number }
        expect(value).toMatchObject({
          itemId: 'implement',
          checkId: 'review',
          expectedRevision: current.workflow!.revision,
        })
        current = workflowSnapshotSchema.parse({
          ...current,
          workflow: {
            ...current.workflow!,
            revision: current.workflow!.revision + 1,
            workItems: current.workflow!.workItems.map((item) => ({
              ...item,
              acceptanceChecks: item.acceptanceChecks.map((check) => ({
                ...check,
                status: 'accepted' as const,
                evidenceId: 'accepted',
              })),
            })),
          },
        })
        listener?.(current)
        return current
      }
      throw new Error(`Unsupported workflow command: ${name}`)
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'workflow-runtime',
    hostId: 'host',
    directory: directory(),
    workflows,
    agents: {
      async execute(name: string, _input: unknown, options?: { idempotencyKey?: string }) {
        if (name === 'agent.result.get') return agent
        if (name === 'agent.patch.apply') {
          expect(options?.idempotencyKey).toStartWith('ui-')
          current = workflowSnapshotSchema.parse({
            ...current,
            workflow: {
              ...current.workflow!,
              revision: current.workflow!.revision + 1,
              delegations: current.workflow!.delegations.map((delegation) => ({
                ...delegation,
                status: 'applied' as const,
              })),
            },
          })
          listener?.(current)
          return { ...agent, patch: { ...agent.patch!, status: 'applied' as const, appliedAt: 20 } }
        }
        throw new Error(`Unsupported agent command: ${name}`)
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'goals' },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'goals' })
    await runtime.view.commands.execute('workflowWorkspace.refresh', { instanceId: panel.instanceId })
    let entry = runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]!
    expect(entry.status).toBe('ready')
    expect(entry.visibleEvidence).toBe(20)
    expect(entry.agents.agent).toMatchObject({ resultSummary: 'Prepared the isolated patch.' })

    await runtime.view.commands.execute('workflowWorkspace.loadMoreEvidence', { instanceId: panel.instanceId })
    entry = runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]!
    expect(entry.visibleEvidence).toBe(21)

    await runtime.view.commands.execute('workflowWorkspace.acceptCheck', {
      instanceId: panel.instanceId,
      itemId: 'implement',
      checkId: 'review',
      decision: 'accepted',
    })
    expect(
      runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]!.snapshot.workflow?.workItems[0]
        ?.acceptanceChecks[0]?.status,
    ).toBe('accepted')

    await runtime.view.commands.execute('workflowWorkspace.applyPatch', {
      instanceId: panel.instanceId,
      agentId: 'agent',
    })
    entry = runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]!
    expect(entry.snapshot.workflow?.delegations[0]?.status).toBe('applied')
    expect(entry.actions['apply:agent']?.status).toBe('succeeded')

    listener?.(
      workflowSnapshotSchema.parse({
        ...current,
        workflow: { ...current.workflow!, revision: 50, activeItemId: 'missing' },
      }),
    )
    await Bun.sleep(0)
    expect(runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]!.snapshot.workflow).toMatchObject({
      revision: 50,
      activeItemId: 'missing',
    })
  } finally {
    runtime.dispose()
  }
})

test('workflow workspace rejects duplicate ids and does not let an older row response replace newer facts', async () => {
  let current = snapshot()
  let listener: ((value: WorkflowSnapshot) => void) | undefined
  let resolveAcceptance!: (value: WorkflowSnapshot) => void
  const acceptance = new Promise<WorkflowSnapshot>((resolve) => {
    resolveAcceptance = resolve
  })
  const workflows: WorkflowWorkspacePort = {
    watch(_sessionId, callback) {
      listener = callback
      return () => undefined
    },
    async execute(name: string) {
      if (name === 'workflow.get') return current
      if (name === 'workflow.acceptCheck') return acceptance
      throw new Error(`Unsupported workflow command: ${name}`)
    },
  }
  const runtime = createAppRuntime({
    instanceId: 'workflow-stale',
    hostId: 'host',
    directory: directory(),
    workflows,
    surfaces: { canRender: (panelId) => panelId === 'goals' },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'goals' })
    await runtime.view.commands.execute('workflowWorkspace.refresh', { instanceId: panel.instanceId })
    const pending = runtime.view.commands.execute('workflowWorkspace.acceptCheck', {
      instanceId: panel.instanceId,
      itemId: 'implement',
      checkId: 'review',
      decision: 'accepted',
    })
    const old = current
    current = workflowSnapshotSchema.parse({
      ...current,
      workflow: { ...current.workflow!, revision: 3, activeItemId: null, status: 'blocked' },
    })
    listener?.(current)
    resolveAcceptance(
      workflowSnapshotSchema.parse({ ...old, workflow: { ...old.workflow!, revision: 2, status: 'active' } }),
    )
    await pending
    const entry = runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]!
    expect(entry.snapshot.workflow).toMatchObject({ revision: 3, status: 'blocked' })
    expect(entry.actions['accept:implement:review']?.status).toBe('unknown')

    const duplicate = workflowSnapshotSchema.parse({
      ...current,
      workflow: {
        ...current.workflow!,
        revision: 4,
        workItems: [current.workflow!.workItems[0]!, current.workflow!.workItems[0]!],
      },
    })
    listener?.(duplicate)
    await Bun.sleep(0)
    expect(runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]).toMatchObject({
      status: 'error',
      error: 'DUPLICATE_ID',
    })
  } finally {
    runtime.dispose()
  }
})
