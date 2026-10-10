import { expect, test } from 'bun:test'
import { z } from 'zod'
import { IpcPeer, RuntimeValuePort } from '@hbar/runtime'

function fixture() {
  let child!: IpcPeer
  const parent = new IpcPeer({ owner: { unitId: 'base', generation: 1, incarnation: 'value-base' }, remote: { unitId: 'kernel', generation: 1, incarnation: 'value-kernel' },
    transport: { send: frame => child.receive(JSON.parse(JSON.stringify(frame))) }, controlMethods: ['application.callback'] })
  child = new IpcPeer({ owner: parent.remote, remote: parent.owner,
    transport: { send: frame => parent.receive(JSON.parse(JSON.stringify(frame))) }, controlMethods: ['application.callback'] })
  let entered = 0
  const local = new RuntimeValuePort(parent, { prefix: 'application', controlMethods: ['approval.resolve'], callbackScope: action => { entered++; return action() } })
  const remote = new RuntimeValuePort(child, { prefix: 'application', controlMethods: ['approval.resolve'] })
  return { local, remote, entered: () => entered, close() { local.dispose(); remote.dispose(); parent.close(); child.close() } }
}

test('plain descriptions preserve optional arguments and bytes while named callbacks stay in their owner scope', async () => {
  const f = fixture()
  try {
    f.remote.register('transaction.commit', async args => {
      const [value, commit, bytes] = args
      const input = z.strictObject({ optional: z.undefined(), text: z.string() }).parse(value)
      if (typeof commit !== 'function' || !(bytes instanceof Uint8Array)) throw new Error('Expected local port adapters')
      const result: unknown = await Reflect.apply(commit, undefined, [input.text, bytes])
      return { result, optional: undefined, bytes }
    })
    expect(await f.local.call<{ result: string; optional: undefined; bytes: Uint8Array }>('transaction.commit', [{ text: '中😀', optional: undefined },
      (text: string, bytes: Uint8Array) => `${text}:${bytes.length}`, new Uint8Array([0, 255, 32])])).toEqual({ result: '中😀:3', optional: undefined, bytes: new Uint8Array([0, 255, 32]) })
    expect(f.entered()).toBe(1)
    expect(f.local.snapshot().callbacks).toBe(0)
    await expect(f.local.call('undeclared.private', [])).rejects.toMatchObject({ code: 'RUNTIME_METHOD_UNAVAILABLE' })
  } finally { f.close() }
})

test('cancellation is translated into the owner-local signal and closed callback references cannot perform later commits', async () => {
  const f = fixture()
  let late: (() => Promise<unknown>) | undefined
  let cancelled = false
  try {
    f.remote.register('wait', async ([signal, callback]) => {
      if (!(signal instanceof AbortSignal) || typeof callback !== 'function') throw new Error('Expected local ports')
      late = () => Reflect.apply(callback, undefined, []) as Promise<unknown>
      await new Promise<void>(resolve => signal.addEventListener('abort', () => { cancelled = true; resolve() }, { once: true }))
    })
    const controller = new AbortController()
    let committed = 0
    const call = f.local.call('wait', [controller.signal, () => { committed++ }]).catch((error: unknown) => error)
    while (!late) await Bun.sleep(1)
    controller.abort()
    expect(await call).toBeInstanceOf(Error)
    while (!cancelled) await Bun.sleep(1)
    expect(committed).toBe(0)
    expect(f.local.snapshot().callbacks).toBe(0)
    await expect(late!()).rejects.toBeInstanceOf(Error)
  } finally { f.close() }
})

test('class instances, schema objects, cycles, reserved fields and over-capacity callbacks fail before invocation', async () => {
  const f = fixture()
  let invoked = 0
  f.remote.register('probe', () => { invoked++ })
  try {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle
    for (const value of [new Date(), z.object({}), cycle, { constructor: 'injected' }])
      await expect(f.local.call('probe', [value])).rejects.toMatchObject({ code: 'IPC_SERIALIZATION' })
    await expect(f.local.call('probe', [Array.from({ length: 257 }, () => () => {})])).rejects.toMatchObject({ code: 'RUNTIME_CALLBACK_CAPACITY' })
    expect(f.local.snapshot().callbacks).toBe(0)
    expect(invoked).toBe(0)
    const duplicates = { value: 1 }
    f.remote.register('echo', args => args)
    expect(await f.local.call<{ value: number }[][]>('echo', [[duplicates, duplicates]])).toEqual([[duplicates, duplicates]])
  } finally { f.close() }
})

test('only declared application controls use the control port and an invalid returned class fails its request locally', async () => {
  const f = fixture()
  try {
    f.remote.register('approval.resolve', ([id]) => z.string().parse(id))
    expect(await f.local.call<string>('approval.resolve', ['owned-approval'])).toBe('owned-approval')
    f.remote.register('invalid.response', () => new Date())
    await expect(f.local.call('invalid.response', [])).rejects.toMatchObject({ code: 'IPC_SERIALIZATION' })
    expect(await f.local.call<string>('approval.resolve', ['next-approval'])).toBe('next-approval')
    expect(f.local.snapshot().callbacks).toBe(0)
  } finally { f.close() }
})
