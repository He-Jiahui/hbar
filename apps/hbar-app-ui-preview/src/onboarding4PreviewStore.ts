import { createStore } from 'zustand/vanilla'

export const ONBOARDING4_USE_CASE_IDS = [
  'plan-roadmap',
  'run-sprints',
  'triage-requests',
  'write-things-down',
  'automate-handoffs',
  'report-delivery',
] as const

export const ONBOARDING4_TEAM_SIZE_IDS = ['just-me', '2-10', '11-50', '50-plus'] as const

export const ONBOARDING4_MAX_USE_CASES = ONBOARDING4_USE_CASE_IDS.length
export const ONBOARDING4_MAX_TEAM_SIZES = ONBOARDING4_TEAM_SIZE_IDS.length

export type Onboarding4UseCaseId = (typeof ONBOARDING4_USE_CASE_IDS)[number]
export type Onboarding4TeamSizeId = (typeof ONBOARDING4_TEAM_SIZE_IDS)[number]

export interface Onboarding4PreviewStoreSeed {
  readonly useCaseIds: readonly string[]
  readonly initialUseCaseId: string
  readonly teamSizeIds: readonly string[]
  readonly initialTeamSizeId: string
}

export type Onboarding4HostRequest =
  | {
      readonly kind: 'back-request'
      readonly fromStepId: 'use-case'
      readonly resultBehavior: 'typed-request-only-navigation-result-unverified'
    }
  | {
      readonly kind: 'continue-request'
      readonly fromStepId: 'use-case'
      readonly useCaseId: Onboarding4UseCaseId | null
      readonly teamSizeId: Onboarding4TeamSizeId | null
      readonly resultBehavior: 'typed-request-only-navigation-result-unverified'
    }

export interface Onboarding4PreviewStoreState {
  readonly useCaseIds: readonly Onboarding4UseCaseId[]
  readonly selectedUseCaseId: Onboarding4UseCaseId | null
  readonly teamSizeIds: readonly Onboarding4TeamSizeId[]
  readonly selectedTeamSizeId: Onboarding4TeamSizeId | null
  readonly selectTeamSize: (teamSizeId: string) => boolean
  readonly selectUseCase: (useCaseId: string) => boolean
  readonly requestBack: () => Onboarding4HostRequest
  readonly requestContinue: () => Onboarding4HostRequest
}

function isUseCaseId(value: string): value is Onboarding4UseCaseId {
  return ONBOARDING4_USE_CASE_IDS.some((id) => id === value)
}

function isTeamSizeId(value: string): value is Onboarding4TeamSizeId {
  return ONBOARDING4_TEAM_SIZE_IDS.some((id) => id === value)
}

function normalizeIds<TId extends string>(
  requestedIds: readonly string[],
  isKnownId: (id: string) => id is TId,
  maximum: number,
): readonly TId[] {
  const unique: TId[] = []

  for (const requestedId of requestedIds) {
    if (!isKnownId(requestedId) || unique.includes(requestedId)) continue
    if (unique.length === maximum) break
    unique.push(requestedId)
  }

  return unique
}

export function createOnboarding4PreviewStore(seed: Onboarding4PreviewStoreSeed) {
  const useCaseIds = normalizeIds(seed.useCaseIds, isUseCaseId, ONBOARDING4_MAX_USE_CASES)
  const teamSizeIds = normalizeIds(seed.teamSizeIds, isTeamSizeId, ONBOARDING4_MAX_TEAM_SIZES)
  const initialUseCaseId =
    isUseCaseId(seed.initialUseCaseId) && useCaseIds.includes(seed.initialUseCaseId) ? seed.initialUseCaseId : null
  const initialTeamSizeId =
    isTeamSizeId(seed.initialTeamSizeId) && teamSizeIds.includes(seed.initialTeamSizeId) ? seed.initialTeamSizeId : null

  return createStore<Onboarding4PreviewStoreState>((set, get) => ({
    useCaseIds,
    selectedUseCaseId: initialUseCaseId,
    teamSizeIds,
    selectedTeamSizeId: initialTeamSizeId,
    selectTeamSize: (teamSizeId) => {
      if (!isTeamSizeId(teamSizeId) || !teamSizeIds.includes(teamSizeId)) return false
      if (get().selectedTeamSizeId === teamSizeId) return false
      set({ selectedTeamSizeId: teamSizeId })
      return true
    },
    selectUseCase: (useCaseId) => {
      if (!isUseCaseId(useCaseId) || !useCaseIds.includes(useCaseId)) return false
      if (get().selectedUseCaseId === useCaseId) return false
      set({ selectedUseCaseId: useCaseId })
      return true
    },
    requestBack: () => ({
      kind: 'back-request',
      fromStepId: 'use-case',
      resultBehavior: 'typed-request-only-navigation-result-unverified',
    }),
    requestContinue: () => {
      const state = get()
      return {
        kind: 'continue-request',
        fromStepId: 'use-case',
        useCaseId: state.selectedUseCaseId,
        teamSizeId: state.selectedTeamSizeId,
        resultBehavior: 'typed-request-only-navigation-result-unverified',
      }
    },
  }))
}
