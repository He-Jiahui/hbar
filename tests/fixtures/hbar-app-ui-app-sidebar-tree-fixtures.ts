import type { LumenAppSidebarTreeContent } from '@lumen/app-ui'

const folders: LumenAppSidebarTreeContent['folders'] = [
  {
    id: 'customer', label: 'Customer operations', documents: [
      { id: 'handoff', label: 'Enterprise handoff checklist' },
      { id: 'escalation', label: 'Escalation runbook' },
      { id: 'severity', label: 'Severity matrix' },
      { id: 'north-america', label: 'North America field escalation protocol and exception notes' },
    ],
  },
  {
    id: 'finance', label: 'Finance close', documents: [
      { id: 'recognition', label: 'Q4 recognition memo' },
      { id: 'accrual', label: 'Vendor accrual schedule' },
      { id: 'revenue', label: 'Deferred revenue policy' },
      { id: 'refund', label: 'Refund reconciliation' },
    ],
  },
  {
    id: 'compliance', label: 'Compliance', documents: [
      { id: 'soc', label: 'SOC evidence index' },
      { id: 'access', label: 'Access review notes' },
    ],
  },
  {
    id: 'templates', label: 'Templates', documents: [
      { id: 'incident', label: 'Incident report' },
      { id: 'postmortem', label: 'Postmortem' },
    ],
  },
]

export function appSidebarTreeFixture(mode: string | null = null): LumenAppSidebarTreeContent {
  const labels: LumenAppSidebarTreeContent['labels'] = {
    title: 'Knowledge base',
    newDocument: 'New document',
    search: 'Search documents',
    searchPlaceholder: 'Search documents',
    navigation: 'Documents',
    actionsFor: 'Actions for',
    actionsSuffix: 'actions',
    rename: 'Rename',
    duplicate: 'Duplicate',
    delete: 'Delete',
    empty: 'No documents',
  }
  const localized = mode === 'localized'
  const contents = mode === 'empty' ? [] : mode === 'one'
    ? [{ id: 'single', label: 'One folder', documents: [{ id: 'one', label: 'One document' }] }]
    : mode === 'boundary' || mode === 'overflow'
      ? [{ id: 'many', label: 'Document library', documents: Array.from(
        { length: mode === 'boundary' ? 64 : 65 },
        (_, index) => ({ id: `document-${index}`, label: `Document ${index + 1}` }),
      ) }]
      : folders
  return {
    labels: localized ? {
      ...labels,
      title: 'Wissensdatenbank und ausführliche Beschreibung',
      search: 'Dokumente durchsuchen',
      searchPlaceholder: 'Dokumente durchsuchen',
      actionsFor: 'Aktionen für',
    } : labels,
    folders: contents,
    selectedDocumentId: mode === null ? 'escalation' : null,
    profile: localized
      ? { initials: 'LM', name: 'Lena Marchetti', role: 'Leitung Wissensmanagement und Dokumente' }
      : { initials: 'LM', name: 'Lena Marchetti', role: 'Knowledge manager' },
  }
}
