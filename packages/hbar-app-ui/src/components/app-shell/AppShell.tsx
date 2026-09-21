import {
  LumenCollection,
  LumenCollectionItem,
  LumenFrame,
  LumenText,
 LumenButton } from '@lumen/app-ui'
import {
  Activity,
  Bot,
  ChartNoAxesColumnIncreasing,
  ChevronDown,
  ChevronRight,
  Command,
  Files,
  Folder,
  FolderOpen,
  Menu,
  MessageSquare,
  PanelLeftClose,
  Puzzle,
  Plus,
  RefreshCw,
  Server,
  Settings,
  Target,
  type LucideIcon,
} from 'lucide-react'
import { useId, type CSSProperties, type ReactNode } from 'react'
import { HbarAppUiIcon, type HbarAppUiIconTier } from '../../icon'
import { HbarAppUiButton, HbarAppUiText, type HbarAppUiButtonProps } from '../../primitives'
import './AppShell.css'

export interface HbarAppUiAppShellProps {
  readonly label: string
  readonly sidebar?: ReactNode
  readonly sidebarWidthRem: number
  readonly toolWidthRem?: number
  readonly sidebarOpen: boolean
  readonly closeSidebarLabel: string
  readonly onCloseSidebar: () => void
  readonly header?: ReactNode
  readonly tool?: ReactNode
  readonly toolLabel?: string | undefined
  readonly overlay?: ReactNode
  readonly children: ReactNode
}

/** The host owns slot content; each bounded pane owns its scrolling. */
export function HbarAppUiAppShell({
  label,
  sidebar,
  sidebarWidthRem,
  toolWidthRem = 24,
  sidebarOpen,
  closeSidebarLabel,
  onCloseSidebar,
  header,
  tool,
  toolLabel,
  overlay,
  children,
}: HbarAppUiAppShellProps) {
  const style: CSSProperties & {
    '--hbar-app-ui-sidebar-size': string
    '--hbar-app-ui-tool-size': string
  } = {
    '--hbar-app-ui-sidebar-size': `${sidebarWidthRem}rem`,
    '--hbar-app-ui-tool-size': `${toolWidthRem}rem`,
  }
  return (
    <LumenFrame className="hbar-app-ui-app-shell" data-hbar-app-ui-shell="app" data-sidebar-open={sidebarOpen} style={style}>
      {sidebar && (
        <LumenFrame className="hbar-app-ui-app-sidebar-drawer" data-open={sidebarOpen}>
          <LumenFrame className="hbar-app-ui-app-sidebar-drawer-panel">{sidebar}</LumenFrame>
          <LumenButton
            type="button"
            className="hbar-app-ui-app-sidebar-backdrop"
            aria-label={closeSidebarLabel}
            onClick={onCloseSidebar}
          />
        </LumenFrame>
      )}
      <LumenFrame className="hbar-app-ui-app-frame">
        {header && <LumenFrame className="hbar-app-ui-app-header">{header}</LumenFrame>}
        <LumenFrame className="hbar-app-ui-app-body">
          <LumenFrame as="main" className="hbar-app-ui-app-main" aria-label={label}>
            {children}
          </LumenFrame>
          {tool && (
            <LumenFrame as="aside" className="hbar-app-ui-app-tool-drawer" aria-label={toolLabel}>
              {tool}
            </LumenFrame>
          )}
        </LumenFrame>
      </LumenFrame>
      {overlay}
    </LumenFrame>
  )
}

export type HbarAppUiShellIconName =
  | 'activity'
  | 'agents'
  | 'chevron-down'
  | 'chevron-right'
  | 'command'
  | 'files'
  | 'folder'
  | 'folder-open'
  | 'menu'
  | 'message'
  | 'monitoring'
  | 'panel-close'
  | 'plus'
  | 'puzzle'
  | 'refresh'
  | 'server'
  | 'settings'
  | 'goals'

const shellIcons: Readonly<Record<HbarAppUiShellIconName, LucideIcon>> = {
  activity: Activity,
  agents: Bot,
  'chevron-down': ChevronDown,
  'chevron-right': ChevronRight,
  command: Command,
  files: Files,
  folder: Folder,
  'folder-open': FolderOpen,
  menu: Menu,
  message: MessageSquare,
  monitoring: ChartNoAxesColumnIncreasing,
  'panel-close': PanelLeftClose,
  plus: Plus,
  puzzle: Puzzle,
  refresh: RefreshCw,
  server: Server,
  settings: Settings,
  goals: Target,
}

export function HbarAppUiShellIcon({
  name,
  tier = 'md',
}: {
  readonly name: HbarAppUiShellIconName
  readonly tier?: HbarAppUiIconTier
}) {
  return <HbarAppUiIcon icon={shellIcons[name]} tier={tier} />
}

export function HbarAppUiSidebarAction({
  icon,
  label,
  detail,
  selected = false,
  className = '',
  ...props
}: HbarAppUiButtonProps & {
  readonly icon: HbarAppUiShellIconName
  readonly label: string
  readonly detail?: string
  readonly selected?: boolean
}) {
  return (
    <HbarAppUiButton
      {...props}
      type="button"
      className={`hbar-app-ui-app-sidebar-action${className ? ` ${className}` : ''}`}
      aria-current={selected ? 'page' : undefined}
      variant={props.variant ?? 'ghost'}
    >
      <HbarAppUiShellIcon name={icon} />
      <HbarAppUiText as="span">{label}</HbarAppUiText>
      {detail && (
        <HbarAppUiText as="small" size="s" tone="subtle" variant="supporting">
          {detail}
        </HbarAppUiText>
      )}
    </HbarAppUiButton>
  )
}

export interface HbarAppUiAppSidebarProps {
  readonly brand: string
  readonly title: string
  readonly emptyLabel: string
  readonly status: {
    readonly label: string
    readonly value: string
    readonly tone: 'positive' | 'warning' | 'danger' | 'neutral'
  }
  /** Collection adapters supply their own paging/virtualization inside this scrollable slot. */
  readonly children?: ReactNode
  readonly brandAction?: ReactNode
  readonly primaryActions?: ReactNode
  readonly treeAction?: ReactNode
  readonly actions?: ReactNode
}

export function HbarAppUiAppSidebar({
  brand,
  title,
  emptyLabel,
  status,
  children,
  brandAction,
  primaryActions,
  treeAction,
  actions,
}: HbarAppUiAppSidebarProps) {
  const titleId = useId()
  return (
    <LumenFrame as="aside" className="hbar-app-ui-app-sidebar" aria-labelledby={titleId}>
      <LumenFrame as="header">
        <LumenFrame className="hbar-app-ui-app-brand-row">
          <LumenText as="strong" className="hbar-app-ui-app-brand">{brand}</LumenText>
          {brandAction}
        </LumenFrame>
        {primaryActions}
      </LumenFrame>
      <LumenFrame className="hbar-app-ui-app-sidebar-title">
        <LumenText as="h2" id={titleId}>{title}</LumenText>
        {treeAction}
      </LumenFrame>
      <LumenFrame className="hbar-app-ui-app-sidebar-content">{children ?? <LumenText as="p">{emptyLabel}</LumenText>}</LumenFrame>
      <LumenFrame as="footer">
        <LumenCollection as="dl" className="hbar-app-ui-app-host-status" data-tone={status.tone}>
          <LumenCollectionItem as="dt">
            <LumenFrame as="i" aria-hidden="true" />
            {status.label}
          </LumenCollectionItem>
          <LumenCollectionItem as="dd">{status.value}</LumenCollectionItem>
        </LumenCollection>
        {actions}
      </LumenFrame>
    </LumenFrame>
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
    <LumenFrame as="section" className="hbar-app-ui-workbench-notice" aria-labelledby={titleId}>
      <LumenText as="h1" id={titleId}>{title}</LumenText>
      <LumenText as="p">{description}</LumenText>
      {command && (
        <LumenFrame className="hbar-app-ui-workbench-command">
          <LumenText as="p">{command.label}</LumenText>
          <LumenText as="pre">
            <LumenText as="code">{command.value}</LumenText>
          </LumenText>
        </LumenFrame>
      )}
    </LumenFrame>
  )
}
