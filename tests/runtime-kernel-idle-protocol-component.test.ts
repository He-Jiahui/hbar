import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { HbarError } from '@hbar/contracts'
import type { RuntimeOwner, RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import { SESSION_WAKE_CONTROL_METHODS, sessionWakeManifestSchema } from '@hbar/contracts/session-wake'
import { kernelPluginQuiescenceSchema } from '@hbar/kernel/runtime-idle'
import { KERNEL_RUNTIME_FINGERPRINT, RUNTIME_KERNEL_CONTROL_METHODS } from '@hbar/kernel/runtime-port'
import {
  Storage,
  STORAGE_SCHEMA_VERSION,
  createPathLayout,
  ensurePathLayout,
  storageRpcCallSchema,
} from '@hbar/storage'
import {
  ManagedProcess,
  RuntimeArtifactStore,
  RuntimeCoordinator,
  RUNTIME_COORDINATION_CONTROL_METHODS,
  registerRuntimeCoordinatorPort,
  runtimeIdleProbeSchema,
  procedure,
} from '@hbar/runtime'
import type { IpcPeer } from '@hbar/runtime'
import { RuntimeDriverRelay, type RuntimeDriverEndpoint } from '../apps/host/src/runtime-driver-relay'
import { DRIVER_RUNTIME_FINGERPRINT } from '../apps/host/src/runtime-driver-contract'
import { optionalBundleExternals } from '../scripts/bundle-externals'
import { createRuntimeProcessTreePort } from '@hbar/runtime-native'

// Actual ManagedProcess Kernel + Driver, actual Storage Worker and framed IPC.
// Parent plugin proof is a controlled stable-cache projection, NOT ProcessHostRuntime.
// No model run, listener, complete Host idle/restart or real30 is exercised.
async function component(
  operation: (f: {
    kernel: ManagedProcess
    activate(role?: 'default' | 'draining'): Promise<void>
    candidateIdle(): Promise<z.infer<typeof runtimeIdleProbeSchema>>
    setProof(value: z.infer<typeof kernelPluginQuiescenceSchema>): void
    counters(): { storage: number; proofs: number }
  }) => Promise<void>,
) {
  const root = resolve(await mkdtemp(join(tmpdir(), 'hbar-kernel-idle-protocol-')))
  if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-kernel-idle-protocol-'))
    throw new Error('Unowned Kernel idle fixture root')
  const layout = createPathLayout(join(root, 'data'), join(root, 'cache'), join(root, 'pointer.json'))
  const children: ManagedProcess[] = []
  let storage: Storage | undefined, primary: { error: unknown } | undefined
  let prepareShutdownProof: (() => void) | undefined
  try {
    await ensurePathLayout(layout)
    const actualStorage = new Storage(layout.database, layout)
    storage = actualStorage
    await actualStorage.call('ready')
    const coordinator = new RuntimeCoordinator({
      claim: (draft) => actualStorage.call('runtimeExecutionClaim', draft),
      release: (lease) => actualStorage.call('runtimeExecutionRelease', lease),
      revoke: async (owner, ids) => {
        await actualStorage.call('runtimeExecutionRevoke', owner, ids)
      },
    })
    const registry = new RuntimeArtifactStore(join(root, 'bundles'), process.cwd())
    const driverDescriptor: RuntimeUnitDescriptor = {
      id: 'driver.pi',
      kind: 'driver',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: DRIVER_RUNTIME_FINGERPRINT,
      storageSchema: STORAGE_SCHEMA_VERSION,
    }
    const driverArtifact = await registry.build({
      descriptor: driverDescriptor,
      entrypoint: 'apps/host/src/runtime-driver-process.ts',
    })
    const descriptor: RuntimeUnitDescriptor = {
      ...driverDescriptor,
      id: 'kernel',
      kind: 'kernel',
      dependencies: ['driver.pi'],
      contractFingerprint: KERNEL_RUNTIME_FINGERPRINT,
    }
    const artifact = await registry.build({
      descriptor,
      entrypoint: 'apps/host/src/runtime-kernel-process.ts',
      define: { HBAR_EXTERNAL_DRIVER: 'true' },
      external: optionalBundleExternals,
    })
    const base: RuntimeOwner = { unitId: 'base', generation: 1, incarnation: 'kernel-idle-component-parent' }
    let driverEndpoint: RuntimeDriverEndpoint | undefined
    const relay = new RuntimeDriverRelay({
      coordinator,
      resolve: () => {
        if (!driverEndpoint) throw new HbarError('RUNTIME_VERSION_UNAVAILABLE', 'Driver endpoint is not ready')
        return driverEndpoint
      },
    })
    const driver = new ManagedProcess({
      descriptor: driverDescriptor,
      artifactId: driverArtifact.id,
      modulePath: await registry.modulePath(driverArtifact.id),
      processTree: createRuntimeProcessTreePort(),
      generation: 1,
      parent: base,
      onPeer(peer, owner) {
        const version = { unitId: owner.unitId, generation: 1, artifactId: driverArtifact.id }
        driverEndpoint = { peer, owner, version }
        coordinator.register(owner, version, driverDescriptor)
        relay.attachDriver(peer)
      },
      async onExit(owner) {
        coordinator.ownerExited(owner)
        relay.driverExited(owner)
      },
    })
    children.push(driver)
    await driver.prepare()
    coordinator.activate(driver.owner())
    await driver.activate()
    let storageCalls = 0,
      proofReads = 0
    let kernelPeer: IpcPeer | undefined
    let proof = kernelPluginQuiescenceSchema.parse({ coverage: 'unsupported', queuedRuns: null, owners: [] })
    prepareShutdownProof = () => {
      proof = kernelPluginQuiescenceSchema.parse({ coverage: 'complete', queuedRuns: false, owners: [] })
    }
    const kernel = new ManagedProcess({
      descriptor,
      artifactId: artifact.id,
      modulePath: await registry.modulePath(artifact.id),
      processTree: createRuntimeProcessTreePort(),
      generation: 1,
      parent: base,
      configuration: {
        instanceId: 'kernel-idle-component',
        demo: true,
        noLocalExec: true,
        dataRoot: layout.dataRoot,
        cacheRoot: layout.cacheRoot,
        pointerFile: layout.pointerFile,
        settingsRoot: layout.settings,
        sessionsRoot: layout.sessions,
        skillsRoot: layout.globalSkills,
        identityRoot: layout.identityRoot,
      },
      controlMethods: [...RUNTIME_COORDINATION_CONTROL_METHODS, ...RUNTIME_KERNEL_CONTROL_METHODS],
      onPeer(peer, owner) {
        kernelPeer = peer
        coordinator.register(owner, { unitId: owner.unitId, generation: 1, artifactId: artifact.id }, descriptor)
        registerRuntimeCoordinatorPort(peer, coordinator, {
          owner,
          bindings: (caller) => {
            if (!driverEndpoint) throw new Error('Driver binding unavailable')
            return {
              kernel: { unitId: caller.unitId, generation: 1, artifactId: artifact.id },
              driver: driverEndpoint.version,
              plugins: [],
              hooks: [],
            }
          },
        })
        peer.register(
          'kernel.storage',
          procedure(storageRpcCallSchema, z.unknown(), (input) => {
            storageCalls++
            coordinator.assertCanWrite(owner, input.authority)
            return actualStorage.executeRpc(input)
          }),
        )
        peer.register(
          'kernel.secret.get',
          procedure(z.strictObject({ id: z.string() }), z.string().nullable(), async () => null),
        )
        peer.register(
          'kernel.plugin.quiescence',
          procedure(z.undefined(), kernelPluginQuiescenceSchema, () => {
            proofReads++
            return proof
          }),
        )
        relay.attachKernel(peer)
      },
      async onExit(owner) {
        coordinator.ownerExited(owner)
        relay.kernelExited(owner)
      },
    })
    children.push(kernel)
    await kernel.prepare()
    await operation({
      kernel,
      async activate(role = 'default') {
        coordinator.activate(kernel.owner())
        await kernel.activate(role)
      },
      candidateIdle() {
        if (!kernelPeer) throw new Error('Prepared Kernel peer unavailable')
        return kernelPeer.call('runtime.idle', undefined, runtimeIdleProbeSchema)
      },
      setProof(value) {
        proof = kernelPluginQuiescenceSchema.parse(value)
      },
      counters: () => ({ storage: storageCalls, proofs: proofReads }),
    })
  } catch (error) {
    primary = { error }
  }
  const errors: unknown[] = []
  // Only after operation assertions: this controlled cache transition is fixture
  // shutdown, not a business observation or actual Host plugin enumeration.
  if (!primary) prepareShutdownProof?.()
  for (const child of [...children].reverse()) {
    const owner = child.owner()
    let retirement: Awaited<ReturnType<ManagedProcess['retireIdle']>> | undefined
    try {
      if (!primary) {
        retirement = await child.retireIdle(owner)
        const receipt = child.retirementReceipt(owner)
        const state = child.snapshot()
        const evidence = { owner, retirement, receipt, phase: state.phase, pid: state.pid }
        if (
          retirement.status !== 'confirmed-physical-exit' ||
          !retirement.nativeJoined ||
          !retirement.disposalAcknowledged ||
          retirement.exitCode !== 0 ||
          !receipt ||
          !receipt.nativeJoined ||
          !receipt.onExitCompleted ||
          receipt.forced ||
          !receipt.cleanDisposeAck ||
          receipt.exitCode !== 0 ||
          retirement.owner.unitId !== owner.unitId ||
          retirement.owner.generation !== owner.generation ||
          retirement.owner.incarnation !== owner.incarnation ||
          receipt.owner.unitId !== owner.unitId ||
          receipt.owner.generation !== owner.generation ||
          receipt.owner.incarnation !== owner.incarnation ||
          receipt.childPid !== retirement.childPid ||
          state.phase !== 'disposed' ||
          state.pid !== null
        )
          throw new Error(`Managed component clean retirement unconfirmed: ${JSON.stringify(evidence)}`)
        process.stdout.write(
          JSON.stringify({ schema: 'hbar.kernel-idle-component-clean-retirement.v1', ...evidence }) + '\n',
        )
      }
    } catch (error) {
      errors.push(
        new Error(
          `Owned idle retirement failed: ${JSON.stringify({
            owner,
            retirement,
            receipt: child.retirementReceipt(owner),
          })}`,
          { cause: error },
        ),
      )
    } finally {
      // Protection only. A fallback dispose must never qualify as clean idle proof.
      try {
        await child.dispose()
      } catch (error) {
        errors.push(error)
      }
    }
  }
  try {
    await storage?.close()
  } catch (error) {
    errors.push(error)
  }
  if (!errors.length) {
    try {
      if (dirname(root) !== resolve(tmpdir()) || !basename(root).startsWith('hbar-kernel-idle-protocol-'))
        throw new Error('Owned fixture root changed')
      await rm(root, { recursive: true, force: true })
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length) {
    const all = primary ? [primary.error, ...errors] : errors
    throw new AggregateError(all, 'Kernel idle component cleanup failed', { cause: all[0] })
  }
  if (primary) throw primary.error
}

test('actual managed Kernel refuses candidate idle and merges cache-only plugin coverage after activation', async () => {
  await component(async (f) => {
    expect((await f.kernel.idleSnapshot()).eligible).toBe(false)
    expect((await f.candidateIdle()).eligible).toBe(false)
    expect(f.counters()).toEqual({ storage: 0, proofs: 0 })
    let rejection: unknown
    try {
      await f.kernel.call('kernel.sessionWakes.preview', undefined, sessionWakeManifestSchema)
    } catch (error) {
      rejection = error
    }
    expect(rejection).toMatchObject({ code: 'RUNTIME_RECOVERING' })
    await f.activate()
    const before = f.counters()
    const unsupported = await f.kernel.call('runtime.idle', undefined, runtimeIdleProbeSchema)
    expect(unsupported.eligible).toBe(false)
    expect(f.counters()).toEqual({ storage: before.storage, proofs: before.proofs + 1 })
    const owner = { unitId: 'plugin.fixture', generation: 1, incarnation: 'controlled-plugin-cache' }
    f.setProof({
      coverage: 'complete',
      queuedRuns: false,
      owners: [{ owner, eligible: false, requests: 1, runs: 0, resources: 0 }],
    })
    const busy = await f.kernel.call('runtime.idle', undefined, runtimeIdleProbeSchema)
    expect(busy.eligible).toBe(false)
    expect(busy.requests).toBe(1)
    f.setProof({ coverage: 'complete', queuedRuns: false, owners: [] })
    const settled = await f.kernel.call('runtime.idle', undefined, runtimeIdleProbeSchema)
    expect(settled).toMatchObject({ eligible: true, requests: 0, runs: 0, resources: 0 })
    expect(f.counters()).toEqual({ storage: before.storage, proofs: before.proofs + 3 })
  })
}, 20_000)

test('actual draining Kernel rejects all six declared session-wake protocols before business Storage', async () => {
  await component(async (f) => {
    await f.activate('draining')
    const before = f.counters()
    const ack = {
      token: 'controlled-token',
      manifest: { schemaVersion: 1, owner: f.kernel.owner(), revision: 0, entries: [] },
    }
    const entry = {
      sessionId: 'session',
      goalId: 'goal',
      intentId: 'intent',
      requestId: 'goal-intent',
      dueAt: 1,
      goalRevision: 0,
    }
    expect(SESSION_WAKE_CONTROL_METHODS).toHaveLength(6)
    for (const method of SESSION_WAKE_CONTROL_METHODS) {
      expect(RUNTIME_KERNEL_CONTROL_METHODS).toContain(method)
      let rejection: unknown
      try {
        await f.kernel.call(
          method,
          method.endsWith('.preview') ? undefined : method.endsWith('.deliver') ? { token: ack.token, entry } : { ack },
          z.unknown(),
        )
      } catch (error) {
        rejection = error
      }
      expect(rejection).toMatchObject({ code: 'RUNTIME_NOT_DEFAULT' })
    }
    expect(f.counters()).toEqual(before)
  })
}, 20_000)
