import { expect, test } from 'bun:test'
import {
  IpcPeer,
  RuntimeCoordinator,
  RuntimeCoordinatorClient,
  registerRuntimeCoordinatorPort,
  type RuntimeCoordinatorPortOptions,
} from '@hbar/runtime'
import type { ExecutionOwnership, RuntimeOwner, RuntimeUnitDescriptor, RuntimeVersion } from '@hbar/contracts/runtime'

const hash = 'a'.repeat(64)
const parentOwner: RuntimeOwner = { unitId: 'host', generation: 1, incarnation: 'idle-check-parent' }
const kernelOwner: RuntimeOwner = { unitId: 'kernel', generation: 1, incarnation: 'idle-check-kernel' }
const driverOwner: RuntimeOwner = { unitId: 'driver', generation: 1, incarnation: 'idle-check-driver' }
const version = (owner: RuntimeOwner): RuntimeVersion => ({
  unitId: owner.unitId,
  generation: owner.generation,
  artifactId: hash,
})
function descriptor(owner: RuntimeOwner, kind: RuntimeUnitDescriptor['kind']): RuntimeUnitDescriptor {
  return {
    id: owner.unitId,
    kind,
    isolation: 'process',
    dependencies: [],
    required: true,
    reloadable: true,
    contractFingerprint: hash,
    storageSchema: 33,
  }
}
function fixture(options: Pick<RuntimeCoordinatorPortOptions, 'canAdmit' | 'canIdle'>, active = true) {
  const claims: ExecutionOwnership[] = []
  let bindingReads = 0
  let dependencyChecks = 0
  const coordinator = new RuntimeCoordinator({
    async claim(draft) {
      claims.push(draft)
      return draft
    },
    async release() {},
    async revoke() {},
  })
  coordinator.register(kernelOwner, version(kernelOwner), descriptor(kernelOwner, 'kernel'))
  coordinator.register(driverOwner, version(driverOwner), descriptor(driverOwner, 'driver'))
  coordinator.activate(driverOwner)
  if (active) coordinator.activate(kernelOwner)
  let child: IpcPeer | undefined
  const parent = new IpcPeer({
    owner: parentOwner,
    remote: kernelOwner,
    transport: { send: (frame) => child?.receive(frame) },
  })
  child = new IpcPeer({
    owner: kernelOwner,
    remote: parentOwner,
    transport: { send: (frame) => parent.receive(frame) },
  })
  const unregister = registerRuntimeCoordinatorPort(parent, coordinator, {
    owner: kernelOwner,
    ...options,
    async withClaimDependencies(_sessionId, signal, operation) {
      dependencyChecks++
      signal.throwIfAborted()
      return operation()
    },
    bindings: () => {
      bindingReads++
      return { kernel: version(kernelOwner), driver: version(driverOwner), plugins: [], hooks: [] }
    },
  })
  return {
    coordinator,
    claims,
    parent,
    client: new RuntimeCoordinatorClient(child),
    counts: () => ({ bindingReads, dependencyChecks }),
    close() {
      unregister()
      parent.close()
      child?.close()
    },
  }
}

test('legacy idle admission still follows canAdmit and cannot publish a refused claim', async () => {
  const f = fixture({ canAdmit: () => false })
  try {
    expect(await f.client.canIdle('session-a')).toBe(false)
    expect(await f.client.claim('session-a', 'original-run')).toBeNull()
    expect(f.claims).toEqual([])
    expect(f.counts()).toEqual({ bindingReads: 0, dependencyChecks: 1 })
    expect(f.coordinator.snapshot().sessions).toBe(0)
  } finally {
    f.close()
  }
}, 5_000)

test('a separate pure idle gate permits only its Session while Run claim keeps full admission', async () => {
  let open = true
  const f = fixture({ canAdmit: () => false, canIdle: (sessionId) => open && sessionId === 'session-a' })
  try {
    expect(await f.client.canIdle('session-a')).toBe(true)
    expect(await f.client.canIdle('session-b')).toBe(false)
    expect(f.counts()).toEqual({ bindingReads: 0, dependencyChecks: 0 })
    expect(await f.client.claim('session-a', 'original-run')).toBeNull()
    expect(f.claims).toEqual([])
    expect(f.coordinator.snapshot().sessions).toBe(0)
    expect(f.counts()).toEqual({ bindingReads: 0, dependencyChecks: 1 })
    open = false
    expect(await f.client.canIdle('session-a')).toBe(false)
  } finally {
    f.close()
  }
}, 5_000)

test('the explicit idle gate cannot authorize a candidate, a replaced owner or a foreign registration', async () => {
  const f = fixture({ canAdmit: () => false, canIdle: () => true }, false)
  try {
    expect(await f.client.canIdle('session-a')).toBe(false)
    f.coordinator.activate(kernelOwner)
    expect(await f.client.canIdle('session-a')).toBe(true)
    const next: RuntimeOwner = { unitId: 'kernel', generation: 2, incarnation: 'idle-check-next-kernel' }
    f.coordinator.register(next, version(next), descriptor(next, 'kernel'))
    f.coordinator.activate(next)
    expect(await f.client.canIdle('session-a')).toBe(false)
    expect(await f.client.claim('session-a', 'original-run')).toBeNull()
    expect(f.claims).toEqual([])
    expect(() =>
      registerRuntimeCoordinatorPort(f.parent, f.coordinator, {
        owner: next,
        bindings: () => ({ kernel: version(next), driver: version(driverOwner), plugins: [], hooks: [] }),
        canIdle: () => true,
      }),
    ).toThrow('authenticated IPC incarnation')
  } finally {
    f.close()
  }
}, 5_000)

test('idle readiness does not bypass retained or revoked execution reconciliation', async () => {
  const f = fixture({ canAdmit: () => true, canIdle: () => true })
  try {
    const execution = await f.client.claim('session-a', 'original-run')
    if (!execution) throw new Error('Expected the admitted positive control to claim its original Run')
    expect(execution.owner).toEqual(kernelOwner)
    expect(execution.runId).toBe('original-run')
    expect(f.claims).toHaveLength(1)
    expect(await f.client.canIdle('session-a')).toBe(false)
    const revoked = await f.coordinator.revoke(driverOwner)
    expect(revoked.map((lease) => lease.runId)).toEqual(['original-run'])
    expect(await f.client.canIdle('session-a')).toBe(false)
    expect(await f.client.canIdle('unrelated-session')).toBe(true)
    expect(f.claims).toHaveLength(1)
    expect(f.coordinator.snapshot().sessions).toBe(1)
  } finally {
    f.close()
  }
}, 5_000)
