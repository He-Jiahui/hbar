import {
  ONBOARDING2_ROLE_IDS,
  ONBOARDING2_STEP_IDS,
  type Onboarding2KnownStepId,
  type Onboarding2PreviewStoreSeed,
  type Onboarding2PreviewStoreState,
  type Onboarding2RoleId,
  type Onboarding2StepId,
} from './onboarding2PreviewStore'

export type Onboarding2PreviewLocale = 'en' | 'de'
export type Onboarding2StepStatus = 'complete' | 'current' | 'upcoming'

export const ONBOARDING2_SOURCE_EVIDENCE = {
  officialUrl: 'https://pro.reactbits.dev/docs/app-ui/onboarding/onboarding-2',
  docsDescription: 'Six-step vertical stepper with a labelled rail and a real form body on every step.',
  liveInspection: {
    status: 'docs-text-visible-preview-iframe-not-exposed',
    note: 'The documentation text was visible, but the embedded preview controls were not exposed for fresh replay.',
  },
  staticCache: {
    cacheId: 'full-static-v10',
    generatedAt: '2026-09-23T04:28:30.280Z',
    sourceHash: 'e37748d4786df18d23b5ce09479762a71c405d2c007d43bf583b75f984e24747',
    sourceStatus: 200,
    rootSizes: {
      desktop: { width: 1086, height: 720 },
      tablet: { width: 670, height: 720 },
      mobile: { width: 356, height: 720 },
      stress: { width: 286, height: 720 },
    },
    horizontalOverflow: false,
    truncatedTextCount: 0,
  },
  sameHashInteractionCache: {
    cacheId: 'full-interactions-v4',
    generatedAt: '2026-09-23T03:53:20.579Z',
    sourceHash: 'e37748d4786df18d23b5ce09479762a71c405d2c007d43bf583b75f984e24747',
    schemaVersion: 1,
    explicitProtocol: 'not-recorded',
    evidence: {
      profileFill: 'after-snapshot-shows-edited-value; comparator-did-not-track-value-delta',
      profileContinue: 'cached-click-and-key-press-capture-advance-to-role-step',
      roleDefault: 'Product-is-selected-with-four-source-options-after-profile-continue',
      currentStepRailPress: 'cached-enter-and-space-capture-show-no-source-state-change',
      narrowRailPointer: 'hidden-current-step-button-click-capture-failed-as-not-visible',
      roleSelectionResult: 'not-captured',
      backResult: 'not-captured',
      laterStepBodies: 'not-captured',
      invitationOrCompletion: 'not-captured',
    },
  },
  olderStaticCache: {
    cacheId: 'full-static-v9',
    sourceHash: 'ab34ee5552a67cb695655ab2d50a956435cdea22769a5f65c4a351d1d940df70',
    matchesInteractionCache: false,
  },
  verifiedBodies: ['profile', 'role'] as const,
  unverifiedStepIds: ['source', 'workspace', 'goals', 'invite'] as const,
} as const

export interface Onboarding2PreviewCopy {
  readonly stepLabels: Readonly<Record<Onboarding2StepId, string>>
  readonly stepDescriptions: Readonly<Record<Onboarding2StepId, string>>
  readonly progressText: (current: number, total: number) => string
  readonly profileHeading: string
  readonly profileDescription: string
  readonly fullNameLabel: string
  readonly fullNamePlaceholder: string
  readonly jobTitleLabel: string
  readonly jobTitlePlaceholder: string
  readonly continueLabel: string
  readonly roleHeading: string
  readonly roleDescription: string
  readonly roleGroupLabel: string
  readonly roleOptionLabels: Readonly<Record<Onboarding2RoleId, string>>
  readonly backLabel: string
}

export interface Onboarding2PreviewStep {
  readonly id: Onboarding2StepId
  readonly label: string
  readonly description: string
  readonly status: Onboarding2StepStatus
}

export interface Onboarding2PreviewField {
  readonly id: 'full-name' | 'job-title'
  readonly label: string
  readonly placeholder: string
  readonly value: string
}

export interface Onboarding2PreviewRoleOption {
  readonly id: Onboarding2RoleId
  readonly label: string
  readonly selected: boolean
}

export interface Onboarding2PreviewContent {
  readonly locale: Onboarding2PreviewLocale
  readonly steps: readonly Onboarding2PreviewStep[]
  readonly currentStepId: Onboarding2KnownStepId
  readonly narrowProgressText: string
  readonly profileForm: {
    readonly heading: string
    readonly description: string
    readonly fields: readonly Onboarding2PreviewField[]
    readonly continueLabel: string
  } | null
  readonly roleForm: {
    readonly heading: string
    readonly description: string
    readonly groupLabel: string
    readonly options: readonly Onboarding2PreviewRoleOption[]
    readonly backLabel: string
    readonly continueLabel: string
  } | null
  readonly collectionContract: {
    readonly stepCount: 6
    readonly strategy: 'bounded-content-grown'
    readonly narrowRail: 'hidden-with-step-counter'
    readonly sourceScrollOwner: 'not-captured'
    readonly horizontalOverflowEvidence: 'none-at-four-static-widths'
  }
  readonly evidence: typeof ONBOARDING2_SOURCE_EVIDENCE
}

export interface Onboarding2PreviewFixture {
  readonly locale: Onboarding2PreviewLocale
  readonly copy: Onboarding2PreviewCopy
  readonly seed: Onboarding2PreviewStoreSeed
  readonly contentFor: (state: Onboarding2PreviewStoreState) => Onboarding2PreviewContent
}

const SOURCE_SHAPED_SEED: Onboarding2PreviewStoreSeed = {
  profileDraft: {
    fullName: 'Sam Rivera',
    jobTitle: 'Product Lead',
  },
  roleSelectedOnEntry: 'product',
}

function copyFor(locale: Onboarding2PreviewLocale): Onboarding2PreviewCopy {
  if (locale === 'de') {
    return {
      stepLabels: {
        profile: 'Profil',
        role: 'Rolle',
        source: 'Quelle',
        workspace: 'Arbeitsbereich',
        goals: 'Ziele',
        invite: 'Einladen',
      },
      stepDescriptions: {
        profile: 'Grundlegende Profildaten.',
        role: 'Startansichten anpassen.',
        source: 'Optionaler Entdeckungsimpuls.',
        workspace: 'Arbeitsbereich benennen.',
        goals: 'Erste Workflows auswählen.',
        invite: 'Teammitglieder hinzufügen.',
      },
      progressText: (current, total) => `Schritt ${current} von ${total}`,
      profileHeading: 'Richten Sie Ihr Profil ein',
      profileDescription: 'Ergänzen Sie die Angaben, die Teammitglieder im Arbeitsbereich sehen.',
      fullNameLabel: 'Vollständiger Name',
      fullNamePlaceholder: 'Ihr Name',
      jobTitleLabel: 'Berufsbezeichnung',
      jobTitlePlaceholder: 'Ihre Tätigkeit',
      continueLabel: 'Weiter',
      roleHeading: 'Woran arbeiten Sie?',
      roleDescription: 'Damit wählen wir passende Startansichten für den Arbeitsbereich aus.',
      roleGroupLabel: 'Rolle',
      roleOptionLabels: {
        engineering: 'Entwicklung',
        design: 'Design',
        product: 'Produkt',
        operations: 'Betrieb',
      },
      backLabel: 'Zurück',
    }
  }

  return {
    stepLabels: {
      profile: 'Profile',
      role: 'Role',
      source: 'Source',
      workspace: 'Workspace',
      goals: 'Goals',
      invite: 'Invite',
    },
    stepDescriptions: {
      profile: 'Basic profile details.',
      role: 'Tune starter views.',
      source: 'Optional discovery signal.',
      workspace: 'Name the workspace.',
      goals: 'Pick first workflows.',
      invite: 'Add teammates.',
    },
    progressText: (current, total) => `Step ${current} of ${total}`,
    profileHeading: 'Set up your profile',
    profileDescription: 'Add the details teammates will see across the workspace.',
    fullNameLabel: 'Full name',
    fullNamePlaceholder: 'Your name',
    jobTitleLabel: 'Job title',
    jobTitlePlaceholder: 'What you do',
    continueLabel: 'Continue',
    roleHeading: 'What do you work on?',
    roleDescription: 'We use this to pick the starter views you land on.',
    roleGroupLabel: 'Role',
    roleOptionLabels: {
      engineering: 'Engineering',
      design: 'Design',
      product: 'Product',
      operations: 'Operations',
    },
    backLabel: 'Back',
  }
}

function stepStatus(stepId: Onboarding2StepId, currentStepId: Onboarding2KnownStepId): Onboarding2StepStatus {
  if (stepId === currentStepId) return 'current'
  if (currentStepId === 'role' && stepId === 'profile') return 'complete'
  return 'upcoming'
}

export function createOnboarding2PreviewFixture(
  locale: Onboarding2PreviewLocale = 'en',
  copyOverrides: Partial<Onboarding2PreviewCopy> = {},
): Onboarding2PreviewFixture {
  const copy = { ...copyFor(locale), ...copyOverrides }

  return {
    locale,
    copy,
    seed: {
      profileDraft: { ...SOURCE_SHAPED_SEED.profileDraft },
      roleSelectedOnEntry: SOURCE_SHAPED_SEED.roleSelectedOnEntry,
    },
    contentFor: (state) => {
      const currentIndex = ONBOARDING2_STEP_IDS.indexOf(state.currentStepId)
      const steps = ONBOARDING2_STEP_IDS.map((id) => ({
        id,
        label: copy.stepLabels[id],
        description: copy.stepDescriptions[id],
        status: stepStatus(id, state.currentStepId),
      }))
      const profileForm =
        state.currentStepId === 'profile'
          ? {
              heading: copy.profileHeading,
              description: copy.profileDescription,
              fields: [
                {
                  id: 'full-name' as const,
                  label: copy.fullNameLabel,
                  placeholder: copy.fullNamePlaceholder,
                  value: state.profileDraft.fullName,
                },
                {
                  id: 'job-title' as const,
                  label: copy.jobTitleLabel,
                  placeholder: copy.jobTitlePlaceholder,
                  value: state.profileDraft.jobTitle,
                },
              ],
              continueLabel: copy.continueLabel,
            }
          : null
      const roleForm =
        state.currentStepId === 'role'
          ? {
              heading: copy.roleHeading,
              description: copy.roleDescription,
              groupLabel: copy.roleGroupLabel,
              options: ONBOARDING2_ROLE_IDS.map((id) => ({
                id,
                label: copy.roleOptionLabels[id],
                selected: state.selectedRoleId === id,
              })),
              backLabel: copy.backLabel,
              continueLabel: copy.continueLabel,
            }
          : null

      return {
        locale,
        steps,
        currentStepId: state.currentStepId,
        narrowProgressText: copy.progressText(currentIndex + 1, ONBOARDING2_STEP_IDS.length),
        profileForm,
        roleForm,
        collectionContract: {
          stepCount: 6,
          strategy: 'bounded-content-grown',
          narrowRail: 'hidden-with-step-counter',
          sourceScrollOwner: 'not-captured',
          horizontalOverflowEvidence: 'none-at-four-static-widths',
        },
        evidence: ONBOARDING2_SOURCE_EVIDENCE,
      }
    },
  }
}
