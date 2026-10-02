import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createConfigurationCommandClient,
  createExtensionCommandClient,
  createGoalPlanCommandClient,
  HbarClient,
} from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { startServer } from '../apps/host/src/server.ts'

const cleanups: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

test('command clients resolve services remounted by plugin.set', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-host-plugin-reload-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id, 'plugin reload')
  const host = await startServer(kernel, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  cleanups.push(async () => {
    client.disconnect()
    await host.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  })
  await client.pair(host.pairing.code, 'plugin reload test')

  const extensions = createExtensionCommandClient(client)
  const configuration = createConfigurationCommandClient(client)
  const goals = createGoalPlanCommandClient(client)
  expect(await configuration.execute('mode.get', { sessionId: session.id })).toEqual({ mode: 'default' })
  expect(await goals.execute('goal.get', { sessionId: session.id })).toEqual({
    goal: null,
    remainingTokens: null,
  })

  await extensions.execute('plugin.set', {
    id: 'goal.codex',
    enabled: true,
    config: { autoContinue: false },
  })

  expect(await configuration.execute('mode.set', { sessionId: session.id, mode: 'plan' })).toEqual({ mode: 'plan' })
  expect(await configuration.execute('mode.get', { sessionId: session.id })).toEqual({ mode: 'plan' })
  expect(await client.call('mode.get', { sessionId: session.id })).toEqual({ mode: 'plan' })

  const created = await goals.execute('goal.create', {
    sessionId: session.id,
    objective: 'keep the remounted service visible',
  })
  expect(created.goal?.objective).toBe('keep the remounted service visible')
  const goalId = created.goal?.goalId
  if (!goalId) throw new Error('Goal identity missing')
  expect((await goals.execute('goal.get', { sessionId: session.id })).goal?.goalId).toBe(goalId)
  expect((await client.call('goal.get', { sessionId: session.id })).goal?.goalId).toBe(goalId)

  const updated = await goals.execute('goal.set', {
    sessionId: session.id,
    objective: 'keep the current remounted service visible',
    expectedGoalId: goalId,
  })
  expect(updated.goal?.objective).toBe('keep the current remounted service visible')
  expect((await client.call('goal.get', { sessionId: session.id })).goal?.goalId).toBe(updated.goal?.goalId)

  const legacyUpdated = await client.call('goal.set', {
    sessionId: session.id,
    objective: 'keep the legacy and command owners aligned',
    expectedGoalId: updated.goal?.goalId,
  })
  expect((await goals.execute('goal.get', { sessionId: session.id })).goal?.goalId).toBe(legacyUpdated.goal?.goalId)

  const plan = await goals.execute('plan.update', {
    sessionId: session.id,
    plan: [{ step: 'verify remount', status: 'in_progress' }],
  })
  expect(await client.call('plan.get', { sessionId: session.id })).toEqual(plan)

  const legacyPlan = await client.call('plan.update', {
    sessionId: session.id,
    plan: [{ step: 'verify remount', status: 'completed' }],
  })
  expect(await goals.execute('plan.get', { sessionId: session.id })).toEqual(legacyPlan)
})
