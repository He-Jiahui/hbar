import {
  FORMS11_DEFAULT_DESCRIPTION_COUNTER_LIMIT,
  FORMS11_ENVIRONMENT_KIND_IDS,
  FORMS11_REGION_IDS,
  deriveForms11DraftValidity,
  type Forms11EnvironmentKindId,
  type Forms11PreviewStoreState,
  type Forms11RegionId,
} from './forms11PreviewStore'

export type Forms11PreviewLocale = 'en' | 'de'

export const FORMS11_SOURCE_EVIDENCE = {
  officialUrl: 'https://pro.reactbits.dev/docs/app-ui/forms/forms-11',
  currentStaticCache: {
    cacheId: 'full-static-v10',
    generatedAt: '2026-09-23T02:37:12.688Z',
    sourceHash: '8293f15254c41900462f4217db84609b14706c77b3d5acbbce1db0e34a0023d2',
    sourceStatus: 200,
    captureProtocol: 'legacy-unversioned',
  },
  sameHashInteractionCache: {
    cacheId: 'full-interactions-v4',
    generatedAt: '2026-09-23T03:53:20.579Z',
    sourceHash: '8293f15254c41900462f4217db84609b14706c77b3d5acbbce1db0e34a0023d2',
    captureProtocol: 'legacy-unversioned',
    usefulSamples: [
      'name-fill: audit sample -> audit-sample.yourapp.dev; Create environment becomes enabled',
      'region-expand: four region options are visible; selecting the current option has no state delta',
      'auto-deploy-toggle: checked -> unchecked',
      'description-fill: 12 characters -> 12 / 160 counter',
    ],
  },
  olderInteractionCache: {
    cacheId: 'full-interactions-v3',
    sourceHash: '61cfd03972cea96e330d772a8b19327525adb6a5bdf6b80ea4200901a166d0a3',
    matchesCurrentStaticHash: false,
  },
  liveSource: {
    browserToolStatus: 'url-inaccessible',
    usedAsCurrentStrictEvidence: false,
  },
  staticViews: {
    light: {
      desktop: { width: 560, height: 574, horizontalOverflow: false, truncatedTextCount: 1 },
      tablet: { width: 560, height: 574, horizontalOverflow: false, truncatedTextCount: 1 },
      mobile: { width: 292, height: 593, horizontalOverflow: false, truncatedTextCount: 1 },
      stress: { width: 222, height: 613, horizontalOverflow: false, truncatedTextCount: 2 },
    },
    dark: {
      desktop: { width: 560, height: 574, horizontalOverflow: false, truncatedTextCount: 1 },
      tablet: { width: 560, height: 574, horizontalOverflow: false, truncatedTextCount: 1 },
      mobile: { width: 292, height: 593, horizontalOverflow: false, truncatedTextCount: 1 },
      stress: { width: 222, height: 613, horizontalOverflow: false, truncatedTextCount: 2 },
    },
    narrowFlowEvidence: 'stress-capture-has-truncated-content-scroll-owner-not-captured',
  },
  unverifiedBehaviors: [
    'alternate-kind descriptions and per-kind form changes',
    'copy-variable source menu options and selection effects',
    'slug availability result or asynchronous timing',
    'description overflow behavior beyond the displayed 160-character counter',
    'Create, Cancel, and Close outcomes',
    'narrow-screen scroll owner and lower-field reachability',
  ],
} as const

export interface Forms11RegionOption {
  readonly id: Forms11RegionId
  readonly label: string
}

export interface Forms11EnvironmentKindOption {
  readonly id: Forms11EnvironmentKindId
  readonly label: string
  readonly description: string | null
}

export interface Forms11CopyVariableSourceOption {
  readonly id: string
  readonly label: string
}

export interface Forms11PreviewCopy {
  readonly dialogTitle: string
  readonly dialogDescription: string
  readonly closeLabel: string
  readonly environmentKindLabel: string
  readonly environmentKindLabels: Readonly<Record<Forms11EnvironmentKindId, string>>
  readonly environmentKindDescriptions: Readonly<Partial<Record<Forms11EnvironmentKindId, string>>>
  readonly nameLabel: string
  readonly requiredMarker: string
  readonly namePlaceholder: string
  readonly deployTarget: (slug: string) => string
  readonly regionLabel: string
  readonly copyVariablesLabel: string
  readonly noVariableSourceLabel: string
  readonly compatibleVariablesHelp: string
  readonly autoDeployLabel: string
  readonly autoDeployHelp: string
  readonly descriptionLabel: string
  readonly descriptionPlaceholder: string
  readonly descriptionCounter: (count: number, limit: number) => string
  readonly cancelLabel: string
  readonly createLabel: string
}

export interface Forms11PreviewContent {
  readonly copy: Forms11PreviewCopy
  readonly environmentKind: {
    readonly selectedId: Forms11EnvironmentKindId
    readonly options: readonly Forms11EnvironmentKindOption[]
    readonly selectedDescription: string | null
    readonly alternateDescriptionEvidence: 'not-captured'
  }
  readonly name: {
    readonly value: string
    readonly required: true
    readonly placeholder: string
    readonly slug: string
    readonly deployTarget: string
    readonly hasRequiredValue: boolean
    readonly createEnabled: boolean
    readonly createGateEvidence: 'inferred-from-required-marker-and-cached-enabled-state'
    readonly slugProjectionEvidence: 'single-space-containing-name-sample'
    readonly slugAvailability: 'unobserved'
    readonly slugAvailabilityEvidence: 'cache-title-only-status-not-captured'
  }
  readonly region: {
    readonly selectedId: Forms11RegionId
    readonly options: readonly Forms11RegionOption[]
    readonly optionCatalogEvidence: 'captured-open-menu-four-options'
  }
  readonly copyVariables: {
    readonly selectedId: string
    readonly options: readonly Forms11CopyVariableSourceOption[]
    readonly catalogCompleteness: 'partial'
    readonly catalogEvidence: 'default-only-source-menu-not-captured'
  }
  readonly autoDeployOnPush: boolean
  readonly description: {
    readonly value: string
    readonly characterCount: number
    readonly counterLimit: number
    readonly counterLabel: string
    readonly overflowBehaviorEvidence: 'counter-visible-overflow-not-captured'
  }
  readonly actions: {
    readonly createEnabled: boolean
    readonly createOutcome: 'typed-host-request-only'
    readonly cancelOutcome: 'typed-host-request-only'
    readonly closeOutcome: 'typed-host-request-only'
  }
  readonly evidence: typeof FORMS11_SOURCE_EVIDENCE
}

export interface Forms11PreviewFixture {
  readonly locale: Forms11PreviewLocale
  readonly localeEvidence: 'english-from-cache; non-english-fixture-copy-not-source-verified'
  readonly copy: Forms11PreviewCopy
  readonly contentFor: (state: Forms11PreviewStoreState) => Forms11PreviewContent
}

const REGION_LABELS: Readonly<Record<Forms11RegionId, string>> = {
  'us-east-n-virginia': 'US East (N. Virginia)',
  'us-west-oregon': 'US West (Oregon)',
  'europe-ireland': 'Europe (Ireland)',
  'asia-pacific-sydney': 'Asia Pacific (Sydney)',
}

function copyFor(locale: Forms11PreviewLocale): Forms11PreviewCopy {
  if (locale === 'de') {
    return {
      dialogTitle: 'Neue Umgebung',
      dialogDescription: 'Richten Sie einen isolierten Ort für die Bereitstellung Ihrer App ein.',
      closeLabel: 'Schließen',
      environmentKindLabel: 'Umgebungstyp',
      environmentKindLabels: {
        preview: 'Vorschau',
        staging: 'Staging',
        production: 'Produktion',
      },
      environmentKindDescriptions: {
        preview:
          'Wird für jeden Pull Request erstellt und beim Zusammenführen entfernt. Ideal, um Änderungen isoliert zu prüfen.',
      },
      nameLabel: 'Name',
      requiredMarker: '*',
      namePlaceholder: 'z. B. Release-Kandidat',
      deployTarget: (slug) => 'Bereitstellung unter ' + slug + '.yourapp.dev',
      regionLabel: 'Region',
      copyVariablesLabel: 'Variablen kopieren aus',
      noVariableSourceLabel: 'Ohne Variablen starten',
      compatibleVariablesHelp:
        'Es werden nur Umgebungen berücksichtigt, die mit einer Vorschauumgebung kompatibel sind.',
      autoDeployLabel: 'Bei Push automatisch bereitstellen',
      autoDeployHelp: 'Erstellen und bereitstellen, wenn sich der überwachte Branch ändert.',
      descriptionLabel: 'Beschreibung',
      descriptionPlaceholder: 'Wofür ist diese Umgebung gedacht?',
      descriptionCounter: (count, limit) => count + ' / ' + limit,
      cancelLabel: 'Abbrechen',
      createLabel: 'Umgebung erstellen',
    }
  }

  return {
    dialogTitle: 'New environment',
    dialogDescription: 'Provision an isolated place to deploy your app.',
    closeLabel: 'Close',
    environmentKindLabel: 'Environment kind',
    environmentKindLabels: {
      preview: 'Preview',
      staging: 'Staging',
      production: 'Production',
    },
    environmentKindDescriptions: {
      preview: 'Created for each pull request and removed on merge. Best for reviewing changes in isolation.',
    },
    nameLabel: 'Name',
    requiredMarker: '*',
    namePlaceholder: 'e.g. Release candidate',
    deployTarget: (slug) => 'Deploys to ' + slug + '.yourapp.dev',
    regionLabel: 'Region',
    copyVariablesLabel: 'Copy variables from',
    noVariableSourceLabel: 'Start with no variables',
    compatibleVariablesHelp: 'Sources are limited to environments compatible with a preview environment.',
    autoDeployLabel: 'Auto-deploy on push',
    autoDeployHelp: 'Build and deploy whenever the tracked branch changes.',
    descriptionLabel: 'Description',
    descriptionPlaceholder: 'What is this environment for?',
    descriptionCounter: (count, limit) => count + ' / ' + limit,
    cancelLabel: 'Cancel',
    createLabel: 'Create environment',
  }
}

export function createForms11PreviewFixture(locale: Forms11PreviewLocale = 'en'): Forms11PreviewFixture {
  const copy = copyFor(locale)
  const noVariableSource: Forms11CopyVariableSourceOption = {
    id: 'none',
    label: copy.noVariableSourceLabel,
  }

  return {
    locale,
    localeEvidence: 'english-from-cache; non-english-fixture-copy-not-source-verified',
    copy,
    contentFor: (state) => {
      const draft = state.draft
      const validity = deriveForms11DraftValidity(draft)
      const environmentKindOptions = FORMS11_ENVIRONMENT_KIND_IDS.map((id) => ({
        id,
        label: copy.environmentKindLabels[id],
        description: copy.environmentKindDescriptions[id] ?? null,
      }))
      const regionOptions = FORMS11_REGION_IDS.map((id) => ({ id, label: REGION_LABELS[id] }))
      const descriptionCharacterCount = draft.description.length
      const visibleSlug = validity.normalizedSlug || 'your-environment'

      return {
        copy,
        environmentKind: {
          selectedId: draft.environmentKindId,
          options: environmentKindOptions,
          selectedDescription: copy.environmentKindDescriptions[draft.environmentKindId] ?? null,
          alternateDescriptionEvidence: 'not-captured',
        },
        name: {
          value: draft.name,
          required: true,
          placeholder: copy.namePlaceholder,
          slug: visibleSlug,
          deployTarget: copy.deployTarget(visibleSlug),
          hasRequiredValue: validity.hasRequiredName,
          createEnabled: validity.canRequestCreate,
          createGateEvidence: 'inferred-from-required-marker-and-cached-enabled-state',
          slugProjectionEvidence: 'single-space-containing-name-sample',
          slugAvailability: 'unobserved',
          slugAvailabilityEvidence: 'cache-title-only-status-not-captured',
        },
        region: {
          selectedId: draft.regionId,
          options: regionOptions,
          optionCatalogEvidence: 'captured-open-menu-four-options',
        },
        copyVariables: {
          selectedId: draft.copyVariablesFromId,
          options: [noVariableSource],
          catalogCompleteness: 'partial',
          catalogEvidence: 'default-only-source-menu-not-captured',
        },
        autoDeployOnPush: draft.autoDeployOnPush,
        description: {
          value: draft.description,
          characterCount: descriptionCharacterCount,
          counterLimit: FORMS11_DEFAULT_DESCRIPTION_COUNTER_LIMIT,
          counterLabel: copy.descriptionCounter(descriptionCharacterCount, FORMS11_DEFAULT_DESCRIPTION_COUNTER_LIMIT),
          overflowBehaviorEvidence: 'counter-visible-overflow-not-captured',
        },
        actions: {
          createEnabled: validity.canRequestCreate,
          createOutcome: 'typed-host-request-only',
          cancelOutcome: 'typed-host-request-only',
          closeOutcome: 'typed-host-request-only',
        },
        evidence: FORMS11_SOURCE_EVIDENCE,
      }
    },
  }
}
