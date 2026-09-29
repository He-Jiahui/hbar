import type { Paywall6Assurance, Paywall6PreviewStoreSeed, Paywall6PreviewStoreState, Paywall6ReadSegment } from './paywall6PreviewStore'

export type Paywall6PreviewLocale = 'en' | 'de' | 'de-long'
export type Paywall6PreviewCapacity = 'source' | 'empty' | 'one' | 'boundary' | 'overflow'

export const PAYWALL6_SOURCE_EVIDENCE = {
  officialUrl: 'https://pro.reactbits.dev/docs/app-ui/paywall/paywall-6',
  liveObservation: {
    observedOn: '2026-09-29', previewAvailable: true, themesObserved: ['light'],
    canvas: { width: 911, height: 400 }, root: { width: 520, height: 254.25 },
    counterRole: 'img', counterSegmentCount: 3, counterHeight: 6, assuranceCount: 3,
    form: { emailType: 'email', emailRequired: false, keepReadingType: 'submit', signInType: 'button' },
    emailDraft: 'native-field-fill-observed-without-submit',
    keepReadingAndSignInResults: 'not-sampled', currentCaptureProtocolEvidence: false,
  },
  staticCache: { cacheId: 'full-static-v10', schemaVersion: 1, role: 'authorized-visual-reference-not-current-strict-proof' },
} as const

export interface Paywall6PreviewLabels {
  readonly counterImage: string
  readonly eyebrow: string
  readonly title: string
  readonly description: string
  readonly emailLabel: string
  readonly emailPlaceholder: string
  readonly keepReading: string
  readonly alreadySubscribed: string
  readonly signIn: string
  readonly assuranceList: string
  readonly emptyAssurances: string
}

export interface Paywall6PreviewContent {
  readonly labels: Paywall6PreviewLabels
  readonly emailDraft: string
  readonly segments: readonly Paywall6ReadSegment[]
  readonly assurances: readonly Paywall6Assurance[]
  readonly listStrategy: { readonly kind: 'content-grown' | 'pane-scroll'; readonly expectedMaximum: number }
  readonly sourceBoundary: {
    readonly observedSegments: 3
    readonly observedAssurances: 3
    readonly sourceMaximum: 'not-tested'
    readonly hostAssuranceBoundary: 6
    readonly submitResult: 'typed-request-only'
  }
}

export interface Paywall6PreviewFixture {
  readonly seed: Paywall6PreviewStoreSeed
  readonly contentFor: (state: Paywall6PreviewStoreState) => Paywall6PreviewContent
}

const LABELS: Readonly<Record<Paywall6PreviewLocale, Paywall6PreviewLabels>> = {
  en: {
    counterImage: '3 of 3 free articles read this month', eyebrow: '3 of 3 free reads used',
    title: 'That was your last free article this month',
    description: 'Your counter resets on 1 April. Leave an address and we will send the rest of this piece, plus one long read each Thursday.',
    emailLabel: 'Email address', emailPlaceholder: 'you@company.com', keepReading: 'Keep reading',
    alreadySubscribed: 'Already subscribed?', signIn: 'Sign in',
    assuranceList: 'Email reading assurances', emptyAssurances: 'No additional email-reading information is available.',
  },
  de: {
    counterImage: '3 von 3 kostenlosen Artikeln in diesem Monat gelesen', eyebrow: '3 von 3 kostenlosen Artikeln genutzt',
    title: 'Das war dein letzter kostenloser Artikel in diesem Monat',
    description: 'Dein Zähler wird am 1. April zurückgesetzt. Hinterlasse eine Adresse, damit wir dir den Rest dieses Artikels und jeden Donnerstag einen ausführlichen Beitrag senden können.',
    emailLabel: 'E-Mail-Adresse', emailPlaceholder: 'du@unternehmen.de', keepReading: 'Weiterlesen',
    alreadySubscribed: 'Bereits abonniert?', signIn: 'Anmelden',
    assuranceList: 'Hinweise zum Lesen per E-Mail', emptyAssurances: 'Keine weiteren Hinweise zum Lesen per E-Mail verfügbar.',
  },
  'de-long': {
    counterImage: 'Drei von insgesamt drei verfügbaren kostenlosen Artikeln wurden in diesem Kalendermonat vollständig gelesen',
    eyebrow: 'Alle drei verfügbaren kostenlosen Artikel für diesen Kalendermonat wurden genutzt',
    title: 'Das war der letzte kostenlos verfügbare ausführliche Artikel für diesen Kalendermonat',
    description: 'Dein persönlicher Lesezähler wird am 1. April zurückgesetzt. Hinterlasse eine E-Mail-Adresse, damit dir der verbleibende Teil dieses Artikels sowie jeden Donnerstag ein zusätzlicher ausführlicher Beitrag zugesendet werden können.',
    emailLabel: 'Vollständige E-Mail-Adresse für die Zustellung ausführlicher Artikel',
    emailPlaceholder: 'deine-adresse@dein-unternehmen.de', keepReading: 'Mit dem ausführlichen Artikel per E-Mail weiterlesen',
    alreadySubscribed: 'Hast du bereits ein aktives Abonnement für diese Veröffentlichung?',
    signIn: 'Mit deinem bestehenden Abonnement anmelden',
    assuranceList: 'Vollständige Hinweise zur Zustellung und zum Lesen ausführlicher Artikel per E-Mail',
    emptyAssurances: 'Für die Zustellung ausführlicher Artikel per E-Mail sind derzeit keine zusätzlichen Hinweise verfügbar.',
  },
}

const ASSURANCES: Readonly<Record<Paywall6PreviewLocale, readonly string[]>> = {
  en: ['No card required', 'One email each Thursday', 'Unsubscribe in a click'],
  de: ['Keine Karte erforderlich', 'Eine E-Mail jeden Donnerstag', 'Mit einem Klick abmelden'],
  'de-long': ['Für die Zustellung ist keine gespeicherte Zahlungskarte erforderlich',
    'Du erhältst jeden Donnerstag genau eine zusätzliche E-Mail mit einem ausführlichen Beitrag',
    'Die weitere Zustellung lässt sich jederzeit mit einem einzelnen Klick beenden'],
}

export function createPaywall6PreviewFixture(locale: Paywall6PreviewLocale = 'en', capacity: Paywall6PreviewCapacity = 'source'): Paywall6PreviewFixture {
  const sourceAssurances = ASSURANCES[locale].map((text, index) => ({ id: `assurance-${index + 1}`, text }))
  const extra = Array.from({ length: capacity === 'overflow' ? 14 : 3 }, (_, index) => ({
    id: `additional-${index + 1}`, text: `${ASSURANCES[locale][0] ?? ''} ${index + 1}`,
  }))
  const assurances = capacity === 'empty' ? [] : capacity === 'one' ? sourceAssurances.slice(0, 1)
    : capacity === 'boundary' || capacity === 'overflow' ? [...sourceAssurances, ...extra] : sourceAssurances
  return {
    seed: { emailDraft: '', segments: [1, 2, 3].map((number) => ({ id: `read-${number}`, used: true })), assurances },
    contentFor: (state) => ({ labels: LABELS[locale], emailDraft: state.emailDraft,
      segments: state.segments, assurances: state.assurances,
      listStrategy: { kind: capacity === 'overflow' ? 'pane-scroll' : 'content-grown', expectedMaximum: 6 },
      sourceBoundary: { observedSegments: 3, observedAssurances: 3, sourceMaximum: 'not-tested', hostAssuranceBoundary: 6, submitResult: 'typed-request-only' },
    }),
  }
}
