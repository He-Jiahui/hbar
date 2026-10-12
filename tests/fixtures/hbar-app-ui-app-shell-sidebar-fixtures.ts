import type { LumenAppShellSidebarContent, LumenShellSidebarRecord } from '@lumen/app-ui/catalog'

const records: readonly (readonly [string, string, string, string, string, string])[] = [
  ['SHP-40912', 'Brightwater Municipal Utilities District', 'Ardent Freightways', 'In transit', 'Aug 11', '$42,180'],
  ['SHP-40908', 'Kettleworth Foods', 'Novara Lines', 'In transit', 'Aug 11', '$8,940'],
  ['SHP-40901', 'Halverson Marine Supply', 'Ardent Freightways', 'Held', 'Aug 13', '$17,620'],
  ['SHP-40897', 'Pinegrove Cabinetry', '—', 'Awaiting pickup', 'Aug 12', '$3,410'],
  ['SHP-40892', 'Corsair Metalworks', 'Trellis Logistics', 'In transit', 'Aug 12', '$26,750'],
  ['SHP-40886', 'Delacroix Paper', 'Novara Lines', 'In transit', 'Aug 13', '$6,205'],
  ['SHP-40881', 'Oakhaven Brewing', 'Trellis Logistics', 'Delivered', 'Aug 8', '$11,340'],
  ['SHP-40877', 'Stellamar Seafood', 'Ardent Freightways', 'In transit', 'Aug 14', '$19,880'],
  ['SHP-40870', 'Vandergrift Tooling', 'Meridian Carriers', 'Awaiting pickup', 'Aug 14', '$4,960'],
  ['SHP-40864', 'Cloudbank Textiles', 'Novara Lines', 'In transit', 'Aug 15', '$9,275'],
  ['SHP-40859', 'Rowanberry Organics', 'Trellis Logistics', 'Delivered', 'Aug 9', '$2,830'],
  ['SHP-40851', 'Ferris Point Aggregates', 'Meridian Carriers', 'In transit', 'Aug 15', '$31,470'],
  ['SHP-40846', 'Windhollow Instruments', 'Ardent Freightways', 'In transit', 'Aug 16', '$7,690'],
  ['SHP-40840', 'Juniper Hollow Distillery', 'Meridian Carriers', 'In transit', 'Aug 16', '$5,120'],
]
export function appShellSidebarFixture(
  mode: string | null,
  report: (action: string, value?: string) => void = () => {},
): LumenAppShellSidebarContent {
  const content: LumenAppShellSidebarContent = {
    brand: { mark: 'O', name: 'Overland', detail: 'Freight operations' },
    labels: {
      primaryNavigation: 'Primary',
      navigationDialog: 'Navigation',
      openNavigation: 'Open navigation',
      closeNavigation: 'Close navigation',
      closeOverlay: 'Close navigation overlay',
      workspaceOptions: 'Workspace options',
      breadcrumb: 'Breadcrumb',
      search: 'Search shipments',
      book: 'Book shipment',
      accountMenu: 'Account',
      recordsTitle: 'Active shipments',
      recordsCount: '14 of 1,284',
      recordsCaption: 'Shipments currently in transit',
      emptyNavigation: 'No navigation available',
      emptyRecords: 'No shipments available',
      emptyMetrics: 'No metrics available',
    },
    sections: [
      {
        id: 'operations',
        label: 'Operations',
        items: [
          { id: 'dispatch', label: 'Dispatch board', href: '#dispatch-board', icon: 'dashboard' },
          {
            id: 'shipments',
            label: 'Shipments',
            icon: 'shipments',
            initiallyExpanded: true,
            children: [
              { id: 'transit', label: 'In transit', href: '#shipments' },
              { id: 'pickup', label: 'Awaiting pickup', href: '#shipments' },
              { id: 'delivered', label: 'Delivered', href: '#shipments' },
              { id: 'cancelled', label: 'Cancelled', href: '#shipments' },
            ],
          },
          { id: 'claims', label: 'Claims', href: '#claims', icon: 'claims', badge: '6' },
          { id: 'carriers', label: 'Carriers', href: '#carriers', icon: 'carriers' },
        ],
      },
      {
        id: 'facilities',
        label: 'Facilities',
        items: [
          { id: 'newark', label: 'Newark distribution centre', href: '#facilities', dot: 'neutral' },
          { id: 'memphis', label: 'Memphis sortation hub', href: '#facilities', dot: 'neutral' },
          {
            id: 'fresno',
            label: 'Fresno cross-dock',
            href: '#facilities',
            dot: 'warning',
            dotLabel: 'Nearing capacity',
          },
          { id: 'laredo', label: 'Laredo border yard', href: '#facilities', dot: 'neutral' },
          { id: 'rotterdam', label: 'Rotterdam gateway', href: '#facilities', dot: 'neutral', muted: true },
        ],
      },
    ],
    currentLinkId: 'transit',
    footerLinks: [
      { id: 'workspace', label: 'Workspace settings', href: '#workspace', icon: 'settings' },
      { id: 'invite', label: 'Invite teammate', href: '#workspace', icon: 'invite' },
      { id: 'documentation', label: 'Documentation', href: '#workspace', icon: 'documentation' },
    ],
    account: { initials: 'DO', name: 'Devon Okafor', detail: 'Dispatch lead' },
    accountActions: [
      { id: 'account', label: 'Account settings', icon: 'settings', onInvoke: () => report('account') },
      {
        id: 'notifications',
        label: 'Notification preferences',
        icon: 'notifications',
        onInvoke: () => report('notifications'),
      },
      { id: 'shortcuts', label: 'Keyboard shortcuts', icon: 'shortcuts', onInvoke: () => report('shortcuts') },
      { id: 'sign-out', label: 'Sign out', icon: 'sign-out', onInvoke: () => report('sign-out') },
    ],
    breadcrumbs: [
      { id: 'operations', label: 'Operations', href: '#operations' },
      { id: 'shipments', label: 'Shipments', href: '#shipments' },
      { id: 'transit', label: 'In transit' },
    ],
    searchValue: '',
    onSearchChange: () => {},
    onNavigate: (id) => report('navigate', id),
    onWorkspaceOptions: () => report('workspace-options'),
    onBook: () => report('book'),
    metrics: [
      { id: 'on-time', label: 'On-time delivery', value: '94.2%', detail: '+1.8 pts vs last week' },
      { id: 'transit', label: 'Shipments in transit', value: '1,284', detail: '+96 vs last week' },
      { id: 'time', label: 'Average transit time', value: '3.4 days', detail: '−0.2 days vs last week' },
      { id: 'claims', label: 'Open claims', value: '6', detail: '+2 vs last week' },
    ],
    columns: {
      reference: 'Reference',
      consignee: 'Consignee',
      carrier: 'Carrier',
      status: 'Status',
      eta: 'ETA',
      value: 'Value',
    },
    records: records.map(([reference, consignee, carrier, status, eta, value]): LumenShellSidebarRecord => ({
      id: reference,
      reference,
      consignee,
      carrier,
      status,
      eta,
      value,
      tone: status === 'Held' ? 'danger' : status === 'In transit' ? 'neutral' : 'muted',
    })),
  }
  if (mode === 'empty')
    return {
      ...content,
      sections: [],
      metrics: [],
      records: [],
      currentLinkId: null,
      labels: { ...content.labels, recordsCount: '0 of 0' },
    }
  if (mode === 'overflow')
    return {
      ...content,
      sections: [
        {
          ...content.sections[1]!,
          items: Array.from({ length: 51 }, (_, i) => ({
            id: `facility-${i}`,
            label: `Distribution centre ${i + 1}`,
            href: '#facilities',
            dot: 'neutral' as const,
          })),
        },
      ],
      records: Array.from({ length: 101 }, (_, i) => ({
        ...content.records[i % 14]!,
        id: `shipment-${i}`,
        reference: `SHP-${i}`,
      })),
      labels: { ...content.labels, recordsCount: '101 of 1,284' },
    }
  if (mode === 'localized')
    return {
      ...content,
      brand: { mark: 'O', name: 'Überland Logistikverwaltung', detail: 'Internationale Frachtabwicklung' },
      labels: {
        primaryNavigation: 'Hauptnavigation',
        navigationDialog: 'Navigation',
        openNavigation: 'Navigation öffnen',
        closeNavigation: 'Navigation schließen',
        closeOverlay: 'Navigationsüberlagerung schließen',
        workspaceOptions: 'Arbeitsbereichsoptionen',
        breadcrumb: 'Navigationspfad',
        search: 'Sendungen durchsuchen',
        book: 'Sendung buchen',
        accountMenu: 'Benutzerkonto',
        recordsTitle: 'Aktive internationale Sendungen',
        recordsCount: '14 von 1.284',
        recordsCaption: 'Sendungen derzeit unterwegs',
        emptyNavigation: 'Keine Navigation verfügbar',
        emptyRecords: 'Keine Sendungen verfügbar',
        emptyMetrics: 'Keine Kennzahlen verfügbar',
      },
      sections: content.sections.map((section) => ({
        ...section,
        label: section.id === 'operations' ? 'Betriebsabläufe' : 'Distributionsstandorte',
        items: section.items.map((item) =>
          'children' in item
            ? {
                ...item,
                label: 'Sendungsverwaltung',
                children: item.children.map((child, i) => ({
                  ...child,
                  label: ['Unterwegs', 'Abholung ausstehend', 'Zugestellt', 'Storniert'][i]!,
                })),
              }
            : { ...item, label: `Internationales Verteilzentrum ${item.id}` },
        ),
      })),
      footerLinks: content.footerLinks.map((item, i) => ({
        ...item,
        label: ['Arbeitsbereichseinstellungen', 'Teammitglied einladen', 'Dokumentation'][i]!,
      })),
      account: { initials: 'DO', name: 'Devon Okafor', detail: 'Leitung der internationalen Disposition' },
      accountActions: content.accountActions.map((item, i) => ({
        ...item,
        label: ['Kontoeinstellungen', 'Benachrichtigungseinstellungen', 'Tastenkombinationen', 'Abmelden'][i]!,
      })),
      breadcrumbs: content.breadcrumbs.map((item, i) => ({
        ...item,
        label: ['Betriebsabläufe', 'Sendungen', 'Unterwegs'][i]!,
      })),
      metrics: content.metrics.map((metric, i) => ({
        ...metric,
        label: [
          'Pünktliche Lieferung',
          'Sendungen unterwegs',
          'Durchschnittliche Transportdauer',
          'Offene Schadensmeldungen',
        ][i]!,
        detail: 'Veränderung gegenüber der Vorwoche',
      })),
      columns: {
        reference: 'Referenz',
        consignee: 'Empfänger',
        carrier: 'Spedition',
        status: 'Status',
        eta: 'Ankunft',
        value: 'Wert',
      },
      records: content.records.map((record) => ({
        ...record,
        status:
          record.status === 'Held' ? 'Zurückgehalten' : record.status === 'Delivered' ? 'Zugestellt' : 'Unterwegs',
      })),
    }
  return content
}
