import { FolderOpen, ListChecks, Search, Settings, type LucideIcon } from 'lucide-react'
import { LumenContentText, LumenFrame, LumenButton, LumenIcon, LumenPageHeader } from '@lumen/app-ui'
import { useHbarRuntime, useHbarRuntimeSelector, useHbarRuntimeState } from './runtime'
import { currentSessionRun } from './session-run-activity'
import { HbarSessionExecutionStatus } from './session-execution-status'

import './lumen-session-workspace.css'
import { useHbarMobileHeaderMenuSection, type HbarMobileHeaderMenuItem } from './mobile-header-menu'
import { memo } from 'react'
function SessionToolButton({
  icon,
  label,
  selected,
  disabled,
  onClick,
}: {
  readonly icon: LucideIcon
  readonly label: string
  readonly selected?: boolean
  readonly disabled: boolean
  readonly onClick: () => void
}) {
  return (
    <LumenButton
      className="hbar-app-react-session-tool"
      size="s"
      variant="text"
      indicator="none"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      <LumenIcon icon={icon} tier="sm" />
    </LumenButton>
  )
}
import type { SessionWorkspaceHeaderProps } from './session-workspace-contract'
export const SessionWorkspaceHeader = memo(function SessionWorkspaceHeader({
  sessionTitle,
  workspaceName,
  labels,
  connected,
  showFilesInHeader = true,
  find,
  toolActions,
}: SessionWorkspaceHeaderProps) {
  const runtime = useHbarRuntime()
  const navigation = useHbarRuntimeState(runtime.state.navigation)
  const sessionId = navigation.sessionId
  const toolInstanceId = useHbarRuntimeSelector(runtime.state.presentation, (state) => state.toolInstanceId)
  const activeTool = useHbarRuntimeSelector(runtime.state.surfaces, (state) =>
    toolInstanceId ? state.panels[toolInstanceId] : undefined,
  )
  const activeRun = useHbarRuntimeSelector(runtime.state.timeline, (state) =>
    state.sessionId === sessionId
      ? currentSessionRun(
          state.runs.filter(
            (run) => run.sessionId === sessionId && ['queued', 'running', 'waiting_approval'].includes(run.status),
          ),
        )
      : null,
  )
  const { toggleTool, toolFailure, sourceTabInstanceKey } = toolActions
  const openSettings = () => {
    if (sessionId)
      void runtime.commands
        .execute('app.openSettings', { scope: 'session', targetId: sessionId })
        .catch(() => undefined)
  }
  const isToolActive = (panelId: 'files' | 'activity' | 'monitoring' | 'agents' | 'goals') =>
    sessionId !== null &&
    activeTool?.panelId === panelId &&
    activeTool.workspaceId === navigation.workspaceId &&
    activeTool.sessionId === sessionId
  const mobileSessionToolItems: readonly HbarMobileHeaderMenuItem[] = [
    {
      id: 'find',
      order: 0,
      label: labels.find.entry,
      icon: Search,
      disabled: find.disabled,
      pressed: find.open,
      onActivate: find.activate,
    },
    ...(showFilesInHeader
      ? [
          {
            id: 'files',
            order: 1,
            label: labels.tools.files,
            icon: FolderOpen,
            disabled: !sessionId,
            pressed: isToolActive('files'),
            onActivate: () => toggleTool('files'),
          } satisfies HbarMobileHeaderMenuItem,
        ]
      : []),
    {
      id: 'session-panel',
      order: 2,
      label: labels.tools.panel,
      icon: ListChecks,
      disabled: !sessionId,
      pressed: ['activity', 'monitoring', 'agents', 'goals'].some(
        (id) =>
          activeTool?.panelId === id &&
          activeTool.sessionId === sessionId &&
          activeTool.workspaceId === navigation.workspaceId,
      ),
      onActivate: () => toggleTool('monitoring'),
    },
    {
      id: 'settings',
      order: 6,
      label: labels.tools.settings,
      icon: Settings,
      disabled: !sessionId,
      onActivate: openSettings,
    },
  ]
  useHbarMobileHeaderMenuSection(
    sessionId ? { id: 'session-tools', order: 2, label: labels.tools.label, items: mobileSessionToolItems } : null,
  )
  return (
    <>
      <LumenPageHeader
        title={sessionTitle}
        context={workspaceName}
        actionsLabel={labels.tools.label}
        actions={
          <>
            {activeRun && (
              <LumenFrame role="status" aria-live="polite" aria-atomic="true">
                <HbarSessionExecutionStatus
                  state={connected ? activeRun.status : 'unconfirmed'}
                  label={connected ? labels.runs.statusLabel(activeRun.status) : labels.liveStatus.offline}
                  tone={
                    !connected || activeRun.status === 'waiting_approval'
                      ? 'warning'
                      : activeRun.status === 'running'
                        ? 'info'
                        : 'neutral'
                  }
                />
              </LumenFrame>
            )}
            {find.trigger}
            {showFilesInHeader && (
              <SessionToolButton
                icon={FolderOpen}
                label={labels.tools.files}
                selected={isToolActive('files')}
                disabled={!sessionId}
                onClick={() => toggleTool('files')}
              />
            )}
            <SessionToolButton
              icon={ListChecks}
              label={labels.tools.panel}
              selected={['activity', 'monitoring', 'agents', 'goals'].some(
                (id) =>
                  activeTool?.panelId === id &&
                  activeTool.sessionId === sessionId &&
                  activeTool.workspaceId === navigation.workspaceId,
              )}
              disabled={!sessionId}
              onClick={() => toggleTool('monitoring')}
            />
            <SessionToolButton
              icon={Settings}
              label={labels.tools.settings}
              selected={false}
              disabled={!sessionId}
              onClick={openSettings}
            />
          </>
        }
      />
      {connected &&
        toolFailure?.sessionId === sessionId &&
        toolFailure.workspaceId === navigation.workspaceId &&
        toolFailure.sourceTabInstanceKey === sourceTabInstanceKey && (
          <LumenContentText context="feedback.message" role="alert">
            {labels.tools.error(toolFailure.code)}
          </LumenContentText>
        )}
    </>
  )
})
