import type { PanelSurface, PresentationState } from './types'

/** Legacy pinned/follow-active surfaces retain their original read lifetime. */
export function isSessionToolVisible(
  panel: PanelSurface | undefined,
  presentation: PresentationState | undefined,
): boolean {
  if (!panel) return false
  if (!panel.sessionTool) return true
  return presentation?.page.kind === 'session' && presentation.toolInstanceId === panel.instanceId
}
