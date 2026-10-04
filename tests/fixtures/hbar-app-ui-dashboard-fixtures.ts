import type { HbarAppUiDashboardContent } from '../../packages/hbar-app-ui/src/index'

const scroll = { kind: 'pane-scroll', expectedMaximum: 80 } as const
const grown = { kind: 'content-grown', expectedMaximum: 16 } as const
const series = (prefix: string, count = 10) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    value: 24 + ((index * 17 + prefix.length) % 68),
  }))
const baseMetrics = [
  { id: 'throughput', label: 'Throughput', value: '128 / hr', trend: '+18%', tone: 'success' as const },
  { id: 'quality', label: 'Quality', value: '98.4%', detail: 'Current', tone: 'success' as const },
  { id: 'review', label: 'Review time', value: '2.4h' },
]

export const HBAR_APP_UI_DASHBOARD_FIXTURES: HbarAppUiDashboardContent = {
  overview: {
    labels: {
      title: 'Operations overview',
      detail: 'Period-over-period deltas',
      period: 'This period',
      chart: (label) => `${label} trend`,
      empty: 'No metrics',
    },
    metrics: [
      { id: 'active', label: 'Active runs', value: '24', trend: '+12%', tone: 'success', series: series('active', 7) },
      {
        id: 'completed',
        label: 'Completed',
        value: '96',
        trend: '+8%',
        tone: 'success',
        series: series('completed', 7),
      },
      { id: 'queue', label: 'Review queue', value: '4', trend: '−3%', tone: 'danger', series: series('queue', 7) },
      {
        id: 'latency',
        label: 'Avg. latency',
        value: '1.8s',
        trend: '−18%',
        tone: 'success',
        series: series('latency', 7),
      },
    ],
    listStrategy: grown,
  },
  throughput: {
    labels: {
      title: 'Throughput dashboard',
      detail: 'Chart, breakdown and date range',
      ranges: 'Date range',
      chart: 'Runs completed chart',
      chartTitle: 'Runs completed',
      source: 'Source',
      value: 'Runs',
      share: 'Share',
      empty: 'No throughput rows',
    },
    ranges: [
      { id: '24h', label: '24h' },
      { id: '7d', label: '7d' },
      { id: '30d', label: '30d' },
    ],
    initialRangeId: '7d',
    series: series('throughput', 12),
    breakdown: [
      { id: 'workspace', source: 'Workspace', value: '128', share: '58%' },
      { id: 'automation', source: 'Automation', value: '64', share: '29%' },
      { id: 'review', source: 'Review', value: '28', share: '13%' },
    ],
    listStrategy: scroll,
  },
  widgets: {
    labels: {
      title: 'Widget board',
      detail: 'Mixed card spans',
      add: 'Add widget',
      menu: (label) => `${label} menu`,
      open: 'Open details',
      remove: 'Remove widget',
      empty: 'No widgets',
    },
    widgets: [
      { id: 'runs', label: 'Runs', value: '24', wide: true },
      { id: 'queue', label: 'Queue', value: '8' },
      { id: 'usage', label: 'Usage', value: '64%' },
      { id: 'health', label: 'Health', value: '98%' },
      { id: 'reviews', label: 'Reviews', value: '4' },
    ],
    listStrategy: grown,
  },
  operations: {
    labels: {
      title: 'Operations dashboard',
      detail: 'Service board and incidents',
      incidents: 'Incidents',
      feed: 'Incident feed',
      emptyServices: 'No services',
      emptyFeed: 'No incidents',
    },
    services: [
      { id: 'api', name: 'API gateway', status: 'Healthy', tone: 'success', detail: '120ms' },
      { id: 'worker', name: 'Worker pool', status: 'Healthy', tone: 'success', detail: '138ms' },
      { id: 'stream', name: 'Event stream', status: 'Degraded', tone: 'warning', detail: '3 alerts' },
      { id: 'storage', name: 'Storage', status: 'Healthy', tone: 'success', detail: '174ms' },
    ],
    incidents: [
      { id: 'latency', title: 'Queue latency above threshold', meta: '8m ago', tone: 'warning' },
      { id: 'storage', title: 'Storage recovered', meta: '22m ago', tone: 'success' },
    ],
    listStrategy: scroll,
  },
  usage: {
    labels: {
      title: 'Usage dashboard',
      detail: 'Quota meters and burn-down',
      upgrade: 'Upgrade',
      progress: (label) => `${label} quota`,
      chartTitle: 'Burn-down',
      chart: 'Usage burn-down',
      empty: 'No quotas',
    },
    quotas: [
      { id: 'tokens', label: 'Tokens', value: 82, valueLabel: '82% used', detail: 'Resets in 1d' },
      { id: 'requests', label: 'Requests', value: 70, valueLabel: '70% used', detail: 'Resets in 2d' },
      { id: 'seats', label: 'Seats', value: 58, valueLabel: '58% used', detail: 'Resets in 3d' },
    ],
    series: series('usage'),
    listStrategy: grown,
  },
  comparison: {
    labels: {
      title: 'Analytics overview',
      detail: 'Compare periods',
      modes: 'Comparison',
      chart: (label) => `${label} comparison`,
      empty: 'No comparison metrics',
    },
    modes: [
      { id: 'current', label: 'Current' },
      { id: 'compare', label: 'Compare' },
    ],
    initialModeId: 'current',
    metricsByMode: {
      current: baseMetrics,
      compare: baseMetrics.map((metric) => ({ ...metric, detail: 'Previous period' })),
    },
    seriesByMode: {
      current: [
        { id: 'current', value: 72 },
        { id: 'previous', value: 44 },
      ],
      compare: [
        { id: 'current', value: 72 },
        { id: 'previous', value: 58 },
      ],
    },
  },
  project: {
    labels: {
      title: 'Project dashboard',
      firstRun: 'First run',
      ready: 'Ready',
      load: 'Load project',
      refresh: 'Refresh',
      emptyTitle: 'No project data yet',
      emptyBody: 'Connect a workspace to populate this dashboard.',
    },
    metrics: [
      { id: 'projects', label: 'Projects', value: '1' },
      { id: 'runs', label: 'Runs', value: '0' },
      { id: 'members', label: 'Members', value: '1' },
    ],
  },
  delivery: {
    labels: {
      title: 'Delivery board',
      detail: 'Sortable modules and progress rings',
      sort: 'Sort modules',
      progress: (name) => `${name} progress`,
      empty: 'No delivery modules',
    },
    modules: [
      { id: 'api', name: 'API', progress: 32, detail: 'Next milestone in 2d' },
      { id: 'web', name: 'Web', progress: 48, detail: 'Next milestone in 3d' },
      { id: 'docs', name: 'Docs', progress: 64, detail: 'Next milestone in 4d' },
      { id: 'mobile', name: 'Mobile', progress: 80, detail: 'Next milestone in 5d' },
    ],
    listStrategy: grown,
  },
  worklog: {
    labels: {
      title: 'Weekly worklog',
      detail: (week) => `Week ${week}`,
      previous: 'Previous',
      next: 'Next',
      person: 'Person',
      hours: (person, day, hours) => `${person}, ${day}, ${hours} hours`,
      empty: 'No worklog entries',
    },
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((label) => ({ id: label.toLowerCase(), label })),
    people: [
      { id: 'avery', name: 'Avery', hours: [1, 2, 3, 4, 1] },
      { id: 'mina', name: 'Mina', hours: [2, 3, 4, 1, 2] },
      { id: 'jon', name: 'Jon', hours: [3, 4, 1, 2, 3] },
      { id: 'sam', name: 'Sam', hours: [4, 1, 2, 3, 4] },
    ],
    listStrategy: scroll,
  },
  explorer: {
    labels: {
      title: 'Metric explorer',
      detail: 'One chart · six measures',
      measures: 'Measure',
      chart: (label) => `${label} chart`,
      empty: 'No measures',
    },
    measures: ['Runs', 'Tokens', 'Latency', 'Errors', 'Cost', 'Reviews'].map((label) => ({
      id: label.toLowerCase(),
      label,
      series: series(label.toLowerCase(), 12),
    })),
    initialMeasureId: 'runs',
  },
  coverage: {
    labels: {
      title: 'Workforce coverage',
      detail: 'Staffing bars and demand',
      openQueue: 'Open action queue',
      progress: (name) => `${name} staffing`,
      chartTitle: 'Demand next 7 days',
      chart: 'Demand forecast',
      empty: 'No teams',
    },
    teams: [
      { id: 'engineering', name: 'Engineering', progress: 48, detail: '8 / 12 staffed' },
      { id: 'design', name: 'Design', progress: 59, detail: '9 / 13 staffed' },
      { id: 'support', name: 'Support', progress: 70, detail: '10 / 14 staffed', tone: 'warning' },
      { id: 'operations', name: 'Operations', progress: 81, detail: '11 / 15 staffed' },
    ],
    series: series('coverage', 7),
    listStrategy: grown,
  },
  payouts: {
    labels: {
      title: 'Payout desk',
      detail: 'Balance, pace and sweep lanes',
      sweep: 'Sweep funds',
      chartTitle: 'Payout pace',
      chart: 'Payout pace chart',
      lanes: 'Payout lanes',
      empty: 'No payout data',
    },
    metrics: [
      { id: 'available', label: 'Available', value: '$12,480', tone: 'success' },
      { id: 'pending', label: 'Pending', value: '$820' },
      { id: 'next', label: 'Next sweep', value: 'Tomorrow' },
    ],
    series: series('payouts'),
    lanes: [
      { id: 'ready', label: 'Ready · 18 payouts' },
      { id: 'review', label: 'Review · 2 payouts' },
    ],
  },
  scorecard: {
    labels: {
      title: 'Quarterly scorecard',
      detail: 'Objectives and key results',
      quarter: 'Quarter',
      empty: 'No objectives',
    },
    quarters: [
      { id: 'q2', label: 'Q2' },
      { id: 'q3', label: 'Q3' },
      { id: 'q4', label: 'Q4' },
    ],
    initialQuarterId: 'q3',
    objectives: [
      {
        id: 'reliable',
        title: 'Ship reliable runs',
        detail: (quarter) => `Key result 1 · ${quarter}`,
        progress: 46,
        progressLabel: 'Reliable runs progress',
        tone: 'success',
      },
      {
        id: 'review',
        title: 'Improve review time',
        detail: (quarter) => `Key result 2 · ${quarter}`,
        progress: 63,
        progressLabel: 'Review time progress',
        tone: 'warning',
      },
      {
        id: 'usage',
        title: 'Grow shared usage',
        detail: (quarter) => `Key result 3 · ${quarter}`,
        progress: 80,
        progressLabel: 'Shared usage progress',
        tone: 'success',
      },
    ],
    listStrategy: scroll,
  },
  serviceDetail: {
    labels: {
      title: 'Service detail',
      services: 'Services',
      open: (name) => `Open ${name}`,
      empty: 'No services',
    },
    initialServiceId: 'api',
    services: ['API gateway', 'Worker pool', 'Event stream', 'Storage'].map((name, index) => ({
      id: ['api', 'worker', 'stream', 'storage'][index]!,
      name,
      status: index === 2 ? 'Degraded' : 'Healthy',
      tone: index === 2 ? ('warning' as const) : ('success' as const),
      detail: 'Metrics, chart and activity',
      metrics: [
        { id: 'requests', label: 'Requests', value: String(1240 + name.length * 8) },
        { id: 'latency', label: 'Latency', value: `${120 + name.length * 3}ms` },
        { id: 'errors', label: 'Errors', value: '0.2%', tone: 'success' as const },
      ],
      activityTitle: 'Activity',
      activity: 'Latest deploy completed 2m ago. No unresolved incidents.',
    })),
    listStrategy: scroll,
  },
}

export function createHbarAppUiDashboardLocalizedFixtures(): HbarAppUiDashboardContent {
  return {
    ...HBAR_APP_UI_DASHBOARD_FIXTURES,
    overview: {
      ...HBAR_APP_UI_DASHBOARD_FIXTURES.overview!,
      labels: {
        ...HBAR_APP_UI_DASHBOARD_FIXTURES.overview!.labels,
        title: '运营总览',
        detail: '与上一周期对比',
        period: '本周期',
        empty: '暂无指标',
      },
      metrics: [
        {
          id: 'active',
          label: '活跃运行',
          value: '24',
          trend: '+12%',
          tone: 'success',
          series: series('active-cn', 7),
        },
      ],
    },
  }
}
