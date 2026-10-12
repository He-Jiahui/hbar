import type { LumenAppSidebarRailContent, LumenAppSidebarRailGroup, LumenAppSidebarRailItem } from '@lumen/app-ui/catalog'

const groups: readonly LumenAppSidebarRailGroup[] = [
  {
    id: 'primary',
    items: [
      {
        id: 'overview',
        label: 'Overview',
        icon: 'overview',
        options: [
          { id: 'today', label: 'Today' },
          { id: 'week', label: 'This week' },
        ],
      },
      {
        id: 'automation',
        label: 'Automation',
        icon: 'automation',
        options: [
          { id: 'runs', label: 'Agent runs' },
          { id: 'playbooks', label: 'Playbooks' },
          { id: 'schedules', label: 'Schedules' },
        ],
      },
      {
        id: 'services',
        label: 'Services',
        icon: 'services',
        options: [
          { id: 'inventory', label: 'Inventory' },
          { id: 'vendors', label: 'Vendors' },
          { id: 'contracts', label: 'Contracts' },
        ],
      },
      {
        id: 'data',
        label: 'Data',
        icon: 'data',
        options: [
          { id: 'warehouses', label: 'Warehouses' },
          { id: 'exports', label: 'Exports' },
          { id: 'retention', label: 'Retention' },
        ],
      },
      {
        id: 'integrations',
        label: 'Integrations',
        icon: 'integrations',
        options: [
          { id: 'connected-apps', label: 'Connected apps' },
          { id: 'webhooks', label: 'Webhooks' },
          { id: 'api-keys', label: 'API keys' },
        ],
      },
    ],
  },
  {
    id: 'secondary',
    items: [
      {
        id: 'governance',
        label: 'Governance',
        icon: 'governance',
        options: [
          { id: 'access-review', label: 'Access review' },
          { id: 'audit-log', label: 'Audit log' },
          { id: 'policies', label: 'Policies' },
        ],
      },
      {
        id: 'monitoring',
        label: 'Monitoring',
        icon: 'monitoring',
        options: [
          { id: 'incidents', label: 'Incidents' },
          { id: 'alerts', label: 'Alerts' },
          { id: 'uptime', label: 'Uptime' },
        ],
      },
      {
        id: 'releases',
        label: 'Releases',
        icon: 'releases',
        options: [
          { id: 'rollouts', label: 'Rollouts' },
          { id: 'changelog', label: 'Changelog' },
          { id: 'flags', label: 'Flags' },
        ],
      },
      {
        id: 'environments',
        label: 'Environments',
        icon: 'environments',
        options: [
          { id: 'production', label: 'Production' },
          { id: 'staging', label: 'Staging' },
          { id: 'sandbox', label: 'Sandbox' },
        ],
      },
      {
        id: 'credentials',
        label: 'Credentials',
        icon: 'credentials',
        options: [
          { id: 'tokens', label: 'Tokens' },
          { id: 'certificates', label: 'Certificates' },
          { id: 'secrets', label: 'Secrets' },
        ],
      },
    ],
  },
]

export function appSidebarRailFixture(mode: string | null = null): LumenAppSidebarRailContent {
  const localized = mode === 'localized'
  const rows =
    mode === 'empty'
      ? []
      : mode === 'one'
        ? [{ ...groups[0]!, items: groups[0]!.items.slice(0, 1) }]
        : mode === 'boundary' || mode === 'overflow'
          ? [
              {
                ...groups[0]!,
                items: Array.from({ length: mode === 'boundary' ? 64 : 65 }, (_, index): LumenAppSidebarRailItem => ({
                  ...groups[0]!.items[index % groups[0]!.items.length]!,
                  id: `item-${index}`,
                  label: `${groups[0]!.items[index % groups[0]!.items.length]!.label} ${index}`,
                })),
              },
            ]
          : groups
  return {
    labels: localized
      ? {
          brandMark: 'A',
          navigation: 'Primärnavigation',
          support: 'Hilfe',
          account: 'Dein Konto',
          accountMenu: 'Konto',
          empty: 'Keine Navigationseinträge',
        }
      : {
          brandMark: 'A',
          navigation: 'Primary',
          support: 'Support',
          account: 'Your account',
          accountMenu: 'Your account',
          empty: 'No navigation items',
        },
    groups: localized
      ? rows.map((group) => ({
          ...group,
          items: group.items.map((item) => ({ ...item, label: `${item.label} – ausführliche Beschreibung` })),
        }))
      : rows,
    selectedItemId: mode === 'empty' ? null : mode === 'boundary' || mode === 'overflow' ? 'item-1' : 'automation',
    support: [
      { id: 'help', label: localized ? 'Hilfezentrum' : 'Help center' },
      { id: 'contact', label: localized ? 'Support kontaktieren' : 'Contact support' },
      { id: 'status', label: localized ? 'Statusseite' : 'Status page' },
    ],
    account: {
      initials: 'TS',
      name: 'Theo Salcedo',
      detail: 'theo@northwind.co',
      actions: [
        { id: 'settings', label: localized ? 'Kontoeinstellungen' : 'Account settings' },
        { id: 'preferences', label: localized ? 'Einstellungen' : 'Preferences' },
        { id: 'signout', label: localized ? 'Abmelden' : 'Sign out' },
      ],
    },
  }
}
