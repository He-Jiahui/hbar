import {
  ONBOARDING7_REGION_IDS,
  type Onboarding7PreviewStoreSeed,
  type Onboarding7PreviewStoreState,
  type Onboarding7RegionId,
} from './onboarding7PreviewStore'

export type Onboarding7PreviewLocale = 'en' | 'de' | 'de-long'

export const ONBOARDING7_SOURCE_EVIDENCE = {
  officialUrl: 'https://pro.reactbits.dev/docs/app-ui/onboarding/onboarding-7',
  staticCache: {
    cacheId: 'full-static-v10',
    schemaVersion: 1,
    generatedAt: '2026-09-23T04:28:30.280Z',
    sourceHash: 'c769fb52bac854061e34445b9722cc24da504e6c6561b21d7b40eda062a5888d',
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
      desktop: { width: 440, height: 498 },
      tablet: { width: 440, height: 498 },
      mobile: { width: 308, height: 533 },
      stress: { width: 238, height: 565 },
    },
    formAxRoot: 'form',
    controlsPerCapture: 6,
    bodyTextLength: 373,
    truncatedTextCount: 0,
    horizontalOverflow: false,
    contentLayout: 'form-content-grown-in-normal-flow',
    scrollOwner: 'not-captured',
    stepperScope: {
      contextImageVisible: true,
      formAxRootIncludesStepper: false,
      status: 'scope-ambiguous',
      contextLabels: ['Account', 'Workspace', 'Team', 'Finish'],
      contextCurrentStepId: 'workspace',
    },
  },
  sameTargetHashInteractionCache: {
    cacheId: 'full-interactions-v4',
    schemaVersion: 1,
    sourceInventoryGeneratedAt: '2026-09-23T02:45:43.955Z',
    interactionReportGeneratedAt: '2026-09-23T03:53:20.579Z',
    sourceHash: 'c769fb52bac854061e34445b9722cc24da504e6c6561b21d7b40eda062a5888d',
    sourceDirectoryHash: '541173c8626322c7e7f1ee394249d862197bd60648bad30e3f37d42a60ce809a',
    targetSourceHashMatchesStatic: true,
    sourceDirectoryHashMatchesStatic: false,
    interactionReportHasImplementationHash: false,
    interactionReportHasExplicitProtocol: false,
    coverage: 'semantic-shape-representatives',
    themes: ['dark'],
    viewports: ['desktop', 'mobile'],
    selectedSamples: {
      workspaceNameFill: {
        controlIndex: 0,
        before: 'Northwind',
        after: 'audit sample',
        sourceAxChanged: true,
        reportSummary: 'source-no-op',
      },
      dataRegionSelection: {
        controlIndex: 2,
        beforeSelectedId: 'eu-central',
        afterSelectedId: 'us-east',
        sourceAxChanged: true,
        reportSummary: 'source-no-op',
      },
      privateWorkspaceToggle: {
        controlIndex: 3,
        beforeChecked: true,
        afterChecked: false,
        sourceAxChanged: true,
        reportSummary: 'source-no-op',
      },
    },
    unverified: {
      slugEdit: 'not-sampled',
      derivedUrlAfterSlugEdit: 'not-observed',
      backNavigation: 'not-verified',
      continueOrWorkspaceCreationResult: 'not-verified',
    },
  },
  olderStaticCache: {
    cacheId: 'full-static-v9',
    sourceHash: '2d8cdfd353476a3cdbb9a07e69bb9fe1802db630e31e61b29beccfaaf9df37b8',
    matchesStaticV10AndInteractionV4: false,
  },
} as const

export interface Onboarding7PreviewLabels {
  readonly title: string
  readonly description: string
  readonly workspaceName: string
  readonly workspaceNamePlaceholder: string
  readonly workspaceUrl: string
  readonly workspaceUrlPlaceholder: string
  readonly memberReachHint: string
  readonly dataRegion: string
  readonly regionPermanentHint: string
  readonly privateWorkspace: string
  readonly privateWorkspaceDescription: string
  readonly back: string
  readonly continue: string
}

export interface Onboarding7PreviewRegionOption {
  readonly id: Onboarding7RegionId
  readonly label: string
}

export interface Onboarding7PreviewContent {
  readonly locale: Onboarding7PreviewLocale
  readonly labels: Onboarding7PreviewLabels
  readonly workspaceName: string
  readonly slug: string
  readonly urlPrefix: string
  readonly regionId: Onboarding7RegionId
  readonly regionOptions: readonly Onboarding7PreviewRegionOption[]
  readonly privateWorkspace: boolean
  readonly sourceBoundary: {
    readonly regionCountObserved: 3
    readonly maximumRegionCount: 'not-tested'
    readonly contentLayout: 'content-grown-normal-flow'
    readonly scrollOwner: 'not-captured'
    readonly slugChange: 'typed-request-only-derived-preview-unverified'
    readonly stepper: 'context-visible-form-ax-scope-ambiguous'
  }
}

export interface Onboarding7PreviewFixture {
  readonly seed: Onboarding7PreviewStoreSeed
  readonly contentFor: (state: Onboarding7PreviewStoreState) => Onboarding7PreviewContent
}

const LABELS: Readonly<Record<Onboarding7PreviewLocale, Onboarding7PreviewLabels>> = {
  en: {
    title: 'Create your workspace',
    description: 'This is the container for your projects, documents and members.',
    workspaceName: 'Workspace name',
    workspaceNamePlaceholder: 'Acme',
    workspaceUrl: 'Workspace URL',
    workspaceUrlPlaceholder: 'workspace',
    memberReachHint: 'Members will reach it at northwind.app/northwind',
    dataRegion: 'Data region',
    regionPermanentHint: 'Region is permanent once the workspace is created.',
    privateWorkspace: 'Private workspace',
    privateWorkspaceDescription: 'Only invited members can find or join it.',
    back: 'Back',
    continue: 'Continue',
  },
  de: {
    title: 'Erstelle deinen Arbeitsbereich',
    description: 'Hier befinden sich deine Projekte, Dokumente und Mitglieder.',
    workspaceName: 'Name des Arbeitsbereichs',
    workspaceNamePlaceholder: 'Acme',
    workspaceUrl: 'Arbeitsbereichs-URL',
    workspaceUrlPlaceholder: 'arbeitsbereich',
    memberReachHint: 'Mitglieder erreichen ihn unter northwind.app/northwind',
    dataRegion: 'Datenregion',
    regionPermanentHint: 'Die Region ist nach dem Erstellen des Arbeitsbereichs dauerhaft festgelegt.',
    privateWorkspace: 'Privater Arbeitsbereich',
    privateWorkspaceDescription: 'Nur eingeladene Mitglieder können ihn finden oder ihm beitreten.',
    back: 'Zurück',
    continue: 'Weiter',
  },
  'de-long': {
    title:
      'Erstelle jetzt einen gemeinsam genutzten Arbeitsbereich für alle Mitglieder deines international verteilten Teams',
    description:
      'Hier befinden sich sämtliche Projekte, Dokumente und Teammitglieder, die du für die gemeinsame Zusammenarbeit in deinem neuen Arbeitsbereich organisierst.',
    workspaceName: 'Vollständiger Name des gemeinsam genutzten Teamarbeitsbereichs',
    workspaceNamePlaceholder: 'Name des Unternehmens oder Teams',
    workspaceUrl: 'Öffentliche URL des Arbeitsbereichs',
    workspaceUrlPlaceholder: 'eindeutiger-adressbestandteil',
    memberReachHint:
      'Alle eingeladenen Mitglieder erreichen den gemeinsam genutzten Arbeitsbereich unter northwind.app/northwind',
    dataRegion: 'Dauerhaft festgelegte Datenregion für diesen Arbeitsbereich',
    regionPermanentHint:
      'Die für diesen gemeinsam genutzten Arbeitsbereich ausgewählte Datenregion bleibt nach dem Erstellen dauerhaft festgelegt.',
    privateWorkspace: 'Nur für eingeladene Mitglieder sichtbarer privater Arbeitsbereich',
    privateWorkspaceDescription:
      'Ausschließlich Personen, die du ausdrücklich zum Arbeitsbereich eingeladen hast, können diesen finden oder ihm beitreten.',
    back: 'Zurück zum vorherigen Schritt der Arbeitsbereichseinrichtung',
    continue: 'Mit der Einrichtung des Arbeitsbereichs fortfahren',
  },
}

const REGION_LABELS: Readonly<Record<Onboarding7PreviewLocale, Readonly<Record<Onboarding7RegionId, string>>>> = {
  en: {
    'us-east': 'United States (us-east)',
    'eu-central': 'Europe (eu-central)',
    'ap-southeast': 'Asia Pacific (ap-southeast)',
  },
  de: {
    'us-east': 'Vereinigte Staaten (us-east)',
    'eu-central': 'Europa (eu-central)',
    'ap-southeast': 'Asien-Pazifik (ap-southeast)',
  },
  'de-long': {
    'us-east': 'Vereinigte Staaten von Amerika als östlicher Standort (us-east)',
    'eu-central': 'Mitteleuropa als zentraler europäischer Standort (eu-central)',
    'ap-southeast': 'Südostasien als asiatisch-pazifischer Standort (ap-southeast)',
  },
}

export function createOnboarding7PreviewFixture(locale: Onboarding7PreviewLocale = 'en'): Onboarding7PreviewFixture {
  const seed: Onboarding7PreviewStoreSeed = {
    workspaceName: 'Northwind',
    slug: 'northwind',
    urlPrefix: 'northwind.app/',
    regionId: 'eu-central',
    privateWorkspace: true,
  }

  return {
    seed,
    contentFor: (state) => ({
      locale,
      labels: LABELS[locale],
      workspaceName: state.workspaceName,
      slug: state.slug,
      urlPrefix: state.urlPrefix,
      regionId: state.regionId,
      regionOptions: ONBOARDING7_REGION_IDS.map((id) => ({ id, label: REGION_LABELS[locale][id] })),
      privateWorkspace: state.privateWorkspace,
      sourceBoundary: {
        regionCountObserved: 3,
        maximumRegionCount: 'not-tested',
        contentLayout: 'content-grown-normal-flow',
        scrollOwner: 'not-captured',
        slugChange: 'typed-request-only-derived-preview-unverified',
        stepper: 'context-visible-form-ax-scope-ambiguous',
      },
    }),
  }
}
