import type { HbarAppUiAnalyticsContent } from '../../packages/hbar-app-ui/src/index'

const scroll = { kind: 'pane-scroll', expectedMaximum: 80 } as const
const grown = { kind: 'content-grown', expectedMaximum: 16 } as const
const points = (prefix: string, count = 10) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    value: 18 + ((prefix.length + index * 19) % 76),
  }))
const metrics = (range: string) => [
  {
    id: 'throughput',
    label: 'Throughput',
    value: '24',
    detail: `${range} · +3%`,
    trend: '+3%',
    tone: 'success' as const,
    series: points(`throughput-${range}`, 5),
  },
  {
    id: 'quality',
    label: 'Quality',
    value: '42',
    detail: `${range} · +4%`,
    trend: '+4%',
    tone: 'success' as const,
    series: points(`quality-${range}`, 5),
  },
  {
    id: 'latency',
    label: 'Latency',
    value: '1.8s',
    detail: `${range} · +5%`,
    trend: '−5%',
    tone: 'danger' as const,
    series: points(`latency-${range}`, 5),
  },
  {
    id: 'cost',
    label: 'Cost',
    value: '78',
    detail: `${range} · +6%`,
    trend: '+6%',
    tone: 'success' as const,
    series: points(`cost-${range}`, 5),
  },
]

export const HBAR_APP_UI_ANALYTICS_FIXTURES: HbarAppUiAnalyticsContent = {
  range: {
    labels: {
      title: 'Metric strip',
      detail: 'Hover to scrub sparklines',
      ranges: 'Range',
      chart: (label) => `${label} sparkline`,
      empty: 'No metrics',
    },
    ranges: [
      { id: '24h', label: '24h' },
      { id: '7d', label: '7d' },
      { id: '30d', label: '30d' },
    ],
    initialRangeId: '7d',
    metricsByRange: { '24h': metrics('24h'), '7d': metrics('7d'), '30d': metrics('30d') },
    listStrategy: grown,
  },
  area: {
    labels: {
      title: 'Area chart',
      detail: 'Crosshair and keyboard cursor',
      moveCursor: 'Move cursor',
      chart: 'Area chart',
      cursor: (position, value) => `${position} · ${value}`,
      empty: 'No chart data',
    },
    points: points('area', 14),
    cursorStep: 12,
    cursorValue: '128 runs',
    metrics: [
      { id: 'total', label: 'Total', value: '2,418' },
      { id: 'average', label: 'Average', value: '345 / day' },
      { id: 'delta', label: 'Delta', value: '+18%', tone: 'success' },
    ],
  },
  grouped: {
    labels: {
      title: 'Grouped bars',
      detail: 'Toggle series and follow values',
      series: 'Series',
      value: (label, index, value) => `${label}, point ${index + 1}, ${value}`,
      empty: 'Select at least one series',
    },
    series: [
      { id: 'runs', label: 'Runs', values: points('runs', 8).map((item) => item.value) },
      { id: 'reviews', label: 'Reviews', values: points('reviews', 8).map((item) => item.value - 8) },
      { id: 'errors', label: 'Errors', values: points('errors', 8).map((item) => item.value - 14) },
    ],
    initialSeriesIds: ['runs', 'reviews'],
    listStrategy: grown,
  },
  stacked: {
    labels: {
      title: 'Stacked area',
      detail: 'Cumulative totals and share mode',
      totals: 'Show totals',
      share: 'Show share',
      chart: 'Stacked series',
      empty: 'No series',
    },
    series: [
      { id: 'runs', label: 'Runs', values: [78] },
      { id: 'reviews', label: 'Reviews', values: [54] },
      { id: 'errors', label: 'Errors', values: [32] },
    ],
    totalValues: [78, 54, 32],
    shareValues: [58, 38, 22],
  },
  donut: {
    labels: {
      title: 'Donut breakdown',
      detail: 'Legend follows the centre total',
      chart: 'Workload breakdown',
      select: (label) => `Select ${label}`,
      empty: 'No breakdown data',
    },
    initialItemId: 'runs',
    items: [
      { id: 'runs', label: 'Runs', value: '2,418', percent: 58, tone: 'primary' },
      { id: 'reviews', label: 'Reviews', value: '384', percent: 28, tone: 'purple' },
      { id: 'errors', label: 'Errors', value: '62', percent: 14, tone: 'danger' },
    ],
  },
  ranked: {
    labels: {
      title: 'Ranked sources',
      detail: 'Composition bars and row sparklines',
      sourceView: 'Source view',
      progress: (label) => `${label} share`,
      chart: (label) => `${label} trend`,
      empty: 'No sources',
    },
    items: [
      { id: 'workspace', label: 'Workspace', value: '68% share', share: 68, series: points('workspace', 5) },
      { id: 'automation', label: 'Automation', value: '57% share', share: 57, series: points('automation', 5) },
      { id: 'external', label: 'External API', value: '46% share', share: 46, series: points('external', 5) },
      { id: 'manual', label: 'Manual', value: '35% share', share: 35, series: points('manual', 5) },
    ],
    listStrategy: scroll,
  },
  cards: {
    labels: {
      title: 'Sparkline cards',
      detail: 'Direction-aware deltas',
      promote: (label) => `Promote next from ${label}`,
      panelTitle: (label) => `${label} detail`,
      panelBody: 'Selected metric is promoted into the detail panel.',
      empty: 'No metric cards',
    },
    initialMetricId: 'throughput',
    metrics: metrics('7d'),
    listStrategy: grown,
  },
  funnel: {
    labels: {
      title: 'Conversion funnel',
      detail: 'Drop-off per stage',
      highlight: 'Highlight worst step',
      progress: (label) => `${label} conversion`,
      empty: 'No funnel stages',
    },
    worstStageId: 'retained',
    stages: [
      { id: 'visited', label: 'Visited', value: 100, detail: 'entry' },
      { id: 'started', label: 'Started', value: 72, detail: '−28%' },
      { id: 'completed', label: 'Completed', value: 48, detail: '−24%' },
      { id: 'retained', label: 'Retained', value: 31, detail: '−17%', tone: 'warning' },
    ],
    listStrategy: grown,
  },
  heatmap: {
    labels: {
      title: 'Activity heatmap',
      detail: 'Keyboard cursor and day tooltips',
      cursor: (label) => `Cursor: ${label}`,
      less: 'Less',
      more: 'More',
      selected: (label) => `Selected: ${label}`,
      empty: 'No activity days',
    },
    initialCellId: 'day-18',
    cells: Array.from({ length: 35 }, (_, index) => ({
      id: `day-${index + 1}`,
      label: `Day ${index + 1}`,
      level: (index % 5) as 0 | 1 | 2 | 3 | 4,
    })),
    listStrategy: grown,
  },
  goals: {
    labels: {
      title: 'Goal gauges',
      detail: 'Target ticks and attainment sweeps',
      replay: 'Replay sweep',
      progress: (label) => `${label} attainment`,
      empty: 'No goals',
    },
    goals: [
      { id: 'activation', label: 'Activation', value: 52, valueLabel: '52%' },
      { id: 'retention', label: 'Retention', value: 66, valueLabel: '66%' },
      { id: 'quality', label: 'Quality', value: 80, valueLabel: '80%' },
    ],
  },
  cohort: {
    labels: {
      title: 'Cohort retention',
      detail: 'Pinned labels · value shading',
      change: 'Change cohort',
      cohort: 'Cohort',
      value: (cohort, period, value) => `${cohort}, ${period}, ${value}%`,
      empty: 'No cohorts',
    },
    periods: ['W0', 'W1', 'W2', 'W3', 'W4'].map((label) => ({ id: label.toLowerCase(), label })),
    cohorts: ['Sep 01', 'Sep 08', 'Sep 15', 'Sep 22'].map((label, row) => ({
      id: `cohort-${row}`,
      label,
      values: [0, 1, 2, 3, 4].map((column) => Math.max(18, 94 - row * 11 - column * 9)),
    })),
    listStrategy: scroll,
  },
  ranking: {
    labels: {
      title: 'Horizontal ranking',
      detail: 'Sortable measures',
      sort: (label) => `Sort: ${label}`,
      sorts: ['Value', 'Delta'],
      progress: (label) => `${label} rank value`,
      empty: 'No ranking data',
    },
    items: [
      { id: 'workspace', label: 'Workspace', value: 82, delta: 8 },
      { id: 'automation', label: 'Automation', value: 68, delta: 12 },
      { id: 'review', label: 'Review', value: 54, delta: -2 },
      { id: 'archive', label: 'Archive', value: 40, delta: 4 },
    ],
    listStrategy: scroll,
  },
  candles: {
    labels: {
      title: 'Candlestick chart',
      detail: 'Volume histogram · OHLC tooltip',
      show: 'Show OHLC',
      chart: 'Candlestick price chart',
      candle: (item) => `${item.id}: open ${item.open}, high ${item.high}, low ${item.low}, close ${item.close}`,
      volume: 'Volume histogram',
      empty: 'No candles',
    },
    candles: Array.from({ length: 10 }, (_, index) => ({
      id: `candle-${index}`,
      open: 40 + index * 3,
      high: 68 + index * 2,
      low: 24 + index,
      close: 44 + index * 2 + (index % 2 ? -6 : 8),
      volume: 22 + index * 7,
    })),
  },
  scatter: {
    labels: {
      title: 'Scatter plot',
      detail: 'Quadrants · bubble sizing · hit testing',
      nearest: 'Nearest point',
      chart: 'Scatter plot',
      point: (label) => `Select ${label}`,
      selected: (label) => `${label} selected`,
      empty: 'No points',
    },
    nearestPointId: 'point-3',
    points: Array.from({ length: 12 }, (_, index) => ({
      id: `point-${index}`,
      label: `Point ${index + 1}`,
      x: 10 + ((index * 17) % 80),
      y: 12 + ((index * 23) % 72),
      size: 8 + (index % 5),
    })),
  },
  bullets: {
    labels: {
      title: 'Bullet charts',
      detail: 'Targets, deltas and sortable rows',
      sort: (label) => `Sort ${label}`,
      sorts: ['delta', 'target'],
      progress: (label) => `${label} value and target`,
      empty: 'No bullet rows',
    },
    items: [
      { id: 'throughput', label: 'Throughput', value: 48, target: 62, detail: '48% / target 62%' },
      { id: 'quality', label: 'Quality', value: 60, target: 68, detail: '60% / target 68%' },
      { id: 'coverage', label: 'Coverage', value: 72, target: 74, detail: '72% / target 74%' },
      { id: 'recovery', label: 'Recovery', value: 84, target: 80, detail: '84% / target 80%' },
    ],
    listStrategy: scroll,
  },
  combo: {
    labels: {
      title: 'Bars + trend line',
      detail: 'Dual-axis combo chart',
      inspect: 'Inspect axes',
      bars: 'Run volumes',
      trend: 'Conversion trend',
      primaryAxis: 'Runs',
      secondaryAxis: 'Conversion %',
      empty: 'No combo chart data',
    },
    bars: points('combo-bars', 8),
    trend: points('combo-trend', 8),
  },
}

export function createHbarAppUiAnalyticsLocalizedFixtures(): HbarAppUiAnalyticsContent {
  return {
    ...HBAR_APP_UI_ANALYTICS_FIXTURES,
    range: {
      ...HBAR_APP_UI_ANALYTICS_FIXTURES.range!,
      labels: {
        ...HBAR_APP_UI_ANALYTICS_FIXTURES.range!.labels,
        title: '指标趋势',
        detail: '切换范围查看迷你趋势图',
        ranges: '时间范围',
        empty: '暂无指标',
      },
      metricsByRange: {
        '24h': [{ id: 'throughput', label: '吞吐量', value: '24', detail: '24 小时', series: points('cn-24h', 5) }],
        '7d': [{ id: 'throughput', label: '吞吐量', value: '168', detail: '7 天', series: points('cn-7d', 5) }],
        '30d': [{ id: 'throughput', label: '吞吐量', value: '720', detail: '30 天', series: points('cn-30d', 5) }],
      },
    },
  }
}
