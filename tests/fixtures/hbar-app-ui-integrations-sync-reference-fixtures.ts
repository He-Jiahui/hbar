import type { HbarAppUiIntegrationSyncContent } from '../../packages/hbar-app-ui/src/index'

export function createIntegrationSyncReferenceFixture(
  locale: 'en' | 'de-long' = 'en',
): HbarAppUiIntegrationSyncContent {
  const localized = locale === 'de-long'
  const healthy = localized ? 'Intakt' : 'Healthy'
  const syncing = localized ? 'Synchronisierung läuft' : 'Syncing'
  const failed = localized ? 'Fehlgeschlagen' : 'Failed'
  const paused = localized ? 'Pausiert' : 'Paused'
  return {
    labels: {
      pageTitle: localized ? 'Synchronisierungsstatus' : 'Sync status',
      pageDescription: localized
        ? 'Fünf verbundene Quellen schreiben in das zentrale Datenlager.'
        : 'Five connected sources writing into the warehouse.',
      syncAll: localized ? 'Alle synchronisieren' : 'Sync all',
      pause: (name) => (localized ? `${name} pausieren` : `Pause ${name}`),
      resume: (name) => (localized ? `${name} fortsetzen` : `Resume ${name}`),
      paused,
      retry: localized ? 'Erneut versuchen' : 'Retry',
      footer: localized
        ? 'Datenlager erreichbar · vor 30 Sekunden geprüft'
        : 'Warehouse reachable · checked 30 seconds ago',
      failureSummary: (count) =>
        localized
          ? `${count} fehlgeschlagene Synchronisierung${count === 1 ? '' : 'en'}`
          : `${count} failing sync${count === 1 ? '' : 's'}`,
      empty: localized ? 'Keine verbundenen Quellen.' : 'No connected sources.',
      progress: (name) => (localized ? `Synchronisierungsfortschritt für ${name}` : `${name} sync progress`),
    },
    metrics: [
      { id: 'healthy', label: healthy, value: '2', tone: 'positive' },
      { id: 'syncing', label: syncing, value: '1' },
      { id: 'failed', label: failed, value: '1', tone: 'danger' },
      { id: 'paused', label: paused, value: '1', tone: 'neutral' },
    ],
    sources: [
      {
        id: 'northwind',
        initials: 'NW',
        name: 'Northwind',
        destination: 'events.usage_rollups',
        detail: localized ? '42.918 Zeilen · läuft gerade' : '42,918 rows · running now',
        status: syncing,
        statusTone: 'neutral',
        progress: 62,
      },
      {
        id: 'alder',
        initials: 'AL',
        name: 'Alder',
        destination: 'billing.invoices',
        detail: localized ? '1.204 Zeilen · vor 8 Minuten' : '1,204 rows · 8 minutes ago',
        status: healthy,
        statusTone: 'positive',
        progress: 100,
      },
      {
        id: 'cedar',
        initials: 'CL',
        name: 'Cedar Labs',
        destination: 'ci.check_results',
        detail: localized ? '9.640 Zeilen · vor 22 Minuten' : '9,640 rows · 22 minutes ago',
        status: healthy,
        statusTone: 'positive',
        progress: 100,
      },
      {
        id: 'meridian',
        initials: 'MD',
        name: 'Meridian',
        destination: 'storage.exports',
        detail: localized ? '318 Zeilen · vor 1 Stunde' : '318 rows · 1 hour ago',
        status: failed,
        statusTone: 'danger',
        progress: 41,
        failure: localized
          ? 'Der Bucket hat den Schreibvorgang abgelehnt: s3:PutObject fehlt für das Exportpräfix.'
          : 'Bucket rejected the write: missing s3:PutObject on the export prefix.',
      },
      {
        id: 'quarry',
        initials: 'QR',
        name: 'Quarry',
        destination: 'audit.entries',
        detail: localized ? '76.210 Zeilen · gestern' : '76,210 rows · yesterday',
        status: paused,
        statusTone: 'neutral',
        progress: 28,
      },
    ],
    listStrategy: { kind: 'pane-scroll', expectedMaximum: 32 },
    referenceLayout: {
      ownerId: 'integration-sync-warehouse',
      states: [
        { sourceId: 'northwind', phase: 'syncing' },
        { sourceId: 'alder', phase: 'healthy' },
        { sourceId: 'cedar', phase: 'healthy' },
        { sourceId: 'meridian', phase: 'failed' },
        { sourceId: 'quarry', phase: 'paused' },
      ],
      labels: { healthy, syncing, failed },
    },
  }
}
