import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import {
  WORKFLOW_SCHEMA_VERSION,
  planStateSchema,
  workflowPublicStateSchema,
  workflowSnapshotSchema,
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
  const plan = planStateSchema.parse({
    sessionId: session.id,
    revision: 1,
    turnId: null,
    explanation: 'Ship verified work',
    plan: [{ step: 'Implement the workflow', status: 'in_progress' }],
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
    workflow: workflowPublicStateSchema.parse({
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      executionModel: 'focus_v2',
      workflowId: 'workflow',
      sessionId: session.id,
      goalId: 'goal',
      planRevision: plan.revision,
      revision,
      status: 'active',
      explorationCount: 0,
      focus: activeItemId
        ? {
            focusId: activeItemId,
            planRevision: plan.revision,
            stepIndex: 0,
            stepTextHash: 'a'.repeat(64),
            title: 'Implement the workflow',
            scope: { readPaths: ['src'], writePaths: ['src/workflow.ts'], tools: ['read_file', 'write_file'] },
            completionPolicy: 'user',
            status: 'verifying',
            acceptanceChecks: [
              {
                id: 'review',
                description: 'The user reviews the integrated result',
                required: true,
                verifier: { kind: 'user' },
                status: 'pending',
                evidenceId: null,
                updatedAt: 10,
              },
            ],
            startedAt: 10,
            completedAt: null,
          }
        : null,
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

function directory(sessions: readonly (typeof session)[] = [session]) {
  return {
    async execute(name: string, input?: unknown) {
      if (name === 'session.get') {
        const sessionId =
          input && typeof input === 'object' && 'sessionId' in input && typeof input.sessionId === 'string'
            ? input.sessionId
            : sessions[0]?.id
        return sessions.find((candidate) => candidate.id === sessionId) ?? null
      }
      if (name === 'workspace.get') return workspace
      if (name === 'session.list') return { items: sessions, nextCursor: null }
      if (name === 'workspace.list') return { items: [workspace], nextCursor: null }
      throw new Error(`Unsupported directory command: ${name}`)
    },
  }
}

test('Activity reads Workflow through its owner, opens the delegated child and cannot mutate acceptance', async () => {
  const listeners = new Set<(value: WorkflowSnapshot) => void>()
  const child = { ...session, id: agent.sessionId, title: 'Delegated child', parentId: session.id }
  const runtime = createAppRuntime({
    instanceId: 'activity-workflow',
    hostId: 'host',
    directory: {
      async execute(name, raw) {
        if (name === 'session.get') return (raw as { sessionId: string }).sessionId === child.id ? child : session
        return directory().execute(name)
      },
    },
    workflows: {
      async execute(name) {
        if (name !== 'workflow.get') throw new Error('Activity must never dispatch a Workflow mutation')
        return snapshot()
      },
      watch(_sessionId, listener) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    },
    agents: {
      async execute(name) {
        if (name === 'agent.result.get') return agent
        throw new Error(`Unexpected ${name}`)
      },
    },
    surfaces: { canRender: (id) => id === 'activity' },
  })
  try {
    await runtime.ready
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id, workspaceId: workspace.id })
    const source = runtime.workspaceTabs.capture([session.id])[0]
    if (!source) throw new Error('No parent tab')
    const panel = await runtime.view.commands.execute('sessionTools.open', {
      panelId: 'activity',
      sessionId: session.id,
      workspaceId: workspace.id,
      sourceTabInstanceKey: source.instanceKey,
    })
    await runtime.view.commands.execute('workflowWorkspace.refresh', { instanceId: panel.instanceId })
    expect(runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]?.agents.agent?.sessionId).toBe(child.id)
    expect(listeners.size).toBe(1)
    await expect(
      runtime.view.commands.execute('workflowWorkspace.acceptCheck', {
        instanceId: panel.instanceId,
        itemId: 'implement',
        checkId: 'review',
        decision: 'accepted',
      }),
    ).rejects.toMatchObject({ code: 'COMMAND_NOT_FOUND' })
    const opened = await runtime.view.commands.execute('agentChild.open', {
      panelInstanceId: panel.instanceId,
      parentSessionId: session.id,
      agentId: agent.agentId,
      expectedChildSessionId: child.id,
      sourceTabInstanceKey: source.instanceKey,
    })
    expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe(child.id)
    expect(listeners.size).toBe(0)
    await runtime.view.commands.execute('agentChild.return', {
      childSessionId: child.id,
      childTabInstanceKey: opened.childTabInstanceKey,
    })
    expect(runtime.view.state.navigation.getSnapshot().sessionId).toBe(session.id)
    await runtime.view.commands.execute('app.closePanel', { instanceId: panel.instanceId })
    expect(runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]).toBeUndefined()
  } finally {
    runtime.dispose()
  }
})

test('Workflow subscribes before its read and a concurrent clear or foreign event cannot restore stale facts', async () => {
  let emit: ((value: WorkflowSnapshot) => void) | undefined
  let resolveRead!: (value: WorkflowSnapshot) => void
  const pending = new Promise<WorkflowSnapshot>((resolve) => {
    resolveRead = resolve
  })
  const runtime = createAppRuntime({
    instanceId: 'workflow-race',
    hostId: 'host',
    directory: directory(),
    workflows: {
      async execute(name) {
        if (name === 'workflow.get') return pending
        throw new Error(`Unexpected ${name}`)
      },
      watch(_id, listener) {
        emit = listener
        return () => {
          emit = undefined
        }
      },
    },
    agents: {
      async execute() {
        return agent
      },
    },
    surfaces: { canRender: (id) => id === 'goals' },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'goals' })
    const load = runtime.view.commands.execute('workflowWorkspace.refresh', { instanceId: panel.instanceId })
    await Bun.sleep(0)
    expect(emit).toBeDefined()
    emit?.(workflowSnapshotSchema.parse({ workflowPlan: null, plan: null, workflow: null, targetDispatches: [] }))
    resolveRead(snapshot())
    await load
    expect(runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]?.snapshot).toEqual({
      workflowPlan: null,
      plan: null,
      workflow: null,
      targetDispatches: [],
    })
    const other = snapshot(5)
    emit?.(
      workflowSnapshotSchema.parse({
        ...other,
        workflow: other.workflow ? { ...other.workflow, sessionId: 'foreign' } : null,
      }),
    )
    expect(runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]?.error).toBe('INVALID_OUTPUT')
    expect(runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]?.snapshot.workflow).toBeNull()
  } finally {
    runtime.dispose()
  }
})

test('changing a follow-active Workflow panel clears the full snapshot while the next Host read is pending', async () => {
  const nextSession = { ...session, id: 'next-session', title: 'Next workflow session' }
  const emptySnapshot = workflowSnapshotSchema.parse({
    workflowPlan: null,
    plan: null,
    workflow: null,
    targetDispatches: [],
  })
  let resolveNextRead!: (value: WorkflowSnapshot) => void
  const nextRead = new Promise<WorkflowSnapshot>((resolve) => {
    resolveNextRead = resolve
  })
  const readSessionIds: string[] = []
  const runtime = createAppRuntime({
    instanceId: 'workflow-session-reset',
    hostId: 'host',
    directory: directory([session, nextSession]),
    workflows: {
      async execute(name, input) {
        if (name !== 'workflow.get') throw new Error(`Unexpected ${name}`)
        const sessionId =
          input && typeof input === 'object' && 'sessionId' in input && typeof input.sessionId === 'string'
            ? input.sessionId
            : ''
        readSessionIds.push(sessionId)
        if (sessionId === session.id) return snapshot()
        if (sessionId === nextSession.id) return nextRead
        throw new Error(`Unexpected Workflow Session ${sessionId}`)
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'goals' },
  })

  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id, workspaceId: workspace.id })
    const panel = await runtime.view.commands.execute('app.openPanel', {
      panelId: 'goals',
      instanceId: 'workflow-follow-active',
      binding: 'followActive',
    })
    await runtime.view.commands.execute('workflowWorkspace.refresh', { instanceId: panel.instanceId })
    expect(runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]?.snapshot.workflow).not.toBeNull()

    await runtime.view.commands.execute('app.setSession', { sessionId: nextSession.id, workspaceId: workspace.id })
    const pendingRead = runtime.view.commands.execute('workflowWorkspace.refresh', { instanceId: panel.instanceId })
    await Bun.sleep(0)

    const loading = runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]
    expect(readSessionIds).toEqual([session.id, nextSession.id])
    expect(loading).toMatchObject({
      sessionId: nextSession.id,
      status: 'loading',
      snapshot: emptySnapshot,
      agents: {},
      actions: {},
    })

    resolveNextRead(emptySnapshot)
    await pendingRead
    const cleared = runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]
    expect(cleared).toMatchObject({ sessionId: nextSession.id, status: 'ready', snapshot: emptySnapshot, agents: {} })
    expect(cleared?.snapshot.workflowPlan).toBeNull()
    expect(cleared?.snapshot.plan).toBeNull()
    expect(cleared?.snapshot.workflow).toBeNull()
    expect(cleared?.snapshot.targetDispatches).toEqual([])
  } finally {
    runtime.dispose()
  }
})

test('a timed-out Workflow read cannot publish its late snapshot even if the transport ignores abort', async () => {
  let finish!: (value: WorkflowSnapshot) => void
  const pending = new Promise<WorkflowSnapshot>((resolve) => {
    finish = resolve
  })
  const runtime = createAppRuntime({
    instanceId: 'workflow-timeout',
    hostId: 'host',
    directory: directory(),
    workflows: {
      async execute() {
        return pending
      },
    },
    surfaces: { canRender: (id) => id === 'goals' },
  })
  try {
    await runtime.view.commands.execute('app.setSession', { sessionId: session.id })
    const panel = await runtime.view.commands.execute('app.openPanel', { panelId: 'goals' })
    await expect(
      runtime.view.commands.execute('workflowWorkspace.refresh', { instanceId: panel.instanceId }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' })
    finish(snapshot())
    await Bun.sleep(0)
    expect(runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]?.status).toBe('error')
    expect(runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]?.snapshot.workflow).toBeNull()
  } finally {
    runtime.dispose()
  }
}, 15_000)

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
            focus: {
              ...current.workflow!.focus!,
              acceptanceChecks: current.workflow!.focus!.acceptanceChecks.map((check) => ({
                ...check,
                status: 'accepted' as const,
                evidenceId: 'accepted',
              })),
            },
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
      runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]!.snapshot.workflow?.focus
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
        workflow: { ...current.workflow!, revision: 50, focus: null },
      }),
    )
    await Bun.sleep(0)
    expect(runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]!.snapshot.workflow).toMatchObject({
      revision: 50,
      focus: null,
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
      workflow: { ...current.workflow!, revision: 3, focus: null, status: 'needs_revision' },
    })
    listener?.(current)
    resolveAcceptance(
      workflowSnapshotSchema.parse({ ...old, workflow: { ...old.workflow!, revision: 2, status: 'active' } }),
    )
    await pending
    const entry = runtime.view.state.workflows.getSnapshot().entries[panel.instanceId]!
    expect(entry.snapshot.workflow).toMatchObject({ revision: 3, status: 'needs_revision' })
    expect(entry.actions['accept:implement:review']?.status).toBe('unknown')

    const duplicate: WorkflowSnapshot = {
      ...current,
      workflow: {
        ...current.workflow!,
        revision: 4,
        focus: {
          ...old.workflow!.focus!,
          acceptanceChecks: [old.workflow!.focus!.acceptanceChecks[0]!, old.workflow!.focus!.acceptanceChecks[0]!],
        },
      },
    }
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
