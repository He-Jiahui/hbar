import { createStore } from 'zustand/vanilla'

export type Forms5TextFieldId = 'organisationName' | 'workspaceAddress' | 'adminEmail' | 'password' | 'confirmPassword'
export type Forms5AddressAvailability = 'unchecked' | 'checking' | 'available' | 'unavailable' | 'error'

export interface Forms5RegionOption {
  readonly id: string
  readonly label: string
}

export interface Forms5PlanOption {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly priceLabel: string
}

export interface Forms5Draft {
  readonly organisationName: string
  readonly workspaceAddress: string
  readonly adminEmail: string
  readonly password: string
  readonly confirmPassword: string
  readonly regionId: string
  readonly planId: string
  readonly consentConfirmed: boolean
}

export interface Forms5PreviewStoreSeed {
  readonly initialDraft: Forms5Draft
  readonly regions: readonly Forms5RegionOption[]
  readonly plans: readonly Forms5PlanOption[]
}

export interface Forms5PasswordRequirements {
  readonly minimumLength: boolean
  readonly mixedCase: boolean
  readonly number: boolean
  readonly symbol: boolean
}

export interface Forms5Validation {
  readonly organisationName: boolean
  readonly workspaceAddress: boolean
  readonly adminEmail: boolean
  readonly password: Forms5PasswordRequirements
  readonly confirmPassword: boolean
  readonly selection: boolean
  readonly consent: boolean
  readonly canCreateWorkspace: boolean
}

export interface Forms5CreateWorkspaceRequest extends Forms5Draft {}

export interface Forms5PreviewStoreState extends Forms5PreviewStoreSeed {
  readonly draft: Forms5Draft
  readonly addressAvailability: Forms5AddressAvailability
  readonly addressAvailabilityMessage: string | null
  readonly passwordVisible: boolean
  readonly setTextField: (fieldId: Forms5TextFieldId, value: string) => boolean
  readonly selectRegion: (regionId: string) => boolean
  readonly selectPlan: (planId: string) => boolean
  readonly setConsent: (checked: boolean) => boolean
  readonly setAddressAvailability: (
    workspaceAddress: string,
    availability: Forms5AddressAvailability,
    message?: string | null,
  ) => boolean
  readonly togglePasswordVisibility: () => boolean
  readonly requestCreateWorkspace: () => Forms5CreateWorkspaceRequest | null
}

export function deriveForms5PasswordRequirements(password: string): Forms5PasswordRequirements {
  return {
    minimumLength: password.length >= 10,
    mixedCase: /[a-z]/.test(password) && /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  }
}

function isValidWorkspaceAddress(value: string): boolean {
  return /^[a-z0-9-]+$/.test(value)
}

function isValidAdminEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function deriveForms5Validation(
  draft: Forms5Draft,
  addressAvailability: Forms5AddressAvailability,
  seed: Pick<Forms5PreviewStoreSeed, 'regions' | 'plans'>,
): Forms5Validation {
  const password = deriveForms5PasswordRequirements(draft.password)
  const allPasswordRequirementsMet = Object.values(password).every(Boolean)
  const organisationName = draft.organisationName.trim().length > 0
  const workspaceAddress = isValidWorkspaceAddress(draft.workspaceAddress) && addressAvailability === 'available'
  const adminEmail = isValidAdminEmail(draft.adminEmail)
  const confirmPassword = draft.password.length > 0 && draft.password === draft.confirmPassword
  const selection =
    seed.regions.some((region) => region.id === draft.regionId) && seed.plans.some((plan) => plan.id === draft.planId)
  const consent = draft.consentConfirmed

  return {
    organisationName,
    workspaceAddress,
    adminEmail,
    password,
    confirmPassword,
    selection,
    consent,
    canCreateWorkspace:
      organisationName &&
      workspaceAddress &&
      adminEmail &&
      allPasswordRequirementsMet &&
      confirmPassword &&
      selection &&
      consent,
  }
}

function assertUniqueIds(options: readonly { readonly id: string }[], label: string): void {
  const ids = options.map((option) => option.id)
  if (ids.some((id) => !id.trim())) throw new RangeError(`${label} IDs must not be empty.`)
  if (new Set(ids).size !== ids.length) throw new RangeError(`${label} IDs must be unique.`)
}

function assertAvailableChoice(options: readonly { readonly id: string }[], id: string, label: string): void {
  if (!options.some((option) => option.id === id)) {
    throw new RangeError(`The initial ${label} must reference an available option.`)
  }
}

function cloneDraft(draft: Forms5Draft): Forms5Draft {
  return { ...draft }
}

export function createForms5PreviewStore(seed: Forms5PreviewStoreSeed) {
  assertUniqueIds(seed.regions, 'Region')
  assertUniqueIds(seed.plans, 'Plan')
  assertAvailableChoice(seed.regions, seed.initialDraft.regionId, 'region')
  assertAvailableChoice(seed.plans, seed.initialDraft.planId, 'plan')

  const initialDraft = cloneDraft(seed.initialDraft)
  return createStore<Forms5PreviewStoreState>((set, get) => ({
    ...seed,
    regions: seed.regions.map((region) => ({ ...region })),
    plans: seed.plans.map((plan) => ({ ...plan })),
    draft: cloneDraft(initialDraft),
    addressAvailability: 'unchecked',
    addressAvailabilityMessage: null,
    passwordVisible: false,
    setTextField: (fieldId, value) => {
      const state = get()
      if (state.draft[fieldId] === value) return false
      set({
        draft: { ...state.draft, [fieldId]: value },
        ...(fieldId === 'workspaceAddress'
          ? { addressAvailability: 'unchecked' as const, addressAvailabilityMessage: null }
          : {}),
      })
      return true
    },
    selectRegion: (regionId) => {
      const state = get()
      if (!state.regions.some((region) => region.id === regionId) || state.draft.regionId === regionId) {
        return false
      }
      set({ draft: { ...state.draft, regionId } })
      return true
    },
    selectPlan: (planId) => {
      const state = get()
      if (!state.plans.some((plan) => plan.id === planId) || state.draft.planId === planId) return false
      set({ draft: { ...state.draft, planId } })
      return true
    },
    setConsent: (checked) => {
      const state = get()
      if (state.draft.consentConfirmed === checked) return false
      set({ draft: { ...state.draft, consentConfirmed: checked } })
      return true
    },
    setAddressAvailability: (workspaceAddress, availability, message = null) => {
      const state = get()
      if (state.draft.workspaceAddress !== workspaceAddress) return false
      if (state.addressAvailability === availability && state.addressAvailabilityMessage === message) {
        return false
      }
      set({ addressAvailability: availability, addressAvailabilityMessage: message })
      return true
    },
    togglePasswordVisibility: () => {
      const passwordVisible = !get().passwordVisible
      set({ passwordVisible })
      return passwordVisible
    },
    requestCreateWorkspace: () => {
      const state = get()
      const validation = deriveForms5Validation(state.draft, state.addressAvailability, state)
      return validation.canCreateWorkspace ? cloneDraft(state.draft) : null
    },
  }))
}
