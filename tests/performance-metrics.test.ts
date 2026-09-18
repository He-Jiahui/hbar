import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HbarClient, createMetricsCommandClient, createMetricsWatcher } from '@hbar/client'
import { Kernel, MemorySecrets } from '@hbar/kernel'
import { available, PerformanceCollector, unavailable, type PerformanceProvider } from '@hbar/metrics'
import { createHostPerformanceProvider } from '../apps/host/src/performance-provider.ts'
import { startServer } from '../apps/host/src/server.ts'

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
  expect(collector.samplesAfter(0, 1)).toMatchObject({ reset: true, samples: [{ observedAt: 1_200 }] })
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

test('authenticated metrics commands expose one shared Host collector', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-performance-command-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    host = await startServer(kernel, { port: 0 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'metrics command actor')
    const commands = createMetricsCommandClient(client)
    const catalog = await client.call('command.catalog', { category: 'monitoring.performance', limit: 20 })
    expect(catalog.items.map((item) => item.metadata.id)).toEqual(['metrics.current', 'metrics.query'])
    const current = await commands.execute('metrics.current', {})
    expect(current.process).toMatchObject({ pid: process.pid, platform: process.platform })
    expect(current.current?.readings.hostRssBytes.availability).toBe('available')
    expect(current.current?.readings.queuedRuns.value).toBe(0)
    const query = await commands.execute('metrics.query', { bucketMs: 100, maxPoints: 10 })
    expect(query.points.length).toBeGreaterThan(0)
    expect(query.points.length).toBeLessThanOrEqual(10)
    expect(query.points.at(-1)?.readings.activeRuns).toMatchObject({ availability: 'available', value: 0 })
  } finally {
    client?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})

test('metrics watch resumes from its cursor after reconnect and releases the socket subscription', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hbar-performance-watch-'))
  const kernel = await Kernel.create({
    home: join(root, 'data'),
    workspace: root,
    demo: true,
    secrets: new MemorySecrets(),
  })
  let host: Awaited<ReturnType<typeof startServer>> | undefined
  let client: HbarClient | undefined
  try {
    host = await startServer(kernel, { port: 0, metricsIntervalMs: 100 })
    client = new HbarClient(`http://127.0.0.1:${host.server.port}`)
    await client.pair(host.pairing.code, 'metrics watch actor')
    const samples: number[] = []
    let resets = 0
    const watcher = await createMetricsWatcher(client).watch(0, (update) => {
      if (update.kind === 'sample') samples.push(update.sample.observedAt)
      else if (update.kind === 'reset') resets++
    })
    expect(watcher.initial.samples.length).toBeGreaterThan(0)
    for (let attempt = 0; attempt < 30 && samples.length < 2; attempt++) await Bun.sleep(20)
    expect(samples.length).toBeGreaterThanOrEqual(2)
    const beforeDisconnect = samples.at(-1)!
    client.disconnect()
    await Bun.sleep(250)
    await client.connect()
    for (let attempt = 0; attempt < 30 && (samples.at(-1) ?? 0) <= beforeDisconnect; attempt++) await Bun.sleep(20)
    expect(samples.at(-1)).toBeGreaterThan(beforeDisconnect)
    expect(new Set(samples).size).toBe(samples.length)
    expect(resets).toBe(0)
    await watcher.close()
    const count = samples.length
    await Bun.sleep(150)
    expect(samples).toHaveLength(count)
  } finally {
    client?.disconnect()
    await host?.close()
    await kernel.close()
    await rm(root, { recursive: true, force: true })
  }
})
