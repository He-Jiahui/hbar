import type {
  LumenAppSidebarWorkspaceContent,
  LumenAppSidebarWorkspaceGroup,
  LumenAppSidebarWorkspaceItem,
} from '@lumen/app-ui'

const groups: readonly LumenAppSidebarWorkspaceGroup[] = [
  {
    id: 'pinned',
    label: 'Pinned',
    items: [
      { id: 'runbook', label: 'Escalation runbook', icon: 'file', href: '#boards' },
      { id: 'compliance', label: 'Quarter-end compliance review', icon: 'folder', href: '#boards' },
      { id: 'renewal', label: 'Vendor renewal tracker', icon: 'archive', href: '#boards' },
    ],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { id: 'boards', label: 'Boards', icon: 'grid', href: '#boards' },
      { id: 'inbox', label: 'Inbox', icon: 'inbox', badge: '7', href: '#boards' },
      { id: 'projects', label: 'Projects', icon: 'folder', href: '#boards' },
      { id: 'people', label: 'People', icon: 'users', href: '#boards' },
      { id: 'documents', label: 'Documents', icon: 'file', href: '#boards' },
    ],
  },
  {
    id: 'administration',
    label: 'Administration',
    items: [
      { id: 'automations', label: 'Automations', icon: 'workflow', href: '#boards' },
      { id: 'integrations', label: 'Integrations', icon: 'blocks', badge: '3', href: '#boards' },
      { id: 'settings', label: 'Settings', icon: 'settings', href: '#boards' },
    ],
  },
]

export function appSidebarWorkspaceFixture(
  mode: string | null = null,
  selectedWorkspaceId = 'northwind',
): LumenAppSidebarWorkspaceContent {
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
                items: Array.from(
                  { length: mode === 'boundary' ? 64 : 65 },
                  (_, index): LumenAppSidebarWorkspaceItem => ({
                    ...groups[0]!.items[index % groups[0]!.items.length]!,
                    id: `row-${index}`,
                    label: `${groups[0]!.items[index % groups[0]!.items.length]!.label} ${index}`,
                  }),
                ),
              },
            ]
          : groups
  return {
    labels: localized
      ? {
          navigation: 'Primärnavigation',
          search: 'Diesen Arbeitsbereich durchsuchen',
          searchPlaceholder: (workspace) => `${workspace.searchName} durchsuchen`,
          switchWorkspace: 'Arbeitsbereich wechseln',
          createWorkspace: 'Arbeitsbereich erstellen',
          noWorkspaces: 'Keine Arbeitsbereiche',
          empty: 'Keine Navigationseinträge',
        }
      : {
          navigation: 'Primary',
          search: 'Search this workspace',
          searchPlaceholder: (workspace) => `Search ${workspace.searchName}`,
          switchWorkspace: 'Switch workspace',
          createWorkspace: 'Create workspace',
          noWorkspaces: 'No workspaces',
          empty: 'No navigation items',
        },
    workspaces:
      mode === 'empty'
        ? []
        : [
            {
              id: 'northwind',
              initials: 'N',
              name: 'Northwind Logistics',
              tier: 'Enterprise',
              searchName: 'Northwind',
            },
            { id: 'atlas', initials: 'A', name: 'Atlas Service Desk', tier: 'Team', searchName: 'Atlas' },
            { id: 'harbor', initials: 'H', name: 'Harbor Finance', tier: 'Business', searchName: 'Harbor' },
          ],
    selectedWorkspaceId,
    groups: localized
      ? rows.map((group) => ({
          ...group,
          label: `${group.label} – ausführliche Beschreibung`,
          items: group.items.map((item) => ({ ...item, label: `${item.label} – ausführliche Beschreibung` })),
        }))
      : rows,
    activeItemId: mode === 'empty' ? null : mode === 'boundary' || mode === 'overflow' ? 'row-0' : 'boards',
    profile: { initials: 'DM', name: 'Dana Mireles', role: localized ? 'Administratorin' : 'Admin' },
  }
}
