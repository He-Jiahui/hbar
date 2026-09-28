import { createStore } from 'zustand/vanilla'

export type SettingsForm3Theme = 'system' | 'light' | 'dark'
export type SettingsForm3Density = 'comfortable' | 'cozy' | 'compact'
export type SettingsForm3Language = 'en' | 'de' | 'fr' | 'ja'

export interface SettingsForm3PreferenceValues {
  readonly theme: SettingsForm3Theme
  readonly density: SettingsForm3Density
  readonly language: SettingsForm3Language
  readonly weeklySummary: boolean
  readonly mentions: boolean
  readonly commentReplies: boolean
  readonly notificationSounds: boolean
}

export type SettingsForm3PreferenceId = keyof SettingsForm3PreferenceValues

export type SettingsForm3PreferenceChange = {
  readonly [K in SettingsForm3PreferenceId]: {
    readonly fieldId: K
    readonly value: SettingsForm3PreferenceValues[K]
  }
}[SettingsForm3PreferenceId]

export type SettingsForm3SaveState = 'clean' | 'dirty' | 'saving' | 'saved'
export type SettingsForm3Status = 'unsaved' | 'saved'

export interface SettingsForm3PreviewStoreSeed {
  readonly saved: SettingsForm3PreferenceValues
  readonly draft: SettingsForm3PreferenceValues
}

export interface SettingsForm3PreviewStoreState {
  readonly saved: SettingsForm3PreferenceValues
  readonly draft: SettingsForm3PreferenceValues
  readonly changedPreferenceIds: readonly SettingsForm3PreferenceId[]
  readonly saveState: SettingsForm3SaveState
  readonly status: SettingsForm3Status
  readonly changePreference: (change: SettingsForm3PreferenceChange) => boolean
  readonly cancel: () => boolean
  readonly beginSave: () => boolean
  readonly resolveSave: () => boolean
}

const preferenceIds: readonly SettingsForm3PreferenceId[] = [
  'theme',
  'density',
  'language',
  'weeklySummary',
  'mentions',
  'commentReplies',
  'notificationSounds',
]

const themeIds: readonly SettingsForm3Theme[] = ['system', 'light', 'dark']
const densityIds: readonly SettingsForm3Density[] = ['comfortable', 'cozy', 'compact']
const languageIds: readonly SettingsForm3Language[] = ['en', 'de', 'fr', 'ja']

function changedIds(
  draft: SettingsForm3PreferenceValues,
  saved: SettingsForm3PreferenceValues,
): readonly SettingsForm3PreferenceId[] {
  return preferenceIds.filter((fieldId) => draft[fieldId] !== saved[fieldId])
}

export function isSettingsForm3PreferenceChange(value: unknown): value is SettingsForm3PreferenceChange {
  if (typeof value !== 'object' || value === null || !('fieldId' in value) || !('value' in value)) return false
  const { fieldId, value: candidate } = value
  if (typeof fieldId !== 'string') return false

  switch (fieldId) {
    case 'theme':
      return typeof candidate === 'string' && themeIds.some((id) => id === candidate)
    case 'density':
      return typeof candidate === 'string' && densityIds.some((id) => id === candidate)
    case 'language':
      return typeof candidate === 'string' && languageIds.some((id) => id === candidate)
    case 'weeklySummary':
    case 'mentions':
    case 'commentReplies':
    case 'notificationSounds':
      return typeof candidate === 'boolean'
    default:
      return false
  }
}

function applyChange(
  current: SettingsForm3PreferenceValues,
  change: SettingsForm3PreferenceChange,
): SettingsForm3PreferenceValues {
  switch (change.fieldId) {
    case 'theme':
      return { ...current, theme: change.value }
    case 'density':
      return { ...current, density: change.value }
    case 'language':
      return { ...current, language: change.value }
    case 'weeklySummary':
      return { ...current, weeklySummary: change.value }
    case 'mentions':
      return { ...current, mentions: change.value }
    case 'commentReplies':
      return { ...current, commentReplies: change.value }
    case 'notificationSounds':
      return { ...current, notificationSounds: change.value }
  }
}

function copyValues(values: SettingsForm3PreferenceValues): SettingsForm3PreferenceValues {
  return { ...values }
}

export function createSettingsForm3PreviewStore(seed: SettingsForm3PreviewStoreSeed) {
  const saved = copyValues(seed.saved)
  const draft = copyValues(seed.draft)
  const initialChanges = changedIds(draft, saved)

  return createStore<SettingsForm3PreviewStoreState>((set) => ({
    saved,
    draft,
    changedPreferenceIds: initialChanges,
    saveState: initialChanges.length > 0 ? 'dirty' : 'clean',
    status: initialChanges.length > 0 ? 'unsaved' : 'saved',
    changePreference: (change) => {
      if (!isSettingsForm3PreferenceChange(change)) return false
      let changed = false
      set((state) => {
        const nextDraft = applyChange(state.draft, change)
        if (state.draft[change.fieldId] === nextDraft[change.fieldId]) return state
        const nextChanges = changedIds(nextDraft, state.saved)
        changed = true
        return {
          draft: nextDraft,
          changedPreferenceIds: nextChanges,
          saveState: nextChanges.length > 0 ? 'dirty' : 'clean',
          status: nextChanges.length > 0 ? 'unsaved' : 'saved',
        }
      })
      return changed
    },
    cancel: () => {
      let cancelled = false
      set((state) => {
        if (state.saveState !== 'dirty') return state
        cancelled = true
        return {
          draft: copyValues(state.saved),
          changedPreferenceIds: [],
          saveState: 'clean',
          status: 'saved',
        }
      })
      return cancelled
    },
    beginSave: () => {
      let started = false
      set((state) => {
        if (state.saveState !== 'dirty') return state
        started = true
        return { saveState: 'saving' }
      })
      return started
    },
    resolveSave: () => {
      let resolved = false
      set((state) => {
        if (state.saveState !== 'saving') return state
        resolved = true
        return {
          saved: copyValues(state.draft),
          changedPreferenceIds: [],
          saveState: 'saved',
          status: 'saved',
        }
      })
      return resolved
    },
  }))
}
