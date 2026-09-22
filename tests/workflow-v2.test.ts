import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { GoalService, PlanService, WorkflowService } from '@hbar/plugin-sdk'

const resources: { root: string; kernel: Kernel }[] = []

afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-workflow-v2-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  return {
    root,
    kernel,
    session,
    goals: kernel.plugins.get<GoalService>('goal'),
    plans: kernel.plugins.get<PlanService>('plan'),
    workflows: kernel.plugins.get<WorkflowService>('workflow'),
  }
}

async function rejection(operation: Promise<unknown>) {
  try {
    await operation
    throw new Error('Expected rejection')
  } catch (error) {
    return error
  }
}

test('workflow focus normalizes registered tool aliases and escapes repeated scope denial', async () => {
  const { root, kernel, session, plans, workflows } = await fixture()
  await writeFile(join(root, 'outside.txt'), 'outside', 'utf8')
  const plan = await plans.update(session.id, [{ step: 'Inspect the bounded file', status: 'in_progress' }])

  expect(
    await rejection(
      workflows.focus(
        session.id,
        0,
        {
          id: 'inspect',
          title: 'ignored in favor of Agent Plan',
          scope: { readPaths: ['allowed'], writePaths: [], tools: ['unknown_tool'] },
          acceptanceChecks: [],
        },
        'agent',
        plan.revision,
      ),
    ),
  ).toMatchObject({ code: 'WORKFLOW_TOOL_UNKNOWN' })

  expect(
    await rejection(
      workflows.focus(
        session.id,
        0,
        {
          id: 'inspect',
          title: 'ignored in favor of Agent Plan',
          scope: { readPaths: ['allowed'], writePaths: ['allowed'], tools: ['functions.shell'] },
          acceptanceChecks: [],
        },
        'agent',
        plan.revision,
      ),
    ),
  ).toMatchObject({ code: 'WORKFLOW_SCOPE_REQUIRED' })

  const focused = await workflows.focus(
    session.id,
    0,
    {
      id: 'inspect',
      title: 'ignored in favor of Agent Plan',
      scope: { readPaths: ['allowed'], writePaths: [], tools: ['functions.read_file'] },
      acceptanceChecks: [],
    },
    'agent',
    plan.revision,
  )
  expect(focused.workflow).toMatchObject({
    status: 'active',
    activeStepIndex: 0,
    planRevision: plan.revision,
    workItems: [{ title: 'Inspect the bounded file', scope: { tools: ['read_file'] } }],
  })
  expect(
    await rejection(
      workflows.expandScope(
        session.id,
        'inspect',
        { readPaths: ['allowed'], writePaths: [], tools: ['read_file'] },
        'No semantic change',
        focused.workflow!.revision,
      ),
    ),
  ).toMatchObject({ code: 'WORKFLOW_SCOPE_NOOP' })

  for (let attempt = 0; attempt < 3; attempt++) {
    await kernel.submit(
      session.id,
      `outside-${attempt}`,
      { text: '/tool read_file {"path":"outside.txt"}', images: [] },
      'local-fixture',
    )
    await kernel.waitForIdle()
  }
  expect((await workflows.get(session.id)).workflow).toMatchObject({
    status: 'needs_revision',
    rejection: { toolName: 'read_file', path: 'outside.txt', count: 3 },
  })
  const revisedPlan = await plans.update(
    session.id,
    [{ step: 'Inspect the corrected bounded file', status: 'in_progress' }],
    'Self-revise after repeated denial',
    null,
    plan.revision,
  )
  const recovered = await workflows.focus(
    session.id,
    0,
    {
      id: 'inspect-corrected',
      title: 'ignored',
      scope: { readPaths: ['outside.txt'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [],
    },
    'agent',
    revisedPlan.revision,
  )
  expect(recovered.workflow).toMatchObject({
    status: 'active',
    planRevision: revisedPlan.revision,
    rejection: null,
  })
})

test('workflow checkpoint advances the authoritative Agent Plan without completing the Goal', async () => {
  const { session, goals, plans, workflows } = await fixture()
  await goals.create(session.id, 'Complete both Agent Plan steps')
  const plan = await plans.update(session.id, [
    { step: 'Implement the change', status: 'in_progress' },
    { step: 'Verify the change', status: 'pending' },
  ])
  const first = await workflows.focus(
    session.id,
    0,
    {
      id: 'implement',
      title: 'ignored',
      scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [],
    },
    'agent',
    plan.revision,
  )
  const advanced = await workflows.checkpoint(
    session.id,
    'implement',
    'complete',
    'Implementation is complete',
    null,
    first.workflow!.revision,
  )
  expect(await plans.get(session.id)).toMatchObject({
    revision: plan.revision + 1,
    plan: [
      { step: 'Implement the change', status: 'completed' },
      { step: 'Verify the change', status: 'in_progress' },
    ],
  })
  expect(advanced.workflow).toMatchObject({ status: 'active', activeItemId: null, activeStepIndex: null })

  const secondPlan = (await plans.get(session.id))!
  const second = await workflows.focus(
    session.id,
    1,
    {
      id: 'verify',
      title: 'ignored',
      scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
      acceptanceChecks: [],
    },
    'agent',
    secondPlan.revision,
  )
  const completed = await workflows.checkpoint(
    session.id,
    'verify',
    'complete',
    'Verification is complete',
    null,
    second.workflow!.revision,
  )
  expect(completed.workflow?.status).toBe('completed')
  expect((await plans.get(session.id))?.plan.every((step) => step.status === 'completed')).toBeTrue()
  expect((await goals.get(session.id)).goal?.status).toBe('active')
})

test('manual evidence is impossible before an explicitly user-gated current focus waits', async () => {
  const { session, plans, workflows } = await fixture()
  const plan = await plans.update(session.id, [{ step: 'Obtain explicit acceptance', status: 'in_progress' }])
  const focused = await workflows.focus(
    session.id,
    0,
    {
      id: 'accept',
      title: 'ignored',
      scope: { readPaths: [], writePaths: [], tools: [] },
      acceptanceChecks: [{ id: 'human', description: 'The current result is accepted', verifier: { kind: 'user' } }],
    },
    'user',
    plan.revision,
  )
  expect(
    await rejection(
      workflows.acceptCheck(session.id, 'accept', 'human', 'accepted', null, focused.workflow!.revision, 'user'),
    ),
  ).toMatchObject({ code: 'WORKFLOW_CHECK_INVALID' })

  const waiting = await workflows.checkpoint(
    session.id,
    'accept',
    'complete',
    'Ready for the explicitly requested user review',
    null,
    focused.workflow!.revision,
  )
  expect(waiting.workflow?.status).toBe('waiting_user')
  const accepted = await workflows.acceptCheck(
    session.id,
    'accept',
    'human',
    'accepted',
    null,
    waiting.workflow!.revision,
    'user',
  )
  expect(accepted.workflow?.status).toBe('verifying')
  const completed = await workflows.checkpoint(
    session.id,
    'accept',
    'complete',
    'The explicit acceptance is current and recorded',
    null,
    accepted.workflow!.revision,
  )
  expect(completed.workflow?.status).toBe('completed')
})

test('legacy namespaced tools and trailing globs migrate into a recoverable Agent Plan focus', async () => {
  const { root, kernel, session } = await fixture()
  const now = Date.now()
  const item = {
    id: 'legacy-step',
    title: 'Repair the historical focus',
    scope: { readPaths: ['apps/web/**'], writePaths: ['apps/web/**/*'], tools: ['functions.read_file'] },
    acceptanceChecks: [],
  }
  const plan = {
    schemaVersion: 1,
    planId: 'legacy-plan',
    sessionId: session.id,
    revision: 1,
    phase: 'active',
    objective: 'Migrate the historical workflow',
    items: [item],
    createdAt: now,
    updatedAt: now,
  }
  const workflow = {
    schemaVersion: 1,
    workflowId: 'legacy-workflow',
    sessionId: session.id,
    goalId: null,
    planId: plan.planId,
    planRevision: 1,
    revision: 1,
    status: 'active',
    activeItemId: item.id,
    explorationCount: 0,
    workItems: [
      {
        ...item,
        status: 'in_progress',
        owner: { kind: 'main' },
        acceptanceChecks: [],
        startedAt: now,
        completedAt: null,
      },
    ],
    scopeExpansions: [],
    delegations: [],
    evidence: [],
    startCommand: null,
    createdAt: now,
    updatedAt: now,
  }
  await kernel.storage.call('append', session.id, 'workflow.started', { plan, workflow })
  await kernel.close()
  resources.splice(
    resources.findIndex((entry) => entry.kernel === kernel),
    1,
  )

  const restarted = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel: restarted })
  expect(await restarted.plugins.get<PlanService>('plan').get(session.id)).toMatchObject({
    plan: [{ step: item.title, status: 'in_progress' }],
  })
  expect(await restarted.plugins.get<WorkflowService>('workflow').get(session.id)).toMatchObject({
    workflow: {
      executionModel: 'focus_v2',
      status: 'active',
      activeStepIndex: 0,
      workItems: [
        {
          scope: { readPaths: ['apps/web'], writePaths: ['apps/web'], tools: ['read_file'] },
        },
      ],
    },
  })
  expect(
    (await restarted.storage.call('events', session.id, 0, 10_000)).some(
      (event) => event.type === 'workflow.migrated.v2',
    ),
  ).toBeTrue()
})

test('recorded checkpoint intent completes idempotently after a Host restart', async () => {
  const { root, kernel, session, plans, workflows } = await fixture()
  const plan = await plans.update(session.id, [{ step: 'Finish across restart', status: 'in_progress' }])
  const focused = await workflows.focus(
    session.id,
    0,
    {
      id: 'restart-step',
      title: 'ignored',
      scope: { readPaths: [], writePaths: [], tools: [] },
      acceptanceChecks: [],
    },
    'agent',
    plan.revision,
  )
  const workflow = focused.workflow!
  await kernel.storage.call('append', session.id, 'workflow.updated', {
    workflow: {
      ...workflow,
      revision: workflow.revision + 1,
      transitionIntent: {
        operationId: 'recover-operation',
        planRevision: workflow.planRevision,
        stepIndex: workflow.activeStepIndex,
        stepTextHash: workflow.activeStepTextHash,
        itemId: workflow.activeItemId,
        summary: 'Complete after recovery',
        createdAt: Date.now(),
      },
      updatedAt: Date.now(),
    },
  })
  await kernel.close()
  resources.splice(
    resources.findIndex((entry) => entry.kernel === kernel),
    1,
  )
  const restarted = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  resources.push({ root, kernel: restarted })
  expect(await restarted.plugins.get<PlanService>('plan').get(session.id)).toMatchObject({
    plan: [{ step: 'Finish across restart', status: 'completed' }],
  })
  expect(await restarted.plugins.get<WorkflowService>('workflow').get(session.id)).toMatchObject({
    workflow: { status: 'completed', transitionIntent: null, activeItemId: null },
  })
})
