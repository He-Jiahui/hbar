import { createStore } from 'zustand/vanilla'

export type SettingsForm6PreviewAction =
  | { readonly type: 'transfer' | 'archive' | 'cancel'; readonly workspaceId: string }
  | { readonly type: 'delete'; readonly workspaceId: string; readonly confirmation: string }

export interface SettingsForm6PreviewStoreSeed {
  readonly workspaceId: string
}

export interface SettingsForm6PreviewStoreState {
  readonly confirmationValue: string
  readonly setConfirmationValue: (value: string) => void
  readonly requestAction: (action: SettingsForm6PreviewAction) => boolean
}

export type SettingsForm6PreviewActionHandler = (action: SettingsForm6PreviewAction) => void

export function createSettingsForm6PreviewStore(
  seed: SettingsForm6PreviewStoreSeed,
  onAction?: SettingsForm6PreviewActionHandler,
) {
  if (!seed.workspaceId.trim()) throw new RangeError('Workspace IDs must not be empty.')

  return createStore<SettingsForm6PreviewStoreState>((set) => ({
    confirmationValue: '',
    setConfirmationValue: (confirmationValue) => set({ confirmationValue }),
    requestAction: (action) => {
      if (action.workspaceId !== seed.workspaceId || onAction === undefined) return false
      onAction(action)
      return true
    },
  }))
}
