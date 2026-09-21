import {
  LumenFrame,
  LumenText,
 LumenButton } from '@lumen/app-ui'
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
    <LumenFrame as="header" className="hbar-app-ui-page-header">
      {leading && <LumenFrame className="hbar-app-ui-page-header-leading">{leading}</LumenFrame>}
      <LumenFrame className="hbar-app-ui-page-heading">
        <LumenText as="h1" title={title}>{title}</LumenText>
        {context && <LumenText as="p" title={context}>{context}</LumenText>}
      </LumenFrame>
      <LumenFrame className="hbar-app-ui-page-header-end">
        {status && (
          <LumenText as="span" className="hbar-app-ui-page-status" data-tone={status.tone}>
            <LumenFrame as="i" aria-hidden="true" />
            {status.label}
          </LumenText>
        )}
        {actions && (
          <LumenFrame className="hbar-app-ui-page-actions" role="group" aria-label={actionsLabel}>
            {actions}
          </LumenFrame>
        )}
      </LumenFrame>
    </LumenFrame>
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
