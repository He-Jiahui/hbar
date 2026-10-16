import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { afterEach, expect, test } from 'bun:test'
import { z } from 'zod'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarError, providerSchema, runSchema, type WireNotification } from '@hbar/contracts'
import { runtimeWireNotificationBatchSchema, runtimeWireNotificationSchema } from '@hbar/contracts/runtime-notifications'
import { ManagedProcess, RuntimeArtifactStore, RuntimeCoordinator, RuntimeValuePort, registerRuntimeCoordinatorPort, RUNTIME_COORDINATION_CONTROL_METHODS, procedure, type IpcPeer } from '@hbar/runtime'
import { Storage, createPathLayout, ensurePathLayout, storageRpcCallSchema } from '@hbar/storage'
import { KERNEL_RUNTIME_FINGERPRINT, RUNTIME_KERNEL_CONTROL_METHODS, runtimeKernelStateSchema } from '@hbar/kernel/runtime-port'
import { callRuntimeApplication, RUNTIME_APPLICATION_CONTROLS } from '@hbar/kernel/runtime-application'
import { RuntimeDriverRelay, type RuntimeDriverEndpoint } from '../apps/host/src/runtime-driver-relay'
import { DRIVER_RUNTIME_FINGERPRINT } from '../apps/host/src/runtime-driver-contract'
import type { RuntimeOwner, RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import { optionalBundleExternals } from '../scripts/bundle-externals'
import { RuntimeKernelFacade, type RuntimeKernelEndpoint, type RuntimeKernelState } from '../apps/host/src/runtime-kernel-facade'
import { startServer } from '../apps/host/src/server'
import { HbarClient, createRunCommandClient } from '@hbar/client'

const resources: Array<() => Promise<void>> = []
afterEach(async () => { for (const cleanup of resources.splice(0)) await cleanup() })
const outcome = (promise: Promise<unknown>) => promise.catch((error: unknown) => error)

test('the real Kernel application waits for an admitted commit callback after logical cancellation', async () => {
  const f = await fixture()
  const { kernel, application } = await f.make()
  await f.activate(kernel)
  const entered = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const controller = new AbortController()
  let callbackFinished = false
  let physicallySettled = false
  const ticket = application.callTracked(
    'mode.commitExit',
    [
      f.session.id,
      async () => {
        entered.resolve()
        await release.promise
        callbackFinished = true
        return { modeEvent: null }
      },
    ],
    { signal: controller.signal },
  )
  void ticket.result.catch(() => undefined)
  const settled = outcome(ticket.settled).finally(() => {
    physicallySettled = true
  })
  try {
    await entered.promise
    controller.abort(new Error('Cancel admitted callback'))
    await expect(ticket.result).rejects.toMatchObject({ code: 'IPC_CANCELLED' })
    expect(callbackFinished).toBe(false)
    expect(physicallySettled).toBe(false)
    release.resolve()
    expect(await settled).toMatchObject({ code: 'PLAN_EXIT_INVALID' })
    expect(callbackFinished).toBe(true)
  } finally {
    release.resolve()
    await settled
  }
}, 120_000)
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
    reloadable: true, contractFingerprint: DRIVER_RUNTIME_FINGERPRINT, storageSchema: STORAGE_SCHEMA_VERSION }
  const driverArtifact = await registry.build({ descriptor: driverDescriptor, entrypoint: 'apps/host/src/runtime-driver-process.ts' })
  const descriptor: RuntimeUnitDescriptor = { ...driverDescriptor, id: 'kernel', kind: 'kernel', dependencies: ['driver.pi'], contractFingerprint: KERNEL_RUNTIME_FINGERPRINT }
  const artifact = await registry.build({ descriptor, entrypoint: 'apps/host/src/runtime-kernel-process.ts', define: { HBAR_EXTERNAL_DRIVER: 'true' }, external: optionalBundleExternals })
  const base: RuntimeOwner = { unitId: 'base', generation: 1, incarnation: 'kernel-process-test-base' }
  let driverEndpoint!: RuntimeDriverEndpoint
  let selected: ManagedProcess | null = null
  let facade: RuntimeKernelFacade | undefined
  let storageCalls = 0
  let physicalToolPeak = 0
  const relay = new RuntimeDriverRelay({ coordinator, resolve: version => {
    if (version && (version.artifactId !== driverArtifact.id || version.generation !== 1))
      throw new HbarError('RUNTIME_VERSION_UNAVAILABLE', 'Expected the captured driver generation')
    return driverEndpoint
  } })
  const children: ManagedProcess[] = []
  const channels: RuntimeValuePort[] = []
  const endpoints: RuntimeKernelEndpoint[] = []
  const notifications: Array<{ owner: RuntimeOwner; event: WireNotification }> = []
  resources.push(async () => { facade?.dispose(); facade = undefined; selected = null; for (const child of children.reverse()) await child.dispose(); for (const channel of channels) channel.dispose(); await storage.close(); await rm(root, { recursive: true, force: true }) })
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
        const receiveNotification = (event: WireNotification) => { notifications.push({ owner, event }); facade?.receive(owner, event) }
        peer.onEvent('kernel.notification', runtimeWireNotificationSchema, receiveNotification)
        peer.onEvent('kernel.notifications.batch', runtimeWireNotificationBatchSchema, events => { events.forEach(receiveNotification) })
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
  const expose = async (kernel: ManagedProcess, application: RuntimeValuePort) => {
    const state: RuntimeKernelState = await kernel.call('kernel.state', undefined, runtimeKernelStateSchema)
    const endpoint = { owner: kernel.owner(), process: kernel, application, state }
    endpoints.push(endpoint)
    const current = () => endpoints.find(value => value.owner.incarnation === selected?.owner().incarnation) ?? endpoint
    facade ??= new RuntimeKernelFacade({ layout, demo: true, storage, coordinator, instanceId: state.instanceId,
      current, endpoints: () => endpoints, maintain: async action => action(),
      resolve: (target, method, args) => {
        const id = typeof args[0] === 'string' ? args[0] : undefined
        const lease = id ? target === 'kernel' && method === 'cancel' ? coordinator.execution(id) :
          ['goal', 'plan', 'mode', 'budget', 'workflow', 'agent'].includes(target) ? coordinator.executionForSession(id) : null : null
        return endpoints.find(value => value.owner.incarnation === lease?.owner.incarnation) ?? current()
      },
    })
    return { facade, endpoint }
  }
  return { root, storage, session, coordinator, relay, driver, driverArtifact, artifact, make, activate, expose, notifications, storageCalls: () => storageCalls, toolPeak: () => physicalToolPeak }
}

test('the real Kernel candidate has no storage or recovery effects, and activated execution commits through owned IPC and a separate Pi process', async () => {
  const f = await fixture()
  const { kernel, peer } = await f.make()
  expect(f.driverArtifact.inputs).toContain('plugins/pi-driver/src/index.ts')
  expect(f.driverArtifact.inputs).toContain('plugins/pi-driver/src/provider-stream-diagnostics.ts')
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
  await until(async () => {
    const delivery = (await kernel.call('kernel.state', undefined, runtimeKernelStateSchema)).notificationDelivery
    return delivery?.queued === 0 && delivery.deliveredEvents > 0
  })
  const notificationDelivery = (await kernel.call('kernel.state', undefined, runtimeKernelStateSchema)).notificationDelivery
  expect(notificationDelivery).toMatchObject({ queued: 0, failure: null, overflowCount: 0 })
  expect(notificationDelivery?.acceptedEvents).toBe(notificationDelivery?.deliveredEvents)
  expect((notificationDelivery?.batchTransfers ?? 0) + (notificationDelivery?.singleTransfers ?? 0)).toBeGreaterThan(0)
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
  expect(await callRuntimeApplication(application, 'kernel', 'sessionSandboxProfileId', [f.session.id])).toBeString()
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

test('the real HTTP/WS listener uses a remote Kernel facade for bootstrap, commands, terminal events and stable connection identity', async () => {
  const f = await fixture()
  const { kernel, application } = await f.make()
  await f.activate(kernel)
  const { facade } = await f.expose(kernel, application)
  const host = await startServer(facade.api, { port: 0 })
  const client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
  try {
    await client.pair(host.pairing.code, 'remote Kernel facade')
    expect((await client.connect()).instanceId).toBe('stable-test-host')
    expect((await client.call('system.bootstrap', {})).models.some(model => model.id === 'fixture')).toBe(true)
    expect((await facade.api.plugins.graph()).nodes.length).toBeGreaterThan(0)
    expect(facade.api.plugins.list().length).toBeGreaterThan(0)
    const delivered: WireNotification[] = []
    const unsubscribe = client.onEvent(event => { delivered.push(event) })
    await client.follow(f.session.id, 0)
    const accepted = await createRunCommandClient(client).execute('run.submit', { sessionId: f.session.id, modelId: 'fixture',
      input: { text: '/tool get_goal {}', images: [] } }, { requestId: 'facade-request', idempotencyKey: 'facade-request' })
    await until(async () => (await f.storage.call('run', accepted.operationId)).status === 'completed')
    await until(() => delivered.some(event => event.method === 'session.event' && event.params.runId === accepted.operationId && event.params.type === 'run.settled'))
    expect(facade.api.streams.size).toBe(0)
    const settled = delivered.find(event => event.method === 'session.event' && event.params.runId === accepted.operationId && event.params.type === 'run.settled')!
    facade.replay(settled)
    facade.receive(kernel.owner(), { method: 'stream.update', params: { id: 'late-live-fragment', runId: accepted.operationId, sessionId: f.session.id,
      operation: 'reset', text: 'Queued before durable completion', thinking: '', textOffset: 0, thinkingOffset: 0, version: 1 } })
    expect(facade.api.streams.size).toBe(0)
    expect(client.connectionStatus()).toBe('connected')
    expect(host.info().instanceId).toBe(facade.api.instanceId)
    unsubscribe()
  } finally { client.disconnect(); await host.close() }
})
