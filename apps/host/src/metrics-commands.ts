import { CommandError, CommandRegistry, createCommandClient } from '@hbar/commands'
import { metricsCommands } from '@hbar/contracts/commands/metrics'
import type { PerformanceCollector } from '@hbar/metrics'

export function createMetricsCommands(collector: PerformanceCollector, now: () => number = Date.now) {
  const registry = new CommandRegistry({ execution: 'host' })
  registry.register(metricsCommands['metrics.current'], () => ({
    observedAt: now(),
    intervalMs: collector.intervalMs,
    retentionSamples: collector.maxSamples,
    process: collector.process,
    current: collector.current(),
  }))
  registry.register(metricsCommands['metrics.query'], (input) => {
    const observedAt = now()
    const to = input.to ?? observedAt + 1
    const from = input.from ?? Math.max(0, to - 3_600_000)
    if (from >= to) throw new CommandError('INVALID_INPUT', 'Metrics window requires from < to')
    const report = collector.query({ from, to, bucketMs: input.bucketMs, maxPoints: input.maxPoints })
    return {
      observedAt,
      intervalMs: collector.intervalMs,
      retentionSamples: collector.maxSamples,
      process: collector.process,
      current: collector.current(),
      ...report,
      points: [...report.points],
    }
  })
  return {
    ...createCommandClient(metricsCommands, registry),
    dispatchPrepared: registry.dispatchPrepared.bind(registry),
    dispatchPreparedTracked: registry.dispatchPreparedTracked.bind(registry),
    dispatch(value: unknown, actorId: string) {
      return registry.dispatch(value, { actorId })
    },
    describe: (id: string) => registry.describe(id),
    list: () => registry.list({ limit: 500 }),
    dispose: () => registry.dispose(),
  }
}
