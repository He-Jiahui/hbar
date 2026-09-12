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
  if (event.method !== 'settings.changed' || !event.params.ids.some((id) => id === 'appearance.profile' || id === 'appearance.theme')) return
  const state = useThemeSettings.getState()
  const sameTarget = event.params.targetId === state.targetId
  const relevant = event.params.scope === 'global'
    || (event.params.scope === state.scope && sameTarget)
    || (state.scope === 'session' && event.params.scope === 'project')
  if (!relevant) return
  if (JSON.stringify(state.profile) !== JSON.stringify(state.savedProfile)) void state.refreshSnapshot(transport)
  else void state.load(transport, state.scope, state.targetId)
}

export function themeCssVariables(profile: ThemeProfile): Record<string, string> {
  return {
    '--hbar-color-primary': profile.colors.primary,
    '--hbar-color-secondary': profile.colors.secondary,
    '--hbar-color-highlight': profile.colors.highlight,
    '--hbar-color-background': profile.colors.background,
    '--hbar-color-surface': profile.colors.surface,
    '--hbar-color-surface-elevated': profile.colors.surfaceElevated,
    '--hbar-color-border': profile.colors.border,
    '--hbar-color-border-strong': profile.colors.borderStrong,
    '--hbar-color-text-primary': profile.colors.textPrimary,
    '--hbar-color-text-secondary': profile.colors.textSecondary,
    '--hbar-color-text-tertiary': profile.colors.textTertiary,
    '--hbar-color-heading': profile.colors.headingText,
    '--hbar-font-family-body': profile.typography.bodyFontFamily,
    '--hbar-font-family-heading': profile.typography.headingFontFamily,
    '--hbar-font-family-code': profile.typography.codeFontFamily,
    '--hbar-code-background': profile.colors.codeBackground,
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
    '--hbar-text-primary': profile.colors.textPrimary,
    '--hbar-ac': profile.colors.primary,
    '--hbar-ac2': profile.colors.secondary,
    '--hbar-ac-soft': `color-mix(in srgb, ${profile.colors.primary} 18%, ${profile.colors.surface})`,
    '--hbar-ac-soft-hover': `color-mix(in srgb, ${profile.colors.primary} 34%, ${profile.colors.surfaceElevated})`,
    '--hbar-ac-border': `color-mix(in srgb, ${profile.colors.primary} 68%, ${profile.colors.borderStrong})`,
    '--hbar-ac-ink': profile.colors.textPrimary,
    '--hbar-highlight': profile.colors.highlight,
    '--hbar-focus': profile.colors.focus,
    '--hbar-info': profile.colors.info,
    '--hbar-ok': profile.colors.success,
    '--hbar-ok-ink': `color-mix(in srgb, ${profile.colors.success} 76%, ${profile.colors.textPrimary})`,
    '--hbar-wn': profile.colors.warning,
    '--hbar-wn-ink': `color-mix(in srgb, ${profile.colors.warning} 76%, ${profile.colors.textPrimary})`,
    '--hbar-wn-soft': `color-mix(in srgb, ${profile.colors.warning} 12%, ${profile.colors.surface})`,
    '--hbar-er': profile.colors.error,
    '--hbar-er-ink': `color-mix(in srgb, ${profile.colors.error} 76%, ${profile.colors.textPrimary})`,
    '--hbar-er-border': `color-mix(in srgb, ${profile.colors.error} 62%, ${profile.colors.borderStrong})`,
    '--hbar-er-soft': `color-mix(in srgb, ${profile.colors.error} 12%, ${profile.colors.surface})`,
    '--hbar-bd-strong': profile.colors.borderStrong,
    '--hbar-on-ac': profile.colors.background,
    '--hbar-code': profile.colors.codeBackground,
    '--hbar-code-surface': profile.colors.codeBackground,
    '--hbar-diff-added': profile.colors.diffAdded,
    '--hbar-diff-removed': profile.colors.diffRemoved,
    '--hbar-diff-context': profile.colors.diffContext,
    '--hbar-diff-header': profile.colors.diffHeader,
    '--hbar-chart-1': profile.colors.primary,
    '--hbar-chart-2': profile.colors.secondary,
    '--hbar-chart-3': profile.colors.highlight,
    '--hbar-chart-4': profile.colors.info,
    '--hbar-chart-grid': profile.colors.border,
    '--hbar-canvas': profile.colors.background,
    '--hbar-surface': profile.colors.surface,
    '--hbar-surface-0': profile.colors.surface,
    '--hbar-surface-1': profile.colors.surface,
    '--hbar-surface-2': profile.colors.surfaceElevated,
    '--hbar-surface-hover': profile.colors.surfaceElevated,
    '--hbar-surface-strong': profile.colors.surfaceElevated,
    '--hbar-border': profile.colors.border,
    '--hbar-border-subtle': profile.colors.border,
    '--hbar-border-strong': profile.colors.borderStrong,
    '--hbar-border-focus': profile.colors.focus,
    '--hbar-muted': profile.colors.textTertiary,
    '--hbar-text': profile.colors.textPrimary,
    '--hbar-text-secondary': profile.colors.textSecondary,
    '--hbar-text-tertiary': profile.colors.textTertiary,
    '--hbar-accent': profile.colors.primary,
    '--hbar-accent-hover': profile.colors.secondary,
    '--hbar-accent-surface': `color-mix(in srgb, ${profile.colors.primary} 18%, ${profile.colors.surface})`,
    '--hbar-accent-soft': `color-mix(in srgb, ${profile.colors.primary} 18%, ${profile.colors.surface})`,
    '--hbar-accent-contrast': profile.colors.background,
    '--hbar-on-accent': profile.colors.background,
    '--hbar-success': profile.colors.success,
    '--hbar-success-soft': `color-mix(in srgb, ${profile.colors.success} 12%, ${profile.colors.surface})`,
    '--hbar-success-surface': `color-mix(in srgb, ${profile.colors.success} 12%, ${profile.colors.surface})`,
    '--hbar-warning': profile.colors.warning,
    '--hbar-warning-surface': `color-mix(in srgb, ${profile.colors.warning} 12%, ${profile.colors.surface})`,
    '--hbar-error': profile.colors.error,
    '--hbar-error-surface': `color-mix(in srgb, ${profile.colors.error} 12%, ${profile.colors.surface})`,
    '--hbar-error-ink': `color-mix(in srgb, ${profile.colors.error} 76%, ${profile.colors.textPrimary})`,
    '--hbar-danger': profile.colors.error,
    '--hbar-decision': `color-mix(in srgb, ${profile.colors.warning} 12%, ${profile.colors.surface})`,
    '--hbar-teal': profile.colors.info,
    '--hbar-teal-soft': `color-mix(in srgb, ${profile.colors.info} 12%, ${profile.colors.surface})`,
    '--dsh-font-family': profile.typography.bodyFontFamily,
    '--dsh-font-family-heading': profile.typography.headingFontFamily,
    '--dsh-font-family-code': profile.typography.codeFontFamily,
    '--dsh-bg-base': profile.colors.background,
    '--dsh-bg-layer-1': profile.colors.surface,
    '--dsh-bg-layer-2': profile.colors.surface,
    '--dsh-bg-layer-3': profile.colors.surfaceElevated,
    '--dsh-border-subtle': profile.colors.border,
    '--dsh-border-strong': profile.colors.borderStrong,
    '--dsh-text-primary': profile.colors.textPrimary,
    '--dsh-text-secondary': profile.colors.textSecondary,
    '--dsh-text-tertiary': profile.colors.textTertiary,
    '--dsh-brand': profile.colors.primary,
    '--dsh-brand-soft': `color-mix(in srgb, ${profile.colors.primary} 18%, ${profile.colors.surface})`,
    '--dsh-user-bubble': `color-mix(in srgb, ${profile.colors.primary} 18%, ${profile.colors.surface})`,
    '--dsh-code-block': profile.colors.codeBackground,
    '--dsh-code-inline': profile.typography.inlineCodeBackground,
    '--dsh-success': profile.colors.success,
    '--dsh-warning': profile.colors.warning,
    '--dsh-error': profile.colors.error,
    '--hbar-font-size-body': `${profile.typography.bodySize}px`,
    '--hbar-font-size-heading': `${profile.typography.headingSize}px`,
    '--hbar-font-size-code': `${profile.typography.codeSize}px`,
    '--hbar-font-size-ui': `${Math.max(10, profile.typography.bodySize - 1)}px`,
    '--hbar-font-size-label': `${Math.max(10, profile.typography.bodySize - 2)}px`,
    '--hbar-font-size-small': `${Math.max(9, profile.typography.bodySize - 3)}px`,
    '--hbar-font-size-micro': `${Math.max(8, profile.typography.bodySize - 4)}px`,
    '--hbar-font-size-icon': `${Math.max(12, profile.typography.bodySize + 1)}px`,
    '--hbar-font-size-caption': `${Math.max(8, profile.typography.bodySize - 4)}px`,
    '--hbar-font-size-display': `${Math.max(profile.typography.headingSize, profile.typography.headingSize + 7)}px`,
    '--hbar-line-height-body': String(profile.typography.bodyLineHeight),
    '--hbar-font-weight-body': String(profile.typography.bodyWeight),
    '--hbar-font-weight-heading': String(profile.typography.headingWeight),
    '--hbar-glass-opacity': String(profile.surface.backgroundOpacity),
    '--hbar-glass-blur': `${profile.surface.blurAmount}px`,
    '--hbar-glass-saturation': `${profile.surface.saturation}%`,
    '--hbar-glass-displacement': String(profile.surface.displacementScale),
    '--hbar-glass-aberration': String(profile.surface.aberrationIntensity),
    '--hbar-glass-elasticity': String(profile.surface.elasticity),
    '--hbar-glass-radius': `${profile.surface.cornerRadius}px`,
    '--hbar-glow-intensity': String(profile.surface.glowIntensity),
    '--hbar-inline-code-bg': profile.typography.inlineCodeBackground,
    '--hbar-inline-code-text': profile.typography.inlineCodeTextColor,
    '--hbar-body-text': profile.typography.bodyTextColor,
    '--hbar-heading-text': profile.typography.headingTextColor,
    '--hbar-underline-links': profile.typography.underlineLinks ? 'underline' : 'none',
    '--hbar-radius': `${profile.surface.cornerRadius}px`,
    '--hbar-motion-duration': profile.motion.intensity === 'off' ? '0ms' : profile.motion.intensity === 'subtle' ? '160ms' : '220ms',
    '--hbar-motion-easing': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    '--dsh-motion-duration': profile.motion.intensity === 'off' ? '0ms' : profile.motion.intensity === 'subtle' ? '160ms' : '220ms',
    '--dsh-motion-easing': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
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
  // A freshly loaded profile is materialised as a complete object from the
  // settings default. Treat that exact default as "no user override" so a
  // plugin preset can actually take effect. As soon as the user changes any
  // value, the full persisted profile remains the final layer and wins.
  const userOverride = JSON.stringify(profile) === JSON.stringify(DEFAULT_THEME_PROFILE) ? {} : profile
  return normalizeThemeProfile(mergeThemeValue(contributed, userOverride))
}

export function applyThemeProfile(profile: ThemeProfile): void {
  const root = document.documentElement
  root.dataset.theme = profile.mode === 'white' ? 'white' : profile.mode === 'light' ? 'dsh-light' : 'dsh-dark'
  root.dataset.themeSurface = profile.surface.mode
  root.dataset.motion = profile.motion.intensity
  for (const [name, value] of Object.entries(themeCssVariables(profile))) root.style.setProperty(name, value)
  root.style.setProperty('color-scheme', profile.mode === 'dark' || (profile.mode === 'custom' && isDarkThemeColor(profile.colors.background)) ? 'dark' : 'light')
}

export function isDarkThemeColor(value: string): boolean {
  const red = Number.parseInt(value.slice(1, 3), 16)
  const green = Number.parseInt(value.slice(3, 5), 16)
  const blue = Number.parseInt(value.slice(5, 7), 16)
  if (![red, green, blue].every(Number.isFinite)) return true
  return (red * 299 + green * 587 + blue * 114) / 255_000 < 0.56
}
