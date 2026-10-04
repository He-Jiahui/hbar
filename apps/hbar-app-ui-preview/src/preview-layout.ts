import type { CSSProperties } from 'react'
import layout from './preview-layout.json'
export const previewLayoutStyle: CSSProperties & {
  '--hbar-app-ui-preview-pane-block-size': string
  '--hbar-app-ui-preview-command-block-size': string
} = {
  '--hbar-app-ui-preview-pane-block-size': layout.scrollingPaneBlockSize,
  '--hbar-app-ui-preview-command-block-size': layout.commandOverlayBlockSize,
}
