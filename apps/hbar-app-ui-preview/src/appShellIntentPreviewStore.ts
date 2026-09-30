import { createStore } from 'zustand/vanilla'

export interface AppShellPreviewIntent {
  readonly actionId: string
  readonly value: string | undefined
}
export interface AppShellIntentPreviewSeed {
  readonly ownerId: string
  readonly actions: readonly string[]
}
export interface AppShellIntentPreviewState {
  readonly seed: AppShellIntentPreviewSeed
  readonly intent: AppShellPreviewIntent | undefined
  readonly request: (ownerId: string, actionId: string, value?: string) => boolean
}

/** Accept only explicitly supplied request actions. Entity callbacks retain their own model guards. */
export function createAppShellIntentPreviewStore(seed: AppShellIntentPreviewSeed) {
  return createStore<AppShellIntentPreviewState>((set, get) => ({
    seed,
    intent: undefined,
    request(ownerId, actionId, value) {
      const current = get()
      if (!ownerId.trim() || ownerId !== current.seed.ownerId || !actionId.trim()) return false
      if (!current.seed.actions.includes(actionId) || (value !== undefined && !value.trim())) return false
      if (current.intent?.actionId === actionId && current.intent.value === value) return false
      set({ intent: { actionId, value } })
      return true
    },
  }))
}

/** Local controls are handled by the existing models; this list contains request-only action IDs. */
export function appShellPreviewRequestActions(variant: number): readonly string[] {
  switch (variant) {
    case 1:
      return ['navigate', 'workspace-options', 'book', 'account', 'notifications', 'shortcuts', 'sign-out']
    case 2:
      return ['navigate', 'primary', 'record', 'add-workspace', 'account']
    case 3:
      return [
        'navigate',
        'record',
        'notifications',
        'workspace-settings',
        'create',
        'account-settings',
        'notification-preferences',
        'switch-workspace',
        'sign-out',
      ]
    case 4:
      return ['navigate', 'create', 'event']
    case 5:
      return ['mailbox', 'account', 'sort', 'compose', 'reply', 'archive', 'delete', 'download', 'menu']
    case 6:
      return ['new', 'trash', 'share', 'link', 'duplicate', 'move', 'history', 'export', 'list', 'quote', 'code']
    case 7:
      return ['create', 'navigate', 'read-more', 'account']
    case 8:
      return ['book', 'assign']
    case 9:
      return ['share', 'attach', 'search', 'dictate', 'send', 'quick']
    default:
      return []
  }
}
