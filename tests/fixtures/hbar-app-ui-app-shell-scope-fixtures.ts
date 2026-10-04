import type { LumenAppShellScopeContent, LumenScopeDatabase } from '@lumen/app-ui'

type RecordSeed = readonly [string, string, LumenScopeDatabase['tone'], number, string]
const production: readonly RecordSeed[] = [
  ['primary', 'eu-west-1', 'active', 184, '7 Apr 2026'],
  ['replica-a', 'eu-west-1', 'active', 96, '7 Apr 2026'],
  ['replica-b', 'eu-west-1', 'active', 88, '7 Apr 2026'],
  ['read-replica-analytics-frankfurt-standby', 'eu-central-1', 'degraded', 41, '6 Apr 2026'],
  ['sessions', 'us-east-1', 'active', 310, '7 Apr 2026'],
  ['jobs', 'eu-west-1', 'active', 22, '7 Apr 2026'],
  ['audit-log', 'ap-southeast-2', 'active', 12, '7 Apr 2026'],
  ['search-index', 'eu-west-1', 'syncing', 6, '-'],
  ['billing', 'eu-west-1', 'active', 47, '7 Apr 2026'],
  ['webhooks', 'us-west-2', 'active', 31, '6 Apr 2026'],
  ['cache-meta', 'eu-west-1', 'active', 15, '7 Apr 2026'],
  ['reporting', 'eu-central-1', 'active', 28, '7 Apr 2026'],
  ['archive-2025', 'us-east-1', 'paused', 0, '1 Apr 2026'],
  ['restore-drill', 'us-east-1', 'paused', 0, '5 Apr 2026'],
]
const staging: readonly RecordSeed[] = [
  ['primary', 'eu-west-1', 'active', 24, '7 Apr 2026'],
  ['replica-a', 'eu-west-1', 'active', 11, '7 Apr 2026'],
  ['read-replica-analytics-frankfurt-standby', 'eu-central-1', 'active', 8, '6 Apr 2026'],
  ['sessions', 'us-east-1', 'active', 19, '7 Apr 2026'],
  ['jobs', 'eu-west-1', 'active', 5, '7 Apr 2026'],
  ['audit-log', 'ap-southeast-2', 'active', 3, '6 Apr 2026'],
  ['search-index', 'eu-west-1', 'syncing', 2, '-'],
  ['billing', 'eu-west-1', 'active', 7, '7 Apr 2026'],
  ['webhooks', 'us-west-2', 'active', 4, '7 Apr 2026'],
  ['seed-data', 'eu-west-1', 'active', 1, '5 Apr 2026'],
  ['load-test', 'us-east-1', 'paused', 0, '2 Apr 2026'],
  ['archive-2025', 'us-east-1', 'paused', 0, '1 Apr 2026'],
  ['fixtures', 'eu-west-1', 'active', 2, '4 Apr 2026'],
]
const preview: readonly RecordSeed[] = [
  ['primary', 'eu-west-1', 'active', 3, '7 Apr 2026'],
  ['pr-4821', 'eu-west-1', 'active', 2, '-'],
  ['pr-4817', 'eu-west-1', 'active', 1, '-'],
  ['pr-4802-checkout-redesign-rollback', 'eu-west-1', 'syncing', 0, '-'],
  ['sessions', 'eu-west-1', 'active', 2, '6 Apr 2026'],
  ['jobs', 'eu-west-1', 'active', 1, '6 Apr 2026'],
  ['search-index', 'eu-west-1', 'active', 1, '5 Apr 2026'],
  ['billing', 'eu-central-1', 'active', 1, '5 Apr 2026'],
  ['webhooks', 'eu-west-1', 'paused', 0, '4 Apr 2026'],
  ['seed-data', 'eu-west-1', 'active', 1, '4 Apr 2026'],
  ['pr-4788', 'us-east-1', 'paused', 0, '3 Apr 2026'],
  ['pr-4771', 'us-east-1', 'paused', 0, '2 Apr 2026'],
  ['fixtures', 'eu-west-1', 'active', 1, '3 Apr 2026'],
]
export function scopeDatabaseFixture(
  project: string,
  environment: string,
  localized = false,
): readonly LumenScopeDatabase[] {
  const statuses = localized
    ? { active: 'Aktiv', degraded: 'Beeinträchtigt', syncing: 'Synchronisiert', paused: 'Pausiert' }
    : { active: 'Active', degraded: 'Degraded', syncing: 'Syncing', paused: 'Paused' }
  return (environment === 'staging' ? staging : environment === 'preview' ? preview : production).map(
    ([id, region, tone, connections, backup]) => ({
      id,
      name: `${project}-${id}`,
      region,
      tone,
      status: statuses[tone],
      connections: String(connections),
      backup,
    }),
  )
}
export function scopeStatusFixture(environment: string, localized = false): LumenAppShellScopeContent['status'] {
  const degraded = environment === 'production',
    operational = localized ? 'Betriebsbereit' : 'Operational',
    issue = localized ? 'Beeinträchtigt' : 'Degraded'
  return {
    label: degraded ? issue : operational,
    triggerLabel: localized
      ? `Systemstatus: ${degraded ? 'Beeinträchtigt in eu-central-1' : 'Betriebsbereit'}`
      : `System status: ${degraded ? 'degraded in eu-central-1' : 'operational'}`,
    dialogLabel: localized ? 'Systemstatus' : 'System status',
    degraded,
    description: localized
      ? degraded
        ? 'Die Schreiblatenz in eu-central-1 liegt über dem Zielwert.'
        : 'Alle Regionen bearbeiten den Datenverkehr normal.'
      : degraded
        ? 'Write latency is above target in eu-central-1.'
        : 'All regions are serving traffic normally.',
    regions: (degraded
      ? ['eu-west-1', 'eu-central-1', 'us-east-1', 'ap-southeast-2', 'us-west-2']
      : ['eu-west-1', 'eu-central-1', 'us-east-1']
    ).map((id) => ({
      id,
      label: id,
      degraded: degraded && id === 'eu-central-1',
      status: degraded && id === 'eu-central-1' ? issue : operational,
    })),
  }
}
export function appShellScopeFixture(
  mode: string | null = null,
  report: (action: string, value?: string) => void = () => {},
): LumenAppShellScopeContent {
  const de = mode === 'localized'
  const options = (values: readonly (readonly [string, string])[]) => values.map(([id, label]) => ({ id, label }))
  const data = scopeDatabaseFixture('payments-api', 'production', de)
  return {
    brand: 'Tideline',
    brandMark: 'T',
    labels: de
      ? {
          scope: 'Bereich',
          separator: '/',
          combined: 'Organisation und Projekt',
          navigation: 'Navigation',
          openNavigation: 'Navigation öffnen',
          closeNavigation: 'Navigation schließen',
          closeOverlay: 'Navigationsüberlagerung schließen',
          search: 'Dieses Projekt durchsuchen',
          searchPlaceholder: 'Suchen',
          project: 'Projekt',
          environment: 'Umgebung',
          databases: 'Datenbanken',
          createDatabase: 'Datenbank erstellen',
          createShort: 'Erstellen',
          table: 'Datenbanken im ausgewählten Projekt und in der Umgebung',
          columns: ['Datenbank', 'Region', 'Status', 'Verbindungen', 'Letzte Sicherung'],
          empty: 'Keine Datenbanken in dieser Umgebung.',
          missingScope: 'Kein Bereich ausgewählt',
          account: 'Konto',
          count: String,
        }
      : {
          scope: 'Scope',
          separator: '/',
          combined: 'Organisation and project',
          navigation: 'Navigation',
          openNavigation: 'Open navigation',
          closeNavigation: 'Close navigation',
          closeOverlay: 'Close navigation overlay',
          search: 'Search this project',
          searchPlaceholder: 'Search',
          project: 'Project',
          environment: 'Environment',
          databases: 'Databases',
          createDatabase: 'Create database',
          createShort: 'Create',
          table: 'Databases in the selected project and environment',
          columns: ['Database', 'Region', 'Status', 'Connections', 'Last backup'],
          empty: 'No databases in this environment.',
          missingScope: 'No scope selected',
          account: 'Account',
          count: String,
        },
    pickers: {
      organisation: {
        label: de ? 'Organisation' : 'Organisation',
        triggerLabel: (value) => `Organisation: ${value}`,
        create: de ? 'Organisation erstellen' : 'Create organisation',
        options: options([
          ['northwind', de ? 'Northwind Forschungsorganisation für internationale Zahlungsdienste' : 'Northwind Labs'],
          ['halden', 'Halden Group'],
          ['corran', 'Corran Health'],
        ]),
        selectedId: 'northwind',
      },
      project: {
        label: de ? 'Projekt' : 'Project',
        triggerLabel: (value) => `${de ? 'Projekt' : 'Project'}: ${value}`,
        create: de ? 'Projekt erstellen' : 'Create project',
        options: options([
          ['payments-api', 'Payments API'],
          ['ledger-core', 'Ledger core'],
          ['merchant-portal', 'Merchant portal'],
          ['risk-engine', 'Risk engine'],
        ]),
        selectedId: 'payments-api',
      },
      environment: {
        label: de ? 'Umgebung' : 'Environment',
        triggerLabel: (value) => `${de ? 'Umgebung' : 'Environment'}: ${value}`,
        create: de ? 'Umgebung erstellen' : 'Create environment',
        options: options([
          ['production', de ? 'Produktionsumgebung' : 'Production'],
          ['staging', 'Staging'],
          ['preview', de ? 'Vorschau' : 'Preview'],
        ]),
        selectedId: 'production',
      },
    },
    query: '',
    currentNavigationId: 'databases',
    navigation: [
      { id: 'overview', label: de ? 'Übersicht' : 'Overview', icon: 'overview' },
      {
        id: 'data',
        label: de ? 'Daten' : 'Data',
        icon: 'data',
        children: options([
          ['databases', de ? 'Datenbanken' : 'Databases'],
          ['backups', de ? 'Sicherungen' : 'Backups'],
          ['migrations', de ? 'Migrationen' : 'Migrations'],
        ]),
      },
      { id: 'deployments', label: de ? 'Bereitstellungen' : 'Deployments', icon: 'deployments' },
      { id: 'logs', label: de ? 'Protokolle' : 'Logs', icon: 'logs' },
    ],
    environmentNavigation: [
      { id: 'variables', label: de ? 'Variablen' : 'Variables', icon: 'variables' },
      { id: 'domains', label: de ? 'Domains' : 'Domains', icon: 'domains' },
      { id: 'access', label: de ? 'Zugriff' : 'Access', icon: 'access' },
    ],
    databases:
      mode === 'empty'
        ? []
        : mode === 'one'
          ? data.slice(0, 1)
          : mode === 'boundary' || mode === 'overflow'
            ? Array.from({ length: mode === 'boundary' ? 100 : 101 }, (_, index) => {
                const record = data[index % data.length]
                if (!record) throw new Error('Database seed is absent')
                return {
                  ...record,
                  id: `record-${index}`,
                  name: `payments-api-database-${index}`,
                }
              })
            : data,
    status: scopeStatusFixture('production', de),
    notice: {
      title: de ? 'Zeitpunktbezogene Wiederherstellung' : 'Point-in-time restore',
      description: de
        ? 'Stellen Sie jede Datenbank auf einen beliebigen Zeitpunkt der letzten 30 Tage wieder her.'
        : 'Rewind any database to any point in the last 30 days.',
      readMore: de ? 'Mehr erfahren' : 'Read more',
      dismiss: de ? 'Verwerfen' : 'Dismiss',
    },
    account: {
      initials: 'DW',
      name: 'Dana Whitfield',
      email: 'dana.whitfield@northwindlabs.com',
      items: [
        { id: 'settings', label: de ? 'Kontoeinstellungen' : 'Account settings', icon: 'settings' },
        {
          id: 'notifications',
          label: de ? 'Benachrichtigungseinstellungen' : 'Notification preferences',
          icon: 'notifications',
        },
        { id: 'help', label: de ? 'Hilfezentrum' : 'Help centre', icon: 'help' },
        { id: 'signout', label: de ? 'Abmelden' : 'Sign out', icon: 'signout' },
      ],
    },
    onScope: (kind, id) => report('scope', `${kind}:${id}`),
    onQuery: (value) => report('query', value),
    onAction: (action, id) => report(action, id),
  }
}
