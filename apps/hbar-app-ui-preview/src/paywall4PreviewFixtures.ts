import type { Paywall4PreviewMeter, Paywall4PreviewStoreSeed, Paywall4PreviewStoreState } from './paywall4PreviewStore'

export type Paywall4PreviewLocale = 'en' | 'de' | 'de-long'
export type Paywall4PreviewCapacity = 'source' | 'empty' | 'one' | 'boundary' | 'overflow'

export const PAYWALL4_SOURCE_EVIDENCE = {
  officialUrl: 'https://pro.reactbits.dev/docs/app-ui/paywall/paywall-4',
  liveObservation: {
    observedOn: '2026-09-29',
    previewAvailable: true,
    themesObserved: ['light'],
    canvasWidths: [911, 320],
    desktopRoot: { width: 620, height: 426.25 },
    narrowRoot: { width: 257, height: 530.5 },
    nativeScrollbarReducesNarrowWidth: true,
    scrollOwner: 'preview-stage-overflow-auto',
    progressRoles: 0,
    meterCount: 3,
    topUpClick: 'no-visible-in-frame-result',
    upgradeResult: 'not-sampled',
    currentCaptureProtocolEvidence: false,
  },
  staticCache: {
    cacheId: 'full-static-v10',
    schemaVersion: 1,
    role: 'authorized-visual-reference-not-current-strict-proof',
  },
} as const

export interface Paywall4PreviewLabels {
  readonly title: string
  readonly description: string
  readonly meterList: string
  readonly emptyMeters: string
  readonly proTitle: string
  readonly proDescription: string
  readonly topUp: string
  readonly upgrade: string
}

export interface Paywall4PreviewContent {
  readonly labels: Paywall4PreviewLabels
  readonly meters: readonly Paywall4PreviewMeter[]
  readonly listStrategy: { readonly kind: 'content-grown' | 'pane-scroll'; readonly expectedMaximum: number }
  readonly sourceBoundary: {
    readonly observedMeterCount: 3
    readonly sourceMaximum: 'not-tested'
    readonly hostContentGrownBoundary: 6
    readonly remoteResult: 'typed-request-only'
  }
}

export interface Paywall4PreviewFixture {
  readonly seed: Paywall4PreviewStoreSeed
  readonly contentFor: (state: Paywall4PreviewStoreState) => Paywall4PreviewContent
}

const LABELS: Readonly<Record<Paywall4PreviewLocale, Paywall4PreviewLabels>> = {
  en: {
    title: 'You have hit the Starter limit',
    description: 'Ingestion is paused until 1 April, or until you raise the limit. Nothing has been deleted, and queries on existing data still work.',
    meterList: 'Workspace usage quotas',
    emptyMeters: 'No usage quotas are available.',
    proTitle: 'Pro raises every limit tenfold',
    proDescription: '500k requests, 20M rows, unlimited sources. $24 per seat / mo.',
    topUp: 'Buy a one-off top-up',
    upgrade: 'Upgrade to Pro',
  },
  de: {
    title: 'Du hast das Starter-Limit erreicht',
    description: 'Die Datenaufnahme ist bis zum 1. April pausiert, sofern du das Limit nicht erhöhst. Es wurde nichts gelöscht und Abfragen bestehender Daten funktionieren weiterhin.',
    meterList: 'Nutzungskontingente des Arbeitsbereichs',
    emptyMeters: 'Keine Nutzungskontingente verfügbar.',
    proTitle: 'Pro erhöht jedes Limit um das Zehnfache',
    proDescription: '500.000 Anfragen, 20 Millionen Zeilen, unbegrenzte Quellen. 24 $ pro Sitzplatz und Monat.',
    topUp: 'Einmaliges Zusatzkontingent kaufen',
    upgrade: 'Auf Pro upgraden',
  },
  'de-long': {
    title: 'Du hast die derzeit verfügbaren Nutzungslimits deines gemeinsam verwendeten Starter-Arbeitsbereichs erreicht',
    description: 'Die Aufnahme zusätzlicher Daten in deinen gemeinsam verwendeten Arbeitsbereich bleibt bis zum 1. April pausiert, sofern du das verfügbare Kontingent nicht vorher erhöhst. Alle vorhandenen Daten bleiben erhalten und können weiterhin abgefragt werden.',
    meterList: 'Vollständige Nutzungskontingente des gemeinsam verwendeten Arbeitsbereichs',
    emptyMeters: 'Für diesen gemeinsam verwendeten Arbeitsbereich sind derzeit keine Nutzungskontingente verfügbar.',
    proTitle: 'Mit dem Pro-Plan erhöht sich jedes verfügbare Nutzungslimit um das Zehnfache',
    proDescription: 'Der Pro-Plan enthält 500.000 API-Anfragen, 20 Millionen verarbeitete Datenzeilen und eine unbegrenzte Anzahl angeschlossener Datenquellen für 24 $ pro Sitzplatz und Monat.',
    topUp: 'Ein zusätzliches einmaliges Nutzungskontingent für diesen Arbeitsbereich kaufen',
    upgrade: 'Diesen gemeinsam verwendeten Arbeitsbereich auf den Pro-Plan upgraden',
  },
}

const METER_LABELS: Readonly<Record<Paywall4PreviewLocale, readonly [string, string, string]>> = {
  en: ['API requests', 'Rows processed', 'Connected sources'],
  de: ['API-Anfragen', 'Verarbeitete Zeilen', 'Angeschlossene Quellen'],
  'de-long': ['In diesem Abrechnungszeitraum verarbeitete API-Anfragen', 'Vollständig verarbeitete und im Arbeitsbereich gespeicherte Datenzeilen', 'Mit dem gemeinsam verwendeten Arbeitsbereich verbundene Datenquellen'],
}

export function createPaywall4PreviewFixture(
  locale: Paywall4PreviewLocale = 'en',
  capacity: Paywall4PreviewCapacity = 'source',
): Paywall4PreviewFixture {
  const names = METER_LABELS[locale]
  const sourceMeters: readonly Paywall4PreviewMeter[] = [
    { id: 'api-requests', label: names[0], usedText: '50k', limitText: ' / 50k', fraction: 1 },
    { id: 'rows-processed', label: names[1], usedText: '1.84M', limitText: ' / 2.00M', fraction: 0.92 },
    { id: 'connected-sources', label: names[2], usedText: '3', limitText: ' / 3', fraction: 1 },
  ]
  const extraMeters = Array.from({ length: capacity === 'overflow' ? 14 : 3 }, (_, index) => ({
    id: `additional-${index + 1}`,
    label: `${names[0]} ${index + 1}`,
    usedText: String(index + 1),
    limitText: ' / 100',
    fraction: (index + 1) / 100,
  }))
  const meters = capacity === 'empty' ? [] : capacity === 'one' ? sourceMeters.slice(0, 1)
    : capacity === 'boundary' || capacity === 'overflow' ? [...sourceMeters, ...extraMeters] : sourceMeters
  return {
    seed: { meters },
    contentFor: (state) => ({
      labels: LABELS[locale],
      meters: state.meters,
      listStrategy: { kind: capacity === 'overflow' ? 'pane-scroll' : 'content-grown', expectedMaximum: 6 },
      sourceBoundary: {
        observedMeterCount: 3,
        sourceMaximum: 'not-tested',
        hostContentGrownBoundary: 6,
        remoteResult: 'typed-request-only',
      },
    }),
  }
}
