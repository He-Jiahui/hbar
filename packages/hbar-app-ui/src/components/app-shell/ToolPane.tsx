import { LumenFrame, LumenText } from '@lumen/app-ui'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { HbarAppUiIcon } from '../../icon'
import './ToolPane.css'

export interface HbarAppUiToolPaneProps {
  readonly title: string
  readonly description?: string | undefined
  readonly icon: LucideIcon
  readonly actions?: ReactNode
  readonly toolbar?: ReactNode
  readonly status?: ReactNode
  readonly children: ReactNode
  readonly className?: string
  readonly busy?: boolean
}
/** Workbench engine slot: its header and toolbar remain outside the pane-owned content scroller. */
export function HbarAppUiToolPane({
  title,
  description,
  icon,
  actions,
  toolbar,
  status,
  children,
  className = '',
  busy = false,
}: HbarAppUiToolPaneProps) {
  return (
    <LumenFrame as="section" className={`hbar-app-ui-tool-pane ${className}`} aria-label={title} aria-busy={busy}>
      <LumenFrame as="header">
        <HbarAppUiIcon icon={icon} tier="md" />
        <LumenFrame>
          <LumenText as="h2">{title}</LumenText>
          {description && <LumenText as="p">{description}</LumenText>}
        </LumenFrame>
        {actions}
      </LumenFrame>
      {toolbar && <LumenFrame className="hbar-app-ui-tool-toolbar">{toolbar}</LumenFrame>}
      {status && <LumenFrame className="hbar-app-ui-tool-status">{status}</LumenFrame>}
      <LumenFrame className="hbar-app-ui-tool-content">{children}</LumenFrame>
    </LumenFrame>
  )
}
