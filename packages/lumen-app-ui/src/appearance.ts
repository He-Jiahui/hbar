export const LUMEN_SIZES = ['s', 'm', 'l'] as const

export type LumenSize = (typeof LUMEN_SIZES)[number]
export type LumenShape = 'square' | 'rounded'

/** Concrete CSS colors (hex, rgb or hsl); semantic overrides remain host-owned. */
export interface LumenColors {
  foreground: string
  background: string
  contrast: string
  muted: string
  subtle: string
  info: string
  success: string
  warning: string
  danger: string
}

export interface LumenAppearance {
  mode: LumenMode
  controlSize: LumenSize
  textSize: LumenSize
  cornerSize: LumenSize
  shape: LumenShape
  glow: number
  motion: boolean
  colors?: Partial<LumenColors> | undefined
}

export type LumenMode = 'dark' | 'light'

export const DEFAULT_LUMEN_APPEARANCE: Readonly<LumenAppearance> = Object.freeze({
  mode: 'dark',
  controlSize: 'm',
  textSize: 'm',
  cornerSize: 'm',
  shape: 'rounded',
  glow: 65,
  motion: true,
})

export function resolveLumenColors(mode: LumenMode, overrides: Partial<LumenColors> = {}): LumenColors {
  const dark = mode === 'dark'
  const foreground = overrides.foreground ?? (dark ? '#eeeeee' : '#171717')
  const background = overrides.background ?? (dark ? '#090909' : '#f5f5f5')
  const customized = overrides.foreground !== undefined || overrides.background !== undefined
  let muted = dark ? '#aaaaaa' : '#5e5e5e'
  let subtle = dark ? '#858585' : '#666666'
  if (customized) {
    muted = `color-mix(in srgb, ${foreground} 72%, ${background})`
    subtle = `color-mix(in srgb, ${foreground} 62%, ${background})`
  }
  return {
    foreground,
    background,
    contrast: overrides.contrast ?? background,
    muted: overrides.muted ?? muted,
    subtle: overrides.subtle ?? subtle,
    info: overrides.info ?? (dark ? '#81b5ff' : '#285bc3'),
    success: overrides.success ?? (dark ? '#77deb0' : '#16724e'),
    warning: overrides.warning ?? (dark ? '#efd17a' : '#996500'),
    danger: overrides.danger ?? (dark ? '#ff969b' : '#b73548'),
  }
}

export function getLumenColorProperties(
  mode: LumenMode,
  overrides: Partial<LumenColors> = {},
): Record<`--lumen-${string}`, string> {
  const colors = resolveLumenColors(mode, overrides)
  const mix = (color: string, percentage: number) => `color-mix(in srgb, ${color} ${percentage}%, transparent)`
  const properties: Record<`--lumen-${string}`, string> = { '--lumen-canvas': colors.background }
  if (overrides.foreground !== undefined || overrides.background !== undefined) {
    Object.assign(properties, {
      '--lumen-ink': colors.foreground,
      '--lumen-canvas': colors.background,
      '--lumen-contrast': colors.contrast,
      '--lumen-muted': colors.muted,
      '--lumen-subtle': colors.subtle,
      '--lumen-info': colors.info,
      '--lumen-accent': colors.info,
      '--lumen-success': colors.success,
      '--lumen-warning': colors.warning,
      '--lumen-danger': colors.danger,
      '--lumen-line': mix(colors.foreground, 10),
      '--lumen-edge': mix(colors.foreground, mode === 'dark' ? 17 : 14),
      '--lumen-overlay-edge': mix(colors.foreground, 32),
      '--lumen-overlay-glow-near': mix(colors.foreground, 18),
      '--lumen-overlay-glow-far': mix(colors.foreground, 8),
      '--lumen-panel': colors.background,
      '--lumen-frost': mix(colors.background, 94),
      '--lumen-glass': mix(colors.background, mode === 'dark' ? 30 : 35),
      '--lumen-reading': mix(colors.background, mode === 'dark' ? 28 : 45),
      '--lumen-scrollbar-track': colors.background,
      '--lumen-scrollbar-core': colors.foreground,
      '--lumen-scrollbar-halo': mix(colors.foreground, 65),
      '--lumen-scrollbar-edge': mix(colors.foreground, 18),
    })
  }
  for (const key of ['contrast', 'muted', 'subtle', 'info', 'success', 'warning', 'danger'] as const) {
    if (overrides[key] !== undefined) {
      properties[`--lumen-${key}`] = colors[key]
    }
  }
  if (overrides.info !== undefined) {
    properties['--lumen-accent'] = colors.info
  }
  return properties
}

export interface LumenAppearanceRoot {
  readonly dataset: {
    lumenMode?: string | undefined
    lumenControlSize?: string | undefined
    lumenTextSize?: string | undefined
    lumenCornerSize?: string | undefined
    lumenShape?: string | undefined
    lumenMotion?: string | undefined
  }
  readonly style: {
    colorScheme: string
    setProperty(name: string, value: string): void
  }
}

export function normalizeLumenGlow(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_LUMEN_APPEARANCE.glow
  }
  return Math.min(100, Math.max(0, value))
}

export function applyLumenAppearance(root: LumenAppearanceRoot, appearance: Readonly<LumenAppearance>): void {
  root.dataset.lumenMode = appearance.mode
  root.dataset.lumenControlSize = appearance.controlSize
  root.dataset.lumenTextSize = appearance.textSize
  root.dataset.lumenCornerSize = appearance.cornerSize
  root.dataset.lumenShape = appearance.shape
  root.dataset.lumenMotion = appearance.motion ? 'on' : 'off'
  root.style.colorScheme = appearance.mode
  root.style.setProperty('--lumen-glow', String(normalizeLumenGlow(appearance.glow) / 100))
  const defaults = resolveLumenColors(appearance.mode)
  const allKeys = getLumenColorProperties(appearance.mode, { foreground: defaults.foreground })
  const colors = getLumenColorProperties(appearance.mode, appearance.colors)
  for (const name of Object.keys(allKeys)) {
    root.style.setProperty(name, '')
  }
  for (const [name, value] of Object.entries(colors)) {
    root.style.setProperty(name, value)
  }
}
