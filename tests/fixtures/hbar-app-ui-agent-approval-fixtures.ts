import type { HbarAppUiAgentApprovalContent } from '../../packages/hbar-app-ui/src/index'

const queueHistory = [
  ['note', 'Add a private note to ticket #4821', 'Auto-approved', '9:41', 'auto-approved'],
  ['analytics', 'Grant read access to analytics for 30 minutes', 'Approved', '9:12', 'approved'],
  ['token', 'Rotate the production API token', 'Skipped', 'Yesterday', 'skipped'],
  ['staging', 'Merge the staging config branch', 'Expired', 'Yesterday', 'expired'],
  ['retention', 'Change the invoice retention window to 45 days', 'Skipped', 'Yesterday', 'skipped'],
  ['qa', 'Reset QA seed data before the nightly replay', 'Auto-approved', 'Mon', 'auto-approved'],
  ['imports', 'Delete the abandoned import job queue', 'Expired', 'Mon', 'expired'],
] as const

const approvalHistory = [
  [
    'refund',
    'Refunded 3 duplicate charges to Acme Logistics',
    '$1,240.00 · West billing · Maya Chen',
    'Approved',
    '10:42',
    'approved',
  ],
  [
    'note',
    'Added a private note to ticket #4821',
    'Internal notes policy · Auto policy',
    'Approved',
    '9:41',
    'approved',
  ],
  ['token', 'Rotated the production API token', 'Payments service · Sam Rivera', 'Skipped', '9:18', 'skipped'],
  [
    'analytics',
    'Granted read access to analytics for 30 minutes',
    'Meridian service account · Owen Patel',
    'Approved',
    '9:12',
    'approved',
  ],
  ['staging', 'Merged the staging config branch', 'No response in 2 hours · -', 'Expired', 'Yesterday', 'expired'],
  [
    'retention',
    'Changed the invoice retention window to 45 days',
    'billing-retention-policy.ts · Leah Stone',
    'Skipped',
    'Yesterday',
    'skipped',
  ],
  [
    'qa',
    'Reset QA seed data before the nightly replay',
    'qa_orders, qa_refunds · QA only · Auto policy',
    'Approved',
    'Yesterday',
    'approved',
  ],
  [
    'campaigns',
    'Archived 312 paused campaigns older than 18 months',
    'EU and NA marketing · Nina Brooks',
    'Skipped',
    'Mon',
    'skipped',
  ],
] as const

export const HBAR_APP_UI_AGENT_APPROVAL_FIXTURES: HbarAppUiAgentApprovalContent = {
  inline: {
    labels: {
      day: 'Today',
      showRequest: 'Show request',
      hideRequest: 'Hide request',
      decisionTime: 'just now',
      reject: 'Reject',
      approve: 'Delete 12 projects',
    },
    userMessage: 'Clean up the archived projects: we’re over the storage quota again.',
    detailMessage:
      'Twelve archived projects haven’t been opened in over a year. Removing them and their build history frees about 4.2 GB. Because this is permanent, I need you to confirm before I run it.',
    toolName: 'list_projects',
    toolDuration: '0.8s',
    requestTitle: 'Delete 12 archived projects and their build history',
    requestDescription:
      'Frees 4.2 GB in the storage-cleanup workspace. Active projects are untouched and this can’t be undone.',
    requestStatusLabel: 'Needs approval',
    requestText: `delete_projects({
  workspace: "storage-cleanup",
  ids: ["prj_9f2a", "prj_7c10", "prj_5b83", … +9],
  purgeBuildCache: true
})`,
    outcomes: {
      approved: {
        summary: 'Approved: deleted 12 projects, freed 4.2 GB',
        followUp:
          'Done: your archive is cleaned up. I’ll flag projects for review the next time you pass 90% of the quota.',
        announcement: 'Approved. Deleted 12 projects and freed 4.2 GB.',
      },
      rejected: { summary: 'Skipped, not approved', announcement: 'Skipped, not approved.' },
    },
  },
  diff: {
    labels: {
      headerTitle: 'Retention policy update',
      agent: 'Repo maintenance agent',
      status: 'Needs approval',
      separator: '·',
      showDiff: 'Show diff',
      hideDiff: 'Hide diff',
      reject: 'Reject',
      alwaysAllow: 'Always allow',
      approve: 'Approve',
      changeSeparator: '›',
    },
    title: 'Change the invoice retention window from 180 to 45 days',
    description:
      'Applies to the finance workspace. Invoice drafts older than 45 days will be purged nightly; posted invoices are never touched.',
    changes: [
      { id: 'retention-window', label: 'Retention window', previousValue: '180 days', nextValue: '45 days' },
      { id: 'nightly-purge', label: 'Nightly purge', previousValue: 'Off', nextValue: 'On' },
      { id: 'grace-period', label: 'Grace period before purge', previousValue: 'None', nextValue: '7 days' },
    ],
    diffText: `retention:
- invoiceDraftDays: 180
+ invoiceDraftDays: 45
+ nightlyPurge: true
+ purgeGraceDays: 7
  keepPostedInvoices: true`,
    outcomes: {
      approved: {
        status: 'Approved',
        summary: 'Allowed once, the retention policy was updated',
        announcement: 'Approved. The policy was updated.',
      },
      rejected: { status: 'Skipped', summary: 'Skipped, not approved', announcement: 'Skipped, not approved.' },
      'always-allow': {
        status: 'Always allowed',
        summary: 'Always allowed: policy edits in this project now run automatically',
        announcement: 'Always allowed for this project.',
      },
    },
    listStrategy: { kind: 'content-grown', expectedMaximum: 3 },
  },
  queue: {
    labels: {
      title: 'Approvals',
      waiting: (count) => `${count} waiting`,
      separator: '·',
      status: 'Needs approval',
      showRequest: 'Show request',
      hideRequest: 'Hide request',
      reject: 'Reject',
      approve: 'Approve',
    },
    onDecision: () => undefined,
    outcomes: {
      approved: { stateLabel: 'Approved', when: 'now', announcement: 'Approved. Next request is ready.' },
      rejected: { stateLabel: 'Skipped', when: 'now', announcement: 'Skipped, not approved.' },
    },
    pending: [
      {
        id: 'refund',
        title: 'Refund 3 duplicate charges to Acme Logistics',
        detail: '$1,240.00 total · West billing account',
        state: 'needs-approval',
        stateLabel: 'Needs approval',
        when: 'now',
        expandable: true,
        requestText: `refund_charges({
  account: "acme-logistics",
  chargeIds: ["ch_71a", "ch_802", "ch_9c4"],
  reason: "duplicate"
})`,
      },
      {
        id: 'renewal',
        title: 'Email the Q3 renewal summary to 4 recipients',
        detail: 'Attaches renewal-risk.pdf',
        state: 'queued',
        stateLabel: 'Queued',
        when: 'now',
        expandable: true,
        requestText: `send_email({
  template: "q3-renewal-summary",
  recipients: 4,
  attachment: "renewal-risk.pdf"
})`,
      },
      {
        id: 'campaigns',
        title: 'Archive 312 paused campaigns older than 18 months',
        detail: 'EU and NA marketing workspaces',
        state: 'queued',
        stateLabel: 'Queued',
        when: 'now',
        expandable: true,
        requestText: `archive_campaigns({
  status: "paused",
  olderThanMonths: 18,
  workspaces: ["EU", "NA"]
})`,
      },
    ],
    history: queueHistory.map(([id, title, stateLabel, when, state]) => ({
      id,
      title,
      detail: '',
      state,
      stateLabel,
      when,
      expandable: false,
    })),
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 10 },
  },
  permission: {
    requestId: 'support-read-access',
    state: 'pending',
    onScopeChange: () => undefined,
    onDecision: () => undefined,
    labels: {
      title: 'Permission request',
      agent: 'Support agent',
      status: 'Needs approval',
      showRequest: 'Show request',
      hideRequest: 'Hide request',
      scopes: 'Scopes requested',
      expires: 'Expires in',
      reject: 'Reject',
      approve: 'Approve',
      separator: '·',
    },
    requestTitle: 'Grant read access to customer records for 45 minutes',
    description:
      'The support agent wants to connect to api.lumendesk.com. Read-only, no billing changes, and access ends automatically when the timer runs out.',
    scopes: [
      {
        id: 'customer-records',
        title: 'Read customer records',
        description: 'Names, emails, plan tier, and invoice status.',
        checked: true,
      },
      {
        id: 'recent-tickets',
        title: 'Read recent tickets',
        description: 'Open and pending tickets from the last 30 days.',
        checked: true,
      },
      {
        id: 'renewal-export',
        title: 'Create one export',
        description: 'A CSV of renewal-risk accounts in the West workspace.',
        checked: true,
      },
    ],
    expiry: '45:00',
    requestText:
      'grant_access({\n  service: "api.lumendesk.com",\n  mode: "read",\n  scopes: ["customers.read", "tickets.read", "exports.create"],\n  ttlSeconds: 2700\n})',
    outcomes: {
      approved: {
        status: 'Granted',
        summary: (selected, total) => `Access granted for ${selected} of ${total} scopes · expires in 45 min`,
        announcement: (selected) => `Granted access for ${selected} scopes.`,
      },
      rejected: {
        status: 'Skipped',
        summary: () => 'Skipped, not approved',
        announcement: () => 'Skipped, not approved.',
      },
    },
    listStrategy: { kind: 'content-grown', expectedMaximum: 3 },
  },
  cost: {
    requestId: 'q4-forecast',
    state: 'pending',
    onDecision: () => undefined,
    labels: {
      badge: 'High-cost operation',
      agent: 'Demand forecast agent',
      title: 'Run the Q4 demand forecast: about 40 minutes and up to $18 in model usage',
      runtime: 'Runtime',
      background: 'Runs in the background',
      usage: 'Model usage',
      cap: 'Capped at $25.00',
      queries: 'Warehouse queries',
      readOnly: 'Read-only snapshots',
      projected: 'Projected spend for this run',
      separator: '·',
      showRequest: 'Show request',
      hideRequest: 'Hide request',
      reject: 'Reject',
      approve: 'Approve',
    },
    description: '',
    metrics: [
      { id: 'runtime', label: 'Runtime', value: '~40 min', detail: 'Runs in the background' },
      { id: 'usage', label: 'Model usage', value: 'up to $18.40', detail: 'Capped at $25.00' },
      { id: 'queries', label: 'Warehouse queries', value: '9,600', detail: 'Read-only snapshots' },
    ],
    projectedValue: '$18.40 of a $25.00 cap',
    progress: 74,
    progressLabel: 'Projected spend progress',
    requestText: 'run_forecast({\n  horizon: "Q4",\n  maxSpendUsd: 25\n})',
    outcomes: {
      approved: {
        status: 'Approved',
        summary: 'Running in the background. You can stop it any time',
        announcement: 'Approved. The forecast is running.',
      },
      rejected: { status: 'Skipped', summary: 'Skipped, not approved', announcement: 'Skipped, not approved.' },
    },
    listStrategy: { kind: 'content-grown', expectedMaximum: 3 },
  },
  history: {
    historyId: 'approval-history',
    query: '',
    labels: {
      title: 'Approval history',
      export: 'Export',
      searchLabel: 'Search history',
      filtersLabel: 'Approval history filters',
      emptyTitle: 'No decisions match',
      emptyDescription: 'Clear the search or switch the filter to see the full history.',
      clearFilters: 'Clear filters',
    },
    searchPlaceholder: 'Search decisions',
    filters: [
      { id: 'all', label: 'all' },
      { id: 'approved', label: 'approved' },
      { id: 'skipped', label: 'skipped' },
      { id: 'expired', label: 'expired' },
    ],
    activeFilterId: 'all',
    entries: approvalHistory.map(([id, title, detail, stateLabel, when, state]) => ({
      id,
      title,
      detail,
      state,
      stateLabel,
      when,
      filterIds: ['all', state],
    })),
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 8 },
  },
}

export function createHbarAppUiAgentApprovalOverflowFixtures(): HbarAppUiAgentApprovalContent {
  const base = HBAR_APP_UI_AGENT_APPROVAL_FIXTURES
  return {
    ...base,
    cost: base.cost && {
      ...base.cost,
      metrics: [
        ...base.cost.metrics,
        { id: 'extra-estimate', label: 'Additional estimate', value: '1 batch', detail: 'Host supplied detail' },
      ],
    },
    queue: base.queue && {
      ...base.queue,
      pending: [
        ...base.queue.pending,
        ...Array.from({ length: 12 }, (_, index) => ({
          id: `pending-overflow-${index}`,
          title: `Queued approval request ${index + 1}`,
          detail: '',
          state: 'queued' as const,
          stateLabel: 'Queued',
          when: 'later',
          expandable: false,
        })),
      ],
    },
    history: base.history && {
      ...base.history,
      entries: [
        ...base.history.entries,
        ...Array.from({ length: 24 }, (_, index) => ({
          id: `history-overflow-${index}`,
          title: `Archived approval decision ${index + 1}`,
          detail: 'Operations policy · Automation',
          state: 'approved' as const,
          stateLabel: 'Approved',
          when: `${index + 3}d ago`,
          filterIds: ['all', 'approved'],
        })),
      ],
    },
    diff: base.diff && {
      ...base.diff,
      changes: [
        ...base.diff.changes,
        ...Array.from({ length: 10 }, (_, index) => ({
          id: `change-overflow-${index}`,
          label: `Additional retention setting ${index + 1}`,
          previousValue: 'Off',
          nextValue: 'On',
        })),
      ],
    },
    permission: base.permission && {
      ...base.permission,
      scopes: [
        ...base.permission.scopes,
        ...Array.from({ length: 10 }, (_, index) => ({
          id: `scope-overflow-${index}`,
          title: `Additional read scope ${index + 1}`,
          description: 'Read-only access for this approval request.',
          checked: false,
        })),
      ],
    },
  }
}

export function createHbarAppUiAgentApprovalLocalizedFixtures(): HbarAppUiAgentApprovalContent {
  const base = HBAR_APP_UI_AGENT_APPROVAL_FIXTURES
  return {
    ...base,
    inline: base.inline && {
      ...base.inline,
      labels: {
        ...base.inline.labels,
        day: 'Heute',
        showRequest: 'Vollständigen Antrag anzeigen',
        hideRequest: 'Antrag ausblenden',
        decisionTime: 'soeben',
        reject: 'Dauerhaft ablehnen',
        approve: 'Zwölf Projekte löschen',
      },
      requestTitle: 'Zwölf archivierte Projekte und ihre Build-Historie dauerhaft löschen',
      outcomes: {
        approved: {
          summary: 'Genehmigt: zwölf Projekte gelöscht und 4,2 GB freigegeben',
          followUp:
            'Erledigt: Das Archiv wurde bereinigt. Beim nächsten Überschreiten von 90 Prozent des Kontingents werden Projekte zur Überprüfung markiert.',
          announcement: 'Genehmigt. Zwölf Projekte wurden gelöscht und 4,2 GB freigegeben.',
        },
        rejected: { summary: 'Übersprungen, nicht genehmigt', announcement: 'Übersprungen, nicht genehmigt.' },
      },
    },
    diff: base.diff && {
      ...base.diff,
      labels: {
        ...base.diff.labels,
        showDiff: 'Vollständige Änderungsliste anzeigen',
        hideDiff: 'Änderungen ausblenden',
        alwaysAllow: 'Für diesen Arbeitsbereich immer erlauben',
      },
      outcomes: {
        approved: {
          status: 'Genehmigt',
          summary: 'Einmal erlaubt: Die Aufbewahrungsrichtlinie wurde aktualisiert',
          announcement: 'Genehmigt. Die Richtlinie wurde aktualisiert.',
        },
        rejected: {
          status: 'Übersprungen',
          summary: 'Übersprungen, nicht genehmigt',
          announcement: 'Übersprungen, nicht genehmigt.',
        },
        'always-allow': {
          status: 'Immer erlaubt',
          summary: 'Immer erlaubt: Änderungen der Richtlinie werden für dieses Projekt jetzt automatisch ausgeführt',
          announcement: 'Für dieses Projekt immer erlaubt.',
        },
      },
    },
    queue: base.queue && {
      ...base.queue,
      labels: {
        ...base.queue.labels,
        title: 'Ausstehende Genehmigungen',
        waiting: (count) => `${count} ${count === 1 ? 'Entscheidung wartet' : 'Entscheidungen warten'}`,
        showRequest: 'Vollständigen Antrag anzeigen',
        hideRequest: 'Vollständigen Antrag ausblenden',
        reject: 'Dauerhaft ablehnen',
        approve: 'Antrag genehmigen',
      },
      outcomes: {
        approved: {
          stateLabel: 'Genehmigt',
          when: 'soeben',
          announcement: 'Genehmigt. Der nächste Antrag ist bereit.',
        },
        rejected: { stateLabel: 'Übersprungen', when: 'soeben', announcement: 'Übersprungen, nicht genehmigt.' },
      },
    },
    permission: base.permission && {
      ...base.permission,
      labels: {
        ...base.permission.labels,
        title: 'Berechtigungsanfrage mit lokalisiertem Inhalt',
        agent: 'Support-Assistent',
        status: 'Genehmigung erforderlich',
        showRequest: 'Anfrage und Umfang anzeigen',
        hideRequest: 'Anfrage und Umfang ausblenden',
        scopes: 'Angeforderte Berechtigungen',
        expires: 'Läuft ab in',
        reject: 'Berechtigungsanfrage ablehnen',
        approve: 'Ausgewählte Berechtigungen genehmigen',
      },
      requestTitle: 'Lesezugriff auf Kundendatensätze für fünfundvierzig Minuten genehmigen',
      description:
        'Der Support-Assistent benötigt schreibgeschützten Zugriff auf api.lumendesk.com. Rechnungsdaten bleiben unverändert; die Berechtigung endet automatisch.',
      scopes: base.permission.scopes.map((scope, index) => ({
        ...scope,
        title:
          [
            'Kundendatensätze einschließlich Rechnungsstatus lesen',
            'Aktuelle Support-Anfragen lesen',
            'Einmaligen Export für den Arbeitsbereich erstellen',
          ][index] ?? scope.title,
        description:
          [
            'Namen, E-Mail-Adressen, Tarif und Rechnungsstatus.',
            'Offene und ausstehende Anfragen der letzten dreißig Tage.',
            'CSV-Datei mit gefährdeten Verlängerungen im westlichen Arbeitsbereich.',
          ][index] ?? scope.description,
      })),
      outcomes: {
        approved: {
          status: 'Gewährt',
          summary: (selected, total) =>
            `Zugriff für ${selected} von ${total} Berechtigungen gewährt · läuft in 45 Minuten ab`,
          announcement: (selected) => `Zugriff für ${selected} Berechtigungen gewährt.`,
        },
        rejected: {
          status: 'Übersprungen',
          summary: () => 'Übersprungen, nicht genehmigt',
          announcement: () => 'Übersprungen, nicht genehmigt.',
        },
      },
    },
    cost: base.cost && {
      ...base.cost,
      labels: {
        ...base.cost.labels,
        badge: 'Kostenintensive Operation',
        agent: 'Prognose-Assistent',
        title:
          'Nachfrageprognose für das vierte Quartal ausführen: etwa vierzig Minuten und bis zu achtzehn Dollar Modellkosten',
        projected: 'Voraussichtliche Ausgaben für diesen vollständigen Durchlauf',
        showRequest: 'Details zur Schätzung anzeigen',
        hideRequest: 'Details zur Schätzung ausblenden',
        reject: 'Ausführung ablehnen',
        approve: 'Ausführung genehmigen',
      },
      projectedValue: '18,40 Dollar bei einer Obergrenze von 25,00 Dollar',
      metrics: [
        {
          id: 'runtime',
          label: 'Geschätzte Gesamtdauer',
          value: 'etwa 40 Minuten',
          detail: 'Wird im Hintergrund ausgeführt',
        },
        {
          id: 'usage',
          label: 'Voraussichtliche Modellnutzung',
          value: 'bis zu 18,40 Dollar',
          detail: 'Auf 25,00 Dollar begrenzt',
        },
        { id: 'queries', label: 'Datenbankabfragen', value: '9.600', detail: 'Schreibgeschützte Momentaufnahmen' },
      ],
      outcomes: {
        approved: {
          status: 'Genehmigt',
          summary: 'Wird im Hintergrund ausgeführt. Sie können den Vorgang jederzeit stoppen',
          announcement: 'Genehmigt. Die Prognose wird ausgeführt.',
        },
        rejected: {
          status: 'Übersprungen',
          summary: 'Übersprungen, nicht genehmigt',
          announcement: 'Übersprungen, nicht genehmigt.',
        },
      },
    },
    history: base.history && {
      ...base.history,
      labels: {
        ...base.history.labels,
        title: 'Genehmigungsverlauf für diesen Arbeitsbereich',
        export: 'Verlauf exportieren',
        searchLabel: 'Entscheidungen durchsuchen',
        emptyTitle: 'Keine passenden Entscheidungen',
        emptyDescription: 'Löschen Sie den Suchtext oder ändern Sie den Filter, um den vollständigen Verlauf zu sehen.',
        clearFilters: 'Filter zurücksetzen',
      },
      searchPlaceholder: 'Entscheidungen mit langen Beschreibungen durchsuchen',
      filters: [
        { id: 'all', label: 'Alle' },
        { id: 'approved', label: 'Genehmigt' },
        { id: 'skipped', label: 'Übersprungen' },
        { id: 'expired', label: 'Abgelaufen' },
      ],
    },
  }
}
