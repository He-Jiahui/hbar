import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { DriverInput, GoalService, HarnessDriver } from '@hbar/plugin-sdk'
import { emptyUsage } from '@hbar/contracts'

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function invoke(input: DriverInput, name: string, args: Record<string, unknown>) {
  const callId = crypto.randomUUID()
  await input.commit('assistant', [{ type: 'tool_call', name, args, callId }])
  return input.execute(name, args, callId)
}

async function fixture(script?: (input: DriverInput) => Promise<void>, autoContinue = false) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-block-audit-'))
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Blocker audit fixture',
      description: 'Deterministic model blocker reports',
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
          if (script) await script(input)
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
    ...(script ? { profile: { replacements: { 'driver.pi': driver } } } : {}),
  }
  const kernel = await Kernel.create(options)
  const resource = { root, kernel }
  resources.push(resource)
  await kernel.changePlugin('goal.codex', true, { autoContinue })
  const session = await kernel.createSession((await kernel.storage.call('workspaces'))[0]!.id)
  const goals = kernel.plugins.get<GoalService>('goal')
  await goals.create(session.id, 'Verify persistent blockers')
  return { resource, options, kernel, session, goals }
}

test('model blocked requires a reason and three consecutive distinct Goal turns', async () => {
  const { kernel, session, goals } = await fixture()
  await kernel.submit(
    session.id,
    'missing-reason',
    { text: '/tool update_goal {"status":"blocked"}', images: [] },
    'local-fixture',
  )
  await kernel.waitForIdle()
  expect((await goals.get(session.id)).goal?.status).toBe('active')
  expect(
    (await kernel.snapshot(session.id)).messages
      .flatMap((message) => message.content)
      .some((block) => block.type === 'tool_result' && block.text.includes('specific blocking condition')),
  ).toBe(true)
  for (let turn = 1; turn <= 3; turn++) {
    await kernel.submit(
      session.id,
      `report-${turn}`,
      { text: '/tool update_goal {"status":"blocked","reason":"external service is unavailable"}', images: [] },
      'local-fixture',
    )
    await kernel.waitForIdle()
    expect((await goals.get(session.id)).goal).toMatchObject({
      status: turn === 3 ? 'blocked' : 'active',
      blockerAudit: { reason: 'external service is unavailable', consecutiveTurns: turn, requiredTurns: 3 },
    })
  }
})

test('repeated reports in one turn cannot manufacture three turns and autonomous audit stops on the third turn', async () => {
  let turns = 0
  const { kernel, session, goals } = await fixture(async (input) => {
    turns++
    for (let call = 0; call < 3; call++)
      expect(
        (await invoke(input, 'update_goal', { status: 'blocked', reason: 'missing external credential' })).isError ??
          false,
      ).toBe(false)
  }, true)
  await kernel.submit(session.id, 'start', { text: 'Audit this blocker', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect(turns).toBe(3)
  expect((await goals.get(session.id)).goal).toMatchObject({
    status: 'blocked',
    blockerAudit: { consecutiveTurns: 3 },
    continuation: { phase: 'stopped', reason: 'blocked' },
  })
})

test('changing blocker reason, a report-free turn, and verified progress reset the consecutive audit', async () => {
  let reason = 'first blocker'
  let report = true
  let progress = false
  const { kernel, session, goals } = await fixture(async (input) => {
    if (progress)
      await invoke(input, 'update_plan', { plan: [{ step: `New evidence ${input.run.id}`, status: 'in_progress' }] })
    if (report) await invoke(input, 'update_goal', { status: 'blocked', reason })
  })
  async function turn(id: string) {
    await kernel.submit(session.id, id, { text: id, images: [] }, 'local-fixture')
    await kernel.waitForIdle()
  }
  await turn('first')
  await turn('second')
  expect((await goals.get(session.id)).goal?.blockerAudit?.consecutiveTurns).toBe(2)
  reason = 'different blocker'
  await turn('changed')
  expect((await goals.get(session.id)).goal?.blockerAudit?.consecutiveTurns).toBe(1)
  report = false
  await turn('report-free')
  expect((await goals.get(session.id)).goal?.blockerAudit).toBeUndefined()
  report = true
  await turn('again')
  await turn('again-two')
  progress = true
  await turn('meaningful-progress')
  expect((await goals.get(session.id)).goal).toMatchObject({ status: 'active', blockerAudit: { consecutiveTurns: 1 } })
})

test('blocker audit survives restart but explicit resume begins a fresh audit', async () => {
  const { resource, options, kernel, session, goals } = await fixture()
  const input = {
    text: '/tool update_goal {"status":"blocked","reason":"waiting for external dependency"}',
    images: [],
  }
  for (let turn = 0; turn < 2; turn++) {
    await kernel.submit(session.id, `before-${turn}`, input, 'local-fixture')
    await kernel.waitForIdle()
  }
  expect((await goals.get(session.id)).goal?.blockerAudit?.consecutiveTurns).toBe(2)
  await kernel.close()
  resource.kernel = await Kernel.create(options)
  await resource.kernel.waitForIdle()
  await resource.kernel.submit(session.id, 'after-restart', input, 'local-fixture')
  await resource.kernel.waitForIdle()
  const restored = resource.kernel.plugins.get<GoalService>('goal')
  expect((await restored.get(session.id)).goal?.status).toBe('blocked')
  await restored.set(session.id, { status: 'active' })
  expect((await restored.get(session.id)).goal?.blockerAudit).toBeUndefined()
  await resource.kernel.submit(session.id, 'after-resume', input, 'local-fixture')
  await resource.kernel.waitForIdle()
  expect((await restored.get(session.id)).goal).toMatchObject({
    status: 'active',
    blockerAudit: { consecutiveTurns: 1 },
  })
})

test('an execution failure reports a stopped run instead of inventing a genuine Goal blocker', async () => {
  const { kernel, session, goals } = await fixture()
  await kernel.submit(session.id, 'failed-provider', { text: '/fail', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  expect((await goals.get(session.id)).goal).toMatchObject({
    status: 'paused',
    continuation: { phase: 'stopped', reason: 'run_failed' },
  })
  expect((await goals.get(session.id)).goal?.blockerAudit).toBeUndefined()
})
