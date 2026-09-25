import type {
  LumenAppSidebarPrimaryContent,
  LumenAppSidebarPrimaryGroup,
  LumenAppSidebarPrimaryItem,
} from '@lumen/app-ui'

const rows: readonly LumenAppSidebarPrimaryGroup[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { id: 'command', label: 'Command center', icon: 'grid', badge: '8', href: '#command-center' },
      { id: 'inbox', label: 'Inbox', icon: 'inbox', badge: '12', href: '#command-center' },
      { id: 'approvals', label: 'Approvals', icon: 'approval', badge: '5', href: '#command-center' },
      { id: 'automations', label: 'Automations', icon: 'automation', href: '#command-center' },
      { id: 'projects', label: 'Projects', icon: 'projects', href: '#command-center' },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [
      { id: 'performance', label: 'Performance', icon: 'performance', href: '#command-center' },
      { id: 'usage', label: 'Usage', icon: 'usage', href: '#command-center' },
      { id: 'activity', label: 'Activity log', icon: 'activity', href: '#command-center' },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    items: [
      { id: 'members', label: 'Members', icon: 'members', href: '#command-center' },
      { id: 'billing', label: 'Billing', icon: 'billing', href: '#command-center' },
      { id: 'settings', label: 'Settings', icon: 'settings', href: '#command-center' },
    ],
  },
]

export function appSidebarPrimaryFixture(mode: string | null = null): LumenAppSidebarPrimaryContent {
  const localized = mode === 'localized'
  const base =
    mode === 'empty'
      ? []
      : mode === 'one'
        ? [{ ...rows[0]!, items: rows[0]!.items.slice(0, 1) }]
        : mode === 'boundary' || mode === 'overflow'
          ? [
              {
                ...rows[0]!,
                items: Array.from(
                  { length: mode === 'boundary' ? 64 : 65 },
                  (_, index): LumenAppSidebarPrimaryItem => ({
                    ...rows[0]!.items[index % rows[0]!.items.length]!,
                    id: `row-${index}`,
                    label: `${rows[0]!.items[index % rows[0]!.items.length]!.label} ${index}`,
                  }),
                ),
              },
            ]
          : rows
  return {
    labels: localized
      ? {
          brandMark: 'M',
          brand: 'Meridian',
          brandDetail: 'Betrieb',
          navigation: 'Primärnavigation',
          openNavigation: 'Navigation öffnen',
          closeNavigation: 'Navigation schließen',
          closeOverlay: 'Navigationsüberlagerung schließen',
          dialog: 'Navigation',
          collapse: 'Seitenleiste einklappen',
          expand: 'Seitenleiste ausklappen',
          accountMenu: 'Konto',
          empty: 'Keine Navigationspunkte vorhanden',
        }
      : {
          brandMark: 'M',
          brand: 'Meridian',
          brandDetail: 'Operations',
          navigation: 'Primary',
          openNavigation: 'Open navigation',
          closeNavigation: 'Close navigation',
          closeOverlay: 'Close navigation overlay',
          dialog: 'Navigation',
          collapse: 'Collapse sidebar',
          expand: 'Expand sidebar',
          accountMenu: 'Account',
          empty: 'No navigation items',
        },
    groups: localized
      ? [
          {
            ...base[0]!,
            label: 'Arbeitsbereich',
            items:
              base[0]?.items.map((item) => ({ ...item, label: `${item.label} – ausführliche Beschreibung` })) ?? [],
          },
        ]
      : base,
    activeItemId: mode === 'empty' ? null : mode === 'boundary' || mode === 'overflow' ? 'row-0' : 'command',
    profile: localized
      ? {
          initials: 'IR',
          name: 'Iris Renner',
          detail: 'Leitung für den Betrieb',
        }
      : {
          initials: 'IR',
          name: 'Iris Renner',
          detail: 'Operations lead',
        },
    accountActions: [
      { id: 'settings', label: localized ? 'Kontoeinstellungen' : 'Account settings', icon: 'settings' },
      { id: 'notifications', label: localized ? 'Benachrichtigungen' : 'Notifications', icon: 'notifications' },
      { id: 'help', label: localized ? 'Hilfezentrum' : 'Help center', icon: 'help' },
      { id: 'signout', label: localized ? 'Abmelden' : 'Sign out', icon: 'signout' },
    ],
  }
}
