import { afterEach, expect, test } from 'bun:test'
import { z } from 'zod'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError, providerSchema, runSchema, type WireNotification } from '@hbar/contracts'
import { runtimeWireNotificationSchema } from '@hbar/contracts/runtime-notifications'
import { ManagedProcess, RuntimeArtifactStore, RuntimeCoordinator, RuntimeValuePort, registerRuntimeCoordinatorPort, RUNTIME_COORDINATION_CONTROL_METHODS, procedure, type IpcPeer } from '@hbar/runtime'
import { Storage, createPathLayout, ensurePathLayout, storageRpcCallSchema } from '@hbar/storage'
import { KERNEL_RUNTIME_FINGERPRINT, RUNTIME_KERNEL_CONTROL_METHODS, runtimeKernelStateSchema } from '@hbar/kernel/runtime-port'
import { callRuntimeApplication, RUNTIME_APPLICATION_CONTROLS } from '@hbar/kernel/runtime-application'
import { RuntimeDriverRelay, type RuntimeDriverEndpoint } from '../apps/host/src/runtime-driver-relay'
import { DRIVER_RUNTIME_FINGERPRINT } from '../apps/host/src/runtime-driver-contract'
import type { RuntimeOwner, RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import { optionalBundleExternals } from '../scripts/bundle-externals'

const resources: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of resources.splice(0)) await cleanup() })
const outcome = (promise: Promise<unknown>) => promise.catch((error: unknown) => error)
async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 15_000
  while (!await check()) { if (Date.now() >= deadline) throw new Error('Isolated Kernel did not settle'); await Bun.sleep(10) }
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'hbar-kernel-process-'))
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  await ensurePathLayout(layout)
  const storage = new Storage(layout.database, layout)
  await storage.call('ready')
  await storage.call('saveProvider', providerSchema.parse({ id: 'fixture', name: 'Fixture', protocol: 'mock', model: 'fixture', baseUrl: 'http://127.0.0.1' }))
  const workspace = await storage.call('createWorkspace', root, 'fixture')
  const session = await storage.call('createSession', workspace.id)
  const coordinator = new RuntimeCoordinator({ claim: draft => storage.call('runtimeExecutionClaim', draft),
    release: lease => storage.call('runtimeExecutionRelease', lease), revoke: async (owner, ids) => { await storage.call('runtimeExecutionRevoke', owner, ids) } })
  const registry = new RuntimeArtifactStore(join(root, 'bundles'), process.cwd())
  const driverDescriptor: RuntimeUnitDescriptor = { id: 'driver.pi', kind: 'driver', isolation: 'process', dependencies: [], required: true,
    reloadable: true, contractFingerprint: DRIVER_RUNTIME_FINGERPRINT, storageSchema: 24 }
  const driverArtifact = await registry.build({ descriptor: driverDescriptor, entrypoint: 'apps/host/src/runtime-driver-process.ts' })
  const descriptor: RuntimeUnitDescriptor = { ...driverDescriptor, id: 'kernel', kind: 'kernel', dependencies: ['driver.pi'], contractFingerprint: KERNEL_RUNTIME_FINGERPRINT }
  const artifact = await registry.build({ descriptor, entrypoint: 'apps/host/src/runtime-kernel-process.ts', define: { HBAR_EXTERNAL_DRIVER: 'true' }, external: optionalBundleExternals })
  const base: RuntimeOwner = { unitId: 'base', generation: 1, incarnation: 'kernel-process-test-base' }
  let driverEndpoint!: RuntimeDriverEndpoint
  let selected: ManagedProcess | null = null
  let storageCalls = 0
  let physicalToolPeak = 0
  const relay = new RuntimeDriverRelay({ coordinator, resolve: version => {
    if (version && (version.artifactId !== driverArtifact.id || version.generation !== 1))
      throw new HbarError('RUNTIME_VERSION_UNAVAILABLE', 'Expected the captured driver generation')
    return driverEndpoint
  } })
  const children: ManagedProcess[] = []
  const channels: RuntimeValuePort[] = []
  const notifications: Array<{ owner: RuntimeOwner; event: WireNotification }> = []
  resources.push(async () => { selected = null; for (const child of children.reverse()) await child.dispose(); for (const channel of channels) channel.dispose(); await storage.close(); await rm(root, { recursive: true, force: true }) })
  const driver = new ManagedProcess({ descriptor: driverDescriptor, artifactId: driverArtifact.id, modulePath: await registry.modulePath(driverArtifact.id), generation: 1, parent: base,
    onPeer: (peer, owner) => {
      const version = { unitId: owner.unitId, generation: owner.generation, artifactId: driverArtifact.id }
      driverEndpoint = { peer, owner, version }
      coordinator.register(owner, version, driverDescriptor)
      relay.attachDriver(peer)
    }, onExit: async owner => { coordinator.ownerExited(owner); relay.driverExited(owner) },
  })
  children.push(driver)
  await driver.prepare()
  coordinator.activate(driver.owner())
  await driver.activate()
  let currentPeer!: IpcPeer
  const make = async (generation = 1) => {
    const kernel = new ManagedProcess({ descriptor, artifactId: artifact.id, modulePath: await registry.modulePath(artifact.id), generation, parent: base,
      configuration: { instanceId: 'stable-test-host', demo: true, dataRoot: layout.dataRoot, cacheRoot: layout.cacheRoot,
        pointerFile: layout.pointerFile, settingsRoot: layout.settings, sessionsRoot: layout.sessions, skillsRoot: layout.globalSkills, identityRoot: layout.identityRoot },
      controlMethods: [...RUNTIME_COORDINATION_CONTROL_METHODS, ...RUNTIME_KERNEL_CONTROL_METHODS],
      onPeer: (peer, owner) => {
        currentPeer = peer
        peer.onEvent('kernel.notification', runtimeWireNotificationSchema, event => { notifications.push({ owner, event }) })
        coordinator.register(owner, { unitId: owner.unitId, generation, artifactId: artifact.id }, descriptor)
        registerRuntimeCoordinatorPort(peer, coordinator, { owner,
          bindings: caller => ({ kernel: { unitId: caller.unitId, generation: caller.generation, artifactId: artifact.id }, driver: driverEndpoint.version, plugins: [], hooks: [] }),
          released: async lease => { await selected?.call('kernel.wake', { sessionId: lease.sessionId }, z.undefined()).catch(() => {}) },
        })
        peer.register('kernel.storage', procedure(storageRpcCallSchema, z.unknown(), async input => {
          storageCalls++
          if (input.authority && input.authority.owner.incarnation !== owner.incarnation)
            throw new HbarError('EXECUTION_OWNER_MISMATCH', 'Foreign storage authority')
          coordinator.assertCanWrite(owner, input.authority)
          physicalToolPeak = Math.max(physicalToolPeak, coordinator.snapshot().physicalTools)
          return storage.executeRpc(input)
        }))
        peer.register('kernel.secret.get', procedure(z.strictObject({ id: z.string() }), z.string().nullable(), async () => null))
        relay.attachKernel(peer)
      }, onFault: async owner => { await coordinator.revoke(owner) },
      onExit: async owner => { coordinator.ownerExited(owner); relay.kernelExited(owner) },
    })
    children.push(kernel)
    await kernel.prepare()
    const application = new RuntimeValuePort(currentPeer, { prefix: 'kernel.application', controlMethods: RUNTIME_APPLICATION_CONTROLS })
    channels.push(application)
    return { kernel, peer: currentPeer, application }
  }
  const activate = async (kernel: ManagedProcess) => {
    coordinator.activate(kernel.owner())
    await kernel.activate()
    selected = kernel
    await kernel.call('kernel.resume', undefined, z.undefined())
  }
  return { root, storage, session, coordinator, relay, driver, artifact, make, activate, notifications, storageCalls: () => storageCalls, toolPeak: () => physicalToolPeak }
}

test('the real Kernel candidate has no storage or recovery effects, and activated execution commits through owned IPC and a separate Pi process', async () => {
  const f = await fixture()
  const { kernel, peer } = await f.make()
  expect(f.artifact.inputs).toContain('packages/kernel/src/index.ts')
  expect(f.artifact.inputs.filter(input => input.startsWith('plugins/pi-driver/'))).toEqual([])
  expect(f.artifact.files.some(file => file.name.endsWith('.node'))).toBe(true)
  expect(f.storageCalls()).toBe(0)
  expect(await outcome(peer.call('kernel.state', undefined, runtimeKernelStateSchema))).toMatchObject({ code: 'RUNTIME_PREPARING' })
  await f.activate(kernel)
  expect((await kernel.call('kernel.state', undefined, runtimeKernelStateSchema)).instanceId).toBe('stable-test-host')
  const run = await kernel.call('kernel.submit', { sessionId: f.session.id, requestId: 'owned-kernel', input: { text: '/tool get_goal {}', images: [] }, modelId: 'fixture' }, runSchema)
  await until(async () => (await f.storage.call('run', run.id)).status === 'completed')
  await until(() => f.coordinator.snapshot().sessions === 0)
  expect((await f.storage.call('runtimeExecutionRead', run.id))?.lease.owner).toEqual(kernel.owner())
  expect((await f.storage.call('snapshot', f.session.id)).messages.map(message => message.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
  expect(f.toolPeak()).toBe(1)
  await until(() => f.notifications.some(({ event }) => event.method === 'session.event' && event.params.runId === run.id && event.params.type === 'run.settled'))
  const sequences = f.notifications.flatMap(({ event }) => event.method === 'session.event' && event.params.sessionId === f.session.id ? [event.params.seq] : [])
  expect(sequences).toEqual([...sequences].sort((left, right) => left - right))
  expect(f.notifications.filter(({ event }) => event.method === 'session.event' && event.params.runId === run.id).every(({ owner }) => owner.incarnation === kernel.owner().incarnation)).toBe(true)
  expect(f.relay.snapshot().invocations).toBe(0)
  expect(kernel.snapshot().pid).not.toBe(f.driver.snapshot().pid)
})

test('a second Kernel generation accepts new queued work while the Session remains pinned to the original executor until real settlement', async () => {
  const f = await fixture()
  const first = (await f.make()).kernel
  await f.activate(first)
  const run = await first.call('kernel.submit', { sessionId: f.session.id, requestId: 'old-kernel', input: { text: '/slow', images: [] }, modelId: 'fixture' }, runSchema)
  await until(() => f.coordinator.execution(run.id) !== null)
  const second = (await f.make(2)).kernel
  await f.activate(second)
  await first.drain()
  const queued = await second.call('kernel.submit', { sessionId: f.session.id, requestId: 'new-kernel', input: { text: 'next queued request', images: [] }, modelId: 'fixture' }, runSchema)
  expect(f.coordinator.execution(run.id)?.owner).toEqual(first.owner())
  expect((await f.storage.call('run', queued.id)).status).toBe('queued')
  await until(async () => (await f.storage.call('run', queued.id)).status === 'completed')
  expect((await f.storage.call('runtimeExecutionRead', run.id))?.lease.owner.generation).toBe(1)
  expect((await f.storage.call('runtimeExecutionRead', queued.id))?.lease.owner.generation).toBe(2)
  expect((await second.call('kernel.state', undefined, runtimeKernelStateSchema)).instanceId).toBe('stable-test-host')
  expect(f.driver.snapshot().phase).toBe('serving')
})

test('declared application methods and revision callbacks execute in the real Kernel while optional data, signals and bytes keep their contract', async () => {
  const f = await fixture()
  const { kernel, application } = await f.make()
  expect(await outcome(callRuntimeApplication(application, 'kernel', 'models', []))).toMatchObject({ code: 'RUNTIME_PREPARING' })
  expect(f.storageCalls()).toBe(0)
  await f.activate(kernel)
  expect((await callRuntimeApplication(application, 'kernel', 'models', [])).some(model => model.id === 'fixture')).toBe(true)
  expect(await outcome(application.call('directory.execute', ['workspace.get', { id: 'invalid-input-key' }]))).toMatchObject({ code: 'INVALID_INPUT' })
  expect(await outcome(callRuntimeApplication(application, 'directory', 'execute', ['session.list', { workspaceId: 'missing-workspace' }]))).toMatchObject({ code: 'WORKSPACE_NOT_FOUND' })
  const plan = await callRuntimeApplication(application, 'plan', 'update', [f.session.id, [{ step: 'Check owned application ports', status: 'in_progress' }]])
  let committed = 0
  await callRuntimeApplication(application, 'plan', 'withRevision', [f.session.id, plan.revision, async () => { committed++ }])
  expect(committed).toBe(1)
  expect(application.snapshot().callbacks).toBe(0)
  expect(await outcome(callRuntimeApplication(application, 'plan', 'withRevision', [f.session.id, plan.revision + 1, async () => { committed++ }]))).toMatchObject({ code: 'PLAN_REVISION_CONFLICT' })
  expect(committed).toBe(1)
  const artifact = await callRuntimeApplication(application, 'kernel', 'upload', ['plain.txt', 'text/plain', new TextEncoder().encode('plain bytes'), undefined])
  expect(artifact.size).toBe(11)
  const stopped = new AbortController(); stopped.abort()
  expect(await outcome(callRuntimeApplication(application, 'execution', 'exec', [f.root, 'must not execute', stopped.signal]))).toBeInstanceOf(Error)
  expect(await outcome(application.call('kernel.close', []))).toMatchObject({ code: 'RUNTIME_METHOD_UNAVAILABLE' })
  expect(kernel.snapshot().phase).toBe('serving')
})
