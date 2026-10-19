import { expect, test } from 'bun:test'
import type { RuntimeOwner, RuntimeUnitSnapshot } from '@hbar/contracts/runtime'
import type { ManagedIdleSnapshot, RuntimeIdleIpc } from '@hbar/runtime'
import { readRuntimePluginQuiescence } from '../apps/host/src/runtime-plugin-quiescence'

const owner: RuntimeOwner = {
  unitId: 'plugin.goal',
  generation: 1,
  incarnation: 'cf0fa104-df1e-4996-9f5a-515ac9554c84',
}
const ipc: RuntimeIdleIpc = {
  inFlight: 0,
  waiting: 0,
  queued: 0,
  queuedBytes: 0,
  incoming: 0,
  incomingWaiting: 0,
  incomingQueued: 0,
  incomingBytes: 0,
  bufferedBytes: 0,
  failed: false,
}
function unit(current: RuntimeOwner, sleeping = false): RuntimeUnitSnapshot {
  return {
    descriptor: {
      id: current.unitId,
      kind: 'plugin',
      isolation: 'process',
      dependencies: [],
      required: true,
      reloadable: true,
      contractFingerprint: 'a'.repeat(64),
      storageSchema: 32,
    },
    generations: sleeping
      ? []
      : [
          {
            ...current,
            artifactId: 'a'.repeat(64),
            role: 'default',
            phase: 'serving',
            pid: 42,
            references: { runs: 0, resources: 0, requests: 0 },
            lastHeartbeatAt: 1,
            failures: 0,
            nextAttemptAt: null,
            reasonCode: null,
          },
        ],
    queuedArtifactId: null,
    idle: {
      enabled: true,
      checkpointPending: false,
      phase: sleeping ? 'sleeping' : 'active',
      demandHolds: 0,
      selectedArtifactId: 'a'.repeat(64),
    },
  }
}
function probe(current = owner, requests = 0): ManagedIdleSnapshot {
  return {
    owner: current,
    phase: 'serving',
    runs: 0,
    resources: 0,
    parent: ipc,
    child: { eligible: requests === 0, requests, runs: 0, resources: 0, ipc },
    eligible: requests === 0,
  }
}

test('repeated sleeping proofs require exact physical receipts and never probe a sleeping process', async () => {
  let probes = 0
  let receipts = 0
  const source = {
    unitIds: [owner.unitId],
    units: () => [unit(owner, true)],
    metadataOwner: () => owner,
    queuedRuns: () => false,
    retired: (candidate: RuntimeOwner) => {
      receipts++
      return candidate.incarnation === owner.incarnation
    },
    probe: async () => {
      probes++
      throw new Error('sleeping proof caused a wake')
    },
  }
  for (let index = 0; index < 100; index++) {
    const result = await readRuntimePluginQuiescence(source)
    expect(result.coverage).toBe('complete')
    expect(result.owners[0]?.owner).toEqual(owner)
  }
  expect(probes).toBe(0)
  expect(receipts).toBe(200)
})

test('metadata without an independently confirmed retirement remains unsupported', async () => {
  const result = await readRuntimePluginQuiescence({
    unitIds: [owner.unitId],
    units: () => [unit(owner, true)],
    metadataOwner: () => owner,
    queuedRuns: () => false,
    retired: () => false,
    probe: async () => probe(),
  })
  expect(result.coverage).toBe('unsupported')
  expect(result.owners).toEqual([])
})

test('a receipt for another unit cannot satisfy this sleeping plugin', async () => {
  const result = await readRuntimePluginQuiescence({
    unitIds: [owner.unitId],
    units: () => [unit(owner, true)],
    metadataOwner: () => ({ ...owner, unitId: 'plugin.plan' }),
    queuedRuns: () => false,
    retired: () => true,
    probe: async () => probe(),
  })
  expect(result.coverage).toBe('unsupported')
})

test('live physical requests and unknown queue facts remain visible to the Kernel consumer', async () => {
  const result = await readRuntimePluginQuiescence({
    unitIds: [owner.unitId],
    units: () => [unit(owner)],
    metadataOwner: () => null,
    queuedRuns: () => null,
    retired: () => false,
    probe: async () => probe(owner, 1),
  })
  expect(result.coverage).toBe('complete')
  expect(result.queuedRuns).toBeNull()
  expect(result.owners[0]?.eligible).toBe(false)
  expect(result.owners[0]?.requests).toBe(1)
})

test('an owner replacement during a probe invalidates the entire proof', async () => {
  let current = owner
  const result = await readRuntimePluginQuiescence({
    unitIds: [owner.unitId],
    units: () => [unit(current)],
    metadataOwner: () => null,
    queuedRuns: () => false,
    retired: () => false,
    probe: async () => {
      current = { ...owner, generation: 2, incarnation: '1075cb29-d8ea-4fe8-89f9-adc5bab3376e' }
      return probe(owner)
    },
  })
  expect(result.coverage).toBe('unsupported')
  expect(result.owners).toEqual([])
})

test('duplicate plugin coverage is rejected before issuing any probe', async () => {
  let probes = 0
  await expect(
    readRuntimePluginQuiescence({
      unitIds: [owner.unitId, owner.unitId],
      units: () => [unit(owner)],
      metadataOwner: () => null,
      queuedRuns: () => false,
      retired: () => false,
      probe: async () => {
        probes++
        return probe()
      },
    }),
  ).rejects.toMatchObject({ code: 'RUNTIME_CAPACITY' })
  expect(probes).toBe(0)
})
