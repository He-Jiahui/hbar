import type { ReactNode } from 'react'
import { Settings } from 'lucide-react'
import { LumenFrame, LumenIcon, LumenSidebarAction } from '@lumen/app-ui'

export interface WorkspaceSidebarFooterProps {
  readonly secondaryNavigation?: ReactNode
  readonly feedback?: ReactNode
  readonly settings: string
  readonly settingsShortcut: string
  readonly settingsSelected: boolean
  readonly onSettings: () => void
}

/** Two bounded destinations; the parent pane owns layout and scrolling. */
export function WorkspaceSidebarFooter(props: WorkspaceSidebarFooterProps) {
  return (
    <LumenFrame className="hbar-app-react-sidebar-actions">
      {props.feedback}
      {props.secondaryNavigation}
      <LumenSidebarAction
        icon={<LumenIcon icon={Settings} tier="md" />}
        label={props.settings}
        aria-label={props.settings}
        detail={props.settingsShortcut}
        selected={props.settingsSelected}
        onClick={props.onSettings}
      />
    </LumenFrame>
  )
}
