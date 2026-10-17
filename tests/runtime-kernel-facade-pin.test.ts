import { expect, test } from 'bun:test'
import { IpcPeer, RuntimeCoordinator, RuntimeValuePort } from '@hbar/runtime'
import { runtimeGenerationSchema, type RuntimeOwner } from '@hbar/contracts/runtime'
import { runtimeKernelStateSchema } from '@hbar/kernel/runtime-port'
import { createPathLayout, StableStoragePort } from '@hbar/storage'
import { RuntimeKernelFacade, type RuntimeKernelEndpoint } from '../apps/host/src/runtime-kernel-facade'

function endpoint(generation: number) {
  const owner: RuntimeOwner = { unitId: 'kernel', generation, incarnation: `facade-kernel-${generation}` }
  let child!: IpcPeer
  const parent = new IpcPeer({
    owner: { unitId: 'base', generation: 1, incarnation: `facade-base-${generation}` },
    remote: owner,
    transport: {
      send: (frame) => {
        queueMicrotask(() => child.receive(structuredClone(frame)))
      },
    },
  })
  child = new IpcPeer({
    owner,
    remote: parent.owner,
    transport: {
      send: (frame) => {
        queueMicrotask(() => parent.receive(structuredClone(frame)))
      },
    },
  })
  const application = new RuntimeValuePort(parent, { prefix: 'kernel.application' })
  const remote = new RuntimeValuePort(child, { prefix: 'kernel.application' })
  let calls = 0
  remote.register('kernel.createWorkspace', async () => {
    calls++
    return { id: owner.incarnation, name: 'Fixture', path: 'D:/fixture', createdAt: 0 }
  })
  const value: RuntimeKernelEndpoint = {
    owner,
    application,
    process: {
      call: (method, input, schema, options) => parent.call(method, input, schema, options),
      snapshot: () =>
        runtimeGenerationSchema.parse({
          ...owner,
          artifactId: 'a'.repeat(64),
          role: 'default',
          phase: 'serving',
          pid: null,
          references: { runs: 0, resources: 0, requests: 0 },
          lastHeartbeatAt: null,
          failures: 0,
          nextAttemptAt: null,
          reasonCode: null,
        }),
    },
    state: runtimeKernelStateSchema.parse({
      instanceId: 'facade-fixture',
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
    }),
  }
  return {
    value,
    calls: () => calls,
    close() {
      application.dispose()
      remote.dispose()
      parent.close()
      child.close()
    },
  }
}

test('owner selected by async wrapper remains pinned after its first lookup stops returning a lease', async () => {
  const old = endpoint(1),
    current = endpoint(2)
  let facade!: RuntimeKernelFacade
  let wrapped = 0
  facade = new RuntimeKernelFacade({
    instanceId: 'facade-fixture',
    layout: createPathLayout('D:/fixture-data', 'D:/fixture-cache', 'D:/fixture-pointer.json'),
    demo: false,
    storage: new StableStoragePort(),
    coordinator: new RuntimeCoordinator({
      async claim(lease) {
        return lease
      },
      async release() {},
      async revoke() {},
    }),
    current: () => current.value,
    endpoints: () => [old.value, current.value],
    // Models the second Host route lookup after the execution was released: only the captured pin can retain A.
    resolve: (_target, _method, _args, captured) => captured ?? current.value,
    maintain: (action) => action(),
    withCall: async (_target, _method, _args, _captured, operation) => {
      wrapped++
      await Promise.resolve()
      return facade.pin(old.value, operation)
    },
  })
  try {
    expect((await facade.api.createWorkspace('D:/fixture')).id).toBe(old.value.owner.incarnation)
    expect(old.calls()).toBe(1)
    expect(current.calls()).toBe(0)
    expect(wrapped).toBe(1)
  } finally {
    facade.dispose()
    old.close()
    current.close()
  }
})

test('an original captured callback owner takes precedence over a later wrapper pin', async () => {
  const original = endpoint(1),
    later = endpoint(2)
  let facade!: RuntimeKernelFacade
  facade = new RuntimeKernelFacade({
    instanceId: 'facade-fixture',
    layout: createPathLayout('D:/fixture-data', 'D:/fixture-cache', 'D:/fixture-pointer.json'),
    demo: false,
    storage: new StableStoragePort(),
    coordinator: new RuntimeCoordinator({
      async claim(lease) {
        return lease
      },
      async release() {},
      async revoke() {},
    }),
    current: () => later.value,
    endpoints: () => [original.value, later.value],
    resolve: (_target, _method, _args, captured) => captured ?? later.value,
    maintain: (action) => action(),
    withCall: async (_target, _method, _args, captured, operation) => {
      expect(captured?.owner.incarnation).toBe(original.value.owner.incarnation)
      await Promise.resolve()
      return facade.pin(later.value, operation)
    },
  })
  try {
    const result = await facade.pin(original.value, () => facade.api.createWorkspace('D:/fixture'))
    expect(result.id).toBe(original.value.owner.incarnation)
    expect(original.calls()).toBe(1)
    expect(later.calls()).toBe(0)
  } finally {
    facade.dispose()
    original.close()
    later.close()
  }
})

test('sleeping facade reads retained metadata and opens a metadata-only scope without resolving or waking an endpoint', async () => {
  const metadata = runtimeKernelStateSchema.parse({
    instanceId: 'sleeping-metadata',
    permission: 'allow',
    recovered: 0,
    driverIsolation: 'managed',
    active: [],
    tools: ['retained-tool'],
    plugins: [],
    protectedRoots: [],
    idle: true,
    userInputs: [],
    protection: [],
    modes: [],
  })
  let currentCalls = 0,
    resolveCalls = 0,
    wrappedCalls = 0,
    metadataCalls = 0
  const facade = new RuntimeKernelFacade({
    instanceId: 'sleeping-metadata',
    layout: createPathLayout('D:/fixture-data', 'D:/fixture-cache', 'D:/fixture-pointer.json'),
    demo: false,
    storage: new StableStoragePort(),
    coordinator: new RuntimeCoordinator({
      async claim(lease) {
        return lease
      },
      async release() {},
      async revoke() {},
    }),
    endpoints: () => [],
    current: () => {
      currentCalls++
      throw new Error('Sleeping owner must not be selected')
    },
    resolve: () => {
      resolveCalls++
      throw new Error('Metadata must not resolve a business endpoint')
    },
    withCall: () => {
      wrappedCalls++
      throw new Error('Metadata must not acquire demand')
    },
    metadata: () => {
      metadataCalls++
      return metadata
    },
    maintain: (action) => action(),
  })
  try {
    expect(facade.api.permissionMode()).toBe('allow')
    expect(facade.api.tools.list()).toEqual([{ name: 'retained-tool' }])
    expect(facade.api.plugins.list()).toEqual(metadata.plugins)
    const scope = await facade.api.plugins.openScope('client', 'sleeping-connection')
    await scope.dispose()
    expect(metadataCalls).toBe(4)
    expect(currentCalls).toBe(0)
    expect(resolveCalls).toBe(0)
    expect(wrappedCalls).toBe(0)
  } finally {
    facade.dispose()
  }
})


/** Logical Facade/real IPC boundary only; this fixture does not model native recovery or a complete Host. */
function replacementEndpoint(incarnation: string) {
  const owner: RuntimeOwner = { unitId: 'kernel', generation: 7, incarnation }
  let phase: 'serving' | 'disposed' = 'serving'
  let child: IpcPeer | undefined
  const parent = new IpcPeer({
    owner: { unitId: 'base', generation: 1, incarnation: `base-${incarnation}` },
    remote: owner,
    transport: { send: (frame) => queueMicrotask(() => child?.receive(structuredClone(frame))) },
  })
  child = new IpcPeer({
    owner,
    remote: parent.owner,
    transport: { send: (frame) => queueMicrotask(() => parent.receive(structuredClone(frame))) },
  })
  const application = new RuntimeValuePort(parent, { prefix: 'kernel.application' })
  const remote = new RuntimeValuePort(child, { prefix: 'kernel.application' })
  let calls = 0
  remote.register('kernel.createWorkspace', async () => {
    calls++
    return { id: owner.incarnation, name: 'Replacement boundary', path: 'D:/fixture', createdAt: 0 }
  })
  const value: RuntimeKernelEndpoint = {
    owner,
    application,
    process: {
      call: (method, input, schema, options) => parent.call(method, input, schema, options),
      snapshot: () =>
        runtimeGenerationSchema.parse({
          ...owner,
          artifactId: 'b'.repeat(64),
          role: 'default',
          phase,
          pid: null,
          references: { runs: 0, resources: 0, requests: 0 },
          lastHeartbeatAt: null,
          failures: 0,
          nextAttemptAt: null,
          reasonCode: null,
        }),
    },
    state: runtimeKernelStateSchema.parse({
      instanceId: 'replacement-boundary',
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
    }),
  }
  return {
    value,
    calls: () => calls,
    close() {
      phase = 'disposed'
      application.dispose()
      remote.dispose()
      parent.close()
      child?.close()
    },
  }
}

for (const closePrevious of [true, false]) {
  test(`same-generation endpoint pin ${closePrevious ? 'rejects a closed prior incarnation without migration' : 'keeps a live prior incarnation after default replacement'}`, async () => {
    const previous = replacementEndpoint('replacement-old'),
      next = replacementEndpoint('replacement-new')
    let selected = previous.value
    let releaseResolver: () => void = () => {
      throw new Error('Resolver gate was not initialized')
    }
    let enteredResolver: () => void = () => {
      throw new Error('Resolver entry was not initialized')
    }
    const gate = new Promise<void>((resolve) => {
      releaseResolver = resolve
    })
    const entered = new Promise<void>((resolve) => {
      enteredResolver = resolve
    })
    let capturedAtResolver: RuntimeOwner | undefined
    let facade: RuntimeKernelFacade | undefined
    let primary: unknown
    let primaryFailed = false
    let settled: Promise<unknown> | undefined
    try {
      const instance = new RuntimeKernelFacade({
        instanceId: 'replacement-boundary',
        layout: createPathLayout('D:/fixture-data', 'D:/fixture-cache', 'D:/fixture-pointer.json'),
        demo: false,
        storage: new StableStoragePort(),
        coordinator: new RuntimeCoordinator({
          async claim(lease) {
            return lease
          },
          async release() {},
          async revoke() {},
        }),
        current: () => selected,
        endpoints: () => [previous.value, next.value],
        maintain: (action) => action(),
        resolve: async (_target, _method, _args, captured) => {
          capturedAtResolver = captured?.owner
          enteredResolver()
          await gate
          return captured ?? selected
        },
        withCall: async (_target, _method, _args, _captured, operation) => {
          const exact = selected
          await Promise.resolve()
          if (!facade) throw new Error('Facade was not initialized')
          return facade.pin(exact, operation)
        },
      })
      facade = instance
      const operation = instance.api.createWorkspace('D:/fixture')
      const outcome = operation.then(
        (value) => ({ kind: 'resolved' as const, value }),
        (error: unknown) => ({ kind: 'rejected' as const, error }),
      )
      settled = outcome
      await Promise.race([
        entered,
        outcome.then((result) => {
          if (result.kind === 'rejected') throw result.error
          throw new Error('Workspace call completed before the resolver gate')
        }),
      ])
      expect(capturedAtResolver).toEqual(previous.value.owner)
      expect(previous.value.owner.generation).toBe(next.value.owner.generation)
      expect(previous.value.owner.incarnation).not.toBe(next.value.owner.incarnation)
      expect(previous.value.process.snapshot().phase).toBe('serving')
      await instance.api.maintainChatDatabase(async () => {
        selected = next.value
        if (closePrevious) previous.close()
      })
      expect(selected.owner).toEqual(next.value.owner)
      expect(next.value.process.snapshot().phase).toBe('serving')
      expect(previous.value.process.snapshot().phase).toBe(closePrevious ? 'disposed' : 'serving')
      releaseResolver()
      const result = await outcome
      if (closePrevious) {
        expect(result.kind).toBe('rejected')
        if (result.kind !== 'rejected') throw new Error('Closed captured endpoint unexpectedly resolved')
        expect(result.error).toBeInstanceOf(Error)
        expect(result.error).toMatchObject({ code: 'RUNTIME_RECOVERING' })
        expect(previous.calls()).toBe(0)
      } else {
        expect(result.kind).toBe('resolved')
        if (result.kind !== 'resolved') throw result.error
        expect(result.value.id).toBe(previous.value.owner.incarnation)
        expect(previous.calls()).toBe(1)
      }
      expect(next.calls()).toBe(0)
    } catch (error) {
      primaryFailed = true
      primary = error
    }
    releaseResolver()
    if (settled) await settled
    const cleanupErrors: unknown[] = []
    for (const cleanup of [() => facade?.dispose(), () => previous.close(), () => next.close()]) {
      try {
        cleanup()
      } catch (error) {
        cleanupErrors.push(error)
      }
    }
    if (primaryFailed) {
      if (cleanupErrors.length)
        throw new AggregateError([primary, ...cleanupErrors], 'Facade boundary and cleanup failed', { cause: primary })
      throw primary
    }
    if (cleanupErrors.length)
      throw new AggregateError(cleanupErrors, 'Facade boundary cleanup failed', { cause: cleanupErrors[0] })
  }, 20_000)
}
