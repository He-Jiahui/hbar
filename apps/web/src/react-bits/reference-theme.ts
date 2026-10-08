import { DEFAULT_THEME_PROFILE, normalizeThemeProfile } from '@hbar/contracts'
import type { SettingScope, ThemeProfile, WireNotification } from '@hbar/contracts'
import type { ClientTheme, DeepPartial } from '@hbar/ui-sdk'

/** Pure data projection for the retained reference gallery; no Desktop store or I/O. */
export interface ReferenceThemeTarget {
  readonly scope: SettingScope
  readonly targetId?: string | undefined
  readonly parentTargetId?: string | undefined
}
export function isThemeEventRelevant(
  params: Extract<WireNotification, { method: 'settings.changed' }>['params'],
  state: ReferenceThemeTarget,
): boolean {
  const sameTarget = params.targetId === state.targetId
  return (
    params.scope === 'global' ||
    (params.scope === state.scope && sameTarget) ||
    (state.scope === 'session' && params.scope === 'project' && params.targetId === state.parentTargetId)
  )
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
    '--hbar-link': profile.colors.primary,
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
    '--radius-sm': `${Math.max(2, profile.surface.cornerRadius - 2)}px`,
    '--radius-md': `${profile.surface.cornerRadius}px`,
    '--radius-lg': `${profile.surface.cornerRadius + 2}px`,
    '--panel-radius': `${profile.surface.cornerRadius}px`,
    '--control-radius': `${Math.max(2, profile.surface.cornerRadius - 2)}px`,
    '--hbar-motion-duration':
      profile.motion.intensity === 'off' ? '0ms' : profile.motion.intensity === 'subtle' ? '160ms' : '220ms',
    '--hbar-motion-spin-duration':
      profile.motion.intensity === 'off' ? '0ms' : profile.motion.intensity === 'subtle' ? '1s' : '0.8s',
    '--hbar-motion-easing': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    '--hbar-shadow-color': profile.colors.background,
    '--dsh-motion-duration':
      profile.motion.intensity === 'off' ? '0ms' : profile.motion.intensity === 'subtle' ? '160ms' : '220ms',
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

export function mergeThemeContributions(
  profile: ThemeProfile,
  themes: readonly ClientTheme[],
  profileExplicit = true,
): ThemeProfile {
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

export function isDarkThemeColor(value: string): boolean {
  const red = Number.parseInt(value.slice(1, 3), 16)
  const green = Number.parseInt(value.slice(3, 5), 16)
  const blue = Number.parseInt(value.slice(5, 7), 16)
  if (![red, green, blue].every(Number.isFinite)) return true
  return (red * 299 + green * 587 + blue * 114) / 255_000 < 0.56
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
  const luminance = (rgb: number[]) =>
    0.2126 * channelLuminance(rgb[0]!) + 0.7152 * channelLuminance(rgb[1]!) + 0.0722 * channelLuminance(rgb[2]!)
  const lighter = Math.max(luminance(fg), luminance(bg))
  const darker = Math.min(luminance(fg), luminance(bg))
  return (lighter + 0.05) / (darker + 0.05)
}
