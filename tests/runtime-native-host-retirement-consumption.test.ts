import { expect, test } from 'bun:test'
import { z } from 'zod'
import { fileURLToPath } from 'node:url'
import {
  ManagedProcess,
  RuntimeManager,
  type RuntimeArtifact,
  type RuntimeArtifactSet,
  type RuntimePhysicalRetirementReceipt,
} from '@hbar/runtime'
import { createRuntimeProcessTreePort } from '@hbar/runtime-native'
import type { RuntimeOwner } from '@hbar/contracts/runtime'
import { HostRetirementConsumption } from '../apps/host/src/runtime-retirement-consumption'
function same(a: RuntimeOwner, b: RuntimeOwner) {
  return a.unitId === b.unitId && a.generation === b.generation && a.incarnation === b.incarnation
}
async function until(check: () => boolean) {
  const end = Date.now() + 10_000
  while (!check()) {
    if (Date.now() >= end) throw new Error('Actual native manager did not settle')
    await Bun.sleep(10)
  }
}
async function fixture(idle: boolean) {
  const consumer = new HostRetirementConsumption(),
    observed: RuntimePhysicalRetirementReceipt[] = []
  let allow = true,
    refs = 0
  const cleanups: RuntimeOwner[] = [],
    idleCopies: RuntimePhysicalRetirementReceipt[] = []
  let process: ManagedProcess | undefined
  const artifact: RuntimeArtifact = {
    id: 'a'.repeat(64),
    unitId: 'fixture',
    descriptor: {
      id: 'fixture',
      kind: 'plugin',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'b'.repeat(64),
      storageSchema: 23,
    },
    entry: 'fixture.ts',
    files: [],
    inputs: [],
    resources: [],
    resourceFiles: [],
  }
  const set: RuntimeArtifactSet = { id: 'fixture-set', createdAt: 1, artifacts: [artifact] }
  const replacement: RuntimeArtifactSet = {
    id: 'replacement-fixture-set',
    createdAt: 2,
    artifacts: [{ ...artifact, id: 'c'.repeat(64) }],
  }
  const manager = new RuntimeManager({
    instanceId: 'receipt-consumer',
    sweepMs: 60_000,
    artifacts: {
      artifactSet: (id) => {
        if (id === set.id) return set
        if (id === replacement.id) return replacement
        throw new Error('Unknown fixture set')
      },
      preparedSets: () => [set.id, replacement.id],
    },
    references: () => ({ runs: refs, resources: 0, tools: 0 }),
    canConsumeRetirement: () => allow,
    afterDispose: async (owner) => {
      cleanups.push({ ...owner })
    },
    afterIdle: (owner) => {
      const receipt = process?.retirementReceipt(owner)
      if (!receipt) throw new Error('ACK occurred before afterIdle read')
      idleCopies.push(receipt)
    },
    create(value, generation, changed) {
      const runtime = new ManagedProcess({
        descriptor: value.descriptor,
        artifactId: value.id,
        generation,
        modulePath: fileURLToPath(
          new URL(idle ? './fixtures/runtime-idle-service.ts' : './fixtures/runtime-service.ts', import.meta.url),
        ),
        parent: { unitId: 'base', generation: 1, incarnation: 'receipt-parent' },
        processTree: createRuntimeProcessTreePort(),
        onState: changed,
        startupMs: 5_000,
        shutdownMs: 5_000,
        heartbeatMs: 100,
        retryDelaysMs: [20, 20, 20],
        retrySlowMs: 20,
        jitter: 0,
        onFault: async () => {},
        onExit: async () => {},
        onPhysicalRetirement: (receipt) => {
          // No immediate consumption: Process.retireIdle and Manager still need this ledger.
          expect(runtime.retirementReceipt(receipt.owner)).toEqual(receipt)
          observed.push(structuredClone(receipt))
          consumer.observe(runtime, receipt.owner)
        },
      })
      process = runtime
      return runtime
    },
  })
  try {
    manager.register(artifact.descriptor)
    const operation = manager.reload(set.id, ['fixture'], true)
    await until(() => manager.getReload(operation.operationId).phase === 'completed')
    if (!process) throw new Error('Actual fixture process was not created')
    const runtime = process
    return {
      manager,
      runtime,
      consumer,
      observed,
      cleanups,
      idleCopies,
      allow: (value: boolean) => {
        allow = value
      },
      refs: (value: number) => {
        refs = value
      },
      reconcile: () => consumer.reconcile((generation, owner) => manager.consumeRetirementReceipt(generation, owner)),
      replace: () => manager.reload(replacement.id, ['fixture']),
    }
  } catch (initializationError: unknown) {
    try {
      await manager.close()
    } catch (cleanupError: unknown) {
      throw new AggregateError(
        [initializationError, cleanupError],
        'Retirement fixture initialization and cleanup failed',
        { cause: cleanupError },
      )
    }
    throw initializationError
  }
}

test('late old-incarnation native proof remains consumable after its recovered generation is replaced', async () => {
  const f = await fixture(false)
  try {
    const old = f.runtime.owner()
    f.allow(false)
    await expect(f.runtime.call('fixture.crash', undefined, z.undefined())).rejects.toMatchObject({
      code: 'IPC_DISCONNECTED',
    })
    await until(() => f.runtime.snapshot().phase === 'serving' && !same(f.runtime.owner(), old))
    expect(f.consumer.physicalReceipt(old)).toMatchObject({ owner: old, nativeJoined: true, onExitCompleted: true })
    const recovered = f.runtime.owner()
    const replacement = f.replace()
    await until(() => f.manager.getReload(replacement.operationId).phase === 'completed')
    expect(f.runtime.snapshot().phase).toBe('disposed')
    const current = f.manager.defaultOwner('fixture')
    expect(current.generation).toBeGreaterThan(recovered.generation)
    expect(f.consumer.physicalReceipt(old)).not.toBeNull()
    await f.reconcile()
    expect(f.runtime.retirementReceipt(old)).not.toBeNull()
    f.allow(true)
    f.refs(1)
    await f.reconcile()
    expect(f.runtime.retirementReceipt(old)).not.toBeNull()
    f.refs(0)
    await f.reconcile()
    expect(f.manager.retirement(old)).toMatchObject({ status: 'retired', owner: old, ownerCleanupCompleted: true })
    expect(f.runtime.retirementReceipt(old)).not.toBeNull()
    expect(f.manager.acknowledgeRetirement(old)).toBe(true)
    await f.reconcile()
    expect(f.runtime.retirementReceipt(old)).toBeNull()
    expect(f.consumer.physicalReceipt(old)).toBeNull()
    expect(f.cleanups.filter((owner) => same(owner, old))).toHaveLength(1)
    expect(f.manager.defaultOwner('fixture')).toEqual(current)
    expect(await f.manager.call('fixture', 'fixture.echo', 'replacement-still-serving', z.string())).toBe(
      'replacement-still-serving',
    )
  } finally {
    await f.manager.close()
  }
}, 30_000)

test('Host queue and Manager consume twenty actual recovered incarnations only after consumer/refs gates', async () => {
  const f = await fixture(false)
  const intendedOwners: RuntimeOwner[] = []
  try {
    for (let index = 0; index < 20; index++) {
      const old = f.runtime.owner()
      intendedOwners.push(old)
      f.allow(false)
      await expect(f.runtime.call('fixture.crash', undefined, z.undefined())).rejects.toMatchObject({
        code: 'IPC_DISCONNECTED',
      })
      await until(() => f.runtime.snapshot().phase === 'serving' && !same(f.runtime.owner(), old))
      await f.reconcile()
      expect(f.runtime.retirementReceipt(old)).not.toBeNull()
      f.allow(true)
      f.refs(1)
      await f.reconcile()
      expect(f.runtime.retirementReceipt(old)).not.toBeNull()
      f.refs(0)
      await f.reconcile()
      expect(f.runtime.retirementReceipt(old)).not.toBeNull()
      expect(f.manager.retirement(old)).toMatchObject({
        status: 'retired',
        owner: old,
        physical: { owner: old, nativeJoined: true, onExitCompleted: true },
        ownerCleanupCompleted: true,
      })
      expect(f.manager.acknowledgeRetirement(old)).toBe(true)
      await f.reconcile()
      expect(f.runtime.retirementReceipt(old)).toBeNull()
      expect(f.cleanups.filter((value) => same(value, old))).toHaveLength(1)
      expect(await f.runtime.call('fixture.echo', `business-${index}`, z.string())).toBe(`business-${index}`)
    }
    expect(intendedOwners).toHaveLength(20)
    const intendedReceipts = f.observed.filter((receipt) => intendedOwners.some((owner) => same(owner, receipt.owner)))
    expect(intendedReceipts).toHaveLength(20)
    for (const owner of intendedOwners)
      expect(intendedReceipts.find((receipt) => same(receipt.owner, owner))).toMatchObject({
        owner,
        exitCode: 23,
        nativeJoined: true,
        onExitCompleted: true,
      })
    expect(new Set(f.observed.map((receipt) => JSON.stringify(receipt.owner))).size).toBe(f.observed.length)
    // A separately observed heartbeat/transport retirement is also real ownership evidence.
    // Keep all twenty intentional crash receipts exact; never drop an additional receipt to fit that count.
    await f.reconcile()
    for (const receipt of f.observed.filter((value) => !intendedOwners.some((owner) => same(owner, value.owner)))) {
      console.error(JSON.stringify({ event: 'test.native_additional_physical_retirement', receipt }))
      expect(receipt).toMatchObject({ nativeJoined: true, onExitCompleted: true })
      expect(f.runtime.retirementReceipt(receipt.owner)).not.toBeNull()
      expect(f.manager.retirement(receipt.owner)).toMatchObject({
        status: 'retired',
        owner: receipt.owner,
        physical: receipt,
        ownerCleanupCompleted: true,
      })
      expect(f.manager.acknowledgeRetirement(receipt.owner)).toBe(true)
    }
    await f.reconcile()
    for (const receipt of f.observed) {
      expect(f.runtime.retirementReceipt(receipt.owner)).toBeNull()
      expect(f.cleanups.filter((owner) => same(owner, receipt.owner))).toHaveLength(1)
    }
    expect(f.consumer.snapshot()).toEqual([])
  } finally {
    await f.manager.close()
  }
}, 120_000)

test('clean idle consumes only after Process own reread and Manager afterIdle/cache, then queue drains metadata', async () => {
  const f = await fixture(true)
  try {
    const owner = f.runtime.owner()
    f.manager.setIdleEnabled('fixture', true)
    expect(await f.manager.retireIdle('fixture', owner)).toBe('sleeping')
    expect(f.observed).toHaveLength(1)
    expect(f.idleCopies).toHaveLength(1)
    expect(f.manager.retirement(owner)).toMatchObject({ status: 'retired', owner, ownerCleanupCompleted: true })
    expect(f.runtime.retirementReceipt(owner)).toBeNull()
    await f.reconcile()
    expect(f.consumer.snapshot()).toEqual([])
    expect(f.idleCopies[0]).toMatchObject({
      owner,
      nativeJoined: true,
      onExitCompleted: true,
      exitCode: 0,
      cleanDisposeAck: true,
      forced: false,
    })
  } finally {
    await f.manager.close()
  }
}, 30_000)

test('blocked external consumer keeps the clean idle ledger until a later exact Manager consumption checkpoint', async () => {
  const f = await fixture(true)
  try {
    const owner = f.runtime.owner()
    f.allow(false)
    f.manager.setIdleEnabled('fixture', true)
    expect(await f.manager.retireIdle('fixture', owner)).toBe('sleeping')
    expect(f.runtime.retirementReceipt(owner)).not.toBeNull()
    await f.reconcile()
    expect(f.consumer.snapshot()).toEqual([owner])
    expect(f.manager.acknowledgeRetirement(owner)).toBe(true)
    expect(f.manager.acknowledgeRetirement(owner)).toBe(false)
    expect(f.manager.retirement(owner)).toMatchObject({ status: 'retired', ownerCleanupCompleted: true })
    f.allow(true)
    await f.reconcile()
    expect(f.runtime.retirementReceipt(owner)).toBeNull()
    expect(f.consumer.snapshot()).toEqual([])
    expect(f.idleCopies).toHaveLength(1)
    expect(f.cleanups.filter((value) => same(value, owner))).toHaveLength(1)
    expect(f.manager.retirement(owner)).toMatchObject({ status: 'unverified' })
  } finally {
    await f.manager.close()
  }
}, 30_000)

test('ordinary recovered owner cleanup records demand.cleaned before consuming its native receipt', async () => {
  const f = await fixture(false)
  const hold = f.manager.holdDemand(['fixture'])
  try {
    const owners = await hold.ready,
      old = f.runtime.owner()
    expect(owners.some((value) => same(value, old))).toBe(true)
    await expect(f.runtime.call('fixture.crash', undefined, z.undefined())).rejects.toMatchObject({
      code: 'IPC_DISCONNECTED',
    })
    await until(() => f.runtime.snapshot().phase === 'serving' && !same(f.runtime.owner(), old))
    await f.reconcile()
    expect(f.runtime.retirementReceipt(old)).not.toBeNull()
    const proof = await f.manager.reconcileDemandHold(hold.attemptId)
    expect(proof).toMatchObject({ attemptId: hold.attemptId, canRelease: true })
    expect(f.manager.acknowledgeRetirement(old)).toBe(true)
    await f.reconcile()
    expect(f.runtime.retirementReceipt(old)).toBeNull()
    expect(await f.runtime.call('fixture.echo', 'new-owner-still-serving', z.string())).toBe('new-owner-still-serving')
  } finally {
    hold.release()
    await f.manager.close()
  }
}, 30_000)

test('successor actual IPC in flight does not retain the physically retired predecessor receipt', async () => {
  const f = await fixture(false)
  let inFlight: Promise<number> | undefined
  try {
    const old = f.runtime.owner()
    await expect(f.runtime.call('fixture.crash', undefined, z.undefined())).rejects.toMatchObject({
      code: 'IPC_DISCONNECTED',
    })
    await until(() => f.runtime.snapshot().phase === 'serving' && !same(f.runtime.owner(), old))
    const successor = f.runtime.owner()
    let settled = false
    inFlight = f.runtime.call('fixture.wait', 2_000, z.number())
    void inFlight.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      },
    )
    await until(() => f.runtime.snapshot().references.requests > 0)
    expect(settled).toBe(false)
    expect(f.runtime.retirementReceipt(old)).toMatchObject({ owner: old, nativeJoined: true, onExitCompleted: true })
    await f.reconcile()
    expect(settled).toBe(false)
    expect(f.runtime.snapshot().references.requests).toBeGreaterThan(0)
    expect(f.runtime.owner()).toEqual(successor)
    expect(f.runtime.retirementReceipt(old)).not.toBeNull()
    expect(f.manager.acknowledgeRetirement(old)).toBe(true)
    await f.reconcile()
    expect(settled).toBe(false)
    expect(f.runtime.snapshot().references.requests).toBeGreaterThan(0)
    expect(f.runtime.retirementReceipt(old)).toBeNull()
    expect(f.cleanups.filter((value) => same(value, old))).toHaveLength(1)
    expect(await inFlight).toBeGreaterThan(0)
    expect(await f.runtime.call('fixture.echo', 'successor-kept-serving', z.string())).toBe('successor-kept-serving')
  } finally {
    try {
      await inFlight
    } finally {
      await f.manager.close()
    }
  }
}, 30_000)

test('one failing consumer retains its actual native proof without starving another retired process', async () => {
  const first = await fixture(false)
  try {
    const second = await fixture(false)
    try {
      const firstOld = first.runtime.owner(),
        secondOld = second.runtime.owner()
      for (const [f, old] of [
        [first, firstOld],
        [second, secondOld],
      ] as const) {
        await expect(f.runtime.call('fixture.crash', undefined, z.undefined())).rejects.toMatchObject({
          code: 'IPC_DISCONNECTED',
        })
        await until(() => f.runtime.snapshot().phase === 'serving' && !same(f.runtime.owner(), old))
      }
      const combined = new HostRetirementConsumption()
      combined.observe(first.runtime, firstOld)
      combined.observe(second.runtime, secondOld)
      const failure = new Error('First exact receipt consumer is blocked')
      let reported: unknown
      try {
        await combined.reconcile((process, owner) => {
          if (same(owner, firstOld)) throw failure
          return second.manager.consumeRetirementReceipt(process, owner)
        })
      } catch (error: unknown) {
        reported = error
      }
      expect(reported).toBeInstanceOf(AggregateError)
      if (!(reported instanceof AggregateError)) throw new Error('Missing aggregate consumption failure')
      expect(reported.errors).toEqual([failure])
      expect(first.runtime.retirementReceipt(firstOld)).not.toBeNull()
      expect(second.runtime.retirementReceipt(secondOld)).not.toBeNull()
      expect(second.manager.retirement(secondOld)).toMatchObject({
        status: 'retired',
        owner: secondOld,
        ownerCleanupCompleted: true,
      })
      expect(second.manager.acknowledgeRetirement(secondOld)).toBe(true)
      // The blocked domain must not prevent another domain from finishing its exact ACK handoff.
      await expect(
        combined.reconcile((process, owner) => {
          if (same(owner, firstOld)) throw failure
          return second.manager.consumeRetirementReceipt(process, owner)
        }),
      ).rejects.toBeInstanceOf(AggregateError)
      expect(second.runtime.retirementReceipt(secondOld)).toBeNull()
      expect(combined.snapshot()).toEqual([firstOld])
      expect(second.cleanups.filter((value) => same(value, secondOld))).toHaveLength(1)
      expect(await second.runtime.call('fixture.echo', 'independent-domain', z.string())).toBe('independent-domain')
      await combined.reconcile((process, owner) => first.manager.consumeRetirementReceipt(process, owner))
      expect(first.runtime.retirementReceipt(firstOld)).not.toBeNull()
      expect(first.manager.retirement(firstOld)).toMatchObject({
        status: 'retired',
        owner: firstOld,
        ownerCleanupCompleted: true,
      })
      expect(first.manager.acknowledgeRetirement(firstOld)).toBe(true)
      await combined.reconcile((process, owner) => first.manager.consumeRetirementReceipt(process, owner))
      expect(first.runtime.retirementReceipt(firstOld)).toBeNull()
      expect(combined.snapshot()).toEqual([])
      await first.reconcile()
      await second.reconcile()
      expect(first.consumer.snapshot()).toEqual([])
      expect(second.consumer.snapshot()).toEqual([])
    } finally {
      await second.manager.close()
    }
  } finally {
    await first.manager.close()
  }
}, 60_000)
