import { expect, test } from 'bun:test'
import { HbarError } from '@hbar/contracts'
import { IpcPeer, RuntimeValuePort, type IpcCallOptions } from '@hbar/runtime'
import { createPathLayout } from '@hbar/storage'
import { RuntimeControllerKernel } from '../apps/host/src/runtime-controller-kernel'
import { runtimeControllerScopeSchema } from '../apps/host/src/runtime-controller-contract'

const scope = runtimeControllerScopeSchema.parse({
  invocationId: 'kernel-idle-invocation',
  actorId: 'kernel-idle-actor',
  host: {
    version: 'fixture',
    protocol: 1,
    instanceId: 'kernel-idle',
    platform: 'win32',
    addresses: [],
    activeRuns: 0,
    demo: false,
  },
  kernel: {
    instanceId: 'kernel-idle',
    permission: 'allow',
    recovered: 0,
    driverIsolation: 'managed',
    active: [],
    tools: [],
    plugins: [],
    protectedRoots: [],
    idle: true,
    userInputs: [],
    protection: [],
    modes: [],
  },
  streams: [],
})

function createKernel(values: Pick<RuntimeValuePort, 'call'>) {
  return new RuntimeControllerKernel(
    values,
    createPathLayout(
      'D:/kernel-idle-fixture/data',
      'D:/kernel-idle-fixture/cache',
      'D:/kernel-idle-fixture/pointer.json',
    ),
    false,
    'kernel-idle',
  )
}

test('Controller Kernel rejects missing invocation before creating physical activity; idle reads are passive', async () => {
  let calls = 0
  const values: Pick<RuntimeValuePort, 'call'> = {
    call: () => {
      calls++
      return Promise.reject(new Error('Unexpected value call'))
    },
  }
  const kernel = createKernel(values)
  await expect(kernel.api.maintainChatDatabase(async () => undefined)).rejects.toMatchObject({
    code: 'CONTROLLER_INVOCATION_EXPIRED',
  })
  expect(kernel.idleSnapshot()).toEqual({ physicalCalls: 0 })
  expect(kernel.idleSnapshot()).toEqual({ physicalCalls: 0 })
  expect(calls).toBe(0)
})

// Controlled public constructor seam: these events model the trusted values-port settlement
// contract. This is not a native/process exit proof and does not change the 130s RPC budget.
const settlementEvents: NonNullable<Parameters<NonNullable<IpcCallOptions['onDispatchSettled']>>[0]>[] = [
  'reply',
  'not-dispatched',
]
for (const event of settlementEvents) {
  test(`Controller Kernel retains logically failed calls until ${event}, settling each call only once`, async () => {
    const settlements: NonNullable<IpcCallOptions['onDispatchSettled']>[] = []
    let calls = 0
    const values: Pick<RuntimeValuePort, 'call'> = {
      call: (_method, _args, options) => {
        calls++
        if (!options?.onDispatchSettled) throw new Error('Physical settlement observer missing')
        expect(options.timeoutMs).toBe(130_000)
        settlements.push(options.onDispatchSettled)
        return Promise.reject(new HbarError('IPC_CANCELLED', 'Controlled logical cancellation'))
      },
    }
    const kernel = createKernel(values)
    for (let index = 0; index < 2; index++) {
      await expect(
        kernel.pin(scope, () => kernel.api.maintainChatDatabase(async () => undefined)),
      ).rejects.toMatchObject({ code: 'IPC_CANCELLED' })
    }
    expect(kernel.idleSnapshot()).toEqual({ physicalCalls: 2 })
    expect(kernel.idleSnapshot()).toEqual({ physicalCalls: 2 })
    expect(calls).toBe(2)
    const first = settlements[0],
      second = settlements[1]
    if (!first || !second) throw new Error('Both calls must expose a settlement observer')
    first(event)
    expect(kernel.idleSnapshot()).toEqual({ physicalCalls: 1 })
    first(event)
    expect(kernel.idleSnapshot()).toEqual({ physicalCalls: 1 })
    second(event)
    second(event)
    expect(kernel.idleSnapshot()).toEqual({ physicalCalls: 0 })
    expect(calls).toBe(2)
  })
}

test('Controller Kernel counts a real paired-IPC value call until its reply', async () => {
  let child!: IpcPeer
  const parent = new IpcPeer({
    owner: { unitId: 'controller', generation: 1, incarnation: 'controller-kernel-idle' },
    remote: { unitId: 'host', generation: 1, incarnation: 'host-kernel-idle' },
    transport: {
      send: (frame) => {
        queueMicrotask(() => child.receive(structuredClone(frame)))
      },
    },
  })
  child = new IpcPeer({
    owner: parent.remote,
    remote: parent.owner,
    transport: {
      send: (frame) => {
        queueMicrotask(() => parent.receive(structuredClone(frame)))
      },
    },
  })
  const values = new RuntimeValuePort(parent, { prefix: 'controller.application' })
  const remote = new RuntimeValuePort(child, { prefix: 'controller.application' })
  const kernel = createKernel(values)
  let calls = 0
  remote.register('kernel.maintain', (args) => {
    calls++
    expect(args[0]).toBe(scope.invocationId)
    expect(kernel.idleSnapshot()).toEqual({ physicalCalls: 1 })
    return undefined
  })
  try {
    await kernel.pin(scope, () => kernel.api.maintainChatDatabase(async () => undefined))
    expect(calls).toBe(1)
    expect(kernel.idleSnapshot()).toEqual({ physicalCalls: 0 })
    expect(kernel.idleSnapshot()).toEqual({ physicalCalls: 0 })
    expect(calls).toBe(1)
  } finally {
    values.dispose()
    remote.dispose()
    parent.close()
    child.close()
  }
})
