import type { ReactNode } from 'react'
import { Settings } from 'lucide-react'
import { LumenFrame, LumenIcon, LumenSidebarAction } from '@lumen/app-ui'
import { useWorkspaceSidebarFooterMessages } from './workspace-shell-messages'

export interface WorkspaceSidebarFooterProps {
  readonly secondaryNavigation?: ReactNode
  readonly feedback?: ReactNode
  readonly settingsSelected: boolean
  readonly onSettings: () => void
}

/** Two bounded destinations; the parent pane owns layout and scrolling. */
export function WorkspaceSidebarFooter(props: WorkspaceSidebarFooterProps) {
  const { t } = useWorkspaceSidebarFooterMessages()
  return (
    <LumenFrame className="hbar-app-react-sidebar-actions">
      {props.feedback}
      {props.secondaryNavigation}
      <LumenSidebarAction
        icon={<LumenIcon icon={Settings} tier="md" />}
        label={t('settings')}
        aria-label={t('settings')}
        detail={t('settingsShortcut')}
        selected={props.settingsSelected}
        onClick={props.onSettings}
      />
    </LumenFrame>
  )
}
