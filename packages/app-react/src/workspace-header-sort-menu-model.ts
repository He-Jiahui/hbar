export type WorkspaceHeaderMenuAlignment = 'below' | 'flyout'

export interface WorkspaceHeaderMenuAnchor {
  readonly right: number
  readonly top: number
  readonly bottom: number
}

export interface WorkspaceHeaderMenuViewport {
  readonly width: number
  readonly height: number
  readonly rootFontSize: number
}

export interface WorkspaceHeaderMenuPosition {
  readonly left: number
  readonly top: number
}

/** Places an actual trigger-anchored menu and flips a flyout when the viewport is narrow. */
export function workspaceHeaderMenuPosition(
  anchor: WorkspaceHeaderMenuAnchor,
  viewport: WorkspaceHeaderMenuViewport,
  popupWidthRem: number,
  popupHeight: number,
  alignment: WorkspaceHeaderMenuAlignment,
): WorkspaceHeaderMenuPosition {
  const rootFontSize = Number.isFinite(viewport.rootFontSize) && viewport.rootFontSize > 0 ? viewport.rootFontSize : 16
  const margin = rootFontSize * 0.625
  const gap = rootFontSize * 0.5
  const availableWidth = Math.max(0, viewport.width - margin * 2)
  const popupWidth = Math.min(popupWidthRem * rootFontSize, availableWidth)
  const maximumLeft = Math.max(margin, viewport.width - popupWidth - margin)
  const desiredLeft = alignment === 'below' ? anchor.right - popupWidth : anchor.right + gap
  const left = clamp(desiredLeft, margin, maximumLeft)
  const availableHeight = Math.max(0, viewport.height - margin * 2)
  const boundedHeight = Math.min(Math.max(0, popupHeight), availableHeight)
  const maximumTop = Math.max(margin, viewport.height - boundedHeight - margin)
  const desiredTop = alignment === 'below' ? anchor.bottom + gap : anchor.top - gap

  return {
    left,
    top: clamp(desiredTop, margin, maximumTop),
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
