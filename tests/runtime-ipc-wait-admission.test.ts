import { expect, test } from 'bun:test'
import { z } from 'zod'
import { IpcPeer, procedure } from '@hbar/runtime'

async function pair(advertise = true, waiting = 2, childWaiting = waiting, parentControl = true) {
  const host = { unitId: 'base', generation: 1, incarnation: 'host' }
  const child = { unitId: 'kernel', generation: 1, incarnation: 'child' }
  let right!: IpcPeer
  const left = new IpcPeer({
    owner: host,
    remote: child,
    inFlight: 2,
    waiting,
    controlRemoteDeadlines: parentControl,
    transport: { send: (frame) => right.receive(frame) },
  })
  right = new IpcPeer({
    owner: child,
    remote: host,
    inFlight: 2,
    waiting: childWaiting,
    acceptRemoteDeadlineControl: true,
    transport: { send: (frame) => left.receive(frame) },
  })
  if (advertise) await right.advertiseWaitCapacity()
  return {
    left,
    right,
    close() {
      left.close()
      right.close()
    },
  }
}

test('negotiated human waits admit other work while preserving physical replies, cancellation, nesting and exact counters', async () => {
  const f = await pair()
  const physical = Promise.withResolvers<string>()
  let started = 0
  f.right.register(
    'hold',
    procedure(z.undefined(), z.string(), () => {
      started++
      return physical.promise
    }),
  )
  f.right.register(
    'target',
    procedure(z.undefined(), z.string(), () => 'target completed'),
  )
  const controller = new AbortController()
  const first = f.left.callTracked('hold', undefined, z.string(), { signal: controller.signal })
  const second = f.left.callTracked('hold', undefined, z.string())
  try {
    await Bun.sleep(0)
    expect(started).toBe(2)
    const resume = first.suspendDeadline(),
      nested = first.suspendDeadline()
    await Bun.sleep(0)
    expect(f.left.snapshot()).toMatchObject({ inFlight: 2, waiting: 1, queued: 0 })
    expect(f.right.snapshot()).toMatchObject({ incoming: 2, incomingWaiting: 1 })
    expect(await f.left.call('target', undefined, z.string())).toBe('target completed')
    resume()
    resume()
    await Bun.sleep(0)
    expect(f.left.snapshot().waiting).toBe(1)
    controller.abort()
    expect(await first.result.catch((error: unknown) => error)).toMatchObject({ code: 'IPC_CANCELLED' })
    let physicallySettled = false
    void first.settled
      .finally(() => {
        physicallySettled = true
      })
      .catch(() => {})
    await Bun.sleep(0)
    expect(physicallySettled).toBe(false)
    expect(f.left.snapshot()).toMatchObject({ inFlight: 2, waiting: 1 })
    nested()
    await Bun.sleep(0)
    const queued = f.left.callTracked('target', undefined, z.string())
    expect(f.left.snapshot()).toMatchObject({ inFlight: 2, waiting: 0, queued: 1 })
    physical.resolve('actual reply')
    expect(await first.settled).toBe('actual reply')
    expect(await second.settled).toBe('actual reply')
    expect(await queued.settled).toBe('target completed')
    resume()
    nested()
    await Bun.sleep(0)
    expect(f.left.snapshot()).toMatchObject({ inFlight: 0, waiting: 0, queued: 0 })
    expect(f.right.snapshot()).toMatchObject({ incoming: 0, incomingWaiting: 0 })
  } finally {
    physical.resolve('cleanup')
    f.close()
  }
})

test('only a Host-confirmed incoming wait can free caller admission, and original physical ownership survives a late resumption', async () => {
  const f = await pair()
  const entered = Promise.withResolvers<void>(),
    physical = Promise.withResolvers<string>()
  let resume: (() => void) | undefined
  f.left.register(
    'hold',
    procedure(z.undefined(), z.string(), (_value, context) => {
      resume = context.callerDeadline?.suspend()
      entered.resolve()
      return physical.promise
    }),
  )
  f.left.register(
    'target',
    procedure(z.undefined(), z.string(), () => 'target completed'),
  )
  const first = f.right.callTracked('hold', undefined, z.string())
  try {
    await entered.promise
    await Bun.sleep(0)
    expect(f.left.snapshot()).toMatchObject({ incoming: 1, incomingWaiting: 1 })
    expect(f.right.snapshot()).toMatchObject({ inFlight: 1, waiting: 1 })
    expect(await f.right.call('target', undefined, z.string())).toBe('target completed')
    physical.resolve('actual reply')
    expect(await first.settled).toBe('actual reply')
    resume?.()
    resume?.()
    await Bun.sleep(0)
    expect(f.left.snapshot()).toMatchObject({ incoming: 0, incomingWaiting: 0 })
    expect(f.right.snapshot()).toMatchObject({ inFlight: 0, waiting: 0 })
  } finally {
    physical.resolve('cleanup')
    f.close()
  }
})

test('waiting admission is separately bounded and failed suspension cannot release a second call', async () => {
  const f = await pair(true, 2, 1)
  const physical = Promise.withResolvers<string>()
  f.right.register(
    'hold',
    procedure(z.undefined(), z.string(), () => physical.promise),
  )
  const first = f.left.callTracked('hold', undefined, z.string()),
    second = f.left.callTracked('hold', undefined, z.string())
  try {
    await Bun.sleep(0)
    const resume = first.suspendDeadline()
    expect(() => second.suspendDeadline()).toThrow('waiting-call admission is full')
    expect(f.left.snapshot()).toMatchObject({ inFlight: 2, waiting: 1 })
    physical.resolve('actual reply')
    await Promise.all([first.settled, second.settled])
    resume()
    await Bun.sleep(0)
    expect(f.left.snapshot()).toMatchObject({ inFlight: 0, waiting: 0 })
  } finally {
    physical.resolve('cleanup')
    f.close()
  }
})

test('legacy peers retain ordinary admission and child-forged wait controls close only their connection', async () => {
  const f = await pair(false)
  const physical = Promise.withResolvers<string>()
  f.right.register(
    'hold',
    procedure(z.undefined(), z.string(), () => physical.promise),
  )
  const first = f.left.callTracked('hold', undefined, z.string())
  try {
    await Bun.sleep(0)
    const resume = first.suspendDeadline()
    expect(f.left.snapshot()).toMatchObject({ inFlight: 1, waiting: 0 })
    await f.right.notify('runtime.wait.admission', {
      id: crypto.randomUUID(),
      token: crypto.randomUUID(),
      target: 'incoming',
      phase: 'pause',
    })
    expect(f.left.snapshot().failed).toBe(true)
    expect(await first.settled.catch((error: unknown) => error)).toMatchObject({ code: 'IPC_FORBIDDEN' })
    resume()
    expect(f.left.snapshot()).toMatchObject({ inFlight: 0, waiting: 0 })
  } finally {
    physical.resolve('cleanup')
    f.close()
  }
})

test('a valid capability announcement preserves a connection whose parent has not enabled wait control', async () => {
  const f = await pair(true, 2, 2, false)
  f.right.register(
    'work',
    procedure(z.undefined(), z.string(), () => 'completed'),
  )
  try {
    expect(await f.left.call('work', undefined, z.string())).toBe('completed')
    expect(f.left.snapshot()).toMatchObject({ failed: false, inFlight: 0, waiting: 0 })
  } finally {
    f.close()
  }
})
