import type { LumenAppSidebarDualContent, LumenAppSidebarDualGroup, LumenAppSidebarDualIcon, LumenAppSidebarDualItem, LumenAppSidebarDualSection } from '@lumen/app-ui/catalog'

const section = (
  id: string,
  label: string,
  icon: LumenAppSidebarDualIcon,
  newAction: string,
  groups: readonly (readonly [string, ...string[]])[],
): LumenAppSidebarDualSection => {
  const rows: readonly LumenAppSidebarDualGroup[] = groups.map(([heading, ...names], groupIndex) => ({
    id: `${id}-group-${groupIndex}`,
    label: heading,
    items: names.map((name, index) => ({ id: `${id}-page-${groupIndex}-${index}`, label: name })),
  }))
  return {
    id,
    label,
    icon,
    newAction,
    search: `Search ${label}`,
    searchPlaceholder: `Search ${label.toLowerCase()}`,
    navigation: `${label} pages`,
    groups: rows,
    activePageId: rows[0]?.items[0]?.id ?? null,
  }
}

const sections: readonly LumenAppSidebarDualSection[] = [
  section('automations', 'Automations', 'automation', 'New automation', [
    ['Build', 'Agent runs', 'Playbooks', 'Schedules', 'Triggers'],
    ['Review', 'Approvals', 'Run history', 'Failures'],
    ['Configure', 'Variables', 'Webhooks', 'Retries'],
  ]),
  section('projects', 'Projects', 'projects', 'New project', [
    ['Boards', 'Active', 'Backlog', 'Archived', 'Templates'],
    ['Planning', 'Roadmap', 'Milestones', 'Releases'],
    ['Delivery', 'Handoffs', 'Retros', 'Reports'],
  ]),
  section('people', 'People', 'people', 'New people', [
    ['Directory', 'Members', 'Teams', 'Guests', 'Invitations'],
    ['Access', 'Roles', 'Permissions', 'Groups'],
    ['Records', 'Onboarding', 'Time off', 'Reviews'],
  ]),
  section('insights', 'Insights', 'insights', 'New insight', [
    ['Usage', 'Seats', 'Sessions', 'Adoption', 'Exports'],
    ['Performance', 'Latency', 'Throughput', 'Errors'],
    ['Finance', 'Costs', 'Forecasts', 'Invoices'],
  ]),
  section('documents', 'Documents', 'documents', 'New document', [
    ['Library', 'All files', 'Shared', 'Recent', 'Starred'],
    ['Templates', 'Contracts', 'Briefs', 'Policies'],
    ['Lifecycle', 'Drafts', 'In review', 'Archived'],
  ]),
  section('integrations', 'Integrations', 'integrations', 'New integration', [
    ['Connections', 'Connected apps', 'Data sources', 'Sinks', 'Registry'],
    ['Developer', 'API keys', 'Webhooks', 'Events'],
    ['Health', 'Sync status', 'Quotas', 'Logs'],
  ]),
  section('security', 'Security', 'security', 'New security', [
    ['Identity', 'Sign-in', 'Devices', 'Sessions', 'Domains'],
    ['Policies', 'Retention', 'Sharing', 'Encryption'],
    ['Audit', 'Access review', 'Audit log', 'Alerts'],
  ]),
]

export function appSidebarDualFixture(
  mode: string | null = null,
  selectedSectionId = 'automations',
): LumenAppSidebarDualContent {
  const localized = mode === 'localized'
  const first = sections[0]!
  const selectedSections =
    mode === 'empty'
      ? []
      : mode === 'one'
        ? [{ ...first, groups: [{ ...first.groups[0]!, items: first.groups[0]!.items.slice(0, 1) }] }]
        : mode === 'boundary' || mode === 'overflow'
          ? [
              {
                ...first,
                groups: [
                  {
                    ...first.groups[0]!,
                    items: Array.from(
                      { length: mode === 'boundary' ? 64 : 65 },
                      (_, index): LumenAppSidebarDualItem => ({ id: `row-${index}`, label: `Agent run ${index}` }),
                    ),
                  },
                ],
                activePageId: 'row-0',
              },
            ]
          : sections
  return {
    labels: localized
      ? {
          mark: 'O',
          sections: 'Bereiche',
          settings: 'Arbeitsbereich-Einstellungen',
          emptySections: 'Keine Bereiche',
          emptyPages: 'Keine Seiten',
        }
      : {
          mark: 'O',
          sections: 'Sections',
          settings: 'Workspace settings',
          emptySections: 'No sections',
          emptyPages: 'No pages',
        },
    sections: localized
      ? selectedSections.map((value) => ({
          ...value,
          label: `${value.label} – ausführliche Beschreibung`,
          newAction: 'Neuen Eintrag erstellen',
          search: 'Bereich durchsuchen',
          searchPlaceholder: 'Automationen durchsuchen',
          navigation: 'Bereichsseiten',
          groups: value.groups.map((group) => ({
            ...group,
            label: `${group.label} – ausführliche Beschreibung`,
            items: group.items.map((item) => ({ ...item, label: `${item.label} – ausführliche Beschreibung` })),
          })),
        }))
      : selectedSections,
    selectedSectionId,
    profile: { initials: 'RC', name: 'Ruben Cole', role: localized ? 'Leitung für Automationen' : 'Automation lead' },
  }
}
