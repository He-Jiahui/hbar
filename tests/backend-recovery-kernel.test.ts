import { expect, test } from 'bun:test'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyUsage, providerSchema, type Run } from '@hbar/contracts'
import { BACKEND_UNATTENDED_SETTING } from '@hbar/contracts/backend'
import { Kernel, MemorySecrets, createRunCommands } from '@hbar/kernel'
import { SettingsService } from '@hbar/kernel/controller'
import {
  definePlugin,
  provide,
  service,
  type BudgetService,
  type GoalService,
  type HarnessDriver,
} from '@hbar/plugin-sdk'
import { Storage, type StoragePort } from '@hbar/storage'
import { removeOwnedTestDirectory } from './owned-temp-directory'

async function configure(kernel: Kernel, enabled: boolean) {
  const settings = new SettingsService(kernel.storage)
  const before = await settings.get({ kind: 'global' })
  await settings.apply({
    schemaVersion: before.schemaVersion,
    scope: before.scope,
    baselineRevisions: before.revisions,
    actorId: 'backend-recovery-fixture',
    idempotencyKey: crypto.randomUUID(),
    changes: [{ op: 'set', path: [{ kind: 'field', name: BACKEND_UNATTENDED_SETTING }], value: enabled }],
  })
}

async function fixture() {
  const prefix = 'hbar-backend-recovery-kernel-'
  const root = await mkdtemp(join(tmpdir(), prefix))
  const storage = new Storage(join(root, 'state.sqlite'))
  let kernel: Kernel | undefined
  const close = async () => {
    try {
      await kernel?.close()
    } finally {
      try {
        await storage.close()
      } finally {
        await removeOwnedTestDirectory(root, prefix)
      }
    }
  }
  try {
    await storage.call('ready')
    await storage.call(
      'saveProvider',
      providerSchema.parse({
        id: 'fixture',
        name: 'Fixture',
        protocol: 'mock',
        baseUrl: 'http://127.0.0.1',
        model: 'fixture',
        imageInput: true,
        reasoning: true,
      }),
    )
    const workspace = await storage.call('createWorkspace', root, 'fixture')
    const session = await storage.call('createSession', workspace.id)
    const executions: Run[] = []
    const driver = definePlugin({
      manifest: {
        id: 'driver.pi',
        name: 'Backend recovery fixture',
        description: 'Verify recovery acceptance and execution boundaries',
        version: '1.0.0',
        apiVersion: '^1.0.0',
        scope: 'host',
        provides: { driver: '1.0.0' },
        requires: { goal: '^1.0.0' },
        permissions: [],
      },
      apply(api) {
        provide<HarnessDriver>(api, 'driver', {
          async run(input) {
            executions.push(input.run)
            await input.commit('assistant', [{ type: 'text', text: 'Recovered the existing Goal' }])
            await service<GoalService>(api, 'goal').update(input.session.id, 'complete', input.run.id)
          },
          summarize: async () => ({ text: '', usage: emptyUsage() }),
        })
      },
    })
    const port: StoragePort = { call: (method, ...args) => storage.call(method, ...args), close: async () => {} }
    kernel = await Kernel.create({
      home: join(root, 'data'),
      demo: true,
      lifecycle: 'managed',
      secrets: new MemorySecrets(),
      profile: { createStorage: async () => port, replacements: { 'driver.pi': driver } },
    })
    const goals = kernel.plugins.get<GoalService>('goal')
    const goal = (await goals.create(session.id, 'Finish the existing task', 100)).goal
    if (!goal?.goalId) throw new Error('Expected the canonical Goal identity')
    await goals.requestContinuation(session.id, {
      goalId: goal.goalId,
      trigger: 'fixture-original-continuation',
      modelId: 'fixture',
      text: 'Continue the existing task',
    })
    const { submission } = await kernel.hooks.dispatch('session.idle', { sessionId: session.id })
    if (!submission?.input.continuation) throw new Error('Expected a Goal-owned continuation submission')
    const original = await kernel.submit(session.id, submission.requestId, submission.input, submission.modelId)
    await storage.call('claim', session.id)
    await storage.call('commit', session.id, original.id, 'user', [{ type: 'text', text: submission.input.text }])
    // A crash after the original Goal accounting checkpoint, before its driver starts.
    await storage.call(
      'append',
      session.id,
      'goal.run_bound',
      {
        accounting: {
          goalId: goal.goalId,
          sessionId: session.id,
          startedAt: Date.now(),
          usageThroughSeq: 0,
          tokensAccounted: 0,
          timeAccounted: 0,
        },
      },
      original.id,
    )
    return { kernel, storage, session, original, goal, goals, executions, close }
  } catch (error) {
    await close()
    throw error
  }
}

test('manual recovery of a bound Goal works while new automatic acceptance is disabled', async () => {
  const f = await fixture()
  const commands = createRunCommands(f.kernel)
  try {
    await configure(f.kernel, false)
    const waiting = (await f.kernel.recoverRuns([f.original.id]))[0]
    expect(waiting?.run).toBeNull()
    expect(waiting?.chain.attempts).toBe(0)
    const accepted = await commands.execute(
      'run.retry',
      { sessionId: f.session.id, operationId: f.original.id },
      { actorId: 'manual-actor', idempotencyKey: 'manual-off', requestId: 'manual-off-request' },
    )
    const resumed = await f.storage.call('run', accepted.operationId)
    expect(resumed.recovery).toMatchObject({
      manual: true,
      attempt: 1,
      automaticAttempt: 0,
      predecessorRunId: f.original.id,
      rootRunId: f.original.id,
    })
    expect(resumed.input.continuation).toEqual(f.original.input.continuation)
    await f.kernel.activate()
    await f.kernel.waitForIdle()
    expect(f.executions.map((run) => run.id)).toEqual([resumed.id])
    expect((await f.storage.call('run', f.original.id)).status).toBe('interrupted')
    expect((await f.storage.call('run', resumed.id)).status).toBe('completed')
    expect((await f.goals.get(f.session.id)).goal).toMatchObject({
      goalId: f.goal.goalId,
      tokenBudget: f.goal.tokenBudget,
      status: 'complete',
    })
    const snapshot = await f.storage.call('snapshot', f.session.id)
    expect(snapshot.runs).toHaveLength(2)
    expect(snapshot.messages.filter((message) => message.role === 'user')).toHaveLength(1)
    expect(await commands.getReceipt('run.retry', f.session.id, 'manual-actor', 'manual-off')).toEqual(accepted)
  } finally {
    commands.dispose()
    await f.close()
  }
}, 20_000)

test('a recovery hook purpose grants no automatic acceptance, and re-enable resumes the same recovery identity', async () => {
  const f = await fixture()
  try {
    await configure(f.kernel, false)
    const routed = await f.kernel.hooks.dispatch('goal.beforeContinue', {
      sessionId: f.session.id,
      runId: f.original.id,
      goal: f.goal,
      allowed: true,
      purpose: 'accepted',
    })
    expect(routed.allowed).toBe(true)
    const held = (await f.kernel.recoverRuns([f.original.id]))[0]
    if (!held) throw new Error('Expected the durable held recovery identity')
    expect(held?.run).toBeNull()
    expect(held?.manual).toBeUndefined()
    expect(held?.chain).toMatchObject({
      status: 'waiting',
      reasonCode: 'BACKEND_AUTOMATION_DISABLED',
      attempts: 0,
      automaticAttempts: 0,
    })
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(1)
    expect(f.executions).toHaveLength(0)
    await configure(f.kernel, true)
    const accepted = await f.kernel.resumeRecovery(f.original.id)
    if (!accepted.run) throw new Error('Expected one automatic successor after re-enable')
    expect(accepted.recoveryId).toBe(held.recoveryId)
    expect(accepted.run.recovery).toMatchObject({ attempt: 1, automaticAttempt: 1 })
    await f.kernel.activate()
    await f.kernel.waitForIdle()
    expect(f.executions.map((run) => run.id)).toEqual([accepted.run.id])
    expect((await f.storage.call('run', accepted.run.id)).status).toBe('completed')
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(2)
  } finally {
    await f.close()
  }
}, 20_000)

test('an already accepted bound Goal recovery can finish after new automatic acceptance is disabled', async () => {
  const f = await fixture()
  try {
    const accepted = (await f.kernel.recoverRuns([f.original.id]))[0]
    if (!accepted?.run) throw new Error('Expected the previously accepted automatic recovery')
    expect(accepted.manual).toBeUndefined()
    expect(accepted.run.recovery).toMatchObject({ attempt: 1, automaticAttempt: 1 })
    await configure(f.kernel, false)
    await f.kernel.activate()
    await f.kernel.waitForIdle()
    expect(f.executions.map((run) => run.id)).toEqual([accepted.run.id])
    expect((await f.storage.call('run', f.original.id)).status).toBe('interrupted')
    expect((await f.storage.call('run', accepted.run.id)).status).toBe('completed')
    const repeated = await f.kernel.resumeRecovery(f.original.id)
    expect(repeated.recoveryId).toBe(accepted.recoveryId)
    expect(repeated.run?.id).toBe(accepted.run.id)
    expect(repeated.chain).toMatchObject({ attempts: 1, automaticAttempts: 1 })
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(2)
  } finally {
    await f.close()
  }
}, 20_000)

async function commandFailureCode(operation: Promise<unknown>): Promise<string> {
  const outcome: unknown = await operation.catch((error: unknown) => error)
  if (!(outcome instanceof Error) || !('code' in outcome) || typeof outcome.code !== 'string')
    throw new Error('Expected the original control to reject the continuation with its error code')
  return outcome.code
}

for (const control of ['paused', 'budget', 'unknown'] as const)
  test(`manual Goal recovery while background is off still respects ${control} controls`, async () => {
    const f = await fixture()
    const commands = createRunCommands(f.kernel)
    try {
      await configure(f.kernel, false)
      if (control === 'paused') await f.goals.set(f.session.id, { status: 'paused' })
      else if (control === 'budget') {
        await f.kernel.plugins.get<BudgetService>('budget').set(f.session.id, 1)
        await f.storage.call('append', f.session.id, 'usage.recorded', { ...emptyUsage(), output: 2 }, f.original.id)
      } else
        await f.storage.call('toolStart', f.session.id, f.original.id, 'unknown', 'write_file', { path: 'unconfirmed' })
      await f.kernel.recoverRuns([f.original.id])
      const code = await commandFailureCode(
        commands.execute(
          'run.retry',
          { sessionId: f.session.id, operationId: f.original.id },
          { actorId: 'manual-actor', idempotencyKey: control, requestId: `manual-off-${control}` },
        ),
      )
      if (control === 'budget') expect(code).toMatch(/BUDGET/)
      else expect(code).toBe(control === 'paused' ? 'GOAL_PAUSED' : 'EFFECT_UNKNOWN')
      expect((await f.storage.call('runtimeRecoveryRead', f.original.id))?.run).toBeNull()
      expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(1)
      expect(f.executions).toHaveLength(0)
      expect(await commands.getReceipt('run.retry', f.session.id, 'manual-actor', control)).toBeNull()
    } finally {
      commands.dispose()
      await f.close()
    }
  }, 20_000)

test('a historical manual recovery cannot authorize the next automatic recovery while background is off', async () => {
  const f = await fixture()
  const commands = createRunCommands(f.kernel)
  try {
    await configure(f.kernel, false)
    await f.kernel.recoverRuns([f.original.id])
    const accepted = await commands.execute(
      'run.retry',
      { sessionId: f.session.id, operationId: f.original.id },
      { actorId: 'manual-actor', idempotencyKey: 'one-manual', requestId: 'one-manual-request' },
    )
    const manual = await f.storage.call('run', accepted.operationId)
    expect(manual.recovery).toMatchObject({ manual: true, attempt: 1, automaticAttempt: 0 })
    await f.storage.call('claim', f.session.id)
    const held = (await f.kernel.recoverRuns([manual.id]))[0]
    expect(held?.run).toBeNull()
    expect(held?.manual).toBeUndefined()
    expect(held?.chain).toMatchObject({
      status: 'waiting',
      reasonCode: 'BACKEND_AUTOMATION_DISABLED',
      attempts: 1,
      automaticAttempts: 0,
    })
    expect((await f.storage.call('run', manual.id)).status).toBe('interrupted')
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(2)
    expect(f.executions).toHaveLength(0)
    expect(await commands.getReceipt('run.retry', f.session.id, 'manual-actor', 'one-manual')).toEqual(accepted)
  } finally {
    commands.dispose()
    await f.close()
  }
}, 20_000)

test('manual Goal recovery while background is off still respects a continuation workflow veto', async () => {
  const f = await fixture()
  const commands = createRunCommands(f.kernel)
  const dispose = f.kernel.hooks.on('goal.beforeContinue', (event) => ({
    ...event,
    allowed: false,
    reason: 'workflow_wait',
  }))
  try {
    await configure(f.kernel, false)
    await f.kernel.recoverRuns([f.original.id])
    expect(
      await commandFailureCode(
        commands.execute(
          'run.retry',
          { sessionId: f.session.id, operationId: f.original.id },
          { actorId: 'manual-actor', idempotencyKey: 'workflow', requestId: 'manual-off-workflow' },
        ),
      ),
    ).toBe('GOAL_WORKFLOW_WAIT')
    expect((await f.storage.call('runtimeRecoveryRead', f.original.id))?.run).toBeNull()
    expect((await f.storage.call('snapshot', f.session.id)).runs).toHaveLength(1)
    expect(f.executions).toHaveLength(0)
  } finally {
    commands.dispose()
    try {
      await dispose()
    } finally {
      await f.close()
    }
  }
}, 20_000)
