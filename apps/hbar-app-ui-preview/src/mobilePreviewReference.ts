import type { LumenMobileContent } from '@lumen/app-ui'

/** Host-only reference content; only the active composition is projected. */
export function createMobilePreviewContent(
  base: LumenMobileContent,
  variant: number,
  localized: boolean,
): LumenMobileContent {
  const copy = (english: string, german: string) => (localized ? german : english)
  switch (variant) {
    case 1:
      return {
        activity: base.activity
          ? {
              ...base.activity,
              labels: {
                ...base.activity.labels,
                navigation: copy('Primary', 'Hauptnavigation'),
                filterArea: copy('Filters', 'Filter'),
              },
              tabs: base.activity.tabs.map((tab, index) => ({
                ...tab,
                icon: (['home', 'search', 'bell', 'bookmark', 'user'] as const)[index],
              })),
              pages: [
                {
                  id: 'search',
                  title: copy('Recent searches', 'Letzte Suchanfragen'),
                  description: copy('Tap a term to run it again', 'Suchbegriff auswählen, um erneut zu suchen'),
                  items: [
                    {
                      id: 'overdue-search',
                      title: 'invoices status:overdue',
                      detail: copy('Saved filter', 'Gespeicherter Filter'),
                    },
                    { id: 'meridian-search', title: 'Meridian', detail: copy('Account', 'Konto') },
                    { id: 'renewal-search', title: 'renewal Q3', detail: copy('12 results', '12 Ergebnisse') },
                    {
                      id: 'owner-search',
                      title: 'owner:me updated:7d',
                      detail: copy('Saved filter', 'Gespeicherter Filter'),
                    },
                    { id: 'cedar-search', title: 'Cedar Labs', detail: copy('Account', 'Konto') },
                    { id: 'seats-search', title: 'seats > 20', detail: copy('31 results', '31 Ergebnisse') },
                    { id: 'payout-search', title: 'payout july', detail: copy('6 results', '6 Ergebnisse') },
                  ],
                },
              ],
            }
          : undefined,
      }
    case 2:
      return {
        tasks: base.tasks
          ? {
              ...base.tasks,
              labels: {
                ...base.tasks.labels,
                add: copy('Open quick actions', 'Schnellaktionen öffnen'),
                searchOpen: copy('Search', 'Aufgaben durchsuchen'),
              },
              searchEnabled: false,
              quickActions: {
                label: copy('Quick actions', 'Schnellaktionen'),
                close: copy('Close quick actions', 'Schnellaktionen schließen'),
                dismiss: copy('Close actions', 'Aktionen schließen'),
                items: [
                  { id: 'new-task', label: copy('New task', 'Neue Aufgabe'), icon: 'plus' },
                  { id: 'voice-note', label: copy('Voice note', 'Sprachnotiz'), icon: 'message' },
                  { id: 'photo', label: copy('Photo', 'Foto'), icon: 'reports' },
                  { id: 'attach-file', label: copy('Attach file', 'Datei anhängen'), icon: 'box' },
                ],
              },
            }
          : undefined,
      }
    case 3:
      return {
        home: base.home
          ? {
              ...base.home,
              search: {
                tabId: 'search',
                label: copy('Search updates', 'Updates durchsuchen'),
                placeholder: copy('Search', 'Suchen'),
                close: copy('Close search', 'Suche schließen'),
                noResults: copy('No matching updates', 'Keine passenden Updates'),
              },
              labels: { ...base.home.labels, navigation: copy('Primary', 'Hauptnavigation') },
              tabs: base.home.tabs.map((tab, index) => ({
                ...tab,
                icon: (['home', 'inbox', 'calendar', 'reports', 'search'] as const)[index],
              })),
            }
          : undefined,
      }
    case 4:
      return {
        orders: base.orders
          ? {
              ...base.orders,
              labels: { ...base.orders.labels, navigation: copy('Primary', 'Hauptnavigation') },
              tabs: base.orders.tabs.map((tab, index) => ({
                ...tab,
                icon: (['home', 'box', 'message', 'more'] as const)[index],
              })),
              more: {
                moreId: 'more',
                label: copy('More destinations', 'Weitere Ziele'),
                close: copy('Close menu', 'Menü schließen'),
                dismiss: copy('Close menu', 'Menü schließen'),
                expand: copy('Expand menu', 'Menü erweitern'),
                expanded: copy('Collapse menu', 'Menü verkleinern'),
                items: [
                  {
                    id: 'shipments',
                    label: copy('Shipments', 'Lieferungen'),
                    detail: copy('6 in transit', '6 unterwegs'),
                    icon: 'box',
                  },
                  {
                    id: 'invoices',
                    label: copy('Invoices', 'Rechnungen'),
                    detail: copy('2 due', '2 fällig'),
                    icon: 'reports',
                  },
                  {
                    id: 'payments',
                    label: copy('Payments', 'Zahlungen'),
                    detail: copy('Up to date', 'Auf dem neuesten Stand'),
                    icon: 'calendar',
                  },
                  { id: 'team', label: copy('Team', 'Team'), detail: copy('9 members', '9 Mitglieder'), icon: 'user' },
                ],
                links: [
                  { id: 'account-settings', label: copy('Account settings', 'Kontoeinstellungen') },
                  { id: 'security', label: copy('Security and access', 'Sicherheit und Zugriff') },
                  { id: 'help', label: copy('Help centre', 'Hilfezentrum') },
                ],
              },
            }
          : undefined,
      }
    case 5:
      return {
        runs: base.runs
          ? {
              ...base.runs,
              navigation: {
                label: copy('Navigation', 'Navigation'),
                title: 'Meridian',
                sectionsLabel: copy('Sections', 'Bereiche'),
                groups: [
                  {
                    id: 'workflows',
                    label: copy('Workflows', 'Arbeitsabläufe'),
                    expanded: true,
                    items: [
                      { id: 'all-workflows', label: copy('All workflows', 'Alle Arbeitsabläufe') },
                      { id: 'templates', label: copy('Templates', 'Vorlagen') },
                      { id: 'scheduled-runs', label: copy('Scheduled runs', 'Geplante Ausführungen') },
                      { id: 'archive', label: copy('Archive', 'Archiv') },
                    ],
                  },
                  { id: 'data', label: copy('Data', 'Daten'), items: [] },
                  { id: 'runs', label: copy('Runs', 'Ausführungen') },
                  { id: 'alerts', label: copy('Alerts', 'Benachrichtigungen') },
                  { id: 'settings', label: copy('Settings', 'Einstellungen'), items: [] },
                ],
                profile: {
                  id: 'profile',
                  label: 'Ana Reyes',
                  detail: 'ana@meridian.example',
                  icon: 'user',
                  avatar: 'AR',
                },
              },
            }
          : undefined,
      }
    default:
      return {}
  }
}
