import type { LumenAppShellContractsContent, LumenShellContractLink, LumenShellContractRecord } from '@lumen/app-ui'

export interface ContractFixtureRecord extends LumenShellContractRecord {
  readonly category: 'active' | 'renewing' | 'review' | 'draft' | 'approval' | 'overdue'
}
export interface ContractsPreviewFixture extends LumenAppShellContractsContent {
  readonly inventory: readonly ContractFixtureRecord[]
  readonly formatCount: (visible: number, total: number) => string
}
const rows: readonly (readonly [string, string, string, string, string, string, ContractFixtureRecord['category']])[] =
  [
    ['Data processing addendum', 'Corvus Health', 'Tomas Lindqvist', '-', '04 Jan 2026', 'Overdue', 'overdue'],
    [
      'Platform subscription and support renewal for the North American field operations team',
      'Halden Manufacturing',
      'Priya Raghunathan',
      '$1,120,000',
      '28 Feb 2026',
      'Needs approval',
      'approval',
    ],
    [
      'Master services agreement',
      'Brightline Logistics Group',
      'Amara Okafor',
      '$248,000',
      '12 Mar 2026',
      'Active',
      'active',
    ],
    ['Reseller agreement', 'Kestrel Digital', 'Amara Okafor', '$86,500', '19 Apr 2026', 'Active', 'active'],
    ['Mutual non-disclosure agreement', 'Verity Partners', '-', '-', '22 May 2026', 'Active', 'active'],
    [
      'Statement of work 14',
      'Halden Manufacturing',
      'Daniel Whitfield',
      '$312,000',
      '30 Jun 2026',
      'In review',
      'review',
    ],
    [
      'Software licence renewal',
      'Northgate Utilities',
      'Priya Raghunathan',
      '$455,000',
      '08 Jul 2026',
      'Renewing',
      'renewing',
    ],
    [
      'Professional services agreement',
      'Larkspur Media',
      'Daniel Whitfield',
      '$128,400',
      '15 Aug 2026',
      'Draft',
      'draft',
    ],
    ['Supply agreement', 'Ironbark Components', 'Tomas Lindqvist', '$674,200', '01 Sep 2026', 'Active', 'active'],
    ['Security addendum', 'Kestrel Digital', 'Amara Okafor', '$24,000', '11 Oct 2026', 'In review', 'review'],
    [
      'Master services agreement',
      'Verity Partners',
      'Priya Raghunathan',
      '$198,000',
      '03 Nov 2026',
      'Active',
      'active',
    ],
    [
      'Hosting and infrastructure agreement',
      'Northgate Utilities',
      'Daniel Whitfield',
      '$530,000',
      '27 Nov 2026',
      'Needs approval',
      'approval',
    ],
    ['Consulting retainer', 'Larkspur Media', 'Tomas Lindqvist', '$96,000', '14 Dec 2026', 'Active', 'active'],
    ['Equipment lease', 'Ironbark Components', 'Amara Okafor', '$41,750', '20 Jan 2027', 'Draft', 'draft'],
  ]
const inventory: readonly ContractFixtureRecord[] = rows.map(
  ([title, counterparty, owner, value, renews, status, category], index) => ({
    id: `agreement-${index}`,
    title,
    counterparty,
    owner,
    value,
    renews,
    status,
    category,
    href: '#contracts',
    tone:
      category === 'overdue'
        ? 'danger'
        : category === 'approval'
          ? 'warning'
          : category === 'renewing'
            ? 'muted'
            : 'neutral',
  }),
)
function link(id: LumenShellContractLink['icon'], label: string, count?: string): LumenShellContractLink {
  return { id, icon: id, label, href: '#contracts', ...(count ? { count } : {}) }
}
export function appShellContractsFixture(
  mode: string | null,
  action: (action: string, value?: string) => void = () => {},
): ContractsPreviewFixture {
  const content: ContractsPreviewFixture = {
    brand: { mark: 'S', name: 'Sundial' },
    labels: {
      navigation: 'Primary',
      navigationDialog: 'Navigation',
      openNavigation: 'Open navigation',
      closeNavigation: 'Close navigation',
      closeOverlay: 'Close navigation overlay',
      collapseSidebar: 'Collapse sidebar',
      expandSidebar: 'Expand sidebar',
      search: 'Search contracts and counterparties',
      openSearch: 'Search contracts',
      closeSearch: 'Close search',
      searchShortcut: '⌘K',
      notifications: 'Notifications',
      workspaceSettings: 'Workspace settings',
      create: 'Create',
      createAccessible: 'Create contract',
      accountMenu: 'Account',
      title: 'Contracts',
      recordsTitle: 'Upcoming renewals',
      recordsCount: '14 agreements',
      recordsCaption: 'Agreements by renewal date',
      filters: 'Filter agreements',
      emptyTitle: 'No agreements match this search',
      emptyDetail: 'Try a contract name or a counterparty, such as Kestrel Digital.',
      clearSearch: 'Clear search',
      emptyNavigation: 'No navigation available',
      emptyMetrics: 'No metrics available',
    },
    sections: [
      {
        id: 'contracts',
        label: 'Contracts',
        links: [
          link('contracts', 'Contracts'),
          link('renewals', 'Renewals', '4'),
          link('templates', 'Templates'),
          link('library', 'Clause library'),
        ],
      },
      {
        id: 'organisation',
        label: 'Organisation',
        links: [
          link('counterparties', 'Counterparties'),
          link('approvals', 'Approvals', '2'),
          link('reports', 'Reports'),
        ],
      },
    ],
    footerLinks: [link('help', 'Help center'), link('news', "What's new")],
    currentLinkId: 'contracts',
    sidebarExpanded: true,
    onSidebarExpandedChange: (value) => action('sidebar', String(value)),
    searchValue: '',
    onSearchChange: (value) => action('search', value),
    onClearSearch: () => action('clear-search'),
    metrics: [
      { id: 'renewing', label: 'Renewing in 90 days', value: '4' },
      { id: 'approval', label: 'Awaiting approval', value: '2' },
      { id: 'value', label: 'Annual contract value', value: '$3.91M' },
    ],
    filters: [
      { id: 'all', label: 'All' },
      { id: 'signed', label: 'Signed' },
      { id: 'attention', label: 'Needs attention' },
    ],
    filterId: 'all',
    onFilterChange: (id) => action('filter', id),
    columns: { contract: 'Contract', owner: 'Owner', value: 'Value', renews: 'Renews', status: 'Status' },
    inventory,
    records: inventory,
    formatCount: (visible, total) => (visible === total ? `${total} agreements` : `${visible} of ${total} agreements`),
    account: {
      initials: 'AO',
      label: 'Amara Okafor, account menu',
      name: 'Amara Okafor',
      email: 'amara.okafor@sundialclm.com',
    },
    accountActions: [
      { id: 'settings', label: 'Account settings', onInvoke: () => action('account-settings') },
      { id: 'notifications', label: 'Notification preferences', onInvoke: () => action('notification-preferences') },
      { id: 'workspace', label: 'Switch workspace', onInvoke: () => action('switch-workspace') },
      { id: 'sign-out', label: 'Sign out', onInvoke: () => action('sign-out') },
    ],
    onNavigate: (id) => action('navigate', id),
    onRecord: (id) => action('record', id),
    onNotifications: () => action('notifications'),
    onWorkspaceSettings: () => action('workspace-settings'),
    onCreate: () => action('create'),
  }
  if (mode === 'empty') return { ...content, inventory: [], records: [], metrics: [], sections: [], footerLinks: [] }
  if (mode === 'overflow') {
    const records = Array.from({ length: 101 }, (_, i) => ({
      ...inventory[0]!,
      id: `agreement-${i}`,
      title: `International contract for distribution and services ${i + 1}`,
    }))
    return {
      ...content,
      inventory: records,
      records,
      sections: [
        {
          id: 'facilities',
          label: 'Facilities',
          links: Array.from({ length: 51 }, (_, i) => ({
            ...link('contracts', `Regional agreement repository ${i + 1}`),
            id: `link-${i}`,
          })),
        },
      ],
    }
  }
  if (mode === 'localized') {
    const records = inventory.map((record) => ({
      ...record,
      title: 'Internationaler Rahmenvertrag für grenzüberschreitende Logistikdienstleistungen',
      counterparty: 'Europäische Gesellschaft für Verkehrsinfrastruktur',
      owner: 'Alexandra Müller-Lüdenscheidt',
      value: '1.120.000 €',
      renews: '28. Feb. 2026',
      status: 'Genehmigung ausstehend',
    }))
    return {
      ...content,
      brand: { mark: 'S', name: 'Sundial' },
      inventory: records,
      records,
      labels: {
        navigation: 'Hauptnavigation',
        navigationDialog: 'Navigation',
        openNavigation: 'Navigation öffnen',
        closeNavigation: 'Navigation schließen',
        closeOverlay: 'Navigationsüberlagerung schließen',
        collapseSidebar: 'Seitenleiste einklappen',
        expandSidebar: 'Seitenleiste ausklappen',
        search: 'Verträge und Geschäftspartner durchsuchen',
        openSearch: 'Verträge suchen',
        closeSearch: 'Suche schließen',
        searchShortcut: '⌘K',
        notifications: 'Benachrichtigungen',
        workspaceSettings: 'Arbeitsbereichseinstellungen',
        create: 'Erstellen',
        createAccessible: 'Vertrag erstellen',
        accountMenu: 'Benutzerkonto',
        title: 'Vertragsverwaltung',
        recordsTitle: 'Bevorstehende Vertragsverlängerungen',
        recordsCount: '14 Vereinbarungen',
        recordsCaption: 'Vereinbarungen nach Verlängerungsdatum',
        filters: 'Vereinbarungen filtern',
        emptyTitle: 'Keine passenden Vereinbarungen gefunden',
        emptyDetail: 'Suchen Sie nach einem Vertrag oder Geschäftspartner.',
        clearSearch: 'Suche zurücksetzen',
        emptyNavigation: 'Keine Navigation verfügbar',
        emptyMetrics: 'Keine Kennzahlen verfügbar',
      },
      formatCount: (visible, total) =>
        visible === total ? `${total} Vereinbarungen` : `${visible} von ${total} Vereinbarungen`,
      columns: {
        contract: 'Vertrag',
        owner: 'Verantwortlich',
        value: 'Vertragswert',
        renews: 'Verlängerung',
        status: 'Bearbeitungsstatus',
      },
      filters: [
        { id: 'all', label: 'Alle' },
        { id: 'signed', label: 'Unterzeichnet' },
        { id: 'attention', label: 'Prüfung erforderlich' },
      ],
      metrics: content.metrics.map((metric) => ({ ...metric, label: 'Grenzüberschreitende Vertragsverlängerungen' })),
      sections: content.sections.map((section) => ({
        ...section,
        label: 'Vertragsorganisation',
        links: section.links.map((item) => ({ ...item, label: 'Internationale Vertragsvereinbarungen' })),
      })),
      footerLinks: content.footerLinks.map((item) => ({ ...item, label: 'Hilfe zur Vertragsverwaltung' })),
      account: { ...content.account, label: 'Amara Okafor, Benutzerkonto' },
      accountActions: content.accountActions.map((item) => ({
        ...item,
        label: 'Benutzerkontoeinstellungen verwalten',
      })),
    }
  }
  return content
}
