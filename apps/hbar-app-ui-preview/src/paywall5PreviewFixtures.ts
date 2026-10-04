import type { Paywall5PreviewRow, Paywall5PreviewStoreSeed, Paywall5PreviewStoreState } from './paywall5PreviewStore'

export type Paywall5PreviewLocale = 'en' | 'de' | 'de-long'
export type Paywall5PreviewCapacity = 'source' | 'empty' | 'one' | 'boundary' | 'overflow'

export const PAYWALL5_SOURCE_EVIDENCE = {
  officialUrl: 'https://pro.reactbits.dev/docs/app-ui/paywall/paywall-5',
  liveObservation: {
    observedOn: '2026-09-29',
    previewAvailable: true,
    themesObserved: ['light'],
    canvas: { width: 911, height: 560 },
    root: { width: 560, height: 517.75 },
    cardPadding: 24,
    retainedRows: 4,
    paymentIconTier: 'md',
    changeClick: 'no-visible-in-frame-result',
    reactivateResult: 'not-sampled',
    currentCaptureProtocolEvidence: false,
  },
  staticCache: { cacheId: 'full-static-v10', schemaVersion: 1, role: 'authorized-visual-reference-not-current-strict-proof' },
} as const

export interface Paywall5PreviewLabels {
  readonly eyebrow: string
  readonly title: string
  readonly description: string
  readonly retainedData: string
  readonly emptyRows: string
  readonly paymentTitle: string
  readonly paymentDescription: string
  readonly change: string
  readonly reactivate: string
  readonly renewalNote: string
}

export interface Paywall5PreviewContent {
  readonly labels: Paywall5PreviewLabels
  readonly rows: readonly Paywall5PreviewRow[]
  readonly listStrategy: { readonly kind: 'content-grown' | 'pane-scroll'; readonly expectedMaximum: number }
  readonly sourceBoundary: {
    readonly observedRetainedRows: 4
    readonly sourceMaximum: 'not-tested'
    readonly hostContentGrownBoundary: 8
    readonly remoteResult: 'typed-request-only'
  }
}

export interface Paywall5PreviewFixture {
  readonly seed: Paywall5PreviewStoreSeed
  readonly contentFor: (state: Paywall5PreviewStoreState) => Paywall5PreviewContent
}

const LABELS: Readonly<Record<Paywall5PreviewLocale, Paywall5PreviewLabels>> = {
  en: {
    eyebrow: 'Trial ended', title: 'Your 14 days with Pro are up',
    description: 'Northwind Analytics is in read-only mode. Reactivate and everything picks up exactly where it stopped, including the exports that were mid-schedule.',
    retainedData: 'Retained workspace data', emptyRows: 'No retained-data summary is available.',
    paymentTitle: 'Card ending 4471', paymentDescription: 'Expires 08/28 · billed to Northwind Ltd',
    change: 'Change', reactivate: 'Reactivate Pro: $168 / yr',
    renewalNote: 'Renews yearly. Cancel any time before the renewal date.',
  },
  de: {
    eyebrow: 'Testphase beendet', title: 'Deine 14 Tage mit Pro sind vorbei',
    description: 'Northwind Analytics ist schreibgeschützt. Nach der Reaktivierung setzt alles genau dort fort, wo es gestoppt wurde, einschließlich der geplanten Exporte.',
    retainedData: 'Erhaltene Daten des Arbeitsbereichs', emptyRows: 'Keine Übersicht der erhaltenen Daten verfügbar.',
    paymentTitle: 'Karte mit Endziffern 4471', paymentDescription: 'Gültig bis 08/28 · Rechnung an Northwind Ltd',
    change: 'Ändern', reactivate: 'Pro reaktivieren: 168 $ / Jahr',
    renewalNote: 'Jährliche Verlängerung. Kündigung jederzeit vor dem Verlängerungsdatum möglich.',
  },
  'de-long': {
    eyebrow: 'Die kostenlose Testphase wurde vollständig beendet',
    title: 'Deine vierzehntägige Testphase für den Pro-Plan des gemeinsam verwendeten Arbeitsbereichs ist jetzt vorbei',
    description: 'Der gemeinsam verwendete Arbeitsbereich Northwind Analytics befindet sich derzeit im schreibgeschützten Modus. Nach einer bestätigten Reaktivierung kann die Zusammenarbeit wieder genau dort fortgesetzt werden, wo sie unterbrochen wurde, einschließlich der geplanten Exporte.',
    retainedData: 'Vollständige Übersicht über die im gemeinsam verwendeten Arbeitsbereich erhaltenen Daten',
    emptyRows: 'Für diesen gemeinsam verwendeten Arbeitsbereich ist derzeit keine Übersicht der erhaltenen Daten verfügbar.',
    paymentTitle: 'Gespeicherte Zahlungskarte mit den letzten vier Endziffern 4471',
    paymentDescription: 'Die gespeicherte Zahlungskarte ist bis August 2028 gültig und wird für Rechnungen an Northwind Ltd verwendet',
    change: 'Die gespeicherte Zahlungsmethode dieses Arbeitsbereichs ändern',
    reactivate: 'Den Pro-Plan dieses gemeinsam verwendeten Arbeitsbereichs für 168 $ pro Jahr reaktivieren',
    renewalNote: 'Die Abrechnung verlängert sich jedes Jahr. Eine Kündigung ist jederzeit vor dem jeweiligen Verlängerungsdatum möglich.',
  },
}

const ROWS: Readonly<Record<Paywall5PreviewLocale, readonly Paywall5PreviewRow[]>> = {
  en: [
    { id: 'workspaces', label: 'Workspaces', value: '4 kept, read-only' },
    { id: 'saved-views', label: 'Saved views', value: '26 kept' },
    { id: 'scheduled-exports', label: 'Scheduled exports', value: 'Paused' },
    { id: 'team-members', label: 'Team members', value: '7 signed out' },
  ],
  de: [
    { id: 'workspaces', label: 'Arbeitsbereiche', value: '4 erhalten, schreibgeschützt' },
    { id: 'saved-views', label: 'Gespeicherte Ansichten', value: '26 erhalten' },
    { id: 'scheduled-exports', label: 'Geplante Exporte', value: 'Pausiert' },
    { id: 'team-members', label: 'Teammitglieder', value: '7 abgemeldet' },
  ],
  'de-long': [
    { id: 'workspaces', label: 'Alle gemeinsam verwendeten Arbeitsbereiche', value: 'Vier vollständig erhaltene, derzeit schreibgeschützte Arbeitsbereiche' },
    { id: 'saved-views', label: 'Sämtliche gespeicherten Datenansichten des Arbeitsbereichs', value: 'Sechsundzwanzig vollständig erhaltene Ansichten' },
    { id: 'scheduled-exports', label: 'Automatisch ausgeführte und geplante Datenexporte', value: 'Bis zur bestätigten Reaktivierung pausiert' },
    { id: 'team-members', label: 'Eingeladene und zugeordnete Mitglieder des verteilten Teams', value: 'Sieben derzeit abgemeldete Teammitglieder' },
  ],
}

export function createPaywall5PreviewFixture(locale: Paywall5PreviewLocale = 'en', capacity: Paywall5PreviewCapacity = 'source'): Paywall5PreviewFixture {
  const sourceRows = ROWS[locale]
  const extraRows = Array.from({ length: capacity === 'overflow' ? 14 : 4 }, (_, index) => ({
    id: `additional-${index + 1}`, label: `${sourceRows[0]?.label ?? ''} ${index + 1}`, value: sourceRows[0]?.value ?? '',
  }))
  const rows = capacity === 'empty' ? [] : capacity === 'one' ? sourceRows.slice(0, 1)
    : capacity === 'boundary' || capacity === 'overflow' ? [...sourceRows, ...extraRows] : sourceRows
  return {
    seed: { rows },
    contentFor: (state) => ({
      labels: LABELS[locale], rows: state.rows,
      listStrategy: { kind: capacity === 'overflow' ? 'pane-scroll' : 'content-grown', expectedMaximum: 8 },
      sourceBoundary: { observedRetainedRows: 4, sourceMaximum: 'not-tested', hostContentGrownBoundary: 8, remoteResult: 'typed-request-only' },
    }),
  }
}
