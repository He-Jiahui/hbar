import { Circle, PanelLeftOpen, Plus, Search, Settings } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { LumenFrame, LumenIcon, type LumenTone } from '@lumen/app-ui'
import { HbarActionIconButton } from './action-icon-button'
import { useWorkspaceSidebarRailMessages } from './workspace-shell-messages'
import './workspace-sidebar-rail.css'

export interface WorkspaceSidebarRailProps {
  readonly serverValue: string
  readonly expandRef?: Ref<HTMLButtonElement> | undefined
  readonly connected: boolean
  readonly serverTone: LumenTone
  readonly newDisabled: boolean
  readonly newBusy: boolean
  readonly secondaryNavigation?: ReactNode
  readonly notificationNavigation?: ReactNode
  readonly searchSelected: boolean
  readonly settingsSelected: boolean
  readonly onExpand: () => void
  readonly onNew: () => void
  readonly onSearch: () => void
  readonly onSettings: () => void
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
  serverValue,
  expandRef,
  connected,
  serverTone,
  newDisabled,
  newBusy,
  secondaryNavigation,
  notificationNavigation,
  searchSelected,
  settingsSelected,
  onExpand,
  onNew,
  onSearch,
  onSettings,
  children,
}: WorkspaceSidebarRailProps) {
  const { t } = useWorkspaceSidebarRailMessages()
  return (
    <LumenFrame as="aside" className="hbar-app-react-sidebar-rail">
      <LumenFrame as="header" className="hbar-app-react-sidebar-rail-header">
        {notificationNavigation}
        <HbarActionIconButton
          ref={expandRef}
          className="hbar-app-react-sidebar-rail-action"
          label={t('showSidebar')}
          aria-expanded="false"
          onClick={onExpand}
        >
          <LumenIcon icon={PanelLeftOpen} tier="md" />
        </HbarActionIconButton>
      </LumenFrame>
      <LumenFrame className="hbar-app-react-sidebar-rail-body">
        <LumenFrame as="nav" aria-label={t('projectsAndSessions')} className="hbar-app-react-sidebar-rail-navigation">
          <RailAction label={t('newSession')} disabled={newDisabled || !connected} loading={newBusy} onClick={onNew}>
            <LumenIcon icon={Plus} tier="md" />
          </RailAction>
          <RailAction label={t('searchChats')} selected={searchSelected} onClick={onSearch}>
            <LumenIcon icon={Search} tier="md" />
          </RailAction>
        </LumenFrame>
        {children !== undefined && children !== null ? (
          <LumenFrame className="hbar-app-react-sidebar-rail-feedback">{children}</LumenFrame>
        ) : null}
      </LumenFrame>
      <LumenFrame as="footer" className="hbar-app-react-sidebar-rail-footer">
        {secondaryNavigation}
        <RailAction label={t('settings')} selected={settingsSelected} onClick={onSettings}>
          <LumenIcon icon={Settings} tier="md" />
        </RailAction>
        <LumenFrame
          className="hbar-app-react-sidebar-rail-server"
          role="status"
          aria-label={`${t('server')} · ${serverValue}`}
          title={`${t('server')} · ${serverValue}`}
          data-tone={serverTone}
        >
          <LumenIcon icon={Circle} tier="sm" />
        </LumenFrame>
      </LumenFrame>
    </LumenFrame>
  )
}
