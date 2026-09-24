import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarRuntimeProvider, HbarStatusWorkspace } from '@hbar/app-react'
import { createAppRuntime } from '@hbar/app-runtime'
import type { MetricValue, PerformanceReadings } from '@hbar/contracts/metrics'
import { getShellCopy } from '../apps/web/src/shell-copy'

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

test('performance dashboard renders bounded Host process and availability facts', async () => {
  const runtime = createAppRuntime({
    instanceId: 'status-performance-react',
    hostId: 'host',
    directory: {
      async execute() {
        return { items: [], nextCursor: null }
      },
    },
    metrics: {
      async execute() {
        return {
          observedAt: 2_000,
          intervalMs: 1_000,
          retentionSamples: 120,
          process: { pid: 42, platform: 'win32', arch: 'x64', startedAt: 1_000, uptimeMs: 1_000, logicalProcessors: 8 },
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
    const html = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarStatusWorkspace labels={getShellCopy('en-US').status} />
      </HbarRuntimeProvider>,
    )
    expect(html).toContain('Status center')
    expect(html).toContain('Host process')
    expect(html).toContain('42%')
    expect(html).toContain('Unavailable')
    expect(html).toContain('PLATFORM_UNSUPPORTED')
    expect(html).toContain('The current window has a data gap; 2 samples were skipped.')
    expect(html).toContain('CPU timeline')
    expect(html).toContain('lumen-compact-metrics')
    expect(html).toContain('lumen-bar-series')
    expect(html).toContain('block-size:42%')
    const disclosures: { label: string; expanded: string | null; contentId: string | null }[] = []
    const hiddenContent = new Map<string, boolean>()
    await new HTMLRewriter()
      .on('button[aria-expanded][aria-controls]', {
        element(element) {
          disclosures.push({
            label: '',
            expanded: element.getAttribute('aria-expanded'),
            contentId: element.getAttribute('aria-controls'),
          })
        },
        text(chunk) {
          const disclosure = disclosures.at(-1)
          if (disclosure) disclosure.label += chunk.text
        },
      })
      .on('[id]', {
        element(element) {
          const id = element.getAttribute('id')
          if (id) hiddenContent.set(id, element.hasAttribute('hidden'))
        },
      })
      .transform(new Response(html))
      .text()
    // The process details start collapsed and the named control targets the hidden content.
    const processDisclosure = disclosures.find((disclosure) => disclosure.label === 'Host process')
    expect(processDisclosure?.expanded).toBe('false')
    if (!processDisclosure?.contentId) throw new Error('Host process disclosure has no controlled content')
    expect(hiddenContent.get(processDisclosure.contentId)).toBe(true)
    expect(html).not.toContain('hbar-app-ui-metric-strip')
    expect(html).toContain('Performance query filters')
    expect(html).toContain('Last hour')
    expect(html).toContain('System and Host')
    await runtime.view.commands.execute('statusWorkspace.setPerformanceQuery', {
      instanceId: panel.instanceId,
      window: '2m',
      target: 'host',
    })
    const filtered = renderToStaticMarkup(
      <HbarRuntimeProvider view={runtime.view}>
        <HbarStatusWorkspace labels={getShellCopy('en-US').status} />
      </HbarRuntimeProvider>,
    )
    expect(filtered).toContain('>Host CPU</dt>')
    expect(filtered).not.toContain('>System CPU</dt>')
  } finally {
    runtime.dispose()
  }
})
