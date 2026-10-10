import {
  Activity,
  Blocks,
  CalendarDays,
  Circle,
  Command,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Settings,
} from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { LumenFrame, LumenIcon, type LumenTone } from '@lumen/app-ui'
import { HbarActionIconButton } from './action-icon-button'
import './workspace-sidebar-rail.css'

export interface WorkspaceSidebarRailLabels {
  readonly expand: string
  readonly navigation: string
  readonly newSession: string
  readonly extensions: string
  readonly commands: string
  readonly schedules: string
  readonly search: string
  readonly status: string
  readonly settings: string
  readonly reconnect: string
  readonly serverValue: string
}

export interface WorkspaceSidebarRailProps {
  readonly labels: WorkspaceSidebarRailLabels
  readonly expandRef?: Ref<HTMLButtonElement> | undefined
  readonly connected: boolean
  readonly serverTone: LumenTone
  readonly newDisabled: boolean
  readonly newBusy: boolean
  readonly extensionsSelected: boolean
  readonly commandsSelected: boolean
  readonly schedulesSelected: boolean
  readonly schedulesDisabled?: boolean | undefined
  readonly notificationNavigation?: ReactNode
  readonly searchSelected: boolean
  readonly statusSelected: boolean
  readonly settingsSelected: boolean
  readonly onExpand: () => void
  readonly onNew: () => void
  readonly onExtensions: () => void
  readonly onCommands: () => void
  readonly onSchedules: () => void
  readonly onSearch: () => void
  readonly onStatus: () => void
  readonly onSettings: () => void
  readonly onReconnect?: (() => void) | undefined
  readonly children?: ReactNode
}

function RailAction({
  label,
  selected,
  onClick,
  children,
  disabled,
  loading,
}: {
  readonly label: string
  readonly selected?: boolean | undefined
  readonly onClick: () => void
  readonly children: ReactNode
  readonly disabled?: boolean | undefined
  readonly loading?: boolean | undefined
}) {
  return (
    <HbarActionIconButton
      className="hbar-app-react-sidebar-rail-action"
      label={label}
      aria-pressed={selected}
      aria-current={selected ? 'page' : undefined}
      disabled={disabled}
      loading={loading}
      onClick={onClick}
    >
      {children}
    </HbarActionIconButton>
  )
}

/**
 * A host-owned desktop rail. The shared Lumen shell owns the pane width and
 * drawer lifecycle; this component owns only the compact action projection.
 */
export function WorkspaceSidebarRail({
  labels,
  expandRef,
  connected,
  serverTone,
  newDisabled,
  newBusy,
  extensionsSelected,
  commandsSelected,
  schedulesSelected,
  schedulesDisabled,
  notificationNavigation,
  searchSelected,
  statusSelected,
  settingsSelected,
  onExpand,
  onNew,
  onExtensions,
  onCommands,
  onSchedules,
  onSearch,
  onStatus,
  onSettings,
  onReconnect,
  children,
}: WorkspaceSidebarRailProps) {
  return (
    <LumenFrame as="aside" className="hbar-app-react-sidebar-rail">
      <LumenFrame as="header" className="hbar-app-react-sidebar-rail-header">
        {notificationNavigation}
        <HbarActionIconButton
          ref={expandRef}
          className="hbar-app-react-sidebar-rail-action"
          label={labels.expand}
          aria-expanded="false"
          onClick={onExpand}
        >
          <LumenIcon icon={PanelLeftOpen} tier="md" />
        </HbarActionIconButton>
      </LumenFrame>
      <LumenFrame className="hbar-app-react-sidebar-rail-body">
        <LumenFrame as="nav" aria-label={labels.navigation} className="hbar-app-react-sidebar-rail-navigation">
          <RailAction label={labels.newSession} disabled={newDisabled || !connected} loading={newBusy} onClick={onNew}>
            <LumenIcon icon={Plus} tier="md" />
          </RailAction>
          <RailAction label={labels.search} selected={searchSelected} onClick={onSearch}>
            <LumenIcon icon={Search} tier="md" />
          </RailAction>
        </LumenFrame>
        {children !== undefined && children !== null ? (
          <LumenFrame className="hbar-app-react-sidebar-rail-feedback">{children}</LumenFrame>
        ) : null}
      </LumenFrame>
      <LumenFrame as="footer" className="hbar-app-react-sidebar-rail-footer">
        <RailAction label={labels.status} selected={statusSelected} onClick={onStatus}>
          <LumenIcon icon={Activity} tier="md" />
        </RailAction>
        <RailAction
          label={labels.schedules}
          selected={schedulesSelected}
          disabled={schedulesDisabled}
          onClick={onSchedules}
        >
          <LumenIcon icon={CalendarDays} tier="md" />
        </RailAction>
        <RailAction label={labels.extensions} selected={extensionsSelected} onClick={onExtensions}>
          <LumenIcon icon={Blocks} tier="md" />
        </RailAction>
        <RailAction label={labels.commands} selected={commandsSelected} onClick={onCommands}>
          <LumenIcon icon={Command} tier="md" />
        </RailAction>
        <RailAction label={labels.settings} selected={settingsSelected} onClick={onSettings}>
          <LumenIcon icon={Settings} tier="md" />
        </RailAction>
        {!connected && onReconnect ? (
          <RailAction label={labels.reconnect} onClick={onReconnect}>
            <LumenIcon icon={RefreshCw} tier="md" />
          </RailAction>
        ) : null}
        <LumenFrame
          className="hbar-app-react-sidebar-rail-server"
          role="status"
          aria-label={labels.serverValue}
          title={labels.serverValue}
          data-tone={serverTone}
        >
          <LumenIcon icon={Circle} tier="sm" />
        </LumenFrame>
      </LumenFrame>
    </LumenFrame>
  )
}
