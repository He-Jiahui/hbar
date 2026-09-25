import type { LumenAppShellRailContent, LumenShellRailArea, LumenShellRailRecord } from '@lumen/app-ui'

const companies = [
  'Halvorsen Cold Chain Logistics AB',
  'Brightwater Foods',
  'Ardent Medical Supply',
  'Corriveau Frères Distribution',
  'Pinewood Building Products',
  'Northgate Appliance',
  'Lakeshore Beverage Co.',
  'Sable & Finch Furnishings',
  'Tamarack Paper Mills',
  'Ridgeline Auto Parts',
  'Meridian Home Goods',
]
type Row = readonly [string, string, string, string]
function records(area: string, rows: readonly Row[]): LumenShellRailRecord[] {
  return rows.map(([title, detail, value, status], index) => ({
    id: `${area}-${index}`,
    title,
    detail,
    value,
    valueMuted: value === '-',
    status,
    tone: [
      'Delayed',
      'Customs hold',
      'Needs a driver',
      'Running late',
      'Inspection due',
      'In shop',
      'At risk',
      'Overdue',
    ].includes(status)
      ? 'warning'
      : ['Failed delivery', 'Refused', 'Out of service', 'Past due', 'Disputed'].includes(status)
        ? 'danger'
        : 'neutral',
  }))
}
function sections(
  id: string,
  title: string,
  primary: readonly string[],
  saved: readonly string[],
  reference: readonly string[],
): LumenShellRailArea['sections'] {
  return [primary, saved, reference].map((items, group) => ({
    id: `${id}-${group}`,
    label: [title, 'Saved views', 'Reference'][group]!,
    links: items.map((entry, i) => {
      const [label, count] = entry.split('|')
      return { id: `${id}-${group}-${i}`, label: label!, href: `#${id}`, ...(count ? { count } : {}) }
    }),
  }))
}
const shipmentRows: readonly Row[] = [
  [companies[0]!, 'KF-40218 · Newark → Montréal', '14 Mar', 'In transit'],
  [companies[1]!, 'KF-40211 · Savannah → Atlanta', '13 Mar', 'Delivered'],
  [companies[2]!, 'KF-40207 · Houston → El Paso', '14 Mar', 'Delayed'],
  [companies[3]!, 'KF-40233 · Detroit → Windsor', '15 Mar', 'Customs hold'],
  [companies[4]!, 'KF-40199 · Portland → Boise', '12 Mar', 'Delivered'],
  [companies[5]!, 'KF-40241 · Chicago → Omaha', '-', 'Awaiting pickup'],
  [companies[6]!, 'KF-40188 · Milwaukee → Fargo', '16 Mar', 'In transit'],
  [companies[7]!, 'KF-40250 · Charlotte → Richmond', '15 Mar', 'Failed delivery'],
  [companies[8]!, 'KF-40176 · Duluth → Sioux Falls', '13 Mar', 'Delivered'],
  [companies[9]!, 'KF-40262 · Reno → Sacramento', '16 Mar', 'In transit'],
  [companies[10]!, 'KF-40255 · Tampa → Mobile', '17 Mar', 'Awaiting pickup'],
]
const dispatchRows: readonly Row[] = [
  ['Newark → Montréal', 'DX-8841 · Reefer · Ivo Petrenko', '14 Mar', 'Assigned'],
  ['Houston → El Paso', 'DX-8846 · Dry van · no driver yet', '14 Mar', 'Needs a driver'],
  ['Savannah → Atlanta', 'DX-8829 · Dry van · Rosalind Achebe-Whitfield', '13 Mar', 'Assigned'],
  ['Portland → Boise', 'DX-8852 · Flatbed · Marcus Oyelaran', '15 Mar', 'Tendered'],
  ['Chicago → Omaha', 'DX-8858 · Dry van · no driver yet', '-', 'Needs a driver'],
  ['Detroit → Windsor', 'DX-8837 · Reefer · Anneke Vos', '15 Mar', 'Running late'],
  ['Milwaukee → Fargo', 'DX-8863 · Dry van · Dario Esposito', '16 Mar', 'Assigned'],
  ['Charlotte → Richmond', 'DX-8871 · Flatbed · Priya Raghunathan', '15 Mar', 'Refused'],
  ['Duluth → Sioux Falls', 'DX-8818 · Dry van · Colm Brennan', '13 Mar', 'Assigned'],
  ['Reno → Sacramento', 'DX-8880 · Reefer · Yolanda Cruz', '16 Mar', 'Tendered'],
  ['Tampa → Mobile', 'DX-8884 · Dry van · Henrik Lund', '17 Mar', 'Assigned'],
]
const fleetRows: readonly Row[] = [
  ['Unit 2141', 'Freightliner Cascadia · Ivo Petrenko', '22 Mar', 'In service'],
  ['Unit 2158', 'Kenworth T680 · Rosalind Achebe-Whitfield', '04 Apr', 'In service'],
  ['Unit 1907', 'Volvo VNL 760 · Marcus Oyelaran', '18 Mar', 'Inspection due'],
  ['Trailer R-4412', 'Utility 3000R reefer · pool unit', '27 Mar', 'Idle'],
  ['Unit 2203', 'Peterbilt 579 · Anneke Vos', '-', 'In shop'],
  ['Trailer D-8820', 'Wabash DuraPlate dry van · pool unit', '09 Apr', 'In service'],
  ['Unit 1864', 'International LT · Colm Brennan', '16 Mar', 'Out of service'],
  ['Unit 2177', 'Mack Anthem · Dario Esposito', '31 Mar', 'In service'],
  ['Trailer F-2290', 'Fontaine Infinity flatbed · pool unit', '12 Apr', 'Idle'],
  ['Unit 2195', 'Freightliner Cascadia · Priya Raghunathan', '25 Mar', 'In service'],
  ['Unit 2088', 'Kenworth T680 · Yolanda Cruz', '07 Apr', 'In service'],
]
const customerDetails: readonly (readonly [string, string, string])[] = [
  ['Nordics · Iris Renner', '18 open', 'Active'],
  ['Southeast · Theo Amankwah', '24 open', 'Active'],
  ['Gulf Coast · Iris Renner', '6 open', 'At risk'],
  ['Great Lakes · Marguerite Vaillancourt', '11 open', 'Active'],
  ['Pacific Northwest · Theo Amankwah', '9 open', 'Active'],
  ['Midwest · owner not set', '-', 'Onboarding'],
  ['Upper Midwest · Marguerite Vaillancourt', '14 open', 'Active'],
  ['Mid-Atlantic · Iris Renner', '3 open', 'Past due'],
  ['Northern Plains · Theo Amankwah', '7 open', 'Active'],
  ['Mountain West · Marguerite Vaillancourt', '12 open', 'Active'],
  ['Southeast · Iris Renner', '2 open', 'At risk'],
]
const billingDetails: readonly (readonly [string, string, string])[] = [
  ['INV-20418 · issued 02 Mar', '$18,240.00', 'Sent'],
  ['INV-20421 · issued 03 Mar', '$7,905.50', 'Paid'],
  ['INV-20388 · issued 12 Jan', '$12,480.00', 'Overdue'],
  ['INV-20430 · issued 05 Mar', '$4,116.25', 'Sent'],
  ['INV-20399 · issued 21 Feb', '$9,760.00', 'Paid'],
  ['INV-20444 · not issued yet', '-', 'Draft'],
  ['INV-20407 · issued 26 Feb', '$21,318.75', 'Sent'],
  ['INV-20362 · issued 04 Jan', '$6,540.00', 'Disputed'],
  ['INV-20375 · issued 18 Jan', '$3,289.40', 'Overdue'],
  ['INV-20436 · issued 06 Mar', '$15,072.00', 'Sent'],
  ['INV-20441 · issued 07 Mar', '$2,845.10', 'Sent'],
]
const areas: readonly LumenShellRailArea[] = [
  {
    id: 'shipments',
    label: 'Shipments',
    icon: 'shipments',
    title: 'Shipments',
    primaryAction: 'New shipment',
    recordsTitle: 'All shipments',
    recordsCount: '312',
    currentLinkId: 'shipments-0-0',
    sections: sections(
      'shipments',
      'Shipments',
      ['All shipments|312', 'In transit|48', 'Awaiting pickup|12', 'Delayed|5', 'Delivered', 'Cancelled'],
      ['Northeast lane', 'Reefer loads', 'High-value cargo', 'Missing paperwork', 'Customs hold', 'Weekend departures'],
      ['Service map', 'Rate table', 'Documents', 'Exception log', 'Carrier directory', 'Archive'],
    ),
    records: records('shipments', shipmentRows),
  },
  {
    id: 'dispatch',
    label: 'Dispatch',
    icon: 'dispatch',
    title: 'Load board',
    primaryAction: 'Assign driver',
    recordsTitle: 'Open loads',
    recordsCount: '61',
    currentLinkId: 'dispatch-0-0',
    sections: sections(
      'dispatch',
      'Dispatch',
      ['Load board|61', 'Assigned|26', 'Needs a driver|9', 'Check-ins', 'Route changes|4', 'Detention'],
      [
        'Same-day pickups',
        'Owner-operators',
        'Hazmat certified',
        'Backhaul candidates',
        'Weekend coverage',
        'Night shift',
      ],
      ['Driver roster', 'Terminal hours', 'Fuel stops', 'Escalation policy', 'Shift log', 'Archive'],
    ),
    records: records('dispatch', dispatchRows),
  },
  {
    id: 'fleet',
    label: 'Fleet',
    icon: 'fleet',
    title: 'Fleet',
    primaryAction: 'Add unit',
    recordsTitle: 'All units',
    recordsCount: '184',
    currentLinkId: 'fleet-0-0',
    sections: sections(
      'fleet',
      'Fleet',
      ['All units|184', 'In service|151', 'In shop|7', 'Idle|22', 'Out of service|4', 'Retired'],
      ['Reefer trailers', 'Due for inspection', 'High idle time', 'Out of region', 'Leased units', 'Fuel outliers'],
      ['Maintenance plans', 'Parts inventory', 'Warranty claims', 'Fuel cards', 'Compliance log', 'Archive'],
    ),
    records: records('fleet', fleetRows),
  },
  {
    id: 'customers',
    label: 'Customers',
    icon: 'customers',
    title: 'Customers',
    primaryAction: 'Add customer',
    recordsTitle: 'All accounts',
    recordsCount: '96',
    currentLinkId: 'customers-0-0',
    sections: sections(
      'customers',
      'Customers',
      ['All accounts|96', 'Active|78', 'Onboarding|4', 'At risk|3', 'Past due|5', 'Closed'],
      [
        'Enterprise accounts',
        'Contract renewals',
        'Volume commitments',
        'Missing tax ID',
        'Referral sources',
        'Dormant 90 days',
      ],
      ['Contacts', 'Contracts', 'Service levels', 'Credit limits', 'Account notes', 'Archive'],
    ),
    records: records(
      'customers',
      customerDetails.map((row, i) => [companies[i]!, ...row]),
    ),
  },
  {
    id: 'billing',
    label: 'Billing',
    icon: 'billing',
    title: 'Billing',
    primaryAction: 'Create invoice',
    recordsTitle: 'Open invoices',
    recordsCount: '119',
    currentLinkId: 'billing-0-0',
    sections: sections(
      'billing',
      'Billing',
      ['All invoices|438', 'Draft|12', 'Sent|96', 'Overdue|11', 'Paid', 'Credit notes'],
      [
        'Over 60 days',
        'Disputed charges',
        'Accessorial review',
        'Auto-pay accounts',
        'Unbilled loads',
        'Fuel surcharges',
      ],
      ['Rate agreements', 'Tax profiles', 'Payment methods', 'Remittance advice', 'Export history', 'Archive'],
    ),
    records: records(
      'billing',
      billingDetails.map((row, i) => [companies[i]!, ...row]),
    ),
  },
]
export function appShellRailFixture(
  mode: string | null,
  action: (actionId: string, value?: string) => void = () => {},
): LumenAppShellRailContent {
  const content: LumenAppShellRailContent = {
    labels: {
      areas: 'Areas',
      navigationDialog: 'Navigation',
      openNavigation: 'Open navigation',
      closeNavigation: 'Close navigation',
      closeOverlay: 'Close navigation overlay',
      switchWorkspace: 'Switch workspace',
      addWorkspace: 'Add workspace',
      emptyAreas: 'No product areas available',
      emptyNavigation: 'No navigation available',
      emptyRecords: 'No records available',
      emptyWorkspaces: 'No workspace selected',
    },
    account: { initials: 'MK', label: 'Marta Kowalczyk, dispatch manager' },
    areas,
    selectedAreaId: 'shipments',
    selectedWorkspaceId: 'kestrel',
    workspaces: [
      { id: 'kestrel', mark: 'K', name: 'Kestrel Freight', detail: '24 members' },
      { id: 'europe', mark: 'K', name: 'Kestrel Freight Europe', detail: '9 members' },
      { id: 'pinnacle', mark: 'P', name: 'Pinnacle 3PL Partners', detail: '6 members' },
    ],
    onSelectArea: (id) => action('area', id),
    onSelectWorkspace: (id) => action('workspace', id),
    onAddWorkspace: () => action('add-workspace'),
    onAccount: () => action('account'),
    onNavigate: (area, link) => action('navigate', `${area}:${link}`),
    onPrimaryAction: (area) => action('primary', area),
    onRecord: (area, record) => action('record', `${area}:${record}`),
  }
  if (mode === 'empty')
    return { ...content, workspaces: [], areas: [], selectedAreaId: null, selectedWorkspaceId: null }
  if (mode === 'empty-records')
    return { ...content, areas: areas.map((area) => ({ ...area, sections: [], records: [] })) }
  if (mode === 'overflow')
    return {
      ...content,
      areas: areas.map((area) => ({
        ...area,
        sections: [
          {
            id: 'facilities',
            label: 'Facilities',
            links: Array.from({ length: 51 }, (_, i) => ({
              id: `facility-${i}`,
              label: `Regional distribution facility ${i + 1}`,
              href: '#facilities',
            })),
          },
        ],
        records: Array.from({ length: 101 }, (_, i) => ({
          ...area.records[0]!,
          id: `record-${i}`,
          title: `Extended international distribution account ${i + 1}`,
        })),
      })),
    }
  if (mode === 'localized')
    return {
      ...content,
      labels: {
        areas: 'Produktbereiche',
        navigationDialog: 'Navigation',
        openNavigation: 'Navigation öffnen',
        closeNavigation: 'Navigation schließen',
        closeOverlay: 'Navigationsüberlagerung schließen',
        switchWorkspace: 'Arbeitsbereich wechseln',
        addWorkspace: 'Arbeitsbereich hinzufügen',
        emptyAreas: 'Keine Produktbereiche verfügbar',
        emptyNavigation: 'Keine Navigation verfügbar',
        emptyRecords: 'Keine Datensätze verfügbar',
        emptyWorkspaces: 'Kein Arbeitsbereich ausgewählt',
      },
      account: { initials: 'MK', label: 'Marta Kowalczyk, Leiterin der Disposition' },
      workspaces: content.workspaces.map((item) => ({
        ...item,
        name: 'Internationale Frachtabwicklung und Disposition',
        detail: '24 aktive Teammitglieder',
      })),
      areas: areas.map((area) => ({
        ...area,
        label: 'Internationale Sendungsverwaltung',
        title: 'Grenzüberschreitende Transportverwaltung',
        primaryAction: 'Neue Sendung',
        recordsTitle: 'Alle internationalen Sendungen',
        recordsCount: '312',
        sections: area.sections.map((section) => ({
          ...section,
          label: 'Gespeicherte Ansichten',
          links: section.links.map((link) => ({ ...link, label: 'Grenzüberschreitende Sammelladungen' })),
        })),
        records: area.records.map((record) => ({
          ...record,
          title: 'Internationale Kühlkettenlogistik und Gefahrguttransporte',
          detail: 'Transportdokumentation und Zollabfertigung',
          value: '14. März',
          status: 'In Bearbeitung',
        })),
      })),
    }
  return content
}
