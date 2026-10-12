/** Descriptor-owned dimensions; available width is the body after sidebar allocation. */
export interface LumenToolLayout {
  constrainedPresentation?: 'page' | 'drawer' | undefined
  mainMinWidthRem: number
  minWidthRem: number
  maxWidthRem: number
}

export type LumenToolPresentation = 'none' | 'split' | 'page' | 'drawer'

export interface LumenToolPaneGeometry {
  availableInlineSizePx: number
  rootFontSizePx: number
}

export interface LumenToolPaneLayoutInput {
  toolPresent: boolean
  preferredWidthRem: number
  layout: LumenToolLayout
  geometry: LumenToolPaneGeometry | null
}

export interface LumenToolPaneLayout {
  presentation: LumenToolPresentation
  /** Null outside split; the page consumes available flow space, not a fixed minimum. */
  widthRem: number | null
  minWidthRem: number | null
  maxWidthRem: number | null
}

/** The flow separator includes its hit area, so it cannot overlap either pane. */
export const LUMEN_TOOL_SEPARATOR_WIDTH_REM = 0.375

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

/** One sizing decision drives CSS and accessibility; no competing viewport breakpoint. */
export function resolveLumenToolPaneLayout(input: LumenToolPaneLayoutInput): LumenToolPaneLayout {
  const notSplit = (presentation: 'none' | 'page' | 'drawer'): LumenToolPaneLayout => ({
    presentation,
    widthRem: null,
    minWidthRem: null,
    maxWidthRem: null,
  })
  if (!input.toolPresent) {
    return notSplit('none')
  }
  const { layout, geometry } = input
  if (
    !geometry ||
    !positive(geometry.availableInlineSizePx) ||
    !positive(geometry.rootFontSizePx) ||
    !positive(layout.mainMinWidthRem) ||
    !positive(layout.minWidthRem) ||
    !positive(layout.maxWidthRem) ||
    layout.maxWidthRem < layout.minWidthRem
  ) {
    return notSplit(layout.constrainedPresentation ?? 'page')
  }
  const availableRem = geometry.availableInlineSizePx / geometry.rootFontSizePx
  const maximum = Math.min(layout.maxWidthRem, availableRem - layout.mainMinWidthRem - LUMEN_TOOL_SEPARATOR_WIDTH_REM)
  if (!Number.isFinite(maximum) || maximum < layout.minWidthRem) {
    return notSplit(layout.constrainedPresentation ?? 'page')
  }
  const preferred = positive(input.preferredWidthRem) ? input.preferredWidthRem : layout.minWidthRem
  return {
    presentation: 'split',
    widthRem: Math.min(maximum, Math.max(layout.minWidthRem, preferred)),
    minWidthRem: layout.minWidthRem,
    maxWidthRem: maximum,
  }
}

export function nextLumenToolPaneWidth(
  currentRem: number,
  command: 'increase' | 'decrease' | 'min' | 'max',
  geometry: LumenToolPaneGeometry,
  layout: LumenToolPaneLayout,
): number | null {
  if (
    layout.presentation !== 'split' ||
    layout.minWidthRem === null ||
    layout.maxWidthRem === null ||
    !positive(geometry.rootFontSizePx) ||
    !Number.isFinite(currentRem)
  ) {
    return null
  }
  const step = 32 / geometry.rootFontSizePx
  const next =
    command === 'min'
      ? layout.minWidthRem
      : command === 'max'
        ? layout.maxWidthRem
        : currentRem + (command === 'increase' ? step : -step)
  return Math.min(layout.maxWidthRem, Math.max(layout.minWidthRem, next))
}
