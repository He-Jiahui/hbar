import { z } from 'zod'

/**
 * Theme values are deliberately serialisable and constrained to a small,
 * portable subset. Components consume the resulting CSS variables rather
 * than inventing local colours or typography values.
 */
export const themeColorSchema = z.string().regex(/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i)
export type ThemeColor = z.infer<typeof themeColorSchema>

const fontFamilySchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine((value) => !/[\r\n;{}]/.test(value))
  .refine((value) => !/url\s*\(|var\s*\(|expression\s*\(/i.test(value))

export const themeProfileSchema = z
  .object({
    mode: z.enum(['dark', 'light', 'white', 'custom']),
    colors: z
      .object({
        primary: themeColorSchema,
        secondary: themeColorSchema,
        highlight: themeColorSchema,
        background: themeColorSchema,
        surface: themeColorSchema,
        surfaceElevated: themeColorSchema,
        border: themeColorSchema,
        borderStrong: themeColorSchema,
        textPrimary: themeColorSchema,
        textSecondary: themeColorSchema,
        textTertiary: themeColorSchema,
        headingText: themeColorSchema,
        focus: themeColorSchema,
        success: themeColorSchema,
        warning: themeColorSchema,
        error: themeColorSchema,
        info: themeColorSchema,
        codeBackground: themeColorSchema,
        diffAdded: themeColorSchema,
        diffRemoved: themeColorSchema,
        diffContext: themeColorSchema,
      })
      .strict(),
    typography: z
      .object({
        locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2,3})?$/),
        bodyFontFamily: fontFamilySchema,
        headingFontFamily: fontFamilySchema,
        codeFontFamily: fontFamilySchema,
        bodySize: z.number().min(10).max(24),
        headingSize: z.number().min(14).max(40),
        codeSize: z.number().min(9).max(24),
        bodyLineHeight: z.number().min(1).max(2.4),
        headingWeight: z.number().int().min(400).max(800),
        bodyWeight: z.number().int().min(300).max(800),
        underlineLinks: z.boolean(),
        bodyTextColor: themeColorSchema,
        headingTextColor: themeColorSchema,
        inlineCodeBackground: themeColorSchema,
        inlineCodeTextColor: themeColorSchema,
      })
      .strict(),
    surface: z
      .object({
        mode: z.enum(['solid', 'acrylic', 'liquid-glass']),
        backgroundOpacity: z.number().min(0.12).max(1),
        blurAmount: z.number().min(0).max(64),
        saturation: z.number().min(0).max(220),
        displacementScale: z.number().min(0).max(120),
        aberrationIntensity: z.number().min(0).max(10),
        elasticity: z.number().min(0).max(1),
        cornerRadius: z.number().min(0).max(32),
        glowIntensity: z.number().min(0).max(1),
        backgroundAsset: z.string().regex(/^[a-f0-9]{64}$/i).nullable(),
      })
      .strict(),
    motion: z
      .object({
        intensity: z.enum(['off', 'subtle', 'full']),
        respectReducedMotion: z.boolean(),
      })
      .strict(),
    renderer: z
      .object({
        markdown: z.string().max(160),
        code: z.string().max(160),
        patch: z.string().max(160),
        'git-diff': z.string().max(160),
      })
      .strict(),
  })
  .strict()

export type ThemeProfile = z.infer<typeof themeProfileSchema>
const themeSurfaceContributionSchema = themeProfileSchema.shape.surface.partial()
const themeMotionContributionSchema = themeProfileSchema.shape.motion.partial()
const themeAssetPathSchema = z.string().min(1).max(240).regex(/^(?!.*\.\.)(?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+$/)

const themeOverrideKeys: Record<string, readonly string[]> = {
  root: ['mode', 'colors', 'typography', 'surface', 'motion', 'renderer'],
  colors: ['primary', 'secondary', 'highlight', 'background', 'surface', 'surfaceElevated', 'border', 'borderStrong', 'textPrimary', 'textSecondary', 'textTertiary', 'headingText', 'focus', 'success', 'warning', 'error', 'info', 'codeBackground', 'diffAdded', 'diffRemoved', 'diffContext'],
  typography: ['locale', 'bodyFontFamily', 'headingFontFamily', 'codeFontFamily', 'bodySize', 'headingSize', 'codeSize', 'bodyLineHeight', 'headingWeight', 'bodyWeight', 'underlineLinks', 'bodyTextColor', 'headingTextColor', 'inlineCodeBackground', 'inlineCodeTextColor'],
  surface: ['mode', 'backgroundOpacity', 'blurAmount', 'saturation', 'displacementScale', 'aberrationIntensity', 'elasticity', 'cornerRadius', 'glowIntensity', 'backgroundAsset'],
  motion: ['intensity', 'respectReducedMotion'],
  renderer: ['markdown', 'code', 'patch', 'git-diff'],
}

function validateThemeOverride(value: unknown, level: keyof typeof themeOverrideKeys = 'root', depth = 0): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 3) return false
  const allowed = new Set(themeOverrideKeys[level])
  return Object.entries(value).every(([key, child]) => {
    if (!allowed.has(key)) return false
    if (child && typeof child === 'object' && !Array.isArray(child))
      return validateThemeOverride(child, key in themeOverrideKeys ? (key as keyof typeof themeOverrideKeys) : 'root', depth + 1)
    return true
  })
}

/** Metadata and token-only contribution accepted from a client theme plugin. */
export const themeContributionSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9._-]{0,127}$/),
    title: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    preview: z.string().max(240).optional(),
    priority: z.number().int().min(-1000).max(1000).optional(),
    tokenOverrides: z.record(z.string(), z.unknown()).default({}).superRefine((value, context) => {
      if (!validateThemeOverride(value)) context.addIssue({ code: 'custom', message: 'tokenOverrides must contain only ThemeProfile keys' })
    }),
    surfaceEffects: themeSurfaceContributionSchema.optional(),
    motion: themeMotionContributionSchema.optional(),
    backgroundAssets: z.array(themeAssetPathSchema).max(32).default([]),
  })
  .strict()
export type ThemeContribution = z.infer<typeof themeContributionSchema>

/** Neutral, low-saturation defaults with a restrained silver highlight. */
export const DEFAULT_THEME_PROFILE: ThemeProfile = {
  mode: 'dark',
  colors: {
    primary: '#c7ced8',
    secondary: '#9ca7b5',
    highlight: '#f2f5f8',
    background: '#0b0d10',
    surface: '#15181c',
    surfaceElevated: '#1c2025',
    border: '#2a3038',
    borderStrong: '#414a56',
    textPrimary: '#f2f4f7',
    textSecondary: '#c5ccd5',
    textTertiary: '#929ca8',
    headingText: '#ffffff',
    focus: '#dce3eb',
    success: '#7ed7a2',
    warning: '#e7bd78',
    error: '#ef8d8d',
    info: '#a9c3df',
    codeBackground: '#101317',
    diffAdded: '#75c995',
    diffRemoved: '#e98585',
    diffContext: '#aab3bf',
  },
  typography: {
    locale: 'zh-CN',
    bodyFontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    headingFontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    codeFontFamily: "'SF Mono', 'JetBrains Mono', 'Fira Code', Consolas, 'Liberation Mono', monospace",
    bodySize: 13,
    headingSize: 18,
    codeSize: 12,
    bodyLineHeight: 1.55,
    headingWeight: 650,
    bodyWeight: 400,
    underlineLinks: true,
    bodyTextColor: '#f2f4f7',
    headingTextColor: '#ffffff',
    inlineCodeBackground: '#20252b',
    inlineCodeTextColor: '#e1e7ee',
  },
  surface: {
    mode: 'acrylic',
    backgroundOpacity: 0.82,
    blurAmount: 18,
    saturation: 112,
    displacementScale: 18,
    aberrationIntensity: 0.4,
    elasticity: 0.12,
    cornerRadius: 8,
    glowIntensity: 0.16,
    backgroundAsset: null,
  },
  motion: { intensity: 'subtle', respectReducedMotion: true },
  renderer: { markdown: 'builtin', code: 'builtin', patch: 'builtin', 'git-diff': 'builtin' },
}

export function normalizeThemeProfile(value: unknown): ThemeProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_THEME_PROFILE
  const candidate = value as Record<string, unknown>
  const parsed = themeProfileSchema.safeParse(candidate)
  return parsed.success ? parsed.data : DEFAULT_THEME_PROFILE
}
