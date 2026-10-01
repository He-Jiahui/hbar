export interface SessionToolsMenuPosition {
  readonly left: number
  readonly top: number
  readonly availableHeight: number
}

/** Coordinates belong only to the trigger-anchored top-layer menu, not its rows. */
export function sessionToolsMenuPosition(
  anchor: { readonly right: number; readonly bottom: number },
  viewport: { readonly width: number; readonly height: number; readonly rem: number },
): SessionToolsMenuPosition {
  const gutter = viewport.rem * 0.625
  const width = Math.min(viewport.rem * 19, Math.max(0, viewport.width - gutter * 2))
  const top = Math.max(gutter, Math.min(anchor.bottom + viewport.rem * 0.25, viewport.height - gutter))
  return {
    left: Math.max(gutter, Math.min(anchor.right - width, viewport.width - width - gutter)),
    top,
    availableHeight: Math.max(0, viewport.height - top - gutter),
  }
}
