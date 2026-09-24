import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createGoalPlanCommandClient } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { GoalService, PlanService, WorkflowService } from '@hbar/plugin-sdk'
import { startServer } from '../apps/host/src/server'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-goal-integrity-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const resource = { root, kernel }
  resources.push(resource)
  await kernel.changePlugin('goal.codex', true, { autoContinue: false, maxContinuations: 0 })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  return {
    resource,
    kernel,
    session,
    goals: kernel.plugins.get<GoalService>('goal'),
    plans: kernel.plugins.get<PlanService>('plan'),
    workflows: kernel.plugins.get<WorkflowService>('workflow'),
  }
}

const item = {
  id: 'verify',
  title: 'Verify the result',
  scope: { readPaths: ['.'], writePaths: [], tools: ['read_file'] },
  acceptanceChecks: [],
}

async function rejection(operation: Promise<unknown>) {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected the operation to reject')
}

test('both public completion commands and the model tool enforce workflow acceptance', async () => {
  const { kernel, session, goals, plans, workflows, resource } = await fixture()
  await goals.create(session.id, 'Verify the result', 10000)
  const plan = await plans.update(session.id, [{ step: 'Verify the result', status: 'in_progress' }])
  await workflows.focus(session.id, 0, item, 'agent', plan.revision)
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  try {
    await client.pair(host.pairing.code, 'goal integrity')
    const commands = createGoalPlanCommandClient(client)
    for (const command of ['goal.set', 'goal.update'] as const)
      await expect(commands.execute(command, { sessionId: session.id, status: 'complete' })).rejects.toMatchObject({
        code: 'WORKFLOW_ACCEPTANCE_PENDING',
      })
    await kernel.submit(
      session.id,
      'premature-completion',
      {
        text: '/tool update_goal {"status":"complete"}',
        images: [],
      },
      'local-fixture',
    )
    await kernel.waitForIdle()
    expect(
      (await kernel.snapshot(session.id)).messages
        .flatMap((message) => message.content)
        .some((block) => block.type === 'tool_result' && block.name === 'update_goal' && block.isError),
    ).toBe(true)
    expect((await goals.get(session.id)).goal?.status).toBe('active')
    const focused = await workflows.get(session.id)
    await workflows.checkpoint(session.id, item.id, 'complete', 'Result verified', null, focused.workflow!.revision)
    expect((await commands.execute('goal.set', { sessionId: session.id, status: 'complete' })).goal?.status).toBe(
      'complete',
    )
  } finally {
    client.disconnect()
    await host.close()
  }
  await kernel.close()
  resource.kernel = await Kernel.create({ home: join(resource.root, 'data'), demo: true, secrets: new MemorySecrets() })
  expect((await resource.kernel.plugins.get<GoalService>('goal').get(session.id)).goal?.status).toBe('complete')
  expect((await resource.kernel.plugins.get<WorkflowService>('workflow').get(session.id)).workflow?.status).toBe(
    'completed',
  )
})

test('unfinished objectives require explicit identity-checked replacement and cannot be created complete', async () => {
  const { session, goals, plans } = await fixture()
  await expect(goals.set(session.id, { objective: 'already done', status: 'complete' })).rejects.toMatchObject({
    code: 'GOAL_INVALID',
  })
  const original = await goals.create(session.id, 'Original objective')
  await plans.update(session.id, [{ step: 'Original work', status: 'in_progress' }])
  await expect(goals.create(session.id, 'New objective')).rejects.toMatchObject({ code: 'GOAL_EXISTS' })
  await expect(goals.set(session.id, { objective: 'New objective' })).rejects.toMatchObject({ code: 'GOAL_CONFLICT' })
  await expect(
    goals.set(session.id, { objective: 'New objective', status: 'complete', expectedGoalId: original.goal?.goalId }),
  ).rejects.toMatchObject({ code: 'GOAL_INVALID' })
  expect((await goals.get(session.id)).goal?.goalId).toBe(original.goal?.goalId)
  expect((await plans.get(session.id))?.plan[0]?.step).toBe('Original work')
  await goals.clear(session.id)
  await expect(
    goals.set(session.id, { objective: 'Stale resurrection', expectedGoalId: original.goal?.goalId }),
  ).rejects.toMatchObject({ code: 'GOAL_CONFLICT' })
})

for (const concurrentChange of ['plan', 'workflow'] as const) {
  test(`goal completion rejects a concurrent ${concurrentChange} change before committing`, async () => {
    const { kernel, session, goals, plans, workflows } = await fixture()
    await goals.create(session.id, 'Inspect completion race')
    const plan = await plans.update(session.id, [{ step: 'Inspect completion race', status: 'in_progress' }])
    let entered!: () => void
    const observed = new Promise<void>((resolve) => {
      entered = resolve
    })
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const dispose = kernel.hooks.on('goal.beforeComplete', async () => {
      entered()
      await gate
    })
    const completion = goals.set(session.id, { status: 'complete' }).then(
      () => null,
      (error: unknown) => error,
    )
    try {
      await observed
      if (concurrentChange === 'plan') await plans.update(session.id, [{ step: 'New work', status: 'in_progress' }])
      else await workflows.focus(session.id, 0, item, 'agent', plan.revision)
    } finally {
      release()
      await dispose()
    }
    expect(await completion).toMatchObject({
      code: concurrentChange === 'plan' ? 'PLAN_REVISION_CONFLICT' : 'WORKFLOW_REVISION_CONFLICT',
    })
    expect((await goals.get(session.id)).goal?.status).toBe('active')
  })
}

test('plan clear keeps a durable revision tombstone and rejects the previous plan after recreation', async () => {
  const { resource, kernel, session, plans } = await fixture()
  const first = await plans.update(session.id, [{ step: 'First', status: 'in_progress' }])
  await plans.clear(session.id, first.revision)
  await kernel.close()
  resource.kernel = await Kernel.create({ home: join(resource.root, 'data'), demo: true, secrets: new MemorySecrets() })
  const restored = resource.kernel.plugins.get<PlanService>('plan')
  const next = await restored.update(session.id, [{ step: 'Replacement', status: 'in_progress' }], null, null, 0)
  expect(next.revision).toBe(first.revision + 2)
  expect(
    await rejection(restored.update(session.id, [{ step: 'Stale', status: 'completed' }], null, null, first.revision)),
  ).toMatchObject({ code: 'PLAN_REVISION_CONFLICT' })
  expect(
    await rejection(
      resource.kernel.plugins.get<WorkflowService>('workflow').focus(session.id, 0, item, 'agent', first.revision),
    ),
  ).toMatchObject({ code: 'WORKFLOW_REVISION_CONFLICT' })
})

test('a run from a replaced goal cannot complete or charge the new objective', async () => {
  const { kernel, session, goals } = await fixture()
  const original = await goals.create(session.id, 'Original task')
  const dispose = kernel.hooks.on('run.start', async () => {
    await goals.set(session.id, { objective: 'Replacement task', expectedGoalId: original.goal?.goalId })
  })
  try {
    await kernel.submit(
      session.id,
      'stale-goal-run',
      {
        text: '/tool update_goal {"status":"complete"}',
        images: [],
      },
      'local-fixture',
    )
    await kernel.waitForIdle()
    expect((await goals.get(session.id)).goal).toMatchObject({
      objective: 'Replacement task',
      status: 'active',
      tokensUsed: 0,
    })
    expect(
      (await kernel.snapshot(session.id)).messages
        .flatMap((message) => message.content)
        .some((block) => block.type === 'tool_result' && block.name === 'update_goal' && block.isError),
    ).toBe(true)
  } finally {
    await dispose()
  }
})
