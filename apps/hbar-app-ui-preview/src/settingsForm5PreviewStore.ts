import { createStore } from 'zustand/vanilla'

export type SettingsForm5PreviewKeyId = string
export type SettingsForm5PreviewIntegrationId = string
export type SettingsForm5PreviewKeyEnvironment = 'live' | 'test'

export interface SettingsForm5PreviewKey {
  readonly id: SettingsForm5PreviewKeyId
  readonly name: string
  readonly environment: SettingsForm5PreviewKeyEnvironment
  readonly createdLabel: string
  readonly lastUsedLabel: string
}

export interface SettingsForm5PreviewIntegration {
  readonly id: SettingsForm5PreviewIntegrationId
  readonly name: string
  readonly description: string
  readonly enabled: boolean
}

export interface SettingsForm5PreviewStoreSeed {
  readonly keys: readonly SettingsForm5PreviewKey[]
  readonly integrations: readonly SettingsForm5PreviewIntegration[]
}

export interface SettingsForm5PreviewStoreState {
  readonly keys: readonly SettingsForm5PreviewKey[]
  readonly integrations: readonly SettingsForm5PreviewIntegration[]
  readonly revealedKeyIds: readonly SettingsForm5PreviewKeyId[]
  readonly openActionMenuKeyId: SettingsForm5PreviewKeyId | null
  readonly toggleKeyReveal: (keyId: SettingsForm5PreviewKeyId) => boolean
  readonly toggleKeyActions: (keyId: SettingsForm5PreviewKeyId) => boolean
  readonly closeKeyActions: () => boolean
  readonly setIntegrationEnabled: (integrationId: SettingsForm5PreviewIntegrationId, enabled: boolean) => boolean
}

function assertUniqueIds(items: readonly { readonly id: string }[], kind: string): void {
  const seen = new Set<string>()
  for (const item of items) {
    if (!item.id.trim()) throw new RangeError(`${kind} IDs must not be empty.`)
    if (seen.has(item.id)) throw new RangeError(`${kind} IDs must be unique.`)
    seen.add(item.id)
  }
}

export function createSettingsForm5PreviewStore(seed: SettingsForm5PreviewStoreSeed) {
  assertUniqueIds(seed.keys, 'API key')
  assertUniqueIds(seed.integrations, 'Integration')

  const keys = seed.keys.map((key) => ({ ...key }))
  const integrations = seed.integrations.map((integration) => ({ ...integration }))

  return createStore<SettingsForm5PreviewStoreState>((set, get) => ({
    keys,
    integrations,
    revealedKeyIds: [],
    openActionMenuKeyId: null,
    toggleKeyReveal: (keyId) => {
      if (!get().keys.some((key) => key.id === keyId)) return false
      let changed = false
      set((state) => {
        const wasRevealed = state.revealedKeyIds.includes(keyId)
        changed = true
        return {
          revealedKeyIds: wasRevealed
            ? state.revealedKeyIds.filter((candidate) => candidate !== keyId)
            : [...state.revealedKeyIds, keyId],
        }
      })
      return changed
    },
    toggleKeyActions: (keyId) => {
      if (!get().keys.some((key) => key.id === keyId)) return false
      set((state) => ({
        openActionMenuKeyId: state.openActionMenuKeyId === keyId ? null : keyId,
      }))
      return true
    },
    closeKeyActions: () => {
      let changed = false
      set((state) => {
        if (state.openActionMenuKeyId === null) return state
        changed = true
        return { openActionMenuKeyId: null }
      })
      return changed
    },
    setIntegrationEnabled: (integrationId, enabled) => {
      let changed = false
      set((state) => {
        const integration = state.integrations.find((candidate) => candidate.id === integrationId)
        if (!integration || integration.enabled === enabled) return state
        changed = true
        return {
          integrations: state.integrations.map((candidate) =>
            candidate.id === integrationId ? { ...candidate, enabled } : candidate,
          ),
        }
      })
      return changed
    },
  }))
}
