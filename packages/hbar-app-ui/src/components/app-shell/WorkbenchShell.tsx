import { LumenFrame, LumenText, LumenButton, LumenSelect } from '@lumen/app-ui'
import { LumenOption } from '@lumen/app-ui/catalog'
import { Command, PanelLeftClose, PanelLeftOpen, Plus, type LucideIcon } from 'lucide-react'
import { createContext, useContext, type ReactNode } from 'react'
import { HbarAppUiIcon } from '../../icon'
import './WorkbenchShell.css'

export interface HbarAppUiShellLabels {
  readonly toggleSidebar: string
  readonly workspace: string
  readonly addWorkspace: string
  readonly commands: string
  readonly navigation: string
}

export interface HbarAppUiNavigationItem {
  readonly id: string
  readonly label: string
  readonly icon: LucideIcon
  readonly selected?: boolean | undefined
  readonly disabled?: boolean | undefined
  readonly badge?: string | undefined
}

export interface HbarAppUiShellProps {
  readonly brand: string
  readonly labels: HbarAppUiShellLabels
  /** Short workspace selector; its host owns loading and records. */
  readonly workspaces: readonly { readonly id: string; readonly label: string }[]
  readonly workspaceId: string
  readonly connection: { readonly label: string; readonly connected: boolean }
  readonly sidebarOpen: boolean
  readonly onToggleSidebar: () => void
  readonly onWorkspaceChange: (id: string) => void
  readonly onAddWorkspace: () => void
  readonly onOpenCommands: () => void
  readonly children: ReactNode
  readonly className?: string | undefined
}

/** App Shell 03: one global header, followed by the host's workbench regions. */
export function HbarAppUiWorkbenchShell(props: HbarAppUiShellProps) {
  const { labels } = props
  const workspaces = [...new Map(props.workspaces.map((item) => [item.id, item])).values()]
  const selectedWorkspace = workspaces.some((item) => item.id === props.workspaceId) ? props.workspaceId : ''
  return (
    <LumenFrame className={`hbar-app-ui-workbench ${props.className ?? ''}`} data-hbar-app-ui-shell="workbench">
      <LumenFrame as="header" className="hbar-app-ui-workbench-header">
        <LumenText as="strong" className="hbar-app-ui-workbench-brand">{props.brand}</LumenText>
        <LumenButton
          type="button"
          aria-label={labels.toggleSidebar}
          title={labels.toggleSidebar}
          aria-expanded={props.sidebarOpen}
          onClick={props.onToggleSidebar}
        >
          <HbarAppUiIcon icon={props.sidebarOpen ? PanelLeftClose : PanelLeftOpen} />
        </LumenButton>
        <LumenSelect
          aria-label={labels.workspace}
          value={selectedWorkspace}
          onChange={(event) => props.onWorkspaceChange(event.target.value)}
        >
          <LumenOption value="" disabled>
            {labels.workspace}
          </LumenOption>
          {workspaces.map((workspace) => (
            <LumenOption key={workspace.id} value={workspace.id}>
              {workspace.label}
            </LumenOption>
          ))}
        </LumenSelect>
        <LumenButton
          type="button"
          aria-label={labels.addWorkspace}
          title={labels.addWorkspace}
          onClick={props.onAddWorkspace}
        >
          <HbarAppUiIcon icon={Plus} />
        </LumenButton>
        <LumenButton
          type="button"
          className="hbar-app-ui-workbench-search"
          onClick={props.onOpenCommands}
          aria-label={labels.commands}
        >
          <HbarAppUiIcon icon={Command} />
          <LumenText as="span">{labels.commands}</LumenText>
        </LumenButton>
        <LumenText as="span" className="hbar-app-ui-workbench-connection" data-connected={props.connection.connected} role="status">
          <LumenFrame as="i" aria-hidden="true" />
          {props.connection.label}
        </LumenText>
      </LumenFrame>
      {props.children}
    </LumenFrame>
  )
}

/** Navigation is short and content-grown; domain collections scroll separately. */
export function HbarAppUiNavigation({
  items,
  label,
  onSelect,
  compact = false,
}: {
  readonly items: readonly HbarAppUiNavigationItem[]
  readonly label: string
  readonly onSelect: (id: string) => void
  readonly compact?: boolean
}) {
  const unique = [...new Map(items.map((item) => [item.id, item])).values()]
  return (
    <LumenFrame as="nav" className={`hbar-app-ui-workbench-navigation${compact ? ' is-compact' : ''}`} aria-label={label}>
      {unique.map((item) => (
        <LumenButton
          key={item.id}
          type="button"
          aria-label={item.label}
          title={item.label}
          aria-current={item.selected ? 'page' : undefined}
          disabled={item.disabled}
          onClick={() => onSelect(item.id)}
        >
          <HbarAppUiIcon icon={item.icon} />
          <LumenText as="span">{item.label}</LumenText>
          {item.badge && <LumenText as="small">{item.badge}</LumenText>}
        </LumenButton>
      ))}
    </LumenFrame>
  )
}

const ShellContext = createContext<HbarAppUiShellProps | undefined>(undefined)
export function HbarAppUiShellProvider({
  content,
  children,
}: {
  readonly content: HbarAppUiShellProps
  readonly children: ReactNode
}) {
  return <ShellContext.Provider value={content}>{children}</ShellContext.Provider>
}
export function useHbarAppUiShellContent() {
  return useContext(ShellContext)
}
