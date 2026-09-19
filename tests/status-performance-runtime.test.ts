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
  const inputs: unknown[] = []
  const runtime = createAppRuntime({
    instanceId: 'status-performance',
    hostId: 'host',
    directory: {
      async execute() {
        return { items: [], nextCursor: null }
      },
    },
    metrics: {
      async execute(name: string, input: unknown) {
        if (name !== 'metrics.query') throw new Error(`Unsupported metrics command: ${name}`)
        inputs.push(input)
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
    expect(entry.performanceQuery).toEqual({ window: '1h', target: 'all' })
    expect(inputs[0]).toMatchObject({ bucketMs: 30_000, maxPoints: 120 })
    const initial = inputs[0] as { from: number; to: number }
    expect(initial.to - initial.from).toBe(3_600_000)

    await runtime.view.commands.execute('statusWorkspace.setPerformanceQuery', {
      instanceId: panel.instanceId,
      window: '15m',
      target: 'host',
    })
    expect(runtime.view.state.status.getSnapshot().entries[panel.instanceId]?.performanceQuery).toEqual({
      window: '15m',
      target: 'host',
    })
    expect(inputs[1]).toMatchObject({ bucketMs: 7_500, maxPoints: 120 })
    const filtered = inputs[1] as { from: number; to: number }
    expect(filtered.to - filtered.from).toBe(900_000)
  } finally {
    runtime.dispose()
  }
})
