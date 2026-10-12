import { FileText, Hash, Palette, UserRound } from 'lucide-react'
import type { LumenCommandListProps, LumenInviteCommandProps } from '@lumen/app-ui/catalog'
import {
  COMMAND_LABELS,
  COMMAND_PROJECT_LABELS,
  GROUPED_COMMANDS,
  QUICK_COMMANDS,
  ROOM_COMMANDS,
} from '../../../tests/fixtures/hbar-app-ui-command-fixtures'
import {
  SEARCH_COMMANDS,
  SEARCH_COPY,
  SEARCH_SCOPES,
  INVITE_FIXTURE,
  ASSISTANT_FIXTURE,
} from '../../../tests/fixtures/hbar-app-ui-command-workflow-fixtures'
import type { CommandPreviewItem, CommandPreviewPageSeed, CommandPreviewSeed } from './commandPreviewModel'

const projects: readonly CommandPreviewItem[] = ROOM_COMMANDS.map((item, index) => ({
  id: `project-${item.id}`,
  label: item.label,
  description: [
    'Updated 4m ago',
    'Updated 1h ago',
    'Updated yesterday',
    'Updated 2 days ago',
    'Updated 3 days ago',
    'Updated last week',
  ][index],
  icon: Hash,
}))
const themes: readonly CommandPreviewItem[] = [
  { id: 'system', label: 'System', description: 'Follows your device', icon: Palette },
  { id: 'light', label: 'Light', icon: Palette },
  { id: 'dark', label: 'Dark', icon: Palette },
]
const statuses: readonly CommandPreviewItem[] = [
  { id: 'active', label: 'Active', icon: UserRound },
  { id: 'away', label: 'Away', description: 'Clears when you return', icon: UserRound },
  { id: 'do-not-disturb', label: 'Do not disturb', description: 'Mutes notifications', icon: UserRound },
  { id: 'meeting', label: 'In a meeting', description: 'Clears after 1 hour', icon: UserRound },
]
const actions: readonly CommandPreviewItem[] = [
  { id: 'invite', label: 'Invite a teammate', description: 'Add someone to Northwind', icon: UserRound },
  { id: 'rerun', label: 'Rerun a workflow', description: 'Trigger a fresh run', icon: FileText },
  { id: 'archive', label: 'Archive a project', description: 'Hide it from the workspace', icon: FileText },
]
const assistantCommands: readonly CommandPreviewItem[] = [
  {
    id: 'invite',
    label: 'Invite a teammate',
    description: 'Add someone to the workspace',
    shortcut: 'I',
    icon: UserRound,
  },
  {
    id: 'billing',
    label: 'Open billing settings',
    description: 'Plan, invoices, and payment method',
    shortcut: 'B',
    icon: FileText,
  },
  {
    id: 'usage',
    label: 'Export usage report',
    description: 'Download last month as a CSV',
    shortcut: 'E',
    icon: FileText,
  },
]

const searchDetails = [
  {
    id: 'launch',
    fields: [
      ['owner', 'Owner', 'Priya Anand'],
      ['section', 'Section', 'Release'],
      ['updated', 'Updated', '6m ago'],
    ],
    body: SEARCH_COPY.body,
  },
  {
    id: 'incident',
    fields: [
      ['owner', 'Owner', 'Marcus Reed'],
      ['section', 'Section', 'Reliability'],
      ['updated', 'Updated', '1h ago'],
    ],
    body: 'Checkout latency review: the p95 cause, deployed mitigation and follow-up prevention work.',
  },
  {
    id: 'rollback',
    fields: [
      ['owner', 'Owner', 'Priya Anand'],
      ['section', 'Section', 'Release'],
      ['updated', 'Updated', '3 days ago'],
    ],
    body: 'Canary rollback instructions, including escalation contacts and the incident update.',
  },
  {
    id: 'priya',
    fields: [
      ['team', 'Team', 'Release'],
      ['timezone', 'Timezone', 'GMT+1'],
      ['reviews', 'Reviews', '18'],
    ],
    body: 'Mobile launch readiness owner and contact for rollout gates and staged deployments.',
  },
  {
    id: 'marcus',
    fields: [
      ['team', 'Team', 'Reliability'],
      ['timezone', 'Timezone', 'GMT−5'],
      ['reviews', 'Reviews', '24'],
    ],
    body: 'Current incident rotation lead. Use the reliability channel for paging.',
  },
  {
    id: 'deploy',
    fields: [
      ['last', 'Last run', 'Passed'],
      ['duration', 'Duration', '6m 40s'],
      ['steps', 'Steps', '9'],
    ],
    body: 'Canary and full rollout pipeline with an automatic rollback gate for elevated errors.',
  },
  {
    id: 'rotate',
    fields: [
      ['last', 'Last run', 'Passed'],
      ['duration', 'Duration', '48s'],
      ['steps', 'Steps', '4'],
    ],
    body: 'Refresh signing keys and the secret store, then retire the old key after a grace period.',
  },
  {
    id: 'backup',
    fields: [
      ['last', 'Last run', 'Passed'],
      ['duration', 'Duration', '11m 02s'],
      ['steps', 'Steps', '3'],
    ],
    body: 'Cold-storage cluster backup with a test restore to a temporary instance.',
  },
] as const

/** Visible fixtures and localization belong to the preview Host, never to the reusable menu. */
export function createCommandPreviewFixtures(variant: number, mode: string | null) {
  const localized = mode === 'localized'
  const labels: LumenCommandListProps['labels'] = localized
    ? {
        ...COMMAND_LABELS,
        search: 'Befehl suchen oder ausführen',
        available: 'Verfügbare Befehle',
        empty: 'Keine passenden Befehle',
        unavailable: 'Der ausgewählte Befehl ist nicht mehr verfügbar. Bitte erneut auswählen.',
        navigate: 'zum Navigieren',
        execute: 'zum Öffnen',
        close: 'Menü schließen',
        count: (count) => `${count} Ergebnisse`,
      }
    : COMMAND_LABELS
  const localize = (items: readonly CommandPreviewItem[]): readonly CommandPreviewItem[] =>
    localized
      ? items.map((item) => ({
          ...item,
          label: `${item.label} — ausführliche Beschreibung für diesen Arbeitsbereich`,
          description: item.description ? `${item.description} — zusätzliche Angaben` : undefined,
          group: item.group ? `${item.group} — Arbeitsbereich` : undefined,
        }))
      : items
  const grouped =
    mode === 'overflow'
      ? Array.from({ length: 10000 }, (_, index): CommandPreviewItem => ({
          id: `command-${index}`,
          label: `Command ${index}`,
        }))
      : mode === 'empty'
        ? []
        : mode === 'one'
          ? GROUPED_COMMANDS.slice(0, 1)
          : GROUPED_COMMANDS
  const quick = localize(QUICK_COMMANDS)
  const projectItems = localize(projects)
  const themeItems = localize(themes)
  const statusItems = localize(statuses)
  const actionItems = localize(actions)
  const assistantItems = localized
    ? assistantCommands.map((item) => ({
        ...item,
        label:
          item.id === 'usage'
            ? 'Nutzungsbericht exportieren'
            : item.id === 'billing'
              ? 'Abrechnungseinstellungen öffnen'
              : 'Teammitglied einladen',
        description:
          item.id === 'usage'
            ? 'Vergangenen Monat als CSV herunterladen'
            : item.id === 'billing'
              ? 'Tarif, Rechnungen und Zahlungsmethode'
              : 'Eine Person zum Arbeitsbereich hinzufügen',
      }))
    : assistantCommands
  const search = {
    details: searchDetails.map((detail) => ({
      id: detail.id,
      fields: detail.fields.map(([id, label, value]) => ({
        id,
        label: localized ? `${label} — Angaben` : label,
        value,
      })),
      body: localized ? `Ausführliche Angaben zum ausgewählten Ergebnis: ${detail.body}` : detail.body,
    })),
    items: localize(SEARCH_COMMANDS),
    scopes: localized
      ? SEARCH_SCOPES.map((scope) => ({
          ...scope,
          label:
            scope.id === 'all'
              ? 'Alle'
              : scope.id === 'doc'
                ? 'Dokumente'
                : scope.id === 'person'
                  ? 'Personen'
                  : 'Arbeitsabläufe',
        }))
      : SEARCH_SCOPES,
    copy: localized
      ? {
          ...SEARCH_COPY,
          trigger: 'Dokumente, Personen und Arbeitsabläufe suchen',
          title: 'Alles durchsuchen',
          scope: 'Suchbereich',
          missing: 'Ein Ergebnis auswählen, um Details zu sehen.',
          open: 'Ergebnis öffnen',
          fields: SEARCH_COPY.fields.map((field) => ({
            ...field,
            label: field.id === 'owner' ? 'Verantwortlich' : field.id === 'section' ? 'Bereich' : 'Aktualisiert',
          })),
          body: 'Freigabe-Checkliste mit Rollout-Phasen, Alarmschwellen und der verantwortlichen Person für die Wiederherstellung.',
        }
      : SEARCH_COPY,
  }
  const invite = {
    ...INVITE_FIXTURE,
    actions: actionItems,
    trigger: localized ? 'Aktion ausführen' : INVITE_FIXTURE.trigger,
    actionSearch: localized ? 'Aktion finden' : 'Find an action',
    actionAvailable: localized ? 'Aktionen' : 'Actions',
    backDetails: localized ? 'Zurück zu Details' : 'Back to details',
    confirm: localized ? 'Einladung senden' : 'Send invite',
    labels: localized
      ? {
          ...INVITE_FIXTURE.labels,
          title: 'Ein Teammitglied zum Arbeitsbereich einladen',
          back: 'Zurück zu Aktionen',
          email: 'E-Mail-Adresse',
          role: 'Rolle',
          unavailableRole: 'Eine verfügbare Rolle auswählen',
          review: 'Prüfen',
        }
      : INVITE_FIXTURE.labels,
    roles: localized
      ? INVITE_FIXTURE.roles.map((role) => ({
          ...role,
          label: role.id === 'viewer' ? 'Betrachter' : role.id === 'editor' ? 'Bearbeiter' : 'Administrator',
        }))
      : INVITE_FIXTURE.roles,
    step: (step: number) => (localized ? `Schritt ${step} von 2` : INVITE_FIXTURE.step(step)),
    summary: (email: string, role: string) =>
      localized ? `${email} als ${role} zu Northwind einladen.` : `Invite ${email} to Northwind as ${role}.`,
  }
  const assistant = {
    ...ASSISTANT_FIXTURE,
    query: localized ? 'vierteljährliche Ausgaben nach Team und Arbeitsbereich' : ASSISTANT_FIXTURE.query,
    commands: assistantItems,
    suggestions: localized
      ? [
          { id: 'billing', label: 'Abrechnungseinstellungen' },
          { id: 'invite', label: 'Teammitglied einladen' },
          { id: 'usage', label: 'Nutzungsbericht' },
        ]
      : ASSISTANT_FIXTURE.suggestions,
    labels: localized
      ? {
          ...ASSISTANT_FIXTURE.labels,
          search: 'Suchen oder fragen',
          title: 'Keine passenden Befehle',
          description:
            'In diesem Arbeitsbereich wurde nichts Passendes gefunden. Stattdessen die Assistenz zu diesen Daten fragen.',
          ask: (query: string) => `Zu „${query}“ fragen`,
          suggestions: 'STATTDESSEN VERSUCHEN',
          resultSummary: '0 passende Befehle',
        }
      : ASSISTANT_FIXTURE.labels,
  }
  const pageCopy = {
    root: { title: labels.search, search: labels.search },
    project: {
      title: localized ? 'Projekt wechseln' : 'Switch project',
      search: localized ? 'Projekt finden' : 'Find a project',
    },
    theme: {
      title: localized ? 'Darstellung wählen' : 'Change theme',
      search: localized ? 'Darstellung wählen' : 'Choose a theme',
    },
    status: {
      title: localized ? 'Status festlegen' : 'Set your status',
      search: localized ? 'Status wählen' : 'Choose a status',
    },
  }
  const inlineActions: readonly {
    readonly id: string
    readonly title: string
    readonly confirm: string
    readonly summary: (values: readonly string[]) => string
    readonly fields: NonNullable<LumenInviteCommandProps['inlineAction']>['fields']
  }[] = [
    {
      id: 'rerun',
      title: localized ? 'Einen Arbeitsablauf erneut ausführen' : 'Rerun a workflow',
      confirm: localized ? 'Lauf starten' : 'Start run',
      summary: (values) =>
        localized ? `${values[0]} mit Git-Referenz ${values[1]} ausführen.` : `Run ${values[0]} on ${values[1]}.`,
      fields: [
        {
          id: 'workflow',
          kind: 'choice',
          label: localized ? 'Arbeitsablauf' : 'Workflow',
          value: 'staged',
          options: [
            { id: 'staged', label: localized ? 'Gestaffelte Bereitstellung' : 'Staged deploy' },
            { id: 'rotate', label: localized ? 'Signaturschlüssel erneuern' : 'Rotate signing keys' },
            { id: 'backup', label: localized ? 'Nächtliche Sicherung' : 'Nightly backup' },
          ],
        },
        { id: 'ref', kind: 'text', label: localized ? 'Git-Referenz' : 'Git ref', value: 'main', placeholder: 'main' },
      ],
    },
    {
      id: 'archive',
      title: localized ? 'Ein Projekt archivieren' : 'Archive a project',
      confirm: localized ? 'Projekt archivieren' : 'Archive project',
      summary: (values) =>
        localized
          ? `${values[0]} archivieren. Mitglieder verlieren den Zugriff bis zur Wiederherstellung.`
          : `Archive ${values[0]}. Members lose access until it is restored.`,
      fields: [
        {
          id: 'project',
          kind: 'choice',
          label: localized ? 'Projekt' : 'Project',
          value: 'ledger',
          options: [
            { id: 'ledger', label: 'Ledger billing' },
            { id: 'relay', label: 'Relay notifications' },
            { id: 'beacon', label: 'Beacon status page' },
          ],
        },
      ],
    },
  ]
  let pages: readonly CommandPreviewPageSeed[] = [{ id: 'root', items: localize(grouped) }]
  if (variant === 2 && mode !== 'overflow')
    pages = [
      { id: 'root', items: quick },
      { id: 'project', parentId: 'root', entryItemId: 'project', items: projectItems },
      { id: 'theme', parentId: 'root', entryItemId: 'theme', items: themeItems },
      { id: 'status', parentId: 'root', entryItemId: 'status', items: statusItems },
    ]
  if (variant === 3) pages = [{ id: 'root', items: search.items }]
  if (variant === 4)
    pages = [
      { id: 'actions', items: actionItems },
      { id: 'details', parentId: 'actions', entryItemId: 'invite', items: [] },
      ...inlineActions.map((action) => ({
        id: action.id,
        parentId: 'actions',
        entryItemId: action.id,
        items: [],
        arguments: action.fields.map((field) =>
          field.kind === 'text'
            ? { id: field.id, kind: 'text' as const, initialValue: field.value }
            : {
                id: field.id,
                kind: 'choice' as const,
                initialValue: field.value,
                options: field.options.map(({ id }) => ({ id })),
              },
        ),
      })),
    ]
  if (variant === 5) pages = [{ id: 'root', items: assistantItems }]
  if (variant === 6 && mode !== 'overflow') pages = [{ id: 'root', items: localize(ROOM_COMMANDS) }]
  const seed: Omit<CommandPreviewSeed, 'ownerId'> = {
    variant,
    fixtureId: mode ?? 'default',
    surface: variant === 3 ? 'search' : variant === 4 ? 'invite' : variant === 5 ? 'assistant' : 'catalog',
    pages,
    initialPageId: variant === 4 ? 'details' : 'root',
    scopes: search.scopes.map((scope) => ({ id: scope.id, kind: scope.id })),
    allScopeId: 'all',
    roles: invite.roles,
    suggestions: assistant.suggestions.map((item) => ({ id: item.id, query: item.label })),
    requestActions: ['open', 'switch', 'review', 'confirm', 'ask'],
    initialOpen: true,
    initialQuery: variant === 5 ? assistant.query : '',
    initialSelectedId: variant === 5 ? null : undefined,
    initialScopeId: 'all',
    initialEmail: invite.email,
    initialRoleId: invite.roleId,
    initialStep: 1,
  }
  const hints = {
    move: localized ? 'zum Bewegen' : 'to move',
    choose: localized ? 'zum Auswählen' : 'to select',
    run: localized ? 'zum Ausführen' : 'to run',
    review: localized ? 'zum Prüfen' : 'to review',
    confirm: localized ? 'zum Bestätigen' : 'to confirm',
    ask: localized ? 'zum Fragen' : 'to ask',
    close: localized ? 'zum Schließen' : 'to close',
    back: localized ? 'zurück' : 'to go back',
    switch: localized ? 'zum Wechseln' : 'to switch',
    jump: localized ? 'zum Springen' : 'to jump',
    roomSearch: localized ? 'Raum finden' : 'Find a room',
    roomTitle: localized ? 'Raum wechseln' : 'Switch room',
    roomCurrent: localized ? 'Aktueller Raum' : 'Current room',
    roomActive: localized ? 'Jetzt aktiv' : 'Active now',
    result: (count: number, total: number) => (localized ? `${count} von ${total}` : `${count} of ${total}`),
  }
  return {
    seed,
    labels,
    pageCopy,
    search,
    invite,
    inlineActions,
    assistant,
    hints,
    projectLabels: localized ? { home: 'Start', project: 'Projekt' } : COMMAND_PROJECT_LABELS,
    requestNotice: localized
      ? 'Vorschauanfrage erfasst — kein Befehl ausgeführt, keine Einladung gesendet, kein Download und kein Assistenzdienst aufgerufen.'
      : 'Preview request recorded — no external command executed, invite sent, download started or assistant service called.',
  }
}

export type CommandPreviewFixtures = ReturnType<typeof createCommandPreviewFixtures>
