import { createStore } from 'zustand/vanilla'

export type SettingsForm6PreviewAction =
  | { readonly type: 'transfer' | 'archive' | 'cancel' | 'review'; readonly workspaceId: string }
  | { readonly type: 'delete'; readonly workspaceId: string; readonly confirmation: string }

export interface SettingsForm6PreviewStoreSeed {
  readonly workspaceId: string
}

export interface SettingsForm6PreviewStoreState {
  readonly confirmationValue: string
  readonly confirmationVisible: boolean
  readonly setConfirmationValue: (value: string) => void
  readonly requestAction: (action: SettingsForm6PreviewAction) => boolean
}

export type SettingsForm6PreviewActionHandler = (action: SettingsForm6PreviewAction) => void

export function createSettingsForm6PreviewStore(
  seed: SettingsForm6PreviewStoreSeed,
  onAction?: SettingsForm6PreviewActionHandler,
) {
  if (!seed.workspaceId.trim()) throw new RangeError('Workspace IDs must not be empty.')

  return createStore<SettingsForm6PreviewStoreState>((set, get) => ({
    confirmationValue: '',
    confirmationVisible: true,
    setConfirmationValue: (confirmationValue) => {
      if (get().confirmationVisible) set({ confirmationValue })
    },
    requestAction: (action) => {
      if (action.workspaceId !== seed.workspaceId) return false
      if (action.type === 'cancel') {
        if (!get().confirmationVisible) return false
        set({ confirmationVisible: false })
        onAction?.(action)
        return true
      }
      if (action.type === 'delete' && !get().confirmationVisible) return false
      if (action.type === 'review' && get().confirmationVisible) return false
      if (onAction === undefined) return false
      onAction(action)
      return true
    },
  }))
}
