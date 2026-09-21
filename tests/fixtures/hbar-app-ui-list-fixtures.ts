import type { HbarAppUiListContent } from '../../packages/hbar-app-ui/src/index'

const scroll = { kind: 'pane-scroll', expectedMaximum: 80 } as const
const grown = { kind: 'content-grown', expectedMaximum: 16 } as const

export const HBAR_APP_UI_LIST_FIXTURES: HbarAppUiListContent = {
  metrics: {
    labels: {
      title: 'Defined metrics',
      detail: 'Expand a row to see its definition',
      expand: (label) => `Expand ${label}`,
      collapse: (label) => `Collapse ${label}`,
      empty: 'No metrics',
    },
    items: [
      {
        id: 'active-runs',
        label: 'Active runs',
        value: '24',
        description: 'Runs active in the selected period.',
        formula: 'aggregate(active_runs)',
      },
      {
        id: 'review-time',
        label: 'Review time',
        value: '2.4h',
        description: 'Median review duration.',
        formula: 'median(review_time)',
      },
      {
        id: 'success-rate',
        label: 'Success rate',
        value: '98.4%',
        description: 'Successful runs divided by all runs.',
        formula: 'ratio(successful_runs)',
      },
      {
        id: 'queue-depth',
        label: 'Queue depth',
        value: '8',
        description: 'Runs currently waiting for capacity.',
        formula: 'count(queued_runs)',
      },
    ],
    listStrategy: grown,
  },
  spend: {
    labels: {
      title: 'Ranked spend',
      detail: (period) => `Cost allocation · ${period}`,
      periods: 'Period',
      progress: (name) => `${name} spend share`,
      open: (name) => `Open ${name}`,
      empty: 'No spend data',
    },
    periods: [
      { id: '24h', label: '24h' },
      { id: '7d', label: '7d' },
      { id: '30d', label: '30d' },
    ],
    initialPeriodId: '7d',
    initialSelectedId: 'workspace',
    items: [
      { id: 'workspace', name: 'Workspace', share: 72, amount: '$32.00' },
      { id: 'automation', name: 'Automation', share: 59, amount: '$26.80' },
      { id: 'review', name: 'Review', share: 46, amount: '$21.60' },
      { id: 'archive', name: 'Archive', share: 33, amount: '$16.40' },
    ],
    listStrategy: scroll,
  },
  security: {
    labels: {
      title: 'Security events',
      detail: 'Filter the latest workspace activity',
      filters: 'Event type',
      empty: 'No matching security events',
    },
    filters: [
      { id: 'all', label: 'All' },
      { id: 'login', label: 'Login' },
      { id: 'policy', label: 'Policy' },
      { id: 'alert', label: 'Alert' },
    ],
    allFilterId: 'all',
    initialFilterId: 'all',
    events: [
      {
        id: 'login-1',
        kindId: 'login',
        kind: 'Login',
        title: 'Avery signed in',
        meta: 'Today · 10:24',
        tone: 'success',
      },
      {
        id: 'policy-1',
        kindId: 'policy',
        kind: 'Policy',
        title: 'Permission changed',
        meta: 'Today · 10:18',
        tone: 'warning',
      },
      {
        id: 'export-1',
        kindId: 'export',
        kind: 'Export',
        title: 'Report downloaded',
        meta: 'Today · 09:42',
        tone: 'neutral',
      },
      {
        id: 'alert-1',
        kindId: 'alert',
        kind: 'Alert',
        title: 'Failed login blocked',
        meta: 'Yesterday · 18:06',
        tone: 'danger',
      },
    ],
    listStrategy: scroll,
  },
  queue: {
    labels: {
      title: 'Publishing queue',
      detail: 'Pointer or keyboard reorder',
      status: 'Live updates',
      moveUp: (title) => `Move ${title} up`,
      moveDown: (title) => `Move ${title} down`,
      instructions: 'Use the arrow buttons to change order.',
      empty: 'The publishing queue is empty',
    },
    items: [
      { id: 'draft-release', title: 'Draft release' },
      { id: 'review-permissions', title: 'Review permissions' },
      { id: 'publish-notes', title: 'Publish notes' },
    ],
    listStrategy: grown,
  },
  assets: {
    labels: {
      title: 'Asset library',
      detail: (count) => `${count} selected`,
      clear: 'Clear',
      select: (name) => `Select ${name}`,
      archive: (count) => `Archive ${count} selected`,
      empty: 'No assets',
    },
    assets: [
      { id: 'design', name: 'design.fig', detail: 'Updated today' },
      { id: 'report', name: 'report.csv', detail: 'Updated today' },
      { id: 'archive', name: 'archive.zip', detail: 'Updated yesterday' },
      { id: 'brief', name: 'brief.md', detail: 'Updated yesterday' },
    ],
    listStrategy: scroll,
  },
  deliveries: {
    labels: {
      title: 'Webhook deliveries',
      detail: 'Outcome and endpoint filters',
      failedOnly: 'Failed only',
      expand: (id) => `Expand ${id}`,
      collapse: (id) => `Collapse ${id}`,
      replay: 'Replay',
      empty: 'No webhook deliveries',
    },
    deliveries: [
      {
        id: 'delivery_91a2',
        status: 'Delivered',
        tone: 'success',
        endpoint: '/events/run.updated',
        payload: '{"event":"run.updated","attempt":1,"duration":188}',
        failed: false,
      },
      {
        id: 'delivery_91a3',
        status: 'Failed',
        tone: 'danger',
        endpoint: '/events/run.updated',
        payload: '{"event":"run.updated","attempt":2,"duration":320}',
        failed: true,
      },
      {
        id: 'delivery_91a4',
        status: 'Delivered',
        tone: 'success',
        endpoint: '/events/run.updated',
        payload: '{"event":"run.updated","attempt":1,"duration":204}',
        failed: false,
      },
    ],
    listStrategy: scroll,
  },
  suppliers: {
    labels: {
      title: 'Supplier directory',
      detail: 'Search and category filter',
      search: 'Search suppliers',
      searchPlaceholder: 'Search suppliers',
      categoryFilter: 'Category',
      supplier: 'Supplier',
      category: 'Category',
      status: 'Status',
      empty: 'No suppliers match',
    },
    suppliers: [
      { id: 'avery', name: 'Avery Systems', category: 'Infrastructure', status: 'Active', tone: 'success' },
      { id: 'mina', name: 'Mina Cloud', category: 'Design', status: 'Active', tone: 'success' },
      { id: 'jon', name: 'Jon Logistics', category: 'Infrastructure', status: 'Review', tone: 'warning' },
      { id: 'sam', name: 'Sam Studio', category: 'Design', status: 'Active', tone: 'success' },
    ],
    listStrategy: scroll,
  },
  inbox: {
    labels: {
      title: 'Inbox',
      detail: (count) => `${count} unread`,
      unread: 'Unread',
      archive: (title) => `Archive ${title}`,
      snooze: 'Snooze',
      archived: (title) => `Archived ${title}`,
      undo: 'Undo',
      empty: 'Inbox cleared',
    },
    messages: [
      { id: 'sync', title: 'Workspace sync complete', meta: '1m ago', avatar: 'W' },
      { id: 'approval', title: 'Approval needs your decision', meta: '2m ago', avatar: 'A' },
      { id: 'export', title: 'Report export ready', meta: '3m ago', avatar: 'R' },
    ],
    listStrategy: scroll,
  },
  contacts: {
    labels: {
      title: 'Contacts',
      detail: 'Alphabet jump rail',
      relationship: 'Relationship',
      letters: 'Contact initials',
      empty: 'No contacts for this letter',
    },
    letters: ['A', 'I', 'J', 'L', 'M', 'S'].map((label) => ({ id: label.toLowerCase(), label })),
    initialLetterId: 'a',
    contacts: [
      { id: 'avery', name: 'Avery Chen', letterId: 'a', avatar: 'A', meta: 'Teammate' },
      { id: 'iris', name: 'Iris Wong', letterId: 'i', avatar: 'I', meta: 'Partner' },
      { id: 'jon', name: 'Jon Bell', letterId: 'j', avatar: 'J', meta: 'Teammate' },
      { id: 'lee', name: 'Lee Park', letterId: 'l', avatar: 'L', meta: 'Customer' },
      { id: 'mina', name: 'Mina Patel', letterId: 'm', avatar: 'M', meta: 'Teammate' },
      { id: 'sam', name: 'Sam Rivera', letterId: 's', avatar: 'S', meta: 'Partner' },
    ],
    listStrategy: scroll,
  },
  runbook: {
    labels: {
      title: 'Incident runbook',
      detail: (done, total) => `${done} of ${total} complete`,
      resolved: 'Resolved',
      inProgress: 'In progress',
      progress: 'Runbook progress',
      done: 'Done',
      pending: 'Pending',
      empty: 'No runbook steps',
    },
    initialCompletedCount: 2,
    steps: [
      { id: 'acknowledge', title: 'Acknowledge incident' },
      { id: 'health', title: 'Check service health' },
      { id: 'rollback', title: 'Rollback deployment' },
      { id: 'notify', title: 'Notify stakeholders' },
    ],
    listStrategy: grown,
  },
  leaderboard: {
    labels: {
      title: 'Support leaderboard',
      detail: 'Measure and period',
      measures: 'Measure',
      empty: 'No leaderboard entries',
    },
    measures: [
      { id: 'resolved', label: 'Resolved' },
      { id: 'speed', label: 'Speed' },
      { id: 'csat', label: 'CSAT' },
    ],
    initialMeasureId: 'resolved',
    entries: [
      {
        id: 'avery',
        name: 'Avery',
        values: { resolved: '42', speed: '18m', csat: '98%' },
        trend: '↑ 2',
        trendTone: 'success',
      },
      {
        id: 'mina',
        name: 'Mina',
        values: { resolved: '37', speed: '21m', csat: '94%' },
        trend: '↑ 2',
        trendTone: 'success',
      },
      {
        id: 'jon',
        name: 'Jon',
        values: { resolved: '32', speed: '24m', csat: '90%' },
        trend: '↓ 1',
        trendTone: 'danger',
      },
      {
        id: 'sam',
        name: 'Sam',
        values: { resolved: '27', speed: '28m', csat: '86%' },
        trend: '—',
        trendTone: 'neutral',
      },
    ],
    listStrategy: scroll,
  },
  tree: {
    labels: {
      title: 'File tree',
      detail: 'Keyboard traversal and indent guides',
      expand: (name) => `Expand ${name}`,
      collapse: (name) => `Collapse ${name}`,
      open: (name) => `Open ${name}`,
      empty: 'No files',
    },
    initialOpenIds: ['src', 'docs'],
    nodes: [
      {
        id: 'src',
        name: 'src/',
        children: [
          { id: 'app', name: 'App.tsx' },
          { id: 'activity-panel', name: 'ActivityPanel.tsx' },
        ],
      },
      {
        id: 'docs',
        name: 'docs/',
        children: [
          { id: 'architecture', name: 'architecture.md' },
          { id: 'testing', name: 'testing.md' },
        ],
      },
    ],
    listStrategy: grown,
  },
}

export function createHbarAppUiListLocalizedFixtures(): HbarAppUiListContent {
  return {
    ...HBAR_APP_UI_LIST_FIXTURES,
    metrics: {
      ...HBAR_APP_UI_LIST_FIXTURES.metrics!,
      labels: {
        ...HBAR_APP_UI_LIST_FIXTURES.metrics!.labels,
        title: '指标定义',
        detail: '展开一行查看计算方式',
        empty: '暂无指标',
      },
      items: [
        {
          id: 'active-runs',
          label: '活跃运行',
          value: '24',
          description: '所选时段内正在运行的任务。',
          formula: 'aggregate(active_runs)',
        },
      ],
    },
  }
}
