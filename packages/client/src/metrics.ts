import { createCommandClient, COMMAND_PROTOCOL_VERSION } from '@hbar/commands'
import { metricsCommands, metricsWatchResultSchema } from '@hbar/contracts/commands/metrics'
import type { MetricsWatchResult } from '@hbar/contracts/commands/metrics'
import type { PerformanceSample } from '@hbar/contracts/metrics'
import type { WireNotification } from '@hbar/contracts'
import type { ConnectionStatus } from './index'
import type { ClientTransport } from './transport'

export function createMetricsCommandClient(client: ClientTransport) {
  return createCommandClient(metricsCommands, {
    execute(id, input, options) {
      return client.call('command.execute', {
        protocol: COMMAND_PROTOCOL_VERSION,
        requestId: options?.requestId ?? crypto.randomUUID(),
        commandId: id,
        commandVersion: options?.version ?? 1,
        input,
      })
    },
  })
}

export interface MetricsWatchTransport extends ClientTransport {
  onEvent(listener: (event: WireNotification) => void): () => void
  onStatus(listener: (status: ConnectionStatus) => void): () => void
}

export function createMetricsWatcher(client: MetricsWatchTransport) {
  return {
    async watch(
      after: number,
      onUpdate: (update: { kind: 'sample'; sample: PerformanceSample } | { kind: 'reset' } | { kind: 'error' }) => void,
    ) {
      let cursor = after
      let closed = false
      let loading = true
      let overflow = false
      const pending: PerformanceSample[] = []
      const emit = (update: Parameters<typeof onUpdate>[0]) => {
        try {
          onUpdate(update)
        } catch (error) {
          console.error('Metrics watch observer failed:', error)
        }
      }
      const deliver = (sample: PerformanceSample) => {
        if (sample.observedAt <= cursor) return
        cursor = sample.observedAt
        emit({ kind: 'sample', sample })
      }
      const offEvent = client.onEvent((notification) => {
        if (notification.method !== 'metrics.sample' || closed) return
        if (loading) {
          if (pending.length < 400) pending.push(notification.params)
          else overflow = true
        } else deliver(notification.params)
      })
      const apply = (result: MetricsWatchResult) => {
        if (result.reset || overflow) emit({ kind: 'reset' })
        for (const sample of result.samples) deliver(sample)
        cursor = Math.max(cursor, result.cursor)
        for (const sample of pending.splice(0)) deliver(sample)
        overflow = false
      }
      const refresh = async () => {
        if (loading || closed) return
        loading = true
        try {
          apply(metricsWatchResultSchema.parse(await client.call('metrics.watch', { cursor })))
        } catch {
          if (!closed) emit({ kind: 'error' })
        } finally {
          loading = false
        }
      }
      const offStatus = client.onStatus((status) => {
        if (status === 'connected' && !loading && !closed) void refresh()
      })
      const close = async () => {
        if (closed) return
        closed = true
        offEvent()
        offStatus()
        await client.call('metrics.unwatch', {}).catch(() => {})
      }
      try {
        const initial = metricsWatchResultSchema.parse(await client.call('metrics.watch', { cursor }))
        loading = false
        apply(initial)
        return { initial, close }
      } catch (error) {
        closed = true
        offEvent()
        offStatus()
        throw error
      }
    },
  }
}
