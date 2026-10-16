import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyUsage, type UserInput } from '@hbar/contracts'
import { BACKEND_UNATTENDED_SETTING } from '@hbar/contracts/backend'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { SettingsService } from '@hbar/kernel/controller'
import { definePlugin, provide, type DriverInput, type GoalService, type HarnessDriver } from '@hbar/plugin-sdk'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function configure(kernel: Kernel, enabled: boolean, notify = true) {
  const settings = new SettingsService(kernel.storage, undefined, notify ? () => kernel.changed('settings') : undefined)
  const before = await settings.get({ kind: 'global' })
  await settings.apply({
    schemaVersion: before.schemaVersion,
    scope: before.scope,
    baselineRevisions: before.revisions,
    actorId: 'backend-goal-fixture',
    idempotencyKey: crypto.randomUUID(),
    changes: [{ op: 'set', path: [{ kind: 'field', name: BACKEND_UNATTENDED_SETTING }], value: enabled }],
  })
}

async function fixture(script: (input: DriverInput, turn: number) => Promise<void>) {
  const prefix = 'hbar-backend-goal-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  let turns = 0
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Backend Goal fixture',
      description: 'Verify automatic continuation admission',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      permissions: [],
      provides: { driver: '1.0.0' },
    },
    apply(api) {
      provide<HarnessDriver>(api, 'driver', {
        async run(input) {
          turns++
          const stepId = crypto.randomUUID()
          await input.beforeRequest(input.request, stepId)
          await input.emit('usage.recorded', { ...emptyUsage(), output: 1 }, stepId)
          await script(input, turns)
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
  let kernel = await Kernel.create(options)
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Missing Goal fixture workspace')
  const session = await kernel.createSession(workspace.id)
  return {
    get kernel() {
      return kernel
    },
    session,
    turns: () => turns,
    goals: () => kernel.plugins.get<GoalService>('goal'),
    async restart() {
      await kernel.close()
      kernel = await Kernel.create(options)
    },
    async close() {
      await kernel.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}

async function finishGoal(input: DriverInput) {
  const callId = crypto.randomUUID()
  await input.commit('assistant', [{ type: 'tool_call', callId, name: 'update_goal', args: { status: 'complete' } }])
  expect((await input.execute('update_goal', { status: 'complete' }, callId)).isError ?? false).toBe(false)
}

for (const policy of ['unconfigured', 'enabled', 'disabled'] as const)
  test(`${policy} background control governs new Goal continuation while preserving manual work`, async () => {
    const f = await fixture(async (input, turn) => {
      if (turn === 2) await finishGoal(input)
    })
    try {
      if (policy !== 'unconfigured') await configure(f.kernel, policy === 'enabled')
      await f.goals().create(f.session.id, 'Complete two authorized turns', 100)
      await f.kernel.submit(f.session.id, 'manual-start', { text: 'Start', images: [] }, 'local-fixture')
      await f.kernel.waitForIdle()
      expect(f.turns()).toBe(policy === 'disabled' ? 1 : 2)
      const goal = (await f.goals().get(f.session.id)).goal
      expect(goal).toMatchObject(
        policy === 'disabled'
          ? { status: 'active', tokensUsed: 1, continuation: { phase: 'waiting', reason: 'disabled' } }
          : { status: 'complete', tokensUsed: 2 },
      )
    } finally {
      await f.close()
    }
  }, 15_000)

test('disabling during a running turn preserves that Run and resumes the same Goal after restart and enable', async () => {
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const f = await fixture(async (input, turn) => {
    if (turn === 1) {
      started.resolve()
      await release.promise
    } else await finishGoal(input)
  })
  try {
    await configure(f.kernel, true)
    const originalGoal = (await f.goals().create(f.session.id, 'Preserve the current task and remaining budget', 100))
      .goal
    if (!originalGoal?.goalId) throw new Error('Expected the original durable Goal identity')
    const run = await f.kernel.submit(f.session.id, 'manual-start', { text: 'Start', images: [] }, 'local-fixture')
    await Promise.race([
      started.promise,
      f.kernel.waitForIdle().then(() => {
        throw new Error('The manual Run ended before reaching the fixture driver')
      }),
    ])
    await configure(f.kernel, false)
    expect((await f.kernel.storage.call('run', run.id)).status).toBe('running')
    release.resolve()
    await f.kernel.waitForIdle()
    expect((await f.kernel.storage.call('run', run.id)).status).toBe('completed')
    expect(f.turns()).toBe(1)
    const waiting = (await f.goals().get(f.session.id)).goal
    expect(waiting).toMatchObject({
      status: 'active',
      tokensUsed: 1,
      continuation: { phase: 'waiting', reason: 'disabled' },
    })
    const intentId = waiting?.continuation?.intentId
    if (!intentId) throw new Error('Expected the retained continuation intent')
    await f.restart()
    await f.kernel.waitForIdle()
    expect(f.turns()).toBe(1)
    expect((await f.goals().get(f.session.id)).goal).toMatchObject({
      goalId: originalGoal.goalId,
      tokenBudget: originalGoal.tokenBudget,
      tokensUsed: 1,
      continuation: { intentId, phase: 'waiting', reason: 'disabled' },
    })
    await configure(f.kernel, true)
    await f.kernel.activate()
    await f.kernel.waitForIdle()
    expect(f.turns()).toBe(2)
    expect((await f.goals().get(f.session.id)).goal).toMatchObject({
      goalId: originalGoal.goalId,
      tokenBudget: originalGoal.tokenBudget,
      status: 'complete',
      tokensUsed: 2,
      continuation: { intentId, phase: 'stopped', reason: 'complete' },
    })
    const snapshot = await f.kernel.storage.call('snapshot', f.session.id)
    expect(snapshot.runs).toHaveLength(2)
    const continuations = snapshot.runs.filter((candidate) => candidate.input.source === 'goal')
    expect(continuations).toHaveLength(1)
    const continued = continuations[0]
    if (!continued) throw new Error('Expected exactly one accepted Goal continuation')
    expect(continued).toMatchObject({
      requestId: `goal-${intentId}`,
      status: 'completed',
      input: { continuation: { goalId: originalGoal.goalId, intentId } },
    })
    const journal = await f.kernel.storage.call('readEventPage', {
      sessionId: f.session.id,
      afterSeq: 0,
      types: ['goal.created', 'run.queued'],
      headerOnlyTypes: ['goal.created', 'run.queued'],
      limit: 8,
      maxReplyBytes: 16 * 1_024,
    })
    expect(journal.hasMore).toBe(false)
    expect(journal.items.filter((item) => item.event.type === 'goal.created')).toHaveLength(1)
    expect(
      journal.items
        .filter((item) => item.event.type === 'run.queued')
        .map((item) => item.event.runId)
        .sort(),
    ).toEqual([run.id, continued.id].sort())
  } finally {
    release.resolve()
    await f.close()
  }
}, 20_000)

test('transactional admission rejects a new disabled continuation but reconciles an earlier accepted identity', async () => {
  const f = await fixture(async () => {})
  try {
    const input: UserInput = {
      text: '',
      images: [],
      source: 'goal',
      continuation: { goalId: 'goal', intentId: 'intent' },
    }
    const accepted = await f.kernel.storage.call('enqueue', f.session.id, 'accepted', input, 'local-fixture')
    await configure(f.kernel, false, false)
    expect((await f.kernel.storage.call('enqueue', f.session.id, 'accepted', input, 'local-fixture')).id).toBe(
      accepted.id,
    )
    let failure: unknown
    try {
      await f.kernel.storage.call('enqueue', f.session.id, 'new-request', input, 'local-fixture')
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({ code: 'BACKEND_AUTOMATION_DISABLED' })
    expect(await f.kernel.storage.call('runByRequest', f.session.id, 'new-request')).toBeNull()
    expect((await f.kernel.snapshot(f.session.id)).runs).toHaveLength(1)
  } finally {
    await f.close()
  }
}, 15_000)

test('a disable between Goal idle selection and enqueue leaves a recoverable intent without an orphan Run', async () => {
  const f = await fixture(async (input, turn) => {
    if (turn === 2) await finishGoal(input)
  })
  let interrupted = false
  const dispose = f.kernel.hooks.on('session.idle', async (event) => {
    if (event.sessionId === f.session.id && event.submission?.input.continuation && !interrupted) {
      interrupted = true
      await configure(f.kernel, false, false)
    }
    return event
  })
  try {
    await configure(f.kernel, true)
    await f.goals().create(f.session.id, 'Survive a concurrent automation setting change', 100)
    await f.kernel.submit(f.session.id, 'manual-start', { text: 'Start', images: [] }, 'local-fixture')
    await f.kernel.waitForIdle()
    expect(interrupted).toBe(true)
    expect(f.turns()).toBe(1)
    expect((await f.kernel.snapshot(f.session.id)).runs).toHaveLength(1)
    expect((await f.goals().get(f.session.id)).goal).toMatchObject({
      status: 'active',
      continuation: { phase: 'waiting', reason: 'disabled' },
    })
    await dispose()
    await configure(f.kernel, true)
    await f.kernel.activate()
    await f.kernel.waitForIdle()
    expect(f.turns()).toBe(2)
    expect((await f.goals().get(f.session.id)).goal?.status).toBe('complete')
  } finally {
    try {
      await dispose()
    } finally {
      await f.close()
    }
  }
}, 20_000)
