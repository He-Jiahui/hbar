import { createStore } from 'zustand/vanilla'

export const ONBOARDING2_STEP_IDS = ['profile', 'role', 'source', 'workspace', 'goals', 'invite'] as const

export const ONBOARDING2_ROLE_IDS = ['engineering', 'design', 'product', 'operations'] as const

export const ONBOARDING2_PROFILE_FIELD_IDS = ['full-name', 'job-title'] as const

export type Onboarding2StepId = (typeof ONBOARDING2_STEP_IDS)[number]
export type Onboarding2KnownStepId = 'profile' | 'role'
export type Onboarding2RoleId = (typeof ONBOARDING2_ROLE_IDS)[number]
export type Onboarding2ProfileFieldId = (typeof ONBOARDING2_PROFILE_FIELD_IDS)[number]

export interface Onboarding2ProfileDraft {
  readonly fullName: string
  readonly jobTitle: string
}

export interface Onboarding2PreviewStoreSeed {
  readonly profileDraft: Onboarding2ProfileDraft
  readonly roleSelectedOnEntry: Onboarding2RoleId
}

export type Onboarding2HostRequest =
  | {
      readonly kind: 'step-navigation-request'
      readonly targetStepId: Onboarding2StepId
      readonly resultBehavior: 'typed-request-only-source-result-unobserved'
    }
  | {
      readonly kind: 'back-request'
      readonly fromStepId: 'role'
      readonly resultBehavior: 'typed-request-only-source-result-unobserved'
    }
  | {
      readonly kind: 'role-selection-request'
      readonly roleId: Onboarding2RoleId
      readonly resultBehavior: 'typed-request-only-source-result-unobserved'
    }

export interface Onboarding2PreviewStoreState {
  readonly currentStepId: Onboarding2KnownStepId
  readonly profileDraft: Onboarding2ProfileDraft
  readonly selectedRoleId: Onboarding2RoleId | null
  readonly setProfileFieldValue: (fieldId: Onboarding2ProfileFieldId, value: string) => boolean
  readonly continueProfile: () => boolean
  readonly requestStepNavigation: (stepId: string) => Onboarding2HostRequest | null
  readonly requestBack: () => Onboarding2HostRequest | null
  readonly requestRoleSelection: (roleId: string) => Onboarding2HostRequest | null
}

function isStepId(value: string): value is Onboarding2StepId {
  return ONBOARDING2_STEP_IDS.some((id) => id === value)
}

function isRoleId(value: string): value is Onboarding2RoleId {
  return ONBOARDING2_ROLE_IDS.some((id) => id === value)
}

function cloneProfileDraft(draft: Onboarding2ProfileDraft): Onboarding2ProfileDraft {
  return { fullName: draft.fullName, jobTitle: draft.jobTitle }
}

export function createOnboarding2PreviewStore(seed: Onboarding2PreviewStoreSeed) {
  const initialProfileDraft = cloneProfileDraft(seed.profileDraft)
  const roleSelectedOnEntry = seed.roleSelectedOnEntry

  return createStore<Onboarding2PreviewStoreState>((set, get) => ({
    currentStepId: 'profile',
    profileDraft: initialProfileDraft,
    selectedRoleId: null,
    setProfileFieldValue: (fieldId, value) => {
      const state = get()
      if (state.currentStepId !== 'profile') return false
      if (fieldId === 'full-name') {
        if (state.profileDraft.fullName === value) return false
        set({ profileDraft: { ...state.profileDraft, fullName: value } })
        return true
      }
      if (fieldId === 'job-title') {
        if (state.profileDraft.jobTitle === value) return false
        set({ profileDraft: { ...state.profileDraft, jobTitle: value } })
        return true
      }
      return false
    },
    continueProfile: () => {
      if (get().currentStepId !== 'profile') return false
      set({ currentStepId: 'role', selectedRoleId: roleSelectedOnEntry })
      return true
    },
    requestStepNavigation: (stepId) => {
      if (!isStepId(stepId) || stepId === get().currentStepId) return null
      return {
        kind: 'step-navigation-request',
        targetStepId: stepId,
        resultBehavior: 'typed-request-only-source-result-unobserved',
      }
    },
    requestBack: () => {
      if (get().currentStepId !== 'role') return null
      return {
        kind: 'back-request',
        fromStepId: 'role',
        resultBehavior: 'typed-request-only-source-result-unobserved',
      }
    },
    requestRoleSelection: (roleId) => {
      if (!isRoleId(roleId) || get().currentStepId !== 'role') return null
      return {
        kind: 'role-selection-request',
        roleId,
        resultBehavior: 'typed-request-only-source-result-unobserved',
      }
    },
  }))
}
