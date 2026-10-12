import type { LumenAppSidebarFullContent, LumenAppSidebarFullItem } from '@lumen/app-ui/catalog'

const groups: LumenAppSidebarFullContent['groups'] = [
  {
    id: 'favorites', label: 'Favorites', items: [
      { id: 'pipeline-review', label: 'Q3 pipeline review', icon: 'favorite', href: '#nav' },
      { id: 'renewals', label: 'Renewals board', icon: 'favorite', href: '#nav' },
    ],
  },
  {
    id: 'workspace', label: 'Workspace', items: [
      { id: 'overview', label: 'Overview', icon: 'overview', href: '#nav' },
      { id: 'pipelines', label: 'Pipelines', icon: 'pipelines', href: '#nav', badge: '9' },
      { id: 'projects', label: 'Projects', icon: 'projects', href: '#nav' },
      { id: 'documents', label: 'Documents', icon: 'documents', href: '#nav' },
      { id: 'customers', label: 'Customers', icon: 'customers', href: '#nav' },
    ],
  },
  {
    id: 'reporting', label: 'Reporting', items: [
      { id: 'performance', label: 'Performance', icon: 'performance', href: '#nav' },
      { id: 'reports', label: 'Reports', icon: 'reports', href: '#nav' },
      { id: 'security', label: 'Security', icon: 'security', href: '#nav' },
    ],
  },
  {
    id: 'account', label: 'Account', items: [
      { id: 'members', label: 'Members', icon: 'members', href: '#nav' },
      { id: 'billing', label: 'Billing', icon: 'billing', href: '#nav' },
      { id: 'settings', label: 'Settings', icon: 'settings', href: '#nav' },
    ],
  },
]

export function appSidebarFullFixture(mode: string | null = null): LumenAppSidebarFullContent {
  const labels: LumenAppSidebarFullContent['labels'] = {
    brandMark: 'C',
    brand: 'Cascade',
    brandSubtitle: 'Revenue',
    navigation: 'Primary',
    open: 'Open navigation',
    closeOverlay: 'Close navigation overlay',
    close: 'Close navigation',
    dialog: 'Navigation',
    empty: 'No navigation items',
  }
  const localized = mode === 'localized'
  const many = mode === 'boundary' || mode === 'overflow'
  const count = mode === 'boundary' ? 64 : 65
  const items: readonly LumenAppSidebarFullItem[] = Array.from({ length: count }, (_, index) => ({
    id: `destination-${index}`,
    label: `Destination ${index + 1}`,
    icon: 'overview' as const,
    href: '#nav',
  }))
  return {
    labels: localized ? {
      ...labels,
      brand: 'Cascade — ausführliche Erlösübersicht',
      brandSubtitle: 'Alle Arbeitsbereiche und Berichte',
      open: 'Navigation öffnen',
    } : labels,
    groups: mode === 'empty' ? [] : mode === 'one'
      ? [{ id: 'one-group', label: 'One group', items: [{ id: 'one', label: 'One item', icon: 'overview', href: '#nav' }] }]
      : many ? [{ id: 'many', label: 'All destinations', items }] : groups,
    footerLink: { id: 'support', label: 'Help & support', icon: 'support', href: '#help' },
    selectedItemId: mode === null ? 'overview' : null,
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 64 },
    profile: localized
      ? { initials: 'DM', name: 'Dana Mireles', role: 'Verantwortliche für die gesamten Vertriebsabläufe' }
      : { initials: 'DM', name: 'Dana Mireles', role: 'Sales operations' },
  }
}
