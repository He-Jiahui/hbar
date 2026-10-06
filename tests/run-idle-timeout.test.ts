import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError } from '@hbar/contracts'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { definePlugin, provide } from '@hbar/plugin-sdk'
import type { DriverInput, HarnessDriver } from '@hbar/plugin-sdk'
import { createRunIdleTimeout, DEFAULT_RUN_IDLE_TIMEOUT_MS } from '../packages/kernel/src/run-idle-timeout'
import type { RunIdleScheduler } from '../packages/kernel/src/run-idle-timeout'

function fakeClock() {
  let time = 0
  const timers = new Set<{ at: number; callback: () => void }>()
  const clock: RunIdleScheduler = {
    now: () => time,
    schedule(callback, delayMs) {
      const timer = { at: time + delayMs, callback }
      timers.add(timer)
      return () => timers.delete(timer)
    },
  }
  return {
    clock,
    timers,
    advance(ms: number) {
      const end = time + ms
      for (;;) {
        const next = [...timers].sort((a, b) => a.at - b.at)[0]
        if (!next || next.at > end) break
        time = next.at
        timers.delete(next)
        next.callback()
      }
      time = end
    },
  }
}

test('a progressing Run survives the former 20-minute wall limit and times out only after idle', () => {
  const clock = fakeClock()
  const controller = new AbortController()
  const timeout = createRunIdleTimeout(controller, DEFAULT_RUN_IDLE_TIMEOUT_MS, clock.clock)
  clock.advance(19 * 60_000)
  timeout.progress()
  clock.advance(2 * 60_000)
  expect(controller.signal.aborted).toBe(false)
  expect(clock.timers.size).toBe(1)
  clock.advance(18 * 60_000)
  expect(controller.signal.aborted).toBe(true)
  expect(controller.signal.reason).toMatchObject({ code: 'RUN_TIMEOUT' })
  expect(clock.timers.size).toBe(0)
})

test('frequent progress keeps one timer and disposing a settled Run releases it', () => {
  const clock = fakeClock()
  const controller = new AbortController()
  const timeout = createRunIdleTimeout(controller, 100, clock.clock)
  for (let tick = 0; tick < 100; tick++) {
    clock.advance(20)
    timeout.progress()
    expect(clock.timers.size).toBe(1)
  }
  timeout.dispose()
  timeout.dispose()
  expect(clock.timers.size).toBe(0)
  clock.advance(100)
  expect(controller.signal.aborted).toBe(false)
})

test('cancellation preserves its cause and releases timers even before watchdog creation', () => {
  for (const abortFirst of [false, true]) {
    const clock = fakeClock()
    const controller = new AbortController()
    const reason = new HbarError('USER_CANCELLED', 'Cancelled by user')
    if (abortFirst) controller.abort(reason)
    const timeout = createRunIdleTimeout(controller, 100, clock.clock)
    controller.abort(reason)
    timeout.progress()
    clock.advance(100)
    expect(controller.signal.reason).toBe(reason)
    expect(clock.timers.size).toBe(0)
  }
})

test('invalid deadlines fail before scheduling a timer', () => {
  const clock = fakeClock()
  for (const ms of [0, -1, 0.5, NaN, Infinity, 2_147_483_648])
    expect(() => createRunIdleTimeout(new AbortController(), ms, clock.clock)).toThrow('Run idle timeout')
  expect(clock.timers.size).toBe(0)
})

test('bounded tool execution suspends idle checks until every nested tool settles', () => {
  const clock = fakeClock()
  const controller = new AbortController()
  const timeout = createRunIdleTimeout(controller, 100, clock.clock)
  const resumeParent = timeout.suspend()
  const resumeChild = timeout.suspend()
  expect(clock.timers.size).toBe(0)
  clock.advance(1_000)
  resumeParent()
  resumeParent()
  clock.advance(1_000)
  expect(controller.signal.aborted).toBe(false)
  expect(clock.timers.size).toBe(0)
  resumeChild()
  clock.advance(99)
  expect(controller.signal.aborted).toBe(false)
  clock.advance(1)
  expect(controller.signal.reason).toMatchObject({ code: 'RUN_TIMEOUT' })
})

test('cancelling a tool-suspended Run never schedules a new idle timer', () => {
  const clock = fakeClock()
  const controller = new AbortController()
  const timeout = createRunIdleTimeout(controller, 100, clock.clock)
  const resume = timeout.suspend()
  const reason = new HbarError('USER_CANCELLED', 'Cancelled')
  controller.abort(reason)
  resume()
  timeout.suspend()()
  clock.advance(100)
  expect(clock.timers.size).toBe(0)
  expect(controller.signal.reason).toBe(reason)
})

const resources: { root: string; kernel: Kernel }[] = []
afterEach(async () => {
  for (const { root, kernel } of resources.splice(0)) {
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture(script: (input: DriverInput) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'hbar-run-idle-'))
  const driver = definePlugin({
    manifest: {
      id: 'driver.pi',
      name: 'Run activity fixture',
      description: 'Exercise Run idle deadlines with real Host storage',
      version: '1.0.0',
      apiVersion: '^1.0.0',
      scope: 'host',
      permissions: [],
      provides: { driver: '1.0.0' },
    },
    apply(ctx) {
      provide<HarnessDriver>(ctx, 'driver', {
        run: script,
        summarize: async () => ({ text: '', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 } }),
      })
    },
  })
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
    profile: { replacements: { 'driver.pi': driver } },
    runIdleTimeoutMs: 600,
  })
  resources.push({ root, kernel })
  const workspace = (await kernel.storage.call('workspaces'))[0]
  if (!workspace) throw new Error('Fixture workspace missing')
  const session = await kernel.createSession(workspace.id)
  const run = await kernel.submit(session.id, 'start', { text: 'Work', images: [] }, 'local-fixture')
  await kernel.waitForIdle()
  return { kernel, run: await kernel.storage.call('run', run.id) }
}

for (const activity of ['text', 'thinking', 'tool'] as const)
  test(`real ${activity} progress renews the Host Run deadline`, async () => {
    const { run } = await fixture(async (input) => {
      for (let tick = 1; tick <= 6; tick++) {
        await Bun.sleep(150)
        input.signal.throwIfAborted()
        if (activity === 'tool') await input.execute('get_goal', {}, `probe-${tick}`)
        else
          input.stream(
            'output',
            activity === 'text' ? '.'.repeat(tick) : '',
            activity === 'thinking' ? '.'.repeat(tick) : '',
          )
      }
    })
    expect(run.status).toBe('completed')
    expect(run.failure).toBeUndefined()
    expect((run.endedAt ?? 0) - (run.startedAt ?? 0)).toBeGreaterThan(600)
  })

test('duplicate stream updates cannot keep a stalled Run alive', async () => {
  const { run } = await fixture(async (input) => {
    input.stream('stationary', 'unchanged', '')
    const timer = setInterval(() => input.stream('stationary', 'unchanged', ''), 100)
    try {
      await new Promise<void>((_resolve, reject) => {
        if (input.signal.aborted) reject(input.signal.reason)
        else input.signal.addEventListener('abort', () => reject(input.signal.reason), { once: true })
      })
    } finally {
      clearInterval(timer)
    }
  })
  expect(run.status).toBe('failed')
  expect(run.failure).toEqual({ code: 'RUN_TIMEOUT', category: 'timeout', retryable: false })
  expect(run.error).toBe('Run made no progress for 600 milliseconds')
})
