import type { LumenDashboardReferenceContent } from '@lumen/app-ui/catalog'

type Metric = Extract<LumenDashboardReferenceContent, { kind: 'revenue' }>['metrics'][number]
type Chart = Extract<LumenDashboardReferenceContent, { kind: 'revenue' }>['chart']
type Table = Extract<LumenDashboardReferenceContent, { kind: 'modules' }>['table']
type Entry = Extract<LumenDashboardReferenceContent, { kind: 'web-analytics' }>['pages'][number]
const grown = { kind: 'content-grown', expectedMaximum: 16 } as const
const pane = { kind: 'pane-scroll', expectedMaximum: 80 } as const
const rising = [12, 16, 15, 22, 26, 24, 34, 40, 43, 51]
const falling = [...rising].reverse()
const wave = [48, 46, 24, 32, 50, 34, 22, 30, 49, 24]
const noSelect = (_slot: string, _id: string) => undefined
const noFlag = (_id: string, _value: boolean) => undefined
const base = (title: string) => ({
  title,
  listStrategy: grown,
  labels: {
    empty: 'No records match this view.',
    unavailable: 'This reference snapshot does not include data for this selection.',
    clear: 'Clear filters',
  },
  onSelect: noSelect,
  onFlag: noFlag,
  onQuery: (_value: string) => undefined,
  onRequest: (_action: { readonly id: string }) => undefined,
})
const choices = (pairs: readonly (readonly [string, string])[]) => pairs.map(([id, label]) => ({ id, label }))
const action = (id: string, label: string, value?: string, primary = false) => ({
  id,
  label,
  ...(value === undefined ? {} : { value }),
  primary,
})
const metric = (
  id: string,
  label: string,
  value: string,
  delta?: string,
  detail?: string,
  tone: Metric['tone'] = 'neutral',
  points?: readonly number[],
): Metric => ({ id, label, value, delta, detail, tone, points })
const entry = (
  id: string,
  title: string,
  value?: string,
  detail?: string,
  progress?: number,
  tone: Entry['tone'] = 'neutral',
): Entry => ({ id, title, value, detail, progress, tone })
const columns = (labels: readonly string[], wide: readonly string[] = []): Table['columns'] =>
  labels.map((label) => ({ id: label.toLowerCase().replace(/\W+/g, '-'), label, narrow: !wide.includes(label) }))
const table = (
  title: string,
  labels: readonly string[],
  records: readonly (readonly string[])[],
  wide: readonly string[] = [],
  detail?: string,
): Table => ({
  title,
  detail,
  columns: columns(labels, wide),
  rows: records.map((record, index) => ({
    id: record[0] ?? `${title}-${index}`,
    cells: record.map((text) => ({ text })),
  })),
})
const chart = (
  title: string,
  type: NonNullable<Chart>['type'],
  points: readonly number[],
  axis: readonly string[],
  ticks: readonly string[],
  extra: Partial<NonNullable<Chart>> = {},
): NonNullable<Chart> => ({ title, label: `${title} chart`, type, points, axis, ticks, ...extra })

// Values and text are from authorized rendered-preview observations. Chart paths are
// deliberately inferred from the visible trend, not claimed as exact source series.
export function createDashboardPreviewReferenceContent(
  variant: number,
  mode = 'default',
): LumenDashboardReferenceContent {
  let content: LumenDashboardReferenceContent
  switch (variant) {
    case 1:
      content = {
        ...base('Revenue'),
        kind: 'revenue',
        choices: choices([['6m', 'Last 6 months']]),
        selectedId: '6m',
        choiceLabel: 'Date range',
        metrics: [
          metric('net', 'Net revenue', '$2.59M', '+12.4%', 'vs. prior 6 months', 'success', rising),
          metric('paid', 'Paid accounts', '3,914', '+4.1%', 'vs. prior 6 months', 'success', rising),
          metric('contract', 'Average contract', '$1,284', '−2.3%', 'vs. prior 6 months', 'danger', falling),
          metric('churn', 'Monthly churn', '1.8%', '+0.3 pp', 'vs. prior 6 months', 'danger', rising),
        ],
        chart: chart(
          'Net revenue by month',
          'bar',
          [375, 405, 423, 452, 471, 489],
          ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
          ['500', '375', '250', '125', '0'],
          { unit: 'USD, thousands' },
        ),
      }
      break
    case 2:
      content = {
        ...base('Signups'),
        kind: 'signups',
        choices: choices([
          ['7d', '7 days'],
          ['30d', '30 days'],
          ['90d', '90 days'],
        ]),
        selectedId: '30d',
        choiceLabel: 'Date range',
        chart: chart(
          'Signups',
          'line',
          [355, 412, 397, 445, 475, 495, 462, 515, 530, 525, 565, 580, 610, 626, 650],
          ['Feb 8', 'Feb 15', 'Feb 22', 'Mar 1', 'Mar 8'],
          ['700', '525', '350', '175', '0'],
          {
            value: '12,847',
            delta: '+12.4% vs. previous 30 days',
            secondary: [525, 525, 525],
            legend: ['Signups', 'Target'],
          },
        ),
        breakdown: table(
          'Signups by source',
          ['Source', 'Signups', 'Share', 'Conv. rate', 'Trend'],
          [
            ['Organic search', '5,139', '40.0%', '3.9%', ''],
            ['Direct', '3,083', '24.0%', '5.1%', ''],
            ['Referral', '2,184', '17.0%', '2.8%', ''],
            ['Social', '1,439', '11.2%', '1.6%', ''],
            ['Email', '1,002', '7.8%', '6.4%', ''],
          ],
          ['Share', 'Trend'],
        ),
      }
      break
    case 3:
      content = {
        ...base('Web analytics'),
        kind: 'web-analytics',
        period: 'Updated 2 min ago',
        metrics: [
          metric('active', 'Active users', '8,472', '+3.2%', 'vs. last week', 'success', rising),
          metric('sessions', 'Sessions', '21,908', '+5.1%', 'vs. last week', 'success', rising),
          metric('duration', 'Avg. session', '4m 12s', '−1.4%', 'vs. last week', 'danger', falling),
          metric('bounce', 'Bounce rate', '38.6%', '+0.9 pp', 'vs. last week', 'danger', rising),
        ],
        chart: chart(
          'Sessions, last 14 days',
          'bar',
          [42, 38, 45, 50, 47, 52, 60, 56, 60, 57, 62, 65, 67, 70],
          ['Mar 1', 'Mar 14'],
          [],
        ),
        pages: [
          entry('home', '/', '48,210'),
          entry('pricing', '/pricing', '22,984'),
          entry('quickstart', '/docs/quickstart', '18,663'),
          entry('changelog', '/changelog', '9,120'),
          entry('blog', '/blog/series-b', '6,845'),
        ],
        devices: [
          entry('desktop', 'Desktop', '62%', undefined, 62),
          entry('mobile', 'Mobile', '31%', undefined, 31),
          entry('tablet', 'Tablet', '7%', undefined, 7),
        ],
        funnel: [
          entry('visited', '1 · Visited', '21,908'),
          entry('signed-up', '2 · Signed up', '3,914'),
          entry('activated', '3 · Activated', '2,180'),
          entry('subscribed', '4 · Subscribed', '1,024'),
        ],
        titles: {
          pages: 'Top pages',
          devices: 'Devices',
          funnel: 'Signup funnel',
          menu: (title) => `${title} options`,
        },
        menuActions: [action('refresh-widget', 'Refresh data'), action('hide-widget', 'Hide widget')],
        hiddenWidgetIds: [],
      }
      break
    case 4:
      content = {
        ...base('System status'),
        kind: 'status',
        subtitle: '2 incidents open',
        period: 'Updated 2 min ago',
        metrics: [
          metric('uptime', 'Uptime, 30 days', '99.98%', '+0.02 pp', 'vs. prior period', 'success', rising),
          metric('incidents', 'Open incidents', '2', '+1', 'vs. prior period', 'danger', wave),
          metric('latency', 'P95 latency', '142 ms', '+18 ms', 'vs. prior period', 'danger', rising),
          metric('errors', 'Error rate', '0.04%', '−0.01 pp', 'vs. prior period', 'success', falling),
        ],
        services: table(
          'Services',
          ['Service', 'Latency', 'Uptime', 'Status'],
          [
            ['REST API · us-east-1', '142 ms', '99.98%', 'Operational'],
            ['REST API · eu-west-1', '168 ms', '99.95%', 'Operational'],
            ['Web app · global edge', '61 ms', '100.00%', 'Operational'],
            ['Auth service · us-east-1', '118 ms', '99.99%', 'Operational'],
            ['Postgres primary · us-east-1', '4 ms', '99.97%', 'Operational'],
            ['Search cluster · us-west-2', '402 ms', '99.62%', 'Degraded'],
            ['Webhooks worker · us-east-1', '-', '96.20%', 'Down'],
            ['Object storage · eu-west-1', '33 ms', '99.99%', 'Operational'],
            ['Analytics pipeline · us-west-2', '-', '-', 'Maintenance'],
          ],
          ['Latency', 'Uptime'],
        ),
        incidents: [
          entry(
            'search',
            'Elevated search latency in us-west-2',
            undefined,
            'Investigating · 14 min ago',
            undefined,
            'warning',
          ),
          entry('webhook', 'Webhook delivery failures', undefined, 'Identified · 38 min ago', undefined, 'danger'),
          entry('backfill', 'Analytics backfill maintenance', undefined, 'Scheduled · 2 hours ago'),
          entry('auth', 'Auth latency spike', undefined, 'Resolved · Yesterday'),
          entry('cdn', 'CDN cache purge delays', undefined, 'Resolved · 2 days ago'),
          entry('postgres', 'Postgres failover drill', undefined, 'Resolved · Mar 4'),
          entry('rate', 'Rate limit errors on /v1/events', undefined, 'Resolved · Mar 2'),
        ],
        incidentTitle: 'Incidents · 7',
        refresh: action('refresh', 'Refresh'),
      }
      break
    case 5:
      content = {
        ...base('Usage'),
        kind: 'usage',
        period: 'Mar 1 – Mar 31',
        plan: {
          title: 'Team plan',
          detail: '$99 / month · renews Mar 31',
          action: action('upgrade', 'Upgrade plan', undefined, true),
        },
        quotaTitle: 'Included this month',
        quotas: [
          entry('api', 'API requests', '1.24M / 2M', undefined, 62),
          entry('seats', 'Seats', '18 / 20', undefined, 90, 'warning'),
          entry('storage', 'Storage', '41.2 GB / 50 GB', undefined, 82.4),
          entry('build', 'Build minutes', '4,820 / 5,000', undefined, 96.4, 'danger'),
          entry('bandwidth', 'Bandwidth', '320 GB / 1 TB', undefined, 32),
        ],
        chart: chart(
          'Build minutes burn-down',
          'dual-line',
          [0, 1600, 3200, 4820],
          ['Mar 1', 'Mar 11', 'Mar 21', 'Mar 31'],
          ['9k', '6k', '3k', '0'],
          {
            detail: 'Projected to exceed the 5,000 minute allowance on Mar 19',
            secondary: [0, 2700, 5700, 8300],
            legend: ['Used', 'Projected', 'Allowance'],
          },
        ),
      }
      break
    case 6:
      content = {
        ...base('Channels'),
        kind: 'channels',
        subtitle: '16 channels · Mar 1 – Mar 31',
        choices: choices([
          ['views', 'Views'],
          ['signups', 'Signups'],
          ['revenue', 'Revenue'],
        ]),
        selectedId: 'signups',
        choiceLabel: 'Measure',
        compare: true,
        compareLabel: 'Compare to previous',
        table: table(
          'Signups by channel',
          ['Channel', 'Signups', 'Change', 'Trend'],
          [
            ['Organic search', '5,140', '+7.4%', ''],
            ['Paid search', '3,082', '+2.4%', ''],
            ['Direct', '2,190', '−2.2%', ''],
            ['Email', '1,000', '+8.1%', ''],
            ['Referral', '690', '+3.0%', ''],
            ['Social organic', '420', '−6.8%', ''],
            ['Social paid', '315', '+10.4%', ''],
            ['Affiliates', '240', '−0.2%', ''],
            ['Marketplace', '180', '+16.0%', ''],
            ['Podcast ads', '300', '+5.9%', ''],
            ['Webinars', '260', '+3.6%', ''],
            ['Partnerships', '150', '+0.0%', ''],
            ['Community', '120', '−4.1%', ''],
            ['Press mentions', '95', '−7.2%', ''],
            ['Newsletter sponsorships', '205', '+4.8%', ''],
            ['Conferences', '88', '−3.3%', ''],
          ],
          ['Trend'],
        ),
      }
      break
    case 7:
      content = {
        ...base('Recurring revenue'),
        kind: 'recurring',
        choices: choices([
          ['ready', 'Ready'],
          ['loading', 'Loading'],
          ['empty', 'Empty'],
        ]),
        selectedId: 'ready',
        choiceLabel: 'Preview state',
        mode: 'ready',
        chart: chart(
          'Monthly recurring revenue',
          'line',
          [109, 111, 118, 120, 127, 132, 136, 140, 144, 148],
          ['Jun', 'Sep', 'Dec', 'Mar'],
          ['$160k', '$120k', '$80k', '$40k', '$0'],
          { value: '$148.2K', delta: '+$4.2K (+2.9%) vs. last month' },
        ),
        metrics: [
          metric('new', 'New business', '$9.1K', '+12.4%', 'vs. last month', 'success'),
          metric('expansion', 'Expansion', '$3.6K', '+4.8%', 'vs. last month', 'success'),
          metric('churn', 'Churn', '$8.5K', '+6.1%', 'vs. last month', 'danger'),
        ],
        emptyTitle: 'No revenue data yet',
        emptyBody: 'Revenue will appear here once your first subscription starts.',
        loadingLabel: 'Loading revenue',
      }
      break
    case 8:
      content = modules()
      break
    case 9:
      content = delivery()
      break
    case 10:
      content = explorer()
      break
    case 11:
      content = coverage()
      break
    case 12:
      content = payout()
      break
    case 13:
      content = goals()
      break
    default:
      content = service()
      break
  }
  if (content.kind === 'signups' && content.breakdown)
    content = { ...content, breakdown: withTrends(content.breakdown) }
  if (content.kind === 'channels' && content.table) content = { ...content, table: withTrends(content.table) }
  if (content.kind === 'delivery' && content.worklog)
    content = { ...content, previousWorklog: previousWorklog(content.worklog) }
  if (mode === 'localized')
    content = {
      ...content,
      title: 'Übersicht der langfristigen Betriebsleistung und gemeinsam verantworteten Ergebnisse',
      labels: {
        ...content.labels,
        empty: 'Für diese Ansicht sind derzeit keine Datensätze verfügbar.',
        unavailable: 'Für diese Auswahl enthält die Referenzaufnahme noch keine bestätigten Daten.',
        clear: 'Filter zurücksetzen',
      },
    }
  if (mode === 'empty') {
    switch (content.kind) {
      case 'modules':
        content = { ...content, table: { ...content.table, rows: [] } }
        break
      case 'service':
        content = { ...content, services: [] }
        break
      case 'goals':
        content = { ...content, objectives: [] }
        break
      case 'revenue':
      case 'signups':
      case 'web-analytics':
      case 'status':
      case 'usage':
      case 'channels':
      case 'recurring':
      case 'delivery':
      case 'explorer':
      case 'coverage':
      case 'payout':
        break
    }
  }
  if (mode === 'one' && content.kind === 'modules')
    content = { ...content, table: { ...content.table, rows: content.table.rows.slice(0, 1) } }
  if (mode === 'overflow' && content.kind === 'modules')
    content = {
      ...content,
      listStrategy: pane,
      table: {
        ...content.table,
        rows: Array.from({ length: 81 }, (_, index) => ({
          id: `capacity-module-${index}`,
          cells: [
            { text: '42% ready', progress: 42, detail: '11/26 tasks' },
            { text: `Preview capacity module ${index + 1}`, detail: 'Synthetic capacity fixture' },
            { text: 'Apr 22 – May 06', detail: '14-day window' },
            { text: 'In progress' },
          ],
        })),
      },
    }
  return content
}
function withTrends(value: Table): Table {
  return {
    ...value,
    rows: value.rows.map((row, index) => ({
      ...row,
      cells: row.cells.map((cell, column) =>
        column === row.cells.length - 1
          ? { ...cell, points: index % 3 === 0 ? rising : index % 3 === 1 ? wave : falling }
          : cell,
      ),
    })),
  }
}
function modules(): Extract<LumenDashboardReferenceContent, { kind: 'modules' }> {
  const records = [
    [
      'access',
      '42',
      '11/26',
      'Access Matrix',
      'System · NV Nora Vale · admin.atlas.dev',
      'Apr 22 – May 06',
      '14-day window',
      'In progress',
    ],
    [
      'api',
      '91',
      '29/32',
      'API Console',
      'Feature · LW Lena Wade · api.atlas.dev',
      'Apr 12 – Apr 26',
      '14-day window',
      'In progress',
    ],
    [
      'blocks',
      '33',
      '10/30',
      'Block Library',
      'Feature · SR Sofia Romero · blocks.atlas.dev',
      'Apr 24 – May 10',
      '16-day window',
      'Planned',
    ],
    [
      'retention',
      '22',
      '7/32',
      'Data Retention',
      'System · KT Kenji Tan · privacy.atlas.dev',
      'Apr 27 – May 14',
      '17-day window',
      'Backlog',
    ],
    [
      'docs',
      '14',
      '2/14',
      'Docs Portal',
      'Area · NS Nina Santos · docs.atlas.dev',
      'Apr 21 – May 05',
      '14-day window',
      'Blocked',
    ],
    [
      'help',
      '39',
      '9/23',
      'Help Center',
      'Area · SR Sofia Romero · help.atlas.dev',
      'Apr 23 – May 11',
      '18-day window',
      'Planned',
    ],
    [
      'identity',
      '89',
      '24/27',
      'Identity Broker',
      'System · KT Kenji Tan · id.atlas.dev',
      'Apr 08 – Apr 25',
      '17-day window',
      'In progress',
    ],
    [
      'ledger',
      '24',
      '5/21',
      'Ledger Export',
      'Feature · MB Marco Bianchi · billing.atlas.dev',
      'Apr 29 – May 19',
      '20-day window',
      'Backlog',
    ],
    [
      'notifications',
      '75',
      '18/24',
      'Notification Hub',
      'Feature · LW Lena Wade · notify.atlas.dev',
      'Apr 15 – Apr 30',
      '15-day window',
      'In progress',
    ],
    [
      'search',
      '68',
      '13/19',
      'Search Index',
      'System · NV Nora Vale · search.atlas.dev',
      'Apr 18 – May 02',
      '14-day window',
      'In progress',
    ],
    [
      'usage',
      '17',
      '3/18',
      'Usage Meter',
      'Feature · MB Marco Bianchi · meter.atlas.dev',
      'May 02 – May 22',
      '20-day window',
      'Planned',
    ],
    [
      'webhook',
      '80',
      '16/20',
      'Webhook Relay',
      'System · NS Nina Santos · hooks.atlas.dev',
      'Apr 11 – Apr 28',
      '17-day window',
      'In progress',
    ],
  ] as const
  return {
    ...base('Home / Atlas'),
    kind: 'modules',
    metrics: [
      metric('net', 'Net revenue', '$6.2k', '+12.4%', 'atlas.dev · 28 days', 'success', wave),
      metric('signups', 'Signups', '4,238', '+6.1%', 'All channels · 28 days', 'success', wave),
      metric('licenses', 'Active licenses', '1,907', '−2.3%', 'Atlas Cloud · 28 days', 'danger', wave),
    ],
    query: '',
    descending: false,
    sortColumnId: 'module',
    starredIds: ['access', 'api', 'notifications'],
    filterOpen: false,
    menuActions: [
      action('rename-module', 'Rename module'),
      action('duplicate-module', 'Duplicate'),
      action('move-module', 'Move to area'),
      action('archive-module', 'Archive'),
    ],
    emptyTitle: (query) => `No modules match “${query}”`,
    emptyBody: 'Try a module name, an owner, or a hostname.',
    clearSearch: 'Clear search',
    filters: choices([
      ['all', 'All statuses'],
      ['In progress', 'In progress'],
      ['Planned', 'Planned'],
      ['Backlog', 'Backlog'],
      ['Blocked', 'Blocked'],
    ]),
    selectedFilterId: 'all',
    actions: [action('invite', 'Invite'), action('add-module', 'Add module', undefined, true)],
    toolbar: {
      search: 'Search modules',
      ascending: 'Ascending',
      descending: 'Descending',
      filters: 'Filters',
      sort: (name) => `Sort by ${name.toLowerCase()}`,
      document: (name) => `Open ${name} spec`,
      star: (name) => `Star ${name}`,
      more: (name) => `More actions for ${name}`,
    },
    table: {
      title: 'Modules',
      columns: columns(['Progress', 'Module', 'Window', 'Status', 'Actions'], ['Window', 'Status', 'Actions']),
      rows: records.map(([id, progress, tasks, name, detail, window, windowDetail, status]) => ({
        id,
        cells: [
          { text: `${progress}% ready`, detail: `${tasks} tasks`, progress: Number(progress) },
          { text: name, detail },
          { text: window, detail: windowDetail },
          { text: status, tone: status === 'Blocked' ? 'warning' : 'neutral' },
        ],
      })),
    },
  }
}
function delivery(): Extract<LumenDashboardReferenceContent, { kind: 'delivery' }> {
  const records = [
    [
      'amara',
      'Amara Ortiz',
      'Client delivery lead',
      ['7h', '6h', '6h', '7h 30m', '8h'],
      ['Client', 'Client', 'Client', 'Client', 'Internal'],
      '34h 30m',
      '108% of 32h',
    ],
    [
      'theo',
      'Theo Mercer',
      'Platform engineer',
      ['6h', '7h', '8h 30m', '9h', '8h'],
      ['Client', 'Client', 'Client', 'Client', 'Client'],
      '38h 30m',
      '96% of 40h',
    ],
    [
      'lena',
      'Lena Hoffman',
      'Content systems editor',
      ['7h', '7h 30m', '7h', '5h', '4h'],
      ['Client', 'Internal', 'Client', 'Client', 'Client'],
      '30h 30m',
      '102% of 30h',
    ],
    [
      'idris',
      'Idris Bello',
      'Integration engineer',
      ['9h', '8h', '7h', '7h 30m', '8h 30m'],
      ['Internal', 'Client', 'Client', 'Client', 'Client'],
      '40h',
      '105% of 38h',
    ],
    [
      'marta',
      'Marta Kovac',
      'QA analyst',
      ['5h 30m', '5h', '5h 30m', '7h', '7h 30m'],
      ['Client', 'Client', 'Client', 'Client', 'Client'],
      '30h 30m',
      '90% of 34h',
    ],
    [
      'rhys',
      'Rhys Calloway',
      'Solutions architect',
      ['4h 30m', '6h', '6h 30m', '6h', '4h'],
      ['Client', 'Client', 'Internal', 'Internal', 'Client'],
      '27h',
      '113% of 24h',
    ],
    [
      'junia',
      'Junia Alves',
      'Data migration lead',
      ['7h 30m', '8h', '7h 30m', '6h 30m', '6h 30m'],
      ['Client', 'Client', 'Client', 'Client', 'Client'],
      '36h',
      '100% of 36h',
    ],
  ] as const
  return {
    ...base('Delivery board'),
    kind: 'delivery',
    subtitle: 'Accounts / Delivery / Northstar rollout',
    choices: choices([
      ['overview', 'Overview'],
      ['worklog', 'Worklog'],
      ['files', 'Files'],
      ['reports', 'Reports'],
    ]),
    selectedId: 'overview',
    choiceLabel: 'Board sections',
    metrics: [
      metric('account', 'Account', 'Northstar Commerce', 'At risk', 'Enterprise rollout', 'warning'),
      metric('workspace', 'Workspace', 'portal.northstar.io', 'Running', '124k requests / day'),
      metric('review', 'Next review', 'Apr 3, 2026', undefined, 'Client steering · AO TM +1'),
      metric('owner', 'Owner', 'Amara Ortiz', undefined, 'Delivery lead'),
    ],
    weeks: choices([
      ['previous', 'Mar 9 – Mar 15'],
      ['current', 'Mar 16 – Mar 22'],
      ['next', 'Mar 23 – Mar 29'],
    ]),
    selectedWeekId: 'current',
    weekLabel: 'Worklog week',
    previous: 'Previous week',
    next: 'Next week',
    bookmarked: false,
    bookmarkLabel: 'Pin board',
    worklog: {
      title: 'Worklogs',
      detail: '237h logged · 84% client billable',
      columns: columns([
        'People',
        'Mon, Mar 16',
        'Tue, Mar 17',
        'Wed, Mar 18',
        'Thu, Mar 19',
        'Fri, Mar 20',
        'Sat, Mar 21',
        'Sun, Mar 22',
        'Total',
      ]),
      rows: records.map(([id, name, role, hours, types, total, capacity]) => ({
        id,
        cells: [
          { text: name, detail: role },
          ...hours.map((text, index) => ({ text, detail: types[index] })),
          { text: '–', detail: 'Off' },
          { text: '–', detail: 'Off' },
          { text: total, detail: capacity },
        ],
      })),
      footer: 'Client · Internal · 7 people · 237h this week',
    },
  }
}
function explorer(): Extract<LumenDashboardReferenceContent, { kind: 'explorer' }> {
  const measures = [
    ['calls', 'Calls', '79,090', 'Min 72,477', 'Max 82,193', ['85k', '80k', '75k', '70k', '65k']],
    ['duration', 'Avg. duration', '2:51', '', '', []],
    ['credits', 'Total credits', '31,422 credits', '', '', []],
    ['credits-call', 'Credits per call', '4.30 credits', '', '', []],
    ['cost', 'Total LLM cost', '$7,818', '', '', []],
    ['average-cost', 'Avg. LLM cost', '$229.00', '', '', []],
  ] as const
  return {
    ...base('Calls'),
    kind: 'explorer',
    measureLabel: 'Measure',
    rangeLabel: (minimum, maximum) => [minimum, maximum].filter(Boolean).join(' · '),
    selectedId: 'calls',
    measures: measures.map(([id, label, value, minimum, maximum, ticks]) => ({
      id,
      label,
      value,
      minimum,
      maximum,
      chart: chart(
        `${label} · last 28 days`,
        'line',
        id === 'calls' ? [82, 81, 77, 73, 72.4, 75, 77, 76, 73, 72, 74, 79] : [],
        ['28 Aug', '1 Sep', '5 Sep', '9 Sep', '13 Sep', '17 Sep', '21 Sep'],
        ticks,
        { value },
      ),
    })),
    agents: [
      ['docs', 'Docs support', '6,424', 'help.center'],
      ['website', 'Website concierge', '3,942', 'www'],
      ['billing', 'Billing triage', '1,820', 'billing'],
      ['onboarding', 'Onboarding guide', '1,194', 'app.setup'],
      ['store', 'Store assistant', '1,094', 'shop'],
      ['returns', 'Returns desk', '812', 'shop.returns'],
      ['outage', 'Outage responder', '604', 'status'],
      ['renewal', 'Renewal outreach', '421', 'crm'],
    ].map(([id, title, value, detail], index) =>
      entry(
        id ?? '',
        `${index + 1} · ${title ?? ''}`,
        value,
        detail,
        (Number(value?.replaceAll(',', '')) / 6424) * 100,
      ),
    ),
    integrations: [
      { ...entry('transcript', 'Transcript store', 'Connected', 'Response traces and grading') },
      { ...entry('escalation', 'Escalation channel', 'Connected', 'Handoff alerts to on-call') },
      { ...entry('voice', 'Voice gateway', 'Connected', 'SIP routing and failover') },
      {
        ...entry('workflow', 'Workflow runner', undefined, 'Post-call actions and tickets'),
        action: action('connect', 'Connect', 'workflow'),
      },
      {
        ...entry('knowledge', 'Knowledge index', undefined, 'Retrieval corpus sync'),
        action: action('connect', 'Connect', 'knowledge'),
      },
    ],
    titles: {
      agents: 'Busiest agents',
      agentDetail: 'Call volume · 16,311 total',
      integrations: 'Integrations',
      integrationDetail: '3 of 5 connected',
    },
    report: action('open-report', 'Open report'),
    manage: action('manage', 'Manage'),
  }
}
function coverage(): Extract<LumenDashboardReferenceContent, { kind: 'coverage' }> {
  const review = table(
    'Coverage review',
    ['Crew lead', 'Coverage', 'Relief', 'Handoffs', 'Status'],
    [
      ['Mira Stone · Harbor lead', '94%', '6h', '2', 'Stable'],
      ['Leo Grant · Dispatch owner', '81%', '3h', '5', 'Watch'],
      ['Nora Vale · Inventory coach', '72%', '2h', '6', 'Critical'],
      ['Theo Park · Ramp lead', '89%', '5h', '3', 'Stable'],
      ['Sana Qureshi · Uptown floater', '78%', '4h', '4', 'Pending'],
      ['Alex Johnson · Harbor stock', '91%', '7h', '1', 'Stable'],
      ['Priya Raman · Night dispatch', '86%', '5h', '2', 'Stable'],
      ['Dominic Hale · Airport close', '68%', '1h', '8', 'Critical'],
    ],
    [],
    'Crew health by district · 8 crews',
  )
  const descriptions = [
    'Adds two closers',
    'Driver window tight',
    'Cycle count open',
    'Training overlap',
    'Awaiting confirm',
    'Backfill locked',
    'Two shifts merged',
    'Lead unassigned',
  ]
  return {
    ...base('Workforce / Coverage'),
    kind: 'coverage',
    period: 'Jun 22 – Jul 12',
    metrics: [
      metric('gaps', 'Open gaps', '11', '−4', 'before kickoff'),
      metric('standby', 'Standby pool', '24', '+7', 'ready workers'),
      metric('risk', 'Swap risk', '8%', '−2 pp', 'of open requests'),
      metric('score', 'Check score', '4.8', '+0.3', 'site average'),
      metric('tenure', 'Crew tenure', '146d', '+6d', 'rolling median'),
    ],
    review: {
      ...review,
      rows: review.rows.map((row, index) => ({
        ...row,
        cells: row.cells.map((cell, column) =>
          column === 1
            ? {
                ...cell,
                progress: parseFloat(cell.text),
                detail: descriptions[index],
                tone: parseFloat(cell.text) < 75 ? 'danger' : parseFloat(cell.text) < 85 ? 'warning' : 'neutral',
              }
            : cell,
        ),
      })),
    },
    chart: chart(
      'Demand mix',
      'demand',
      [185, 172, 129, 118, 116, 138, 152, 165, 149, 167, 144, 137, 129, 118, 123, 143, 147, 131, 188, 195, 206],
      [],
      [],
      {
        detail: 'Scheduled supply against forecast · 21 days',
        secondary: [146, 155, 167, 182, 187, 174, 169, 143, 123, 115, 112, 106, 107, 113, 120, 140, 130, 128, 109],
        legend: ['Supply 2,906', 'Forecast 2,851', '+55'],
        unit: 'Day 21 · 206 scheduled vs 109 forecast',
      },
    ),
    queueTitle: 'Action queue',
    queueDetail: '7 before cutoff',
    queueFooter: 'Cutoff 2:00 PM · 0 of 7 cleared',
    queue: [
      ['swap', '3 swap approvals', 'Before 2 PM', 'Review'],
      ['standby', '6 standby invites', 'North route', 'Invite'],
      ['lead', '1 lead missing', 'Uptown close', 'Assign'],
      ['timecard', 'Timecard sync', 'After approvals', 'Sync'],
      ['route', '2 route gaps', 'Airport, noon', 'Fill'],
      ['break', 'Break audit', 'Two sites', 'Check'],
      ['onboard', '4 onboarding checks', 'New harbor crew', 'Open'],
    ].map(([id, title, detail, label]) => ({
      ...entry(id ?? '', title ?? '', undefined, detail),
      action: action('queue-action', label ?? '', id),
    })),
    export: action('export', 'Export'),
  }
}
function payout(): Extract<LumenDashboardReferenceContent, { kind: 'payout' }> {
  const moves = table(
    'Recent moves',
    ['Reference', 'Recipient', 'Route', 'State', 'Amount'],
    [
      ['MV-40812', 'Halvorsen Studio · 09:41', 'Bank transfer', 'Settled', '$84,200'],
      ['MV-40811', 'Petit Sound Co. · 09:12', 'Instant card', 'Settled', '$12,640'],
      ['MV-40809', 'Aranyi Collective · 08:55', 'Bank transfer', 'Clearing', '$46,900'],
      ['MV-40806', 'Løken Media · 08:30', 'Wallet split', 'Settled', '$9,180'],
      ['MV-40804', 'Osei & Partners · 08:04', 'Bank transfer', 'Held', '$31,450'],
      ['MV-40801', 'Sundar Archive · 07:48', 'Instant card', 'Settled', '$5,720'],
      ['MV-40799', 'Miralles Press · 07:22', 'Wallet split', 'Clearing', '$18,330'],
      ['MV-40795', 'Brekke Audio · 06:59', 'Bank transfer', 'Settled', '$24,060'],
      ['MV-40792', 'Northlight Rooms · 06:31', 'Instant card', 'Settled', '$7,410'],
      ['MV-40788', 'Fern & Object · 06:05', 'Wallet split', 'Held', '$15,880'],
      ['MV-40784', 'Quiet Harbour Ltd · 05:44', 'Bank transfer', 'Settled', '$39,720'],
    ],
    [],
    '11 today',
  )
  return {
    ...base('Finance / Payout studio'),
    kind: 'payout',
    period: 'May 12 – Jun 10',
    desk: {
      category: 'Creator finance',
      date: 'Thursday, Jun 25',
      title: 'Royalty desk',
      detail: 'Next payout closes at 4:00 PM.',
      balanceLabel: 'Clear to release',
      balance: '$505,870',
      pending: '$49,300 still settling',
    },
    metrics: [
      metric('released', 'Released today', '$212,480', undefined, '17 payouts'),
      metric('buffer', 'Buffer', '$83,040', undefined, 'Under review'),
      metric('lanes', 'Sweep lanes', '3', undefined, 'Funds moving'),
      metric('moves', 'Moves', '11', undefined, 'Ledger depth'),
    ],
    actions: [action('split', 'Split', undefined, true), action('sync', 'Sync')],
    chart: chart(
      'Royalty pace',
      'dual-line',
      [40, 35, 33, 37, 45, 49, 47, 42, 39, 41, 47],
      ['May 12', 'May 19', 'May 26', 'Jun 3', 'Jun 11'],
      ['$60k', '$40k', '$20k', '$0'],
      {
        detail: 'Daily receipts against buffer draw',
        secondary: [8, 9, 9, 8, 8, 9, 10, 10, 9, 8],
        legend: ['Receipts $47k', 'Buffer $8.1k'],
      },
    ),
    moves,
    release: {
      title: 'Release room',
      detail: 'Buffer and sweep lanes',
      badge: 'Vault sweep',
      label: 'Buffer drawn',
      progress: 43,
      value: '43%',
      held: '$96,370 held',
      limit: '$225,000 limit',
      action: action('tune-buffer', 'Tune buffer'),
      lanes: [
        entry('studio', 'Studio card', '$284,650', 'Daily clear · today · •••• 4576'),
        entry('vault', 'Royalty vault', '$153,980', 'Weekly sweep · Friday · •••• 9132'),
        entry('collab', 'Collab wallet', '$67,240', 'Creator split · queued · •••• 2841'),
        entry('reserve', 'Reserve account', '$41,500', 'Month end · holding · •••• 7710'),
      ],
      footer: '4 lanes queued',
      total: '$547,370',
    },
    export: action('export', 'Export'),
  }
}
function goals(): Extract<LumenDashboardReferenceContent, { kind: 'goals' }> {
  const objectives = [
    ['activation', 'Make the first hour obvious', 'Activation · Ines Halvorsen', 63],
    ['expansion', 'Earn the second seat', 'Expansion · Dovid Aranyi', 56],
    ['support', 'Answer before people ask', 'Support · Runa Petit', 63],
    ['platform', 'Ship on a predictable cadence', 'Platform · Marta Løken', 65],
    ['revenue', 'Make pricing legible', 'Revenue · Priya Sundar', 66],
    ['performance', 'Keep the editor fast under load', 'Performance · Jonas Brekke', 73],
    ['people', 'Hire the team we planned for', 'People · Tomás Miralles', 64],
  ] as const
  return {
    ...base('Company goals'),
    kind: 'goals',
    subtitle: 'Q2 scorecard · week 9 of 13',
    metrics: [
      metric('overall', 'Overall', '64%'),
      metric('elapsed', 'Quarter elapsed', '69%'),
      metric('risk', 'Key results at risk', '6', undefined, undefined, 'warning'),
    ],
    selectedId: 'activation',
    objectives: objectives.map(([id, title, detail, progress], index) => ({
      ...entry(id, title, `${progress}%`, detail, progress, index === 1 ? 'warning' : 'neutral'),
      chart:
        index === 0
          ? chart(
              title,
              'dual-line',
              [0, 8, 18, 27, 34, 43, 51, 57, 63],
              ['W1', 'W3', 'W5', 'W7', 'W9', 'W11', 'W13'],
              ['100%', '75%', '50%', '25%', '0%'],
              {
                detail: 'Week 9 · 63% done · plan 67%',
                secondary: [0, 16, 33, 50, 67, 84, 100],
                legend: ['Actual', 'Plan'],
              },
            )
          : undefined,
      results:
        index === 0
          ? [
              entry('saved', 'Reach first saved project in under 6 minutes', '75%', '34% → 61% → 70%', 75),
              entry('steps', 'Cut setup steps from nine to four', '80%', '9 → 5 → 4', 80),
              entry('return', 'Lift week-one return visits', '35%', '41% → 47% → 58%', 35, 'warning'),
            ]
          : [],
    })),
    titles: {
      objectives: 'Objectives',
      footer: 'On pace against the quarter',
      results: 'Key results',
      resultDetail: 'Start → target, current in bold',
      resultFooter: 'Pace compares progress with 69% of the quarter spent.',
    },
  }
}
function service(): Extract<LumenDashboardReferenceContent, { kind: 'service' }> {
  const records = [
    ['checkout', 'Checkout API', 'core/checkout · eu-west-1', 'Operational'],
    ['ledger', 'Ledger writer', 'core/ledger · eu-west-1', 'Degraded'],
    ['media', 'Media pipeline', 'media/encode · us-east-2', 'Operational'],
    ['search', 'Search index', 'search/index · us-east-2', 'Operational'],
    ['webhook', 'Webhook relay', 'core/relay · ap-south-1', 'Down'],
    ['identity', 'Identity gateway', 'core/identity · eu-west-1', 'Operational'],
    ['notify', 'Notification fan-out', 'growth/notify · us-east-2', 'Degraded'],
    ['billing', 'Billing sync', 'core/billing · eu-west-1', 'Operational'],
    ['cdn', 'Asset CDN edge', 'media/edge · global', 'Operational'],
  ] as const
  return {
    ...base('Service health · 9'),
    kind: 'service',
    listStrategy: pane,
    query: '',
    selectedId: 'ledger',
    search: 'Filter services',
    live: 'Live · 5s',
    activityTitle: 'Recent activity',
    refresh: action('refresh', 'Refresh'),
    actions: [action('logs', 'Logs'), action('rollback', 'Roll back', undefined, true)],
    services: records.map(([id, title, detail, value]) => ({
      ...entry(
        id,
        title,
        value,
        detail,
        undefined,
        value === 'Down' ? 'danger' : value === 'Degraded' ? 'warning' : 'neutral',
      ),
      points: wave,
      metadata: id === 'ledger' ? 'core/ledger · v2.7.0 · Dovid Aranyi, 26m ago' : undefined,
      metrics:
        id === 'ledger'
          ? [
              metric('requests', 'Requests', '1.3k/s'),
              metric('latency', 'p95 latency', '402ms'),
              metric('error', 'Error rate', '1.9%'),
              metric('saturation', 'Saturation', '88%'),
            ]
          : undefined,
      chart:
        id === 'ledger'
          ? chart(
              'Throughput',
              'line',
              [1.5, 1.4, 1.1, 1, 1.2, 1.25, 1.1, 0.9, 1.05, 1.3, 1.4, 1.3],
              [],
              ['2.0k', '1.0k', '0'],
              { unit: 'last 40 min · 1.3k/s' },
            )
          : undefined,
      activity:
        id === 'ledger'
          ? [
              entry(
                'queue',
                'Write queue depth above threshold',
                undefined,
                '26m ago · saturation',
                undefined,
                'warning',
              ),
              entry('deploy', 'Shipped v2.7.0 with batched commits', undefined, '26m ago · deploy'),
              entry('replica', 'Replica lag peaked at 4.2s', undefined, '1h ago · database', undefined, 'warning'),
              entry('night', 'Nightly reconciliation finished clean', undefined, '7h ago · job'),
            ]
          : undefined,
    })),
  }
}

export const dashboardPreviewNotice = (label: string, value?: string) =>
  `${label}${value ? ` · ${value}` : ''}: preview request recorded; no remote data was changed.`

function previousWorklog(current: Table): Table {
  const hours = [
    ['6h 30m', '8h', '8h', '7h', '6h'],
    ['8h 30m', '7h 30m', '6h', '6h', '7h 30m'],
    ['6h 30m', '5h 30m', '6h', '7h', '7h 30m'],
    ['6h', '7h', '8h 30m', '9h', '8h'],
    ['7h 30m', '8h', '6h 30m', '5h', '5h'],
    ['6h 30m', '5h 30m', '4h 30m', '4h 30m', '6h'],
    ['5h 30m', '5h', '6h 30m', '8h', '8h 30m'],
  ]
  const types = [
    ['Client', 'Internal', 'Internal', 'Client', 'Client'],
    ['Client', 'Client', 'Client', 'Client', 'Client'],
    ['Client', 'Client', 'Client', 'Client', 'Internal'],
    ['Client', 'Client', 'Internal', 'Internal', 'Client'],
    ['Client', 'Client', 'Client', 'Client', 'Client'],
    ['Internal', 'Client', 'Client', 'Client', 'Internal'],
    ['Client', 'Client', 'Client', 'Client', 'Client'],
  ]
  const totals = ['35h 30m', '35h 30m', '32h 30m', '38h 30m', '32h', '27h', '33h 30m']
  const capacities = [
    '111% of 32h',
    '89% of 40h',
    '108% of 30h',
    '101% of 38h',
    '94% of 34h',
    '113% of 24h',
    '93% of 36h',
  ]
  return {
    ...current,
    detail: '234h 30m logged · 77% client billable',
    columns: columns([
      'People',
      'Mon, Mar 9',
      'Tue, Mar 10',
      'Wed, Mar 11',
      'Thu, Mar 12',
      'Fri, Mar 13',
      'Sat, Mar 14',
      'Sun, Mar 15',
      'Total',
    ]),
    rows: current.rows.map((row, index) => ({
      ...row,
      cells: [
        ...(row.cells[0] ? [row.cells[0]] : []),
        ...(hours[index] ?? []).map((text, day) => ({ text, detail: types[index]?.[day] })),
        { text: '–', detail: 'Off' },
        { text: '–', detail: 'Off' },
        { text: totals[index] ?? '', detail: capacities[index] },
      ],
    })),
    footer: 'Client · Internal · 7 people · 234h 30m this week',
  }
}
