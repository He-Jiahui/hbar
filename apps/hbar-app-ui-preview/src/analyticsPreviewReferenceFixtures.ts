import type { LumenAnalyticsReferenceContent as Content, LumenAnalyticsReferenceChart as Chart, LumenAnalyticsReferenceEntry as Entry, LumenAnalyticsReferenceMetric as Metric } from '@lumen/app-ui/catalog'

const grown = { kind: 'content-grown', expectedMaximum: 16 } as const
const pane = { kind: 'pane-scroll', expectedMaximum: 80 } as const
const violet = '#8b5cf6'
const colors = [violet, '#38bdf8', '#22c55e', '#fbbf24', '#fb7185']
const wave = [46, 42, 64, 56, 40, 76, 44, 64, 70, 62, 54, 82]
const rising = [30, 32, 30, 38, 42, 36, 48, 50, 48, 58, 62, 68]
const base = (title: string, pairs: readonly (readonly [string, string])[] = [], selectedId = '') => ({
  title,
  listStrategy: grown,
  labels: {
    empty: 'No data in this view.',
    unavailable: 'This captured reference does not include data for this selection.',
    choices: 'Reporting period or measure',
    detail: 'Selected data point',
  },
  choices: pairs.map(([id, label]) => ({ id, label })),
  selectedId,
  onSelect: (_slot: string, _id: string) => undefined,
  onFlag: (_id: string, _value: boolean) => undefined,
  onRequest: (_actionId: string) => undefined,
})
const metric = (
  id: string,
  label: string,
  value: string,
  delta?: string,
  points?: readonly number[],
  tone: Metric['tone'] = 'neutral',
): Metric => ({ id, label, value, delta, points, tone })
const entry = (id: string, label: string, amount: number, value: string, detail: string, color = violet): Entry => ({
  id,
  label,
  amount,
  value,
  detail,
  color,
})
const series = (id: string, label: string, points: readonly number[], color = violet) => ({
  id,
  label,
  points,
  color,
  visible: true,
})
const monthAxis = ['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov', 'Dec']
const dayAxis = ['Jun 1', 'Jun 6', 'Jun 11', 'Jun 16', 'Jun 21', 'Jun 26']
function chart(
  label: string,
  type: Chart['type'],
  maximum: number,
  points: Chart['series'],
  axis: readonly string[],
  ticks: readonly string[],
  firstDetail: string,
  cursorIndex = 0,
): Chart {
  const count = Math.max(0, ...points.map((item) => item.points.length))
  const pointLabels = Array.from({ length: count }, (_, i) => `${axis[0] ?? label} · sample ${i + 1}`)
  return {
    label,
    type,
    maximum,
    series: points,
    axis,
    ticks,
    pointLabels,
    cursorId: `point-${cursorIndex}`,
    cursorLabel: (index) =>
      index === cursorIndex ? firstDetail : `${pointLabels[index] ?? label} · illustrative reference curve`,
  }
}
export const ANALYTICS_REFERENCE_DATA_NOTE =
  'Visible labels and default totals are captured facts. Unobserved chart paths are illustrative approximations, not recovered source datasets. Uncaptured periods show an unavailable state.'

// Public rendered-preview text is evidence for labels and totals, not a dataset
// export. The bounded curve/cell/point fixtures below only reproduce the visible
// shape. Their unobserved tooltips explicitly identify them as illustrative.
export function createAnalyticsPreviewReferenceContent(variant: number, mode = 'default'): Content {
  let content: Content
  switch (variant) {
    case 1:
      content = {
        ...base(
          'Workspace pulse',
          [
            ['week', 'Week'],
            ['month', 'Month'],
            ['quarter', 'Quarter'],
          ],
          'week',
        ),
        kind: 'pulse',
        subtitle: 'Adoption, invitations and time spent across every workspace.',
        metrics: [
          metric('teams', 'Active teams', '8,733', '−0.8% vs start of week', wave, 'danger'),
          metric('seats', 'Seats invited', '1,268', '+3.6% vs start of week', rising, 'success'),
          metric('sessions', 'Sessions', '63,728', '−0.2% vs start of week', wave),
          metric('median', 'Median session', '7m 05s', '−1.2% vs start of week', wave),
        ],
        footer: '12,845 workspaces tracked · 76% active in the last 30 days',
        reportLabel: 'Open report',
      }
      break
    case 2:
      content = {
        ...base(
          'Net revenue',
          [
            ['7d', '7D'],
            ['30d', '30D'],
            ['12m', '12M'],
          ],
          '30d',
        ),
        kind: 'revenue',
        value: '$45,817',
        delta: '+23.1% over 30D period',
        chart: chart(
          'Net revenue over thirty days',
          'area',
          60000,
          [
            series(
              'revenue',
              'Net revenue',
              [37222, 35512, 38400, 40100, 42200, 41800, 43000, 45100, 44400, 45600, 46200, 47896, 45817],
            ),
          ],
          dayAxis,
          ['$60k', '$40k', '$20k', '$0'],
          'Jun 1 · $37,222',
        ),
        metrics: [
          metric('peak', 'Peak', '$47,896'),
          metric('average', 'Daily average', '$42,402'),
          metric('low', 'Lowest', '$35,512'),
        ],
      }
      break
    case 3:
      content = {
        ...base('Ticket volume · this year'),
        kind: 'tickets',
        value: '39,580',
        delta: '+14.2% vs last year',
        chart: chart(
          'Monthly ticket volume, this year and last year',
          'grouped',
          4000,
          [
            series('current', 'This year', [2720, 3020, 2840, 3300, 3240, 3320, 3440, 3510, 3650, 3630, 3910, 3540]),
            series(
              'previous',
              'Last year',
              [2460, 2660, 2540, 2880, 2810, 2780, 2980, 2950, 3100, 3100, 3190, 3040],
              '#94a3b8',
            ),
          ],
          monthAxis,
          ['4k', '3k', '2k', '1k', '0'],
          'Dec · This year 3,540 · Last year 3,040 · YoY +16.4%',
          11,
        ),
        metrics: [
          metric('total', 'This year total', '39,580'),
          metric('average', 'Monthly average', '3,298'),
          metric('peak', 'Busiest month', '3,910 · Nov'),
        ],
      }
      break
    case 4:
      content = {
        ...base('p99 latency · latest'),
        kind: 'latency',
        value: '280ms',
        delta: '+12% vs SLO',
        chart: {
          ...chart(
            'Latency percentiles and 250ms SLO',
            'line',
            300,
            [
              series('p50', 'p50', [41, 52, 44, 58, 46, 63, 52, 48, 50], '#22c55e'),
              series('p90', 'p90', [116, 152, 140, 162, 155, 165, 140, 145, 147], '#38bdf8'),
              series('p99', 'p99', [178, 207, 203, 270, 250, 258, 251, 266, 280]),
            ],
            ['Apr 1', 'Apr 6', 'Apr 11', 'Apr 16', 'Apr 21', 'Apr 26'],
            ['300ms', '200ms', '100ms', '0ms'],
            'Apr 30 · p50 50ms · p90 147ms · p99 280ms',
            8,
          ),
          guide: { value: 250, label: 'SLO 250ms' },
        },
        metrics: [
          metric('p50', 'p50 latency', '50ms'),
          metric('p90', 'p90 latency', '147ms'),
          metric('p99', 'p99 latency', '280ms'),
        ],
      }
      break
    case 5:
      content = {
        ...base(
          'Traffic by channel',
          [
            ['sessions', 'Sessions'],
            ['revenue', 'Revenue'],
          ],
          'sessions',
        ),
        kind: 'channels',
        subtitle: 'Where visitors came from over the last 30 days.',
        total: '12,845',
        unit: 'Sessions',
        selectedSummary: (item) => `${item.detail} of sessions`,
        activeEntryId: '',
        entries: [
          entry('organic', 'Organic search', 5842, '5,842', '45.5%'),
          entry('direct', 'Direct', 3210, '3,210', '25%', colors[1]),
          entry('referral', 'Referral', 1680, '1,680', '13.1%', colors[2]),
          entry('email', 'Email', 1145, '1,145', '8.9%', colors[3]),
          entry('paid', 'Paid social', 968, '968', '7.5%', colors[4]),
        ],
      }
      break
    case 6:
      content = {
        ...base(
          'Referral signups',
          [
            ['7d', '7 days'],
            ['28d', '28 days'],
            ['90d', '90 days'],
          ],
          '28d',
        ),
        kind: 'referrals',
        value: '12,480',
        delta: '+11.6% vs prev. 28 days',
        activeEntryId: '',
        contribution: [
          entry('ph', 'Product Hunt', 3240, '3,240', ''),
          entry('hn', 'Hacker News', 2610, '2,610', '', '#a78bfa'),
          entry('gh', 'GitHub', 1980, '1,980', '', '#c4b5fd'),
          entry('other', 'Everything else', 4650, '4,650', '', '#64748b'),
        ],
        entries: [
          ['ph', 'Product Hunt', 3240, '+18.2%', 'PH'],
          ['hn', 'Hacker News', 2610, '+9.4%', 'HN'],
          ['gh', 'GitHub', 1980, '−4.1%', 'GH'],
          ['dt', 'Dev.to', 1120, '+22.5%', 'DT'],
          ['rd', 'Reddit', 880, '−6.8%', 'RD'],
          ['li', 'LinkedIn', 640, '+3.3%', 'LI'],
        ].map((row) => {
          const [id, label, amount, delta, abbreviation] = row
          return {
            ...entry(String(id), String(label), Number(amount), Number(amount).toLocaleString('en-US'), ''),
            delta: String(delta),
            abbreviation: String(abbreviation),
            points: wave,
          }
        }),
        footer: 'Top 3 sources drove 63% of signups.',
      }
      break
    case 7:
      content = {
        ...base(
          'Service health',
          [
            ['1h', '1h'],
            ['24h', '24h'],
            ['7d', '7d'],
          ],
          '24h',
        ),
        kind: 'service',
        subtitle: 'Live signals from the ingest tier. Select a card for detail.',
        activeMetricId: 'requests',
        metrics: [
          metric('requests', 'Request rate', '4.8k req/s', '+6.4%', wave, 'success'),
          metric('latency', 'p95 latency', '184ms', '+8.1%', wave, 'danger'),
          metric('errors', 'Error rate', '0.45%', '+14.3%', wave, 'danger'),
          metric('cpu', 'CPU saturation', '60%', '−4.2%', wave, 'success'),
        ],
        detailTitle: 'Request rate · last 24h',
        chart: chart(
          'Request rate over the last 24 hours',
          'area',
          6000,
          [series('requests', 'Request rate', [4400, 4800, 4600, 5100, 4800, 4700, 4900, 4800])],
          ['00:00', '06:00', '12:00', '18:00'],
          ['6k', '4k', '2k', '0'],
          'Request rate · 4.8k req/s',
          7,
        ),
        detailMetrics: [
          metric('peak', 'Peak', '5.1k req/s'),
          metric('average', 'Average', '4.8k req/s'),
          metric('low', 'Low', '4.4k req/s'),
        ],
      }
      break
    case 8:
      content = {
        ...base(
          'Signup funnel',
          [
            ['all', 'All traffic'],
            ['organic', 'Organic'],
            ['paid', 'Paid'],
          ],
          'all',
        ),
        kind: 'funnel',
        subtitle: 'Self-serve activation · pricing page to paid.',
        activeEntryId: '',
        entries: [
          entry('pricing', 'Visited pricing', 24000, '24,000', '100%'),
          entry('trial', 'Started trial', 8400, '8,400', '35%'),
          entry('teammate', 'Invited teammate', 5100, '5,100', '21.3%'),
          entry('repo', 'Connected repo', 3600, '3,600', '15%'),
          entry('paid', 'Converted to paid', 2050, '2,050', '8.5%'),
        ],
        drops: [
          '−15,600 lost · 65% drop · steepest fall',
          '−3,300 lost · 39.3% drop',
          '−1,500 lost · 29.4% drop',
          '−1,550 lost · 43.1% drop',
        ],
        footer: 'Visitor-to-paid conversion 8.5%',
      }
      break
    case 9:
      content = {
        ...base(
          'Deployments',
          [
            ['deployments', 'Deployments'],
            ['incidents', 'Incidents'],
            ['reviews', 'Reviews'],
          ],
          'deployments',
        ),
        kind: 'heatmap',
        listStrategy: { kind: 'content-grown', expectedMaximum: 182 },
        value: '608',
        subtitle: 'Busiest Mon, 4 Nov (10) · 9-day active streak',
        activeCellId: 'cell-0',
        cells: Array.from({ length: 182 }, (_, i) => ({
          id: `cell-${i}`,
          count: i === 0 ? 2 : (i * 7 + Math.floor(i / 7) * 3) % 11,
          label: i === 0 ? '2 deployments · Sun, 4 May' : `Illustrative calendar cell ${i + 1}`,
        })),
        months: ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'],
        weekdays: ['Mon', 'Wed', 'Fri'],
        less: 'Less',
        more: 'More',
      }
      break
    case 10:
      content = {
        ...base(
          'Quarterly goals',
          [
            ['q1', 'Q1'],
            ['q2', 'Q2'],
            ['q3', 'Q3'],
            ['q4', 'Q4'],
          ],
          'q1',
        ),
        kind: 'goals',
        subtitle: 'Attainment against plan · 8 days left in Q1',
        activeEntryId: '',
        entries: [
          entry('arr', 'Net new ARR', 84, '84%', '$4.2M of $5M'),
          entry('expansion', 'Expansion revenue', 108.3, '108%', '$1.3M of $1.2M', '#22c55e'),
          entry('retention', 'Logo retention', 97.8, '98%', '91% of 93%', '#38bdf8'),
        ],
        footer: '8 days left in Q1 · Blended attainment 96.7%',
      }
      break
    case 11:
      content = {
        ...base(
          'Cohort retention',
          [
            ['users', 'User retention'],
            ['revenue', 'Revenue retention'],
          ],
          'users',
        ),
        kind: 'cohort',
        subtitle: 'Month 3 average 45% · Best cohort Aug 2025 (46% at month 3)',
        displayChoices: [
          { id: 'percent', label: 'Percent' },
          { id: 'absolute', label: 'Absolute' },
        ],
        displayId: 'percent',
        columnLabel: 'Cohort',
        periods: ['Month 0', 'Month 1', 'Month 2', 'Month 3', 'Month 4', 'Month 5', 'Month 6', 'Month 7', 'Month 8'],
        rows: [
          { id: 'jun', label: 'Jun 2025', detail: '1,563 signups', values: [100, 64, 48, 42, 40, 34, 31, 34, 31] },
          { id: 'jul', label: 'Jul 2025', detail: '1,756 signups', values: [100, 62, 49, 45, 39, 34, 34, 34] },
          { id: 'aug', label: 'Aug 2025', detail: '1,936 signups', values: [100, 61, 51, 46, 38, 36, 36] },
          { id: 'sep', label: 'Sep 2025', detail: '2,160 signups', values: [100, 63, 53, 45, 39, 37] },
          { id: 'oct', label: 'Oct 2025', detail: '2,452 signups', values: [100, 64, 53, 45, 40] },
          { id: 'nov', label: 'Nov 2025', detail: '2,790 signups', values: [100, 65, 54, 45] },
          { id: 'dec', label: 'Dec 2025', detail: '3,120 signups', values: [100, 67, 54] },
          { id: 'jan', label: 'Jan 2026', detail: '3,396 signups', values: [100, 68] },
        ].map((row) => ({ ...row, values: row.values.map((value) => ({ label: `${value}%`, percent: value })) })),
        averageLabel: 'Average',
        averages: ['100%', '64%', '52%', '45%', '39%', '35%', '34%', '34%', '31%'],
      }
      break
    case 12:
      content = {
        ...base(
          'Storage by tier',
          [
            ['stacked', 'Stacked'],
            ['percent', '100%'],
          ],
          'stacked',
        ),
        kind: 'storage',
        value: '993 TB',
        delta: 'across 4 tiers',
        chart: chart(
          'Storage by tier over twelve months',
          'stacked',
          1000,
          [
            series('hot', 'Hot', [40, 45, 42, 50, 48, 54, 52, 60, 58, 64, 65, 68]),
            series('warm', 'Warm', [78, 84, 83, 90, 92, 98, 101, 108, 110, 115, 118, 124], '#38bdf8'),
            series('cold', 'Cold', [190, 204, 210, 225, 236, 244, 253, 267, 273, 286, 296, 305], '#22c55e'),
            series('archive', 'Archive', [244, 268, 285, 314, 325, 338, 363, 384, 407, 440, 472, 496], '#64748b'),
          ],
          monthAxis,
          ['1k', '750', '500', '250', '0'],
          'Dec · Hot 68 TB (6.8%) · Warm 124 TB (12.5%) · Cold 305 TB (30.7%) · Archive 496 TB (49.9%) · Total 993 TB',
          11,
        ),
        metrics: [
          metric('total', 'Total stored', '993 TB'),
          metric('growth', 'Growth this month', '+4.4%'),
          metric('hot', 'Hot tier share', '6.8%'),
        ],
      }
      break
    case 13:
      content = {
        ...base(
          'Compute credits · CMP/USD',
          [
            ['30d', '30D'],
            ['90d', '90D'],
            ['1y', '1Y'],
          ],
          '30d',
        ),
        kind: 'candles',
        listStrategy: { kind: 'content-grown', expectedMaximum: 30 },
        value: '$132.44',
        delta: '+$4.44 (+3.47%) over 30D',
        subtitle: 'Period high 138.45 · low 122.52',
        chartLabel: 'Compute credits candles and volume',
        candles: Array.from({ length: 30 }, (_, i) => {
          const open = i === 0 ? 128 : 128 + Math.sin(i / 2) * 3 + i / 8
          const close = i === 0 ? 128.56 : i === 29 ? 132.44 : open + Math.sin(i * 3) * 2
          return {
            id: `candle-${i}`,
            label: `Jan ${i + 2}`,
            open,
            close,
            high: i === 0 ? 129.86 : Math.max(open, close) + 1.6,
            low: i === 0 ? 127.72 : Math.min(open, close) - 1.6,
            volume: 22 + (i % 7) * 4,
            detail:
              i === 0
                ? 'Jan 2 · Open 128 · High 129.86 · Low 127.72 · Close 128.56 · +0.44%'
                : `Jan ${i + 2} · illustrative candle, source OHLC not captured`,
          }
        }),
        activeCandleId: 'candle-0',
        axis: ['Jan 2', 'Jan 7', 'Jan 12', 'Jan 17', 'Jan 22', 'Jan 27'],
        ticks: ['$140', '$130', '$120'],
        minimum: 120,
        maximum: 140,
      }
      break
    case 14:
      content = {
        ...base(
          'Account health',
          [
            ['all', 'All'],
            ['growth', 'Growth'],
            ['enterprise', 'Enterprise'],
          ],
          'all',
        ),
        kind: 'scatter',
        listStrategy: { kind: 'content-grown', expectedMaximum: 26 },
        subtitle: 'Seats against weekly active usage, sized by contract value.',
        value: '26 accounts',
        delta: '11 at risk · median 156 seats',
        chartLabel: 'Accounts by seats, active usage and contract value',
        points: Array.from({ length: 26 }, (_, i) => ({
          id: `account-${i}`,
          label: i === 0 ? 'Northwind Labs' : `Illustrative account ${i + 1}`,
          seats: i === 0 ? 268 : 18 + ((i * 53) % 281),
          active: i === 0 ? 48 : 12 + ((i * 17) % 87),
          size: i === 0 ? 3 : 1.5 + (i % 5) * 0.45,
          segment: i % 2 === 0 ? 'enterprise' : 'growth',
          detail:
            i === 0
              ? 'Northwind Labs · 268 seats · 48% active · $96,769'
              : `Illustrative account ${i + 1} · source record not captured`,
        })),
        activePointId: 'account-0',
        maximumSeats: 300,
        medianSeats: 156,
        threshold: 65,
        quadrants: ['Healthy', 'Expand', 'Watch', 'At risk'],
        xAxis: ['0 seats', '100', '200', '300'],
        yAxis: ['100% active', '75%', '50%', '25%', '0%'],
        footer: 'Contract value $12k – $150k · At risk: below 65% usage above median seats',
      }
      break
    case 15:
      content = {
        ...base(
          'Quota attainment by rep',
          [
            ['attainment', 'By attainment'],
            ['quota', 'By quota'],
            ['alphabetical', 'Alphabetical'],
          ],
          'attainment',
        ),
        kind: 'bullets',
        subtitle: 'Closed revenue against quota this quarter. Tick marks = 100%.',
        activeEntryId: '',
        entries: [
          { ...entry('priya', 'Priya Nandakumar', 487000, '116%', '$487k of $420k · +$67k'), quota: 420000 },
          { ...entry('wei', 'Wei Chen', 402000, '111.7%', '$402k of $360k · +$42k'), quota: 360000 },
          { ...entry('sofia', 'Sofia Alvarez', 441000, '98%', '$441k of $450k · −$9k'), quota: 450000 },
          { ...entry('amelia', 'Amelia Whitfield-Osei', 475000, '95%', '$475k of $500k · −$25k'), quota: 500000 },
          { ...entry('marcus', 'Marcus Bell', 312000, '82.1%', '$312k of $380k · −$68k'), quota: 380000 },
          { ...entry('tomas', 'Tomás Guerrero', 268000, '67%', '$268k of $400k · −$132k'), quota: 400000 },
        ],
        footer: 'Team 95% blended quota · $2.4M of $2.5M · −$125k',
      }
      break
    default:
      content = {
        ...base(
          'Requests per second',
          [
            ['60s', '60s'],
            ['5m', '5m'],
            ['15m', '15m'],
          ],
          '60s',
        ),
        kind: 'live',
        value: '1,141 rps',
        chart: chart(
          'Live requests per second, local bounded preview stream',
          'area',
          1500,
          [series('requests', 'Requests', [880, 1100, 1050, 1040, 1200, 1000, 1254, 1030, 1050, 1141])],
          ['59s', '29s', 'now'],
          ['1.5k', '1k', '500', '0'],
          'now · 1,141 rps',
          9,
        ),
        metrics: [
          metric('current', 'Current', '1,141 rps'),
          metric('peak', 'Window peak', '1,254'),
          metric('mean', 'Window mean', '1,049'),
        ],
        paused: false,
        pauseLabel: 'Pause',
        resumeLabel: 'Resume',
        liveLabel: 'Live',
        pausedLabel: 'Paused',
      }
  }
  if (mode === 'localized')
    content = {
      ...content,
      title: '按来源分析团队在较长报告周期内的新增注册与持续参与情况',
      labels: {
        empty: '当前选择没有数据。',
        unavailable: '公开参考快照没有包含此选择的数据。',
        choices: '统计周期与指标',
        detail: '选中数据点',
      },
    }
  if (content.kind === 'referrals') {
    if (mode === 'empty') content = { ...content, entries: [], contribution: [] }
    if (mode === 'one') content = { ...content, entries: content.entries.slice(0, 1) }
    if (mode === 'boundary' || mode === 'overflow')
      content = {
        ...content,
        listStrategy: pane,
        entries: Array.from({ length: mode === 'boundary' ? 80 : 81 }, (_, i) => ({
          ...entry(`capacity-source-${i}`, `Synthetic capacity source ${i + 1}`, i + 1, String(i + 1), ''),
          abbreviation: String(i + 1),
          points: wave,
        })),
      }
  }
  return content
}
export function analyticsPreviewNotice(actionId: string): string {
  return actionId === 'open-report'
    ? 'Report-opening intent recorded for this workspace preview; no external report service is connected.'
    : 'Preview intent recorded; no external operation has been confirmed.'
}

/** Alternate values actually captured after a source control changed. */
export function analyticsPreviewCapturedSelection(content: Content, selectedId: string): Content | undefined {
  if (content.kind === 'revenue' && selectedId === '7d')
    return {
      ...content,
      selectedId,
      value: '$47,904',
      delta: '+15.0% over 7D period',
      chart: chart(
        'Net revenue over seven days',
        'area',
        60000,
        [series('revenue', 'Net revenue', [40742, 42100, 41700, 44800, 43900, 44008, 47904])],
        ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        ['$60k', '$40k', '$20k', '$0'],
        'Sun · $47,904',
        6,
      ),
      metrics: [
        metric('peak', 'Peak', '$47,904'),
        metric('average', 'Daily average', '$43,022'),
        metric('low', 'Lowest', '$40,742'),
      ],
    }
  if (content.kind === 'referrals' && selectedId === '7d') {
    const amounts = [940, 610, 505, 300, 210, 165]
    const deltas = ['+24.0%', '+5.2%', '−2.0%', '+31.0%', '−9.0%', '+6.0%']
    return {
      ...content,
      selectedId,
      value: '3,180',
      delta: '+14.2% vs prev. 7 days',
      contribution: content.contribution.map((item, i) => ({
        ...item,
        amount: [940, 610, 505, 1125][i] ?? 0,
        value: ([940, 610, 505, 1125][i] ?? 0).toLocaleString('en-US'),
      })),
      entries: content.entries.map((item, i) => ({
        ...item,
        amount: amounts[i] ?? 0,
        value: (amounts[i] ?? 0).toLocaleString('en-US'),
        delta: deltas[i],
      })),
      footer: 'Top 3 sources drove 65% of signups.',
    }
  }
  if (content.kind === 'service' && selectedId === '1h')
    return {
      ...content,
      selectedId,
      metrics: content.metrics.map((item) => ({
        ...item,
        value:
          new Map([
            ['requests', '4.8k req/s'],
            ['latency', '169ms'],
            ['errors', '0.47%'],
            ['cpu', '64%'],
          ]).get(item.id) ?? item.value,
      })),
      detailTitle: 'Request rate · last 1h',
    }
  return undefined
}
