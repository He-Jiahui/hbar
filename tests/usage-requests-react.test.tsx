import { expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { HbarUsageRequests } from '../packages/app-react/src/usage-requests'
import type { UsageRequestsRuntime } from '@hbar/app-runtime'

const labels = {
  title: 'Request log', description: 'Recent requests', request: 'Request', open: 'Open request', timeLabel: 'Time', filterOptions: [{ id: 'all' as const, label: 'All' }], model: 'Model', tokens: 'Tokens', latency: 'Latency', cost: 'Cost', empty: 'No requests', previous: 'Previous', next: 'Next', retry: 'Retry', error: (code: string) => `Could not load (${code})`,
  page: (from: number, to: number, total: number) => `${from}-${to}/${total}`, time: (value: number) => String(value), tokenCount: (value: number) => String(value), duration: (value: number | null) => value === null ? 'Unknown' : `${value}ms`,
  costValue: (value: { readonly availability: string; readonly value: number | null }) => value.availability === 'available' && value.value !== null ? String(value.value) : 'Unavailable',
  status: (value: string | null) => value ?? 'Unknown', source: (value: string) => value === 'model' ? 'Model request' : 'Compaction', detail: { attempt: 'Attempt', session: 'Session', provider: 'Provider', source: 'Source', status: 'Status' },
}

function runtime(items: UsageRequestsRuntime['reader'] extends never ? never : UsageRequestsRuntime['reader'] extends { getSnapshot: () => infer State } ? State extends never ? never : UsageRequestsRuntime : never): UsageRequestsRuntime {
  return items
}

test('Usage07 renders host supplied request data and leaves unknown cost explicit', () => {
  const state = { scope: { kind: 'global' as const }, filters: {}, items: [{ id: 'u1', attemptId: 'a1', sessionId: 's1', workspaceId: 'w1', runId: 'r1', source: 'model' as const, providerId: 'p1', modelId: 'm1', startedAt: 0, firstProviderEventAt: 1, firstThinkingAt: null, firstTextAt: 2, endedAt: 10, runStatus: 'completed' as const, input: 3, output: 4, cacheRead: 0, cacheWrite: 0, billableTokens: 7, cost: { value: null, unit: 'USD' as const, availability: 'unavailable' as const, reason: 'unknown', source: 'ledger', estimated: false, sampleCount: 1 }, pricingVersion: null }], cursor: null, hasMore: false, status: 'ready' as const, error: null }
  const fake = runtime({ reader: { getSnapshot: () => state, subscribe: () => () => undefined }, refresh: async () => undefined, loadMore: async () => undefined, setScope: async () => undefined, dispose: () => undefined })
  const html = renderToStaticMarkup(<HbarUsageRequests runtime={fake} labels={labels} />)
  expect(html).toContain('Request log')
  expect(html).toContain('Unavailable')
  expect(html).toContain('m1')
})
