import { createStore } from 'zustand/vanilla'

export const FORMS11_ENVIRONMENT_KIND_IDS = ['preview', 'staging', 'production'] as const
export const FORMS11_REGION_IDS = [
  'us-east-n-virginia',
  'us-west-oregon',
  'europe-ireland',
  'asia-pacific-sydney',
] as const

export const FORMS11_DEFAULT_DESCRIPTION_COUNTER_LIMIT = 160

export type Forms11EnvironmentKindId = (typeof FORMS11_ENVIRONMENT_KIND_IDS)[number]
export type Forms11RegionId = (typeof FORMS11_REGION_IDS)[number]

export interface Forms11EnvironmentDraft {
  readonly environmentKindId: Forms11EnvironmentKindId
  readonly name: string
  readonly regionId: Forms11RegionId
  readonly copyVariablesFromId: string
  readonly autoDeployOnPush: boolean
  readonly description: string
}

export type Forms11HostRequest =
  | {
      readonly kind: 'create-environment'
      readonly draft: Forms11EnvironmentDraft
    }
  | {
      readonly kind: 'cancel'
    }
  | {
      readonly kind: 'close'
    }

export interface Forms11PreviewStoreState {
  readonly draft: Forms11EnvironmentDraft
  readonly selectEnvironmentKind: (environmentKindId: string) => boolean
  readonly setName: (name: string) => boolean
  readonly setRegion: (regionId: string) => boolean
  readonly setCopyVariablesFrom: (sourceId: string) => boolean
  readonly setAutoDeployOnPush: (enabled: boolean) => boolean
  readonly setDescription: (description: string) => boolean
  readonly requestCreate: () => Forms11HostRequest | null
  readonly requestCancel: () => Forms11HostRequest
  readonly requestClose: () => Forms11HostRequest
}

export interface Forms11DraftValidity {
  readonly normalizedSlug: string
  readonly hasRequiredName: boolean
  readonly canRequestCreate: boolean
}

function isEnvironmentKindId(value: string): value is Forms11EnvironmentKindId {
  return FORMS11_ENVIRONMENT_KIND_IDS.some((id) => id === value)
}

function isRegionId(value: string): value is Forms11RegionId {
  return FORMS11_REGION_IDS.some((id) => id === value)
}

export function deriveForms11Slug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function deriveForms11DraftValidity(draft: Forms11EnvironmentDraft): Forms11DraftValidity {
  const normalizedSlug = deriveForms11Slug(draft.name)
  const hasRequiredName = draft.name.trim().length > 0

  return {
    normalizedSlug,
    hasRequiredName,
    canRequestCreate: hasRequiredName,
  }
}

function cloneDraft(draft: Forms11EnvironmentDraft): Forms11EnvironmentDraft {
  return { ...draft }
}

export function createForms11PreviewStore() {
  const initialDraft: Forms11EnvironmentDraft = {
    environmentKindId: 'preview',
    name: '',
    regionId: 'us-east-n-virginia',
    copyVariablesFromId: 'none',
    autoDeployOnPush: true,
    description: '',
  }

  return createStore<Forms11PreviewStoreState>((set, get) => ({
    draft: initialDraft,
    selectEnvironmentKind: (environmentKindId) => {
      if (!isEnvironmentKindId(environmentKindId)) return false
      const state = get()
      if (state.draft.environmentKindId === environmentKindId) return false
      set({ draft: { ...state.draft, environmentKindId } })
      return true
    },
    setName: (name) => {
      const state = get()
      if (state.draft.name === name) return false
      set({ draft: { ...state.draft, name } })
      return true
    },
    setRegion: (regionId) => {
      if (!isRegionId(regionId)) return false
      const state = get()
      if (state.draft.regionId === regionId) return false
      set({ draft: { ...state.draft, regionId } })
      return true
    },
    setCopyVariablesFrom: (sourceId) => {
      if (sourceId.length === 0) return false
      const state = get()
      if (state.draft.copyVariablesFromId === sourceId) return false
      set({ draft: { ...state.draft, copyVariablesFromId: sourceId } })
      return true
    },
    setAutoDeployOnPush: (enabled) => {
      const state = get()
      if (state.draft.autoDeployOnPush === enabled) return false
      set({ draft: { ...state.draft, autoDeployOnPush: enabled } })
      return true
    },
    setDescription: (description) => {
      const state = get()
      if (state.draft.description === description) return false
      set({ draft: { ...state.draft, description } })
      return true
    },
    requestCreate: () => {
      const draft = get().draft
      if (!deriveForms11DraftValidity(draft).canRequestCreate) return null
      return { kind: 'create-environment', draft: cloneDraft(draft) }
    },
    requestCancel: () => ({ kind: 'cancel' }),
    requestClose: () => ({ kind: 'close' }),
  }))
}
