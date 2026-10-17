import { expect, test } from 'bun:test'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts/errors'
import { executionOwnershipSchema, type RuntimeOwner } from '@hbar/contracts/runtime'
import { ExecutionDeadlines, IpcPeer, procedure, type IpcCallTicket } from '@hbar/runtime'

const owner: RuntimeOwner = { unitId: 'kernel', generation: 1, incarnation: 'original' }
const execution = executionOwnershipSchema.parse({
  owner,
  leaseId: 'original',
  sessionId: 'session',
  runId: 'run',
  fence: 1,
  acquiredAt: 1,
  versions: {
    kernel: { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) },
    driver: { unitId: 'driver', generation: 1, artifactId: 'b'.repeat(64) },
    plugins: [],
    hooks: [],
  },
})
async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected rejection')
}
function ticket() {
  const actual = Promise.withResolvers<string>()
  let paused = 0
  const control: IpcCallTicket<string> = {
    result: actual.promise,
    settled: actual.promise,
    suspendDeadline() {
      paused++
      let active = true
      return () => {
        if (active) {
          active = false
          paused--
        }
      }
    },
  }
  return {
    control,
    actual,
    get paused() {
      return paused
    },
  }
}
function pair() {
  const remote: RuntimeOwner = { unitId: 'plugin', generation: 1, incarnation: 'actual-plugin' }
  let plugin!: IpcPeer
  const kernel = new IpcPeer({ owner, remote, inFlight: 2, transport: { send: (frame) => plugin.receive(frame) } })
  plugin = new IpcPeer({
    owner: remote,
    remote: owner,
    inFlight: 2,
    transport: { send: (frame) => kernel.receive(frame) },
  })
  return {
    kernel,
    plugin,
    close() {
      kernel.close()
      plugin.close()
    },
  }
}

test('a local parent RPC preserves its remaining deadline while a human wait retains physical execution', async () => {
  const peers = pair(),
    deadlines = new ExecutionDeadlines(),
    started = Promise.withResolvers<void>(),
    actual = Promise.withResolvers<string>()
  peers.plugin.register(
    'tool',
    procedure(z.undefined(), z.string(), () => {
      started.resolve()
      return actual.promise
    }),
  )
  let original: IpcCallTicket<string> | undefined
  const result = deadlines.execute(execution, 'call', () => {
    original = peers.kernel.callTracked('tool', undefined, z.string(), { timeoutMs: 100 })
    return original
  })
  void result.catch(() => {})
  try {
    await started.promise
    const resume = deadlines.suspend(execution, 'call')
    await Bun.sleep(180)
    expect(peers.kernel.snapshot().inFlight).toBe(1)
    expect(deadlines.snapshot()).toEqual({ scopes: 1, executions: 1, callbacks: 1 })
    resume()
    if (!original) throw new Error('Missing original callback')
    expect(await failure(original.result)).toMatchObject({ code: 'IPC_TIMEOUT' })
    expect(deadlines.snapshot().callbacks).toBe(1)
    expect(peers.kernel.snapshot().inFlight).toBe(1)
    actual.resolve('actual late reply')
    expect(await result).toBe('actual late reply')
    expect(deadlines.snapshot()).toEqual({ scopes: 0, executions: 0, callbacks: 0 })
  } finally {
    actual.resolve('cleanup')
    peers.close()
  }
})

test('logical cancellation retains a paused parent until its original physical callback settles', async () => {
  const peers = pair(),
    deadlines = new ExecutionDeadlines(),
    started = Promise.withResolvers<void>(),
    actual = Promise.withResolvers<string>(),
    controller = new AbortController()
  peers.plugin.register(
    'tool',
    procedure(z.undefined(), z.string(), () => {
      started.resolve()
      return actual.promise
    }),
  )
  const original = peers.kernel.callTracked('tool', undefined, z.string(), { signal: controller.signal })
  void original.result.catch(() => {})
  const result = deadlines.execute(execution, 'call', () => original)
  try {
    await started.promise
    const resume = deadlines.suspend(execution, 'call')
    controller.abort(new HbarError('USER_CANCELLED', 'Cancelled'))
    expect(await failure(original.result)).toMatchObject({ code: 'IPC_CANCELLED' })
    expect(deadlines.snapshot().callbacks).toBe(1)
    actual.resolve('actual cancellation receipt')
    expect(await result).toBe('actual cancellation receipt')
    expect(deadlines.snapshot()).toMatchObject({ callbacks: 0, scopes: 1 })
    resume()
    resume()
    expect(deadlines.snapshot()).toEqual({ scopes: 0, executions: 0, callbacks: 0 })
  } finally {
    actual.resolve('cleanup')
    peers.close()
  }
})

test('nested waits share one parent suspension and isolate calls, Runs and execution fences', async () => {
  const deadlines = new ExecutionDeadlines(),
    first = ticket(),
    otherCall = ticket(),
    otherRun = ticket(),
    otherFence = ticket()
  const pending = [
    deadlines.execute(execution, 'call', () => first.control),
    deadlines.execute(execution, 'other', () => otherCall.control),
    deadlines.execute({ ...execution, runId: 'different' }, 'call', () => otherRun.control),
    deadlines.execute({ ...execution, fence: 2 }, 'call', () => otherFence.control),
  ]
  const resume = deadlines.suspend(execution, 'call'),
    nested = deadlines.suspend(execution, 'call')
  expect([first.paused, otherCall.paused, otherRun.paused, otherFence.paused]).toEqual([1, 0, 0, 0])
  resume()
  resume()
  expect(first.paused).toBe(1)
  nested()
  expect(first.paused).toBe(0)
  for (const call of [first, otherCall, otherRun, otherFence]) call.actual.resolve('done')
  await Promise.all(pending)
  const successor = ticket(),
    next = deadlines.execute(execution, 'call', () => successor.control)
  nested()
  expect(successor.paused).toBe(0)
  successor.actual.resolve('successor')
  await next
  expect(deadlines.snapshot()).toEqual({ scopes: 0, executions: 0, callbacks: 0 })
})

test('reentrant dispatch and late parent bindings inherit an already-confirmed wait', async () => {
  const deadlines = new ExecutionDeadlines(),
    original = ticket(),
    late = ticket()
  let resume = () => {}
  const pending = deadlines.execute(execution, 'call', () => {
    resume = deadlines.suspend(execution, 'call')
    return original.control
  })
  const other = deadlines.execute(execution, 'call', () => late.control)
  expect([original.paused, late.paused]).toEqual([1, 1])
  original.actual.resolve('done')
  late.actual.resolve('done')
  await Promise.all([pending, other])
  expect([original.paused, late.paused]).toEqual([0, 0])
  expect(deadlines.snapshot().scopes).toBe(1)
  resume()
  expect(deadlines.snapshot()).toEqual({ scopes: 0, executions: 0, callbacks: 0 })
})

test('callback admission is bounded before dispatch and failed dispatch releases its own scope', async () => {
  const deadlines = new ExecutionDeadlines(),
    actual = ticket()
  let dispatched = 0
  const calls = Array.from({ length: 64 }, (_, index) =>
    deadlines.execute(execution, `call-${index}`, () => {
      dispatched++
      return actual.control
    }),
  )
  expect(
    await failure(
      deadlines.execute(execution, 'call-0', () => {
        dispatched++
        return actual.control
      }),
    ),
  ).toMatchObject({ code: 'BUSY' })
  expect(dispatched).toBe(64)
  expect(deadlines.snapshot().callbacks).toBe(64)
  actual.actual.resolve('done')
  await Promise.all(calls)
  expect(
    await failure(
      deadlines.execute(execution, 'failed', () => {
        throw new HbarError('LOCAL_FAILURE', 'Dispatch failed')
      }),
    ),
  ).toMatchObject({ code: 'LOCAL_FAILURE' })
  expect(deadlines.snapshot()).toEqual({ scopes: 0, executions: 0, callbacks: 0 })
})

test('nested wait, per-execution scope and global scope bounds clean up without stale authority', async () => {
  const deadlines = new ExecutionDeadlines()
  const nested = Array.from({ length: 64 }, () => deadlines.suspend(execution, 'call'))
  expect(() => deadlines.suspend(execution, 'call')).toThrow('capacity is full')
  for (const resume of nested) resume()
  const resumptions: Array<() => void> = []
  for (let group = 0; group < 64; group++)
    for (let index = 0; index < 64; index++)
      resumptions.push(deadlines.suspend({ ...execution, runId: `run-${group}` }, `call-${index}`))
  expect(() => deadlines.suspend({ ...execution, runId: 'overflow' }, 'call')).toThrow('capacity is full')
  expect(deadlines.snapshot()).toEqual({ scopes: 4096, executions: 64, callbacks: 0 })
  for (const resume of resumptions) resume()
  expect(deadlines.snapshot()).toEqual({ scopes: 0, executions: 0, callbacks: 0 })
})

test('a failed partial suspension restores earlier deadlines while physical callbacks remain owned', async () => {
  const deadlines = new ExecutionDeadlines(),
    sent = ticket(),
    queued = ticket()
  const queuedControl: IpcCallTicket<string> = {
    ...queued.control,
    suspendDeadline() {
      throw new HbarError('IPC_REQUEST_NOT_STARTED', 'Queued calls cannot pause')
    },
  }
  const calls = [
    deadlines.execute(execution, 'call', () => sent.control),
    deadlines.execute(execution, 'call', () => queuedControl),
  ]
  expect(() => deadlines.suspend(execution, 'call')).toThrow('Queued calls cannot pause')
  expect(sent.paused).toBe(0)
  expect(deadlines.snapshot().callbacks).toBe(2)
  sent.actual.resolve('done')
  queued.actual.resolve('done')
  await Promise.all(calls)
  expect(deadlines.snapshot()).toEqual({ scopes: 0, executions: 0, callbacks: 0 })
})

test('global callback capacity rejects before dispatch and drains all original callbacks', async () => {
  const deadlines = new ExecutionDeadlines(),
    original = ticket()
  let dispatched = 0
  const calls: Array<Promise<string>> = []
  for (let group = 0; group < 128; group++)
    for (let index = 0; index < 64; index++)
      calls.push(
        deadlines.execute({ ...execution, runId: `run-${group}` }, 'call', () => {
          dispatched++
          return original.control
        }),
      )
  expect(
    await failure(
      deadlines.execute(execution, 'overflow', () => {
        dispatched++
        return original.control
      }),
    ),
  ).toMatchObject({ code: 'BUSY' })
  expect(dispatched).toBe(8192)
  expect(deadlines.snapshot()).toEqual({ scopes: 128, executions: 128, callbacks: 8192 })
  original.actual.resolve('done')
  await Promise.all(calls)
  expect(deadlines.snapshot()).toEqual({ scopes: 0, executions: 0, callbacks: 0 })
})
