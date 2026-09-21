import { LumenButton } from '@lumen/app-ui'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { HbarAppUiShellIcon, type HbarAppUiShellIconName } from './AppShell'
import './PageHeader.css'

export interface HbarAppUiPageHeaderProps {
  readonly title: string
  readonly context?: string | undefined
  readonly leading?: ReactNode
  readonly status?:
    | {
        readonly label: string
        readonly tone: 'neutral' | 'positive' | 'warning' | 'danger'
      }
    | undefined
  readonly actionsLabel?: string | undefined
  readonly actions?: ReactNode
}

/** A single title row for a workbench page. The host owns all visible copy and actions. */
export function HbarAppUiPageHeader({
  title,
  context,
  leading,
  status,
  actionsLabel,
  actions,
}: HbarAppUiPageHeaderProps) {
  return (
    <header className="hbar-app-ui-page-header">
      {leading && <div className="hbar-app-ui-page-header-leading">{leading}</div>}
      <div className="hbar-app-ui-page-heading">
        <h1 title={title}>{title}</h1>
        {context && <p title={context}>{context}</p>}
      </div>
      <div className="hbar-app-ui-page-header-end">
        {status && (
          <span className="hbar-app-ui-page-status" data-tone={status.tone}>
            <i aria-hidden="true" />
            {status.label}
          </span>
        )}
        {actions && (
          <div className="hbar-app-ui-page-actions" role="group" aria-label={actionsLabel}>
            {actions}
          </div>
        )}
      </div>
    </header>
  )
}

export function HbarAppUiPageAction({
  icon,
  label,
  selected = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly icon: HbarAppUiShellIconName
  readonly label: string
  readonly selected?: boolean
}) {
  return (
    <LumenButton
      {...props}
      type="button"
      className={`hbar-app-ui-page-action${className ? ` ${className}` : ''}`}
      aria-label={label}
      aria-pressed={selected}
      title={props.title ?? label}
    >
      <HbarAppUiShellIcon name={icon} tier="sm" />
    </LumenButton>
  )
}
