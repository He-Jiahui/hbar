import { expect, test } from 'bun:test'
import { createAppRuntime } from '@hbar/app-runtime'
import type { MetricValue, PerformanceReadings } from '@hbar/contracts/metrics'

const metric = (value: number | null, unit: MetricValue['unit'], reason: string | null = null): MetricValue => ({
  value,
  unit,
  availability: value === null ? 'unavailable' : 'available',
  reason,
  source: 'fixture',
  estimated: false,
  sampleCount: value === null ? 0 : 1,
})

const readings: PerformanceReadings = {
  systemCpuPercent: metric(42, 'percent'),
  hostCpuPercent: metric(12, 'percent'),
  systemLoad1: metric(null, 'load', 'PLATFORM_UNSUPPORTED'),
  systemMemoryUsedBytes: metric(4_000, 'bytes'),
  systemMemoryTotalBytes: metric(8_000, 'bytes'),
  hostRssBytes: metric(2_000, 'bytes'),
  hostHeapUsedBytes: metric(1_000, 'bytes'),
  hostThreadCount: metric(null, 'count', 'PLATFORM_UNSUPPORTED'),
  hostDiskReadBytesPerSecond: metric(100, 'bytes_per_second'),
  hostDiskWriteBytesPerSecond: metric(200, 'bytes_per_second'),
  systemNetworkReceiveBytesPerSecond: metric(300, 'bytes_per_second'),
  systemNetworkTransmitBytesPerSecond: metric(400, 'bytes_per_second'),
  eventLoopLagMs: metric(3, 'milliseconds'),
  activeRuns: metric(1, 'count'),
  queuedRuns: metric(2, 'count'),
  managedChildProcesses: metric(1, 'count'),
}

test('status performance workspace loads bounded Host metrics and preserves unavailable readings', async () => {
  const runtime = createAppRuntime({
    instanceId: 'status-performance',
    hostId: 'host',
    directory: {
      async execute() {
        return { items: [], nextCursor: null }
      },
    },
    metrics: {
      async execute(name: string) {
        if (name !== 'metrics.query') throw new Error(`Unsupported metrics command: ${name}`)
        return {
          observedAt: 2_000,
          intervalMs: 1_000,
          retentionSamples: 120,
          process: {
            pid: 42,
            platform: 'win32',
            arch: 'x64',
            startedAt: 1_000,
            uptimeMs: 1_000,
            logicalProcessors: 8,
          },
          current: { observedAt: 2_000, elapsedMs: 1_000, readings },
          gap: true,
          skippedSamples: 2,
          points: [{ start: 1_000, end: 2_000, readings }],
        }
      },
    },
    surfaces: { canRender: (panelId) => panelId === 'status' },
  })
  try {
    const panel = await runtime.view.commands.execute('app.openStatus', { section: 'dashboard' })
    await runtime.view.commands.execute('statusWorkspace.refresh', { instanceId: panel.instanceId })
    const entry = runtime.view.state.status.getSnapshot().entries[panel.instanceId]!
    expect(entry.status).toBe('ready')
    expect(entry.performance?.points).toHaveLength(1)
    expect(entry.performance?.gap).toBe(true)
    expect(entry.performance?.current?.readings.systemCpuPercent.value).toBe(42)
    expect(entry.performance?.current?.readings.hostThreadCount).toMatchObject({
      availability: 'unavailable',
      reason: 'PLATFORM_UNSUPPORTED',
      value: null,
    })
  } finally {
    runtime.dispose()
  }
})
