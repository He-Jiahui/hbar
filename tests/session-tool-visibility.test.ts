import { expect, test } from 'bun:test'
import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import type { ExecuteOptions } from '@hbar/commands'
import { WORKFLOW_SCHEMA_VERSION, workflowSnapshotSchema } from '@hbar/contracts'
import type { WorkflowSnapshot } from '@hbar/contracts'
import { goalPlanWorkspaceCommands } from '@hbar/contracts/commands/goal-plan-workspace'
import { goalPlanCommands, goalPlanSnapshotSchema } from '@hbar/contracts/commands/goals'
import type { GoalPlanChange, GoalPlanSnapshot } from '@hbar/contracts/commands/goals'
import { workflowWorkspaceCommands } from '@hbar/contracts/commands/workflow-workspace'
import { workflowCommands as workflowHostCommands } from '@hbar/contracts/commands/workflows'
import { createGoalPlanWorkspace } from '../packages/app-runtime/src/goal-plan-workspace'
import { createWorkflowWorkspace } from '../packages/app-runtime/src/workflow-workspace'
import { createState } from '../packages/app-runtime/src/state'
import type { PanelSurface, PresentationState, RuntimeOptions, SurfaceState } from '../packages/app-runtime/src/types'

function deferred() {
  let release = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

async function settle(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100 && !predicate(); attempt += 1) await Promise.resolve()
  expect(predicate()).toBe(true)
}

async function rejectedCode(promise: Promise<unknown>) {
  try {
    await promise
  } catch (reason) {
    if (reason instanceof CommandError) return reason.code
    throw reason
  }
  throw new Error('Expected command to reject')
}

function goalSnapshot(sessionId: string, seq = 1): GoalPlanSnapshot {
  return goalPlanSnapshotSchema.parse({
    sessionId,
    goalSeq: seq,
    planSeq: seq,
    remainingTokens: 100,
    goal: {
      threadId: sessionId,
      goalId: `goal-${sessionId}`,
      objective: `Host ${sessionId} ${seq}`,
      status: 'paused',
      tokenBudget: 100,
      tokensUsed: 0,
      timeUsedSeconds: 0,
      createdAt: 1,
      updatedAt: seq,
    },
    plan: {
      sessionId,
      revision: seq,
      turnId: null,
      explanation: 'Host plan',
      plan: [{ step: 'Verify', status: 'pending' }],
      updatedAt: seq,
    },
  })
}

function workflowSnapshot(sessionId: string, revision = 1, delegates = 0): WorkflowSnapshot {
  return workflowSnapshotSchema.parse({
    plan: null,
    workflow: {
      schemaVersion: WORKFLOW_SCHEMA_VERSION,
      executionModel: 'focus_v2',
      workflowId: `workflow-${sessionId}`,
      sessionId,
      goalId: null,
      planRevision: 1,
      revision,
      status: 'active',
      explorationCount: 0,
      focus: {
        focusId: 'item',
        planRevision: 1,
        stepIndex: 0,
        stepTextHash: 'a'.repeat(64),
        title: 'Verify',
        scope: { readPaths: [], writePaths: [], tools: [] },
        completionPolicy: 'user',
        status: 'verifying',
        acceptanceChecks: [
          {
            id: 'check',
            description: 'Review',
            required: true,
            verifier: { kind: 'user' },
            status: 'pending',
            evidenceId: null,
            updatedAt: 1,
          },
        ],
        startedAt: 1,
        completedAt: null,
      },
      scopeExpansions: [],
      delegations: Array.from({ length: delegates }, (_, i) => ({
        delegationId: `delegation-${i}`,
        itemId: 'item',
        agentId: `agent-${i}`,
        modelId: 'fixture',
        tokenBudget: 100,
        status: 'running',
        patchId: null,
        createdAt: 1,
        updatedAt: 1,
      })),
      evidence: [],
      createdAt: 1,
      updatedAt: revision,
    },
  })
}

function fixture(marked = true, binding: PanelSurface['binding'] = 'pinned') {
  const local = new CommandRegistry()
  const errors: unknown[] = []
  const onError = (reason: unknown) => {
    errors.push(reason)
  }
  const makePanel = (id: string): PanelSurface => ({
    instanceId: id,
    panelId: 'goals',
    sessionId: id,
    workspaceId: 'w',
    binding,
    params: {},
    ...(marked ? { sessionTool: true } : {}),
  })
  const surfaces = createState<SurfaceState>(
    { panels: { a: makePanel('a'), b: makePanel('b') }, windows: {}, focusedPanelId: 'a', focusedWindowId: null },
    onError,
  )
  const presentation = createState<PresentationState>(
    { page: { kind: 'session' }, toolInstanceId: 'a', modalInstanceId: null, returnContext: null, sidebarOpen: false },
    onError,
  )
  const goalFacts = new Map([
    ['a', goalSnapshot('a')],
    ['b', goalSnapshot('b')],
  ])
  const workflowFacts = new Map([
    ['a', workflowSnapshot('a')],
    ['b', workflowSnapshot('b')],
  ])
  const goalWatches: {
    sessionId: string
    listener: (change: GoalPlanChange | { kind: 'reset' }) => void
    closed: boolean
  }[] = []
  const workflowWatches: { sessionId: string; listener: (snapshot: WorkflowSnapshot) => void; closed: boolean }[] = []
  const reads: { kind: 'goal' | 'workflow' | 'agent'; sessionId: string; signal: AbortSignal | undefined }[] = []
  const writes: { kind: 'goal' | 'plan' | 'workflow'; sessionId: string; options: ExecuteOptions | undefined }[] = []
  const control = {
    goalReadGate: null as ReturnType<typeof deferred> | null,
    workflowReadGate: null as ReturnType<typeof deferred> | null,
    agentReadGate: null as ReturnType<typeof deferred> | null,
    goalWriteGate: null as ReturnType<typeof deferred> | null,
    planWriteGate: null as ReturnType<typeof deferred> | null,
    workflowWriteGate: null as ReturnType<typeof deferred> | null,
    goalReadError: false,
    workflowReadError: false,
    goalWriteUnknown: false,
    planWriteUnknown: false,
    workflowWriteUnknown: false,
  }
  const goalFact = (id: string) => {
    const value = goalFacts.get(id)
    if (!value) throw new Error('Missing fixture Goal')
    return value
  }
  const workflowFact = (id: string) => {
    const value = workflowFacts.get(id)
    if (!value) throw new Error('Missing fixture workflow')
    return value
  }
  const options: RuntimeOptions = {
    instanceId: 'visibility',
    hostId: 'fixture',
    directory: {
      async execute() {
        throw new Error('Visibility owner does not read directory')
      },
    },
    goals: {
      async snapshot(sessionId, execution) {
        reads.push({ kind: 'goal', sessionId, signal: execution?.signal })
        const captured = goalFact(sessionId)
        const gate = control.goalReadGate
        control.goalReadGate = null
        await gate?.promise
        if (control.goalReadError) throw new CommandError('DISCONNECTED', 'Fixture read failed')
        return captured // Deliberately ignores cancellation, like a transport without remote cancel.
      },
      watch(sessionId, listener) {
        const watch = { sessionId, listener, closed: false }
        goalWatches.push(watch)
        return () => {
          watch.closed = true
        }
      },
      async execute(name, input, execution) {
        if (name === 'goal.set') {
          const value = goalPlanCommands['goal.set'].input.parse(input)
          writes.push({ kind: 'goal', sessionId: value.sessionId, options: execution })
          const before = goalFact(value.sessionId)
          const goal = before.goal
          if (!goal) throw new Error('Missing fixture Goal')
          const next = { ...goal, objective: value.objective ?? goal.objective }
          await control.goalWriteGate?.promise
          if (control.goalWriteUnknown) throw new CommandError('RESULT_UNKNOWN', 'Fixture write acknowledgement lost')
          return { goal: next, remainingTokens: before.remainingTokens }
        }
        if (name === 'plan.update') {
          const value = goalPlanCommands['plan.update'].input.parse(input)
          writes.push({ kind: 'plan', sessionId: value.sessionId, options: execution })
          await control.planWriteGate?.promise
          if (control.planWriteUnknown) throw new CommandError('RESULT_UNKNOWN', 'Fixture write acknowledgement lost')
          return goalFact(value.sessionId).plan
        }
        throw new Error(`Unexpected Goal operation ${name}`)
      },
    },
    workflows: {
      async execute(name, input, execution) {
        if (name === 'workflow.get') {
          const parsed = workflowHostCommands['workflow.get'].input.parse(input)
          reads.push({ kind: 'workflow', sessionId: parsed.sessionId, signal: execution?.signal })
          const captured = workflowFact(parsed.sessionId)
          const gate = control.workflowReadGate
          control.workflowReadGate = null
          await gate?.promise
          if (control.workflowReadError) throw new CommandError('DISCONNECTED', 'Fixture read failed')
          return captured
        }
        if (name === 'workflow.acceptCheck') {
          const parsed = workflowHostCommands['workflow.acceptCheck'].input.parse(input)
          writes.push({ kind: 'workflow', sessionId: parsed.sessionId, options: execution })
          await control.workflowWriteGate?.promise
          if (control.workflowWriteUnknown) throw new CommandError('RESULT_UNKNOWN', 'Fixture acknowledgement lost')
          return workflowSnapshot(parsed.sessionId, 2)
        }
        throw new Error(`Unexpected workflow operation ${name}`)
      },
      watch(sessionId, listener) {
        const watch = { sessionId, listener, closed: false }
        workflowWatches.push(watch)
        return () => {
          watch.closed = true
        }
      },
    },
    agents: {
      async execute(name, _input, execution) {
        if (name !== 'agent.result.get') throw new Error(`Unexpected Agent operation ${name}`)
        reads.push({ kind: 'agent', sessionId: 'a', signal: execution?.signal })
        await control.agentReadGate?.promise
        throw new CommandError('AGENT_NOT_FOUND', 'Fixture unavailable delegated agent')
      },
    },
  }
  let disposed = false
  const goals = createGoalPlanWorkspace(
    local,
    options,
    surfaces.reader,
    onError,
    () => disposed,
    undefined,
    presentation.reader,
  )
  const workflows = createWorkflowWorkspace(
    local,
    options,
    surfaces.reader,
    onError,
    () => disposed,
    presentation.reader,
  )
  const goalCommands = createCommandClient(goalPlanWorkspaceCommands, local)
  const workflowCommands = createCommandClient(workflowWorkspaceCommands, local)
  const goalEntry = (id = 'a') => {
    const entry = goals.reader.getSnapshot().entries[id]
    if (!entry) throw new Error('Goal entry has not loaded')
    return entry
  }
  const workflowEntry = (id = 'a') => {
    const entry = workflows.reader.getSnapshot().entries[id]
    if (!entry) throw new Error('Workflow entry has not loaded')
    return entry
  }
  return {
    control,
    reads,
    writes,
    errors,
    goalFacts,
    workflowFacts,
    goalWatches,
    workflowWatches,
    goalCommands,
    workflowCommands,
    workflowState: workflows.reader,
    goalEntry,
    workflowEntry,
    surfaces,
    presentation,
    hide() {
      presentation.replace({
        ...presentation.reader.getSnapshot(),
        page: { kind: 'settings', instanceId: 'settings' },
        toolInstanceId: null,
      })
    },
    show(id = 'a') {
      presentation.replace({ ...presentation.reader.getSnapshot(), page: { kind: 'session' }, toolInstanceId: id })
    },
    dispose() {
      disposed = true
      goals.dispose()
      workflows.dispose()
      local.dispose()
      surfaces.dispose()
      presentation.dispose()
      expect(errors).toEqual([])
    },
  }
}

test('marked Goal tool hides its feed, keeps both drafts and restores exactly one read on return', async () => {
  const f = fixture()
  try {
    await f.goalCommands.execute('goalPlanWorkspace.refresh', { instanceId: 'a' })
    await f.goalCommands.execute('goalPlanWorkspace.showGoalEditor', { instanceId: 'a' })
    await f.goalCommands.execute('goalPlanWorkspace.setGoalField', {
      instanceId: 'a',
      field: 'objective',
      value: 'Local Goal draft',
    })
    await f.goalCommands.execute('goalPlanWorkspace.showPlanEditor', { instanceId: 'a' })
    await f.goalCommands.execute('goalPlanWorkspace.setExplanation', { instanceId: 'a', value: 'Local Plan draft' })
    const before = f.goalEntry()
    const oldWatch = f.goalWatches[0]
    if (!oldWatch) throw new Error('Expected Goal watch')
    f.hide()
    f.hide()
    expect(oldWatch.closed).toBe(true)
    expect(f.goalEntry()).toBe(before)
    oldWatch.listener({ kind: 'goal', sessionId: 'a', seq: 99, goal: goalSnapshot('a', 99).goal })
    expect(f.goalEntry()).toBe(before)
    expect(await rejectedCode(f.goalCommands.execute('goalPlanWorkspace.refresh', { instanceId: 'a' }))).toBe(
      'TARGET_CHANGED',
    )
    f.goalFacts.set('a', goalSnapshot('a', 2))
    f.show()
    f.show()
    await settle(() => f.goalEntry().goal?.updatedAt === 2)
    expect(f.reads.filter((read) => read.kind === 'goal')).toHaveLength(2)
    expect(f.goalWatches.filter((watch) => !watch.closed)).toHaveLength(1)
    expect(f.goalEntry()).toMatchObject({
      view: 'plan',
      goalDirty: true,
      planDirty: true,
      goalDraft: { objective: 'Local Goal draft' },
      planDraft: { explanation: 'Local Plan draft' },
    })
  } finally {
    f.dispose()
  }
})

test('hidden Goal read is signalled and fenced even if Host ignores abort; A and B never share facts', async () => {
  const f = fixture()
  const gate = deferred()
  try {
    f.control.goalReadGate = gate
    const oldResult = rejectedCode(f.goalCommands.execute('goalPlanWorkspace.refresh', { instanceId: 'a' }))
    await settle(() => f.reads.length === 1)
    f.show('b')
    expect(f.reads[0]?.signal?.aborted).toBe(true)
    expect(f.goalEntry()).toMatchObject({ status: 'error', error: 'CANCELLED', goalAction: { status: 'idle' } })
    await f.goalCommands.execute('goalPlanWorkspace.refresh', { instanceId: 'b' })
    f.goalFacts.set('a', goalSnapshot('a', 3))
    f.show('a')
    await settle(() => f.goalEntry().goal?.updatedAt === 3)
    gate.release()
    expect(await oldResult).toBe('RESULT_UNKNOWN')
    expect(f.goalEntry().goal?.objective).toBe('Host a 3')
    expect(f.goalEntry('b').goal?.objective).toBe('Host b 1')
    expect(f.goalWatches.filter((watch) => !watch.closed).map((watch) => watch.sessionId)).toEqual(['a'])
  } finally {
    gate.release()
    f.dispose()
  }
})

test('Goal unknown writes survive hidden automatic reconciliation without a replay or draft reset', async () => {
  const f = fixture()
  try {
    await f.goalCommands.execute('goalPlanWorkspace.refresh', { instanceId: 'a' })
    await f.goalCommands.execute('goalPlanWorkspace.showGoalEditor', { instanceId: 'a' })
    await f.goalCommands.execute('goalPlanWorkspace.setGoalField', {
      instanceId: 'a',
      field: 'objective',
      value: 'Uncertain Goal',
    })
    f.control.goalWriteUnknown = true
    expect(await rejectedCode(f.goalCommands.execute('goalPlanWorkspace.saveGoal', { instanceId: 'a' }))).toBe(
      'RESULT_UNKNOWN',
    )
    await f.goalCommands.execute('goalPlanWorkspace.showPlanEditor', { instanceId: 'a' })
    await f.goalCommands.execute('goalPlanWorkspace.setExplanation', { instanceId: 'a', value: 'Uncertain Plan' })
    f.control.planWriteUnknown = true
    expect(await rejectedCode(f.goalCommands.execute('goalPlanWorkspace.savePlan', { instanceId: 'a' }))).toBe(
      'RESULT_UNKNOWN',
    )
    f.hide()
    f.show()
    await settle(() => f.goalWatches.length === 2 && f.goalEntry().status === 'ready')
    expect(f.goalEntry()).toMatchObject({
      goalAction: { status: 'unknown' },
      planAction: { status: 'unknown' },
      goalDraft: { objective: 'Uncertain Goal' },
      planDraft: { explanation: 'Uncertain Plan' },
    })
    expect(f.writes).toHaveLength(2)
    expect(await rejectedCode(f.goalCommands.execute('goalPlanWorkspace.savePlan', { instanceId: 'a' }))).toBe('BUSY')
  } finally {
    f.dispose()
  }
})

test('Goal in-flight ACK remains owned while hidden and cannot roll back a newer canonical fact', async () => {
  const f = fixture()
  const gate = deferred()
  try {
    await f.goalCommands.execute('goalPlanWorkspace.refresh', { instanceId: 'a' })
    await f.goalCommands.execute('goalPlanWorkspace.showGoalEditor', { instanceId: 'a' })
    await f.goalCommands.execute('goalPlanWorkspace.setGoalField', {
      instanceId: 'a',
      field: 'objective',
      value: 'Submitted draft',
    })
    f.control.goalWriteGate = gate
    const saving = f.goalCommands.execute('goalPlanWorkspace.saveGoal', { instanceId: 'a' })
    await settle(() => f.writes.length === 1)
    f.goalWatches[0]?.listener({ kind: 'goal', sessionId: 'a', seq: 4, goal: goalSnapshot('a', 4).goal })
    f.hide()
    expect(f.goalEntry().goalAction.status).toBe('submitting')
    gate.release()
    await saving
    expect(f.goalEntry()).toMatchObject({
      goalAction: { status: 'succeeded' },
      goal: { objective: 'Host a 4' },
      goalDraft: { objective: 'Host a 4' },
    })
    expect(f.writes).toHaveLength(1)
  } finally {
    gate.release()
    f.dispose()
  }
})

test('Goal reset received during a resumed snapshot is not swallowed by duplicate-read coalescing', async () => {
  const f = fixture()
  const gate = deferred()
  try {
    await f.goalCommands.execute('goalPlanWorkspace.refresh', { instanceId: 'a' })
    f.hide()
    f.control.goalReadGate = gate
    f.show()
    await settle(() => f.goalWatches.length === 2)
    const active = f.goalWatches[1]
    if (!active) throw new Error('Expected resumed Goal watch')
    active.listener({ kind: 'reset' })
    f.goalFacts.set('a', goalSnapshot('a', 5))
    gate.release()
    await settle(() => f.goalEntry().goal?.updatedAt === 5)
    expect(f.reads.filter((read) => read.kind === 'goal')).toHaveLength(3)
  } finally {
    gate.release()
    f.dispose()
  }
})

test('resumed Goal/Plan snapshot does not unlock a pending Plan save or erase its submitted draft', async () => {
  const f = fixture()
  const gate = deferred()
  try {
    await f.goalCommands.execute('goalPlanWorkspace.refresh', { instanceId: 'a' })
    await f.goalCommands.execute('goalPlanWorkspace.showPlanEditor', { instanceId: 'a' })
    await f.goalCommands.execute('goalPlanWorkspace.setExplanation', {
      instanceId: 'a',
      value: 'Original submitted Plan',
    })
    f.control.planWriteGate = gate
    const saving = f.goalCommands.execute('goalPlanWorkspace.savePlan', { instanceId: 'a' })
    await settle(() => f.writes.length === 1)
    f.hide()
    f.show()
    await settle(() => f.goalWatches.length === 2 && f.goalEntry().status === 'ready')
    expect(f.goalEntry()).toMatchObject({
      planAction: { status: 'submitting' },
      planDraft: { explanation: 'Original submitted Plan' },
    })
    expect(await rejectedCode(f.goalCommands.execute('goalPlanWorkspace.savePlan', { instanceId: 'a' }))).toBe('BUSY')
    f.hide()
    gate.release()
    await saving
    expect(f.goalEntry().planAction.status).toBe('succeeded')
    expect(f.writes).toHaveLength(1)
  } finally {
    gate.release()
    f.dispose()
  }
})

for (const binding of ['pinned', 'followActive'] as const) {
  test(`unmarked ${binding} Goal/Workflow keep legacy background subscription semantics`, async () => {
    const f = fixture(false, binding)
    try {
      await f.goalCommands.execute('goalPlanWorkspace.refresh', { instanceId: 'a' })
      await f.workflowCommands.execute('workflowWorkspace.refresh', { instanceId: 'a' })
      f.hide()
      f.show('b')
      expect(f.goalWatches[0]?.closed).toBe(false)
      expect(f.workflowWatches[0]?.closed).toBe(false)
      f.goalWatches[0]?.listener({ kind: 'goal', sessionId: 'a', seq: 2, goal: goalSnapshot('a', 2).goal })
      f.workflowWatches[0]?.listener(workflowSnapshot('a', 2))
      await settle(() => f.workflowEntry().snapshot.workflow?.revision === 2)
      expect(f.goalEntry().goal?.objective).toBe('Host a 2')
      f.show('a')
      expect(f.reads).toHaveLength(2)
    } finally {
      f.dispose()
    }
  })
}

test('marked Workflow releases its watcher, preserves unknown actions and coalesces visible restoration', async () => {
  const f = fixture()
  try {
    await f.workflowCommands.execute('workflowWorkspace.refresh', { instanceId: 'a' })
    f.control.workflowWriteUnknown = true
    await f.workflowCommands.execute('workflowWorkspace.acceptCheck', {
      instanceId: 'a',
      itemId: 'item',
      checkId: 'check',
      decision: 'accepted',
    })
    expect(f.workflowEntry().actions['accept:item:check']?.status).toBe('unknown')
    const before = f.workflowEntry()
    f.hide()
    f.hide()
    expect(f.workflowWatches[0]?.closed).toBe(true)
    f.workflowWatches[0]?.listener(workflowSnapshot('a', 99))
    expect(f.workflowEntry()).toBe(before)
    f.show()
    f.show()
    await settle(() => f.workflowWatches.length === 2)
    expect(f.reads.filter((read) => read.kind === 'workflow')).toHaveLength(2)
    expect(f.workflowEntry().actions['accept:item:check']?.status).toBe('unknown')
    expect(f.writes).toHaveLength(1)
    expect(
      await rejectedCode(
        f.workflowCommands.execute('workflowWorkspace.acceptCheck', {
          instanceId: 'a',
          itemId: 'item',
          checkId: 'check',
          decision: 'accepted',
        }),
      ),
    ).toBe('BUSY')
  } finally {
    f.dispose()
  }
})

test('marked Workflow keeps the exact pending row write during a resumed snapshot and accepts its later ACK', async () => {
  const f = fixture()
  const gate = deferred()
  try {
    await f.workflowCommands.execute('workflowWorkspace.refresh', { instanceId: 'a' })
    f.control.workflowWriteGate = gate
    const saving = f.workflowCommands.execute('workflowWorkspace.acceptCheck', {
      instanceId: 'a',
      itemId: 'item',
      checkId: 'check',
      decision: 'accepted',
    })
    await settle(() => f.writes.length === 1)
    f.hide()
    f.show()
    await settle(() => f.workflowWatches.length === 2)
    expect(f.workflowEntry().actions['accept:item:check']?.status).toBe('submitting')
    f.hide()
    gate.release()
    await saving
    expect(f.workflowEntry()).toMatchObject({
      actions: { 'accept:item:check': { status: 'succeeded' } },
      snapshot: { workflow: { revision: 2 } },
    })
    expect(f.writes).toHaveLength(1)
  } finally {
    gate.release()
    f.dispose()
  }
})

test('hidden Workflow cancels read batches, ignores old watch callbacks and does not fetch more agent pages', async () => {
  const f = fixture()
  const gate = deferred()
  try {
    await f.workflowCommands.execute('workflowWorkspace.refresh', { instanceId: 'a' })
    f.control.agentReadGate = gate
    f.workflowWatches[0]?.listener(workflowSnapshot('a', 2, 9))
    await settle(() => f.reads.filter((read) => read.kind === 'agent').length === 8)
    f.hide()
    expect(f.reads.filter((read) => read.kind === 'agent').every((read) => read.signal?.aborted)).toBe(true)
    f.workflowWatches[0]?.listener(workflowSnapshot('a', 3, 9))
    gate.release()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(f.reads.filter((read) => read.kind === 'agent')).toHaveLength(8)
    expect(f.workflowEntry().snapshot.workflow?.revision).toBe(1)
    f.control.agentReadGate = null
    f.show()
    await settle(() => f.workflowWatches.length === 2)
    expect(f.workflowEntry().status).toBe('ready')
  } finally {
    gate.release()
    f.dispose()
  }
})

test('late Workflow read cannot overwrite a reselected session tool', async () => {
  const f = fixture()
  const gate = deferred()
  try {
    f.control.workflowReadGate = gate
    const old = rejectedCode(f.workflowCommands.execute('workflowWorkspace.refresh', { instanceId: 'a' }))
    await settle(() => f.reads.length === 1)
    f.show('b')
    expect(f.reads[0]?.signal?.aborted).toBe(true)
    expect(f.reads[0]?.signal?.reason).toMatchObject({ code: 'RESULT_UNKNOWN' })
    expect(f.workflowEntry()).toMatchObject({ status: 'error', error: 'CANCELLED', actions: {} })
    await f.workflowCommands.execute('workflowWorkspace.refresh', { instanceId: 'b' })
    f.workflowFacts.set('a', workflowSnapshot('a', 3))
    f.show('a')
    await settle(() => f.workflowEntry().snapshot.workflow?.revision === 3)
    gate.release()
    expect(await old).toBe('RESULT_UNKNOWN')
    expect(f.workflowEntry().snapshot.workflow?.revision).toBe(3)
    expect(f.workflowEntry('b').snapshot.workflow?.sessionId).toBe('b')
  } finally {
    gate.release()
    f.dispose()
  }
})

test('snapshots started before Goal and workflow ACKs cannot roll those confirmed facts back on resume', async () => {
  const f = fixture()
  const goalWrite = deferred(),
    workflowWrite = deferred(),
    goalRead = deferred(),
    workflowRead = deferred()
  try {
    await f.goalCommands.execute('goalPlanWorkspace.refresh', { instanceId: 'a' })
    await f.workflowCommands.execute('workflowWorkspace.refresh', { instanceId: 'a' })
    await f.goalCommands.execute('goalPlanWorkspace.showGoalEditor', { instanceId: 'a' })
    await f.goalCommands.execute('goalPlanWorkspace.setGoalField', {
      instanceId: 'a',
      field: 'objective',
      value: 'Confirmed new Goal',
    })
    f.control.goalWriteGate = goalWrite
    f.control.workflowWriteGate = workflowWrite
    const savingGoal = f.goalCommands.execute('goalPlanWorkspace.saveGoal', { instanceId: 'a' })
    const savingWorkflow = f.workflowCommands.execute('workflowWorkspace.acceptCheck', {
      instanceId: 'a',
      itemId: 'item',
      checkId: 'check',
      decision: 'accepted',
    })
    await settle(() => f.writes.length === 2)
    f.hide()
    f.control.goalReadGate = goalRead
    f.control.workflowReadGate = workflowRead
    f.show()
    await settle(() => f.reads.length === 4)
    goalWrite.release()
    workflowWrite.release()
    await savingGoal
    await savingWorkflow
    expect(f.goalEntry().goal?.objective).toBe('Confirmed new Goal')
    expect(f.workflowEntry().snapshot.workflow?.revision).toBe(2)
    goalRead.release()
    workflowRead.release()
    await settle(() => f.workflowWatches.length === 2)
    expect(f.goalEntry()).toMatchObject({
      goal: { objective: 'Confirmed new Goal' },
      goalDraft: { objective: 'Confirmed new Goal' },
      goalDirty: false,
      goalAction: { status: 'succeeded' },
    })
    expect(f.workflowEntry()).toMatchObject({
      snapshot: { workflow: { revision: 2 } },
      actions: { 'accept:item:check': { status: 'succeeded' } },
    })
  } finally {
    goalWrite.release()
    workflowWrite.release()
    goalRead.release()
    workflowRead.release()
    f.dispose()
  }
})

test('eviction releases owned read lifetimes; reusing the same panel id cannot revive its obsolete generation', async () => {
  const f = fixture()
  const goalGate = deferred(),
    workflowGate = deferred()
  try {
    f.control.goalReadGate = goalGate
    f.control.workflowReadGate = workflowGate
    const oldGoal = rejectedCode(f.goalCommands.execute('goalPlanWorkspace.refresh', { instanceId: 'a' }))
    const oldWorkflow = rejectedCode(f.workflowCommands.execute('workflowWorkspace.refresh', { instanceId: 'a' }))
    await settle(() => f.reads.length === 2)
    const before = f.surfaces.reader.getSnapshot()
    f.surfaces.replace({ ...before, panels: {} })
    expect(f.reads.every((read) => read.signal?.aborted)).toBe(true)
    expect(f.goalEntry().status).not.toBe('loading')
    expect(f.workflowEntry()).toMatchObject({ status: 'error', error: 'CANCELLED' })
    f.goalFacts.set('a', goalSnapshot('a', 6))
    f.workflowFacts.set('a', workflowSnapshot('a', 6))
    f.surfaces.replace(before)
    await f.workflowCommands.execute('workflowWorkspace.refresh', { instanceId: 'a' })
    await settle(() => f.goalEntry().goal?.updatedAt === 6)
    goalGate.release()
    workflowGate.release()
    expect(await oldGoal).toBe('RESULT_UNKNOWN')
    expect(await oldWorkflow).toBe('RESULT_UNKNOWN')
    expect(f.goalEntry().goal?.updatedAt).toBe(6)
    expect(f.workflowEntry().snapshot.workflow?.revision).toBe(6)
    expect(f.goalWatches.filter((watch) => !watch.closed)).toHaveLength(1)
    expect(f.workflowWatches.filter((watch) => !watch.closed)).toHaveLength(1)
  } finally {
    goalGate.release()
    workflowGate.release()
    f.dispose()
  }
})

test('retiring read-only Activity discards its cache without reviving an ignored-abort read or watcher', async () => {
  const f = fixture()
  const gate = deferred()
  try {
    const before = f.surfaces.reader.getSnapshot()
    const source = before.panels.a
    if (!source) throw new Error('Missing Activity fixture target')
    const activity = { ...before, panels: { ...before.panels, a: { ...source, panelId: 'activity' } } }
    f.surfaces.replace(activity)
    f.control.workflowReadGate = gate
    const old = rejectedCode(f.workflowCommands.execute('workflowWorkspace.refresh', { instanceId: 'a' }))
    await settle(() => f.reads.length === 1)
    f.hide()
    expect(f.reads[0]?.signal?.aborted).toBe(true)
    expect(f.workflowState.getSnapshot().entries.a).toBeUndefined()
    expect(f.workflowWatches[0]?.closed).toBe(true)
    expect(await old).toBe('RESULT_UNKNOWN')
    f.surfaces.replace({ ...activity, panels: {} })
    f.workflowFacts.set('a', workflowSnapshot('a', 4))
    f.surfaces.replace(activity)
    f.show()
    await f.workflowCommands.execute('workflowWorkspace.refresh', { instanceId: 'a' })
    gate.release()
    f.workflowWatches[0]?.listener(workflowSnapshot('a', 9))
    await Promise.resolve()
    expect(f.workflowEntry().snapshot.workflow?.revision).toBe(4)
    expect(f.workflowWatches.filter((watch) => !watch.closed)).toHaveLength(1)
    f.surfaces.replace({ ...activity, panels: {} })
    expect(f.workflowState.getSnapshot().entries.a).toBeUndefined()
    expect(f.workflowWatches.every((watch) => watch.closed)).toBe(true)
  } finally {
    gate.release()
    f.dispose()
  }
})

test('resume read failures are local and retryable without an automatic retry loop or losing draft/actions', async () => {
  const f = fixture()
  try {
    await f.goalCommands.execute('goalPlanWorkspace.refresh', { instanceId: 'a' })
    await f.goalCommands.execute('goalPlanWorkspace.showGoalEditor', { instanceId: 'a' })
    await f.goalCommands.execute('goalPlanWorkspace.setGoalField', {
      instanceId: 'a',
      field: 'objective',
      value: 'Keep on read failure',
    })
    await f.workflowCommands.execute('workflowWorkspace.refresh', { instanceId: 'a' })
    f.hide()
    f.control.goalReadError = true
    f.control.workflowReadError = true
    f.show()
    await settle(() => f.goalEntry().status === 'error' && f.workflowEntry().status === 'error')
    f.show()
    expect(f.reads).toHaveLength(4)
    expect(f.goalEntry().goalDraft.objective).toBe('Keep on read failure')
    f.control.goalReadError = false
    f.control.workflowReadError = false
    await f.goalCommands.execute('goalPlanWorkspace.refresh', { instanceId: 'a' })
    await f.workflowCommands.execute('workflowWorkspace.refresh', { instanceId: 'a' })
    expect(f.goalEntry().status).toBe('ready')
    expect(f.workflowEntry().status).toBe('ready')
  } finally {
    f.dispose()
  }
})

test('disposal releases visible Goal/Workflow watchers and signals pending reads without a late update', async () => {
  const f = fixture()
  const gate = deferred()
  await f.goalCommands.execute('goalPlanWorkspace.refresh', { instanceId: 'a' })
  await f.workflowCommands.execute('workflowWorkspace.refresh', { instanceId: 'a' })
  f.control.goalReadGate = gate
  const pending = rejectedCode(f.goalCommands.execute('goalPlanWorkspace.refresh', { instanceId: 'a' }))
  await settle(() => f.reads.length === 3)
  const before = f.goalEntry()
  f.dispose()
  expect(f.goalWatches.every((watch) => watch.closed)).toBe(true)
  expect(f.workflowWatches.every((watch) => watch.closed)).toBe(true)
  expect(f.reads[2]?.signal?.aborted).toBe(true)
  gate.release()
  await pending
  expect(f.goalEntry()).toBe(before)
})
