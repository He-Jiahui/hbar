import {
  ONBOARDING4_TEAM_SIZE_IDS,
  ONBOARDING4_USE_CASE_IDS,
  type Onboarding4PreviewStoreSeed,
  type Onboarding4PreviewStoreState,
  type Onboarding4TeamSizeId,
  type Onboarding4UseCaseId,
} from './onboarding4PreviewStore'

export type Onboarding4PreviewLocale = 'en' | 'de'

export const ONBOARDING4_SOURCE_EVIDENCE = {
  officialUrl: 'https://pro.reactbits.dev/docs/app-ui/onboarding/onboarding-4',
  docsDescription: 'Use-case picker with selectable option tiles and a segmented team-size control.',
  staticCache: {
    cacheId: 'full-static-v10',
    generatedAt: '2026/9/23 4:28:30',
    sourceHash: 'b59ffe4e0ac59409bfbbd7e84a374f348d61f9536b4168ac63c4d8c8c64c543c',
    sourceStatus: 200,
    schemaVersion: 1,
    themes: ['light', 'dark'],
    viewports: ['desktop', 'tablet', 'mobile', 'stress'],
    rootSizes: {
      desktop: { width: 720, height: 567 },
      tablet: { width: 606, height: 567 },
      mobile: { width: 356, height: 640 },
      stress: { width: 286, height: 640 },
    },
    bodyTextLength: 645,
    truncatedTextCount: 0,
    horizontalOverflow: false,
    mobileContentBounds: {
      rootHeight: 640,
      contentTop: -130,
      contentHeight: 900,
      teamSizeTop: 634.5,
      navigationTop: 730,
      scrollOwner: 'not-captured',
    },
  },
  sameHashInteractionCache: {
    cacheId: 'full-interactions-v4',
    generatedAt: '2026-09-23T03:53:20.579Z',
    sourceHash: 'b59ffe4e0ac59409bfbbd7e84a374f348d61f9536b4168ac63c4d8c8c64c543c',
    schemaVersion: 1,
    explicitProtocol: 'not-recorded',
    coverage: 'semantic-shape-representatives',
    themes: ['dark'],
    viewports: ['desktop', 'mobile'],
    verified: {
      initialUseCaseId: 'run-sprints',
      initialTeamSizeId: '2-10',
      teamSizeChange: {
        targetId: 'just-me',
        fromId: '2-10',
        toId: 'just-me',
        selectedUseCaseRemains: 'run-sprints',
      },
      useCaseChangeSample: {
        targetId: 'plan-roadmap',
        fromId: 'run-sprints',
        toId: 'plan-roadmap',
        input: ['click', 'press-enter'],
        result: 'observed-radio-checked-change-in-raw-ax',
        legacyComparison: 'source-no-op-because-delta-omitted-radio-checked',
      },
    },
    unverified: {
      otherUseCaseSelectionResults: 'same-radio-group-inferred-not-replayed',
      otherTeamSizeSelectionResults: 'same-segmented-group-inferred-not-replayed',
      backResult: 'not-captured',
      continueResult: 'not-captured',
      remoteTemplateApplication: 'not-captured',
      persistence: 'not-captured',
      scrollOwner: 'not-captured',
    },
  },
  olderStaticCache: {
    cacheId: 'full-static-v9',
    sourceHash: '369e666e4acab058972176a013209d2119beb3a9d378704932ec319113ef07ed',
    matchesInteractionCache: false,
  },
} as const

export interface Onboarding4PreviewLabels {
  readonly stepIndicator: (step: number, total: number) => string
  readonly heading: string
  readonly description: string
  readonly useCaseGroupLabel: string
  readonly useCaseAccessibleName: (title: string, description: string) => string
  readonly emptyUseCasesText: string
  readonly teamSizeLegend: string
  readonly backLabel: string
  readonly continueLabel: string
}

export interface Onboarding4PreviewUseCaseCopy {
  readonly title: string
  readonly description: string
}

export type Onboarding4PreviewUseCaseCopyById = Readonly<Record<Onboarding4UseCaseId, Onboarding4PreviewUseCaseCopy>>

export type Onboarding4PreviewTeamSizeCopyById = Readonly<Record<Onboarding4TeamSizeId, string>>

export interface Onboarding4PreviewCopy {
  readonly labels: Onboarding4PreviewLabels
  readonly useCases: Onboarding4PreviewUseCaseCopyById
  readonly teamSizes: Onboarding4PreviewTeamSizeCopyById
}

export interface Onboarding4PreviewUseCase {
  readonly id: Onboarding4UseCaseId
  readonly title: string
  readonly description: string
  readonly accessibleName: string
  readonly checked: boolean
}

export interface Onboarding4PreviewTeamSize {
  readonly id: Onboarding4TeamSizeId
  readonly label: string
  readonly pressed: boolean
}

export interface Onboarding4PreviewContent {
  readonly locale: Onboarding4PreviewLocale
  readonly step: {
    readonly current: 2
    readonly total: 4
    readonly label: string
  }
  readonly labels: Onboarding4PreviewLabels
  readonly selectedUseCaseId: Onboarding4UseCaseId | null
  readonly useCases: readonly Onboarding4PreviewUseCase[]
  readonly selectedTeamSizeId: Onboarding4TeamSizeId | null
  readonly teamSizes: readonly Onboarding4PreviewTeamSize[]
  readonly actions: {
    readonly backLabel: string
    readonly continueLabel: string
    readonly backEnabled: true
    readonly continueEnabled: true
  }
  readonly collectionContract: {
    readonly maxUseCases: 6
    readonly maxTeamSizes: 4
    readonly strategy: 'bounded-content-grown'
    readonly sourceNarrowBehavior: 'one-column-with-controls-below-640px-viewport'
    readonly sourceScrollOwner: 'not-captured'
    readonly localNarrowBehavior: 'normal-flow-with-reachable-controls'
    readonly horizontalOverflowEvidence: 'none-at-four-static-widths'
  }
  readonly evidence: typeof ONBOARDING4_SOURCE_EVIDENCE
}

export interface Onboarding4PreviewFixtureOverrides {
  readonly labels?: Partial<Onboarding4PreviewLabels>
  readonly useCaseCopy?: Partial<Record<Onboarding4UseCaseId, Partial<Onboarding4PreviewUseCaseCopy>>>
  readonly teamSizeCopy?: Partial<Record<Onboarding4TeamSizeId, string>>
  readonly useCaseOrder?: readonly Onboarding4UseCaseId[]
  readonly teamSizeOrder?: readonly Onboarding4TeamSizeId[]
}

export interface Onboarding4PreviewFixture {
  readonly locale: Onboarding4PreviewLocale
  readonly copy: Onboarding4PreviewCopy
  readonly seed: Onboarding4PreviewStoreSeed
  readonly contentFor: (state: Onboarding4PreviewStoreState) => Onboarding4PreviewContent
}

function copyFor(locale: Onboarding4PreviewLocale): Onboarding4PreviewCopy {
  if (locale === 'de') {
    return {
      labels: {
        stepIndicator: (step, total) => `Schritt ${step} von ${total}`,
        heading: 'Wofür möchten Sie den Arbeitsbereich zuerst nutzen?',
        description: 'Wir öffnen die passende Arbeitsbereichsvorlage. Alles andere bleibt verfügbar.',
        useCaseGroupLabel: 'Primärer Anwendungsfall',
        useCaseAccessibleName: (title, description) => `${title} ${description}`,
        emptyUseCasesText: 'Keine Anwendungsfälle verfügbar.',
        teamSizeLegend: 'Wie viele Personen werden Teil Ihres Teams?',
        backLabel: 'Zurück',
        continueLabel: 'Weiter',
      },
      useCases: {
        'plan-roadmap': {
          title: 'Roadmap planen',
          description: 'Quartalsthemen, datierte Meilensteine und eine Ansicht für die Geschäftsleitung.',
        },
        'run-sprints': {
          title: 'Sprints durchführen',
          description: 'Zyklen, Kapazität und ein Board, das sich alle zwei Wochen leert.',
        },
        'triage-requests': {
          title: 'Anfragen sortieren',
          description: 'Eine Eingangsliste für Fehler, Fragen und Kundeneskalationen.',
        },
        'write-things-down': {
          title: 'Wissen festhalten',
          description: 'Spezifikationen und Entscheidungen bleiben mit der Arbeit verknüpft.',
        },
        'automate-handoffs': {
          title: 'Übergaben automatisieren',
          description: 'Arbeit zwischen Teams verschieben, ohne Statusänderungen nachzuverfolgen.',
        },
        'report-delivery': {
          title: 'Lieferfähigkeit auswerten',
          description: 'Zykluszeit, Durchsatz und tatsächliche Engpässe erkennen.',
        },
      },
      teamSizes: {
        'just-me': 'Nur ich',
        '2-10': '2–10',
        '11-50': '11–50',
        '50-plus': '50+',
      },
    }
  }

  return {
    labels: {
      stepIndicator: (step, total) => `Step ${step} of ${total}`,
      heading: 'What will you use this for first?',
      description: "We'll open the matching workspace template. Everything else stays available.",
      useCaseGroupLabel: 'Primary use case',
      useCaseAccessibleName: (title, description) => `${title} ${description}`,
      emptyUseCasesText: 'No use cases are available.',
      teamSizeLegend: 'How many people will join you?',
      backLabel: 'Back',
      continueLabel: 'Continue',
    },
    useCases: {
      'plan-roadmap': {
        title: 'Plan a roadmap',
        description: 'Quarterly themes, dated milestones and a view leadership can read.',
      },
      'run-sprints': {
        title: 'Run sprints',
        description: 'Cycles, capacity and a board that clears itself every two weeks.',
      },
      'triage-requests': {
        title: 'Triage requests',
        description: 'One intake queue for bugs, questions and customer escalations.',
      },
      'write-things-down': {
        title: 'Write things down',
        description: 'Specs and decision records that stay attached to the work.',
      },
      'automate-handoffs': {
        title: 'Automate handoffs',
        description: 'Move work between teams without anyone chasing a status update.',
      },
      'report-delivery': {
        title: 'Report on delivery',
        description: 'Cycle time, throughput and where things actually get stuck.',
      },
    },
    teamSizes: {
      'just-me': 'Just me',
      '2-10': '2–10',
      '11-50': '11–50',
      '50-plus': '50+',
    },
  }
}

function mergeCopy(
  base: Onboarding4PreviewCopy,
  overrides: Onboarding4PreviewFixtureOverrides,
): Onboarding4PreviewCopy {
  const useCases: Record<Onboarding4UseCaseId, Onboarding4PreviewUseCaseCopy> = { ...base.useCases }

  for (const useCaseId of ONBOARDING4_USE_CASE_IDS) {
    const useCaseOverrides = overrides.useCaseCopy?.[useCaseId]
    if (useCaseOverrides) useCases[useCaseId] = { ...useCases[useCaseId], ...useCaseOverrides }
  }

  return {
    labels: { ...base.labels, ...overrides.labels },
    useCases,
    teamSizes: { ...base.teamSizes, ...overrides.teamSizeCopy },
  }
}

function uniqueInRequestedOrder<TId extends string>(
  requested: readonly TId[] | undefined,
  defaults: readonly TId[],
): readonly TId[] {
  const candidates = requested ?? defaults
  const unique: TId[] = []

  for (const candidate of candidates) {
    if (!defaults.includes(candidate) || unique.includes(candidate)) continue
    unique.push(candidate)
  }

  return unique
}

export function createOnboarding4PreviewFixture(
  locale: Onboarding4PreviewLocale = 'en',
  overrides: Onboarding4PreviewFixtureOverrides = {},
): Onboarding4PreviewFixture {
  const copy = mergeCopy(copyFor(locale), overrides)
  const useCaseOrder = uniqueInRequestedOrder(overrides.useCaseOrder, ONBOARDING4_USE_CASE_IDS)
  const teamSizeOrder = uniqueInRequestedOrder(overrides.teamSizeOrder, ONBOARDING4_TEAM_SIZE_IDS)
  const seed: Onboarding4PreviewStoreSeed = {
    useCaseIds: useCaseOrder,
    initialUseCaseId: 'run-sprints',
    teamSizeIds: teamSizeOrder,
    initialTeamSizeId: '2-10',
  }

  return {
    locale,
    copy,
    seed,
    contentFor: (state) => ({
      locale,
      step: {
        current: 2,
        total: 4,
        label: copy.labels.stepIndicator(2, 4),
      },
      labels: copy.labels,
      selectedUseCaseId: state.selectedUseCaseId,
      useCases: state.useCaseIds.map((id) => {
        const useCase = copy.useCases[id]
        return {
          id,
          title: useCase.title,
          description: useCase.description,
          accessibleName: copy.labels.useCaseAccessibleName(useCase.title, useCase.description),
          checked: state.selectedUseCaseId === id,
        }
      }),
      selectedTeamSizeId: state.selectedTeamSizeId,
      teamSizes: state.teamSizeIds.map((id) => ({
        id,
        label: copy.teamSizes[id],
        pressed: state.selectedTeamSizeId === id,
      })),
      actions: {
        backLabel: copy.labels.backLabel,
        continueLabel: copy.labels.continueLabel,
        backEnabled: true,
        continueEnabled: true,
      },
      collectionContract: {
        maxUseCases: 6,
        maxTeamSizes: 4,
        strategy: 'bounded-content-grown',
        sourceNarrowBehavior: 'one-column-with-controls-below-640px-viewport',
        sourceScrollOwner: 'not-captured',
        localNarrowBehavior: 'normal-flow-with-reachable-controls',
        horizontalOverflowEvidence: 'none-at-four-static-widths',
      },
      evidence: ONBOARDING4_SOURCE_EVIDENCE,
    }),
  }
}
