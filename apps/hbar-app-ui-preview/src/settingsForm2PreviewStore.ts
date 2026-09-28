import { createStore } from 'zustand/vanilla'

export type SettingsForm2PreviewFieldId = 'fullName' | 'title' | 'username' | 'email' | 'bio'
export type SettingsForm2PreviewUsernameStatus = 'available' | 'required' | 'taken'

export interface SettingsForm2PreviewValues {
  readonly fullName: string
  readonly title: string
  readonly username: string
  readonly email: string
  readonly bio: string
}

export interface SettingsForm2PreviewValidation {
  readonly username: SettingsForm2PreviewUsernameStatus
  readonly bioCharactersOverLimit: number
}

export interface SettingsForm2PreviewStoreSeed {
  readonly initialValues: SettingsForm2PreviewValues
  readonly maximumBioCharacters: number
  readonly validateUsername: (value: string) => SettingsForm2PreviewUsernameStatus
}

export interface SettingsForm2PreviewHandlers {
  readonly onSaveRequested: (values: SettingsForm2PreviewValues) => void
  readonly onPhotoSelected: (file: File) => void
  readonly onCancel: () => void
}

export interface SettingsForm2PreviewStoreState {
  readonly initialValues: SettingsForm2PreviewValues
  readonly values: SettingsForm2PreviewValues
  readonly maximumBioCharacters: number
  readonly validation: SettingsForm2PreviewValidation
  readonly saveDisabled: boolean
  readonly changeField: (fieldId: SettingsForm2PreviewFieldId, value: string) => boolean
  readonly cancel: () => boolean
  readonly requestSave: () => boolean
  readonly selectPhoto: (file: File) => void
}

function validate(
  values: SettingsForm2PreviewValues,
  seed: SettingsForm2PreviewStoreSeed,
): SettingsForm2PreviewValidation {
  return {
    username: seed.validateUsername(values.username),
    bioCharactersOverLimit: Math.max(0, values.bio.length - seed.maximumBioCharacters),
  }
}

function isSaveDisabled(validation: SettingsForm2PreviewValidation): boolean {
  return validation.username !== 'available' || validation.bioCharactersOverLimit > 0
}

export function createSettingsForm2PreviewStore(
  seed: SettingsForm2PreviewStoreSeed,
  handlers: SettingsForm2PreviewHandlers,
) {
  if (!Number.isInteger(seed.maximumBioCharacters) || seed.maximumBioCharacters < 1) {
    throw new RangeError('The maximum Bio character count must be a positive integer.')
  }

  const initialValues = { ...seed.initialValues }
  const initialValidation = validate(initialValues, seed)

  return createStore<SettingsForm2PreviewStoreState>((set, get) => ({
    initialValues,
    values: initialValues,
    maximumBioCharacters: seed.maximumBioCharacters,
    validation: initialValidation,
    saveDisabled: isSaveDisabled(initialValidation),
    changeField: (fieldId, value) => {
      let changed = false
      set((state) => {
        if (state.values[fieldId] === value) return state
        const values = { ...state.values, [fieldId]: value }
        const validation = validate(values, seed)
        changed = true
        return { values, validation, saveDisabled: isSaveDisabled(validation) }
      })
      return changed
    },
    cancel: () => {
      set((state) => {
        const validation = validate(state.initialValues, seed)
        return {
          values: state.initialValues,
          validation,
          saveDisabled: isSaveDisabled(validation),
        }
      })
      handlers.onCancel()
      return true
    },
    requestSave: () => {
      const state = get()
      if (state.saveDisabled) return false
      handlers.onSaveRequested({ ...state.values })
      return true
    },
    selectPhoto: (file) => {
      handlers.onPhotoSelected(file)
    },
  }))
}
