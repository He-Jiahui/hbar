import { createStore } from 'zustand/vanilla'

export const ONBOARDING7_REGION_IDS = ['us-east', 'eu-central', 'ap-southeast'] as const

export type Onboarding7RegionId = (typeof ONBOARDING7_REGION_IDS)[number]

export function isOnboarding7RegionId(value: string): value is Onboarding7RegionId {
  return ONBOARDING7_REGION_IDS.some((regionId) => regionId === value)
}

export interface Onboarding7PreviewStoreSeed {
  readonly workspaceName: string
  readonly slug: string
  readonly urlPrefix: string
  readonly regionId: Onboarding7RegionId
  readonly privateWorkspace: boolean
}

export type Onboarding7HostRequest =
  | {
      readonly kind: 'slug-change-request'
      readonly value: string
      readonly resultBehavior: 'slug-preview-derivation-unverified'
    }
  | {
      readonly kind: 'back-request'
      readonly resultBehavior: 'navigation-unverified'
    }
  | {
      readonly kind: 'continue-request'
      readonly resultBehavior: 'continue-or-workspace-creation-unverified'
    }

export interface Onboarding7PreviewStoreState extends Onboarding7PreviewStoreSeed {
  readonly updateWorkspaceName: (value: string) => void
  readonly requestSlugChange: (value: string) => Onboarding7HostRequest
  readonly selectRegion: (regionId: string) => boolean
  readonly setPrivateWorkspace: (privateWorkspace: boolean) => void
  readonly requestBack: () => Onboarding7HostRequest
  readonly requestContinue: () => Onboarding7HostRequest
}

export function createOnboarding7PreviewStore(seed: Onboarding7PreviewStoreSeed) {
  if (!isOnboarding7RegionId(seed.regionId)) {
    throw new RangeError(`Unknown Onboarding 7 region ID: ${seed.regionId}`)
  }

  const initialValues = {
    workspaceName: seed.workspaceName,
    slug: seed.slug,
    urlPrefix: seed.urlPrefix,
    regionId: seed.regionId,
    privateWorkspace: seed.privateWorkspace,
  } satisfies Onboarding7PreviewStoreSeed

  return createStore<Onboarding7PreviewStoreState>((set) => ({
    ...initialValues,
    updateWorkspaceName: (workspaceName) => set({ workspaceName }),
    requestSlugChange: (value) => ({
      kind: 'slug-change-request',
      value,
      resultBehavior: 'slug-preview-derivation-unverified',
    }),
    selectRegion: (regionId) => {
      if (!isOnboarding7RegionId(regionId)) return false
      set({ regionId })
      return true
    },
    setPrivateWorkspace: (privateWorkspace) => set({ privateWorkspace }),
    requestBack: () => ({ kind: 'back-request', resultBehavior: 'navigation-unverified' }),
    requestContinue: () => ({
      kind: 'continue-request',
      resultBehavior: 'continue-or-workspace-creation-unverified',
    }),
  }))
}
