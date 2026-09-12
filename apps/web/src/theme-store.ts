import { create } from 'zustand'
import type { ClientTransport } from '@hbar/client'
import type { SettingScope, SettingsSnapshot, ThemeProfile, WireNotification } from '@hbar/contracts'
import { DEFAULT_THEME_PROFILE, normalizeThemeProfile } from '@hbar/contracts'

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
  setScope(scope: ThemeSettingScope, targetId?: string): void
  updateDraft(update: (current: ThemeProfile) => ThemeProfile): void
  discardDraft(): void
  load(transport: ClientTransport, scope?: ThemeSettingScope, targetId?: string): Promise<void>
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
    set({ loading: true, error: '', scope, ...(targetId ? { targetId } : { targetId: undefined }) })
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
      set({ error: cause instanceof Error ? cause.message : String(cause) })
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
    set({ snapshot, profile, savedProfile: profile, scope: snapshot.scope, ...(snapshot.targetId ? { targetId: snapshot.targetId } : { targetId: undefined }), error: '' })
  },
}))

export function handleThemeEvent(event: WireNotification, transport: ClientTransport): void {
  if (event.method !== 'settings.changed' || !event.params.ids.includes('appearance.profile')) return
  const state = useThemeSettings.getState()
  if (event.params.scope !== state.scope || event.params.targetId !== state.targetId) return
  void state.load(transport, state.scope, state.targetId)
}

export function themeCssVariables(profile: ThemeProfile): Record<string, string> {
  return {
    '--hbar-bg': profile.colors.background,
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
    '--hbar-radius': `${profile.surface.cornerRadius}px`,
    '--hbar-motion-duration': profile.motion.intensity === 'off' ? '0ms' : profile.motion.intensity === 'subtle' ? '160ms' : '220ms',
  }
}

export function applyThemeProfile(profile: ThemeProfile): void {
  const root = document.documentElement
  root.dataset.theme = profile.mode === 'white' ? 'white' : profile.mode === 'light' ? 'dsh-light' : 'dsh-dark'
  root.dataset.themeSurface = profile.surface.mode
  root.dataset.motion = profile.motion.intensity
  for (const [name, value] of Object.entries(themeCssVariables(profile))) root.style.setProperty(name, value)
  root.style.setProperty('color-scheme', profile.mode === 'dark' ? 'dark' : 'light')
}
