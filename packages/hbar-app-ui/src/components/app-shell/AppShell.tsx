import { useId, type CSSProperties, type ReactNode } from 'react'
import './AppShell.css'

export interface HbarAppUiAppShellProps {
  readonly label: string
  readonly sidebar?: ReactNode
  readonly sidebarWidthRem: number
  readonly children: ReactNode
}

/** The host owns slot content; each bounded pane owns its scrolling. */
export function HbarAppUiAppShell({ label, sidebar, sidebarWidthRem, children }: HbarAppUiAppShellProps) {
  const style: CSSProperties & { '--hbar-app-ui-sidebar-size': string } = {
    '--hbar-app-ui-sidebar-size': `${sidebarWidthRem}rem`,
  }
  return (
    <div className="hbar-app-ui-app-shell" data-hbar-app-ui-shell="app" style={style}>
      {sidebar}
      <main className="hbar-app-ui-app-main" aria-label={label}>
        {children}
      </main>
    </div>
  )
}

export interface HbarAppUiAppSidebarProps {
  readonly brand: string
  readonly title: string
  readonly emptyLabel: string
  readonly status: { readonly label: string; readonly value: string }
  /** Collection adapters supply their own paging/virtualization inside this scrollable slot. */
  readonly children?: ReactNode
  readonly actions?: ReactNode
}

export function HbarAppUiAppSidebar({ brand, title, emptyLabel, status, children, actions }: HbarAppUiAppSidebarProps) {
  const titleId = useId()
  return (
    <aside className="hbar-app-ui-app-sidebar" aria-labelledby={titleId}>
      <header>
        <strong className="hbar-app-ui-app-brand">{brand}</strong>
        <h2 id={titleId}>{title}</h2>
      </header>
      <div className="hbar-app-ui-app-sidebar-content">{children ?? <p>{emptyLabel}</p>}</div>
      <footer>
        <dl className="hbar-app-ui-app-host-status">
          <dt>{status.label}</dt>
          <dd>{status.value}</dd>
        </dl>
        {actions}
      </footer>
    </aside>
  )
}

export interface HbarAppUiWorkbenchNoticeProps {
  readonly title: string
  readonly description: string
  readonly command?: { readonly label: string; readonly value: string }
}

export function HbarAppUiWorkbenchNotice({ title, description, command }: HbarAppUiWorkbenchNoticeProps) {
  const titleId = useId()
  return (
    <section className="hbar-app-ui-workbench-notice" aria-labelledby={titleId}>
      <h1 id={titleId}>{title}</h1>
      <p>{description}</p>
      {command && (
        <div className="hbar-app-ui-workbench-command">
          <p>{command.label}</p>
          <pre>
            <code>{command.value}</code>
          </pre>
        </div>
      )}
    </section>
  )
}
