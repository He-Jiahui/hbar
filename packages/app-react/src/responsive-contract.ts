export const VIEWPORT_BREAKPOINTS_REM = {
  narrow: 40,
  tablet: 48,
  wide: 64,
} as const

export type WorkspaceViewportTier = 'narrow' | 'compact' | 'tablet' | 'wide'

export function workspaceViewportTier(viewportWidthPx: number, rootFontSizePx: number): WorkspaceViewportTier {
  if (!Number.isFinite(viewportWidthPx) || !Number.isFinite(rootFontSizePx) || rootFontSizePx <= 0)
    throw new RangeError('Viewport width and root font size must be finite, with a positive root font size.')
  const widthRem = viewportWidthPx / rootFontSizePx
  if (widthRem < VIEWPORT_BREAKPOINTS_REM.narrow) return 'narrow'
  if (widthRem < VIEWPORT_BREAKPOINTS_REM.tablet) return 'compact'
  if (widthRem < VIEWPORT_BREAKPOINTS_REM.wide) return 'tablet'
  return 'wide'
}

export const WORKSPACE_VIEWPORT_MEDIA = {
  narrow: `(width < ${VIEWPORT_BREAKPOINTS_REM.narrow}rem)`,
  compact: `(width >= ${VIEWPORT_BREAKPOINTS_REM.narrow}rem) and (width < ${VIEWPORT_BREAKPOINTS_REM.tablet}rem)`,
  tablet: `(width >= ${VIEWPORT_BREAKPOINTS_REM.tablet}rem) and (width < ${VIEWPORT_BREAKPOINTS_REM.wide}rem)`,
  narrowShell: `(width < ${VIEWPORT_BREAKPOINTS_REM.wide}rem)`,
  tabletAndUp: `(width >= ${VIEWPORT_BREAKPOINTS_REM.tablet}rem)`,
  wide: `(width >= ${VIEWPORT_BREAKPOINTS_REM.wide}rem)`,
  coarseNarrow: `(width < ${VIEWPORT_BREAKPOINTS_REM.narrow}rem) and (pointer: coarse)`,
} as const
