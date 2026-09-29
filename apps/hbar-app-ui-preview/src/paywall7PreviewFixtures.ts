import type {
  Paywall7PreviewRecipient,
  Paywall7PreviewStoreSeed,
  Paywall7PreviewStoreState,
} from './paywall7PreviewStore'

export type Paywall7PreviewLocale = 'en' | 'de' | 'de-long'
export type Paywall7PreviewCapacity = 'source' | 'empty' | 'one' | 'boundary' | 'overflow'

export const PAYWALL7_SOURCE_EVIDENCE = {
  officialUrl: 'https://pro.reactbits.dev/docs/app-ui/paywall/paywall-7',
  liveObservation: {
    observedOn: '2026-09-29',
    previewAvailable: true,
    canvas: { width: 911, height: 560 },
    root: { width: 560, height: 447.25, display: 'block', padding: 0 },
    noteFill: 'draft-changed-locally-only',
    compareAndSendResults: 'not-sampled-request-only',
    currentCaptureProtocolEvidence: false,
  },
  staticCache: {
    cacheId: 'full-static-v10',
    sourceHash: 'faedc1fdcb52ce4544dbba8f9c958c671e20d375f8e74f052caa1150a8531897',
    role: 'authorized-visual-reference-not-current-strict-proof',
  },
  sourceBoundary: {
    observedRecipients: 2,
    maximumRecipients: 'not-tested',
    compareResult: 'not-sampled',
    sendResult: 'not-sampled',
  },
} as const

export interface Paywall7PreviewLabels {
  readonly title: string
  readonly description: string
  readonly requestSectionTitle: string
  readonly requestSectionDescription: string
  readonly recipientsAccessibleName: string
  readonly emptyRecipients: string
  readonly reasonLabel: string
  readonly comparePlans: string
  readonly sendRequest: string
  readonly scaleHint: string
}

export interface Paywall7PreviewContent {
  readonly labels: Paywall7PreviewLabels
  readonly recipients: readonly Paywall7PreviewRecipient[]
  readonly draft: string
  readonly listStrategy: {
    readonly kind: 'content-grown' | 'pane-scroll'
    readonly expectedMaximum: number
  }
  readonly sourceBoundary: {
    readonly observedRecipients: 2
    readonly sourceMaximum: 'not-tested'
    readonly hostContentGrownBoundary: 6
    readonly overflowFixtureCount: 16
    readonly remoteResult: 'typed-request-only'
  }
}

export interface Paywall7PreviewFixture {
  readonly seed: Paywall7PreviewStoreSeed
  readonly contentFor: (state: Paywall7PreviewStoreState) => Paywall7PreviewContent
}

const LABELS: Readonly<Record<Paywall7PreviewLocale, Paywall7PreviewLabels>> = {
  en: {
    title: 'Audit log needs a Scale plan',
    description: 'Northwind is on Pro · you do not manage billing',
    requestSectionTitle: 'Ask an admin to upgrade',
    requestSectionDescription:
      'We will send your note to the people below. They can approve the change without you doing anything else.',
    recipientsAccessibleName: 'Workspace administrators',
    emptyRecipients: 'No workspace administrators are available.',
    reasonLabel: 'Why do you need it?',
    comparePlans: 'Compare plans',
    sendRequest: 'Send request',
    scaleHint: 'Scale adds audit log, SSO and region pinning.',
  },
  de: {
    title: 'Das Audit-Protokoll benötigt einen Scale-Plan',
    description: 'Northwind nutzt Pro · du verwaltest die Abrechnung nicht',
    requestSectionTitle: 'Admin um ein Upgrade bitten',
    requestSectionDescription:
      'Deine Nachricht wird an die unten aufgeführten Personen gesendet. Sie können die Änderung ohne weitere Schritte von dir genehmigen.',
    recipientsAccessibleName: 'Administratoren des Arbeitsbereichs',
    emptyRecipients: 'Keine Administratoren für diesen Arbeitsbereich verfügbar.',
    reasonLabel: 'Wofür benötigst du den Zugriff?',
    comparePlans: 'Pläne vergleichen',
    sendRequest: 'Anfrage senden',
    scaleHint: 'Scale bietet Audit-Protokoll, SSO und regionale Datenhaltung.',
  },
  'de-long': {
    title:
      'Für den Zugriff auf das vollständige Audit-Protokoll dieses Arbeitsbereichs ist ein Scale-Abonnement erforderlich',
    description:
      'Der gemeinsam verwendete Arbeitsbereich Northwind nutzt derzeit Pro. Du kannst die Abrechnung nicht selbst verwalten.',
    requestSectionTitle: 'Die zuständigen Arbeitsbereichsadmins um ein Upgrade bitten',
    requestSectionDescription:
      'Deine ausführliche Begründung wird zusammen mit dieser Anfrage an die unten aufgeführten Personen weitergeleitet. Die zuständigen Personen können die Änderung anschließend ohne weitere Schritte von dir genehmigen.',
    recipientsAccessibleName: 'Alle zuständigen Administratoren des gemeinsam verwendeten Arbeitsbereichs',
    emptyRecipients:
      'Für diesen gemeinsam verwendeten Arbeitsbereich sind derzeit keine zuständigen Administratoren verfügbar.',
    reasonLabel: 'Warum benötigst du für deine Arbeit Zugriff auf das Audit-Protokoll?',
    comparePlans: 'Alle verfügbaren Planfunktionen miteinander vergleichen',
    sendRequest: 'Die Anfrage zum Upgrade an alle zuständigen Administratoren senden',
    scaleHint: 'Der Scale-Plan enthält ein Audit-Protokoll, Single Sign-on und regionale Datenresidenz.',
  },
}

const INITIAL_DRAFT: Readonly<Record<Paywall7PreviewLocale, string>> = {
  en: 'I need audit log access to close out the SOC 2 evidence request.',
  de: 'Ich benötige Zugriff auf das Audit-Protokoll, um die SOC-2-Nachweisanfrage abzuschließen.',
  'de-long':
    'Ich benötige für den Abschluss unserer laufenden SOC-2-Prüfung Zugriff auf das vollständige Audit-Protokoll und muss die angeforderten Nachweise für das externe Audit-Team rechtzeitig zusammenstellen.',
}

function sourceRecipients(locale: Paywall7PreviewLocale): readonly Paywall7PreviewRecipient[] {
  const roles =
    locale === 'en'
      ? ['Workspace owner', 'Billing admin']
      : locale === 'de'
        ? ['Arbeitsbereichsinhaber', 'Abrechnungsadmin']
        : [
            'Verantwortliche Inhaberin des gemeinsam verwendeten Arbeitsbereichs',
            'Zuständiger Administrator für Abrechnung und Planverwaltung',
          ]

  return [
    { id: 'priya-nandakumar', initials: 'PN', name: 'Priya Nandakumar', role: roles[0] ?? '' },
    { id: 'marcus-bell', initials: 'MB', name: 'Marcus Bell', role: roles[1] ?? '' },
  ]
}

function additionalRecipients(locale: Paywall7PreviewLocale, count: number): readonly Paywall7PreviewRecipient[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `additional-admin-${index + 1}`,
    initials: `A${index + 1}`,
    name: locale === 'en' ? `Additional admin ${index + 1}` : `Zusätzlicher Admin ${index + 1}`,
    role: locale === 'en' ? 'Workspace delegate' : 'Arbeitsbereichsvertretung',
  }))
}

export function createPaywall7PreviewFixture(
  locale: Paywall7PreviewLocale = 'en',
  capacity: Paywall7PreviewCapacity = 'source',
): Paywall7PreviewFixture {
  const source = sourceRecipients(locale)
  const extraCount = capacity === 'boundary' ? 4 : capacity === 'overflow' ? 14 : 0
  const recipients =
    capacity === 'empty'
      ? []
      : capacity === 'one'
        ? source.slice(0, 1)
        : [...source, ...additionalRecipients(locale, extraCount)]
  const hostContentGrownBoundary = 6

  return {
    seed: { recipients, initialDraft: INITIAL_DRAFT[locale] },
    contentFor: (state) => ({
      labels: LABELS[locale],
      recipients: state.recipients,
      draft: state.draft,
      listStrategy: {
        kind: capacity === 'overflow' ? 'pane-scroll' : 'content-grown',
        expectedMaximum: hostContentGrownBoundary,
      },
      sourceBoundary: {
        observedRecipients: 2,
        sourceMaximum: 'not-tested',
        hostContentGrownBoundary,
        overflowFixtureCount: 16,
        remoteResult: 'typed-request-only',
      },
    }),
  }
}
