import {
  ONBOARDING1_TIMEZONE_IDS,
  type Onboarding1PreviewStoreState,
  type Onboarding1ProfileDraft,
  type Onboarding1TimezoneId,
} from './onboarding1PreviewStore'

export type Onboarding1PreviewLocale = 'en' | 'de'

export const ONBOARDING1_SOURCE_EVIDENCE = {
  officialUrl: 'https://pro.reactbits.dev/docs/app-ui/onboarding/onboarding-1',
  currentStaticCache: {
    cacheId: 'full-static-v10',
    captureManifestGeneratedAt: '2026-09-23T02:37:12.688Z',
    sourceInventoryGeneratedAt: '2026-09-23T04:28:30.280Z',
    schemaVersion: 1,
    sourceStatus: 200,
    sourceHash: '2d34fb8f19ec4c1e4934800f987b1f426aea8446c744372cc4b4a1ef1b665a4a',
    protocolEvidence: 'legacy-schema-v1; captureProtocolVersion-not-present',
  },
  sameHashInteractionCache: {
    cacheId: 'full-interactions-v4',
    reportGeneratedAt: '2026-09-23T03:53:20.579Z',
    sourceInventoryGeneratedAt: '2026-09-23T02:45:43.955Z',
    schemaVersion: 1,
    sourceHash: '2d34fb8f19ec4c1e4934800f987b1f426aea8446c744372cc4b4a1ef1b665a4a',
    protocolEvidence: 'legacy-schema-v1; captureProtocolVersion-not-present',
    capturedView: { theme: 'dark', viewport: 'mobile' },
    samples: {
      fullNameFill: {
        controlIndex: 1,
        value: 'audit sample',
        result: 'the Full name textbox contains the entered value; directory preview is hidden at this viewport',
      },
      timezoneSelect: {
        controlIndex: 3,
        selectedLabel: 'Select a timezone',
        result: 'the placeholder is selected; no city option was selected in this sample',
      },
      productUpdatesToggle: {
        controlIndex: 4,
        beforeChecked: true,
        afterChecked: false,
        result: 'the checkbox state changes; directory preview is hidden at this viewport',
      },
      continueClick: {
        controlIndex: 5,
        result: 'the captured after-state remains the Profile form; no navigation or completion result is recorded',
      },
    },
  },
  liveSource: {
    currentPageOpen: 'unavailable-through-browser-tool',
    usedAsCurrentStrictEvidence: false,
  },
  staticViews: {
    themes: ['light', 'dark'],
    viewports: {
      desktop: {
        width: 1086,
        height: 640,
        formWidth: 498.55,
        formHeight: 640,
        directoryPreviewVisible: true,
        horizontalOverflow: false,
        truncatedTextCount: 0,
      },
      tablet: {
        width: 670,
        height: 640,
        formWidth: 670,
        formHeight: 640,
        directoryPreviewVisible: false,
        horizontalOverflow: false,
        truncatedTextCount: 0,
      },
      mobile: {
        width: 356,
        height: 640,
        formWidth: 356,
        formHeight: 640,
        directoryPreviewVisible: false,
        horizontalOverflow: false,
        truncatedTextCount: 0,
      },
      stress: {
        width: 286,
        height: 640,
        formWidth: 286,
        formHeight: 640,
        directoryPreviewVisible: false,
        horizontalOverflow: false,
        truncatedTextCount: 0,
        continueVisible: true,
      },
    },
    allThemesShareCapturedGeometry: true,
    scrollOwner: 'not-recorded; cached JSON has no scroll metrics',
    narrowFlowEvidence: 'all captured form fields and Continue fit in the 286x640 stress frame',
  },
  unverifiedBehavior: [
    'desktop directory-preview updates after changing profile fields',
    'job-title fill result and empty-field validation',
    'timezone preview result after selecting a city or clearing the selection',
    'directory-preview wording after opting out of updates',
    'photo chooser, validation, upload, and resulting avatar',
    'Continue outcome beyond the captured unchanged Profile form',
    'scroll owner and reachability at heights below the captured 640px',
    'exact breakpoint between the 670px tablet and 1086px desktop captures',
  ],
} as const

export interface Onboarding1PreviewCopy {
  readonly title: string
  readonly introduction: string
  readonly uploadPhoto: string
  readonly photoRequirements: string
  readonly fullNameLabel: string
  readonly requiredMarker: string
  readonly fullNamePlaceholder: string
  readonly jobTitleLabel: string
  readonly jobTitlePlaceholder: string
  readonly timezoneLabel: string
  readonly timezonePlaceholder: string
  readonly productUpdatesOptIn: string
  readonly continueLabel: string
  readonly directoryPreviewTitle: string
  readonly directoryTimezoneLabel: string
  readonly directoryUpdatesLabel: string
  readonly subscribedLabel: string
  readonly directoryPreviewDescription: string
}

export interface Onboarding1TimezoneOption {
  readonly id: Onboarding1TimezoneId
  readonly label: string
  readonly directoryPreviewLabel: string | null
  readonly previewLabelEvidence: 'captured-default' | 'not-captured'
}

export interface Onboarding1PreviewContent {
  readonly locale: Onboarding1PreviewLocale
  readonly localeEvidence: 'source-copy-english-only; german-is-test-fixture-copy'
  readonly copy: Onboarding1PreviewCopy
  readonly form: {
    readonly fullName: {
      readonly value: string
      readonly requiredMarker: string
      readonly placeholder: string
    }
    readonly jobTitle: { readonly value: string; readonly placeholder: string }
    readonly timezone: {
      readonly selectedId: Onboarding1TimezoneId | null
      readonly placeholder: string
      readonly options: readonly Onboarding1TimezoneOption[]
      readonly optionValuesEvidence: 'labels-captured; native-option-values-not-captured'
    }
    readonly productUpdatesOptIn: boolean
  }
  readonly photoUpload: {
    readonly acceptedFormatLabels: readonly ['PNG', 'JPG']
    readonly minimumWidthPx: 400
    readonly minimumHeightPx: 400
    readonly maximumFileSizeMegabytes: 10
    readonly requestOutcomeEvidence: 'typed-host-request-only'
  }
  readonly continue: {
    readonly enabledInCapturedDefault: true
    readonly emptyFieldGate: 'not-captured'
    readonly outcomeEvidence: 'typed-host-request-only'
  }
  readonly directoryPreview: {
    readonly title: string
    readonly avatarInitials: string | null
    readonly fullName: string
    readonly jobTitle: string
    readonly timezone: {
      readonly label: string
      readonly value: string | null
      readonly valueEvidence: 'captured-default' | 'not-captured'
    }
    readonly updates: {
      readonly label: string
      readonly optedIn: boolean
      readonly value: string | null
      readonly valueEvidence: 'captured-subscribed-default' | 'unchecked-preview-not-captured'
    }
    readonly description: string
    readonly postEditProjectionEvidence: 'inferred-from-live-preview-description; not-paired-in-cache'
  }
  readonly evidence: typeof ONBOARDING1_SOURCE_EVIDENCE
}

export interface Onboarding1PreviewFixture {
  readonly locale: Onboarding1PreviewLocale
  readonly localeEvidence: Onboarding1PreviewContent['localeEvidence']
  readonly copy: Onboarding1PreviewCopy
  readonly initialDraft: Onboarding1ProfileDraft
  readonly timezoneOptions: readonly Onboarding1TimezoneOption[]
  readonly contentFor: (state: Onboarding1PreviewStoreState) => Onboarding1PreviewContent
}

const TIMEZONE_OPTIONS_BY_ID: Readonly<Record<Onboarding1TimezoneId, Onboarding1TimezoneOption>> = {
  lisbon: {
    id: 'lisbon',
    label: 'Lisbon (GMT+0)',
    directoryPreviewLabel: null,
    previewLabelEvidence: 'not-captured',
  },
  berlin: {
    id: 'berlin',
    label: 'Berlin (GMT+1)',
    directoryPreviewLabel: 'Berlin',
    previewLabelEvidence: 'captured-default',
  },
  'new-york': {
    id: 'new-york',
    label: 'New York (GMT−5)',
    directoryPreviewLabel: null,
    previewLabelEvidence: 'not-captured',
  },
  singapore: {
    id: 'singapore',
    label: 'Singapore (GMT+8)',
    directoryPreviewLabel: null,
    previewLabelEvidence: 'not-captured',
  },
}

function copyFor(locale: Onboarding1PreviewLocale): Onboarding1PreviewCopy {
  if (locale === 'de') {
    return {
      title: 'Profil einrichten',
      introduction: 'Füge die Details hinzu, die Teammitglieder im Workspace sehen.',
      uploadPhoto: 'Foto hochladen',
      photoRequirements: 'PNG oder JPG, mindestens 400 × 400 px, bis zu 10 MB.',
      fullNameLabel: 'Vollständiger Name',
      requiredMarker: '*',
      fullNamePlaceholder: 'Dein Name',
      jobTitleLabel: 'Berufsbezeichnung',
      jobTitlePlaceholder: 'Was du machst',
      timezoneLabel: 'Zeitzone',
      timezonePlaceholder: 'Zeitzone auswählen',
      productUpdatesOptIn: 'Sende mir Produktupdates und Tipps zum Workspace.',
      continueLabel: 'Weiter',
      directoryPreviewTitle: 'Verzeichnisvorschau',
      directoryTimezoneLabel: 'Zeitzone',
      directoryUpdatesLabel: 'Updates',
      subscribedLabel: 'Abonniert',
      directoryPreviewDescription:
        'So sehen dich deine Teammitglieder. Du kannst alles später in deinen Kontoeinstellungen ändern.',
    }
  }

  return {
    title: 'Set up your profile',
    introduction: 'Add the details teammates will see across the workspace.',
    uploadPhoto: 'Upload photo',
    photoRequirements: 'PNG or JPG, at least 400 × 400 px, up to 10 MB.',
    fullNameLabel: 'Full name',
    requiredMarker: '*',
    fullNamePlaceholder: 'Your name',
    jobTitleLabel: 'Job title',
    jobTitlePlaceholder: 'What you do',
    timezoneLabel: 'Timezone',
    timezonePlaceholder: 'Select a timezone',
    productUpdatesOptIn: 'Send me product updates and workspace tips.',
    continueLabel: 'Continue',
    directoryPreviewTitle: 'Directory preview',
    directoryTimezoneLabel: 'Timezone',
    directoryUpdatesLabel: 'Updates',
    subscribedLabel: 'Subscribed',
    directoryPreviewDescription:
      'This is how teammates will see you. You can change any of it later from your account settings.',
  }
}

function deriveAvatarInitials(fullName: string): string | null {
  const words = fullName
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
  const first = words[0]?.[0]
  const last = words.length > 1 ? words.at(-1)?.[0] : undefined
  const initials = [first, last].filter((initial): initial is string => initial !== undefined).join('')
  return initials.length > 0 ? initials.toUpperCase() : null
}

export function createOnboarding1PreviewFixture(
  locale: Onboarding1PreviewLocale = 'en',
  copyOverrides: Partial<Onboarding1PreviewCopy> = {},
): Onboarding1PreviewFixture {
  const copy = { ...copyFor(locale), ...copyOverrides }
  const initialDraft: Onboarding1ProfileDraft = {
    fullName: 'Sam Rivera',
    jobTitle: 'Product Engineer',
    timezoneId: 'berlin',
    productUpdatesOptIn: true,
  }
  const timezoneOptions = ONBOARDING1_TIMEZONE_IDS.map((id) => TIMEZONE_OPTIONS_BY_ID[id])

  return {
    locale,
    localeEvidence: 'source-copy-english-only; german-is-test-fixture-copy',
    copy,
    initialDraft,
    timezoneOptions,
    contentFor: (state) => {
      const draft = state.draft
      const selectedTimezone = timezoneOptions.find((option) => option.id === draft.timezoneId)

      return {
        locale,
        localeEvidence: 'source-copy-english-only; german-is-test-fixture-copy',
        copy,
        form: {
          fullName: {
            value: draft.fullName,
            requiredMarker: copy.requiredMarker,
            placeholder: copy.fullNamePlaceholder,
          },
          jobTitle: { value: draft.jobTitle, placeholder: copy.jobTitlePlaceholder },
          timezone: {
            selectedId: draft.timezoneId,
            placeholder: copy.timezonePlaceholder,
            options: timezoneOptions,
            optionValuesEvidence: 'labels-captured; native-option-values-not-captured',
          },
          productUpdatesOptIn: draft.productUpdatesOptIn,
        },
        photoUpload: {
          acceptedFormatLabels: ['PNG', 'JPG'],
          minimumWidthPx: 400,
          minimumHeightPx: 400,
          maximumFileSizeMegabytes: 10,
          requestOutcomeEvidence: 'typed-host-request-only',
        },
        continue: {
          enabledInCapturedDefault: true,
          emptyFieldGate: 'not-captured',
          outcomeEvidence: 'typed-host-request-only',
        },
        directoryPreview: {
          title: copy.directoryPreviewTitle,
          avatarInitials: deriveAvatarInitials(draft.fullName),
          fullName: draft.fullName,
          jobTitle: draft.jobTitle,
          timezone: {
            label: copy.directoryTimezoneLabel,
            value: selectedTimezone?.directoryPreviewLabel ?? null,
            valueEvidence: selectedTimezone?.previewLabelEvidence ?? 'not-captured',
          },
          updates: {
            label: copy.directoryUpdatesLabel,
            optedIn: draft.productUpdatesOptIn,
            value: draft.productUpdatesOptIn ? copy.subscribedLabel : null,
            valueEvidence: draft.productUpdatesOptIn ? 'captured-subscribed-default' : 'unchecked-preview-not-captured',
          },
          description: copy.directoryPreviewDescription,
          postEditProjectionEvidence: 'inferred-from-live-preview-description; not-paired-in-cache',
        },
        evidence: ONBOARDING1_SOURCE_EVIDENCE,
      }
    },
  }
}
