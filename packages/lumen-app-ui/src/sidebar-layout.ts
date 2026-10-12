import {
  resolveLumenToolPaneLayout,
  type LumenToolLayout,
  type LumenToolPaneGeometry,
  type LumenToolPaneLayout,
} from './tool-pane-layout'
import type { LumenToolResize } from './tool-pane-resize'

/** Host-owned sidebar bounds. Geometry is the entire workspace, before sidebar allocation. */
export interface LumenSidebarLayout extends LumenToolLayout {
  defaultWidthRem: number
}

export interface LumenSidebarResize extends LumenToolResize {
  resetLabel: string
  /** The host chooses a visible fallback when this focused control disappears. */
  onFocusUnavailable?: (() => void) | undefined
}

export interface LumenSidebarLayoutInput {
  sidebarPresent: boolean
  sidebarOpen: boolean
  viewportNarrow: boolean
  preferredWidthRem: number
  layout: LumenSidebarLayout
  geometry: LumenToolPaneGeometry | null
}

/** Only opt into resizing when both the sidebar minimum and usable main space fit. */
export function resolveLumenSidebarLayout(input: LumenSidebarLayoutInput): LumenToolPaneLayout {
  const inactive: LumenToolPaneLayout = {
    presentation: 'none',
    widthRem: null,
    minWidthRem: null,
    maxWidthRem: null,
  }
  if (!input.sidebarPresent || !input.sidebarOpen) {
    return inactive
  }
  if (input.viewportNarrow) {
    return { ...inactive, presentation: 'page' }
  }
  const resolved = resolveLumenToolPaneLayout({
    toolPresent: true,
    preferredWidthRem: Number.isFinite(input.preferredWidthRem)
      ? input.preferredWidthRem
      : input.layout.defaultWidthRem,
    layout: input.layout,
    geometry: input.geometry,
  })
  // A too-small embedded container must not silently become a new navigation page.
  // The host keeps its existing sidebar policy; only its resize control is unavailable.
  return resolved.presentation === 'split' ? resolved : inactive
}
