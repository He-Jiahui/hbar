import { afterEach, expect, test } from 'bun:test'
import { z } from 'zod'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Storage } from '@hbar/storage'
import { ManagedProcess, RuntimeArtifactStore, RuntimeCoordinator, registerRuntimeCoordinatorPort, RUNTIME_COORDINATION_CONTROL_METHODS, type IpcPeer } from '@hbar/runtime'
import { executionOwnershipSchema, runtimeResourceLeaseSchema, runtimeToolPermitSchema, type RuntimeOwner, type RuntimeUnitDescriptor } from '@hbar/contracts/runtime'

const resources: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of resources.splice(0)) await cleanup() })
const outcome = (promise: Promise<unknown>) => promise.catch((error: unknown) => error)
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-coordination-port-'))
  const storage = new Storage(join(root, 'state.sqlite'))
  await storage.call('ready')
  const workspace = await storage.call('createWorkspace', root, 'fixture')
  const session = await storage.call('createSession', workspace.id)
  const run = await storage.call('enqueue', session.id, 'request', { text: 'fixture', images: [] }, 'fixture')
  const coordinator = new RuntimeCoordinator({ claim: draft => storage.call('runtimeExecutionClaim', draft),
    release: lease => storage.call('runtimeExecutionRelease', lease), revoke: async (owner, ids) => { await storage.call('runtimeExecutionRevoke', owner, ids) } })
  const descriptor: RuntimeUnitDescriptor = { id: 'kernel', kind: 'kernel', isolation: 'process', dependencies: ['driver'], required: true,
    reloadable: true, contractFingerprint: 'a'.repeat(64), storageSchema: 24 }
  const driver: RuntimeOwner = { unitId: 'driver', generation: 1, incarnation: 'driver-coordination-test' }
  const driverVersion = { unitId: driver.unitId, generation: 1, artifactId: 'b'.repeat(64) }
  coordinator.register(driver, driverVersion, { ...descriptor, id: 'driver', kind: 'driver', dependencies: [] })
  coordinator.activate(driver)
  const registry = new RuntimeArtifactStore(join(root, 'bundles'), process.cwd())
  const artifact = await registry.build({ descriptor, entrypoint: 'tests/fixtures/runtime-coordinator-service.ts' })
  let peer!: IpcPeer
  const managed = new ManagedProcess({ descriptor, artifactId: artifact.id, modulePath: await registry.modulePath(artifact.id), generation: 1,
    parent: { unitId: 'base', generation: 1, incarnation: 'base-coordination-test' }, controlMethods: RUNTIME_COORDINATION_CONTROL_METHODS,
    onPeer: (current, owner) => {
      peer = current
      coordinator.register(owner, { unitId: owner.unitId, generation: owner.generation, artifactId: artifact.id }, descriptor)
      registerRuntimeCoordinatorPort(current, coordinator, { owner, bindings: caller => ({ kernel: { unitId: caller.unitId, generation: caller.generation, artifactId: artifact.id }, driver: driverVersion, plugins: [], hooks: [] }) })
    }, onExit: async owner => { coordinator.ownerExited(owner) },
  })
  resources.push(async () => { await managed.dispose(); await storage.close(); await rm(root, { recursive: true, force: true }) })
  await managed.prepare()
  return { storage, session, run, coordinator, managed, peer }
}

test('a real candidate cannot claim or acquire production resources; the activated caller receives only supervisor-selected bindings', async () => {
  const f = await fixture()
  expect(() => registerRuntimeCoordinatorPort(f.peer, f.coordinator, { owner: { ...f.managed.owner(), incarnation: 'foreign' },
    bindings: () => ({ kernel: { unitId: 'kernel', generation: 1, artifactId: 'a'.repeat(64) }, driver: { unitId: 'driver', generation: 1, artifactId: 'b'.repeat(64) }, plugins: [], hooks: [] }),
  })).toThrow('authenticated IPC incarnation')
  expect(await outcome(f.peer.call('fixture.claim', { sessionId: f.session.id, runId: f.run.id }, executionOwnershipSchema.nullable()))).toMatchObject({ code: 'RUNTIME_NOT_DEFAULT' })
  expect(await outcome(f.peer.call('fixture.resource', 'checkout:fixture', runtimeResourceLeaseSchema.nullable()))).toMatchObject({ code: 'RUNTIME_PREPARING' })
  await f.managed.activate()
  f.coordinator.activate(f.managed.owner())
  const lease = await f.managed.call('fixture.claim', { sessionId: f.session.id, runId: f.run.id }, executionOwnershipSchema.nullable())
  if (!lease) throw new Error('Expected durable ownership')
  expect(lease.owner).toEqual(f.managed.owner())
  expect(lease.versions.driver.unitId).toBe('driver')
  expect((await f.storage.call('run', f.run.id)).status).toBe('running')
  const forged = structuredClone(lease)
  forged.owner.incarnation = 'another-incarnation'
  expect(await outcome(f.managed.call('fixture.assert', forged, z.undefined()))).toMatchObject({ code: 'EXECUTION_OWNER_MISMATCH' })
  await f.storage.callOwned(lease, 'setRun', f.run.id, 'completed')
  await f.managed.call('fixture.release', lease, z.undefined())
  expect((await f.storage.call('runtimeExecutionRead', f.run.id))?.state).toBe('released')
})

test('physical permits and shared resource gates stay owned by the IPC incarnation and block early execution release', async () => {
  const f = await fixture()
  await f.managed.activate()
  f.coordinator.activate(f.managed.owner())
  const lease = await f.managed.call('fixture.claim', { sessionId: f.session.id, runId: f.run.id }, executionOwnershipSchema.nullable())
  if (!lease) throw new Error('Expected durable ownership')
  const permit = await f.managed.call('fixture.reserve', { execution: lease, callId: 'physical' }, runtimeToolPermitSchema)
  await f.storage.callOwned(lease, 'setRun', f.run.id, 'completed')
  await f.managed.call('fixture.release', lease, z.undefined())
  expect(f.coordinator.snapshot().sessions).toBe(1)
  const resource = await f.managed.call('fixture.resource', 'maintenance:database', runtimeResourceLeaseSchema.nullable())
  if (!resource) throw new Error('Expected a shared resource lease')
  expect(await f.managed.call('fixture.resource', 'maintenance:database', runtimeResourceLeaseSchema.nullable())).toBeNull()
  await f.managed.call('fixture.toolRelease', permit.id, z.undefined())
  await f.managed.call('fixture.resourceRelease', resource.id, z.undefined())
  const deadline = Date.now() + 2_000
  while (f.coordinator.snapshot().sessions && Date.now() < deadline) await Bun.sleep(10)
  expect(f.coordinator.snapshot()).toMatchObject({ sessions: 0, physicalTools: 0, resources: 0 })
})

test('handoff makes the old executor stop claiming and suppress idle continuations without interrupting its pinned Run', async () => {
  const f = await fixture()
  await f.managed.activate()
  f.coordinator.activate(f.managed.owner())
  const lease = await f.managed.call('fixture.claim', { sessionId: f.session.id, runId: f.run.id }, executionOwnershipSchema.nullable())
  if (!lease) throw new Error('Expected pinned ownership')
  const next: RuntimeOwner = { unitId: 'kernel', generation: 2, incarnation: 'next-kernel' }
  f.coordinator.register(next, { unitId: 'kernel', generation: 2, artifactId: 'c'.repeat(64) }, {
    id: 'kernel', kind: 'kernel', isolation: 'process', dependencies: ['driver'], required: true,
    reloadable: true, contractFingerprint: 'a'.repeat(64), storageSchema: 24,
  })
  f.coordinator.activate(next)
  f.coordinator.assertExecution(lease)
  expect(await f.managed.call('fixture.claim', { sessionId: 'another', runId: 'new' }, executionOwnershipSchema.nullable())).toBeNull()
  expect(await f.managed.call('fixture.canIdle', f.session.id, z.boolean())).toBe(false)
  expect(await f.managed.call('fixture.canIdle', 'another', z.boolean())).toBe(false)
  await f.storage.callOwned(lease, 'setRun', f.run.id, 'completed')
  await f.managed.call('fixture.release', lease, z.undefined())
  expect(f.managed.snapshot().phase).toBe('serving')
})

test('resource admission waits for a different runtime owner and respects its deadline and cancellation', async () => {
  const f = await fixture()
  await f.managed.activate()
  f.coordinator.activate(f.managed.owner())
  const other: RuntimeOwner = { unitId: 'plugin.checkout', generation: 1, incarnation: 'checkout-owner' }
  f.coordinator.register(other, { unitId: other.unitId, generation: 1, artifactId: 'd'.repeat(64) }, {
    id: other.unitId, kind: 'plugin', isolation: 'process', dependencies: [], required: true,
    reloadable: true, contractFingerprint: 'a'.repeat(64), storageSchema: 24,
  })
  f.coordinator.activate(other)
  const lock = f.coordinator.acquireResource(other, 'checkout:shared')
  if (!lock) throw new Error('Expected original checkout ownership')
  expect(await outcome(f.managed.call('fixture.lock', { key: lock.key, timeoutMs: 30, holdMs: 0 }, z.number()))).toMatchObject({ code: 'BUSY' })
  const controller = new AbortController()
  const cancelled = outcome(f.managed.call('fixture.lock', { key: lock.key, timeoutMs: 1_000, holdMs: 0 }, z.number(), { signal: controller.signal }))
  controller.abort()
  expect(await cancelled).toBeInstanceOf(Error)
  const waiting = f.managed.call('fixture.lock', { key: lock.key, timeoutMs: 1_000, holdMs: 10 }, z.number())
  await Bun.sleep(100)
  const releasedAt = Date.now()
  f.coordinator.releaseResource(other, lock.id)
  expect(await waiting).toBeGreaterThanOrEqual(releasedAt)
  expect(f.coordinator.snapshot().resources).toBe(0)
})
