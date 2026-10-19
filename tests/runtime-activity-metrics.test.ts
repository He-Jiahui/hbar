import { expect, test } from 'bun:test'
import type { RuntimeSnapshot } from '@hbar/contracts/runtime'
import { PerformanceCollector } from '@hbar/metrics'
import { readRuntimeActivity } from '../apps/host/src/runtime-activity-metrics'
import { createHostPerformanceProvider } from '../apps/host/src/performance-provider'

const sleeping: RuntimeSnapshot = {
  revision: 1,
  instanceId: 'd921ef9b-25e2-480b-824e-528f4f95ec21',
  ready: true,
  units: [],
  preparedArtifactSets: [],
}

test('repeated managed metrics reads never invoke Storage admission', async () => {
  let databaseCalls = 0
  let samples = 0
  const source = {
    activeRuns: () => 0,
    readQueuedSessionCount: async () => {
      databaseCalls++
      throw new Error('metrics woke Storage')
    },
    runtime: {
      snapshot: () => sleeping,
      metricsSnapshot: () => {
        samples++
        return { queuedRuns: 0 }
      },
    },
  }
  for (let index = 0; index < 100; index++) {
    const sample = await readRuntimeActivity(source)
    expect(sample.queuedRuns).toBe(0)
    expect(sample.managedChildProcesses).toBe(0)
  }
  expect(samples).toBe(100)
  expect(databaseCalls).toBe(0)
})

test('an older managed Host without a queue projection remains unknown without waking Storage', async () => {
  let databaseCalls = 0
  const sample = await readRuntimeActivity({
    activeRuns: () => 2,
    readQueuedSessionCount: async () => {
      databaseCalls++
      return 9
    },
    runtime: { snapshot: () => sleeping },
  })
  expect(sample.queuedRuns).toBeNull()
  expect(sample.activeRuns).toBe(2)
  expect(databaseCalls).toBe(0)
})

test('invalidated or invalid shallow facts never become false zero or deep reads', async () => {
  let databaseCalls = 0
  let queuedRuns: number | null = 3
  const source = {
    activeRuns: () => 0,
    readQueuedSessionCount: async () => {
      databaseCalls++
      return 99
    },
    runtime: { snapshot: () => sleeping, metricsSnapshot: () => ({ queuedRuns }) },
  }
  expect((await readRuntimeActivity(source)).queuedRuns).toBe(3)
  for (const invalid of [null, -1, Number.NaN, 0.5, Number.POSITIVE_INFINITY]) {
    queuedRuns = invalid
    expect((await readRuntimeActivity(source)).queuedRuns).toBeNull()
  }
  expect(databaseCalls).toBe(0)
})

test('legacy in-process mode continues reading its existing queue source', async () => {
  let databaseCalls = 0
  const sample = await readRuntimeActivity({
    activeRuns: () => 1,
    readQueuedSessionCount: async () => {
      databaseCalls++
      return 4
    },
  })
  expect(sample.queuedRuns).toBe(4)
  expect(sample.managedChildProcesses).toBeNull()
  expect(databaseCalls).toBe(1)
})

test('the production performance provider and collector preserve shallow unknown facts without database admission', async () => {
  let databaseCalls = 0
  let queuedRuns: number | null = 2
  let now = 1_000
  const provider = createHostPerformanceProvider(() =>
    readRuntimeActivity({
      activeRuns: () => 0,
      readQueuedSessionCount: async () => {
        databaseCalls++
        throw new Error('Metrics sampling must not wake managed Storage')
      },
      runtime: { snapshot: () => sleeping, metricsSnapshot: () => ({ queuedRuns }) },
    }),
  )
  const collector = new PerformanceCollector(provider, { intervalMs: 100, now: () => now })
  try {
    await collector.sampleOnce()
    expect(collector.current()?.readings.queuedRuns).toMatchObject({ availability: 'available', value: 2 })
    queuedRuns = null
    now += 100
    await collector.sampleOnce()
    expect(collector.current()?.readings.queuedRuns).toMatchObject({
      availability: 'unavailable',
      value: null,
      reason: 'RUNTIME_RECOVERING',
    })
    queuedRuns = 0
    now += 100
    await collector.sampleOnce()
    expect(collector.current()?.readings.queuedRuns).toMatchObject({ availability: 'available', value: 0 })
    expect(databaseCalls).toBe(0)
    expect(collector.current()?.readings.managedChildProcesses.value).toBe(0)
  } finally {
    collector.stop()
  }
})
