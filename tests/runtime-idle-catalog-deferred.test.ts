import { expect, test } from 'bun:test'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { IpcPeer, RuntimeCoordinator, RuntimeCoordinatorClient, registerRuntimeCoordinatorPort } from '@hbar/runtime'
import type { RuntimeOwner, RuntimeUnitDescriptor, RuntimeVersion } from '@hbar/contracts/runtime'
import { Storage, STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { DeferredRuntimeWakeups } from '../apps/host/src/process-host-runtime'

const hash = 'a'.repeat(64)
const host: RuntimeOwner = { unitId: 'host', generation: 1, incarnation: 'idle-deferred-parent' }
const kernel: RuntimeOwner = { unitId: 'kernel', generation: 1, incarnation: 'idle-deferred-kernel' }
const driver: RuntimeOwner = { unitId: 'driver', generation: 1, incarnation: 'idle-deferred-driver' }
function version(owner: RuntimeOwner): RuntimeVersion {
  return { unitId: owner.unitId, generation: owner.generation, artifactId: hash }
}
function descriptor(owner: RuntimeOwner, kind: RuntimeUnitDescriptor['kind']): RuntimeUnitDescriptor {
  return {
    id: owner.unitId,
    kind,
    isolation: 'process',
    dependencies: [],
    required: true,
    reloadable: true,
    contractFingerprint: hash,
    storageSchema: STORAGE_SCHEMA_VERSION,
  }
}
async function withFixture(
  operation: (fixture: Awaited<ReturnType<typeof createFixture>>) => Promise<void>,
): Promise<void> {
  const parent = await realpath(tmpdir())
  const root = await mkdtemp(join(parent, 'hbar-idle-deferred-port-'))
  const ownedRoot = await realpath(root)
  let fixture: Awaited<ReturnType<typeof createFixture>> | undefined
  let primary: { error: unknown } | undefined
  try {
    fixture = await createFixture(root)
    await operation(fixture)
  } catch (error) {
    primary = { error }
  }
  const errors: unknown[] = []
  try {
    fixture?.closePeers()
  } catch (error) {
    errors.push(error)
  }
  try {
    await fixture?.storage.close()
  } catch (error) {
    errors.push(error)
  }
  if (!primary && errors.length === 0 && fixture) {
    try {
      const current = await realpath(root)
      if (
        current !== ownedRoot ||
        dirname(current) !== parent ||
        !basename(current).startsWith('hbar-idle-deferred-port-')
      )
        throw new Error('Owned deferred IPC fixture path changed')
      await rm(current, { recursive: true, force: true })
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length) {
    const failures = primary ? [primary.error, ...errors] : errors
    throw new AggregateError(failures, 'Deferred IPC fixture cleanup failed', { cause: failures[0] })
  }
  if (primary) throw primary.error
}
async function createFixture(root: string) {
  const storage = new Storage(join(root, 'state.sqlite'))
  let parent: IpcPeer | undefined
  let child: IpcPeer | undefined
  let unregister: (() => void) | undefined
  const wakeups = new DeferredRuntimeWakeups(2)
  try {
    await storage.call('ready')
    const workspace = await storage.call('createWorkspace', root, 'fixture')
    const session = await storage.call('createSession', workspace.id)
    const run = await storage.call(
      'enqueue',
      session.id,
      'original-durable-continuation',
      { text: 'original bounded continuation', images: [], source: 'goal' },
      'local-fixture',
    )
    const coordinator = new RuntimeCoordinator({
      claim: (draft) => storage.call('runtimeExecutionClaim', draft),
      release: (lease) => storage.call('runtimeExecutionRelease', lease),
      revoke: async (owner, runIds) => {
        await storage.call('runtimeExecutionRevoke', owner, runIds)
      },
    })
    coordinator.register(kernel, version(kernel), descriptor(kernel, 'kernel'))
    coordinator.register(driver, version(driver), descriptor(driver, 'driver'))
    coordinator.activate(kernel)
    coordinator.activate(driver)
    let catalogPreparing = true
    let denied = 0
    const parentPeer = new IpcPeer({
      owner: host,
      remote: kernel,
      transport: { send: (frame) => child?.receive(frame) },
    })
    parent = parentPeer
    child = new IpcPeer({ owner: kernel, remote: host, transport: { send: (frame) => parentPeer.receive(frame) } })
    unregister = registerRuntimeCoordinatorPort(parentPeer, coordinator, {
      owner: kernel,
      canAdmit: () => !catalogPreparing,
      canIdle: () => !catalogPreparing,
      idleDenied: (sessionId) => {
        denied++
        wakeups.defer(sessionId)
      },
      bindings: () => ({ kernel: version(kernel), driver: version(driver), plugins: [], hooks: [] }),
    })
    return {
      storage,
      session,
      run,
      coordinator,
      wakeups,
      client: new RuntimeCoordinatorClient(child),
      publishCatalog: () => {
        catalogPreparing = false
      },
      prepareCatalog: () => {
        catalogPreparing = true
      },
      deniedCount: () => denied,
      closePeers() {
        unregister?.()
        wakeups.close()
        parentPeer.close()
        child?.close()
      },
    }
  } catch (error) {
    const errors: unknown[] = [error]
    try {
      unregister?.()
      wakeups.close()
      parent?.close()
      child?.close()
    } catch (cleanup) {
      errors.push(cleanup)
    }
    try {
      await storage.close()
    } catch (cleanup) {
      errors.push(cleanup)
    }
    if (errors.length > 1) throw new AggregateError(errors, 'Deferred fixture setup cleanup failed', { cause: error })
    throw error
  }
}

test('authenticated catalog-denied idle notices survive publication and claim only the original durable Run once', async () => {
  await withFixture(async (f) => {
    expect(await Promise.all(Array.from({ length: 30 }, () => f.client.canIdle(f.session.id)))).toEqual(
      Array.from({ length: 30 }, () => false),
    )
    expect(f.deniedCount()).toBe(30)
    expect(await f.client.claim(f.session.id, f.run.id)).toBeNull()
    expect((await f.storage.call('run', f.run.id)).status).toBe('queued')
    f.publishCatalog()
    const deliveries: string[] = []
    const deliver = async (sessionId: string): Promise<void> => {
      const execution = await f.client.claim(sessionId, f.run.id)
      if (!execution) throw new Error('Catalog-ready original Run was not claimed')
      deliveries.push(execution.runId)
      expect(execution.owner).toEqual(kernel)
    }
    await f.wakeups.flush(() => true, deliver)
    await f.wakeups.flush(() => true, deliver)
    expect(deliveries).toEqual([f.run.id])
    expect((await f.storage.call('runByRequest', f.session.id, f.run.requestId))?.run.id).toBe(f.run.id)
    expect((await f.storage.call('readSessionFacts', { sessionId: f.session.id })).runs.map((run) => run.id)).toEqual([
      f.run.id,
    ])
    expect((await f.storage.call('run', f.run.id)).status).toBe('running')
    const execution = f.coordinator.execution(f.run.id)
    if (!execution) throw new Error('Original release authority missing')
    await f.storage.callOwned(execution, 'setRun', f.run.id, 'completed')
    await f.client.release(execution)
    expect((await f.storage.call('runtimeExecutionRead', f.run.id))?.state).toBe('released')
  })
}, 20_000)

test('a denied idle notice from an old owner or a revoked Session cannot enter the trusted deferred channel', async () => {
  await withFixture(async (f) => {
    f.publishCatalog()
    const execution = await f.client.claim(f.session.id, f.run.id)
    if (!execution) throw new Error('Positive control lease missing')
    await f.coordinator.revoke(driver)
    f.prepareCatalog()
    expect(await f.client.canIdle(f.session.id)).toBe(false)
    expect(f.deniedCount()).toBe(0)
    const next: RuntimeOwner = { unitId: 'kernel', generation: 2, incarnation: 'idle-deferred-next' }
    f.coordinator.register(next, version(next), descriptor(next, 'kernel'))
    f.coordinator.activate(next)
    expect(await f.client.canIdle('unrelated-session')).toBe(false)
    expect(f.deniedCount()).toBe(0)
    const deliveries: string[] = []
    await f.wakeups.flush(
      () => true,
      (sessionId) => {
        deliveries.push(sessionId)
        return Promise.resolve()
      },
    )
    expect(deliveries).toEqual([])
    expect((await f.storage.call('runtimeExecutionRead', f.run.id))?.state).toBe('revoked')
    expect((await f.storage.call('readSessionFacts', { sessionId: f.session.id })).runs).toHaveLength(1)
  })
}, 20_000)
