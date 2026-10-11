import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { emptyUsage } from '@hbar/contracts'
import { GoalRuntime } from '@hbar/goal'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type {
  BudgetService,
  DriverInput,
  HarnessDriver,
  ModelRegistry,
  ModelRequest,
  ModeService,
} from '@hbar/plugin-sdk'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function fixture(script: (input: DriverInput) => Promise<void> = async () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-goal-replacement-'))
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Goal redirection fixture',
      description: 'Exercise Host boundaries',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      permissions: [],
      provides: { driver: '1.0.0' },
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        async run(input) {
          const stepId = crypto.randomUUID()
          await input.beforeRequest(input.request, stepId)
          await input.emit('usage.recorded', { ...emptyUsage(), output: 2 }, stepId)
          await script(input)
          await input.stepEnded(stepId)
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
  return { root, resource, options, kernel, session, goals: kernel.plugins.get<GoalRuntime>('goal') }
}

async function call(input: DriverInput, name: string, args: Record<string, unknown>) {
  const callId = crypto.randomUUID()
  await input.commit('assistant', [{ type: 'tool_call', name, args, callId }])
  return input.execute(name, args, callId)
}

test('missing replacement data and missing Run context safely decorate fresh and restored Goals', async () => {
  const f = await fixture()
  await f.goals.create(f.session.id, 'A legacy objective without replacement metadata')
  const model = await f.kernel.plugins.get<ModelRegistry>('models').get('local-fixture')
  const request: ModelRequest = { system: 'stable', messages: [], model }
  const check = (goals: GoalRuntime) => {
    expect(goals.decorate(request).system).toBe('stable')
    for (const context of [{ sessionId: f.session.id }, { sessionId: f.session.id, runId: undefined }]) {
      const decorated = goals.decorate({ ...request, context })
      expect(decorated.system).toContain('A legacy objective')
      expect(decorated.system).not.toContain('<goal_replacement>')
    }
  }
  check(f.goals)
  await f.kernel.close()
  f.resource.kernel = await Kernel.create(f.options)
  const restored = f.resource.kernel.plugins.get<GoalRuntime>('goal')
  check(restored)
  const old = (await restored.get(f.session.id)).goal!
  await restored.set(f.session.id, { objective: 'A replacement not yet bound to a Run', expectedGoalId: old.goalId })
  expect(restored.decorate({ ...request, context: { sessionId: f.session.id } }).system).not.toContain(
    '<goal_replacement>',
  )
  expect((await restored.get(f.session.id)).goal?.continuation).toMatchObject({
    phase: 'waiting',
    reason: 'model_unavailable',
  })
})

test('decorates the authoritative non-active Goal state without scheduling or mutating it', async () => {
  const f = await fixture()
  const model = await f.kernel.plugins.get<ModelRegistry>('models').get('local-fixture')
  const request: ModelRequest = { system: 'stable', messages: [], model, context: { sessionId: f.session.id } }
  await f.goals.create(f.session.id, 'A paused objective')
  const before = await f.goals.snapshot(f.session.id)
  await f.goals.set(f.session.id, { status: 'paused', expectedGoalId: before.value.goal!.goalId })
  const paused = await f.goals.snapshot(f.session.id)
  const sessionBeforeDecoration = await f.kernel.snapshot(f.session.id)
  const goalBeforeDecoration = await f.goals.snapshot(f.session.id)
  const decorated = f.goals.decorate(request)
  expect(decorated.system).toContain('<current_goal>')
  expect(decorated.system).toContain(`Goal ID: ${paused.value.goal!.goalId}`)
  expect(decorated.system).toContain('Status: paused')
  expect(decorated.system).toContain('A paused objective')
  expect(decorated.system).not.toContain('<active_goal>')
  expect((await f.goals.snapshot(f.session.id)).value.goal).toEqual(paused.value.goal)
  expect((await f.goals.snapshot(f.session.id)).seq).toBe(goalBeforeDecoration.seq)
  expect((await f.kernel.snapshot(f.session.id)).runs).toEqual(sessionBeforeDecoration.runs)

  for (const status of ['blocked', 'usage_limited'] as const) {
    await f.goals.set(f.session.id, { status, expectedGoalId: paused.value.goal!.goalId })
    const current = await f.goals.snapshot(f.session.id)
    expect(f.goals.decorate(request).system).toContain(`Status: ${status}`)
    expect((await f.goals.snapshot(f.session.id)).value.goal).toEqual(current.value.goal)
  }
  await f.goals.set(f.session.id, { status: 'budget_limited', expectedGoalId: paused.value.goal!.goalId })
  const budgetRequest: ModelRequest = {
    ...request,
    context: { sessionId: f.session.id, purpose: 'context-inspection' },
  }
  expect(f.goals.decorate(budgetRequest).system).toContain('Status: budget_limited')

  await f.goals.set(f.session.id, { status: 'complete', expectedGoalId: paused.value.goal!.goalId })
  expect(f.goals.decorate(request).system).toContain('Status: complete')
  await f.goals.clear(f.session.id, paused.value.goal!.goalId)
  const cleared = f.goals.decorate(request)
  expect(cleared.system).toContain('<current_goal status="none">')
  expect(cleared.system).not.toContain('A paused objective')
})

for (const source of ['user', 'goal'] as const) {
  test(`a ${source} Run hands off once without stale effects or cross-goal charges`, async () => {
    const entered = deferred<void>()
    const release = deferred<void>()
    let turns = 0
    let effects = 0
    let successorContext = ''
    const f = await fixture(async (input) => {
      turns++
      if (turns === 1) {
        await call(input, 'effect_probe', {})
        entered.resolve()
        await release.promise
        await call(input, 'effect_probe', {})
      } else {
        successorContext = input.request.system
        await call(input, 'update_goal', { status: 'complete' })
      }
    })
    f.kernel.tools.register({
      name: 'effect_probe',
      description: 'Count actual effects',
      inputSchema: z.object({}),
      effect: 'write',
      workspaceAccess: { kind: 'none' },
      execute: async () => {
        effects++
        return { text: 'effect' }
      },
    })
    await f.kernel.setPermissionMode('allow')
    const budgets = f.kernel.plugins.get<BudgetService>('budget')
    await budgets.set(f.session.id, 100)
    const original = (await f.goals.create(f.session.id, 'Write the original password flow', 100)).goal!
    if (source === 'goal')
      await f.goals.requestContinuation(f.session.id, {
        goalId: original.goalId!,
        trigger: 'first',
        modelId: 'local-fixture',
      })
    else await f.kernel.submit(f.session.id, 'first', { text: 'Work', images: [] }, 'local-fixture')
    await entered.promise
    await f.goals.set(f.session.id, { objective: 'Switch to email links', expectedGoalId: original.goalId })
    release.resolve()
    await f.kernel.waitForIdle()
    const snapshot = await f.kernel.snapshot(f.session.id)
    expect(turns).toBe(2)
    expect(effects).toBe(1)
    expect(snapshot.runs.map(({ status, error, failure }) => ({ status, error, failure }))).toEqual([
      { status: 'completed', error: null, failure: undefined },
      { status: 'completed', error: null, failure: undefined },
    ])
    const results = snapshot.messages
      .flatMap((message) => message.content)
      .filter((block) => block.type === 'tool_result')
    expect(results.some((block) => block.outcome?.reason === 'goal_replaced' && !block.isError)).toBe(true)
    expect((await f.goals.get(f.session.id)).goal).toMatchObject({
      objective: 'Switch to email links',
      status: 'complete',
      tokensUsed: 2,
    })
    expect((await budgets.get(f.session.id))?.usedTokens).toBe(4)
    expect(successorContext).toContain('<goal_replacement>')
    expect(successorContext).toContain('Write the original password flow')
    expect(successorContext).toContain('Switch to email links')
  })
}

test('idle replacement starts from the last actual model and rapid replacements execute only the final target', async () => {
  const objectives: string[] = []
  const f = await fixture(async (input) => {
    if (input.run.input.source !== 'goal') return
    objectives.push(input.request.system)
    await call(input, 'update_goal', { status: 'complete' })
  })
  await f.kernel.submit(
    f.session.id,
    'seed-model',
    { text: 'Establish the execution model', images: [] },
    'local-fixture',
  )
  await f.kernel.waitForIdle()
  const goal = (await f.goals.create(f.session.id, 'Original')).goal!
  // Plan mode gates dispatch while both authoritative replacements commit.
  await f.kernel.plugins.get<ModeService>('mode').set(f.session.id, 'plan')
  const second = (await f.goals.set(f.session.id, { objective: 'Intermediate', expectedGoalId: goal.goalId })).goal!
  await f.kernel.waitForIdle()
  await f.goals.set(f.session.id, { objective: 'Final', expectedGoalId: second.goalId })
  await f.kernel.waitForIdle()
  expect(objectives).toHaveLength(0)
  await f.kernel.plugins.get<ModeService>('mode').set(f.session.id, 'default')
  await f.kernel.waitForIdle()
  expect(objectives).toHaveLength(1)
  expect(objectives[0]).toContain('Original')
  expect(objectives[0]).not.toContain('Intermediate')
  expect((await f.goals.get(f.session.id)).goal).toMatchObject({ objective: 'Final', status: 'complete' })
})

test('replacement before the first request normally retires the old Run without paid inference', async () => {
  let turns = 0
  const f = await fixture(async (input) => {
    turns++
    await call(input, 'update_goal', { status: 'complete' })
  })
  const goal = (await f.goals.create(f.session.id, 'Original')).goal!
  let changed = false
  const dispose = f.kernel.hooks.on('run.start', async () => {
    if (changed) return
    changed = true
    await f.goals.set(f.session.id, { objective: 'Replacement before inference', expectedGoalId: goal.goalId })
  })
  await f.kernel.submit(f.session.id, 'initial', { text: 'Old task', images: [] }, 'local-fixture')
  await f.kernel.waitForIdle()
  await dispose()
  expect(turns).toBe(1)
  const snapshot = await f.kernel.snapshot(f.session.id)
  expect(snapshot.runs.map((run) => run.status)).toEqual(['completed', 'completed'])
  const events = await f.kernel.storage.call('events', f.session.id, 0)
  expect(events.filter((event) => event.type === 'request.started')).toHaveLength(1)
  expect((await f.goals.get(f.session.id)).goal?.status).toBe('complete')
})

test('a nested sequential batch unwinds normally after replacement without executing its remaining children', async () => {
  let turns = 0
  let effects = 0
  const f = await fixture(async (input) => {
    turns++
    await call(input, turns === 1 ? 'batch_probe' : 'update_goal', turns === 1 ? {} : { status: 'complete' })
  })
  f.kernel.tools.register({
    name: 'child_probe',
    description: 'First child replaces its Goal',
    inputSchema: z.object({}),
    effect: 'write',
    workspaceAccess: { kind: 'none' },
    execute: async () => {
      effects++
      const goal = (await f.goals.get(f.session.id)).goal!
      await f.goals.set(f.session.id, { objective: 'New sequence objective', expectedGoalId: goal.goalId })
      return { text: 'first effect completed' }
    },
  })
  f.kernel.tools.register({
    name: 'batch_probe',
    description: 'Use the bounded Host sequence',
    inputSchema: z.object({}),
    effect: 'read',
    execute: async (_args, context) => ({
      text: JSON.stringify(
        await context.executeSequence?.([
          { name: 'child_probe', arguments: {} },
          { name: 'child_probe', arguments: {} },
        ]),
      ),
    }),
  })
  await f.kernel.setPermissionMode('allow')
  await f.goals.create(f.session.id, 'Original sequence objective')
  await f.kernel.submit(f.session.id, 'initial', { text: 'Use a batch', images: [] }, 'local-fixture')
  await f.kernel.waitForIdle()
  expect(effects).toBe(1)
  expect(turns).toBe(2)
  expect((await f.kernel.snapshot(f.session.id)).runs.every((run) => run.status === 'completed')).toBe(true)
  expect((await f.goals.get(f.session.id)).goal?.status).toBe('complete')
})

for (const waiting of ['approval', 'input'] as const) {
  test(`replacement releases an old ${waiting} wait and late responses cannot execute it`, async () => {
    const entered = deferred<string>()
    let turns = 0
    let effects = 0
    const f = await fixture(async (input) => {
      turns++
      if (turns === 1) await call(input, 'wait_probe', {})
      else await call(input, 'update_goal', { status: 'complete' })
    })
    f.kernel.tools.register({
      name: 'wait_probe',
      description: 'Wait on the old objective',
      inputSchema: z.object({}),
      effect: waiting === 'approval' ? 'write' : 'read',
      workspaceAccess: { kind: 'none' },
      ...(waiting === 'approval' ? { humanApproval: 'required' as const } : {}),
      execute: async (_args, context) => {
        if (waiting === 'input') {
          const requestId = crypto.randomUUID()
          const pending = f.kernel.requestUserInput(
            {
              requestId,
              sessionId: context.session.id,
              runId: context.run.id,
              callId: context.callId,
              questions: [
                { id: 'choice', header: 'Choice', question: 'Old task question', isOther: false, isSecret: false },
              ],
              isBlocking: true,
            },
            context.signal,
          )
          // Wait for durable admission, not merely starting the asynchronous call.
          return { text: JSON.stringify(await pending) }
        }
        effects++
        return { text: 'executed' }
      },
    })
    const dispose = f.kernel.subscribe((event) => {
      if (event.method === 'session.event' && event.params.type === 'approval.requested') {
        const approval = z.object({ id: z.string() }).parse(event.params.data)
        entered.resolve(approval.id)
      }
      if (event.method === 'user_input.requested') entered.resolve(event.params.requestId)
    })
    const original = (await f.goals.create(f.session.id, 'Old waiting task')).goal!
    await f.kernel.submit(f.session.id, 'first', { text: 'Work', images: [] }, 'local-fixture')
    const id = await entered.promise
    await f.goals.set(f.session.id, { objective: 'New task without the old question', expectedGoalId: original.goalId })
    await f.kernel.waitForIdle()
    if (waiting === 'approval') {
      await f.kernel.resolveApproval(id, 'allowed')
      expect((await f.kernel.storage.call('approval', id)).status).toBe('cancelled')
    } else expect(await f.kernel.resolveUserInput(id, { choice: { answers: ['late'] } })).toBe(false)
    expect(effects).toBe(0)
    expect(turns).toBe(2)
    expect(
      (await f.kernel.snapshot(f.session.id)).runs.every((run) => run.status === 'completed' && !run.failure),
    ).toBe(true)
    dispose()
  })
}

test('a durable replacement waits through restart and preserves paused intent', async () => {
  let turns = 0
  const f = await fixture(async (input) => {
    turns++
    await call(input, 'update_goal', { status: 'complete' })
  })
  await f.kernel.submit(f.session.id, 'seed', { text: 'Establish model', images: [], mode: 'plan' }, 'local-fixture')
  await f.kernel.waitForIdle()
  turns = 0
  const original = (await f.goals.create(f.session.id, 'Original')).goal!
  await f.kernel.plugins.get<ModeService>('mode').set(f.session.id, 'plan')
  await f.goals.requestContinuation(f.session.id, {
    goalId: original.goalId!,
    trigger: 'seed',
    modelId: 'local-fixture',
  })
  const replacement = (
    await f.goals.set(f.session.id, { objective: 'Persisted successor', expectedGoalId: original.goalId })
  ).goal!
  await f.kernel.waitForIdle()
  await f.kernel.close()
  f.resource.kernel = await Kernel.create(f.options)
  await f.resource.kernel.waitForIdle()
  expect(turns).toBe(0)
  await f.resource.kernel.plugins.get<ModeService>('mode').set(f.session.id, 'default')
  await f.resource.kernel.waitForIdle()
  expect(turns).toBe(1)
  const goals = f.resource.kernel.plugins.get<GoalRuntime>('goal')
  expect((await goals.get(f.session.id)).goal).toMatchObject({ goalId: replacement.goalId, status: 'complete' })
  await goals.set(f.session.id, { status: 'paused', expectedGoalId: replacement.goalId })
  await goals.set(f.session.id, { objective: 'Paused successor', expectedGoalId: replacement.goalId })
  await f.resource.kernel.waitForIdle()
  expect(turns).toBe(1)
  expect((await goals.get(f.session.id)).goal?.status).toBe('paused')
})
