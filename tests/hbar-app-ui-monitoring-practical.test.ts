import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LumenMonitoring, type LumenMonitoringReferenceContent } from '@lumen/app-ui/catalog'
import { createMonitoringPreviewStore } from '../apps/hbar-app-ui-preview/src/monitoringPreviewModel'
import {
  createMonitoringPreviewSeed,
  projectMonitoringPreview,
} from '../apps/hbar-app-ui-preview/src/monitoringPreviewProjection'
import { createMonitoringPreviewReferenceContent } from '../apps/hbar-app-ui-preview/src/monitoringPreviewReferenceFixtures'

function harness(variant: number, mode = 'default', input = createMonitoringPreviewReferenceContent(variant, mode)) {
  const store = createMonitoringPreviewStore(createMonitoringPreviewSeed(input, variant, 'test-owner', mode))
  const events: { readonly actionId: string; readonly value?: string | undefined }[] = []
  const content = () => projectMonitoringPreview(input, store, (event) => events.push(event))
  const action = (actionId: Parameters<LumenMonitoringReferenceContent['onAction']>[0], value?: string) =>
    content().reference?.onAction(actionId, value)
  const render = () =>
    renderToStaticMarkup(
      createElement(LumenMonitoring, { variant, variantId: `hbar-app-ui-monitoring-${variant}`, content: content() }),
    )
  return { input, store, events, content, action, render }
}
describe('Monitoring practical reference flows', () => {
  test('keeps all ten source structures and empty/one/boundary/overflow records', () => {
    const kinds = ['health', 'live', 'incident', 'alerts', 'logs', 'uptime', 'fleet', 'response', 'queue', 'slo']
    for (let variant = 1; variant <= 10; variant++) {
      const base = harness(variant)
      expect(base.render()).toContain(`data-reference-kind="${kinds[variant - 1]}"`)
      expect(base.render()).toContain(base.input.header.title)
      for (const mode of ['empty', 'one', 'boundary', 'overflow']) {
        const fixture = harness(variant, mode)
        expect(fixture.render()).toContain('data-lumen-component="monitoring"')
        expect(fixture.store.getState().items.length).toBeLessThanOrEqual(variant === 5 ? 140 : 81)
      }
    }
    expect(harness(1, 'empty').render()).toContain('No matching records.')
    expect(harness(3, 'empty').render()).toContain('No matching records.')
  })
  test('health scope and live pause keep captured facts separate from unavailable telemetry', () => {
    const health = harness(1)
    health.action('range', '1h')
    expect(health.render()).toContain('does not include data')
    expect(health.render()).not.toContain('1458.1k')
    health.action('range', '24h')
    health.action('options', 'errors')
    expect(health.events).toEqual([{ actionId: 'options', value: 'errors' }])
    health.action('options', 'missing')
    expect(health.events).toHaveLength(1)
    const live = harness(2)
    live.action('pause')
    expect(live.render()).toContain('Resume')
    expect(live.store.getState().paused).toBe(true)
    live.action('metric', 'errors')
    expect(live.render()).not.toContain('4,383')
    live.action('metric', 'requests')
    expect(live.render()).toContain('4,383')
  })
  test('incident drafts post locally without sending messages and resolve the owned incident', () => {
    const incident = harness(3)
    incident.action('draft', 'Database recovered and traffic is stable.')
    incident.action('post')
    expect(incident.render()).toContain('Database recovered and traffic is stable.')
    expect(incident.render()).toContain('no subscribers were contacted')
    expect(incident.store.getState().draft).toBe('')
    expect(incident.store.getState().localUpdates).toHaveLength(1)
    incident.action('post')
    expect(incident.store.getState().localUpdates).toHaveLength(1)
    incident.action('incident-resolve')
    expect(incident.store.getState().choiceIds.status).toBe('monitoring')
    incident.action('status', 'resolved')
    expect(incident.store.getState().choiceIds.status).toBe('resolved')
    expect(incident.store.getState().localUpdates[0]?.statusId).toBe('monitoring')
    expect(incident.events).toHaveLength(0)
  })
  test('alerts filter current state, target mutations exactly, recover from no-match and reset', () => {
    const alerts = harness(4)
    alerts.action('resolve', 'checkout-p99')
    expect(alerts.render()).not.toContain('Checkout p99 above budget')
    alerts.action('state', 'resolved')
    expect(alerts.render()).toContain('Checkout p99 above budget')
    alerts.action('query', 'no-matching-service')
    expect(alerts.render()).toContain('Clear search')
    alerts.action('resolve', 'error-rate')
    expect(alerts.store.getState().resolvedIds).toEqual(['checkout-p99'])
    alerts.action('query', '')
    alerts.action('reset-alerts')
    alerts.action('state', 'firing')
    expect(alerts.render()).toContain('Checkout p99 above budget')
    expect(alerts.store.getState().resolvedIds).toHaveLength(0)
  })
  test('logs own exact level/query/expanded targets, pause/follow and local buffer clearing', () => {
    const logs = harness(5)
    logs.action('level', 'error')
    const filtered = logs.content().reference
    expect(filtered?.kind === 'logs' ? filtered.lines.length : 0).toBe(3)
    logs.action('expand', 'log-0')
    expect(logs.store.getState().expandedIds).toHaveLength(0)
    logs.action('expand', 'log-4')
    expect(logs.render()).toContain('does not include data')
    logs.action('pause')
    logs.action('follow')
    expect(logs.store.getState().paused).toBe(true)
    expect(logs.store.getState().follow).toBe(false)
    logs.action('clear')
    expect(logs.render()).toContain('No production logs were deleted')
    expect(logs.render()).not.toContain('charge timed out after 8s')
  })
  test('fleet region/search intersect and numeric sort; response route switch never leaks histogram facts', () => {
    const fleet = harness(7)
    fleet.action('region', 'us-east-1')
    fleet.action('query', 'database')
    const current = fleet.content().reference
    expect(current?.kind === 'fleet' ? current.nodes.map(({ id }) => id) : []).toEqual(['db-replica-01'])
    fleet.action('expand', 'api-eu-02')
    expect(fleet.store.getState().expandedIds).toEqual(['api-eu-02'])
    fleet.action('region', 'all')
    fleet.action('query', '')
    fleet.action('sort', 'disk:true')
    const sorted = fleet.content().reference
    expect(sorted?.kind === 'fleet' ? sorted.nodes[0]?.id : '').toBe('worker-us-01')
    const response = harness(8)
    response.action('bucket', 'bucket-0')
    expect(response.render()).toContain('0–50ms · 2% of requests')
    response.action('select', 'orders')
    expect(response.render()).toContain('42ms')
    expect(response.render()).not.toContain('122% of requests plotted')
    const selectedResponse = response.content().reference
    expect(selectedResponse?.kind === 'response' ? selectedResponse.selectedId : '').toBe('orders')
    response.action('sort', 'requests:true')
    const routes = response.content().reference
    expect(routes?.kind === 'response' ? routes.routes[0]?.id : '').toBe('orders')
    response.action('bucket', 'bucket-0')
    expect(response.events).toHaveLength(1)
  })
  test('queue attention/group ownership and SLO selection are distinct from fake run/service success', () => {
    const queue = harness(9)
    queue.action('attention')
    const runs = queue.content().reference
    expect(runs?.kind === 'queue' ? runs.runs.length : 0).toBe(5)
    queue.action('run-actions', 'refund-99214')
    expect(queue.events).toHaveLength(0)
    queue.action('run-actions', 'refund-99187')
    expect(queue.events).toEqual([{ actionId: 'run-actions', value: 'refund-99187' }])
    queue.action('all-groups', 'false')
    queue.action('run-actions', 'refund-99187')
    expect(queue.events).toHaveLength(1)
    expect(queue.render()).toContain('Expand groups')
    const slo = harness(10)
    slo.action('select', 'latency')
    expect(slo.render()).toContain('64%')
    expect(slo.render()).not.toContain('12% remaining')
    slo.action('window', '7d')
    expect(slo.render()).toContain('does not include data')
  })
  test('localized content renders, duplicate IDs stay first-wins and callbacks reject a now-hidden target', () => {
    for (let variant = 1; variant <= 10; variant++)
      expect(harness(variant, 'localized').render()).toContain('工作区监控与运行状态')
    expect(harness(3, 'localized').render()).toContain('在本地预览发布更新')
    const base = createMonitoringPreviewReferenceContent(7)
    if (base.kind !== 'fleet') throw new Error('Wrong fleet fixture')
    const node = base.nodes[0]
    if (!node) throw new Error('Missing node')
    const fleet = harness(7, 'default', {
      ...base,
      nodes: [...base.nodes, { ...node, name: 'Duplicate must disappear' }],
    })
    expect(fleet.render()).not.toContain('Duplicate must disappear')
    const callback = fleet.content().reference?.onAction
    fleet.action('query', 'worker-us')
    callback?.('expand', 'api-eu-02')
    expect(fleet.store.getState().expandedIds).toEqual(['api-eu-02'])
    callback?.('expand', 'worker-us-01')
    expect(fleet.store.getState().expandedIds).toEqual(['api-eu-02', 'worker-us-01'])
  })
  test('retains captured API history, thirty-day uptime values, first log JSON and seven-day SLO chart', () => {
    const uptime = harness(6)
    uptime.action('expand', 'service-0')
    expect(uptime.render()).toContain('Elevated 5xx for 18 minutes after a bad deploy.')
    uptime.action('window', '30')
    expect(uptime.render()).toContain('99.935% average uptime over 30 days')
    const history = uptime.content().reference
    expect(history?.kind === 'uptime' ? history.services.find(({ name }) => name === 'Search')?.uptime : '').toBe(
      '99.91% uptime',
    )
    const logs = harness(5)
    logs.action('expand', 'log-0')
    expect(logs.render()).toContain('/v2/orders')
    expect(logs.render()).toContain('cache')
    expect(logs.render()).toContain('hit')
    const slo = harness(10)
    slo.action('window', '7d')
    expect(slo.render()).toContain('Error budget burn-down for Checkout availability')
    expect(slo.render()).not.toContain('does not include data')
  })
})
