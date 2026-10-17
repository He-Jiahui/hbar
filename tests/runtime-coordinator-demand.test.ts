import { expect, test } from 'bun:test'
import { HbarError } from '@hbar/contracts'
import type { RuntimeOwner, RuntimeUnitDescriptor, RuntimeVersion } from '@hbar/contracts/runtime'
import {
  IpcPeer,
  RuntimeCoordinator,
  RuntimeCoordinatorClient,
  registerRuntimeCoordinatorPort,
  type RuntimeCoordinatorPortOptions,
} from '@hbar/runtime'

type DependencyWrapper = NonNullable<RuntimeCoordinatorPortOptions['withClaimDependencies']>

function gate() {
  let release: () => void = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

function fixture(withClaimDependencies?: DependencyWrapper, beforePersist?: () => Promise<void>) {
  const kernel: RuntimeOwner = { unitId: 'kernel', generation: 1, incarnation: 'demand-kernel-1' }
  const driver: RuntimeOwner = { unitId: 'driver.pi', generation: 1, incarnation: 'demand-driver-1' }
  const version = (owner: RuntimeOwner): RuntimeVersion => ({
    unitId: owner.unitId,
    generation: owner.generation,
    artifactId: 'a'.repeat(64),
  })
  let persisted = 0,
    bindings = 0,
    admitted = 0,
    failed = 0
  const coordinator = new RuntimeCoordinator({
    async claim(lease) {
      persisted++
      await beforePersist?.()
      return lease
    },
    async release() {},
    async revoke() {},
  })
  const register = (owner: RuntimeOwner, kind: RuntimeUnitDescriptor['kind']) => {
    coordinator.register(owner, version(owner), {
      id: owner.unitId,
      kind,
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'b'.repeat(64),
      storageSchema: 24,
    })
    coordinator.activate(owner)
  }
  register(kernel, 'kernel')
  register(driver, 'driver')
  let child!: IpcPeer
  const parent = new IpcPeer({
    owner: { unitId: 'base', generation: 1, incarnation: 'demand-base' },
    remote: kernel,
    transport: {
      send: (frame) => {
        queueMicrotask(() => child.receive(structuredClone(frame)))
      },
    },
  })
  child = new IpcPeer({
    owner: kernel,
    remote: parent.owner,
    transport: {
      send: (frame) => {
        queueMicrotask(() => parent.receive(structuredClone(frame)))
      },
    },
  })
  const dispose = registerRuntimeCoordinatorPort(parent, coordinator, {
    owner: kernel,
    ...(withClaimDependencies ? { withClaimDependencies } : {}),
    bindings: () => {
      bindings++
      return { kernel: version(kernel), driver: version(driver), plugins: [], hooks: [] }
    },
    admitted: () => {
      admitted++
    },
    claimFailed: () => {
      failed++
    },
  })
  return {
    coordinator,
    kernel,
    register,
    client: new RuntimeCoordinatorClient(child),
    counts: () => ({ persisted, bindings, admitted, failed }),
    close() {
      dispose()
      parent.close()
      child.close()
    },
  }
}

test('dependency hold encloses bindings, durable claim and admitted notification', async () => {
  const entered = gate(),
    ready = gate(),
    finished = gate(),
    persistEntered = gate(),
    persistReady = gate()
  let held = false
  const wrapper: DependencyWrapper = async (_session, signal, operation) => {
    held = true
    entered.release()
    try {
      await ready.promise
      signal.throwIfAborted()
      return await operation()
    } finally {
      held = false
      finished.release()
    }
  }
  const f = fixture(wrapper, async () => {
    persistEntered.release()
    await persistReady.promise
  })
  try {
    const pending = f.client.claim('session', 'run')
    await entered.promise
    expect(held).toBe(true)
    expect(f.counts()).toEqual({ persisted: 0, bindings: 0, admitted: 0, failed: 0 })
    ready.release()
    await persistEntered.promise
    expect(held).toBe(true)
    expect(f.counts()).toEqual({ persisted: 1, bindings: 1, admitted: 0, failed: 0 })
    persistReady.release()
    expect((await pending)?.runId).toBe('run')
    await finished.promise
    expect(held).toBe(false)
    expect(f.counts()).toEqual({ persisted: 1, bindings: 1, admitted: 1, failed: 0 })
  } finally {
    ready.release()
    persistReady.release()
    f.close()
  }
})

test('two concurrent claims share the outer activation and preserve separate claims', async () => {
  const ready = gate(),
    bothEntered = gate()
  let activation: Promise<void> | undefined,
    launches = 0,
    waiters = 0
  const wrapper: DependencyWrapper = async (_session, _signal, operation) => {
    if (!activation) {
      launches++
      activation = ready.promise
    }
    if (++waiters === 2) bothEntered.release()
    await activation
    return operation()
  }
  const f = fixture(wrapper)
  try {
    const first = f.client.claim('session-1', 'run-1')
    const second = f.client.claim('session-2', 'run-2')
    await bothEntered.promise
    expect(launches).toBe(1)
    expect(f.counts().bindings).toBe(0)
    ready.release()
    expect((await first)?.runId).toBe('run-1')
    expect((await second)?.runId).toBe('run-2')
    expect(f.counts().persisted).toBe(2)
  } finally {
    ready.release()
    f.close()
  }
})

test('replacement during dependency wait makes the old caller draining without reading new bindings', async () => {
  const entered = gate(),
    ready = gate()
  const wrapper: DependencyWrapper = async (_session, _signal, operation) => {
    entered.release()
    await ready.promise
    return operation()
  }
  const f = fixture(wrapper)
  try {
    const pending = f.client.claim('session', 'run')
    await entered.promise
    f.register({ unitId: 'kernel', generation: 2, incarnation: 'demand-kernel-2' }, 'kernel')
    ready.release()
    expect(await pending).toBeNull()
    expect(f.counts()).toEqual({ persisted: 0, bindings: 0, admitted: 0, failed: 0 })
  } finally {
    ready.release()
    f.close()
  }
})

test('cancel while queued is rechecked even when the dependency wrapper ignores its signal', async () => {
  const entered = gate(),
    ready = gate(),
    finished = gate()
  const wrapper: DependencyWrapper = async (_session, _signal, operation) => {
    entered.release()
    try {
      await ready.promise
      return await operation()
    } finally {
      finished.release()
    }
  }
  const f = fixture(wrapper)
  const controller = new AbortController()
  try {
    const pending = f.client.claim('session', 'run', { signal: controller.signal }).catch((error: unknown) => error)
    await entered.promise
    controller.abort()
    await pending
    // Cancellation frames and the operation run on the real paired IPC queue.
    await new Promise<void>((resolve) => {
      queueMicrotask(resolve)
    })
    ready.release()
    await finished.promise
    expect(f.counts()).toEqual({ persisted: 0, bindings: 0, admitted: 0, failed: 0 })
  } finally {
    ready.release()
    f.close()
  }
})

test('revoked owner and dependency failure cannot reach bindings or persistence', async () => {
  const entered = gate(),
    ready = gate()
  const wrapper: DependencyWrapper = async (_session, _signal, operation) => {
    entered.release()
    await ready.promise
    return operation()
  }
  const f = fixture(wrapper)
  try {
    const pending = f.client.claim('session', 'run').catch((error: unknown) => error)
    await entered.promise
    await f.coordinator.revoke(f.kernel)
    ready.release()
    expect(await pending).toMatchObject({ code: 'EXECUTION_OWNER_REVOKED' })
    expect(f.counts()).toEqual({ persisted: 0, bindings: 0, admitted: 0, failed: 0 })
  } finally {
    ready.release()
    f.close()
  }
  const broken = fixture(async () => {
    throw new HbarError('RUNTIME_START_FAILED', 'Controlled dependency failure')
  })
  try {
    expect(await broken.client.claim('session', 'run').catch((error: unknown) => error)).toMatchObject({
      code: 'RUNTIME_START_FAILED',
    })
    expect(broken.counts()).toEqual({ persisted: 0, bindings: 0, admitted: 0, failed: 0 })
  } finally {
    broken.close()
  }
})

test('unconfigured coordinator port retains the existing direct claim behavior', async () => {
  const f = fixture()
  try {
    expect((await f.client.claim('session', 'run'))?.runId).toBe('run')
    expect(f.counts()).toEqual({ persisted: 1, bindings: 1, admitted: 1, failed: 0 })
  } finally {
    f.close()
  }
})
