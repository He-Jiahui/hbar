import { expect, test } from 'bun:test'
import { z } from 'zod'
import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IpcPeer, RuntimeValuePort } from '@hbar/runtime'

function fixture(
  options: {
    peerTimeoutMs?: number
    callbackTimeoutMs?: number | (() => number)
    callbackSettlement?: 'physical'
  } = {},
) {
  const transport = new AsyncResource('isolated-runtime-transport')
  let child!: IpcPeer
  const peerOptions = options.peerTimeoutMs === undefined ? {} : { timeoutMs: options.peerTimeoutMs }
  const parent = new IpcPeer({
    ...peerOptions,
    owner: { unitId: 'base', generation: 1, incarnation: 'value-base' },
    remote: { unitId: 'kernel', generation: 1, incarnation: 'value-kernel' },
    transport: { send: (frame) => transport.runInAsyncScope(() => child.receive(JSON.parse(JSON.stringify(frame)))) },
    controlMethods: ['application.callback'],
  })
  child = new IpcPeer({
    ...peerOptions,
    owner: parent.remote,
    remote: parent.owner,
    transport: { send: (frame) => transport.runInAsyncScope(() => parent.receive(JSON.parse(JSON.stringify(frame)))) },
    controlMethods: ['application.callback'],
  })
  let entered = 0
  const local = new RuntimeValuePort(parent, {
    prefix: 'application',
    controlMethods: ['approval.resolve'],
    ...(options.callbackTimeoutMs === undefined ? {} : { callbackTimeoutMs: options.callbackTimeoutMs }),
    ...(options.callbackSettlement ? { callbackSettlement: options.callbackSettlement } : {}),
    callbackScope: (action) => {
      entered++
      return action()
    },
  })
  const remote = new RuntimeValuePort(child, {
    prefix: 'application',
    controlMethods: ['approval.resolve'],
    ...(options.callbackTimeoutMs === undefined ? {} : { callbackTimeoutMs: options.callbackTimeoutMs }),
    ...(options.callbackSettlement ? { callbackSettlement: options.callbackSettlement } : {}),
  })
  return {
    peer: parent,
    local,
    remote,
    entered: () => entered,
    close() {
      local.dispose()
      remote.dispose()
      parent.close()
      child.close()
      transport.emitDestroy()
    },
  }
}

test('named application ports transfer a full 10 MiB attachment without regex engine exhaustion', async () => {
  const f = fixture()
  try {
    f.remote.register('attachment.echo', (args) => args[0])
    const bytes = new Uint8Array(10_485_760)
    for (let index = 0; index < bytes.byteLength; index++) bytes[index] = index % 251
    const result = await f.local.call<Uint8Array>('attachment.echo', [bytes])
    expect(result).toBeInstanceOf(Uint8Array)
    expect(result.byteLength).toBe(bytes.byteLength)
    expect(Buffer.from(result).equals(Buffer.from(bytes))).toBe(true)
  } finally {
    f.close()
  }
})

test('tracked application calls preserve actual late writes after cancellation and close new callback admission', async () => {
  const f = fixture()
  const root = await mkdtemp(join(tmpdir(), 'hbar-tracked-value-'))
  const gate = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  let callbacks = 0,
    writes = 0,
    ownerCancelled = false,
    finished = false
  f.remote.register('write', async ([callback, signal]) => {
    if (typeof callback !== 'function' || !(signal instanceof AbortSignal)) throw new Error('Expected owned arguments')
    entered.resolve()
    await gate.promise
    ownerCancelled = signal.aborted
    let rejected = false
    try {
      await Reflect.apply(callback, undefined, [])
    } catch {
      rejected = true
    }
    await writeFile(join(root, 'result.txt'), 'late physical result: 你好')
    writes++
    return { text: 'late physical result: 你好', rejected }
  })
  const controller = new AbortController()
  try {
    const ticket = f.local.callTracked<{ text: string; rejected: boolean }>('write', [
      () => {
        callbacks++
      },
      controller.signal,
    ])
    void ticket.settled.then(() => {
      finished = true
    })
    await entered.promise
    controller.abort()
    await expect(ticket.result).rejects.toMatchObject({ code: 'IPC_CANCELLED' })
    expect(finished).toBe(false)
    expect(f.local.snapshot().callbacks).toBe(0)
    gate.resolve()
    expect(await ticket.settled).toEqual({ text: 'late physical result: 你好', rejected: true })
    expect(await readFile(join(root, 'result.txt'), 'utf8')).toBe('late physical result: 你好')
    expect(ownerCancelled).toBe(true)
    expect(callbacks).toBe(0)
    expect(writes).toBe(1)
  } finally {
    gate.resolve()
    f.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('owned physical callbacks preserve an already accepted write and its source scope through nested cancellation', async () => {
  const f = fixture({ callbackSettlement: 'physical' })
  const root = await mkdtemp(join(tmpdir(), 'hbar-tracked-callback-'))
  const scope = new AsyncLocalStorage<string>()
  const entered = Promise.withResolvers<void>(),
    gate = Promise.withResolvers<void>()
  let physicallyDone = false
  f.remote.register('commit', async ([callback]) => {
    if (typeof callback !== 'function') throw new Error('Expected owned callback')
    return Reflect.apply(callback, undefined, [() => 'nested callback must close'])
  })
  const controller = new AbortController()
  try {
    const ticket = scope.run('source-run', () =>
      f.local.callTracked<string>(
        'commit',
        [
          async (nested: unknown) => {
            if (typeof nested !== 'function') throw new Error('Expected nested callback')
            entered.resolve()
            await gate.promise
            expect(scope.getStore()).toBe('source-run')
            await expect(
              Promise.resolve().then(() => {
                const value: unknown = Reflect.apply(nested, undefined, [])
                return value
              }),
            ).rejects.toBeInstanceOf(Error)
            await writeFile(join(root, 'result.txt'), 'nested physical write')
            return 'nested actual reply'
          },
        ],
        { signal: controller.signal },
      ),
    )
    void ticket.settled.then(() => {
      physicallyDone = true
    })
    await entered.promise
    controller.abort()
    await expect(ticket.result).rejects.toMatchObject({ code: 'IPC_CANCELLED' })
    // Cancellation of the nested IPC crosses the isolated transport asynchronously.
    const deadline = Date.now() + 1_000
    while (f.remote.snapshot().callbacks && Date.now() < deadline) await Bun.sleep(1)
    expect(f.remote.snapshot().callbacks).toBe(0)
    expect(physicallyDone).toBe(false)
    gate.resolve()
    expect(await ticket.settled).toBe('nested actual reply')
    expect(await readFile(join(root, 'result.txt'), 'utf8')).toBe('nested physical write')
    expect(f.local.snapshot().callbacks).toBe(0)
    expect(f.remote.snapshot().callbacks).toBe(0)
  } finally {
    gate.resolve()
    f.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('base64 validation rejects malformed length, padding and alphabet before an application handler executes', async () => {
  const f = fixture()
  let calls = 0
  try {
    f.remote.register('attachment.check', () => {
      calls++
      return true
    })
    for (const data of [
      'A',
      'A===',
      'AA=A',
      'AAAA=',
      'AAA!',
      '=AAA',
      'AAA\n',
      '____',
      'A'.repeat(2_000_000) + 'AAA!',
    ]) {
      const result: unknown = await f.peer
        .call('application.invoke', { method: 'attachment.check', args: [{ kind: 'bytes', data }] }, z.unknown())
        .catch((error: unknown) => error)
      expect(result).toBeInstanceOf(Error)
    }
    expect(calls).toBe(0)
    for (const data of ['', 'AA==', 'AAA=', 'AAAA'])
      await f.peer.call(
        'application.invoke',
        { method: 'attachment.check', args: [{ kind: 'bytes', data }] },
        z.unknown(),
      )
    expect(calls).toBe(4)
  } finally {
    f.close()
  }
})

test('plain descriptions preserve optional arguments and bytes while named callbacks stay in their owner scope', async () => {
  const f = fixture()
  try {
    f.remote.register('transaction.commit', async (args) => {
      const [value, commit, bytes] = args
      const input = z.strictObject({ optional: z.undefined(), text: z.string() }).parse(value)
      if (typeof commit !== 'function' || !(bytes instanceof Uint8Array))
        throw new Error('Expected local port adapters')
      const result: unknown = await Reflect.apply(commit, undefined, [input.text, bytes])
      return { result, optional: undefined, bytes }
    })
    expect(
      await f.local.call<{ result: string; optional: undefined; bytes: Uint8Array }>('transaction.commit', [
        { text: '中😀', optional: undefined },
        (text: string, bytes: Uint8Array) => `${text}:${bytes.length}`,
        new Uint8Array([0, 255, 32]),
      ]),
    ).toEqual({ result: '中😀:3', optional: undefined, bytes: new Uint8Array([0, 255, 32]) })
    expect(f.entered()).toBe(1)
    expect(f.local.snapshot().callbacks).toBe(0)
    await expect(f.local.call('undeclared.private', [])).rejects.toMatchObject({ code: 'RUNTIME_METHOD_UNAVAILABLE' })
  } finally {
    f.close()
  }
})

test('cancellation is translated into the owner-local signal and closed callback references cannot perform later commits', async () => {
  const f = fixture()
  let late: (() => Promise<unknown>) | undefined
  let cancelled = false
  try {
    f.remote.register('wait', async ([signal, callback]) => {
      if (!(signal instanceof AbortSignal) || typeof callback !== 'function') throw new Error('Expected local ports')
      late = () => Reflect.apply(callback, undefined, []) as Promise<unknown>
      await new Promise<void>((resolve) =>
        signal.addEventListener(
          'abort',
          () => {
            cancelled = true
            resolve()
          },
          { once: true },
        ),
      )
    })
    const controller = new AbortController()
    let committed = 0
    const call = f.local
      .call('wait', [
        controller.signal,
        () => {
          committed++
        },
      ])
      .catch((error: unknown) => error)
    while (!late) await Bun.sleep(1)
    controller.abort()
    expect(await call).toBeInstanceOf(Error)
    while (!cancelled) await Bun.sleep(1)
    expect(committed).toBe(0)
    expect(f.local.snapshot().callbacks).toBe(0)
    await expect(late!()).rejects.toBeInstanceOf(Error)
  } finally {
    f.close()
  }
})

test('class instances, schema objects, cycles, reserved fields and over-capacity callbacks fail before invocation', async () => {
  const f = fixture()
  let invoked = 0
  f.remote.register('probe', () => {
    invoked++
  })
  try {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    for (const value of [new Date(), z.object({}), cycle, { constructor: 'injected' }])
      await expect(f.local.call('probe', [value])).rejects.toMatchObject({ code: 'IPC_SERIALIZATION' })
    await expect(f.local.call('probe', [Array.from({ length: 257 }, () => () => {})])).rejects.toMatchObject({
      code: 'RUNTIME_CALLBACK_CAPACITY',
    })
    expect(f.local.snapshot().callbacks).toBe(0)
    expect(invoked).toBe(0)
    const duplicates = { value: 1 }
    f.remote.register('echo', (args) => args)
    expect(await f.local.call<{ value: number }[][]>('echo', [[duplicates, duplicates]])).toEqual([
      [duplicates, duplicates],
    ])
  } finally {
    f.close()
  }
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
  } finally {
    f.close()
  }
})

test('a callback returning across an independent IPC dispatch context retains its original local execution authority', async () => {
  const f = fixture()
  const scope = new AsyncLocalStorage<{ owner: string; fence: number }>()
  try {
    f.remote.register('commit', async ([callback]) => {
      expect(scope.getStore()).toBeUndefined()
      if (typeof callback !== 'function') throw new Error('Expected a named callback')
      return Reflect.apply(callback, undefined, [])
    })
    expect(
      await scope.run({ owner: 'original-kernel', fence: 42 }, () =>
        f.local.call<{ owner: string; fence: number }>('commit', [() => scope.getStore()]),
      ),
    ).toEqual({ owner: 'original-kernel', fence: 42 })
    expect(scope.getStore()).toBeUndefined()
    expect(f.local.snapshot().callbacks).toBe(0)
  } finally {
    f.close()
  }
})

test('nested named callbacks and local cancellation preserve each owner scope and release every reference', async () => {
  const f = fixture(),
    scope = new AsyncLocalStorage<string>()
  let late: (() => Promise<unknown>) | undefined
  try {
    f.remote.register('guarded.commit', async ([host]) => {
      if (typeof host !== 'function') throw new Error('Expected the declared host callback')
      return scope.run('plugin-owner', () => {
        const result: unknown = Reflect.apply(host, undefined, [
          async () => scope.getStore(),
          new AbortController().signal,
        ])
        return result
      })
    })
    const result = await scope.run('kernel-owner', () =>
      f.local.call('guarded.commit', [
        async (commit: () => Promise<string>, signal: AbortSignal) => {
          expect(scope.getStore()).toBe('kernel-owner')
          expect(signal).toBeInstanceOf(AbortSignal)
          late = commit
          return { caller: scope.getStore(), committedBy: await commit() }
        },
      ]),
    )
    expect(result).toEqual({ caller: 'kernel-owner', committedBy: 'plugin-owner' })
    expect(f.local.snapshot().callbacks).toBe(0)
    expect(f.remote.snapshot().callbacks).toBe(0)
    await expect(late!()).rejects.toMatchObject({ code: 'RUNTIME_CALLBACK_EXPIRED' })
  } finally {
    f.close()
  }
})

test('a trusted callback budget overrides a shorter peer default across asynchronous IPC and releases callback references', async () => {
  const f = fixture({ peerTimeoutMs: 20, callbackTimeoutMs: 250 })
  try {
    f.remote.register('wait-for-callback', async ([callback]) => {
      if (typeof callback !== 'function') throw new Error('Expected a named callback')
      return Reflect.apply(callback, undefined, [])
    })
    expect(
      await f.local.call<string>(
        'wait-for-callback',
        [
          async () => {
            await Bun.sleep(80)
            return 'callback completed'
          },
        ],
        { timeoutMs: 500 },
      ),
    ).toBe('callback completed')
    expect(f.local.snapshot().callbacks).toBe(0)
    expect(f.remote.snapshot().callbacks).toBe(0)
  } finally {
    f.close()
  }
})

test('a dynamically selected callback deadline is captured with the original request before its handler runs', async () => {
  let configuredBudget = 200
  const f = fixture({ peerTimeoutMs: 500, callbackTimeoutMs: () => configuredBudget })
  try {
    f.remote.register('capture-callback-budget', async ([callback]) => {
      if (typeof callback !== 'function') throw new Error('Expected a named callback')
      configuredBudget = 1
      return Reflect.apply(callback, undefined, [])
    })
    expect(
      await f.local.call<string>(
        'capture-callback-budget',
        [
          async () => {
            await Bun.sleep(60)
            return 'captured budget'
          },
        ],
        { timeoutMs: 500 },
      ),
    ).toBe('captured budget')
    expect(f.remote.snapshot().callbacks).toBe(0)
  } finally {
    f.close()
  }
})

test('callback budget expiry bounds nested IPC work and dynamically resolved budgets are validated', async () => {
  let callbackTimeoutMs = 30
  const f = fixture({ peerTimeoutMs: 500, callbackTimeoutMs: () => callbackTimeoutMs })
  try {
    f.remote.register('slow-callback', async ([callback]) => {
      if (typeof callback !== 'function') throw new Error('Expected a named callback')
      return Reflect.apply(callback, undefined, [])
    })
    await expect(
      f.local.call(
        'slow-callback',
        [
          async () => {
            await Bun.sleep(100)
            return 'too late'
          },
        ],
        { timeoutMs: 500 },
      ),
    ).rejects.toMatchObject({ code: 'IPC_TIMEOUT' })
    expect(f.local.snapshot().callbacks).toBe(0)
    expect(f.remote.snapshot().callbacks).toBe(0)
    f.remote.register('invalid-timeout', async ([callback]) => {
      if (typeof callback !== 'function') throw new Error('Expected a named callback')
      return Reflect.apply(callback, undefined, [])
    })
    callbackTimeoutMs = Number.POSITIVE_INFINITY
    await expect(
      f.local.call('invalid-timeout', [async () => 'unreachable'], { timeoutMs: 500 }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(f.local.snapshot().callbacks).toBe(0)
    expect(f.remote.snapshot().callbacks).toBe(0)
  } finally {
    f.close()
  }
})
