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

test('actual Kernel and Goal abort a repeated checkpoint without losing the old exact parent deadline', async () => {
  let starts = 0
  const { kernel, goals, session } = await fixture(async (input) => {
    starts++
    if (starts === 1) throw new Error('503 temporarily unavailable')
    const callId = crypto.randomUUID()
    const args = { status: 'complete' }
    await input.commit('assistant', [{ type: 'tool_call', name: 'update_goal', callId, args }])
    expect((await input.execute('update_goal', args, callId)).isError ?? false).toBe(false)
  }, 5_000)
  await kernel.submit(session.id, 'initial', { text: 'Work', images: [] }, 'local-fixture')
  await waiting(goals, session.id)
  const old = { token: 'old-parent', manifest: await deadline(kernel) }
  await kernel.sessionWakesQuiesce(old, wakeOwner)
  await kernel.sessionWakesCommit(old)
  const next = { token: 'aborted-parent', manifest: await kernel.sessionWakesPreview(wakeOwner, { queuedRuns: false }) }
  await kernel.sessionWakesQuiesce(next, wakeOwner)
  await kernel.sessionWakesAbort(next)
  const entry = old.manifest.entries[0]
  if (!entry || !goals.continuationWake) throw new Error('Missing actual transferred continuation')
  expect(await goals.continuationWake({ action: 'coverage', sessionId: session.id, entries: [entry] })).toMatchObject({
    accepted: true,
    resources: 0,
  })
  await Bun.sleep(Math.max(1, entry.dueAt - Date.now() + 1))
  expect(await kernel.sessionWakesDeliver({ token: next.token, entry })).toEqual({ status: 'stale' })
  expect(await kernel.sessionWakesDeliver({ token: old.token, entry })).toEqual({ status: 'notified' })
  expect(await kernel.sessionWakesDeliver({ token: old.token, entry })).toEqual({ status: 'stale' })
  await kernel.waitForIdle()
  expect(starts).toBe(2)
})
