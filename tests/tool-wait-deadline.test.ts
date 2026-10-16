import { expect, test } from 'bun:test'
import { HbarError } from '@hbar/contracts'
import { ToolExecutions, type ToolDeadlineClock } from '../packages/kernel/src/tool-timeout'

function fakeClock() {
  let now = 0
  const timers = new Map<symbol, { at: number; callback: () => void }>()
  const clock: ToolDeadlineClock = {
    now: () => now,
    schedule(callback, milliseconds) {
      const id = Symbol('deadline')
      timers.set(id, { at: now + milliseconds, callback })
      return () => {
        timers.delete(id)
      }
    },
  }
  return {
    clock,
    timers,
    advance(milliseconds: number) {
      now += milliseconds
      for (const [id, timer] of [...timers])
        if (timer.at <= now) {
          timers.delete(id)
          timer.callback()
        }
    },
  }
}
function deferred() {
  let resolve!: (value: string) => void
  const promise = new Promise<string>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

test('confirmed human waits pause remaining time, resume once, and retain physical tool capacity', async () => {
  const clock = fakeClock()
  const executions = new ToolExecutions(1, clock.clock)
  const controller = new AbortController()
  const physical = deferred()
  let settled = 0
  const result = executions.run(
    'session:tool',
    'tool',
    'call',
    controller,
    100,
    () => physical.promise,
    async () => {
      settled++
    },
    { runId: 'source' },
  )
  const outcome = result.then(
    () => null,
    (error: unknown) => error,
  )
  await Bun.sleep(0)
  clock.advance(60)
  const resume = executions.suspend('source', 'call')
  const resumeNested = executions.suspend('source', 'call')
  clock.advance(86_400_000)
  expect(controller.signal.aborted).toBe(false)
  expect(clock.timers.size).toBe(0)
  expect(() => executions.assertAvailable('another:tool', 'tool')).toThrow('capacity')
  resume()
  resume()
  clock.advance(86_400_000)
  expect(clock.timers.size).toBe(0)
  resumeNested()
  clock.advance(39)
  expect(controller.signal.aborted).toBe(false)
  clock.advance(1)
  expect(await outcome).toMatchObject({ code: 'TOOL_TIMEOUT' })
  expect(settled).toBe(0)
  expect(() => executions.assertAvailable('another:tool', 'tool')).toThrow('capacity')
  physical.resolve('actually settled')
  await Bun.sleep(0)
  expect(settled).toBe(1)
  expect(clock.timers.size).toBe(0)
  executions.assertAvailable('another:tool', 'tool')
  executions.dispose()
})

test('another Run or call cannot suspend the actual tool deadline', async () => {
  const clock = fakeClock()
  const executions = new ToolExecutions(1, clock.clock)
  const controller = new AbortController()
  const physical = deferred()
  const result = executions.run('session:tool', 'tool', 'call', controller, 100, () => physical.promise, undefined, {
    runId: 'source',
  })
  const outcome = result.then(
    () => null,
    (error: unknown) => error,
  )
  await Bun.sleep(0)
  executions.suspend('other-run', 'call')()
  executions.suspend('source', 'other-call')()
  clock.advance(100)
  expect(await outcome).toMatchObject({ code: 'TOOL_TIMEOUT' })
  physical.resolve('settled')
  await Bun.sleep(0)
  executions.dispose()
})

test('cancellation while parked retains its original cause and old resumes cannot affect a successor', async () => {
  const clock = fakeClock()
  const executions = new ToolExecutions(1, clock.clock)
  const controller = new AbortController()
  const physical = deferred()
  const result = executions.run('session:tool', 'tool', 'call', controller, 100, () => physical.promise, undefined, {
    runId: 'source',
  })
  const outcome = result.then(
    () => null,
    (error: unknown) => error,
  )
  await Bun.sleep(0)
  const resume = executions.suspend('source', 'call')
  const cancelled = new HbarError('USER_CANCELLED', 'Cancelled by user')
  controller.abort(cancelled)
  physical.resolve('cooperative result')
  expect(await result).toBe('cooperative result')
  expect(await outcome).toBeNull()
  expect(controller.signal.reason).toBe(cancelled)
  const nextController = new AbortController()
  const nextPhysical = deferred()
  const next = executions.run(
    'session:tool',
    'tool',
    'next-call',
    nextController,
    100,
    () => nextPhysical.promise,
    undefined,
    { runId: 'successor' },
  )
  const nextOutcome = next.then(
    () => null,
    (error: unknown) => error,
  )
  await Bun.sleep(0)
  resume()
  resume()
  clock.advance(100)
  expect(await nextOutcome).toMatchObject({ code: 'TOOL_TIMEOUT' })
  nextPhysical.resolve('settled')
  await Bun.sleep(0)
  expect(clock.timers.size).toBe(0)
  executions.dispose()
})

test('actual completion during a wait disposes its timer and resume cannot arm a new one', async () => {
  const clock = fakeClock()
  const executions = new ToolExecutions(1, clock.clock)
  const controller = new AbortController()
  const physical = deferred()
  const result = executions.run('session:tool', 'tool', 'call', controller, 100, () => physical.promise, undefined, {
    runId: 'source',
  })
  await Bun.sleep(0)
  const resume = executions.suspend('source', 'call')
  physical.resolve('answer accepted')
  expect(await result).toBe('answer accepted')
  resume()
  clock.advance(86_400_000)
  expect(controller.signal.aborted).toBe(false)
  expect(clock.timers.size).toBe(0)
  executions.dispose()
})
