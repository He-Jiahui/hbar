import { expect, test } from 'bun:test'
import { z } from 'zod'
import { IpcPeer, procedure, type IpcPeerOptions, type IpcProcedureContext } from '@hbar/runtime'

function pair(options: { host?: Partial<IpcPeerOptions>; child?: Partial<IpcPeerOptions> } = {}) {
  const host = { unitId: 'base', generation: 1, incarnation: 'host' }
  const child = { unitId: 'child', generation: 1, incarnation: 'child' }
  let unit!: IpcPeer
  const parent = new IpcPeer({
    owner: host,
    remote: child,
    controlRemoteDeadlines: true,
    ...options.host,
    transport: { send: (frame) => unit.receive(frame) },
  })
  unit = new IpcPeer({
    owner: child,
    remote: host,
    acceptRemoteDeadlineControl: true,
    ...options.child,
    transport: { send: (frame) => parent.receive(frame) },
  })
  return {
    parent,
    unit,
    close() {
      parent.close()
      unit.close()
    },
  }
}
async function failure(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation
  } catch (error) {
    return error
  }
  throw new Error('Expected rejection')
}

test('only the trusted stable parent suspends a child caller and resumption restores its remaining deadline', async () => {
  const f = pair(),
    entered = Promise.withResolvers<IpcProcedureContext>(),
    actual = Promise.withResolvers<string>()
  f.parent.register(
    'question',
    procedure(z.undefined(), z.string(), (_input, context) => {
      entered.resolve(context)
      return actual.promise
    }),
  )
  const original = f.unit.callTracked('question', undefined, z.string(), { timeoutMs: 100 })
  void original.result.catch(() => {})
  try {
    const context = await entered.promise
    if (!context.callerDeadline) throw new Error('Missing stable-parent deadline authority')
    const resume = context.callerDeadline.suspend(),
      nested = context.callerDeadline.suspend()
    await Bun.sleep(180)
    expect(f.unit.snapshot().inFlight).toBe(1)
    resume()
    resume()
    await Bun.sleep(120)
    expect(f.unit.snapshot().inFlight).toBe(1)
    nested()
    expect(await failure(original.result)).toMatchObject({ code: 'IPC_TIMEOUT' })
    expect(f.unit.snapshot().inFlight).toBe(1)
    actual.resolve('original actual reply')
    expect(await original.settled).toBe('original actual reply')
    expect(f.unit.snapshot().inFlight).toBe(0)
  } finally {
    actual.resolve('cleanup')
    f.close()
  }
})

test('remote caller pauses remain bounded and become inert after actual settlement', async () => {
  const f = pair(),
    entered = Promise.withResolvers<IpcProcedureContext>(),
    actual = Promise.withResolvers<string>()
  f.parent.register(
    'question',
    procedure(z.undefined(), z.string(), (_input, context) => {
      entered.resolve(context)
      return actual.promise
    }),
  )
  const original = f.unit.callTracked('question', undefined, z.string())
  try {
    const context = await entered.promise
    const control = context.callerDeadline
    if (!control) throw new Error('Missing stable-parent authority')
    const resumes = Array.from({ length: 64 }, () => control.suspend())
    expect(() => control.suspend()).toThrow('capacity is full')
    actual.resolve('settled')
    expect(await original.settled).toBe('settled')
    await Bun.sleep(5)
    for (const resume of resumes) {
      resume()
      resume()
    }
    expect(() => control.suspend()).toThrow('unavailable')
    expect(f.unit.snapshot()).toMatchObject({ failed: false, inFlight: 0 })
  } finally {
    actual.resolve('cleanup')
    f.close()
  }
})

test('child callbacks cannot pause the stable Host and unsolicited controls are rejected', async () => {
  const f = pair()
  f.unit.register(
    'ordinary',
    procedure(z.undefined(), z.boolean(), (_input, context) => context.callerDeadline === undefined),
  )
  try {
    expect(await f.parent.call('ordinary', undefined, z.boolean())).toBe(true)
    await f.unit.notify('runtime.deadline.control', {
      id: crypto.randomUUID(),
      token: crypto.randomUUID(),
      phase: 'pause',
    })
    expect(f.parent.snapshot().failed).toBe(true)
  } finally {
    f.close()
  }
})

test('malformed trusted controls fail explicitly and do not retain caller bookkeeping', async () => {
  const f = pair(),
    entered = Promise.withResolvers<void>(),
    actual = Promise.withResolvers<string>()
  f.parent.register(
    'question',
    procedure(z.undefined(), z.string(), () => {
      entered.resolve()
      return actual.promise
    }),
  )
  const original = f.unit.callTracked('question', undefined, z.string())
  void original.result.catch(() => {})
  try {
    await entered.promise
    await f.parent.notify('runtime.deadline.control', { id: 'invalid', token: crypto.randomUUID(), phase: 'pause' })
    expect(await failure(original.settled)).toMatchObject({ code: 'IPC_PROTOCOL' })
    expect(f.unit.snapshot()).toMatchObject({ failed: true, inFlight: 0 })
  } finally {
    actual.resolve('cleanup')
    f.close()
  }
})

test('a cancelled child caller retains actual work and ignores a late deadline resumption', async () => {
  const f = pair(),
    entered = Promise.withResolvers<IpcProcedureContext>(),
    actual = Promise.withResolvers<string>(),
    controller = new AbortController()
  f.parent.register(
    'question',
    procedure(z.undefined(), z.string(), (_input, context) => {
      entered.resolve(context)
      return actual.promise
    }),
  )
  const original = f.unit.callTracked('question', undefined, z.string(), { signal: controller.signal })
  void original.result.catch(() => {})
  try {
    const context = await entered.promise
    if (!context.callerDeadline) throw new Error('Missing stable-parent authority')
    const resume = context.callerDeadline.suspend()
    controller.abort()
    expect(await failure(original.result)).toMatchObject({ code: 'IPC_CANCELLED' })
    expect(f.unit.snapshot().inFlight).toBe(1)
    resume()
    actual.resolve('actual cancellation receipt')
    expect(await original.settled).toBe('actual cancellation receipt')
    expect(f.unit.snapshot().inFlight).toBe(0)
  } finally {
    actual.resolve('cleanup')
    f.close()
  }
})
