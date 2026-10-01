export interface WorkspaceTabMenuPosition {
  readonly left: number
  readonly top: number
  readonly availableHeight: number
}

/** Only the trigger-anchored overlay is positioned; its action rows remain in normal flow. */
export function workspaceTabMenuPosition(
  anchor: { readonly left: number; readonly bottom: number },
  viewport: { readonly width: number; readonly height: number; readonly rem: number },
): WorkspaceTabMenuPosition {
  const gutter = viewport.rem / 2
  const width = Math.min(18 * viewport.rem, Math.max(0, viewport.width - gutter * 2))
  const top = Math.max(gutter, Math.min(anchor.bottom + viewport.rem / 4, viewport.height - gutter))
  return {
    left: Math.max(gutter, Math.min(anchor.left, viewport.width - width - gutter)),
    top,
    availableHeight: Math.max(0, viewport.height - top - gutter),
  }
}
