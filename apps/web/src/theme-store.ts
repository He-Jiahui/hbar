import { create } from 'zustand'
import type { ClientTransport } from '@hbar/client'
import type { SettingScope, SettingsSnapshot, ThemeProfile, WireNotification } from '@hbar/contracts'
import { DEFAULT_THEME_PROFILE, HbarError, normalizeThemeProfile } from '@hbar/contracts'
import type { ClientTheme, DeepPartial } from '@hbar/ui-sdk'

export type ThemeSettingScope = SettingScope
export const THEME_CONFLICT_ERROR = 'theme-conflict'

interface ThemeSettingsState {
  scope: ThemeSettingScope
  targetId: string | undefined
  parentTargetId: string | undefined
  snapshot: SettingsSnapshot | null
  profile: ThemeProfile
  profileExplicit: boolean
  draftGeneration: number
  savedProfile: ThemeProfile
  loading: boolean
  saving: boolean
  error: string
  conflict: boolean
  setScope(scope: ThemeSettingScope, targetId?: string, parentTargetId?: string): void
  updateDraft(update: (current: ThemeProfile) => ThemeProfile): void
  discardDraft(): void
  load(transport: ClientTransport, scope?: ThemeSettingScope, targetId?: string): Promise<void>
  refreshSnapshot(transport: ClientTransport): Promise<void>
  save(transport: ClientTransport): Promise<void>
  reset(transport: ClientTransport): Promise<void>
  applySnapshot(snapshot: SettingsSnapshot): void
}

function legacyThemeMode(value: unknown): ThemeProfile['mode'] | undefined {
  return value === 'dark' || value === 'light' || value === 'white' || value === 'custom' ? value : undefined
}

function profileFromSnapshot(snapshot: SettingsSnapshot): ThemeProfile {
  const profileSetting = snapshot.values['appearance.profile']
  const profile = normalizeThemeProfile(profileSetting?.effectiveValue)
  const legacy = legacyThemeMode(snapshot.values['appearance.theme']?.effectiveValue)
  // Older installations persisted only appearance.theme. Preserve that value
  // while the new full profile is still inherited from its default.
  return (!profileSetting || profileSetting.source === 'default') && legacy ? { ...profile, mode: legacy } : profile
}

function profileIsExplicit(snapshot: SettingsSnapshot | null): boolean {
  const source = snapshot?.values['appearance.profile']?.source
  return source !== undefined && source !== 'default'
}

function hasTarget(scope: ThemeSettingScope, targetId?: string): targetId is string {
  return scope !== 'global' && Boolean(targetId)
}

export const useThemeSettings = create<ThemeSettingsState>((set, get) => ({
  scope: 'global',
  targetId: undefined,
  parentTargetId: undefined,
  snapshot: null,
  profile: DEFAULT_THEME_PROFILE,
  profileExplicit: false,
  draftGeneration: 0,
  savedProfile: DEFAULT_THEME_PROFILE,
  loading: false,
  saving: false,
  error: '',
  conflict: false,
  setScope(scope, targetId, parentTargetId) {
    set((state) => ({ draftGeneration: state.draftGeneration + 1, scope, ...(hasTarget(scope, targetId) ? { targetId } : { targetId: undefined }), ...(scope === 'session' && parentTargetId ? { parentTargetId } : { parentTargetId: undefined }) }))
  },
  updateDraft(update) {
    set((state) => ({ profile: normalizeThemeProfile(update(state.profile)), profileExplicit: true, draftGeneration: state.draftGeneration + 1, error: '' }))
  },
  discardDraft() {
    set((state) => ({ profile: state.savedProfile, profileExplicit: profileIsExplicit(state.snapshot), draftGeneration: state.draftGeneration + 1, error: '' }))
  },
  async load(transport, scope = get().scope, targetId = get().targetId) {
    if (scope !== 'global' && !targetId) return
    const generation = get().draftGeneration
    set({ loading: true, error: '', conflict: false, scope, ...(targetId ? { targetId } : { targetId: undefined }) })
    try {
      const snapshot = await transport.call('settings.snapshot', {
        scope,
        ...(targetId ? { targetId } : {}),
      })
      if (get().draftGeneration === generation && get().scope === scope && get().targetId === targetId) get().applySnapshot(snapshot)
    } catch (cause) {
      set({ error: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      set({ loading: false })
    }
  },
  async refreshSnapshot(transport) {
    const { scope, targetId, profile } = get()
    if (scope !== 'global' && !targetId) return
    try {
      const snapshot = await transport.call('settings.snapshot', { scope, ...(targetId ? { targetId } : {}) })
      const latest = profileFromSnapshot(snapshot)
      set({ snapshot, savedProfile: latest, profile, conflict: true, error: THEME_CONFLICT_ERROR })
    } catch (cause) {
      set({ error: cause instanceof Error ? cause.message : String(cause) })
    }
  },
  async save(transport) {
    const { scope, targetId, snapshot, profile } = get()
    if (scope !== 'global' && !targetId) return
    set({ saving: true, error: '' })
    try {
      const next = await transport.call('settings.set', {
        scope,
        ...(targetId ? { targetId } : {}),
        id: 'appearance.profile',
        value: profile,
        ...(snapshot ? { expectedRevision: snapshot.revision } : {}),
      })
      get().applySnapshot(next)
    } catch (cause) {
      if (cause instanceof HbarError && cause.code === 'SETTINGS_CONFLICT') {
        set({ conflict: true, error: THEME_CONFLICT_ERROR })
      } else set({ error: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      set({ saving: false })
    }
  },
  async reset(transport) {
    const { scope, targetId, snapshot } = get()
    if (scope !== 'global' && !targetId) return
    set({ saving: true, error: '' })
    try {
      const next = await transport.call('settings.reset', {
        scope,
        ...(targetId ? { targetId } : {}),
        id: 'appearance.profile',
        ...(snapshot ? { expectedRevision: snapshot.revision } : {}),
      })
      get().applySnapshot(next)
    } catch (cause) {
      set({ error: cause instanceof Error ? cause.message : String(cause) })
    } finally {
      set({ saving: false })
    }
  },
  applySnapshot(snapshot) {
    const profile = profileFromSnapshot(snapshot)
    set({ snapshot, profile, profileExplicit: profileIsExplicit(snapshot), savedProfile: profile, conflict: false, scope: snapshot.scope, ...(snapshot.targetId ? { targetId: snapshot.targetId } : { targetId: undefined }), error: '' })
  },
}))

export function handleThemeEvent(event: WireNotification, transport: ClientTransport): void {
  if (event.method !== 'settings.changed' || !event.params.ids.some((id) => id === 'appearance.profile' || id === 'appearance.theme')) return
  const state = useThemeSettings.getState()
  if (!isThemeEventRelevant(event.params, state)) return
  if (JSON.stringify(state.profile) !== JSON.stringify(state.savedProfile)) void state.refreshSnapshot(transport)
  else void state.load(transport, state.scope, state.targetId)
}

export function isThemeEventRelevant(
  params: Extract<WireNotification, { method: 'settings.changed' }>['params'],
  state: Pick<ThemeSettingsState, 'scope' | 'targetId' | 'parentTargetId'>,
): boolean {
  const sameTarget = params.targetId === state.targetId
  return params.scope === 'global'
    || (params.scope === state.scope && sameTarget)
    || (state.scope === 'session' && params.scope === 'project' && params.targetId === state.parentTargetId)
}

function mergeThemeValue<T>(base: T, override: DeepPartial<T>): T {
  if (!base || typeof base !== 'object' || !override || typeof override !== 'object') return (override as T) ?? base
  const result = { ...(base as Record<string, unknown>) }
  for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
    if (value && typeof value === 'object' && !Array.isArray(value))
      result[key] = mergeThemeValue(result[key], value as DeepPartial<unknown>)
    else if (value !== undefined) result[key] = value
  }
  return result as T
}

export function mergeThemeContributions(profile: ThemeProfile, themes: readonly ClientTheme[], profileExplicit = true): ThemeProfile {
  // Plugin tokens provide defaults; the user's profile always wins over them.
  // Applying contributions in ascending priority makes a higher-priority theme
  // override a lower-priority theme while the persisted profile remains final.
  const contributed = [...themes]
    .sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0))
    .reduce((current, theme) => {
      const overrides: DeepPartial<ThemeProfile> = {
        ...theme.tokenOverrides,
        ...(theme.surfaceEffects ? { surface: theme.surfaceEffects } : {}),
        ...(theme.motion ? { motion: theme.motion } : {}),
      }
      return mergeThemeValue(current, overrides)
    }, DEFAULT_THEME_PROFILE)
  // An inherited profile is intentionally absent from the final layer so a
  // plugin preset can provide its defaults. Once the user edits or saves a
  // profile, even if it equals DEFAULT_THEME_PROFILE, it remains authoritative.
  const userOverride = profileExplicit
    ? profile
    : profile.mode !== DEFAULT_THEME_PROFILE.mode
      ? { mode: profile.mode }
      : {}
  return normalizeThemeProfile(mergeThemeValue(contributed, userOverride))
}

function channelLuminance(value: number): number {
  const normalized = value / 255
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

/** WCAG relative contrast for the six/eight digit theme colour format. */
export function themeContrastRatio(foreground: string, background: string): number {
  const parse = (value: string) => {
    const hex = value.slice(1)
    if (!/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value)) return null
    return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
  }
  const fg = parse(foreground)
  const bg = parse(background)
  if (!fg || !bg) return 1
  const luminance = (rgb: number[]) => 0.2126 * channelLuminance(rgb[0]!) + 0.7152 * channelLuminance(rgb[1]!) + 0.0722 * channelLuminance(rgb[2]!)
  const lighter = Math.max(luminance(fg), luminance(bg))
  const darker = Math.min(luminance(fg), luminance(bg))
  return (lighter + 0.05) / (darker + 0.05)
}
