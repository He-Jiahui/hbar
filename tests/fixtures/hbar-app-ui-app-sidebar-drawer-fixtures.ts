import type { LumenAppSidebarDrawerContent, LumenAppSidebarDrawerItem } from '@lumen/app-ui/catalog'

const groups: LumenAppSidebarDrawerContent['groups'] = [
  {
    id: 'today', label: 'Today', items: [
      { id: 'home', label: 'Home', icon: 'home', href: '#home' },
      { id: 'inbox', label: 'Inbox', icon: 'inbox', href: '#home', badge: '6' },
      { id: 'schedule', label: 'Schedule', icon: 'schedule', href: '#home' },
      { id: 'tasks', label: 'Tasks', icon: 'tasks', href: '#home', badge: '4' },
    ],
  },
  {
    id: 'workspace', label: 'Workspace', items: [
      { id: 'customers', label: 'Customers', icon: 'customers', href: '#home' },
      { id: 'documents', label: 'Documents', icon: 'documents', href: '#home' },
      { id: 'reports', label: 'Reports', icon: 'reports', href: '#home' },
      { id: 'knowledge', label: 'Knowledge base', icon: 'knowledge', href: '#home' },
      { id: 'team', label: 'Team', icon: 'team', href: '#home' },
    ],
  },
  {
    id: 'account', label: 'Account', items: [
      { id: 'notifications', label: 'Notifications', icon: 'notifications', href: '#home' },
      { id: 'settings', label: 'Settings', icon: 'settings', href: '#home' },
      { id: 'support', label: 'Help & support', icon: 'support', href: '#home' },
    ],
  },
]

export function appSidebarDrawerFixture(mode: string | null = null): LumenAppSidebarDrawerContent {
  const labels: LumenAppSidebarDrawerContent['labels'] = {
    open: 'Open navigation',
    closeOverlay: 'Close navigation overlay',
    close: 'Close navigation',
    dialog: 'Navigation',
    navigation: 'Primary',
    brand: 'Fieldbase',
    brandSubtitle: 'Support team',
    brandMark: 'F',
    empty: 'No navigation items',
  }
  const localized = mode === 'localized'
  const many = mode === 'boundary' || mode === 'overflow'
  const count = mode === 'boundary' ? 64 : 65
  const items: readonly LumenAppSidebarDrawerItem[] = Array.from({ length: count }, (_, index) => ({
    id: `item-${index}`,
    label: `Navigation destination ${index + 1}`,
    icon: 'home' as const,
    href: `#destination-${index}`,
  }))
  return {
    labels: localized ? {
      ...labels,
      brand: 'Fieldbase — ausführliche Team-Navigation',
      brandSubtitle: 'Unterstützung für alle Arbeitsbereiche',
      open: 'Navigation öffnen',
    } : labels,
    groups: mode === 'empty' ? [] : mode === 'one'
      ? [{ id: 'one-group', label: 'One group', items: [{ id: 'one', label: 'One item', icon: 'home', href: '#home' }] }]
      : many ? [{ id: 'many', label: 'All destinations', items }] : groups,
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 64 },
    selectedItemId: mode === null ? 'home' : null,
    profile: localized
      ? { initials: 'PN', name: 'Priya Nair', detail: 'Ansprechpartnerin für das gesamte Team' }
      : { initials: 'PN', name: 'Priya Nair', detail: 'priya@fieldbase.io' },
  }
}
