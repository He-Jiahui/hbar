import type { LumenDataTableContent, LumenDataTableReferenceContent } from '@lumen/app-ui/catalog'

type Standard = Exclude<LumenDataTableReferenceContent, { readonly kind: 'shipments' | 'sources' }>
type Row = Standard['rows'][number]
type Column = Standard['columns'][number]
const grown = { kind: 'content-grown', expectedMaximum: 80 } as const
const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
const tone = (status: string): 'neutral' | 'warning' | 'danger' => {
  if (['Failed', 'High', 'Delayed'].includes(status)) return 'danger'
  return ['Needs review', 'Needs approval', 'Watch', 'At risk'].includes(status) ? 'warning' : 'neutral'
}
function columns(values: readonly (readonly [string, string])[], sortable: readonly string[] = []): readonly Column[] {
  return values.map(([id, label]) => ({
    id,
    label,
    visible: true,
    sortable: sortable.includes(id),
    numeric: [
      'mrr',
      'amount',
      'hours',
      'rate',
      'total',
      'pallets',
      'peak',
      'mon',
      'tue',
      'wed',
      'thu',
      'fri',
      'sat',
      'sun',
    ].includes(id),
  }))
}
function row(id: string, name: string, cells: readonly (readonly [string, string | number])[], subline?: string): Row {
  return {
    id,
    name,
    subline,
    searchText: [name, subline, ...cells.map(([, value]) => value)].filter(Boolean).join(' '),
    cells: cells.map(([field, value]) => ({
      id: field,
      text: typeof value === 'number' ? String(value) : value,
      ...(typeof value === 'number' ? { value } : {}),
      ...(field === 'status' || field === 'risk' ? { tone: tone(String(value)) } : {}),
    })),
  }
}
function base(
  title: string,
  caption: string,
  values: readonly Row[],
  tableColumns: readonly Column[],
  noun: string,
): Omit<Standard, 'kind'> {
  return {
    title,
    caption,
    rows: values,
    columns: tableColumns,
    total: values.length,
    listStrategy: grown,
    copy: {
      empty: 'No matching records',
      count: (shown, total) => `Showing ${shown} of ${total} ${noun}`,
      sort: (label) => `Sort by ${label}`,
    },
  }
}
export function createDataTablePreviewReferenceContent(variant: number, mode = 'default'): LumenDataTableContent {
  let reference: LumenDataTableReferenceContent
  switch (variant) {
    case 1: {
      const values = [
        ['vantage', 'Vantage Grid Systems', 'Priya Rao', 'Enterprise', 'Active', 'North America', 26740, 'Nov 4'],
        [
          'longleaf',
          'Longleaf Clinical Research Network International',
          'Ari Chen',
          'Enterprise',
          'Active',
          'APAC',
          22190,
          'Sep 19',
        ],
        ['redwood', 'Redwood Payments', 'Jun Park', 'Enterprise', 'Needs review', 'North America', 19870, 'Nov 29'],
        ['sable', 'Sable Ridge Energy', 'Mina Kapoor', 'Enterprise', 'Needs review', 'EMEA', 18420, 'Aug 12'],
        ['harbor', 'Harbor & Vale Freight', 'Marcus Lund', 'Scale', 'Active', 'EMEA', 11230, 'Nov 11'],
        ['pier', 'North Pier Robotics', 'Tomasz Nowak', 'Scale', 'Active', 'North America', 9860, 'Sep 3'],
        ['kite', 'Kite Harbor Logistics', 'Devon Okafor', 'Scale', 'Active', 'LATAM', 7540, 'Oct 8'],
        ['tidewater', 'Tidewater Instruments', 'Sofia Martins', 'Growth', 'Active', 'APAC', 5620, 'Nov 18'],
        ['cobalt', 'Cobalt Field Labs', 'Rhea Flores', 'Growth', 'Paused', 'North America', 4210, 'Oct 1'],
        ['mossbank', 'Mossbank Archive Trust', 'Lena Ortiz', 'Growth', 'Needs review', 'EMEA', 3980, 'Oct 22'],
      ] as const
      const rows = values.map(([id, name, owner, plan, status, region, mrr, renewal]) => ({
        ...row(id, name, [
          ['owner', owner],
          ['plan', plan],
          ['status', status],
          ['region', region],
          ['mrr', money(mrr)],
          ['renewal', renewal],
        ]),
        categoryId: plan.toLowerCase(),
        cells: row(id, name, [
          ['owner', owner],
          ['plan', plan],
          ['status', status],
          ['region', region],
          ['mrr', money(mrr)],
          ['renewal', renewal],
        ]).cells.map((cell) => (cell.id === 'mrr' ? { ...cell, value: mrr } : cell)),
      }))
      reference = {
        ...base(
          'Accounts',
          'Customer accounts',
          rows,
          columns(
            [
              ['name', 'Account'],
              ['owner', 'Owner'],
              ['plan', 'Plan'],
              ['status', 'Status'],
              ['region', 'Region'],
              ['mrr', 'MRR'],
              ['renewal', 'Renewal'],
            ],
            ['name', 'mrr', 'renewal'],
          ).map((column) => ({ ...column, toggleable: ['owner', 'plan', 'region', 'renewal'].includes(column.id) })),
          'accounts',
        ),
        kind: 'accounts',
        query: '',
        sort: { field: 'mrr', direction: 'desc' },
        filters: [
          { id: 'all', label: 'All plans' },
          { id: 'enterprise', label: 'Enterprise' },
          { id: 'scale', label: 'Scale' },
          { id: 'growth', label: 'Growth' },
        ],
        filterId: 'all',
        labels: {
          export: 'Export',
          columns: 'Columns',
          filters: 'Account plan',
          renews: (date) => `Renews ${date}`,
          noMatches: 'No matching accounts',
          noMatchesBody: 'Try a different search, or clear the plan filter.',
          clear: 'Clear filters',
        },
        copy: {
          ...base('', '', [], [], '').copy,
          search: 'Search accounts',
          count: (shown, total) => `Showing ${shown} of ${total} accounts`,
        },
      }
      break
    }
    case 2: {
      const values = [
        ['PAY-0182', 'Pilot Fiber Transit', 'Iris Woods', 'Needs approval', 6420, 'Aug 6'],
        ['PAY-0183', 'Granite Switchgear Supply', 'Niko Bryant', 'Scheduled', 18200, 'Aug 7'],
        ['PAY-0184', 'Beacon Yard Services', 'Marisol Vale', 'Paid', 3140, 'Aug 9'],
        ['PAY-0185', 'Atlas Thermal Controls', 'Jun Park', 'Scheduled', 9880, 'Aug 11'],
        ['PAY-0186', 'Silverline Security Review Partners', 'Mara Singh', 'Needs approval', 2760, 'Aug 15'],
        ['PAY-0187', 'Lowland Metering Group', 'Theo Grant', 'Paid', 14050, 'Aug 18'],
        ['PAY-0188', 'Cedarworks Freight', 'Asha Malik', 'Scheduled', 5310, 'Aug 20'],
        ['PAY-0189', 'Halden Instrument Rental', 'Camille Hart', 'Paid', 1980, 'Aug 22'],
        ['PAY-0190', 'Northwind Facilities', 'Iris Woods', 'Needs approval', 22400, 'Aug 25'],
        ['PAY-0191', 'Riverbend Testing Lab', 'Niko Bryant', 'Scheduled', 7640, 'Aug 27'],
      ] as const
      const rows = values.map(([id, name, owner, status, amount, due]) => ({
        ...row(
          id,
          name,
          [
            ['owner', owner],
            ['status', status],
            ['amount', money(amount)],
            ['due', due],
          ],
          id,
        ),
        selected: ['PAY-0182', 'PAY-0185'].includes(id),
        cells: row(
          id,
          name,
          [
            ['owner', owner],
            ['status', status],
            ['amount', money(amount)],
            ['due', due],
          ],
          id,
        ).cells.map((cell) => (cell.id === 'amount' ? { ...cell, value: amount } : cell)),
      }))
      reference = {
        ...base(
          'Outgoing payments',
          'Outgoing vendor payments',
          rows,
          columns([
            ['name', 'Vendor'],
            ['owner', 'Owner'],
            ['status', 'Status'],
            ['amount', 'Amount'],
            ['due', 'Due'],
          ]),
          'payments',
        ),
        kind: 'payments',
        total: 28,
        page: 1,
        pageSize: 10,
        pageSizes: [10, 25],
        selectedCount: 2,
        selectedAmount: '$16,300',
        labels: {
          pending: (count) => `${count} pending`,
          selected: (count) => `${count} selected`,
          selectPage: 'Select all payments on this page',
          selectRow: (name) => `Select ${name}`,
          hold: 'Hold',
          export: 'Export',
          clear: 'Clear selection',
          rowsPerPage: 'Rows per page',
          previous: 'Previous page',
          next: 'Next page',
          page: (page) => `Page ${page}`,
          range: (start, end, total) => `${start}–${end} of ${total}`,
          unavailable: 'No preview records available for this page.',
        },
      }
      break
    }
    case 3: {
      const values = [
        ['warehouse', 'Warehouse cutover rehearsal', 'Priya Rao', 'Draft', 38, 145],
        ['carrier', 'Carrier exception rules', 'Mateo Silva', 'Needs review', 22, 160],
        ['receiving', 'International receiving controls', 'Nora Jensen', 'Draft', 44, 135],
        ['packet', 'Executive weekly operating packet', 'Samir Patel', 'Locked', 16, 175],
        ['compliance', 'Cold-chain compliance evidence library', 'Elena Rossi', 'Draft', 31, 150],
        ['returns', 'Returns triage automation', 'Devon Okafor', 'Draft', 27, 140],
        ['staffing', 'Peak season staffing model', 'Ivy Zhang', 'Needs review', 19, 165],
        ['dock', 'Dock scheduling rewrite', 'Marcus Lund', 'Draft', 52, 155],
        ['vendor', 'Vendor onboarding checklist', 'Asha Malik', 'Locked', 12, 130],
        ['inventory', 'Inventory count reconciliation', 'Theo Grant', 'Draft', 34, 150],
        ['audit', 'Freight audit dispute pipeline', 'Camille Hart', 'Needs review', 29, 170],
      ] as const
      const rows = values.map(([id, name, owner, status, hours, rate]) => ({
        ...row(id, name, [
          ['owner', owner],
          ['status', status],
          ['hours', hours],
          ['rate', money(rate)],
          ['total', money(hours * rate)],
        ]),
        disabled: status === 'Locked',
        cells: row(id, name, [
          ['owner', owner],
          ['status', status],
          ['hours', hours],
          ['rate', money(rate)],
          ['total', money(hours * rate)],
        ]).cells.map((cell) => ({
          ...cell,
          ...(cell.id === 'rate' ? { value: rate } : {}),
          editable: status !== 'Locked' && ['hours', 'rate'].includes(cell.id),
        })),
      }))
      reference = {
        ...base(
          'Budget allocation',
          'Editable workstream budget allocation',
          rows,
          columns([
            ['name', 'Workstream'],
            ['owner', 'Owner'],
            ['status', 'Status'],
            ['hours', 'Hours'],
            ['rate', 'Rate'],
            ['total', 'Total'],
          ]),
          'workstreams',
        ),
        kind: 'budget',
        subtitle: 'Click hours or rate to edit',
        totalBudget: '$48,985',
        labels: { total: 'Total budget', edit: (name, column) => `Edit ${column} for ${name}` },
        copy: { ...base('', '', [], [], '').copy, count: (shown) => `${shown} workstreams` },
      }
      break
    }
    case 4: {
      const values = [
        ['RUN-8041', 'Nightly claims ledger reconciliation', 'Asha Malik', 'Passed', '14m 22s', '39,420 rows'],
        ['RUN-8042', 'Cold-chain incident attachment scan', 'Theo Grant', 'Needs review', '6m 09s', '812 incidents'],
        ['RUN-8043', 'Vendor master duplicate detection', 'Camille Hart', 'Passed', '3m 58s', '1,204 vendors'],
        ['RUN-8044', 'Freight invoice variance audit for Q3 European lanes', 'Jun Park', 'Failed', '1m 12s', '0 rows'],
        ['RUN-8045', 'Returns disposition rule check', 'Ivy Zhang', 'Passed', '8m 41s', '5,109 returns'],
        ['RUN-8046', 'Dock appointment overlap detection', 'Marcus Lund', 'Passed', '2m 33s', '684 appointments'],
        [
          'RUN-8047',
          'Customs paperwork completeness sweep',
          'Sofia Martins',
          'Needs review',
          '11m 04s',
          '2,940 shipments',
        ],
        ['RUN-8048', 'Inventory shrink threshold review', 'Rhea Flores', 'Passed', '5m 27s', '18,006 SKUs'],
        ['RUN-8049', 'Carrier SLA breach detection', 'Devon Okafor', 'Passed', '4m 15s', '3,377 loads'],
      ] as const
      const rows = values.map(([id, name, owner, status, duration, checked]) => ({
        ...row(
          id,
          name,
          [
            ['owner', owner],
            ['status', status],
            ['duration', duration],
            ['checked', checked],
          ],
          id,
        ),
        expanded: id === 'RUN-8041',
        detail: {
          body:
            id === 'RUN-8041'
              ? 'Matched carrier claims against the posted warehouse ledger. Two rounding adjustments were carried forward for manager review.'
              : 'No preview detail available for this check.',
          tags:
            id === 'RUN-8041'
              ? ['ledger.carrier_claims', 'warehouse.reconciliations', 's3://ops-ledger/aug-03'].map((label) => ({
                  id: label,
                  label,
                }))
              : [],
        },
      }))
      reference = {
        ...base(
          'Overnight checks',
          'Overnight automation checks, expandable',
          rows,
          columns([
            ['name', 'Check'],
            ['owner', 'Owner'],
            ['status', 'Result'],
            ['duration', 'Duration'],
            ['checked', 'Checked'],
          ]),
          'overnight checks',
        ),
        kind: 'checks',
        query: '',
        labels: { expand: 'Expand', toggle: (name, expanded) => `${expanded ? 'Collapse' : 'Expand'} ${name}` },
        copy: {
          ...base('', '', [], [], '').copy,
          search: 'Search checks',
          count: (shown, total) => `Showing ${shown} of ${total} overnight checks`,
        },
      }
      break
    }
    case 5: {
      const values = [
        ['ORD-4418', 'Tidal Packworks', 'Oakland → Reno', 'On time', 18, '11:30', 'today'],
        ['ORD-4419', 'Harborline Grocers', 'Tacoma → Boise', 'Watch', 26, '13:45', 'today'],
        ['ORD-4420', 'Juniper Health Distribution', 'Dallas → Tulsa', 'On time', 12, '16:10', 'today'],
        ['ORD-4421', 'Blue Orchard Cooperative', 'Fresno → Phoenix', 'Delayed', 31, '18:20', 'today'],
        ['ORD-4423', 'Cedar Mill Provisions', 'Portland → Eugene', 'On time', 14, '08:15', 'tomorrow'],
        ['ORD-4424', 'Ridgeway Medical Supply', 'Denver → Cheyenne', 'Watch', 22, '10:40', 'tomorrow'],
        ['ORD-4425', 'Marble Arch Importers', 'Newark → Hartford', 'On time', 7, '12:00', 'tomorrow'],
        ['ORD-4428', 'Bellwether Cold Storage', 'Atlanta → Nashville', 'On time', 24, 'Wed 09:20', 'week'],
        ['ORD-4429', 'Kestrel Outdoor', 'Salt Lake City → Boise', 'On time', 11, 'Thu 11:10', 'week'],
        ['ORD-4430', 'Vermillion Paper Mills', 'Duluth → Fargo', 'Watch', 33, 'Thu 15:45', 'week'],
      ] as const
      const rows = values.map(([id, name, lane, status, pallets, eta, groupId]) => ({
        ...row(
          id,
          name,
          [
            ['lane', lane],
            ['status', status],
            ['pallets', pallets],
            ['eta', eta],
          ],
          id,
        ),
        groupId,
      }))
      reference = {
        ...base(
          'Dispatch board',
          'Dispatch orders grouped by day',
          rows,
          columns([
            ['name', 'Order'],
            ['lane', 'Lane'],
            ['status', 'Status'],
            ['pallets', 'Pallets'],
            ['eta', 'ETA'],
          ]),
          'orders',
        ),
        kind: 'dispatch',
        groups: [
          { id: 'today', label: 'Today' },
          { id: 'tomorrow', label: 'Tomorrow' },
          { id: 'week', label: 'This week' },
        ],
        densities: [
          { id: 'comfortable', label: 'Comfortable' },
          { id: 'compact', label: 'Compact' },
        ],
        densityId: 'comfortable',
        densityLabel: 'Table density',
        copy: { ...base('', '', [], [], '').copy, count: (shown) => `${shown} orders across 3 windows` },
      }
      break
    }
    case 6: {
      const values = [
        ['SHP-9284', 'Everbranch Foods', 'Fresno → Denver', 'In transit'],
        ['meridian', 'Meridian Lab Supply', 'Boston → Raleigh', 'At risk'],
        ['pier', 'North Pier Robotics', 'Austin → Mesa', 'Delivered'],
        ['longleaf', 'Longleaf Clinical Research Network International', 'Newark → Montreal', 'In transit'],
        ['cedar', 'Cedar Mill Provisions', 'Portland → Eugene', 'In transit'],
        ['bellwether', 'Bellwether Cold Storage', 'Atlanta → Nashville', 'Delivered'],
        ['ridgeway', 'Ridgeway Medical Supply', 'Denver → Cheyenne', 'At risk'],
        ['anchor', 'Anchor Point Seafood', 'Seattle → Spokane', 'In transit'],
        ['harbor', 'Harbor Grove Dairy', 'Sacramento → Reno', 'In transit'],
        ['vantage', 'Vantage Pharma Distribution', 'Chicago → Columbus', 'At risk'],
        ['tidewater', 'Tidewater Produce', 'Norfolk → Richmond', 'Delivered'],
      ] as const
      reference = {
        kind: 'shipments',
        title: 'Live shipments',
        query: '',
        selectedId: 'SHP-9284',
        total: 11,
        listStrategy: grown,
        labels: {
          count: (count) => `${count} moving`,
          search: 'Search shipments',
          empty: 'No matching shipments',
          unavailable: 'No preview detail available for this shipment.',
          notes: 'Notes',
          activity: 'Activity',
          message: 'Message driver',
          deliver: 'Mark delivered',
        },
        items: values.map(([id, name, route, status]) => ({
          id,
          ...(id === 'SHP-9284' ? { displayId: id } : {}),
          name,
          route,
          status,
          tone: tone(status),
          ...(id === 'SHP-9284'
            ? {
                detail: {
                  metadata: [
                    ['owner', 'Owner', 'Lena Moore'],
                    ['carrier', 'Carrier', 'Crossline Freight'],
                    ['temperature', 'Temperature', '2.4°C'],
                    ['value', 'Declared value', '$48,200'],
                    ['eta', 'ETA', 'Today 17:40'],
                  ].map(([key, label, value]) => ({ id: key ?? '', label: label ?? '', value: value ?? '' })),
                  notes:
                    'Driver confirmed a replacement seal after the weigh-station inspection outside Grand Junction.',
                  activity: [
                    ['seal', 'Passed weigh station, seal replaced', '14:02'],
                    ['departed', 'Departed Fresno cold dock', '11:18'],
                    ['cooled', 'Trailer pre-cooled to 2°C', '09:50'],
                  ].map(([key, text, time]) => ({ id: key ?? '', text: text ?? '', time: time ?? '' })),
                },
              }
            : {}),
        })),
      }
      break
    }
    case 7:
      reference = {
        kind: 'sources',
        title: 'Connected sources',
        caption: 'Loading connected sources',
        columns: [
          { id: 'source', label: 'Source' },
          { id: 'owner', label: 'Owner' },
          { id: 'status', label: 'Status' },
          { id: 'records', label: 'Records' },
        ],
        states: [
          { id: 'loading', label: 'Loading' },
          { id: 'empty', label: 'Empty' },
          { id: 'error', label: 'Error' },
        ],
        selectedStateId: 'loading',
        skeletonRows: 11,
        labels: {
          states: 'Source state',
          loading: 'Loading sources…',
          emptyTitle: 'No sources connected',
          emptyBody: 'Connect a source to start syncing records.',
          connect: 'Connect source',
          errorTitle: 'Could not load sources',
          errorBody: 'Unable to load connected sources. Try again.',
          retry: 'Retry',
        },
      }
      break
    case 8: {
      const values = [
        [
          'long-beach',
          'Long Beach Import Annex With Extended Customs Queue',
          [97, 98, 95, 92, 89, 84, 70],
          'High',
          'Yard 9',
        ],
        ['chicago', 'Chicago Inbound', [93, 95, 97, 96, 98, 78, 55], 'High', 'Bay 18'],
        ['dallas', 'Dallas Regional Depot', [88, 84, 90, 92, 96, 66, 44], 'Watch', 'Bay 07'],
        ['atlanta', 'Atlanta Fulfillment', [86, 91, 77, 83, 94, 61, 40], 'Watch', 'Bay 14'],
        ['newark', 'Newark Gateway', [79, 82, 85, 88, 91, 60, 38], 'Watch', 'Bay 12'],
        ['seattle', 'Seattle Import Yard', [83, 85, 81, 87, 90, 62, 41], 'Watch', 'Yard 4'],
        ['miami', 'Miami Cross-Border', [76, 78, 80, 82, 85, 55, 36], 'Clear', 'Bay 09'],
        ['reno', 'Reno Crossdock', [72, 70, 69, 74, 81, 58, 35], 'Clear', 'Bay 03'],
        ['denver', 'Denver Cold Storage', [70, 72, 74, 71, 80, 57, 33], 'Clear', 'Bay 02'],
        ['columbus', 'Columbus Returns Hub', [64, 68, 71, 73, 76, 52, 30], 'Clear', 'Bay 21'],
        ['phoenix', 'Phoenix Sortation', [61, 63, 66, 70, 74, 49, 28], 'Clear', 'Bay 05'],
      ] as const
      const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
      const rows = values.map(([id, name, numbers, risk, dock]) =>
        row(id, name, [
          ...numbers.map((value, index): readonly [string, string] => [days[index] ?? 'mon', `${value}%`]),
          ['peak', `${Math.max(...numbers)}%`],
          ['risk', risk],
          ['dock', dock],
        ]),
      )
      reference = {
        ...base(
          'Dock capacity',
          'Weekly dock utilization by site',
          rows,
          columns(
            [
              ['name', 'Site'],
              ['mon', 'Mon'],
              ['tue', 'Tue'],
              ['wed', 'Wed'],
              ['thu', 'Thu'],
              ['fri', 'Fri'],
              ['sat', 'Sat'],
              ['sun', 'Sun'],
              ['peak', 'Peak'],
              ['risk', 'Risk'],
              ['dock', 'Dock'],
            ],
            ['name', 'peak'],
          ),
          'sites',
        ),
        kind: 'capacity',
        subtitle: 'Utilization by site, this week',
        query: '',
        sort: { field: 'peak', direction: 'desc' },
        copy: {
          ...base('', '', [], [], '').copy,
          search: 'Search sites',
          count: (shown, total) => `${shown} of ${total} sites · 3 above 95% peak`,
        },
      }
      break
    }
    default:
      return { rows: [], listStrategy: grown }
  }
  if (mode === 'localized' && reference.kind === 'accounts')
    reference = {
      ...reference,
      title: 'Kundenkonten und gemeinsame Unternehmensbeziehungen',
      labels: {
        export: 'Exportieren',
        columns: 'Sichtbare Spalten',
        filters: 'Kundenplan',
        renews: (date) => `Verlängerung ${date}`,
        noMatches: 'Keine passenden Kundenkonten',
        noMatchesBody: 'Ändern Sie die Suche oder entfernen Sie den Planfilter.',
        clear: 'Filter zurücksetzen',
      },
      copy: {
        empty: 'Keine passenden Kundenkonten',
        search: 'Kundenkonten durchsuchen',
        count: (shown, total) => `${shown} von ${total} Kundenkonten werden angezeigt`,
        sort: (label) => `Nach ${label} sortieren`,
      },
    }
  if (mode === 'overflow' && reference.kind === 'capacity')
    reference = {
      ...reference,
      sort: undefined,
      listStrategy: { kind: 'pane-scroll', expectedMaximum: 80 },
      rows: Array.from({ length: 81 }, (_, index) =>
        row(`site-${index}`, `Distribution site ${index}`, [
          ['mon', `${index % 100}%`],
          ['peak', `${index % 100}%`],
          ['risk', 'Clear'],
          ['dock', `Bay ${index}`],
        ]),
      ),
      total: 81,
      copy: { ...reference.copy, count: (shown, total) => `${shown} of ${total} sites` },
    }
  return { rows: [], listStrategy: grown, reference }
}
export const dataTablePreviewMoney = money
export const dataTablePreviewNotice = 'Preview request recorded; no external action was performed.'
