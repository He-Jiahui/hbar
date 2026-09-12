import { create } from 'zustand'
import type { ClientTransport } from '@hbar/client'
import type { SettingScope, SettingsSnapshot, ThemeProfile, WireNotification } from '@hbar/contracts'
import { DEFAULT_THEME_PROFILE, HbarError, normalizeThemeProfile } from '@hbar/contracts'
import type { ClientTheme, DeepPartial } from '@hbar/ui-sdk'

export type ThemeSettingScope = SettingScope

interface ThemeSettingsState {
  scope: ThemeSettingScope
  targetId: string | undefined
  snapshot: SettingsSnapshot | null
  profile: ThemeProfile
  savedProfile: ThemeProfile
  loading: boolean
  saving: boolean
  error: string
  conflict: boolean
  setScope(scope: ThemeSettingScope, targetId?: string): void
  updateDraft(update: (current: ThemeProfile) => ThemeProfile): void
  discardDraft(): void
  load(transport: ClientTransport, scope?: ThemeSettingScope, targetId?: string): Promise<void>
  refreshSnapshot(transport: ClientTransport): Promise<void>
  save(transport: ClientTransport): Promise<void>
  reset(transport: ClientTransport): Promise<void>
  applySnapshot(snapshot: SettingsSnapshot): void
}

function profileFromSnapshot(snapshot: SettingsSnapshot): ThemeProfile {
  return normalizeThemeProfile(snapshot.values['appearance.profile']?.effectiveValue)
}

function hasTarget(scope: ThemeSettingScope, targetId?: string): targetId is string {
  return scope !== 'global' && Boolean(targetId)
}

export const useThemeSettings = create<ThemeSettingsState>((set, get) => ({
  scope: 'global',
  targetId: undefined,
  snapshot: null,
  profile: DEFAULT_THEME_PROFILE,
  savedProfile: DEFAULT_THEME_PROFILE,
  loading: false,
  saving: false,
  error: '',
  conflict: false,
  setScope(scope, targetId) {
    set({ scope, ...(hasTarget(scope, targetId) ? { targetId } : { targetId: undefined }) })
  },
  updateDraft(update) {
    set((state) => ({ profile: normalizeThemeProfile(update(state.profile)), error: '' }))
  },
  discardDraft() {
    set((state) => ({ profile: state.savedProfile, error: '' }))
  },
  async load(transport, scope = get().scope, targetId = get().targetId) {
    if (scope !== 'global' && !targetId) return
    set({ loading: true, error: '', conflict: false, scope, ...(targetId ? { targetId } : { targetId: undefined }) })
    try {
      const snapshot = await transport.call('settings.snapshot', {
        scope,
        ...(targetId ? { targetId } : {}),
      })
      get().applySnapshot(snapshot)
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
      set({ snapshot, savedProfile: latest, profile, conflict: true, error: '设置已在其他窗口修改。当前草稿已保留，请确认后重试保存。' })
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
        set({ conflict: true, error: '设置已在其他窗口修改。当前草稿已保留，请加载最新快照后重试保存。' })
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
    set({ snapshot, profile, savedProfile: profile, conflict: false, scope: snapshot.scope, ...(snapshot.targetId ? { targetId: snapshot.targetId } : { targetId: undefined }), error: '' })
  },
}))

export function handleThemeEvent(event: WireNotification, transport: ClientTransport): void {
  if (event.method !== 'settings.changed' || !event.params.ids.includes('appearance.profile')) return
  const state = useThemeSettings.getState()
  if (event.params.scope !== state.scope || event.params.targetId !== state.targetId) return
  if (JSON.stringify(state.profile) !== JSON.stringify(state.savedProfile)) void state.refreshSnapshot(transport)
  else void state.load(transport, state.scope, state.targetId)
}

export function themeCssVariables(profile: ThemeProfile): Record<string, string> {
  return {
    '--hbar-bg': profile.colors.background,
    '--hbar-overlay': profile.colors.background,
    '--hbar-s0': profile.colors.surface,
    '--hbar-s1': profile.colors.surfaceElevated,
    '--hbar-s2': profile.colors.surface,
    '--hbar-bd': profile.colors.border,
    '--hbar-bd2': profile.colors.borderStrong,
    '--hbar-t1': profile.colors.textPrimary,
    '--hbar-t2': profile.colors.textSecondary,
    '--hbar-t3': profile.colors.textTertiary,
    '--hbar-ac': profile.colors.primary,
    '--hbar-ac2': profile.colors.secondary,
    '--hbar-ac-soft': profile.colors.surface,
    '--hbar-ac-soft-hover': profile.colors.surfaceElevated,
    '--hbar-ac-border': profile.colors.borderStrong,
    '--hbar-ac-ink': profile.colors.textPrimary,
    '--hbar-highlight': profile.colors.highlight,
    '--hbar-focus': profile.colors.focus,
    '--hbar-info': profile.colors.info,
    '--hbar-ok': profile.colors.success,
    '--hbar-wn': profile.colors.warning,
    '--hbar-er': profile.colors.error,
    '--hbar-code': profile.colors.codeBackground,
    '--hbar-diff-added': profile.colors.diffAdded,
    '--hbar-diff-removed': profile.colors.diffRemoved,
    '--hbar-diff-context': profile.colors.diffContext,
    '--hbar-diff-header': profile.colors.diffHeader,
    '--hbar-chart-1': profile.colors.primary,
    '--hbar-chart-2': profile.colors.secondary,
    '--hbar-chart-3': profile.colors.highlight,
    '--hbar-chart-4': profile.colors.info,
    '--hbar-chart-grid': profile.colors.border,
    '--dsh-font-family': profile.typography.bodyFontFamily,
    '--dsh-font-family-heading': profile.typography.headingFontFamily,
    '--dsh-font-family-code': profile.typography.codeFontFamily,
    '--hbar-font-size-body': `${profile.typography.bodySize}px`,
    '--hbar-font-size-heading': `${profile.typography.headingSize}px`,
    '--hbar-font-size-code': `${profile.typography.codeSize}px`,
    '--hbar-line-height-body': String(profile.typography.bodyLineHeight),
    '--hbar-font-weight-body': String(profile.typography.bodyWeight),
    '--hbar-font-weight-heading': String(profile.typography.headingWeight),
    '--hbar-glass-opacity': String(profile.surface.backgroundOpacity),
    '--hbar-glass-blur': `${profile.surface.blurAmount}px`,
    '--hbar-glass-saturation': `${profile.surface.saturation}%`,
    '--hbar-glow-intensity': String(profile.surface.glowIntensity),
    '--hbar-inline-code-bg': profile.typography.inlineCodeBackground,
    '--hbar-inline-code-text': profile.typography.inlineCodeTextColor,
    '--hbar-body-text': profile.typography.bodyTextColor,
    '--hbar-heading-text': profile.typography.headingTextColor,
    '--hbar-underline-links': profile.typography.underlineLinks ? 'underline' : 'none',
    '--hbar-radius': `${profile.surface.cornerRadius}px`,
    '--hbar-motion-duration': profile.motion.intensity === 'off' ? '0ms' : profile.motion.intensity === 'subtle' ? '160ms' : '220ms',
  }
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

export function mergeThemeContributions(profile: ThemeProfile, themes: readonly ClientTheme[]): ThemeProfile {
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
  return normalizeThemeProfile(mergeThemeValue(contributed, profile))
}

export function applyThemeProfile(profile: ThemeProfile): void {
  const root = document.documentElement
  root.dataset.theme = profile.mode === 'white' ? 'white' : profile.mode === 'light' ? 'dsh-light' : 'dsh-dark'
  root.dataset.themeSurface = profile.surface.mode
  root.dataset.motion = profile.motion.intensity
  for (const [name, value] of Object.entries(themeCssVariables(profile))) root.style.setProperty(name, value)
  root.style.setProperty('color-scheme', profile.mode === 'dark' ? 'dark' : 'light')
}
