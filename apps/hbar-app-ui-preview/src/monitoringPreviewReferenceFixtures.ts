import type {
  LumenMonitoringReferenceChart,
  LumenMonitoringReferenceContent,
  LumenMonitoringReferenceMetric,
  LumenMonitoringReferenceTone,
} from '@lumen/app-ui'

const emptyAction = () => {}
const labels = {
  empty: 'No matching records.',
  unavailable: 'This reference snapshot does not include data for the selected scope.',
  clearSearch: 'Clear search',
  options: (name: string) => `Actions for ${name}`,
  shown: (shown: number, total: number) => `Showing ${shown} of ${total} records`,
  progress: (name: string) => `${name} progress`,
  percent: (value: number) => `${value}%`,
  metadata: (left: string, right: string) => `${left} · ${right}`,
  missingValue: '—',
}
const common = { labels, expectedMaximum: 80, onAction: emptyAction }
const neutral: LumenMonitoringReferenceTone = 'neutral'
/** Plot shapes are reconstructed from visible diagrams; they are not service telemetry. */
const throughput = [24, 20, 26, 36, 45, 43, 34, 23, 20, 22, 31, 42, 48, 45, 37, 31, 30, 35, 45, 58, 71]
const stream = [57, 52, 47, 43, 33, 27, 31, 39, 43, 46, 53, 58, 57, 50, 44, 45, 48, 48, 47, 51, 61, 66, 65]
const chart = (
  label: string,
  points: readonly number[],
  axis: readonly string[],
  tone: LumenMonitoringReferenceTone = neutral,
): LumenMonitoringReferenceChart => ({ label, points, axis, tone })
const metric = (id: string, label: string, value: string, detail?: string): LumenMonitoringReferenceMetric => ({
  id,
  label,
  value,
  detail,
})
export function createMonitoringPreviewReferenceContent(
  variant: number,
  mode = 'default',
): LumenMonitoringReferenceContent {
  let content: LumenMonitoringReferenceContent
  switch (variant) {
    case 1:
      content = {
        ...common,
        kind: 'health',
        header: {
          title: 'Platform health',
          detail: 'Traffic, errors and saturation across every production service.',
          status: 'Live',
        },
        ranges: [
          { id: '1h', label: '1h' },
          { id: '24h', label: '24h' },
          { id: '7d', label: '7d' },
        ],
        rangeId: '24h',
        rangeLabel: 'Time range',
        refreshLabel: 'Refresh',
        available: true,
        metrics: [
          {
            ...metric('requests', 'Requests', '1458.1k', 'vs previous day: 1348.8k'),
            delta: '8.1%',
            direction: 'up',
            tone: 'success',
            optionsLabel: 'Options for Requests',
          },
          {
            ...metric('errors', 'Error rate', '0.43%', 'vs previous day: 0.42%'),
            delta: '2.4%',
            direction: 'up',
            tone: 'danger',
            optionsLabel: 'Options for Error rate',
          },
          {
            ...metric('latency', 'p95 latency', '310ms', 'vs previous day: 314ms'),
            delta: '1.3%',
            direction: 'down',
            tone: 'success',
            optionsLabel: 'Options for p95 latency',
          },
          {
            ...metric('saturation', 'Saturation', '60%', 'vs previous day: 62%'),
            delta: '3.2%',
            direction: 'down',
            tone: 'success',
            optionsLabel: 'Options for Saturation',
          },
        ],
        chartTitle: 'Request throughput',
        chartValue: '31,982',
        chartDetail: 'total, last 24h',
        chart: chart('Request throughput, 24 points', throughput, ['04:00', '08:00', '12:00', '16:00', '20:00']),
        activityLabel: 'Incident activity',
        events: [
          {
            id: 'checkout-timeouts',
            title: 'Checkout API timeouts',
            severity: 'Critical',
            meta: 'payments-edge · 09:12',
            body: 'The charge endpoint exceeded its 8s budget on six consecutive calls, holding four orders at authorisation.',
            tone: 'danger',
          },
          {
            id: 'retry-storm',
            title: 'Retry storm contained',
            severity: 'Major',
            meta: 'invoice-worker · 08:47',
            body: 'Backoff was applied after a vendor 503 spike, capping retries and draining the queued backlog.',
            tone: 'warning',
          },
          {
            id: 'search-degraded',
            title: 'Search index degraded',
            severity: 'Minor',
            meta: 'search-api · 08:05',
            body: 'Read latency on the embeddings index rose to 1.9s, slowing lookups for eleven minutes before recovering.',
            tone: 'neutral',
          },
        ],
      }
      break
    case 2:
      content = {
        ...common,
        kind: 'live',
        header: { title: 'Live stream', detail: 'api-gateway · eu-west-1 · 1s resolution', status: 'Streaming' },
        choices: [
          { id: 'requests', label: 'Requests' },
          { id: 'latency', label: 'p99 latency' },
          { id: 'errors', label: 'Errors' },
        ],
        metricId: 'requests',
        metricLabel: 'Metric',
        pauseLabel: 'Pause',
        resumeLabel: 'Resume',
        paused: false,
        available: true,
        value: '4,383',
        unit: '/s',
        thresholdLabel: 'Autoscale at 5,200/s',
        chart: {
          ...chart('Requests over the last 60 seconds, currently 4,383/s', stream, [
            '−60s',
            '−45s',
            '−30s',
            '−15s',
            'now',
          ]),
          threshold: 82,
        },
        metrics: [
          metric('now', 'Now', '4,383/s'),
          metric('average', 'Average', '4,201/s'),
          metric('peak', 'Peak', '4,638/s'),
          metric('floor', 'Floor', '3,721/s'),
        ],
      }
      break
    case 3:
      content = {
        ...common,
        kind: 'incident',
        incidentId: 'INC-2841',
        header: {
          title: 'Elevated checkout latency',
          detail: 'INC-2841 · opened 09:04 · payments team',
          tone: 'warning',
        },
        statuses: [
          { id: 'investigating', label: 'Investigating' },
          { id: 'identified', label: 'Identified' },
          { id: 'monitoring', label: 'Monitoring' },
          { id: 'resolved', label: 'Resolved' },
        ],
        statusId: 'monitoring',
        statusLabel: 'Incident status',
        resolveLabel: 'Resolve',
        metrics: [
          metric('detected', 'Detected', '09:04'),
          metric('acknowledged', 'Acknowledged', '09:06'),
          metric('mitigated', 'Mitigated', '09:38'),
          metric('duration', 'Duration', '37m'),
        ],
        updatesLabel: 'Updates',
        updates: [
          {
            id: 'update-0941',
            initials: 'PP',
            author: 'Priya Patel',
            status: 'Monitoring',
            time: '09:41',
            body: 'Connection pool raised to 240 and the failing region drained. Error rate is back under 0.2% and holding. Watching for one more cycle before we call it.',
            tone: 'neutral',
          },
          {
            id: 'update-0918',
            initials: 'TP',
            author: 'Theo Park',
            status: 'Identified',
            time: '09:18',
            body: 'The charge worker exhausted its database pool after a migration left an index rebuild running against the orders table.',
            tone: 'warning',
          },
          {
            id: 'update-0904',
            initials: 'OC',
            author: 'On-call rotation',
            status: 'Investigating',
            time: '09:04',
            body: 'Automated alert fired on p99 checkout latency crossing 8s. Paging the payments team.',
            tone: 'danger',
          },
        ],
        draft: '',
        draftLabel: 'Post an update',
        draftPlaceholder: 'Post an update for subscribers…',
        draftDetail: 'Sends to 1,204 status page subscribers',
        postLabel: 'Post',
        affectedLabel: 'Affected components',
        affected: [
          { id: 'checkout', name: 'Checkout API', status: 'Degraded', tone: 'danger' },
          { id: 'payments', name: 'Payments worker', status: 'Recovering', tone: 'warning' },
          { id: 'orders', name: 'Order history', status: 'Operational', tone: 'neutral' },
          { id: 'webhooks', name: 'Webhooks', status: 'Operational', tone: 'neutral' },
        ],
        respondersLabel: 'Responders',
        responders: [
          { id: 'priya', initials: 'PP', name: 'Priya Patel', role: 'Incident lead' },
          { id: 'theo', initials: 'TP', name: 'Theo Park', role: 'Payments' },
          { id: 'nora', initials: 'NV', name: 'Nora Vale', role: 'Comms' },
        ],
        budgetLabel: 'Error budget',
        budget: 38,
        budgetDetail: '38% of the monthly budget spent by this incident.',
      }
      break
    case 4:
      content = {
        ...common,
        kind: 'alerts',
        header: { title: 'Alerts', detail: '3 firing · 2 pending · evaluated every 30s' },
        states: [
          { id: 'all', label: 'All', count: 7 },
          { id: 'firing', label: 'Firing', count: 3 },
          { id: 'pending', label: 'Pending', count: 2 },
          { id: 'resolved', label: 'Resolved', count: 2 },
        ],
        stateId: 'firing',
        stateLabel: 'Alert state',
        query: '',
        queryLabel: 'Search alerts',
        queryPlaceholder: 'Search rule or service',
        rows: [
          {
            id: 'checkout-p99',
            title: 'Checkout p99 above budget',
            severity: 'Critical',
            meta: 'payments-edge · p99 latency > 8s for 5m',
            value: '11.4s',
            duration: '38m',
            stateId: 'firing',
            body: 'Drain the failing region, then raise the charge worker pool to 240.',
            tone: 'danger',
            points: [60, 40, 34, 30, 25, 24, 22, 18, 22, 32, 34, 33, 31, 20, 19, 20, 25, 24, 28, 32, 39, 52, 60, 68],
            muted: false,
          },
          {
            id: 'error-rate',
            title: 'Error rate spike',
            severity: 'Critical',
            meta: 'api-gateway · 5xx rate > 2% for 3m',
            value: '4.1%',
            duration: '12m',
            stateId: 'firing',
            tone: 'danger',
            points: [12, 16, 25, 18, 20, 15, 21, 28, 25, 29, 35, 42, 32, 35, 29, 28, 22],
            muted: false,
          },
          {
            id: 'queue-depth',
            title: 'Queue depth climbing',
            severity: 'Warning',
            meta: 'invoice-worker · depth > 5,000 for 10m',
            value: '7,318',
            duration: '1h 04m',
            stateId: 'firing',
            tone: 'warning',
            points: [14, 17, 18, 22, 25, 20, 18, 20, 19, 18, 20, 18, 17, 16, 14],
            muted: false,
          },
        ],
        total: 7,
        expandedIds: ['checkout-p99'],
        silenceFiringLabel: 'Silence firing',
        resolveLabel: 'Mark resolved',
        silenceLabel: 'Silence 2h',
        mutedLabel: 'Silenced in local preview',
        resetLabel: 'Reset states',
      }
      break
    case 5: {
      const examples = [
        { level: 'info', service: 'api-gateway', message: 'GET /v2/orders 200 in 42ms', tone: neutral },
        { level: 'debug', service: 'catalog-api', message: 'cache warm complete for tenant 4821', tone: neutral },
        {
          level: 'warn',
          service: 'invoice-worker',
          message: 'vendor responded 503, scheduling retry 2 of 5',
          tone: 'warning',
        },
        { level: 'info', service: 'payments-edge', message: 'charge authorised for ORD-99214', tone: neutral },
        {
          level: 'error',
          service: 'payments-edge',
          message: 'charge timed out after 8s, releasing the hold',
          tone: 'danger',
        },
        { level: 'info', service: 'search-api', message: 'reindex batch 18/64 committed', tone: neutral },
        { level: 'debug', service: 'edge-proxy', message: 'upstream health probe ok', tone: neutral },
        { level: 'warn', service: 'search-api', message: 'embeddings index read latency 1.9s', tone: 'warning' },
      ] satisfies readonly { level: string; service: string; message: string; tone: LumenMonitoringReferenceTone }[]
      const lines = Array.from({ length: 22 }, (_, index) => {
        const example = examples[index % examples.length]
        if (!example) throw new Error('Missing preview log example')
        const seconds = index * 7
        return {
          ...example,
          id: `log-${index}`,
          context: index === 0 ? '{ "route": "/v2/orders", "region": "eu-west-1", "cache": "hit" }' : undefined,
          time: `09:${String(4 + Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`,
        }
      })
      content = {
        ...common,
        expectedMaximum: 140,
        kind: 'logs',
        header: { title: 'Live tail', detail: 'production · all services · 3 errors in view', status: 'Streaming' },
        levels: [
          { id: 'all', label: 'All' },
          { id: 'error', label: 'Error' },
          { id: 'warn', label: 'Warn' },
          { id: 'info', label: 'Info' },
          { id: 'debug', label: 'Debug' },
        ],
        levelId: 'all',
        levelLabel: 'Log level',
        query: '',
        queryLabel: 'Filter log lines',
        queryPlaceholder: 'Filter by message or service',
        paused: false,
        follow: true,
        pauseLabel: 'Pause',
        resumeLabel: 'Resume',
        followLabel: 'Follow',
        clearLabel: 'Clear the buffer',
        lines,
        expandedIds: [],
        total: lines.length,
        footer: '22 of 22 lines · buffer capped at 140',
        rate: '~50 lines/min',
      }
      break
    }
    case 6: {
      const names = ['API', 'Dashboard', 'Payments', 'Webhooks', 'Search', 'Asset CDN']
      content = {
        ...common,
        kind: 'uptime',
        header: { title: 'All systems operational', detail: '99.937% average uptime over 90 days' },
        windows: [
          { id: '30', label: '30d' },
          { id: '60', label: '60d' },
          { id: '90', label: '90d' },
        ],
        windowId: '90',
        windowLabel: 'History window',
        services: names.map((name, row) => {
          const uptime = row === 2 || row === 3 ? '99.93% uptime' : '99.94% uptime'
          // The colored-strip diagram follows the visible operational/degraded/outage distribution.
          return {
            id: `service-${row}`,
            name,
            uptime,
            detail: row === 0 ? 'Operational · 88d ago' : undefined,
            history:
              row === 0
                ? [{ id: 'api-jun-02', time: 'Jun 02', body: 'Elevated 5xx for 18 minutes after a bad deploy.' }]
                : undefined,
            chartLabel: `${name} daily status for the last 90 days, ${uptime}`,
            days: Array.from({ length: 90 }, (_, index) => ({
              id: `day-${index}`,
              label: `${name}: ${index + 1} of 90 days`,
              tone: [23 + row * 3, 37 + row * 2].includes(index)
                ? 'danger'
                : [4 + row, 34 + row * 2, 64 - row * 3, 75 + row].includes(index)
                  ? 'warning'
                  : neutral,
            })),
          }
        }),
        expandedIds: [],
        legend: [
          { id: 'operational', label: 'Operational' },
          { id: 'degraded', label: 'Degraded' },
          { id: 'outage', label: 'Outage' },
        ],
        startLabel: '90 days ago',
        endLabel: 'Today',
      }
      break
    }
    case 7:
      content = {
        ...common,
        kind: 'fleet',
        header: { title: 'Fleet', detail: '8 nodes · 3 need attention · sampled 30s ago' },
        regions: [
          { id: 'all', label: 'All regions' },
          { id: 'eu-west-1', label: 'eu-west-1' },
          { id: 'us-east-1', label: 'us-east-1' },
          { id: 'ap-south-1', label: 'ap-south-1' },
        ],
        regionId: 'all',
        regionLabel: 'Region',
        query: '',
        queryLabel: 'Search hosts',
        queryPlaceholder: 'Search host or role',
        columns: [
          { id: 'node', label: 'Node' },
          { id: 'cpu', label: 'CPU' },
          { id: 'memory', label: 'Memory' },
          { id: 'disk', label: 'Disk' },
        ],
        statusLabel: 'Status',
        sortId: 'cpu',
        descending: true,
        nodes: [
          {
            id: 'api-eu-02',
            name: 'api-eu-02',
            role: 'API',
            region: 'eu-west-1',
            status: 'Critical',
            cpu: 91,
            memory: 78,
            disk: 41,
            tone: 'danger',
            detail: 'CPU has been pinned above 88% for 22 minutes. Shed traffic or add a node.',
          },
          {
            id: 'worker-eu-01',
            name: 'worker-eu-01',
            role: 'Worker',
            region: 'eu-west-1',
            status: 'Healthy',
            cpu: 58,
            memory: 71,
            disk: 55,
            tone: neutral,
          },
          {
            id: 'db-primary',
            name: 'db-primary',
            role: 'Database',
            region: 'eu-west-1',
            status: 'Warning',
            cpu: 52,
            memory: 84,
            disk: 66,
            tone: 'warning',
          },
          {
            id: 'api-eu-01',
            name: 'api-eu-01',
            role: 'API',
            region: 'eu-west-1',
            status: 'Healthy',
            cpu: 44,
            memory: 62,
            disk: 38,
            tone: neutral,
          },
          {
            id: 'worker-us-01',
            name: 'worker-us-01',
            role: 'Worker',
            region: 'us-east-1',
            status: 'Warning',
            cpu: 36,
            memory: 49,
            disk: 87,
            tone: 'warning',
          },
          {
            id: 'edge-ap-01',
            name: 'edge-ap-01',
            role: 'Edge',
            region: 'ap-south-1',
            status: 'Healthy',
            cpu: 29,
            memory: 41,
            disk: 22,
            tone: neutral,
          },
          {
            id: 'db-replica-01',
            name: 'db-replica-01',
            role: 'Database',
            region: 'us-east-1',
            status: 'Healthy',
            cpu: 21,
            memory: 47,
            disk: 64,
            tone: neutral,
          },
          {
            id: 'cache-eu-01',
            name: 'cache-eu-01',
            role: 'Cache',
            region: 'eu-west-1',
            status: 'Healthy',
            cpu: 18,
            memory: 33,
            disk: 12,
            tone: neutral,
          },
        ],
        expandedIds: ['api-eu-02'],
        total: 8,
        refreshDetail: 'Metrics refresh every 30 seconds',
      }
      break
    case 8:
      content = {
        ...common,
        kind: 'response',
        header: { title: 'Response times', detail: 'Last 24 hours · 2.06M requests · 6 routes' },
        routes: [
          {
            id: 'checkout',
            method: 'POST',
            path: '/v2/checkout',
            requests: 184,
            p50: 412,
            p90: 1180,
            p99: 8420,
            errors: 2.4,
            p50Label: '412ms',
            p90Label: '1.18s',
            p99Label: '8.42s',
            errorsLabel: '2.4%',
          },
          {
            id: 'invoices',
            method: 'POST',
            path: '/v2/invoices',
            requests: 76,
            p50: 288,
            p90: 640,
            p99: 1810,
            errors: 0.9,
            p50Label: '288ms',
            p90Label: '640ms',
            p99Label: '1.81s',
            errorsLabel: '0.9%',
          },
          {
            id: 'search',
            method: 'GET',
            path: '/v2/search',
            requests: 618,
            p50: 128,
            p90: 384,
            p99: 1240,
            errors: 0.4,
            p50Label: '128ms',
            p90Label: '384ms',
            p99Label: '1.24s',
            errorsLabel: '0.4%',
          },
          {
            id: 'webhooks',
            method: 'POST',
            path: '/v2/webhooks',
            requests: 208,
            p50: 74,
            p90: 190,
            p99: 486,
            errors: 0.3,
            p50Label: '74ms',
            p90Label: '190ms',
            p99Label: '486ms',
            errorsLabel: '0.3%',
          },
          {
            id: 'profile',
            method: 'PUT',
            path: '/v2/profile',
            requests: 31,
            p50: 66,
            p90: 148,
            p99: 322,
            errors: 0.2,
            p50Label: '66ms',
            p90Label: '148ms',
            p99Label: '322ms',
            errorsLabel: '0.2%',
          },
          {
            id: 'orders',
            method: 'GET',
            path: '/v2/orders',
            requests: 942,
            p50: 42,
            p90: 96,
            p99: 214,
            errors: 0.1,
            p50Label: '42ms',
            p90Label: '96ms',
            p99Label: '214ms',
            errorsLabel: '0.1%',
          },
        ],
        selectedId: 'checkout',
        columns: [
          { id: 'requests', label: 'Req/s' },
          { id: 'p50', label: 'p50' },
          { id: 'p90', label: 'p90' },
          { id: 'p99', label: 'p99' },
          { id: 'errors', label: 'Errors' },
        ],
        routeLabel: 'Route',
        sortId: 'p99',
        descending: true,
        metrics: [
          { ...metric('p50', 'p50 · /v2/checkout', '412ms'), delta: '3.1%', direction: 'down', tone: 'success' },
          { ...metric('p90', 'p90 · /v2/checkout', '1.18s'), delta: '6.4%', direction: 'up', tone: 'danger' },
          { ...metric('p99', 'p99 · /v2/checkout', '8.42s'), delta: '21.8%', direction: 'up', tone: 'danger' },
        ],
        budgetLabel: 'p99 over the 2.00s budget',
        histogramTitle: 'Latency distribution',
        histogramDetail: '122% of requests plotted',
        histogramLabel: 'Latency histogram for /v2/checkout',
        buckets: [
          '0–50',
          '50–100',
          '100–200',
          '200–300',
          '300–500',
          '500–800',
          '0.8–1.2s',
          '1.2–2s',
          '2–4s',
          '4s+',
        ].map((label, index) => {
          const value = [2, 6, 14, 22, 26, 18, 12, 9, 7, 6][index] ?? 0
          return {
            id: `bucket-${index}`,
            label,
            accessibleLabel: `${label}ms, ${value}% of requests`,
            detailLabel: `${label}ms · ${value}% of requests`,
            value,
            tone: index > 6 ? 'danger' : neutral,
          }
        }),
      }
      break
    case 9: {
      const runs = [
        {
          id: 'refund-99214',
          title: 'Refund duplicate charge on ORD-99214',
          detail: 'Step 4 of 6 · Matching the second transaction in the payout file',
          initials: 'PP',
          environment: 'Production',
          groupId: 'running',
          status: 'On track',
          tone: neutral,
          attention: false,
          progress: 67,
        },
        {
          id: 'renewals',
          title: 'Draft renewal outreach for 38 Q3 accounts',
          detail: 'Step 2 of 5 · Pulling usage summaries for segment B',
          initials: 'TP',
          environment: 'Production',
          groupId: 'running',
          status: 'On track',
          tone: neutral,
          attention: false,
          progress: 40,
        },
        {
          id: 'dedupe',
          title: 'Dedupe 412 contacts imported from the spring list',
          detail: 'Step 3 of 4 · Merging 57 confirmed duplicate pairs',
          initials: 'NV',
          environment: 'Staging',
          groupId: 'running',
          status: 'On track',
          tone: neutral,
          attention: false,
          progress: 75,
        },
        {
          id: 'refund-99187',
          title: 'Refund damaged item claim on ORD-99187',
          detail: 'Step 5 of 6 · Waiting on finance approval for the €1,240 credit',
          initials: 'MS',
          environment: 'Production',
          groupId: 'running',
          status: 'Needs approval',
          tone: 'warning',
          attention: true,
          progress: 86,
        },
        {
          id: 'meridian',
          title: 'Summarise the Meridian master services agreement',
          detail: 'Step 1 of 3 · Splitting 84 pages into clause sections',
          initials: 'KT',
          environment: 'Development',
          groupId: 'running',
          status: 'On track',
          tone: neutral,
          attention: false,
          progress: 20,
        },
        {
          id: 'freight',
          title: 'Reconcile 23 June freight invoices',
          detail: 'Queued 18 min · Position 2 in the finance lane',
          initials: 'LG',
          environment: 'Production',
          groupId: 'waiting',
          status: 'On track',
          tone: neutral,
          attention: false,
        },
        {
          id: 'nudges',
          title: 'Send onboarding nudges to 112 trial signups',
          detail: 'Step 1 of 4 · Rate limited by the email provider, retry at 13:40',
          initials: 'PP',
          environment: 'Production',
          groupId: 'waiting',
          status: 'Retrying',
          tone: neutral,
          attention: true,
          progress: 10,
        },
        {
          id: 'enrichment',
          title: 'Enrich 64 new leads from the partner webinar',
          detail: 'Queued 32 min · Waiting for the enrichment API window',
          initials: 'TP',
          environment: 'Staging',
          groupId: 'waiting',
          status: 'On track',
          tone: neutral,
          attention: false,
        },
        {
          id: 'archive',
          title: 'Archive conversations older than 180 days',
          detail: 'Queued 1 h · Scheduled for the low traffic window at 02:00',
          initials: 'NV',
          environment: 'Production',
          groupId: 'waiting',
          status: 'On track',
          tone: neutral,
          attention: false,
        },
        {
          id: 'refund-99102',
          title: 'Refund partial return on ORD-99102 for Cedar Labs',
          detail: 'Failed at step 3 of 6 · The processor declined the partial capture',
          initials: 'MS',
          environment: 'Production',
          groupId: 'failed',
          status: 'Escalated',
          tone: 'danger',
          attention: true,
          progress: 48,
        },
        {
          id: 'supplier-invoices',
          title: 'Match 9 supplier invoices to June purchase orders',
          detail: 'Failed at step 2 of 5 · Two invoices reference a closed PO',
          initials: 'LG',
          environment: 'Production',
          groupId: 'failed',
          status: 'Escalated',
          tone: 'danger',
          attention: true,
          progress: 32,
        },
        {
          id: 'support-review',
          title: 'Classify 240 support threads for the quarterly review',
          detail: 'Failed at step 1 of 2 · The label schema no longer matches',
          initials: 'KT',
          environment: 'Staging',
          groupId: 'failed',
          status: 'Retrying',
          tone: neutral,
          attention: true,
          progress: 12,
        },
      ] satisfies Extract<LumenMonitoringReferenceContent, { kind: 'queue' }>['runs']
      content = {
        ...common,
        kind: 'queue',
        header: { title: 'Run queue', detail: 'Triage the live agent run backlog.', status: 'Live' },
        summary: [
          metric('runs', 'Runs', '12'),
          { ...metric('escalated', 'Escalated', '2'), tone: 'danger' },
          { ...metric('approval', 'Needs approval', '1'), tone: 'warning' },
          metric('retrying', 'Retrying', '2'),
        ],
        query: '',
        queryLabel: 'Search runs',
        queryPlaceholder: 'Search runs…',
        attention: false,
        attentionLabel: 'Attention',
        collapseLabel: 'Collapse groups',
        expandLabel: 'Expand groups',
        newLabel: 'New run',
        groups: [
          { id: 'running', title: 'Running', detail: 'Live executions streaming steps right now' },
          { id: 'waiting', title: 'Waiting', detail: 'Queued behind approvals, rate limits or schedules' },
          { id: 'failed', title: 'Failed', detail: 'Stopped runs awaiting retry or escalation' },
        ],
        expandedGroupIds: ['running', 'waiting', 'failed'],
        runs,
      }
      break
    }
    default:
      content = {
        ...common,
        kind: 'slo',
        header: { title: 'Service level objectives', detail: '5 objectives · 2 spending budget faster than planned' },
        windows: [
          { id: '7d', label: '7d' },
          { id: '30d', label: '30d' },
          { id: '90d', label: '90d' },
        ],
        windowId: '30d',
        windowLabel: 'Compliance window',
        objectives: [
          {
            id: 'checkout',
            title: 'Checkout availability',
            target: 'Target 99.9% · current 99.62%',
            detail: 'Successful charges / attempted charges',
            remaining: 12,
            remainingLabel: '12% budget left',
            burn: '4.2×',
            status: 'Budget critical',
            tone: 'danger',
            chart: {
              ...chart(
                'Error budget burn-down for Checkout availability, 12% remaining',
                [94, 91, 85, 80, 77, 74, 70, 64, 58, 56, 53, 49, 42, 39, 35, 31, 26, 20, 16, 12],
                ['Window start', 'Planned burn', 'Today'],
                'danger',
              ),
              planned: [94, 12],
            },
          },
          {
            id: 'latency',
            title: 'API latency',
            target: 'Target 99% · current 99.24%',
            detail: '',
            remaining: 64,
            remainingLabel: '64% budget left',
            burn: '1.1×',
            status: 'Healthy',
            tone: neutral,
            chart: chart(
              'Error budget burn-down for API latency, 64% remaining',
              [],
              ['Window start', 'Planned burn', 'Today'],
            ),
          },
          {
            id: 'search',
            title: 'Search freshness',
            target: 'Target 99.5% · current 99.44%',
            detail: '',
            remaining: 38,
            remainingLabel: '38% budget left',
            burn: '1.9×',
            status: 'Burning fast',
            tone: 'warning',
            chart: chart(
              'Error budget burn-down for Search freshness, 38% remaining',
              [],
              ['Window start', 'Planned burn', 'Today'],
              'warning',
            ),
          },
          {
            id: 'webhooks',
            title: 'Webhook delivery',
            target: 'Target 99.9% · current 99.97%',
            detail: '',
            remaining: 88,
            remainingLabel: '88% budget left',
            burn: '0.4×',
            status: 'Healthy',
            tone: neutral,
            chart: chart(
              'Error budget burn-down for Webhook delivery, 88% remaining',
              [],
              ['Window start', 'Planned burn', 'Today'],
            ),
          },
          {
            id: 'dashboard',
            title: 'Dashboard uptime',
            target: 'Target 99.95% · current 99.99%',
            detail: '',
            remaining: 92,
            remainingLabel: '92% budget left',
            burn: '0.2×',
            status: 'Healthy',
            tone: neutral,
            chart: chart(
              'Error budget burn-down for Dashboard uptime, 92% remaining',
              [],
              ['Window start', 'Planned burn', 'Today'],
            ),
          },
        ],
        selectedId: 'checkout',
        remainingLabel: 'Remaining',
        burnLabel: 'Burn rate',
        chartTitle: (title) => `${title} · error budget`,
      }
      break
  }
  return adaptFixtures(content, mode)
}
function adaptFixtures(content: LumenMonitoringReferenceContent, mode: string): LumenMonitoringReferenceContent {
  let result = content
  if (['empty', 'one', 'boundary', 'overflow'].includes(mode)) {
    const count =
      mode === 'empty'
        ? 0
        : mode === 'one'
          ? 1
          : mode === 'boundary'
            ? content.expectedMaximum
            : content.expectedMaximum + 1
    const repeat = <T extends { readonly id: string }>(rows: readonly T[]): readonly T[] => {
      const first = rows[0]
      return first ? Array.from({ length: count }, (_, index) => ({ ...first, id: `capacity-${index}` })) : []
    }
    switch (content.kind) {
      case 'health':
        result = { ...content, events: repeat(content.events) }
        break
      case 'live':
        result = {
          ...content,
          metrics: repeat(content.metrics),
          chart: { ...content.chart, points: count ? content.chart.points : [] },
        }
        break
      case 'incident':
        result = { ...content, updates: repeat(content.updates) }
        break
      case 'alerts':
        result = { ...content, rows: repeat(content.rows), total: count, expandedIds: [] }
        break
      case 'logs':
        result = { ...content, lines: repeat(content.lines), total: count }
        break
      case 'uptime':
        result = { ...content, services: repeat(content.services) }
        break
      case 'fleet':
        result = { ...content, nodes: repeat(content.nodes), total: count, expandedIds: [] }
        break
      case 'response':
        result = { ...content, routes: repeat(content.routes), selectedId: count ? 'capacity-0' : '' }
        break
      case 'queue':
        result = { ...content, runs: repeat(content.runs) }
        break
      case 'slo':
        result = { ...content, objectives: repeat(content.objectives), selectedId: count ? 'capacity-0' : '' }
        break
    }
  }
  if (mode === 'localized' || mode === 'long') {
    result = {
      ...result,
      header: {
        ...result.header,
        title: '工作区监控与运行状态 — 长项目名称下的可用性、资源和事件工作台',
        detail: '生产环境的关键指标与记录；此预览不会修改实际服务。',
      },
      labels: {
        empty: '没有符合条件的记录。',
        unavailable: '参考快照未提供当前范围的数据。',
        clearSearch: '清除搜索',
        options: (name) => `查看 ${name} 的操作`,
        shown: (shown, total) => `显示 ${shown} / ${total} 条记录`,
        progress: (name) => `${name} 的进度`,
        percent: (value) => `${value}%`,
        metadata: (left, right) => `${left} · ${right}`,
        missingValue: '—',
      },
    }
    if (result.kind === 'incident')
      result = {
        ...result,
        draftLabel: '发布更新',
        draftPlaceholder: '输入一条较长的工作区事件说明…',
        postLabel: '在本地预览发布更新',
        draftDetail: '仅保留在此预览，不发送给状态页订阅者。',
      }
    if (result.kind === 'logs')
      result = {
        ...result,
        queryLabel: '筛选日志',
        queryPlaceholder: '按消息或服务名称筛选',
        pauseLabel: '暂停',
        resumeLabel: '恢复',
        followLabel: '跟随',
        clearLabel: '清空本地缓冲区',
      }
    switch (result.kind) {
      case 'health':
        result = {
          ...result,
          rangeLabel: '时间范围',
          refreshLabel: '刷新',
          chartTitle: '请求吞吐量',
          activityLabel: '事件动态',
          metrics: result.metrics.map((item) => ({ ...item, optionsLabel: `查看 ${item.label} 的选项` })),
        }
        break
      case 'live':
        result = {
          ...result,
          metricLabel: '指标',
          pauseLabel: '暂停',
          resumeLabel: '恢复',
          choices: result.choices.map((item) => ({
            ...item,
            label: item.id === 'requests' ? '请求量' : item.id === 'errors' ? '错误率' : 'p99 延迟',
          })),
        }
        break
      case 'incident':
        result = {
          ...result,
          statusLabel: '事件状态',
          resolveLabel: '解决',
          updatesLabel: '更新记录',
          affectedLabel: '受影响组件',
          respondersLabel: '响应人员',
          budgetLabel: '错误预算',
          budgetDetail: '此事件已消耗月度预算的 38%。',
        }
        break
      case 'alerts':
        result = {
          ...result,
          stateLabel: '告警状态',
          queryLabel: '搜索告警',
          queryPlaceholder: '按规则或服务搜索',
          silenceFiringLabel: '静默正在触发的告警',
          resolveLabel: '标记为已解决',
          silenceLabel: '静默两小时',
          mutedLabel: '已在本地静默',
          resetLabel: '恢复原始状态',
        }
        break
      case 'logs':
        result = { ...result, levelLabel: '日志级别' }
        break
      case 'uptime':
        result = {
          ...result,
          windowLabel: '历史窗口',
          endLabel: '今天',
          legend: [
            { id: 'operational', label: '正常运行' },
            { id: 'degraded', label: '性能下降' },
            { id: 'outage', label: '中断' },
          ],
        }
        break
      case 'fleet':
        result = {
          ...result,
          regionLabel: '区域',
          queryLabel: '搜索节点',
          queryPlaceholder: '按主机或角色搜索',
          statusLabel: '状态',
          refreshDetail: '指标每 30 秒刷新一次',
          columns: result.columns.map((column) => ({
            ...column,
            label:
              column.id === 'node' ? '节点' : column.id === 'memory' ? '内存' : column.id === 'disk' ? '磁盘' : 'CPU',
          })),
        }
        break
      case 'response':
        result = { ...result, routeLabel: '路由', histogramTitle: '延迟分布' }
        break
      case 'queue':
        result = {
          ...result,
          queryLabel: '搜索运行',
          queryPlaceholder: '搜索运行记录…',
          attentionLabel: '需要关注',
          collapseLabel: '折叠分组',
          expandLabel: '展开分组',
          newLabel: '新增运行',
        }
        break
      case 'slo':
        result = {
          ...result,
          windowLabel: '合规窗口',
          remainingLabel: '剩余预算',
          burnLabel: '消耗速率',
          chartTitle: (title) => `${title} · 错误预算`,
        }
        break
    }
  }
  return result
}
export function monitoringPreviewNotice(actionId: string, value?: string): string {
  return `${actionId}${value === undefined ? '' : `: ${value}`} requested in this preview only; no production service was changed.`
}
