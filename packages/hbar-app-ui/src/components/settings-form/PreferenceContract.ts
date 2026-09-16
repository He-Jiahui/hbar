export type HbarAppUiPreferenceAction =
  | { readonly type: 'theme' | 'density' | 'language'; readonly id: string }
  | { readonly type: 'toggle' | 'checkbox'; readonly id: string; readonly enabled: boolean }
export type HbarAppUiPreferencePersistence =
  | { readonly mode: 'immediate' }
  | {
      readonly mode: 'explicit'
      readonly dirty: boolean
      readonly busy: boolean
      readonly onSave: () => void
      readonly onCancel: () => void
    }
