import { expect, test } from 'bun:test'
import { available, PerformanceCollector, unavailable, type PerformanceProvider } from '@hbar/metrics'
import { createHostPerformanceProvider } from '../apps/host/src/performance-provider.ts'

function readings(value: number) {
  return {
    systemCpuPercent: available(value, 'percent', 'fixture'),
    hostCpuPercent: available(value / 2, 'percent', 'fixture'),
    systemLoad1: unavailable('load', 'PLATFORM_UNSUPPORTED', 'fixture'),
    systemMemoryUsedBytes: available(value * 100, 'bytes', 'fixture'),
    systemMemoryTotalBytes: available(10_000, 'bytes', 'fixture'),
    hostRssBytes: available(value * 10, 'bytes', 'fixture'),
    hostHeapUsedBytes: available(value * 5, 'bytes', 'fixture'),
    hostThreadCount: unavailable('count', 'PLATFORM_UNSUPPORTED', 'fixture'),
    hostDiskReadBytesPerSecond: unavailable('bytes_per_second', 'COUNTER_WARMING_UP', 'fixture'),
    hostDiskWriteBytesPerSecond: unavailable('bytes_per_second', 'COUNTER_WARMING_UP', 'fixture'),
    systemNetworkReceiveBytesPerSecond: unavailable('bytes_per_second', 'COUNTER_WARMING_UP', 'fixture'),
    systemNetworkTransmitBytesPerSecond: unavailable('bytes_per_second', 'COUNTER_WARMING_UP', 'fixture'),
    activeRuns: available(1, 'count', 'fixture'),
    queuedRuns: available(2, 'count', 'fixture'),
    managedChildProcesses: unavailable('count', 'PROCESS_REGISTRY_UNAVAILABLE', 'fixture'),
  }
}

test('performance collector shares bounded samples, aggregates buckets, and reports gaps', async () => {
  let now = 1_000
  let value = 10
  const provider: PerformanceProvider = {
    process: {
      pid: 1,
      platform: 'fixture',
      arch: 'fixture',
      startedAt: 0,
      uptimeMs: 1_000,
      logicalProcessors: 4,
    },
    async sample() {
      return readings(value)
    },
  }
  const collector = new PerformanceCollector(provider, { intervalMs: 100, maxSamples: 2, now: () => now })
  await collector.sampleOnce()
  now += 100
  value = 20
  await collector.sampleOnce()
  now += 100
  value = 30
  await collector.sampleOnce()

  expect(collector.current()?.readings.systemCpuPercent.value).toBe(30)
  const report = collector.query({ from: 1_000, to: 1_301, bucketMs: 1_000, maxPoints: 10 })
  expect(report.gap).toBe(true)
  expect(report.points).toHaveLength(1)
  expect(report.points[0]?.readings.systemCpuPercent).toMatchObject({
    value: 25,
    availability: 'available',
    sampleCount: 2,
  })
  expect(report.points[0]?.readings.hostThreadCount).toMatchObject({
    value: null,
    availability: 'unavailable',
    reason: 'PLATFORM_UNSUPPORTED',
  })
})

test('host performance provider reports real process facts and explicit platform gaps', async () => {
  const provider = createHostPerformanceProvider(async () => ({
    activeRuns: 2,
    queuedRuns: 3,
    managedChildProcesses: null,
  }))
  const first = await provider.sample(1_000)
  await Bun.sleep(5)
  const second = await provider.sample(1_000)

  expect(provider.process).toMatchObject({ pid: process.pid, platform: process.platform })
  expect(second.hostRssBytes).toMatchObject({ availability: 'available', unit: 'bytes' })
  expect(second.activeRuns.value).toBe(2)
  expect(second.queuedRuns.value).toBe(3)
  expect(second.managedChildProcesses).toMatchObject({
    value: null,
    availability: 'unavailable',
    reason: 'PROCESS_REGISTRY_UNAVAILABLE',
  })
  if (process.platform === 'win32') {
    expect(first.hostThreadCount).toMatchObject({ availability: 'unavailable', reason: 'PLATFORM_UNSUPPORTED' })
    expect(first.hostDiskReadBytesPerSecond).toMatchObject({
      availability: 'unavailable',
      reason: 'PLATFORM_UNSUPPORTED',
    })
  } else expect(second.systemCpuPercent.availability).toBe('available')
})
