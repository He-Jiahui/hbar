import { expect, test } from 'bun:test'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import { IpcPeer, procedure, RuntimeValuePort } from '@hbar/runtime'

function fixture() {
  let right: IpcPeer | undefined
  const left = new IpcPeer({
    owner: { unitId: 'kernel', generation: 1, incarnation: 'abort-reason-kernel' },
    remote: { unitId: 'plugin', generation: 1, incarnation: 'abort-reason-plugin' },
    transport: { send: (frame) => right?.receive(frame) },
    inFlight: 1,
    queued: 2,
  })
  right = new IpcPeer({
    owner: left.remote,
    remote: left.owner,
    transport: { send: (frame) => left.receive(frame) },
    inFlight: 1,
    queued: 2,
  })
  return {
    left,
    right,
    close: () => {
      left.close()
      right?.close()
    },
  }
}

async function until(read: () => boolean): Promise<void> {
  const deadline = performance.now() + 2_000
  while (!read()) {
    if (performance.now() >= deadline) throw new Error('Abort-reason fixture did not settle')
    await Bun.sleep(1)
  }
}

for (const reason of [
  new HbarError('USER_CANCELLED', 'User cancellation'),
  { owner: 'local-only' },
  'local-reason',
  null,
  false,
  0,
  '',
  undefined,
])
  test(`opt-in pre-abort preserves the exact reason and dispatches nothing: ${typeof reason}:${String(reason)}`, async () => {
    const f = fixture()
    let executions = 0
    f.right.register(
      'probe',
      procedure(z.undefined(), z.undefined(), () => {
        executions++
      }),
    )
    try {
      const signal = AbortSignal.abort(reason)
      const rejected = await f.left
        .call('probe', undefined, z.undefined(), {
          signal,
          preserveAbortReason: true,
        })
        .catch((error: unknown) => error)
      expect(rejected).toBe(signal.reason)
      expect(executions).toBe(0)
      expect(f.left.snapshot()).toMatchObject({ inFlight: 0, queued: 0 })
    } finally {
      f.close()
    }
  })

for (const source of ['nested-context', 'operation-options'] as const)
  test(`combined value-port signals preserve the ${source} reason and retain the physical slot until reply`, async () => {
    const f = fixture()
    const local = new RuntimeValuePort(f.left, { prefix: 'abort.fixture' })
    const remote = new RuntimeValuePort(f.right, { prefix: 'abort.fixture' })
    const entered = Promise.withResolvers<void>()
    const held = Promise.withResolvers<void>()
    let executions = 0
    remote.register('hold', async () => {
      executions++
      entered.resolve()
      await held.promise
      return 'late remote success'
    })
    const controller = new AbortController()
    const operationController = new AbortController()
    const reason = new HbarError('USER_CANCELLED', 'Original Run reason')
    try {
      const first = local
        .call('hold', [{ context: { signal: controller.signal } }], {
          signal: operationController.signal,
          preserveAbortReason: true,
        })
        .catch((error: unknown) => error)
      await entered.promise
      const queued = local.call('hold', [])
      if (source === 'nested-context') controller.abort(reason)
      else operationController.abort(reason)
      expect(await first).toBe(reason)
      expect(f.left.snapshot()).toMatchObject({ inFlight: 1, queued: 1 })
      expect(executions).toBe(1)
      held.resolve()
      expect(await queued).toBe('late remote success')
      await until(() => f.left.snapshot().inFlight === 0)
      expect(executions).toBe(2)
      expect(local.snapshot().callbacks).toBe(0)
    } finally {
      held.resolve()
      local.dispose()
      remote.dispose()
      f.close()
    }
  })

test('a queued opt-in abort preserves reason without starting the queued procedure', async () => {
  const f = fixture()
  const held = Promise.withResolvers<void>()
  let executions = 0
  f.right.register(
    'hold',
    procedure(z.undefined(), z.undefined(), async () => {
      executions++
      await held.promise
    }),
  )
  const controller = new AbortController()
  const reason = new HbarError('USER_CANCELLED', 'Queued Run cancellation')
  try {
    const first = f.left.call('hold', undefined, z.undefined())
    const second = f.left
      .call('hold', undefined, z.undefined(), {
        signal: controller.signal,
        preserveAbortReason: true,
      })
      .catch((error: unknown) => error)
    controller.abort(reason)
    expect(await second).toBe(reason)
    held.resolve()
    await first
    await until(() => f.left.snapshot().inFlight === 0)
    expect(executions).toBe(1)
    expect(f.left.snapshot().queued).toBe(0)
  } finally {
    held.resolve()
    f.close()
  }
})

test('abort provenance is captured before caller options can change', async () => {
  const f = fixture()
  const held = Promise.withResolvers<void>()
  const entered = Promise.withResolvers<void>()
  const original = new AbortController()
  const replacement = new AbortController()
  const reason = new HbarError('USER_CANCELLED', 'Captured original reason')
  f.right.register(
    'hold',
    procedure(z.undefined(), z.undefined(), async () => {
      entered.resolve()
      await held.promise
    }),
  )
  try {
    const options = { signal: original.signal, preserveAbortReason: true }
    const pending = f.left.call('hold', undefined, z.undefined(), options).catch((error: unknown) => error)
    await entered.promise
    options.signal = replacement.signal
    options.preserveAbortReason = false
    replacement.abort(new HbarError('USER_CANCELLED', 'Unrelated replacement reason'))
    original.abort(reason)
    expect(await pending).toBe(reason)
    expect(f.left.snapshot().inFlight).toBe(1)
    held.resolve()
    await until(() => f.left.snapshot().inFlight === 0)
  } finally {
    held.resolve()
    f.close()
  }
})

for (const code of ['IPC_CANCELLED', 'USER_CANCELLED', 'RESULT_UNKNOWN'])
  test(`remote ${code} failure stays independent of a later local abort`, async () => {
    const f = fixture()
    const controller = new AbortController()
    const reason = new HbarError('USER_CANCELLED', 'Unrelated later Run abort')
    f.right.register(
      'fail',
      procedure(z.undefined(), z.undefined(), () => {
        throw new HbarError(code, 'Remote failure')
      }),
    )
    try {
      const rejected = await f.left
        .call('fail', undefined, z.undefined(), {
          signal: controller.signal,
          preserveAbortReason: true,
        })
        .catch((error: unknown) => error)
      controller.abort(reason)
      expect(rejected).not.toBe(reason)
      expect(rejected).toMatchObject({ code, message: 'Remote failure' })
      expect(f.left.snapshot()).toMatchObject({ inFlight: 0, queued: 0 })
    } finally {
      f.close()
    }
  })

for (const source of ['timeout', 'owner-close'] as const)
  test(`opt-in ${source} stays distinct from later Run cancellation`, async () => {
    const f = fixture()
    const entered = Promise.withResolvers<void>()
    const held = Promise.withResolvers<void>()
    const controller = new AbortController()
    const reason = new HbarError('USER_CANCELLED', 'Later Run cancellation')
    f.right.register(
      'hold',
      procedure(z.undefined(), z.undefined(), async () => {
        entered.resolve()
        await held.promise
      }),
    )
    try {
      const pending = f.left
        .call('hold', undefined, z.undefined(), {
          signal: controller.signal,
          preserveAbortReason: true,
          timeoutMs: source === 'timeout' ? 20 : 2_000,
        })
        .catch((error: unknown) => error)
      await entered.promise
      if (source === 'owner-close') f.left.close()
      const rejected = await pending
      controller.abort(reason)
      expect(rejected).not.toBe(reason)
      expect(rejected).toMatchObject({ code: source === 'timeout' ? 'IPC_TIMEOUT' : 'IPC_DISCONNECTED' })
      if (source === 'timeout') expect(f.left.snapshot().inFlight).toBe(1)
      held.resolve()
      if (source === 'timeout') await until(() => f.left.snapshot().inFlight === 0)
    } finally {
      held.resolve()
      f.close()
    }
  })
