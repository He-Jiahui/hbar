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

async function fixture(script: (input: DriverInput) => Promise<void>, retryDelayMs = 20) {
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

const wakeOwner = { unitId: 'kernel', generation: 1, incarnation: 'goal-admission-fixture' }
async function deadline(kernel: Kernel) {
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      const manifest = await kernel.sessionWakesPreview(wakeOwner, { queuedRuns: false })
      if (manifest.entries.length === 1) return manifest
    } catch (error) {
      if (!(error instanceof HbarError) || error.code !== 'BUSY') throw error
    }
    await Bun.sleep(10)
  }
  throw new Error('Kernel did not retain its exact Goal retry deadline')
}

test('actual Goal retry transfers only its current identity; early notification preserves the pending deadline', async () => {
  let starts = 0
  const { kernel, goals, session } = await fixture(async () => {
    starts++
    throw new Error('503 temporarily unavailable')
  }, 30_000)
  await kernel.submit(session.id, 'initial', { text: 'Work', images: [] }, 'local-fixture')
  await waiting(goals, session.id)
  const manifest = await deadline(kernel),
    ack = { token: 'goal-transfer', manifest }
  expect(await kernel.sessionWakesCoverage(manifest.entries)).toBe(1)
  await expect(kernel.sessionWakesPreview(wakeOwner, { queuedRuns: true })).rejects.toMatchObject({ code: 'BUSY' })
  await expect(kernel.sessionWakesCoverage([])).rejects.toMatchObject({ code: 'BUSY' })
  await kernel.sessionWakesQuiesce(ack, wakeOwner)
  await kernel.sessionWakesCommit(ack)
  expect(kernel.runtimeIdleCheckpoint({ queuedRuns: false }).scheduledWakeups).toBe(0)
  const value = manifest.entries[0]
  if (!value) throw new Error('Missing actual Goal deadline')
  await expect(kernel.sessionWakesDeliver({ token: ack.token, entry: value })).rejects.toMatchObject({
    code: 'SESSION_WAKE_NOT_DUE',
  })
  expect((await kernel.sessionWakesPreview(wakeOwner, { queuedRuns: false })).entries).toEqual([value])
  expect(starts).toBe(1)
})

test('actual Goal clear invalidates the old transferred continuation instead of admitting a replacement', async () => {
  let starts = 0
  const { kernel, goals, session } = await fixture(async () => {
    starts++
    throw new Error('503 temporarily unavailable')
  }, 30_000)
  await kernel.submit(session.id, 'initial', { text: 'Work', images: [] }, 'local-fixture')
  await waiting(goals, session.id)
  const manifest = await deadline(kernel),
    value = manifest.entries[0]
  if (!value || !goals.continuationWake) throw new Error('Goal continuation transfer is unavailable')
  await goals.clear(session.id)
  expect(
    await goals.continuationWake({ action: 'commit', token: 'stale-transfer', entry: value, sessionId: session.id }),
  ).toMatchObject({ accepted: false })
  expect((await goals.get(session.id)).goal).toBeNull()
  expect(starts).toBe(1)
})
test('lost Goal commit reply keeps a sticky Kernel transfer fence and never admits a replacement', async () => {
  let starts = 0
  const { kernel, goals, session } = await fixture(async () => {
    starts++
    throw new Error('503 temporarily unavailable')
  }, 30_000)
  await kernel.submit(session.id, 'initial', { text: 'Work', images: [] }, 'local-fixture')
  await waiting(goals, session.id)
  const ack = { token: 'lost-commit', manifest: await deadline(kernel) }
  const original = goals.continuationWake?.bind(goals)
  if (!original) throw new Error('Goal continuation transfer is unavailable')
  goals.continuationWake = async (input) => {
    const result = await original(input)
    if (input.action === 'commit') throw new Error('IPC_TIMEOUT after accepted Goal commit')
    return result
  }
  await kernel.sessionWakesQuiesce(ack, wakeOwner)
  await expect(kernel.sessionWakesCommit(ack)).rejects.toThrow('IPC_TIMEOUT')
  expect(kernel.runtimeIdleCheckpoint({ queuedRuns: false }).counts.sessionWakeTransfer).toBe(1)
  await expect(
    kernel.submit(session.id, 'replacement', { text: 'Do not replay', images: [] }, 'local-fixture'),
  ).rejects.toMatchObject({ code: 'SESSION_WAKE_FENCED' })
  await expect(kernel.sessionWakesAbort(ack)).rejects.toMatchObject({ code: 'SESSION_WAKE_FENCED' })
  expect(starts).toBe(1)
  goals.continuationWake = original
})
test('two actual future retry identities restore together before any resumed business submission', async () => {
  let starts = 0
  const f = await fixture(async () => {
    starts++
    throw new Error('503 temporarily unavailable')
  }, 30_000)
  const second = await f.kernel.createSession(f.session.workspaceId)
  await f.goals.create(second.id, 'Independent retry deadline', 100)
  await Promise.all([
    f.kernel.submit(f.session.id, 'retry-a', { text: 'A', images: [] }, 'local-fixture'),
    f.kernel.submit(second.id, 'retry-b', { text: 'B', images: [] }, 'local-fixture'),
  ])
  await Promise.all([waiting(f.goals, f.session.id), waiting(f.goals, second.id)])
  let manifest: Awaited<ReturnType<Kernel['sessionWakesPreview']>> | undefined
  for (let attempt = 0; attempt < 300; attempt++) {
    try {
      const value = await f.kernel.sessionWakesPreview(wakeOwner, { queuedRuns: false })
      if (value.entries.length === 2) {
        manifest = value
        break
      }
    } catch (error) {
      if (!(error instanceof HbarError) || error.code !== 'BUSY') throw error
    }
    await Bun.sleep(10)
  }
  if (!manifest) throw new Error('Two real retry resources did not settle')
  expect(new Set(manifest.entries.map((entry) => entry.sessionId))).toEqual(new Set([f.session.id, second.id]))
  expect(starts).toBe(2)
  const ack = { token: 'two-real-goal-deadlines', manifest }
  await f.kernel.sessionWakesQuiesce(ack, wakeOwner)
  await f.kernel.sessionWakesCommit(ack)
  await f.kernel.close()
  const index = resources.indexOf(f.resource)
  if (index >= 0) resources.splice(index, 1)
  let restored: Kernel | undefined
  try {
    restored = await Kernel.create({ ...f.options, lifecycle: 'managed' })
    expect(starts).toBe(2)
    const result = await restored.sessionWakesRestore(ack)
    expect(result).toMatchObject({ phase: 'restored', token: ack.token })
    // Early delivery must preserve both entries, not submit either session.
    for (const entry of manifest.entries)
      await expect(restored.sessionWakesDeliver({ token: ack.token, entry })).rejects.toHaveProperty(
        'code',
        'SESSION_WAKE_NOT_DUE',
      )
    expect(starts).toBe(2)
    for (const entry of manifest.entries) {
      const facts = await restored.storage.call('readSessionFacts', { sessionId: entry.sessionId })
      expect(facts.runs).toHaveLength(1)
    }
  } finally {
    await restored?.close()
    await rm(f.resource.root, { recursive: true, force: true })
  }
}, 30_000)
