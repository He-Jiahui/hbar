// Real bounded children; run only inside the Root-owned NativeJob lane.
import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { RuntimeUnitDescriptor } from '@hbar/contracts/runtime'
import {
  ManagedProcess,
  RuntimeManager,
  procedure,
  type RuntimeArtifact,
  type RuntimeArtifactSet,
  type RuntimeManagerOptions,
} from '@hbar/runtime'
import { createRuntimeProcessTreePort } from '@hbar/runtime-native'
import { STORAGE_SCHEMA_VERSION } from '@hbar/storage'
import { readRuntimePluginQuiescence } from '../apps/host/src/runtime-plugin-quiescence'

function gate() {
  let release: () => void = () => {
    throw new Error('Gate not initialized')
  }
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release: () => release() }
}

async function fixture(
  options: {
    beforeIdle?: RuntimeManagerOptions['beforeIdle']
    firstWorkflowProbe?: () => Promise<void>
  } = {},
) {
  const descriptor = (id: string, dependencies: string[] = []): RuntimeUnitDescriptor => ({
    id,
    dependencies,
    kind: 'plugin',
    isolation: 'process',
    required: true,
    reloadable: true,
    contractFingerprint: 'a'.repeat(64),
    storageSchema: STORAGE_SCHEMA_VERSION,
  })
  const descriptors = [
    descriptor('unstarted.storage'),
    descriptor('plugin.goal'),
    descriptor('plugin.workflow', ['unstarted.storage']),
  ]
  const artifacts: RuntimeArtifact[] = descriptors.map((value, index) => ({
    id: String(index + 1).repeat(64),
    unitId: value.id,
    descriptor: value,
    entry: 'fixture.ts',
    files: [],
    inputs: [],
    resources: [],
    resourceFiles: [],
  }))
  const set: RuntimeArtifactSet = { id: 'serving-pin-fixture', createdAt: 1, artifacts }
  const created: ManagedProcess[] = []
  const manager = new RuntimeManager({
    instanceId: 'serving-pin-parent',
    sweepMs: 60_000,
    artifacts: {
      artifactSet: (id) => {
        if (id !== set.id) throw new Error('Unknown test set')
        return set
      },
      preparedSets: () => [set.id],
    },
    references: () => ({ runs: 0, resources: 0, tools: 0 }),
    ...(options.beforeIdle ? { beforeIdle: options.beforeIdle } : {}),
    create(artifact, generation, changed) {
      const gated = artifact.unitId === 'plugin.workflow' && options.firstWorkflowProbe !== undefined
      const child = new ManagedProcess({
        descriptor: artifact.descriptor,
        artifactId: artifact.id,
        generation,
        modulePath: fileURLToPath(
          new URL(
            gated ? './fixtures/runtime-idle-probe-gate.ts' : './fixtures/runtime-idle-service.ts',
            import.meta.url,
          ),
        ),
        configuration: {},
        parent: { unitId: 'base', generation: 1, incarnation: 'serving-pin-parent' },
        startupMs: 5_000,
        shutdownMs: 2_000,
        processTree: createRuntimeProcessTreePort(),
        onState: changed,
        onExit: () => Promise.resolve(),
        onPeer(peer) {
          peer.register(
            'fixture.probeGate',
            procedure(z.undefined(), z.undefined(), () =>
              options.firstWorkflowProbe ? options.firstWorkflowProbe() : Promise.resolve(),
            ),
          )
        },
      })
      created.push(child)
      return child
    },
  })
  for (const value of descriptors) manager.register(value)
  // Only the two selected plugins start. Their registered dependency is deliberately unstarted:
  // pinning must not turn an existing serving proof into dependency demand/startup.
  const operation = manager.reload(set.id, ['plugin.goal', 'plugin.workflow'], true)
  try {
    await manager.reconcile()
    if (manager.getReload(operation.operationId).phase !== 'completed') await manager.reconcile()
    expect(manager.getReload(operation.operationId).phase).toBe('completed')
    for (const id of ['plugin.goal', 'plugin.workflow']) manager.setIdleEnabled(id, true)
  } catch (error) {
    try {
      const reload = manager.getReload(operation.operationId)
      const snapshot = manager.snapshot()
      // Failure-only pure metadata. No probe/RPC/subscription or success-path work.
      const records = [
        ...reload.units.slice(0, 4).map((unit) => ({ kind: 'reload', ...unit })),
        ...snapshot.units.slice(0, 4).map((unit) => ({
          kind: 'manager',
          unitId: unit.descriptor.id,
          idle: unit.idle,
          queuedArtifactId: unit.queuedArtifactId,
          generations: unit.generations.slice(0, 2),
          generationsTruncated: unit.generations.length > 2,
        })),
        ...created.slice(0, 4).map((child) => ({ kind: 'process', ...child.snapshot() })),
      ]
      console.error(
        JSON.stringify({
          type: 'serving-owner-pin-setup-failure',
          time: Date.now(),
          operationId: operation.operationId,
          phase: reload.phase,
          records,
          truncated: reload.units.length > 4 || snapshot.units.length > 4 || created.length > 4,
        }),
      )
    } catch {
      // Observation must not replace the original assertion or prevent physical cleanup.
    }
    const failures: unknown[] = [error]
    try {
      await manager.close()
    } catch (cleanup) {
      failures.push(cleanup)
    }
    if (failures.length > 1)
      throw new AggregateError(failures, 'Fixture setup and physical cleanup failed', { cause: error })
    throw error
  }
  const goal = manager.defaultOwner('plugin.goal')
  const workflow = manager.defaultOwner('plugin.workflow')
  const holds = () => manager.snapshot().units.map((unit) => unit.idle?.demandHolds)
  const proof = () =>
    readRuntimePluginQuiescence({
      unitIds: [goal.unitId, workflow.unitId],
      units: () => manager.snapshot().units,
      metadataOwner: () => null,
      retired: () => false,
      queuedRuns: () => false,
      probe: (owner) => {
        const child = created.find((value) => value.owner().unitId === owner.unitId)
        if (!child) return Promise.reject(new Error('Selected actual child missing'))
        return child.idleSnapshot()
      },
    })
  return { manager, goal, workflow, created, holds, proof, set }
}

test('serving proof pins no dependency, remains complete through competing retirement, and releases once', async () => {
  const f = await fixture()
  let pin: { release(): void } | null = null
  try {
    pin = f.manager.tryPinServingOwners([f.goal, f.workflow])
    if (!pin) throw new Error('Exact serving set was rejected')
    expect(f.holds()).toEqual([0, 1, 1])
    expect(f.created).toHaveLength(2)
    expect(() => f.manager.reload(f.set.id, ['plugin.workflow'])).toThrow('Demand admission pins')
    for (let index = 0; index < 30; index++)
      expect(await f.manager.retireIdle('plugin.workflow', f.workflow)).toBe('busy')
    const proof = await f.proof()
    expect(proof.coverage).toBe('complete')
    expect(proof.owners.map((value) => value.owner)).toEqual([f.goal, f.workflow])
    expect(
      proof.owners.every(
        (value) => value.eligible && value.requests === 0 && value.runs === 0 && value.resources === 0,
      ),
    ).toBe(true)
    pin.release()
    pin.release()
    expect(f.holds()).toEqual([0, 0, 0])
    expect(await f.manager.retireIdle('plugin.workflow', f.workflow)).toBe('sleeping')
    const receipt = f.manager.retirement(f.workflow)
    expect(receipt.status).toBe('retired')
    if (receipt.status !== 'retired') throw new Error('Actual native/cleanup receipt missing')
    expect(receipt.physical).toMatchObject({
      owner: f.workflow,
      nativeJoined: true,
      onExitCompleted: true,
      forced: false,
      exitCode: 0,
      cleanDisposeAck: true,
    })
    expect(f.created).toHaveLength(2)
    expect(f.manager.tryPinServingOwners([f.goal, f.workflow])).toBeNull()
    expect(f.holds()).toEqual([0, 0, 0])
  } finally {
    pin?.release()
    await f.manager.close()
  }
}, 20_000)

test('invalid exact owners and capacity reject the whole set without partially pinning another unit', async () => {
  const f = await fixture()
  const pins: Array<{ release(): void }> = []
  try {
    expect(f.manager.tryPinServingOwners([f.goal, f.goal])).toBeNull()
    expect(f.manager.tryPinServingOwners([f.workflow, { ...f.goal, generation: f.goal.generation + 1 }])).toBeNull()
    expect(f.manager.tryPinServingOwners([{ ...f.workflow, incarnation: 'another-incarnation' }])).toBeNull()
    expect(f.holds()).toEqual([0, 0, 0])
    for (let index = 0; index < 256; index++) {
      const pin = f.manager.tryPinServingOwners([f.goal])
      if (!pin) throw new Error('Bounded capacity was exhausted prematurely')
      pins.push(pin)
    }
    expect(f.holds()).toEqual([0, 256, 0])
    expect(f.manager.tryPinServingOwners([f.workflow, f.goal])).toBeNull()
    expect(f.holds()).toEqual([0, 256, 0])
    expect(f.created).toHaveLength(2)
  } finally {
    for (const pin of pins) {
      pin.release()
      pin.release()
    }
    expect(f.holds()).toEqual([0, 0, 0])
    await f.manager.close()
  }
  expect(f.manager.tryPinServingOwners([f.goal])).toBeNull()
}, 20_000)

test('a synchronous serving pin wins over an already-entered asynchronous preflight without issuing retirement', async () => {
  const entered = gate()
  const proceed = gate()
  const f = await fixture({
    firstWorkflowProbe: () => {
      entered.release()
      return proceed.promise
    },
  })
  let pin: { release(): void } | null = null
  const retirement = f.manager.retireIdle('plugin.workflow', f.workflow)
  // The rejection is observed immediately as well as by the awaited assertion/cleanup.
  void retirement.catch(() => {})
  try {
    await entered.promise
    pin = f.manager.tryPinServingOwners([f.goal, f.workflow])
    if (!pin) throw new Error('Preflight incorrectly changed active owner selection')
    expect(f.holds()).toEqual([0, 1, 1])
    proceed.release()
    expect(await retirement).toBe('busy')
    expect(f.manager.snapshot().units.find((unit) => unit.descriptor.id === f.workflow.unitId)?.idle?.phase).toBe(
      'active',
    )
    expect(f.manager.retirement(f.workflow).status).toBe('unverified')
    expect((await f.proof()).coverage).toBe('complete')
  } finally {
    proceed.release()
    await Promise.allSettled([retirement])
    pin?.release()
    await f.manager.close()
  }
}, 20_000)

test('an already-retiring owner rejects the full pin before any offer and remains unsupported until the known busy reply', async () => {
  const entered = gate()
  const proceed = gate()
  const f = await fixture({
    beforeIdle: async (owner) => {
      entered.release()
      await proceed.promise
      return { status: 'busy', owner }
    },
  })
  const retirement = f.manager.retireIdle('plugin.workflow', f.workflow)
  void retirement.catch(() => {})
  try {
    await entered.promise
    expect(f.manager.tryPinServingOwners([f.goal, f.workflow])).toBeNull()
    expect(f.holds()).toEqual([0, 0, 0])
    expect((await f.proof()).coverage).toBe('unsupported')
    proceed.release()
    expect(await retirement).toBe('busy')
    expect((await f.proof()).coverage).toBe('complete')
    expect(f.created).toHaveLength(2)
  } finally {
    proceed.release()
    await Promise.allSettled([retirement])
    await f.manager.close()
  }
}, 20_000)
test('UNKNOWN is not made active by a proof pin or a second retirement request', async () => {
  const f = await fixture({ beforeIdle: (owner) => Promise.resolve({ status: 'unknown', owner }) })
  try {
    expect(await f.manager.retireIdle('plugin.workflow', f.workflow)).toBe('unknown')
    expect(f.manager.tryPinServingOwners([f.goal, f.workflow])).toBeNull()
    expect(f.holds()).toEqual([0, 0, 0])
    expect(await f.manager.retireIdle('plugin.workflow', f.workflow)).toBe('busy')
    expect(f.manager.snapshot().units.find((unit) => unit.descriptor.id === f.workflow.unitId)?.idle?.phase).toBe(
      'unknown',
    )
    expect((await f.proof()).coverage).toBe('unsupported')
    expect(f.created).toHaveLength(2)
  } finally {
    await f.manager.close()
  }
}, 20_000)
