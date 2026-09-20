import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { ArrowLeft, X } from 'lucide-react'
import { HbarAppUiIcon } from './icon'
import { HbarAppUiIconButton } from './primitives'
import './tool-pane.css'

export interface HbarAppUiToolPaneProps {
  readonly title: string
  readonly targetLabel?: string | undefined
  readonly description?: string | undefined
  readonly icon?: LucideIcon | undefined
  readonly actions?: ReactNode
  readonly toolbar?: ReactNode
  readonly status?: ReactNode
  readonly error?: ReactNode
  readonly children: ReactNode
  readonly footer?: ReactNode
  readonly backLabel?: string | undefined
  readonly closeLabel?: string | undefined
  readonly onBack?: (() => void) | undefined
  readonly onClose?: (() => void) | undefined
  readonly busy?: boolean | undefined
  readonly className?: string | undefined
}

/**
 * Shared shell for a session-bound tool. The header and footer stay fixed while
 * the body owns the pane's only outer scrollbar. Visible copy remains host-owned.
 */
export function HbarAppUiToolPane({
  title,
  targetLabel,
  description,
  icon,
  actions,
  toolbar,
  status,
  error,
  children,
  footer,
  backLabel,
  closeLabel,
  onBack,
  onClose,
  busy = false,
  className = '',
}: HbarAppUiToolPaneProps) {
  return (
    <section
      className={`hbar-app-ui-session-tool-pane${className ? ` ${className}` : ''}`}
      aria-label={title}
      aria-busy={busy}
    >
      <header className="hbar-app-ui-session-tool-pane-header" data-tool-pane-slot="header">
        <div className="hbar-app-ui-session-tool-pane-start">
          {onBack && backLabel && (
            <HbarAppUiIconButton label={backLabel} onClick={onBack}>
              <HbarAppUiIcon icon={ArrowLeft} tier="sm" />
            </HbarAppUiIconButton>
          )}
          {icon && <HbarAppUiIcon icon={icon} tier="md" className="hbar-app-ui-session-tool-pane-icon" />}
          <div className="hbar-app-ui-session-tool-pane-copy">
            <div className="hbar-app-ui-session-tool-pane-heading">
              <h2>{title}</h2>
              {targetLabel && <span title={targetLabel}>{targetLabel}</span>}
            </div>
            {description && <p>{description}</p>}
          </div>
        </div>
        {(actions || (onClose && closeLabel)) && (
          <div className="hbar-app-ui-session-tool-pane-actions">
            {actions}
            {onClose && closeLabel && (
              <HbarAppUiIconButton label={closeLabel} onClick={onClose}>
                <HbarAppUiIcon icon={X} tier="sm" />
              </HbarAppUiIconButton>
            )}
          </div>
        )}
      </header>
      {toolbar && (
        <div className="hbar-app-ui-session-tool-pane-toolbar" data-tool-pane-slot="toolbar">
          {toolbar}
        </div>
      )}
      {status && (
        <div className="hbar-app-ui-session-tool-pane-status" data-tool-pane-slot="status">
          {status}
        </div>
      )}
      {error && (
        <div className="hbar-app-ui-session-tool-pane-error" data-tool-pane-slot="error" role="alert">
          {error}
        </div>
      )}
      <div className="hbar-app-ui-session-tool-pane-body" data-tool-pane-slot="body">
        {children}
      </div>
      {footer && (
        <footer className="hbar-app-ui-session-tool-pane-footer" data-tool-pane-slot="footer">
          {footer}
        </footer>
      )}
    </section>
  )
}
