import type { HbarAppUiMonitoringContent } from '../../packages/hbar-app-ui/src/index'
const scroll = { kind: 'pane-scroll', expectedMaximum: 80 } as const
const grown = { kind: 'content-grown', expectedMaximum: 16 } as const
const series = Array.from({ length: 14 }, (_, index) => ({ id: `p-${index}`, value: 20 + ((index * 17) % 70) }))
export const HBAR_APP_UI_MONITORING_FIXTURES: HbarAppUiMonitoringContent = {
  health: {
    labels: {
      title: 'Platform health',
      detail: 'KPI deltas, throughput and incidents',
      refresh: 'Refresh',
      chart: 'Health trend',
      incidents: 'Incident feed',
      empty: 'No incidents',
    },
    metrics: [
      { id: 'availability', label: 'Availability', value: '99.98%', detail: '+0.02%', tone: 'success' },
      { id: 'throughput', label: 'Throughput', value: '1,240 / min', detail: '+18%', tone: 'success' },
      { id: 'incidents', label: 'Incidents', value: '2', detail: '−1', tone: 'success' },
      { id: 'latency', label: 'Latency p95', value: '280ms', tone: 'warning' },
    ],
    series,
    incidents: [
      { id: 'latency', title: 'Queue latency elevated', meta: '8m ago', tone: 'warning' },
      { id: 'storage', title: 'Storage recovered', meta: '22m ago', tone: 'success' },
    ],
    listStrategy: scroll,
  },
  live: {
    labels: {
      title: 'Live metrics',
      detail: 'Rolling window and threshold line',
      pause: 'Pause',
      resume: 'Resume',
      threshold: (value) => `Threshold ${value}`,
      chart: 'Live metric stream',
    },
    thresholds: [70, 85],
    initialThreshold: 70,
    series,
    metrics: [
      { id: 'peak', label: 'Peak', value: '94%', tone: 'warning' },
      { id: 'window', label: 'Window', value: '15 min' },
      { id: 'samples', label: 'Samples', value: '180' },
    ],
  },
  incident: {
    labels: {
      title: 'Incident detail',
      detail: 'Response timeline and responders',
      status: 'Incident status',
      updatePlaceholder: 'Post an incident update',
      emptyTimeline: 'No timeline events',
    },
    statuses: [
      { id: 'investigating', label: 'Investigating' },
      { id: 'identified', label: 'Identified' },
      { id: 'monitoring', label: 'Monitoring' },
      { id: 'resolved', label: 'Resolved' },
    ],
    initialStatusId: 'investigating',
    summary: { title: 'Queue latency above threshold', body: 'Started 10 minutes ago · 3 services affected.' },
    timeline: [
      { id: 'alert', time: '10:14', label: 'Alert fired' },
      { id: 'ack', time: '10:18', label: 'Avery acknowledged' },
      { id: 'mitigation', time: '10:22', label: 'Mitigation deployed' },
    ],
    listStrategy: scroll,
  },
  alerts: {
    labels: {
      title: 'Alert inbox',
      detail: 'Runbooks and silence controls',
      states: 'Alert state',
      silence: 'Silence',
      empty: 'No alerts',
    },
    states: [
      { id: 'firing', label: 'Firing' },
      { id: 'pending', label: 'Pending' },
      { id: 'resolved', label: 'Resolved' },
    ],
    initialStateId: 'firing',
    alerts: ['Queue latency', 'Error rate', 'Storage capacity'].map((title, index) => ({
      id: `alert-${index}`,
      title,
      detail: `service-${index + 1}`,
      stateId: 'firing',
      series: series.slice(0, 5),
    })),
    listStrategy: scroll,
  },
  logs: {
    labels: {
      title: 'Live log tail',
      detail: 'Filters, follow mode and JSON context',
      levels: 'Log level',
      pause: 'Pause',
      follow: 'Follow',
      log: 'Live logs',
      expand: (id) => `Expand ${id}`,
      empty: 'No log entries',
    },
    levels: [
      { id: 'info', label: 'INFO' },
      { id: 'warn', label: 'WARN' },
      { id: 'error', label: 'ERROR' },
    ],
    initialLevelId: 'info',
    lines: Array.from({ length: 5 }, (_, index) => ({
      id: `line-${index}`,
      time: `10:24:${18 + index}`,
      message: 'request completed',
      context: '{}',
    })),
    listStrategy: scroll,
  },
  uptime: {
    labels: {
      title: 'Uptime grid',
      detail: 'Per-day status and incident history',
      windows: 'Window',
      day: (service, day) => `${service} ${day}`,
      empty: 'No services',
    },
    windows: [
      { id: '7', label: '7d' },
      { id: '30', label: '30d' },
      { id: '90', label: '90d' },
    ],
    initialWindowId: '7',
    services: ['API gateway', 'Worker pool', 'Storage', 'Scheduler'].map((name, row) => ({
      id: `service-${row}`,
      name,
      days: Array.from({ length: 7 }, (_, day) => ({
        id: `day-${day}`,
        label: `day ${day + 1}`,
        tone: row === 1 && day === 4 ? ('warning' as const) : ('success' as const),
      })),
    })),
    listStrategy: scroll,
  },
  fleet: {
    labels: {
      title: 'Fleet resources',
      detail: 'Region filters and sortable columns',
      regions: 'Region',
      node: 'Node',
      region: 'Region',
      utilisation: 'Utilisation',
      status: 'Status',
      progress: (node) => `${node} utilisation`,
      empty: 'No nodes',
    },
    regions: [
      { id: 'all', label: 'All regions' },
      { id: 'us-east', label: 'US East' },
      { id: 'eu-west', label: 'EU West' },
    ],
    initialRegionId: 'all',
    nodes: Array.from({ length: 4 }, (_, index) => ({
      id: `worker-${index + 1}`,
      name: `worker-0${index + 1}`,
      region: index % 2 ? 'eu-west' : 'us-east',
      utilisation: 42 + index * 12,
      status: index === 3 ? 'Draining' : 'Ready',
      tone: index === 3 ? ('warning' as const) : ('success' as const),
    })),
    listStrategy: scroll,
  },
  response: {
    labels: {
      title: 'Response time',
      detail: 'Percentiles, histogram and endpoints',
      sort: (label) => `Sort ${label}`,
      histogram: 'Latency histogram',
      endpoints: 'Endpoints',
      empty: 'No endpoints',
    },
    sorts: [
      { id: 'p95', label: 'p95' },
      { id: 'p99', label: 'p99' },
    ],
    initialSortId: 'p95',
    metrics: [
      { id: 'p50', label: 'p50', value: '120ms' },
      { id: 'p95', label: 'p95', value: '280ms', tone: 'warning' },
      { id: 'p99', label: 'p99', value: '640ms', tone: 'warning' },
    ],
    series,
    endpoints: [
      { id: 'runs', path: '/runs', value: '180ms' },
      { id: 'events', path: '/events', value: '240ms' },
      { id: 'files', path: '/files', value: '92ms' },
    ],
  },
  queue: {
    labels: {
      title: 'Live run queue',
      detail: 'Grouped by state and attention filter',
      attention: 'Attention only',
      count: (count) => String(count),
      progress: (run) => `${run} progress`,
      empty: 'No runs',
    },
    states: [
      { id: 'running', label: 'Running' },
      { id: 'queued', label: 'Queued' },
      { id: 'attention', label: 'Needs attention' },
    ],
    attentionStateId: 'attention',
    runs: [
      {
        id: 'reconcile',
        name: 'reconcile-october',
        detail: 'Production · 1 worker',
        stateId: 'running',
        status: 'Running',
        tone: 'success',
        progress: 54,
      },
      {
        id: 'sync',
        name: 'sync-workspace',
        detail: 'Production · 2 workers',
        stateId: 'queued',
        status: 'Queued',
        tone: 'neutral',
      },
      {
        id: 'review',
        name: 'review-gate',
        detail: 'Production · 1 worker',
        stateId: 'attention',
        status: 'Needs attention',
        tone: 'warning',
      },
    ],
    listStrategy: scroll,
  },
  slo: {
    labels: {
      title: 'Service objectives',
      detail: 'Error budget burn-down',
      windows: 'Window',
      progress: (objective) => `${objective} budget`,
      empty: 'No objectives',
    },
    windows: [
      { id: '7d', label: '7d' },
      { id: '30d', label: '30d' },
      { id: '90d', label: '90d' },
    ],
    initialWindowId: '30d',
    objectives: [
      {
        id: 'availability',
        title: 'Availability',
        target: 'target 99.9%',
        budget: 28,
        budgetLabel: '72% budget left',
        tone: 'success',
      },
      {
        id: 'latency',
        title: 'Latency',
        target: 'target 99.5%',
        budget: 68,
        budgetLabel: '32% budget left',
        tone: 'warning',
      },
      {
        id: 'runs',
        title: 'Successful runs',
        target: 'target 99.9%',
        budget: 37,
        budgetLabel: '63% budget left',
        tone: 'success',
      },
    ],
    listStrategy: grown,
  },
}
export function createHbarAppUiMonitoringLocalizedFixtures(): HbarAppUiMonitoringContent {
  return {
    ...HBAR_APP_UI_MONITORING_FIXTURES,
    health: {
      ...HBAR_APP_UI_MONITORING_FIXTURES.health!,
      labels: {
        title: '平台健康',
        detail: '关键指标、吞吐量与事件',
        refresh: '刷新',
        chart: '健康趋势',
        incidents: '事件动态',
        empty: '暂无事件',
      },
    },
  }
}
