import { expect, test } from 'bun:test'
import { z } from 'zod'
import { IpcPeer, RuntimeValuePort, procedure } from '@hbar/runtime'
import { RpcDeadline, type RpcDeadlineClock } from '../packages/runtime/src/rpc-deadline'

function deferred<Value>() {
  let resolve!: (value: Value) => void
  const promise = new Promise<Value>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}
function fakeClock() {
  let now = 0
  const timers = new Map<symbol, { at: number; callback: () => void }>()
  const callbacks: Array<() => void> = []
  const clock: RpcDeadlineClock = {
    now: () => now,
    schedule(callback, milliseconds) {
      const id = Symbol('rpc-deadline')
      timers.set(id, { at: now + milliseconds, callback })
      callbacks.push(callback)
      return () => {
        timers.delete(id)
      }
    },
  }
  return {
    clock,
    timers,
    callbacks,
    advance(milliseconds: number) {
      now += milliseconds
      for (const [id, timer] of [...timers])
        if (timers.has(id) && timer.at <= now) {
          timers.delete(id)
          timer.callback()
        }
    },
  }
}
function pair(onTimeout?: () => void) {
  const caller = { unitId: 'caller', generation: 1, incarnation: 'caller' }
  const owner = { unitId: 'owner', generation: 1, incarnation: 'owner' }
  let right!: IpcPeer
  const left = new IpcPeer({
    owner: caller,
    remote: owner,
    inFlight: 1,
    queued: 2,
    ...(onTimeout ? { onTimeout } : {}),
    transport: { send: (frame) => right.receive(frame) },
  })
  right = new IpcPeer({
    owner,
    remote: caller,
    inFlight: 1,
    queued: 2,
    transport: { send: (frame) => left.receive(frame) },
  })
  return {
    left,
    right,
    close() {
      left.close()
      right.close()
    },
  }
}

test('nested RPC waits preserve the remaining deadline and ignore stale timer deliveries', () => {
  const clock = fakeClock()
  let expired = 0
  const deadline = new RpcDeadline(
    100,
    () => {
      expired++
    },
    clock.clock,
  )
  clock.advance(60)
  const resume = deadline.suspend()
  const nested = deadline.suspend()
  clock.advance(86_400_000)
  clock.callbacks[0]?.()
  expect(expired).toBe(0)
  expect(clock.timers.size).toBe(0)
  resume()
  resume()
  expect(clock.timers.size).toBe(0)
  nested()
  clock.callbacks[0]?.()
  expect(expired).toBe(0)
  clock.advance(39)
  expect(expired).toBe(0)
  clock.advance(1)
  expect(expired).toBe(1)
  const after = deadline.suspend()
  after()
  clock.advance(86_400_000)
  expect(expired).toBe(1)
  expect(clock.timers.size).toBe(0)
})

test('RPC pause counts and inputs are bounded, and disposal makes old resumes inert', () => {
  const clock = fakeClock()
  for (const milliseconds of [0, -1, NaN, Infinity, 0.5, 2_147_483_648])
    expect(() => new RpcDeadline(milliseconds, () => {}, clock.clock)).toThrow('timer-safe integer')
  let expired = 0
  const deadline = new RpcDeadline(
    100,
    () => {
      expired++
    },
    clock.clock,
  )
  const resumes = Array.from({ length: 64 }, () => deadline.suspend())
  expect(() => deadline.suspend()).toThrow('capacity')
  deadline.dispose()
  for (const resume of resumes) resume()
  for (const callback of clock.callbacks) callback()
  clock.advance(86_400_000)
  expect(expired).toBe(0)
  expect(clock.timers.size).toBe(0)
})

test('a confirmed RPC wait retains physical capacity, resumes its timeout and preserves the actual late result', async () => {
  let timeouts = 0
  const f = pair(() => {
    timeouts++
  })
  const started = deferred<void>()
  const physical = deferred<string>()
  f.right.register(
    'work',
    procedure(z.undefined(), z.string(), () => {
      started.resolve()
      return physical.promise
    }),
  )
  const ticket = f.left.callTracked('work', undefined, z.string(), { timeoutMs: 40 })
  const result = ticket.result.catch((error: unknown) => error)
  try {
    await started.promise
    const resume = ticket.suspendDeadline()
    await Bun.sleep(90)
    expect(timeouts).toBe(0)
    expect(f.left.snapshot()).toMatchObject({ inFlight: 1, queued: 0 })
    expect(f.right.snapshot().incoming).toBe(1)
    resume()
    resume()
    expect(await result).toMatchObject({ code: 'IPC_TIMEOUT' })
    expect(timeouts).toBe(1)
    expect(f.left.snapshot().inFlight).toBe(1)
    ticket.suspendDeadline()()
    physical.resolve('the original owner actually completed')
    expect(await ticket.settled).toBe('the original owner actually completed')
    expect(f.left.snapshot().inFlight).toBe(0)
  } finally {
    physical.resolve('cleanup')
    f.close()
  }
})

test('queued calls cannot claim a human wait before dispatch and cancellation still settles their receipt', async () => {
  const f = pair()
  const started = deferred<void>()
  const physical = deferred<string>()
  f.right.register(
    'work',
    procedure(z.undefined(), z.string(), () => {
      started.resolve()
      return physical.promise
    }),
  )
  const first = f.left.callTracked('work', undefined, z.string())
  const controller = new AbortController()
  const queued = f.left.callTracked('work', undefined, z.string(), { signal: controller.signal })
  try {
    await started.promise
    expect(() => queued.suspendDeadline()).toThrow('Only a sent request')
    controller.abort()
    expect(await queued.result.catch((error: unknown) => error)).toMatchObject({ code: 'IPC_CANCELLED' })
    expect(await queued.settled.catch((error: unknown) => error)).toMatchObject({ code: 'IPC_CANCELLED' })
    queued.suspendDeadline()()
    expect(f.left.snapshot()).toMatchObject({ inFlight: 1, queued: 0 })
    physical.resolve('completed')
    await first.settled
  } finally {
    physical.resolve('cleanup')
    f.close()
  }
})

test('a parked call can be cancelled without releasing its original physical owner', async () => {
  const f = pair()
  const started = deferred<void>()
  const physical = deferred<string>()
  const controller = new AbortController()
  f.right.register(
    'work',
    procedure(z.undefined(), z.string(), () => {
      started.resolve()
      return physical.promise
    }),
  )
  const ticket = f.left.callTracked('work', undefined, z.string(), { signal: controller.signal, timeoutMs: 40 })
  try {
    await started.promise
    const resume = ticket.suspendDeadline()
    controller.abort()
    expect(await ticket.result.catch((error: unknown) => error)).toMatchObject({ code: 'IPC_CANCELLED' })
    expect(f.left.snapshot().inFlight).toBe(1)
    resume()
    physical.resolve('late actual result')
    expect(await ticket.settled).toBe('late actual result')
    expect(f.left.snapshot().inFlight).toBe(0)
  } finally {
    physical.resolve('cleanup')
    f.close()
  }
})

test('transport loss settles a parked ticket explicitly and invalid deadline inputs allocate no capacity', async () => {
  const f = pair()
  const started = deferred<void>()
  const physical = deferred<string>()
  f.right.register(
    'work',
    procedure(z.undefined(), z.string(), () => {
      started.resolve()
      return physical.promise
    }),
  )
  try {
    for (const timeoutMs of [0, -1, NaN, Infinity, 0.5, 2_147_483_648]) {
      const ticket = f.left.callTracked('work', undefined, z.string(), { timeoutMs })
      expect(await ticket.result.catch((error: unknown) => error)).toMatchObject({ code: 'INVALID_INPUT' })
      expect(await ticket.settled.catch((error: unknown) => error)).toMatchObject({ code: 'INVALID_INPUT' })
      ticket.suspendDeadline()()
    }
    expect(f.left.snapshot()).toMatchObject({ inFlight: 0, queued: 0, queuedBytes: 0 })
    const ticket = f.left.callTracked('work', undefined, z.string())
    await started.promise
    const resume = ticket.suspendDeadline()
    f.left.close()
    expect(await ticket.result.catch((error: unknown) => error)).toMatchObject({ code: 'IPC_DISCONNECTED' })
    expect(await ticket.settled.catch((error: unknown) => error)).toMatchObject({ code: 'IPC_DISCONNECTED' })
    resume()
  } finally {
    physical.resolve('cleanup')
    f.close()
  }
})

test('application value ports preserve deadline control and decode the actual result once', async () => {
  const f = pair()
  const local = new RuntimeValuePort(f.left, { prefix: 'wait.application' })
  const remote = new RuntimeValuePort(f.right, { prefix: 'wait.application' })
  const started = deferred<void>()
  const physical = deferred<{ answer: string }>()
  remote.register('wait', () => {
    started.resolve()
    return physical.promise
  })
  const ticket = local.callTracked<{ answer: string }>('wait', [], { timeoutMs: 40 })
  try {
    await started.promise
    const resume = ticket.suspendDeadline()
    await Bun.sleep(90)
    expect(f.left.snapshot().inFlight).toBe(1)
    physical.resolve({ answer: 'original result' })
    const result = await ticket.result
    expect(result).toEqual({ answer: 'original result' })
    expect(await ticket.settled).toBe(result)
    resume()
    expect(f.left.snapshot().inFlight).toBe(0)
    expect(local.snapshot().callbacks).toBe(0)
  } finally {
    physical.resolve({ answer: 'cleanup' })
    local.dispose()
    remote.dispose()
    f.close()
  }
})
