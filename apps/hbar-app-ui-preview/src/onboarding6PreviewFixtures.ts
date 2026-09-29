import {
  ONBOARDING6_SUMMARY_IDS,
  type Onboarding6PreviewStoreSeed,
  type Onboarding6PreviewStoreState,
  type Onboarding6SummaryId,
} from './onboarding6PreviewStore'

export type Onboarding6PreviewLocale = 'en' | 'de' | 'de-long'

export const ONBOARDING6_SOURCE_EVIDENCE = {
  officialUrl: 'https://pro.reactbits.dev/docs/app-ui/onboarding/onboarding-6',
  docsDescription: 'Setup-complete summary listing what was configured, with the two obvious next actions.',
  staticCache: {
    cacheId: 'full-static-v10',
    schemaVersion: 1,
    generatedAt: '2026-09-23T04:28:30.280Z',
    sourceHash: '93ab87124b7b37a54b3787fb2dd7095a4216352a54de126546fe9e6b7b02628a',
    sourceDirectoryHash: '4dc4e06f386ae3de7e396ec305a6394fed8645b36d8af2d4d72b90ee4fa6bcb5',
    sourceStatus: 200,
    themes: ['light', 'dark'],
    viewports: ['desktop', 'tablet', 'mobile', 'stress'],
    viewportSizes: {
      desktop: { width: 1440, height: 900 },
      tablet: { width: 1024, height: 768 },
      mobile: { width: 390, height: 844 },
      stress: { width: 320, height: 720 },
    },
    rootSizes: {
      desktop: { width: 420, height: 488 },
      tablet: { width: 420, height: 488 },
      mobile: { width: 308, height: 488 },
      stress: { width: 238, height: 525 },
    },
    summaryRowCount: 4,
    controlCount: 2,
    bodyTextLength: 281,
    truncatedTextCounts: { desktop: 0, tablet: 0, mobile: 0, stress: 0 },
    horizontalOverflow: false,
    summaryFlow: 'four-term-definition-pairs-in-normal-content-flow',
    scrollOwner: 'not-captured',
    capacityEvidence: 'four-rows-observed-no-maximum-tested',
  },
  sameTargetHashInteractionCache: {
    cacheId: 'full-interactions-v4',
    schemaVersion: 1,
    sourceInventoryGeneratedAt: '2026-09-23T02:45:43.955Z',
    interactionReportGeneratedAt: '2026-09-23T03:53:20.579Z',
    sourceHash: '93ab87124b7b37a54b3787fb2dd7095a4216352a54de126546fe9e6b7b02628a',
    sourceDirectoryHash: '541173c8626322c7e7f1ee394249d862197bd60648bad30e3f37d42a60ce809a',
    coverage: 'semantic-shape-representatives',
    themes: ['dark'],
    viewports: ['desktop', 'mobile'],
    openWorkspaceSample: {
      actions: ['hover', 'focus', 'click', 'press-enter', 'press-space'],
      result: 'source-no-op',
      sourceChanged: false,
      localChanged: false,
      axBeforeAfter: 'identical-in-captured-click-snapshots',
    },
    targetSourceHashMatchesStatic: true,
    sourceDirectoryHashMatchesStatic: false,
    localImplementationHash: 'not-recorded-in-interaction-report',
    explicitInteractionProtocol: 'not-recorded',
    unverified: {
      takeTourAction: 'not-sampled',
      openWorkspaceNavigationOutsideFrame: 'not-observed',
      inboxDelivery: 'not-observed',
      scrollOwner: 'not-captured',
    },
  },
  olderStaticCache: {
    cacheId: 'full-static-v9',
    sourceHash: '23f66e8cd1b4f5ed947b79b79fc3a3854df255176dcb1f64668049d9d02da5b2',
    matchesStaticV10AndInteractionV4: false,
  },
} as const

export interface Onboarding6PreviewLabels {
  readonly title: string
  readonly description: string
  readonly summaryLabels: Readonly<Record<Onboarding6SummaryId, string>>
  readonly openWorkspace: string
  readonly takeTour: string
  readonly inboxNote: string
}

export interface Onboarding6PreviewSummaryRow {
  readonly id: Onboarding6SummaryId
  readonly label: string
  readonly value: string
}

export interface Onboarding6PreviewCompletionMark {
  readonly kind: 'checkmark'
  readonly semanticRole: 'decorative-success'
  readonly ariaHidden: true
  readonly accessibleName: null
}

export interface Onboarding6PreviewContent {
  readonly locale: Onboarding6PreviewLocale
  readonly labels: Onboarding6PreviewLabels
  readonly summaryRows: readonly Onboarding6PreviewSummaryRow[]
  readonly completionMark: Onboarding6PreviewCompletionMark
  readonly summaryContract: {
    readonly observedRowCount: 4
    readonly maximumRowCount: 'not-observed'
    readonly layout: 'content-grown-normal-flow'
    readonly sourceHorizontalOverflow: false
    readonly sourceStressTruncatedTextCount: 0
    readonly sourceScrollOwner: 'not-captured'
  }
}

export interface Onboarding6PreviewFixture {
  readonly seed: Onboarding6PreviewStoreSeed
  readonly contentFor: (state: Onboarding6PreviewStoreState) => Onboarding6PreviewContent
}

const LABELS: Readonly<Record<Onboarding6PreviewLocale, Onboarding6PreviewLabels>> = {
  en: {
    title: 'Your workspace is ready',
    description: "We've set everything up from your answers. All of it is editable from workspace settings.",
    summaryLabels: {
      workspace: 'Workspace',
      'members-invited': 'Members invited',
      'starter-template': 'Starter template',
      plan: 'Plan',
    },
    openWorkspace: 'Open workspace',
    takeTour: 'Take the two-minute tour',
    inboxNote: 'A copy of your setup summary is in your inbox.',
  },
  de: {
    title: 'Dein Arbeitsbereich ist bereit',
    description:
      'Wir haben alles anhand deiner Antworten eingerichtet. Alles lässt sich in den Arbeitsbereichseinstellungen bearbeiten.',
    summaryLabels: {
      workspace: 'Arbeitsbereich',
      'members-invited': 'Eingeladene Mitglieder',
      'starter-template': 'Startvorlage',
      plan: 'Tarif',
    },
    openWorkspace: 'Arbeitsbereich öffnen',
    takeTour: 'Die zweiminütige Tour starten',
    inboxNote: 'Eine Kopie deiner Einrichtungszusammenfassung liegt in deinem Posteingang.',
  },
  'de-long': {
    title:
      'Dein gemeinsamer Arbeitsbereich für das Team ist jetzt vollständig eingerichtet und bereit für die Zusammenarbeit',
    description:
      'Wir haben anhand deiner bisherigen Antworten alle Einstellungen vorbereitet. Jede einzelne davon kann später in den Einstellungen des gemeinsamen Arbeitsbereichs bearbeitet werden.',
    summaryLabels: {
      workspace: 'Name des gemeinsam verwendeten Arbeitsbereichs',
      'members-invited': 'Anzahl der bisher zum Arbeitsbereich eingeladenen Teammitglieder',
      'starter-template': 'Vorlage für den Einstieg in die gemeinsame Sprintplanung',
      plan: 'Aktueller Tarif und verbleibende Dauer der Team-Testphase',
    },
    openWorkspace: 'Den vollständig eingerichteten Arbeitsbereich jetzt öffnen',
    takeTour: 'Die ausführliche zweiminütige Einführungstour starten',
    inboxNote:
      'Eine vollständige Kopie deiner Einrichtungszusammenfassung wurde an den Posteingang deines Benutzerkontos gesendet.',
  },
}

const SUMMARY_VALUES: Readonly<Record<Onboarding6PreviewLocale, Readonly<Record<Onboarding6SummaryId, string>>>> = {
  en: {
    workspace: 'Northwind',
    'members-invited': '4',
    'starter-template': 'Sprint board',
    plan: 'Team trial, 14 days',
  },
  de: {
    workspace: 'Northwind',
    'members-invited': '4',
    'starter-template': 'Sprintboard',
    plan: 'Team-Testphase, 14 Tage',
  },
  'de-long': {
    workspace: 'Northwind Zusammenarbeit für international verteilte Produktteams',
    'members-invited': '4',
    'starter-template': 'Sprintplanungsboard mit Meilensteinen für mehrere Projektteams',
    plan: 'Team-Testphase für vierzehn Tage mit gemeinsamem Zugriff auf alle Arbeitsbereiche',
  },
}

const DECORATIVE_COMPLETION_MARK: Onboarding6PreviewCompletionMark = {
  kind: 'checkmark',
  semanticRole: 'decorative-success',
  ariaHidden: true,
  accessibleName: null,
}

export function createOnboarding6PreviewFixture(locale: Onboarding6PreviewLocale = 'en'): Onboarding6PreviewFixture {
  const seed: Onboarding6PreviewStoreSeed = { summaryValues: SUMMARY_VALUES[locale] }

  return {
    seed,
    contentFor: (state) => ({
      locale,
      labels: LABELS[locale],
      summaryRows: ONBOARDING6_SUMMARY_IDS.map((id) => ({
        id,
        label: LABELS[locale].summaryLabels[id],
        value: state.summaryValues[id],
      })),
      completionMark: DECORATIVE_COMPLETION_MARK,
      summaryContract: {
        observedRowCount: 4,
        maximumRowCount: 'not-observed',
        layout: 'content-grown-normal-flow',
        sourceHorizontalOverflow: false,
        sourceStressTruncatedTextCount: 0,
        sourceScrollOwner: 'not-captured',
      },
    }),
  }
}
