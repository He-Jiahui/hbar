import { createStore } from 'zustand/vanilla'

export type SettingsForm1PreviewFieldKind =
  | 'text'
  | 'text-prefix'
  | 'textarea'
  | 'select'
  | 'switch'
  | 'checkbox'
export type SettingsForm1PreviewSaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error'
export type SettingsForm1PreviewFeedback = 'none' | 'saved' | 'cancelled' | 'save-failed'
export type SettingsForm1PreviewValue = string | boolean

export interface SettingsForm1PreviewFieldSeed {
  readonly id: string
  readonly kind: SettingsForm1PreviewFieldKind
  readonly value: SettingsForm1PreviewValue
  readonly savedValue?: SettingsForm1PreviewValue | undefined
  readonly allowedValueIds?: readonly string[] | undefined
}

export interface SettingsForm1PreviewSectionSeed {
  readonly id: string
}

export interface SettingsForm1PreviewStoreSeed {
  readonly sections: readonly SettingsForm1PreviewSectionSeed[]
  readonly initialSelectedSectionId: string | undefined
  readonly fields: readonly SettingsForm1PreviewFieldSeed[]
  readonly initialSaveState: 'clean' | 'dirty'
  readonly initiallyChangedFieldIds: readonly string[]
}

export interface SettingsForm1PreviewFieldValue {
  readonly id: string
  readonly kind: SettingsForm1PreviewFieldKind
  readonly value: SettingsForm1PreviewValue
  readonly savedValue: SettingsForm1PreviewValue
  readonly changed: boolean
  readonly allowedValueIds: readonly string[] | undefined
}

export interface SettingsForm1PreviewStoreState {
  readonly sectionIds: readonly string[]
  readonly selectedSectionId: string | undefined
  readonly fields: readonly SettingsForm1PreviewFieldValue[]
  readonly saveState: SettingsForm1PreviewSaveState
  readonly feedback: SettingsForm1PreviewFeedback
  readonly selectSection: (sectionId: string) => boolean
  readonly reconcileSections: (sectionIds: readonly string[]) => void
  readonly changeField: (fieldId: string, value: SettingsForm1PreviewValue) => boolean
  readonly beginSave: () => boolean
  readonly resolveSave: () => boolean
  readonly rejectSave: () => boolean
  readonly cancel: () => boolean
}

function uniqueIds(ids: readonly string[]): readonly string[] {
  return [...new Set(ids)]
}

function normalizeSeed(seed: SettingsForm1PreviewStoreSeed) {
  const sectionIds = uniqueIds(seed.sections.map((section) => section.id))
  const fieldsById = new Map<string, SettingsForm1PreviewFieldSeed>()
  for (const field of seed.fields) {
    if (!fieldsById.has(field.id)) fieldsById.set(field.id, field)
  }
  const initiallyChangedFieldIds = new Set(seed.initiallyChangedFieldIds)
  const fields = [...fieldsById.values()].map((field) => ({
    id: field.id,
    kind: field.kind,
    value: field.value,
    savedValue: field.savedValue ?? field.value,
    changed: initiallyChangedFieldIds.has(field.id),
    allowedValueIds: field.allowedValueIds === undefined ? undefined : uniqueIds(field.allowedValueIds),
  }))
  return {
    sectionIds,
    fields,
    selectedSectionId:
      seed.initialSelectedSectionId !== undefined && sectionIds.includes(seed.initialSelectedSectionId)
        ? seed.initialSelectedSectionId
        : undefined,
  }
}

export function createSettingsForm1PreviewStore(seed: SettingsForm1PreviewStoreSeed) {
  const projection = normalizeSeed(seed)
  return createStore<SettingsForm1PreviewStoreState>((set) => ({
    ...projection,
    saveState: seed.initialSaveState,
    feedback: 'none',
    selectSection: (sectionId) => {
      let selected = false
      set((state) => {
        if (!state.sectionIds.includes(sectionId) || state.selectedSectionId === sectionId) return state
        selected = true
        return { selectedSectionId: sectionId }
      })
      return selected
    },
    reconcileSections: (sectionIds) =>
      set((state) => {
        const nextSectionIds = uniqueIds(sectionIds)
        return {
          sectionIds: nextSectionIds,
          selectedSectionId:
            state.selectedSectionId !== undefined && nextSectionIds.includes(state.selectedSectionId)
              ? state.selectedSectionId
              : undefined,
        }
      }),
    changeField: (fieldId, value) => {
      let changed = false
      set((state) => {
        if (state.saveState === 'saving') return state
        const fieldIndex = state.fields.findIndex((field) => field.id === fieldId)
        if (fieldIndex < 0) return state
        const field = state.fields[fieldIndex]
        if (!field) return state
        const booleanField = field.kind === 'switch' || field.kind === 'checkbox'
        if (booleanField ? typeof value !== 'boolean' : typeof value !== 'string') return state
        if (field.kind === 'select' && (typeof value !== 'string' || !field.allowedValueIds?.includes(value))) {
          return state
        }
        if (field.value === value) return state
        const nextFields = [...state.fields]
        nextFields[fieldIndex] = { ...field, value, changed: value !== field.savedValue }
        const hasChanges = nextFields.some((item) => item.changed)
        changed = true
        return {
          fields: nextFields,
          saveState: hasChanges ? 'dirty' : 'clean',
          feedback: 'none',
        }
      })
      return changed
    },
    beginSave: () => {
      let started = false
      set((state) => {
        if (state.saveState !== 'dirty' && state.saveState !== 'error') return state
        started = true
        return { saveState: 'saving', feedback: 'none' }
      })
      return started
    },
    resolveSave: () => {
      let resolved = false
      set((state) => {
        if (state.saveState !== 'saving') return state
        resolved = true
        return {
          fields: state.fields.map((field) => ({
            ...field,
            savedValue: field.value,
            changed: false,
          })),
          saveState: 'saved',
          feedback: 'saved',
        }
      })
      return resolved
    },
    rejectSave: () => {
      let rejected = false
      set((state) => {
        if (state.saveState !== 'saving') return state
        rejected = true
        return { saveState: 'error', feedback: 'save-failed' }
      })
      return rejected
    },
    cancel: () => {
      let cancelled = false
      set((state) => {
        if (state.saveState === 'saving' || state.saveState === 'clean' || state.saveState === 'saved') {
          return state
        }
        cancelled = true
        return {
          fields: state.fields.map((field) => ({
            ...field,
            value: field.savedValue,
            changed: false,
          })),
          saveState: 'clean',
          feedback: 'cancelled',
        }
      })
      return cancelled
    },
  }))
}
