import {
  deriveForms5Validation,
  type Forms5PasswordRequirements,
  type Forms5PlanOption,
  type Forms5PreviewStoreSeed,
  type Forms5PreviewStoreState,
  type Forms5RegionOption,
} from './forms5PreviewStore'

export type Forms5PreviewLocale = 'en' | 'de'
export type Forms5PasswordRequirementId = keyof Forms5PasswordRequirements

export interface Forms5PreviewCopy {
  readonly pageTitle: string
  readonly pageDescription: string
  readonly organisationNameLabel: string
  readonly organisationNamePlaceholder: string
  readonly organisationNameHelper: string
  readonly workspaceAddressLabel: string
  readonly workspaceAddressPlaceholder: string
  readonly workspaceAddressSuffix: string
  readonly workspaceAddressHelper: string
  readonly workspaceAddressAvailable: string
  readonly adminEmailLabel: string
  readonly adminEmailPlaceholder: string
  readonly adminEmailHelper: string
  readonly passwordLabel: string
  readonly passwordPlaceholder: string
  readonly showPasswordLabel: string
  readonly hidePasswordLabel: string
  readonly confirmPasswordLabel: string
  readonly confirmPasswordPlaceholder: string
  readonly confirmPasswordHelper: string
  readonly passwordRequirementLabels: Readonly<Record<Forms5PasswordRequirementId, string>>
  readonly dataRegionLabel: string
  readonly dataRegionHelper: string
  readonly planLegend: string
  readonly consentLabel: string
  readonly createWorkspaceLabel: string
  readonly incompleteStatus: string
  readonly readyStatus: string
  readonly requiredMarker: string
}

export interface Forms5PreviewContent {
  readonly copy: Forms5PreviewCopy
  readonly organisationName: { readonly value: string; readonly valid: boolean }
  readonly workspaceAddress: {
    readonly value: string
    readonly suffix: string
    readonly valid: boolean
    readonly availability: string | null
  }
  readonly adminEmail: { readonly value: string; readonly valid: boolean }
  readonly password: {
    readonly value: string
    readonly visible: boolean
    readonly requirements: Forms5PasswordRequirements
  }
  readonly confirmPassword: {
    readonly value: string
    readonly matches: boolean
  }
  readonly dataRegion: {
    readonly selectedId: string
    readonly choices: readonly Forms5RegionOption[]
  }
  readonly plan: {
    readonly selectedId: string
    readonly choices: readonly Forms5PlanOption[]
  }
  readonly consent: { readonly checked: boolean }
  readonly createWorkspaceEnabled: boolean
  readonly statusText: string
  readonly listStrategy: { readonly kind: 'pane-scroll'; readonly note: string }
}

export interface Forms5PreviewFixture {
  readonly locale: Forms5PreviewLocale
  readonly copy: Forms5PreviewCopy
  readonly storeSeed: Forms5PreviewStoreSeed
  readonly contentFor: (state: Forms5PreviewStoreState) => Forms5PreviewContent
}

const regionOptions: readonly Forms5RegionOption[] = [
  { id: 'eu-west-dublin', label: 'EU West, Dublin' },
  { id: 'eu-central-frankfurt', label: 'EU Central, Frankfurt' },
  { id: 'uk-south-london', label: 'UK South, London' },
  { id: 'us-east-virginia', label: 'US East, Virginia' },
]

const planOptions: readonly Forms5PlanOption[] = [
  {
    id: 'solo',
    label: 'Solo clinic',
    description: 'One location, up to 8 providers.',
    priceLabel: '$49/mo',
  },
  {
    id: 'group',
    label: 'Group practice',
    description: 'Multi-site scheduling and shared rooms.',
    priceLabel: '$149/mo',
  },
  {
    id: 'network',
    label: 'Health network',
    description: 'Unlimited sites with SSO and audit logs.',
    priceLabel: '$420/mo',
  },
]

function optionAt<Option>(options: readonly Option[], index: number): Option {
  const option = options[index]
  if (option === undefined) throw new RangeError(`Missing catalog option at index ${index}.`)
  return option
}

function copyFor(locale: Forms5PreviewLocale): Forms5PreviewCopy {
  if (locale === 'de') {
    return {
      pageTitle: 'Arbeitsbereich bereitstellen',
      pageDescription: 'Richten Sie einen neuen Mandanten für Ihr klinisches Terminplanungskonto ein.',
      organisationNameLabel: 'Name der Organisation',
      organisationNamePlaceholder: 'Riverside Family Health',
      organisationNameHelper: 'Wird Mitarbeitenden auf dem Anmeldebildschirm angezeigt.',
      workspaceAddressLabel: 'Arbeitsbereichsadresse',
      workspaceAddressPlaceholder: 'riverside',
      workspaceAddressSuffix: '.med-sched.app',
      workspaceAddressHelper: 'Kleinbuchstaben, Ziffern und Bindestriche.',
      workspaceAddressAvailable: 'Verfügbar',
      adminEmailLabel: 'Administrator-E-Mail',
      adminEmailPlaceholder: 'admin@riverside.health',
      adminEmailHelper: 'Wird die erste Administratoradresse des Arbeitsbereichs.',
      passwordLabel: 'Passwort',
      passwordPlaceholder: 'Passwort erstellen',
      showPasswordLabel: 'Passwort anzeigen',
      hidePasswordLabel: 'Passwort ausblenden',
      confirmPasswordLabel: 'Passwort bestätigen',
      confirmPasswordPlaceholder: 'Passwort erneut eingeben',
      confirmPasswordHelper: 'Geben Sie das Passwort zur Bestätigung erneut ein.',
      passwordRequirementLabels: {
        minimumLength: 'Mindestens 10 Zeichen',
        mixedCase: 'Groß- und Kleinbuchstaben',
        number: 'Eine Zahl',
        symbol: 'Ein Symbol',
      },
      dataRegionLabel: 'Datenregion',
      dataRegionHelper: 'Patientendaten bleiben in der ausgewählten Region.',
      planLegend: 'Tarif',
      consentLabel:
        'Ich bestätige, dass dieser Arbeitsbereich gemäß unserer unterzeichneten Datenvereinbarung geschützte Gesundheitsdaten verarbeitet.',
      createWorkspaceLabel: 'Arbeitsbereich erstellen',
      incompleteStatus: 'Füllen Sie alle Pflichtfelder aus, um fortzufahren.',
      readyStatus: 'Alles ist geprüft. Sie können den Arbeitsbereich bereitstellen.',
      requiredMarker: '*',
    }
  }

  return {
    pageTitle: 'Provision a workspace',
    pageDescription: 'Stand up a new tenant for your clinical scheduling account.',
    organisationNameLabel: 'Organisation name',
    organisationNamePlaceholder: 'Riverside Family Health',
    organisationNameHelper: 'Shown to staff on the sign-in screen.',
    workspaceAddressLabel: 'Workspace address',
    workspaceAddressPlaceholder: 'riverside',
    workspaceAddressSuffix: '.med-sched.app',
    workspaceAddressHelper: 'Lowercase letters, digits and hyphens.',
    workspaceAddressAvailable: 'Available',
    adminEmailLabel: 'Admin email',
    adminEmailPlaceholder: 'admin@riverside.health',
    adminEmailHelper: 'Becomes the first workspace administrator.',
    passwordLabel: 'Password',
    passwordPlaceholder: 'Create a password',
    showPasswordLabel: 'Show password',
    hidePasswordLabel: 'Hide password',
    confirmPasswordLabel: 'Confirm password',
    confirmPasswordPlaceholder: 'Re-enter password',
    confirmPasswordHelper: 'Type it once more to confirm.',
    passwordRequirementLabels: {
      minimumLength: 'At least 10 characters',
      mixedCase: 'Upper and lower case',
      number: 'A number',
      symbol: 'A symbol',
    },
    dataRegionLabel: 'Data region',
    dataRegionHelper: 'Patient data stays in the selected region.',
    planLegend: 'Plan',
    consentLabel: 'I confirm this workspace will handle protected health information under our signed data agreement.',
    createWorkspaceLabel: 'Create workspace',
    incompleteStatus: 'Complete every required field to continue.',
    readyStatus: 'Everything checks out. You are ready to provision.',
    requiredMarker: '*',
  }
}

function catalogsFor(locale: Forms5PreviewLocale) {
  if (locale === 'en') {
    return {
      regions: regionOptions.map((option) => ({ ...option })),
      plans: planOptions.map((option) => ({ ...option })),
    }
  }
  return {
    regions: regionOptions.map((option) => ({ ...option })),
    plans: [
      {
        ...optionAt(planOptions, 0),
        label: 'Solo-Klinik',
        description: 'Ein Standort, bis zu 8 Leistungserbringer.',
        priceLabel: '49 $/Monat',
      },
      {
        ...optionAt(planOptions, 1),
        label: 'Gemeinschaftspraxis',
        description: 'Standortübergreifende Terminplanung und gemeinsame Räume.',
        priceLabel: '149 $/Monat',
      },
      {
        ...optionAt(planOptions, 2),
        label: 'Gesundheitsnetzwerk für mehrere Standorte',
        description: 'Unbegrenzt viele Standorte mit SSO und Prüfprotokollen.',
        priceLabel: '420 $/Monat',
      },
    ],
  }
}

export function createForms5PreviewFixture(locale: Forms5PreviewLocale = 'en'): Forms5PreviewFixture {
  const copy = copyFor(locale)
  const catalogs = catalogsFor(locale)
  const storeSeed: Forms5PreviewStoreSeed = {
    initialDraft: {
      organisationName: '',
      workspaceAddress: '',
      adminEmail: '',
      password: '',
      confirmPassword: '',
      regionId: 'eu-west-dublin',
      planId: 'group',
      consentConfirmed: false,
    },
    regions: catalogs.regions,
    plans: catalogs.plans,
  }

  return {
    locale,
    copy,
    storeSeed,
    contentFor: (state) => {
      const validation = deriveForms5Validation(state.draft, state.addressAvailability, state)
      const selectedRegion = catalogs.regions.find((region) => region.id === state.draft.regionId)
      const selectedPlan = catalogs.plans.find((plan) => plan.id === state.draft.planId)
      const addressAvailability =
        state.addressAvailabilityMessage ??
        (state.addressAvailability === 'available' ? copy.workspaceAddressAvailable : null)
      return {
        copy,
        organisationName: { value: state.draft.organisationName, valid: validation.organisationName },
        workspaceAddress: {
          value: state.draft.workspaceAddress,
          suffix: copy.workspaceAddressSuffix,
          valid: validation.workspaceAddress,
          availability: addressAvailability,
        },
        adminEmail: { value: state.draft.adminEmail, valid: validation.adminEmail },
        password: {
          value: state.draft.password,
          visible: state.passwordVisible,
          requirements: validation.password,
        },
        confirmPassword: {
          value: state.draft.confirmPassword,
          matches: validation.confirmPassword,
        },
        dataRegion: {
          selectedId: selectedRegion?.id ?? '',
          choices: catalogs.regions,
        },
        plan: {
          selectedId: selectedPlan?.id ?? '',
          choices: catalogs.plans,
        },
        consent: { checked: state.draft.consentConfirmed },
        createWorkspaceEnabled: validation.canCreateWorkspace,
        statusText: validation.canCreateWorkspace ? copy.readyStatus : copy.incompleteStatus,
        listStrategy: {
          kind: 'pane-scroll',
          note: 'The bounded form body scrolls independently while the create and status footer stays outside it.',
        },
      }
    },
  }
}
