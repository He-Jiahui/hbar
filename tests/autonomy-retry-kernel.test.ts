import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError, emptyUsage } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { SettingsService } from '@hbar/kernel/settings'
import { BACKEND_UNATTENDED_SETTING } from '@hbar/contracts/backend'
import {
  AUTONOMY_TRANSIENT_RETRIES_SETTING,
  AUTONOMY_REPAIR_RETRIES_SETTING,
  AUTONOMY_RETRY_DELAY_SETTING,
  type AutonomyRetryConfiguration,
} from '@hbar/contracts/autonomy-retry'
import {
  definePlugin,
  provide,
  type HarnessDriver,
  type DriverInput,
  type GoalService,
  type BudgetService,
} from '@hbar/plugin-sdk'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function fixture(script: (input: DriverInput, attempt: number) => Promise<void>, budgetLimit = 100) {
  const prefix = 'hbar-autonomy-retry-kernel-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  let calls = 0
  const starts: number[] = []
  const inputs: DriverInput['run'][] = []
  const prompts: string[] = []
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Autonomous retry fixture',
      description: 'Source-accounted temporary failures',
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
          starts.push(Date.now())
          inputs.push(input.run)
          prompts.push(input.request.system)
          const step = crypto.randomUUID()
          await input.beforeRequest(input.request, step)
          await input.emit('usage.recorded', { ...emptyUsage(), output: 1 }, step)
          await script(input, calls)
          await input.stepEnded(step)
        },
        summarize: async () => ({ text: '', usage: emptyUsage() }),
      })
    },
  })
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    profile: { replacements: { 'driver.pi': driver } },
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Missing source workspace')
  await kernel.storage.call(
    'putDevice',
    {
      id: 'source-operator',
      name: 'Source owner',
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
      role: 'operator',
      workspaceIds: null,
    },
    'local-fixture-hash',
  )
  const session = await kernel.storage.call('createSessionCommand', {
    workspaceId: workspace.id,
    actorId: 'source-operator',
    idempotencyKey: 'create',
  })
  await kernel.plugins.get<BudgetService>('budget').set(session.id, budgetLimit)
  const settings = new SettingsService(kernel.storage, undefined, () => kernel.changed('settings'))
  const enable = async (value = true, configuration: Partial<AutonomyRetryConfiguration> = {}) => {
    const before = await settings.get({ kind: 'global' })
    await settings.apply({
      schemaVersion: before.schemaVersion,
      scope: before.scope,
      baselineRevisions: before.revisions,
      actorId: 'source-operator',
      idempotencyKey: crypto.randomUUID(),
      changes: [
        { op: 'set', path: [{ kind: 'field', name: BACKEND_UNATTENDED_SETTING }], value },
        ...[
          { name: AUTONOMY_TRANSIENT_RETRIES_SETTING, value: configuration.transientRetries },
          { name: AUTONOMY_REPAIR_RETRIES_SETTING, value: configuration.repairRetries },
          { name: AUTONOMY_RETRY_DELAY_SETTING, value: configuration.retryDelayMs },
        ].flatMap((field) =>
          field.value === undefined
            ? []
            : [
                {
                  op: 'set' as const,
                  path: [{ kind: 'field' as const, name: field.name }],
                  value: field.value,
                },
              ],
        ),
      ],
    })
  }
  return {
    kernel,
    session,
    starts,
    inputs,
    prompts,
    enable,
    get calls() {
      return calls
    },
    async submit() {
      return kernel.submit(
        session.id,
        'original',
        { text: 'Finish the bounded task', images: [], approval: 'deny', mode: 'plan' },
        'local-fixture',
      )
    },
    async close() {
      await kernel.close()
      await removeOwnedTestDirectory(root, prefix)
    },
  }
}
const finish = (input: DriverInput) =>
  input.commit('assistant', [{ type: 'text', text: 'The original task is complete.' }])

test('three diagnostic repair turns correct a real missing-tool failure with the original budget and authority', async () => {
  const f = await fixture(async (input, attempt) => {
    if (attempt <= 3) await input.execute('missing_fixture_tool', {}, 'missing-tool-call')
    else await finish(input)
  })
  try {
    await f.enable(true, { retryDelayMs: 100 })
    const original = await f.submit()
    await f.kernel.waitForIdle()
    const snapshot = await f.kernel.snapshot(f.session.id)
    expect(f.calls).toBe(4)
    expect(snapshot.runs.toReversed().map((run) => run.status)).toEqual(['failed', 'failed', 'failed', 'completed'])
    const userMessages = snapshot.messages.filter((message) => message.role === 'user')
    expect(userMessages).toHaveLength(1)
    expect(userMessages[0]?.runId).toBe(original.id)
    expect(userMessages[0]?.content).toEqual([{ type: 'text', text: original.input.text }])
    for (const run of snapshot.runs) {
      expect(run.input).toMatchObject({ mode: 'plan', approval: 'deny' })
      expect(await f.kernel.storage.call('runExecutionPrincipal', run.id)).toEqual(
        await f.kernel.storage.call('runExecutionPrincipal', original.id),
      )
      expect(run.input.text).toBe(original.input.text)
    }
    expect((await f.kernel.plugins.get<BudgetService>('budget').get(f.session.id))?.usedTokens).toBe(4)
    expect((await f.kernel.plugins.get<GoalService>('goal').get(f.session.id)).goal).toBeNull()
    expect(
      f.prompts
        .slice(1)
        .every(
          (prompt) =>
            prompt.includes('diagnosed execution error (TOOL_NOT_FOUND)') && prompt.includes('missing_fixture_tool'),
        ),
    ).toBe(true)
    const events = await f.kernel.storage.call('events', f.session.id, 0, 200)
    expect(
      events.filter((event) => event.type.startsWith('run.autonomyRetry.')).map((event) => event.data),
    ).toMatchObject([
      { kind: 'repair', repairRetries: 1, transientRetries: 0 },
      { kind: 'repair', repairRetries: 2, transientRetries: 0 },
      { kind: 'repair', repairRetries: 3, transientRetries: 0 },
    ])
  } finally {
    await f.close()
  }
}, 15_000)

test('exhausted repairs stop after three attempts and increasing a limit does not erase used attempts', async () => {
  const f = await fixture(async (input) => {
    await input.execute('still_missing_fixture_tool', {}, 'missing-tool-call')
  })
  try {
    await f.enable(true, { retryDelayMs: 100 })
    await f.submit()
    await f.kernel.waitForIdle()
    expect(f.calls).toBe(4)
    expect(await f.kernel.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    await f.enable(true, { repairRetries: 4 })
    await f.kernel.waitForIdle()
    expect(f.calls).toBe(5)
    const events = await f.kernel.storage.call('events', f.session.id, 0, 200)
    expect(events.filter((event) => event.type.startsWith('run.autonomyRetry.')).at(-1)?.data).toMatchObject({
      repairRetries: 4,
      transientRetries: 0,
    })
    await f.kernel.activate()
    await f.kernel.waitForIdle()
    expect(f.calls).toBe(5)
  } finally {
    await f.close()
  }
}, 15_000)

test('a diagnostic repair cannot consume an exhausted budget or a zero repair allowance', async () => {
  for (const limit of [0, 3]) {
    const f = await fixture(
      async (input) => {
        await input.execute('missing_fixture_tool', {}, 'missing-tool-call')
      },
      limit === 0 ? 100 : 1,
    )
    try {
      await f.enable(true, { repairRetries: limit, retryDelayMs: 100 })
      await f.submit()
      await f.kernel.waitForIdle()
      expect(f.calls).toBe(1)
      expect((await f.kernel.snapshot(f.session.id)).runs).toHaveLength(1)
      expect((await f.kernel.plugins.get<BudgetService>('budget').get(f.session.id))?.usedTokens).toBe(1)
    } finally {
      await f.close()
    }
  }
}, 10_000)

test('a configured transient allowance can exceed the default without borrowing repair attempts', async () => {
  const f = await fixture(async () => {
    throw new HbarError('PROVIDER_CONNECTION_FAILED', 'The configured allowance remains authoritative')
  })
  try {
    await f.enable(true, { transientRetries: 3, retryDelayMs: 100 })
    await f.submit()
    await f.kernel.waitForIdle()
    expect(f.calls).toBe(4)
    const events = await f.kernel.storage.call('events', f.session.id, 0, 200)
    expect(events.filter((event) => event.type.startsWith('run.autonomyRetry.')).at(-1)?.data).toMatchObject({
      transientRetries: 3,
      repairRetries: 0,
    })
    expect(await f.kernel.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
  } finally {
    await f.close()
  }
}, 10_000)

test('an approval policy change during repair backoff requires new authorization instead of recapturing a fresh grant', async () => {
  const f = await fixture(async (input) => {
    await input.execute('missing_fixture_tool', {}, 'missing-tool-call')
  })
  const failures: string[] = []
  const unsubscribe = f.kernel.hooks.on('session.continuationFailed', (event) => {
    failures.push(event.code ?? 'UNKNOWN')
    return event
  })
  try {
    await f.enable(true, { retryDelayMs: 1000 })
    const original = await f.submit()
    const deadline = Date.now() + 5000
    while (!(await f.kernel.storage.call('autonomyRetryPlan', f.session.id))) {
      if (Date.now() >= deadline) throw new Error('No pending repair before permission change')
      await Bun.sleep(5)
    }
    await f.kernel.setPermissionMode('deny')
    await f.kernel.waitForIdle()
    expect(f.calls).toBe(1)
    expect((await f.kernel.snapshot(f.session.id)).runs).toHaveLength(1)
    expect(failures).toContain('AUTONOMY_RETRY_INVALID')
    expect((await f.kernel.storage.call('run', original.id)).status).toBe('failed')
  } finally {
    await unsubscribe()
    await f.close()
  }
}, 10_000)

test('a normal unattended task retries two temporary failures with source accounting, backoff, permissions and no Goal', async () => {
  const f = await fixture(async (input, attempt) => {
    if (attempt < 3) throw new HbarError('PROVIDER_CONNECTION_FAILED', 'Temporary service failure')
    await finish(input)
  })
  try {
    await f.enable()
    const original = await f.submit()
    await f.kernel.waitForIdle()
    const snapshot = await f.kernel.snapshot(f.session.id)
    expect(snapshot.runs.toReversed().map((run) => run.status)).toEqual(['failed', 'failed', 'completed'])
    expect(f.calls).toBe(3)
    expect((f.starts[1] ?? 0) - (f.starts[0] ?? 0)).toBeGreaterThanOrEqual(1000)
    expect((f.starts[2] ?? 0) - (f.starts[1] ?? 0)).toBeGreaterThanOrEqual(2000)
    for (const run of snapshot.runs) {
      expect(run.input).toMatchObject({ approval: 'deny', mode: 'plan' })
      expect(await f.kernel.storage.call('runExecutionPrincipal', run.id)).toEqual(
        await f.kernel.storage.call('runExecutionPrincipal', original.id),
      )
    }
    expect((await f.kernel.plugins.get<GoalService>('goal').get(f.session.id)).goal).toBeNull()
    expect((await f.kernel.plugins.get<BudgetService>('budget').get(f.session.id))?.usedTokens).toBe(3)
    const events = await f.kernel.storage.call('events', f.session.id, 0, 200)
    expect(events.filter((event) => event.type === 'usage.recorded')).toHaveLength(3)
    expect(events.filter((event) => event.type === 'run.queued')).toHaveLength(3)
    f.kernel.changed('settings')
    await f.kernel.waitForIdle()
    expect(f.calls).toBe(3)
  } finally {
    await f.close()
  }
}, 20_000)

test('enabling an idle backend wakes a safely failed task and persistent exhaustion prevents further retries', async () => {
  const f = await fixture(async () => {
    throw new HbarError('PROVIDER_CONNECTION_FAILED', 'Still unavailable')
  })
  try {
    await f.submit()
    await f.kernel.waitForIdle()
    expect(f.calls).toBe(1)
    await f.enable()
    await f.kernel.waitForIdle()
    expect(f.calls).toBe(3)
    expect((await f.kernel.snapshot(f.session.id)).runs).toHaveLength(3)
    await f.kernel.activate()
    await f.kernel.waitForIdle()
    expect(f.calls).toBe(3)
  } finally {
    await f.close()
  }
}, 20_000)

test('disabling during a durable retry delay preserves the original failure without starting another model request', async () => {
  const f = await fixture(async () => {
    throw new HbarError('PROVIDER_CONNECTION_FAILED', 'Pause before retry')
  })
  try {
    await f.enable()
    await f.submit()
    const deadline = Date.now() + 5000
    while (!(await f.kernel.storage.call('autonomyRetryPlan', f.session.id))) {
      if (Date.now() > deadline) throw new Error('No retry delay')
      await Bun.sleep(5)
    }
    await f.enable(false)
    await f.kernel.waitForIdle()
    expect(f.calls).toBe(1)
    expect((await f.kernel.snapshot(f.session.id)).runs.map((run) => run.status)).toEqual(['failed'])
  } finally {
    await f.close()
  }
}, 10_000)

test('ordinary retries retain the session budget and do not start a paid request after it is exhausted', async () => {
  const f = await fixture(async () => {
    throw new HbarError('PROVIDER_CONNECTION_FAILED', 'No allowance remains')
  }, 1)
  try {
    await f.enable()
    await f.submit()
    await f.kernel.waitForIdle()
    expect(f.calls).toBe(1)
    expect((await f.kernel.snapshot(f.session.id)).runs).toHaveLength(1)
    expect((await f.kernel.plugins.get<BudgetService>('budget').get(f.session.id))?.usedTokens).toBe(1)
  } finally {
    await f.close()
  }
}, 10_000)

test('a user cancellation during backoff durably stops the failed task even after unattended execution is reenabled', async () => {
  const f = await fixture(async () => {
    throw new HbarError('PROVIDER_CONNECTION_FAILED', 'Wait for cancellation')
  })
  try {
    await f.enable()
    const original = await f.submit()
    const deadline = Date.now() + 5000
    while (!(await f.kernel.storage.call('autonomyRetryPlan', f.session.id))) {
      if (Date.now() > deadline) throw new Error('Missing retry')
      await Bun.sleep(5)
    }
    await f.kernel.cancel(original.id)
    await f.kernel.waitForIdle()
    expect(f.calls).toBe(1)
    expect(await f.kernel.storage.call('cancelRequested', original.id)).toBe(true)
    expect(await f.kernel.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    await f.enable(false)
    await f.enable(true)
    await f.kernel.waitForIdle()
    expect(f.calls).toBe(1)
  } finally {
    await f.close()
  }
}, 10_000)

test('an explicit Goal remains the only continuation owner when unattended execution is enabled', async () => {
  const f = await fixture(async (input, attempt) => {
    if (attempt < 3) throw new HbarError('PROVIDER_CONNECTION_FAILED', 'Goal-owned temporary failure')
    await finish(input)
    await f.kernel.plugins.get<GoalService>('goal').update(f.session.id, 'complete')
  })
  try {
    await f.enable()
    await f.kernel.waitForIdle()
    await f.kernel.changePlugin('goal.codex', true, { retryDelayMs: 10 })
    await f.kernel.plugins.get<GoalService>('goal').create(f.session.id, 'An explicit Goal owns this task', 100)
    await f.kernel.submit(
      f.session.id,
      'goal-source',
      { text: 'Finish the Goal task', images: [], approval: 'allow', mode: 'default' },
      'local-fixture',
    )
    await f.kernel.waitForIdle()
    expect(f.calls).toBe(3)
    expect((await f.kernel.plugins.get<GoalService>('goal').get(f.session.id)).goal?.status).toBe('complete')
    const events = await f.kernel.storage.call('events', f.session.id, 0, 200)
    expect(events.filter((event) => event.type.startsWith('run.autonomyRetry.'))).toHaveLength(0)
  } finally {
    await f.close()
  }
}, 15_000)

test('an imported paused Goal checkpoint without a newer created event still holds ordinary recovery', async () => {
  const f = await fixture(async () => {
    throw new HbarError('PROVIDER_CONNECTION_FAILED', 'A task before the imported Goal')
  })
  try {
    await f.submit()
    await f.kernel.waitForIdle()
    const goals = f.kernel.plugins.get<GoalService>('goal')
    await goals.create(f.session.id, 'A paused legacy Goal', 100)
    await goals.set(f.session.id, { status: 'paused' })
    const goal = (await goals.get(f.session.id)).goal
    if (!goal) throw new Error('Missing paused Goal')
    const events = await f.kernel.storage.call('events', f.session.id, 0, 100)
    const checkpoint = events.findLast((event) => event.type === 'goal.updated')
    if (!checkpoint) throw new Error('Missing valid Goal checkpoint')
    await goals.clear(f.session.id, goal.goalId)
    await f.kernel.append(f.session.id, 'goal.updated', checkpoint.data)
    await f.enable()
    await f.kernel.waitForIdle()
    expect(await f.kernel.storage.call('autonomyRetryPlan', f.session.id)).toBeNull()
    expect(f.calls).toBe(1)
  } finally {
    await f.close()
  }
}, 10_000)
