import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { Kernel, MemorySecrets, createGoalPlanCommands } from '@hbar/kernel'
import { Storage, type StoragePort } from '@hbar/storage'
import { emptyUsage } from '@hbar/contracts'
import type { ExecutionOwnership } from '@hbar/contracts/runtime'
import type { GoalService, PlanService } from '@hbar/plugin-sdk'

test('public Goal control accounts active managed usage without borrowing its lease and survives projection restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-goal-user-control-'))
  const storage = new Storage(join(root, 'state.sqlite'))
  let authority: ExecutionOwnership | undefined
  let kernel: Kernel | undefined
  let lease: ExecutionOwnership | undefined
  let failed = false
  let primary: unknown
  const cleanup: unknown[] = []
  const actor = { actorId: 'goal-user-control-test-device' }
  const source: StoragePort = {
    call: (method, ...args) =>
      authority ? storage.callOwned(authority, method, ...args) : storage.call(method, ...args),
    close: async () => {},
  }
  const createKernel = () =>
    Kernel.create({
      home: join(root, 'data'),
      workspace: root,
      demo: true,
      secrets: new MemorySecrets(),
      lifecycle: 'managed',
      profile: { createStorage: async () => source },
    })
  try {
    kernel = await createKernel()
    await kernel.changePlugin('goal.codex', true, { autoContinue: false })
    const workspace = await storage.call('createWorkspace', root, 'Fixture')
    const session = await storage.call('createSession', workspace.id)
    const commands = createGoalPlanCommands(
      kernel.plugins.get<GoalService>('goal'),
      kernel.plugins.get<PlanService>('plan'),
      source,
    )
    const created = await commands.execute(
      'goal.create',
      {
        sessionId: session.id,
        objective: 'Account durable progress',
        tokenBudget: 1_000_000,
      },
      actor,
    )
    if (!created.goal) throw new Error('Expected initial Goal')
    const goalId = created.goal.goalId
    const queued = await storage.call(
      'enqueue',
      session.id,
      crypto.randomUUID(),
      { text: 'Fixture managed execution', images: [], source: 'user' },
      'local-fixture',
    )
    const version = { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) }
    lease =
      (await storage.call('runtimeExecutionClaim', {
        leaseId: crypto.randomUUID(),
        sessionId: session.id,
        runId: queued.id,
        owner: { unitId: 'kernel', generation: 1, incarnation: crypto.randomUUID() },
        fence: 1,
        acquiredAt: Date.now(),
        versions: { kernel: version, driver: version, plugins: [], hooks: [] },
      })) ?? undefined
    if (!lease) throw new Error('Expected real managed lease')
    const owned = lease
    authority = owned
    const run = await storage.call('run', queued.id)
    await kernel.hooks.dispatch('run.start', { sessionId: session.id, runId: run.id, run })
    await storage.callOwned(
      owned,
      'append',
      session.id,
      'usage.recorded',
      { ...emptyUsage(), input: 7, output: 3 },
      run.id,
    )
    authority = undefined
    const first = await commands.execute(
      'goal.set',
      {
        sessionId: session.id,
        expectedGoalId: goalId,
        tokenBudget: 1_000_000_000,
        status: 'active',
      },
      actor,
    )
    expect(first.goal?.tokensUsed).toBe(10)
    expect(first.goal?.goalId).toBe(goalId)
    expect(first.goal?.status).toBe('active')
    expect(first.goal?.tokenBudget).toBe(1_000_000_000)
    expect(
      (
        await commands.execute(
          'goal.set',
          {
            sessionId: session.id,
            expectedGoalId: goalId,
            tokenBudget: 1_000_000_000,
          },
          actor,
        )
      ).goal?.tokensUsed,
    ).toBe(10)
    // Concurrent fresh usage and repeated user writes serialize by Goal, then a final read catches the fixed event horizon.
    await Promise.all([
      storage.callOwned(owned, 'append', session.id, 'usage.recorded', { ...emptyUsage(), output: 5 }, run.id),
      commands.execute(
        'goal.set',
        { sessionId: session.id, expectedGoalId: goalId, tokenBudget: 1_000_000_000 },
        actor,
      ),
      commands.execute(
        'goal.set',
        { sessionId: session.id, expectedGoalId: goalId, tokenBudget: 1_000_000_000 },
        actor,
      ),
    ])
    expect(
      (
        await commands.execute(
          'goal.set',
          {
            sessionId: session.id,
            expectedGoalId: goalId,
            tokenBudget: 1_000_000_000,
          },
          actor,
        )
      ).goal?.tokensUsed,
    ).toBe(15)
    const controlEvents = (await storage.call('events', session.id, 0, 1_000)).filter(
      (event) => event.type === 'goal.accounted',
    )
    expect(controlEvents.length).toBeGreaterThan(0)
    for (const event of controlEvents) {
      expect(event.runId).toBeNull()
      expect(event.data).toMatchObject({ accountingRunId: run.id })
    }
    await kernel.close()
    kernel = await createKernel()
    const restoredCommands = createGoalPlanCommands(
      kernel.plugins.get<GoalService>('goal'),
      kernel.plugins.get<PlanService>('plan'),
      source,
    )
    expect(
      (
        await restoredCommands.execute(
          'goal.set',
          {
            sessionId: session.id,
            expectedGoalId: goalId,
            tokenBudget: 1_000_000_000,
          },
          actor,
        )
      ).goal?.tokensUsed,
    ).toBe(15)
    await storage.callOwned(owned, 'append', session.id, 'usage.recorded', { ...emptyUsage(), output: 4 }, run.id)
    expect(
      (
        await restoredCommands.execute(
          'goal.set',
          {
            sessionId: session.id,
            expectedGoalId: goalId,
            tokenBudget: 1_000_000_000,
          },
          actor,
        )
      ).goal?.tokensUsed,
    ).toBe(19)
    // Real execution hooks retain legacy Run attribution and still need their actual durable lease.
    await storage.callOwned(owned, 'append', session.id, 'usage.recorded', { ...emptyUsage(), output: 2 }, run.id)
    authority = owned
    await kernel.hooks.dispatch('step.end', { sessionId: session.id, runId: run.id, stepId: 'owned-step' })
    const ownedEvents = (await storage.call('events', session.id, 0, 1_000)).filter(
      (event) => event.type === 'goal.accounted',
    )
    expect(ownedEvents.at(-1)?.runId).toBe(run.id)
    authority = undefined
    expect((await restoredCommands.execute('goal.get', { sessionId: session.id }, actor)).goal?.tokensUsed).toBe(21)
    await storage.callOwned(owned, 'append', session.id, 'usage.recorded', { ...emptyUsage(), output: 3 }, run.id)
    const paused = await restoredCommands.execute(
      'goal.set',
      {
        sessionId: session.id,
        expectedGoalId: goalId,
        status: 'paused',
      },
      actor,
    )
    expect(paused.goal).toMatchObject({ goalId, status: 'paused', tokensUsed: 24 })
    const resumed = await restoredCommands.execute(
      'goal.set',
      {
        sessionId: session.id,
        expectedGoalId: goalId,
        status: 'active',
      },
      actor,
    )
    expect(resumed.goal).toMatchObject({ goalId, status: 'active', tokensUsed: 24 })
    // Reload also reads the original Run-scoped format after the new control format.
    await kernel.close()
    kernel = await createKernel()
    const goals = kernel.plugins.get<GoalService>('goal')
    expect((await goals.get(session.id)).goal?.tokensUsed).toBe(24)
    if (!goals.refreshSession) throw new Error('Expected public Goal projection refresh')
    await goals.refreshSession(session.id)
    expect((await goals.get(session.id)).goal?.tokensUsed).toBe(24)
    await storage.callOwned(owned, 'append', session.id, 'usage.recorded', { ...emptyUsage(), output: 1 }, run.id)
    await storage.call('runtimeExecutionRevoke', owned.owner, [run.id])
    authority = owned
    let rejection: unknown
    try {
      await kernel.hooks.dispatch('step.end', { sessionId: session.id, runId: run.id, stepId: 'revoked-step' })
    } catch (error) {
      rejection = error
    }
    expect(rejection).toMatchObject({ code: 'EXECUTION_OWNER_REVOKED' })
    expect((await storage.call('runtimeExecutionRead', run.id))?.state).toBe('revoked')
  } catch (error) {
    failed = true
    primary = error
  }
  authority = undefined
  try {
    await kernel?.close()
  } catch (error) {
    cleanup.push(error)
  }
  try {
    await storage.close()
  } catch (error) {
    cleanup.push(error)
  }
  try {
    const absolute = resolve(root)
    if (dirname(absolute) !== resolve(tmpdir()) || !basename(absolute).startsWith('hbar-goal-user-control-'))
      throw new Error('Unsafe fixture cleanup path')
    await rm(absolute, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch (error) {
    cleanup.push(error)
  }
  if (failed) throw primary
  if (cleanup.length) throw new AggregateError(cleanup, 'Goal user-control fixture cleanup failed')
}, 30_000)
