import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { emptyUsage, HbarError } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { DriverInput, GoalService, HarnessDriver } from '@hbar/plugin-sdk'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture(script: (input: DriverInput) => Promise<void>, retryDelayMs = 20, noLocalExec = false) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-transient-'))
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Retry fixture',
      description: 'Deterministic transient failures',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      permissions: [],
      provides: { driver: '1.0.0' },
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        run: async (input) => {
          const step = crypto.randomUUID()
          await input.beforeRequest(input.request, step)
          await input.emit('usage.recorded', { ...emptyUsage(), output: 1 }, step)
          await script(input)
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
    noLocalExec,
    secrets: new MemorySecrets(),
    profile: { replacements: { 'driver.pi': driver } },
  }
  const kernel = await Kernel.create(options)
  const resource = { root, kernel }
  resources.push(resource)
  await kernel.changePlugin('goal.codex', true, { retryDelayMs })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Missing fixture workspace')
  const session = await kernel.createSession(workspace.id)
  const goals = kernel.plugins.get<GoalService>('goal')
  await goals.create(session.id, 'Recover from temporary provider failure', 100)
  return { kernel, goals, session, resource, options }
}

async function waiting(goals: GoalService, sessionId: string) {
  for (let attempt = 0; attempt < 300; attempt++) {
    const goal = (await goals.get(sessionId)).goal
    if (goal?.continuation?.reason === 'retry_wait') return goal
    await Bun.sleep(10)
  }
  throw new Error('Retry was not scheduled')
}

async function retryEntry(goals: GoalService, sessionId: string) {
  await waiting(goals, sessionId)
  if (!goals.continuationWake) throw new Error('Goal lifecycle wake contract missing')
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      const proof = await goals.continuationWake({ action: 'describe', sessionId })
      if (proof.accepted && proof.entry) return proof.entry
    } catch (error) {
      if (!(error instanceof HbarError) || error.code !== 'BUSY') throw error
    }
    await Bun.sleep(10)
  }
  throw new Error('Actual Goal accounting did not settle before proof creation')
}
async function commit(goals: GoalService, sessionId: string, token: string) {
  const entry = await retryEntry(goals, sessionId)
  if (!goals.continuationWake) throw new Error('Goal lifecycle wake contract missing')
  expect(await goals.continuationWake({ action: 'commit', sessionId, token, entry })).toMatchObject({
    accepted: true,
    entry,
  })
  return entry
}

test('actual canonical clear and new Goal do not retain or resurrect the old transferred proof', async () => {
  let starts = 0
  const { kernel, goals, session } = await fixture(async () => {
    starts++
    throw new Error('503 temporarily unavailable')
  }, 30_000)
  await kernel.submit(session.id, 'old-run', { text: 'Work', images: [] }, 'local-fixture')
  const old = await commit(goals, session.id, 'old-token')
  if (!goals.continuationWake) throw new Error('Goal lifecycle wake contract missing')
  await goals.clear(session.id, old.goalId)
  for (let repeat = 0; repeat < 3; repeat++)
    expect(
      await goals.continuationWake({ action: 'deliver', sessionId: session.id, token: 'old-token', entry: old }),
    ).toMatchObject({ accepted: false })
  await goals.create(session.id, 'A distinct current Goal', 100)
  await kernel.submit(session.id, 'new-run', { text: 'Work', images: [] }, 'local-fixture')
  const current = await commit(goals, session.id, 'current-token')
  expect(current.goalId).not.toBe(old.goalId)
  expect(
    await goals.continuationWake({ action: 'deliver', sessionId: session.id, token: 'old-token', entry: old }),
  ).toMatchObject({ accepted: false })
  expect(await goals.continuationWake({ action: 'coverage', sessionId: session.id, entries: [current] })).toMatchObject(
    { accepted: true, resources: 0 },
  )
  expect(starts).toBe(2)
})

test('more than 128 sequential actual session create/commit/clear lifecycles do not consume current transfer capacity', async () => {
  let starts = 0
  const { kernel, goals, session } = await fixture(
    async () => {
      starts++
      throw new Error('503 temporarily unavailable')
    },
    30_000,
    true,
  )
  if (!goals.continuationWake) throw new Error('Goal lifecycle wake contract missing')
  const observedAt = performance.now()
  let completedCycles = 0
  let assertionsPassed = false
  const stages = {
    'create-session': { calls: 0, totalMs: 0, maximumMs: 0 },
    'create-goal': { calls: 0, totalMs: 0, maximumMs: 0 },
    submit: { calls: 0, totalMs: 0, maximumMs: 0 },
    'commit-proof': { calls: 0, totalMs: 0, maximumMs: 0 },
    'clear-goal': { calls: 0, totalMs: 0, maximumMs: 0 },
    'stale-deliver': { calls: 0, totalMs: 0, maximumMs: 0 },
  }
  type StageObservation = {
    cycle: number
    phase: keyof typeof stages
    settlement: 'pending' | 'fulfilled' | 'rejected'
  }
  let last: StageObservation | null = null
  const observe = async <T>(cycle: number, phase: keyof typeof stages, operation: () => Promise<T>): Promise<T> => {
    const began = performance.now()
    const current: StageObservation = { cycle, phase, settlement: 'pending' }
    last = current
    try {
      const result = await operation()
      current.settlement = 'fulfilled'
      return result
    } finally {
      if (current.settlement === 'pending') current.settlement = 'rejected'
      const durationMs = performance.now() - began
      const stage = stages[phase]
      stage.calls++
      stage.totalMs += durationMs
      stage.maximumMs = Math.max(stage.maximumMs, durationMs)
    }
  }
  try {
    for (let index = 0; index < 130; index++) {
      const current =
        index === 0 ? session : await observe(index, 'create-session', () => kernel.createSession(session.workspaceId))
      if (index !== 0) await observe(index, 'create-goal', () => goals.create(current.id, `Lifecycle ${index}`, 100))
      await observe(index, 'submit', () =>
        kernel.submit(current.id, `lifecycle-${index}`, { text: 'Work', images: [] }, 'local-fixture'),
      )
      const entry = await observe(index, 'commit-proof', () => commit(goals, current.id, `token-${index}`))
      await observe(index, 'clear-goal', () => goals.clear(current.id, entry.goalId))
      const wake = goals.continuationWake
      if (!wake) throw new Error('Goal lifecycle wake contract missing')
      expect(
        await observe(index, 'stale-deliver', () =>
          wake.call(goals, { action: 'deliver', sessionId: current.id, token: `token-${index}`, entry }),
        ),
      ).toMatchObject({ accepted: false })
      completedCycles++
    }
    expect(starts).toBe(130)
    expect(await goals.continuationWake({ action: 'coverage', sessionId: session.id, entries: [] })).toMatchObject({
      accepted: true,
      resources: 0,
    })
    assertionsPassed = true
  } finally {
    console.error(
      JSON.stringify({
        fixture: 'goal-transfer-130',
        event: 'summary',
        assertionsPassed,
        completedCycles,
        last,
        elapsedMs: performance.now() - observedAt,
        stages,
      }),
    )
  }
})

test('canonical blocked update invalidates a committed future proof without acknowledging parent delivery', async () => {
  const { kernel, goals, session } = await fixture(async () => {
    throw new Error('503 temporarily unavailable')
  }, 30_000)
  await kernel.submit(session.id, 'initial', { text: 'Work', images: [] }, 'local-fixture')
  const entry = await commit(goals, session.id, 'blocked-token')
  await goals.update(session.id, 'blocked', undefined, 'Fixture requires explicit input')
  if (!goals.continuationWake) throw new Error('Goal lifecycle wake contract missing')
  expect(
    await goals.continuationWake({ action: 'commit', sessionId: session.id, token: 'blocked-token', entry }),
  ).toMatchObject({ accepted: false })
  expect((await goals.get(session.id)).goal).toMatchObject({ status: 'blocked' })
})
