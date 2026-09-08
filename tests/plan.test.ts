import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import type { PlanService } from '@hbar/plugin-sdk'
import { PLAN_MODE_INSTRUCTIONS } from '../plugins/plan/src/instructions.ts'

const resources: Array<{ root: string; kernel: Kernel }> = []

afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-plan-'))
  const kernel = await Kernel.create({ home: join(root, 'data'), workspace: root, demo: true, secrets: new MemorySecrets() })
  resources.push({ root, kernel })
  const workspace = (await kernel.storage.call('workspaces'))[0]!
  const session = await kernel.createSession(workspace.id)
  return { root, kernel, session }
}

test('plan accepts an empty update and broadcasts a clear notification', async () => {
  const { kernel, session } = await fixture()
  const plans = kernel.plugins.get<PlanService>('plan')
  const events: unknown[] = []
  const unsubscribe = kernel.subscribe((event) => events.push(event))
  try {
    await plans.update(session.id, [{ step: 'inspect', status: 'pending' }])
    expect((await plans.update(session.id, [])).plan).toEqual([])
    expect(await plans.clear(session.id)).toEqual({ cleared: true })
    expect(events.some((event) => (event as { method?: string }).method === 'plan.updated')).toBeTrue()
    expect(events.some((event) => (event as { method?: string }).method === 'plan.cleared')).toBeTrue()
  } finally {
    unsubscribe()
  }
})

test('plan mode state survives a host restart', async () => {
  const { root, kernel, session } = await fixture()
  const mode = kernel.plugins.get<{ set(id: string, value: 'plan' | 'default'): Promise<{ mode: 'plan' | 'default' }>; get(id: string): Promise<{ mode: 'plan' | 'default' }> }>('mode')
  await mode.set(session.id, 'plan')
  await kernel.close()
  const index = resources.findIndex((entry) => entry.kernel === kernel)
  if (index >= 0) resources.splice(index, 1)
  const restarted = await Kernel.create({ home: join(root, 'data'), demo: true, secrets: new MemorySecrets() })
  resources.push({ root, kernel: restarted })
  expect((await restarted.plugins.get<typeof mode>('mode').get(session.id)).mode).toBe('plan')
})

test('plan mode exposes the Codex collaboration rules separately from update_plan', () => {
  expect(PLAN_MODE_INSTRUCTIONS).toContain('You are in Plan Mode until a developer message explicitly ends it.')
  expect(PLAN_MODE_INSTRUCTIONS).toContain('update_plan is a checklist and progress tool; it does not enter or exit Plan Mode.')
  expect(PLAN_MODE_INSTRUCTIONS).toContain('Do not perform mutating actions.')
  expect(PLAN_MODE_INSTRUCTIONS).toContain('<proposed_plan>')
})

test('plan mode uses medium reasoning unless the caller explicitly chooses an effort', async () => {
  const { kernel, session } = await fixture()
  const mode = kernel.plugins.get<{ set(id: string, value: 'plan' | 'default'): Promise<{ mode: 'plan' | 'default' }> }>('mode')
  await mode.set(session.id, 'plan')
  const inherited = await kernel.submit(session.id, 'plan-medium', { text: 'inspect', images: [] }, 'local-fixture')
  expect((await kernel.storage.call('run', inherited.id)).input.thinking).toBe('medium')
  await kernel.waitForIdle()
  const explicit = await kernel.submit(session.id, 'plan-high', { text: 'inspect', images: [], thinking: 'high' }, 'local-fixture')
  expect((await kernel.storage.call('run', explicit.id)).input.thinking).toBe('high')
  await kernel.waitForIdle()
})
