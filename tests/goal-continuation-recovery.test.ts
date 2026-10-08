import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { emptyUsage } from '@hbar/contracts'
import { GoalRuntime } from '@hbar/goal'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { HarnessDriver } from '@hbar/plugin-sdk'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-continuation-recovery-'))
  let calls = 0
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Recovery fixture',
      description: 'Verify safe startup',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      permissions: [],
      provides: { driver: '1.0.0' },
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        run: async (input) => {
          calls++
          const step = crypto.randomUUID()
          await input.beforeRequest(input.request, step)
          await input.emit('usage.recorded', { ...emptyUsage(), output: 1 }, step)
          const callId = crypto.randomUUID()
          await input.commit('assistant', [
            { type: 'tool_call', name: 'update_goal', callId, args: { status: 'complete' } },
          ])
          expect((await input.execute('update_goal', { status: 'complete' }, callId)).isError ?? false).toBe(false)
          await input.stepEnded(step)
        },
        summarize: async () => ({ text: '', usage: emptyUsage() }),
      })
    },
  })
  const options = {
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    profile: { replacements: { 'driver.pi': driver } },
  }
  const kernel = await Kernel.create(options)
  const resource = { root, kernel }
  resources.push(resource)
  const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
  const goals = kernel.plugins.get<GoalRuntime>('goal')
  const goal = (await goals.create(session.id, 'Recover only durable authorized work', 100)).goal!
  const intentId = crypto.randomUUID()
  await kernel.storage.call(
    'enqueue',
    session.id,
    `goal-${intentId}`,
    { text: 'work', images: [], source: 'goal', continuation: { goalId: goal.goalId!, intentId } },
    'local-fixture',
  )
  const run = (await kernel.storage.call('claim', session.id))!
  // Model the crash window after a durable binding/intent but before run.end delivery.
  const saved = z
    .object({ goal: z.record(z.string(), z.unknown()) })
    .parse(
      (await kernel.storage.call('events', session.id, 0)).find((event) => event.type === 'goal.created')!.data,
    ).goal
  const intent = {
    intentId,
    goalId: goal.goalId,
    modelId: run.modelId,
    trigger: 'authorized-start',
    text: '',
    phase: 'running',
    reason: 'goal_active',
    updatedAt: Date.now(),
  }
  await kernel.append(session.id, 'goal.updated', { goal: { ...saved, continuationIntent: intent } })
  await kernel.append(
    session.id,
    'goal.run_bound',
    {
      accounting: {
        goalId: goal.goalId,
        sessionId: session.id,
        startedAt: run.startedAt,
        usageThroughSeq: 0,
        tokensAccounted: 0,
        timeAccounted: 0,
      },
    },
    run.id,
  )
  return { kernel, resource, options, session, run, saved, intent, calls: () => calls }
}

for (const checkpointed of [false, true])
  test(`a completed run with lost continuation callback resumes once (${checkpointed ? 'accounted' : 'unaccounted'})`, async () => {
    const { kernel, resource, options, session, run, saved, intent, calls } = await fixture()
    await kernel.append(session.id, 'usage.recorded', { ...emptyUsage(), output: 2 }, run.id)
    await kernel.storage.call('commit', session.id, run.id, 'assistant', [
      { type: 'tool_call', callId: 'read', name: 'read_file', args: { path: 'result.txt' } },
    ])
    await kernel.storage.call('commit', session.id, run.id, 'tool', [
      { type: 'tool_result', callId: 'read', name: 'read_file', text: 'Verified result', isError: false },
    ])
    await kernel.storage.call('setRun', run.id, 'completed')
    if (checkpointed)
      await kernel.append(
        session.id,
        'goal.accounted',
        { goal: { ...saved, tokensUsed: 2, accountedRuns: [run.id], continuationIntent: intent } },
        run.id,
      )
    await kernel.close()
    resource.kernel = await Kernel.create(options)
    await resource.kernel.waitForIdle()
    expect(calls()).toBe(1)
    expect((await resource.kernel.plugins.get<GoalRuntime>('goal').get(session.id)).goal).toMatchObject({
      status: 'complete',
      tokensUsed: 3,
    })
    await resource.kernel.close()
    resource.kernel = await Kernel.create(options)
    await resource.kernel.waitForIdle()
    expect(calls()).toBe(1)
  })

test('startup revalidates a completed text-only turn and never wakes a legacy Goal without an intent', async () => {
  const { kernel, resource, options, session, run, calls } = await fixture()
  await kernel.storage.call('setRun', run.id, 'completed')
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const legacy = await kernel.createSession(workspace.id)
  await kernel.plugins.get<GoalRuntime>('goal').create(legacy.id, 'Historical active goal')
  await kernel.close()
  resource.kernel = await Kernel.create(options)
  await resource.kernel.waitForIdle()
  expect(calls()).toBe(1)
  expect((await resource.kernel.plugins.get<GoalRuntime>('goal').get(session.id)).goal?.continuation).toMatchObject({
    phase: 'stopped',
    reason: 'complete',
  })
  expect((await resource.kernel.plugins.get<GoalRuntime>('goal').get(legacy.id)).goal?.continuation).toBeUndefined()
})

test('an unfinished write intent is reported unknown and is never replayed after startup', async () => {
  const { kernel, resource, options, session, run, calls } = await fixture()
  await kernel.storage.call('toolStart', session.id, run.id, 'unknown-write', 'write_file', { path: 'result.txt' })
  await kernel.close()
  resource.kernel = await Kernel.create(options)
  await resource.kernel.waitForIdle()
  expect(calls()).toBe(0)
  expect((await resource.kernel.plugins.get<GoalRuntime>('goal').get(session.id)).goal?.continuation).toMatchObject({
    phase: 'stopped',
    reason: 'result_unknown',
  })
})

for (const reason of ['no_tool_calls', 'no_progress'])
  test(`startup revalidates an active Goal stopped by the former ${reason} heuristic exactly once`, async () => {
    const { kernel, resource, options, session, run, saved, intent, calls } = await fixture()
    await kernel.storage.call('setRun', run.id, 'completed')
    await kernel.append(
      session.id,
      'goal.accounted',
      {
        goal: {
          ...saved,
          accountedRuns: [run.id],
          continuationIntent: { ...intent, phase: 'stopped', reason },
        },
      },
      run.id,
    )
    await kernel.close()
    resource.kernel = await Kernel.create(options)
    await resource.kernel.waitForIdle()
    expect(calls()).toBe(1)
    expect((await resource.kernel.plugins.get<GoalRuntime>('goal').get(session.id)).goal?.status).toBe('complete')
    await resource.kernel.close()
    resource.kernel = await Kernel.create(options)
    await resource.kernel.waitForIdle()
    expect(calls()).toBe(1)
  })

test('startup preserves a paused Goal even if its prior turn stopped without tools', async () => {
  const { kernel, resource, options, session, run, saved, intent, calls } = await fixture()
  await kernel.storage.call('setRun', run.id, 'completed')
  await kernel.append(
    session.id,
    'goal.accounted',
    {
      goal: {
        ...saved,
        status: 'paused',
        accountedRuns: [run.id],
        continuationIntent: { ...intent, phase: 'stopped', reason: 'no_tool_calls' },
      },
    },
    run.id,
  )
  await kernel.close()
  resource.kernel = await Kernel.create(options)
  await resource.kernel.waitForIdle()
  expect(calls()).toBe(0)
  expect((await resource.kernel.plugins.get<GoalRuntime>('goal').get(session.id)).goal?.status).toBe('paused')
})

test('interruption accounting excludes offline time from a late recovery timestamp', async () => {
  const { kernel, session, run } = await fixture()
  const goals = kernel.plugins.get<GoalRuntime>('goal')
  const userRun = { ...run, input: { text: 'work', images: [] } }
  await goals.startRun({ sessionId: session.id, runId: run.id, run: userRun })
  await kernel.append(session.id, 'usage.recorded', { ...emptyUsage(), output: 2 }, run.id)
  const recovered = { ...userRun, status: 'interrupted' as const, endedAt: Date.now() + 3_600_000 }
  await goals.accountRun({ sessionId: session.id, runId: run.id, status: 'interrupted', run: recovered })
  expect((await goals.get(session.id)).goal).toMatchObject({ tokensUsed: 2 })
  expect((await goals.get(session.id)).goal!.timeUsedSeconds).toBeLessThan(10)
})
