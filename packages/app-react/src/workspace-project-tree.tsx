import { NavigationActionFeedback } from './workspace-navigation-feedback'
import { LumenContentText, LumenButton, LumenFrame, LumenTree, LumenTreeItem } from '@lumen/app-ui'
import { HbarActionIconButton } from './action-icon-button'
import { SidebarCaption } from './sidebar-caption'
import { workspaceDisplayName } from '@hbar/app-runtime'

import './lumen-workspace-shell.css'
import './sidebar-entry-layout.css'
import './workspace-session-entry.css'
import './sidebar-navigation.css'
import { WorkspaceProjectMenu } from './workspace-organization'
import { SidebarTimeView, type SidebarTimeProject } from './sidebar-time-view'
import { SessionAgentBranch } from './session-agent-branch'
import { ArchivedSessions } from './session-archive'
import { SessionRosterFeedback } from './session-roster-feedback'
import { WorkspaceShellIcon } from './workspace-shell-icons'
import { memo } from 'react'
import type { WorkspaceSidebarProps } from './workspace-shell-contract'
import type { useWorkspaceSidebar } from './workspace-sidebar-model'
export const WorkspaceProjectTree = memo(function WorkspaceProjectTree({
  props,
  model,
}: {
  readonly props: WorkspaceSidebarProps
  readonly model: Pick<
    ReturnType<typeof useWorkspaceSidebar>,
    | 'directory'
    | 'workspacePins'
    | 'workspaceActivity'
    | 'agentTree'
    | 'timeView'
    | 'displayNames'
    | 'sidebarTreeRef'
    | 'hiddenWorkspaceIds'
    | 'rosterRefresh'
    | 'expanded'
    | 'setExpanded'
    | 'workspaceActionError'
    | 'setWorkspaceActionError'
    | 'navigationAction'
    | 'setNavigationAction'
    | 'actionWorkspaceId'
    | 'setActionWorkspaceId'
    | 'sessionTimeNow'
    | 'setSessionTimeNow'
    | 'batchSelecting'
    | 'setBatchSelecting'
    | 'batchSelection'
    | 'setBatchSelection'
    | 'batchToolbarRef'
    | 'loadSessions'
    | 'editWorkspace'
    | 'displayNameBusy'
    | 'organizationInitializing'
    | 'sidebarWorkspaces'
    | 'manualProjectView'
    | 'projectReorderEnabled'
    | 'sidebarOrder'
    | 'moveProject'
    | 'projectReorder'
    | 'organizationCanWrite'
    | 'hideWorkspace'
    | 'refreshProjectSessions'
    | 'pinBusy'
    | 'toggleWorkspacePin'
    | 'checkWorkspacePin'
    | 'sessionsByWorkspace'
    | 'timelineItems'
    | 'timelineById'
    | 'timeGroups'
    | 'exitBatchSelection'
    | 'toggleBatchSession'
    | 'openWorkspaceSurface'
    | 'navigationBusy'
    | 'navigationBlocked'
    | 'connected'
    | 'reconcileNavigationAction'
    | 'newSession'
    | 'openFolders'
    | 'openSession'
  >
}) {
  const {
    directory,
    workspacePins,
    workspaceActivity,
    agentTree,
    timeView,
    displayNames,
    sidebarTreeRef,
    hiddenWorkspaceIds,
    rosterRefresh,
    expanded,
    setExpanded,
    workspaceActionError,
    navigationAction,
    actionWorkspaceId,
    sessionTimeNow,
    batchSelecting,
    batchSelection,
    batchToolbarRef,
    loadSessions,
    editWorkspace,
    displayNameBusy,
    organizationInitializing,
    sidebarWorkspaces,
    manualProjectView,
    projectReorderEnabled,
    sidebarOrder,
    moveProject,
    projectReorder,
    organizationCanWrite,
    hideWorkspace,
    refreshProjectSessions,
    pinBusy,
    toggleWorkspacePin,
    checkWorkspacePin,
    sessionsByWorkspace,
    timelineItems,
    timelineById,
    timeGroups,
    exitBatchSelection,
    toggleBatchSession,
    openWorkspaceSurface,
    navigationBusy,
    navigationBlocked,
    connected,
    reconcileNavigationAction,
    newSession,
    openFolders,
    openSession,
  } = model
  const { execute, recordError } = props.bridge
  return (
    <LumenTree
      as="nav"
      ref={sidebarTreeRef}
      className="hbar-app-react-project-tree"
      label={timeView ? props.labels.sort.time.title : props.labels.projectsAndSessions}
      data-sidebar-organization={workspaceActivity.organization}
      aria-multiselectable={batchSelecting || undefined}
    >
      {timeView && (
        <>
          {timelineItems.length === 0 && !workspaceActivity.timeline.error && (
            <LumenContentText context="section.description">
              {workspaceActivity.timeline.status !== 'ready' ? props.labels.loading : props.labels.noSessions}
            </LumenContentText>
          )}
          <SidebarTimeView
            groups={timeGroups}
            labels={props.labels.sort.time.groups}
            projectExpanded={(projectId) => expanded.has(projectId)}
            onProjectExpandedChange={(projectId, value) =>
              setExpanded((current) => {
                const next = new Set(current)
                if (value) next.add(projectId)
                else next.delete(projectId)
                return next
              })
            }
            projectForSession={(sessionId): SidebarTimeProject | null => {
              const item = timelineById.get(sessionId)
              const workspace = item ? directory.workspaces[item.workspaceId] : undefined
              return workspace
                ? {
                    id: workspace.id,
                    label: workspaceDisplayName(workspace, displayNames.snapshot),
                  }
                : null
            }}
            renderProject={(project) => (
              <LumenFrame className="hbar-app-react-sidebar-time-project-line">
                <WorkspaceShellIcon name="folder" />
                <SidebarCaption text={project.label} />
              </LumenFrame>
            )}
            renderSession={(sessionId) => {
              const item = timelineById.get(sessionId)
              const session = directory.sessions[sessionId]
              if (!item || !session) return null
              return (
                <SessionAgentBranch
                  session={session}
                  showLoadFeedback={false}
                  childCount={item.agentChildCount ?? 0}
                  treeLabels={props.labels.agentTree}
                  connected={connected}
                  labels={props.labels}
                  now={sessionTimeNow}
                  metadata={{
                    workspaceName: item.displayName,
                    workspacePath: directory.workspaces[item.workspaceId]?.path,
                    execution: {
                      state: item.execution.state,
                      label: props.labels.sort.time.execution[item.execution.state],
                    },
                  }}
                  batchSelecting={batchSelecting}
                  batchSelection={batchSelection}
                  onToggleBatchSelection={(target) => toggleBatchSession(target.workspaceId, target.id)}
                  onExitBatchSelection={() => {
                    exitBatchSelection()
                    batchToolbarRef.current?.focus()
                  }}
                  onOpen={(target) => openSession(target.workspaceId, target.id)}
                />
              )
            }}
          />
          {workspaceActivity.timeline.limitReached && (
            <LumenContentText context="feedback.message" role="status">
              {props.labels.sort.sessionCapacityReached}
            </LumenContentText>
          )}
          {workspaceActivity.timeline.hasMore && (
            <LumenButton
              className="hbar-app-react-load-more"
              size="s"
              tone="primary"
              variant="text"
              disabled={
                !connected || workspaceActivity.timeline.status === 'loading' || workspaceActivity.timeline.limitReached
              }
              onClick={() => void execute('workspaceActivity.loadMore', { scope: 'timeline' }).catch(() => {})}
            >
              {props.labels.loadMore}
            </LumenButton>
          )}
        </>
      )}
      {!timeView &&
        !organizationInitializing &&
        sidebarWorkspaces.length === 0 &&
        !workspaceActivity.workspaces.error && (
          <LumenContentText context="section.description">
            {workspaceActivity.workspaces.status !== 'ready'
              ? props.labels.loading
              : hiddenWorkspaceIds.length
                ? props.labels.organization.allHidden
                : props.labels.noWorkspaces}
          </LumenContentText>
        )}
      {!timeView &&
        sidebarWorkspaces.map((workspace) => {
          const displayName = workspaceDisplayName(workspace, displayNames.snapshot)
          const isExpanded = expanded.has(workspace.id)
          const isPinned = workspacePins.ids.includes(workspace.id)
          const partition = sidebarWorkspaces.filter((item) => workspacePins.ids.includes(item.id) === isPinned)
          const projectIndex = partition.findIndex((item) => item.id === workspace.id)
          const previousProject = partition[projectIndex - 1]
          const nextProject = partition[projectIndex + 1]
          const sessions = sessionsByWorkspace.get(workspace.id) ?? []
          const activitySessions = workspaceActivity.sessions[workspace.id]
          return (
            <LumenTreeItem
              as="section"
              key={workspace.id}
              nodeId={`project:${workspace.id}`}
              label={displayName}
              expanded={isExpanded}
              onExpandedChange={(value) =>
                setExpanded((current) => {
                  const next = new Set(current)
                  if (value) next.add(workspace.id)
                  else next.delete(workspace.id)
                  return next
                })
              }
              data-workspace-id={workspace.id}
              data-sidebar-level="project"
              {...projectReorder.sectionProps(workspace.id)}
              draggable={false}
              rowProps={projectReorder.handleProps(workspace.id)}
              content={
                <LumenFrame className="hbar-app-react-workspace-line">
                  <LumenFrame className="hbar-app-react-workspace-row" title={workspace.path}>
                    <WorkspaceShellIcon name={isExpanded ? 'folder-open' : 'folder'} />
                    <SidebarCaption text={displayName} />
                    {isPinned && (
                      <LumenContentText
                        context="message.inline"
                        className="hbar-app-react-workspace-pin"
                        title={props.labels.pinnedWorkspace(displayName)}
                      >
                        <WorkspaceShellIcon name="pin" tier="sm" />
                      </LumenContentText>
                    )}
                  </LumenFrame>
                  <WorkspaceProjectMenu
                    label={props.labels.workspaceActions(displayName)}
                    items={[
                      {
                        id: 'edit',
                        label: props.labels.displayNames.title,
                        disabled:
                          displayNames.status === 'unavailable' ||
                          (displayNameBusy && displayNames.editor?.workspaceId !== workspace.id),
                      },
                      { id: 'files', label: props.labels.workspaceFiles },
                      { id: 'run-board', label: props.labels.workspaceRunBoard, disabled: !connected },
                      { id: 'folders', label: props.labels.workspaceFolders.manage, disabled: !connected },
                      { id: 'settings', label: props.labels.workspaceSettings },
                      {
                        id: 'pin',
                        label: isPinned ? props.labels.unpinWorkspace : props.labels.pinWorkspace,
                        disabled: pinBusy || workspacePins.status !== 'ready',
                      },
                      ...(manualProjectView
                        ? [
                            {
                              id: 'move-up',
                              label: props.labels.sort.reorder.moveUp,
                              disabled: !projectReorderEnabled || !previousProject,
                            },
                            {
                              id: 'move-down',
                              label: props.labels.sort.reorder.moveDown,
                              disabled: !projectReorderEnabled || !nextProject,
                            },
                          ]
                        : []),
                      {
                        id: 'archived',
                        label: props.labels.archive.openList(displayName),
                        disabled: !connected,
                      },
                      {
                        id: 'refresh',
                        label: props.labels.roster.refreshWorkspace(displayName),
                        disabled: !connected || rosterRefresh.entries[workspace.id]?.status === 'loading',
                      },
                      {
                        id: 'hide',
                        label: props.labels.organization.hide,
                        disabled: !organizationCanWrite,
                      },
                    ]}
                    onAction={(action) => {
                      if (action === 'edit') editWorkspace({ workspaceId: workspace.id })
                      else if (action === 'folders') openFolders(workspace.id)
                      else if (action === 'files' || action === 'settings' || action === 'run-board')
                        openWorkspaceSurface(workspace.id, action)
                      else if (action === 'pin') toggleWorkspacePin(workspace.id)
                      else if (action === 'move-up' && previousProject)
                        moveProject(workspace.id, previousProject.id, 'before', sidebarOrder)
                      else if (action === 'move-down' && nextProject)
                        moveProject(workspace.id, nextProject.id, 'after', sidebarOrder)
                      else if (action === 'refresh') refreshProjectSessions(workspace.id)
                      else if (action === 'hide') hideWorkspace(workspace.id)
                      else if (action === 'archived')
                        void execute('archivedSessions.open', { workspaceId: workspace.id }).catch(recordError)
                    }}
                  />
                  <HbarActionIconButton
                    className="hbar-app-react-project-new-session"
                    label={props.labels.createSessionInWorkspace(displayName)}
                    disabled={!connected || navigationBlocked}
                    loading={navigationBusy && actionWorkspaceId === workspace.id}
                    onClick={() => newSession(workspace.id)}
                  >
                    <WorkspaceShellIcon name="new-session" />
                  </HbarActionIconButton>
                </LumenFrame>
              }
              aria-description={manualProjectView ? props.labels.sort.reorder.dragHint(displayName) : undefined}
              afterContent={
                <>
                  <SessionRosterFeedback
                    entry={
                      rosterRefresh.entries[workspace.id]?.status === 'error'
                        ? undefined
                        : rosterRefresh.entries[workspace.id]
                    }
                    labels={props.labels.roster}
                    connected={connected}
                    onRefresh={() => refreshProjectSessions(workspace.id)}
                  />
                  {actionWorkspaceId === workspace.id && (
                    <NavigationActionFeedback
                      state={navigationAction}
                      labels={props.labels}
                      connected={connected}
                      onReconcile={reconcileNavigationAction}
                    />
                  )}
                  {workspaceActionError?.workspaceId === workspace.id && (
                    <LumenContentText context="feedback.message" role="alert" tone="danger">
                      {props.labels.error(workspaceActionError.code)}
                    </LumenContentText>
                  )}
                  {workspacePins.action.workspaceId === workspace.id && workspacePins.action.status !== 'idle' && (
                    <LumenFrame
                      className="hbar-app-react-pin-feedback"
                      role={
                        workspacePins.action.status === 'submitting'
                          ? 'status'
                          : workspacePins.action.status === 'failed' || workspacePins.action.status === 'unknown'
                            ? 'alert'
                            : undefined
                      }
                    >
                      <LumenContentText context="section.description">
                        {workspacePins.action.status === 'submitting'
                          ? props.labels.pinningWorkspace
                          : workspacePins.action.status === 'unknown'
                            ? props.labels.pinUnknown
                            : workspacePins.action.status === 'failed'
                              ? props.labels.pinFailure(workspacePins.action.error ?? 'UNKNOWN')
                              : workspacePins.action.persisted
                                ? isPinned
                                  ? props.labels.pinSaved
                                  : props.labels.pinRemoved
                                : props.labels.pinVolatile}
                      </LumenContentText>
                      {workspacePins.action.status === 'unknown' && (
                        <LumenButton size="s" variant="outlined" onClick={() => checkWorkspacePin(workspace.id)}>
                          {props.labels.pinCheck}
                        </LumenButton>
                      )}
                    </LumenFrame>
                  )}
                  <ArchivedSessions
                    workspaceId={workspace.id}
                    workspaceName={displayName}
                    labels={props.labels.archive}
                    connected={connected}
                  />
                </>
              }
            >
              {isExpanded && (
                <LumenFrame className="hbar-app-react-session-list" data-sidebar-level="parent-sessions">
                  {(!activitySessions || activitySessions.status === 'loading') && sessions.length === 0 ? (
                    <LumenContentText context="section.description">{props.labels.loading}</LumenContentText>
                  ) : sessions.length === 0 && !activitySessions?.error ? (
                    <LumenContentText context="section.description">{props.labels.noSessions}</LumenContentText>
                  ) : (
                    sessions.map((session) => {
                      const execution = activitySessions?.execution[session.id]
                      return (
                        <SessionAgentBranch
                          key={session.id}
                          session={session}
                          showLoadFeedback={false}
                          childCount={
                            activitySessions?.agentChildCounts?.[session.id] ??
                            (agentTree.revealedRoot?.sessionId === session.id
                              ? agentTree.revealedRoot.agentChildCount
                              : 0)
                          }
                          treeLabels={props.labels.agentTree}
                          connected={props.connection === 'connected'}
                          labels={props.labels}
                          now={sessionTimeNow}
                          execution={
                            execution
                              ? {
                                  state: execution.state,
                                  label: props.labels.sort.time.execution[execution.state],
                                }
                              : undefined
                          }
                          batchSelecting={batchSelecting}
                          batchSelection={batchSelection}
                          onToggleBatchSelection={(target) => toggleBatchSession(target.workspaceId, target.id)}
                          onExitBatchSelection={() => {
                            exitBatchSelection()
                            batchToolbarRef.current?.focus()
                          }}
                          onOpen={(target) => openSession(target.workspaceId, target.id)}
                        />
                      )
                    })
                  )}
                  {activitySessions?.limitReached && (
                    <LumenContentText context="feedback.message" role="status">
                      {props.labels.sort.sessionCapacityReached}
                    </LumenContentText>
                  )}
                  {activitySessions?.hasMore && (
                    <LumenButton
                      className="hbar-app-react-load-more"
                      size="s"
                      tone="primary"
                      variant="text"
                      disabled={!connected || activitySessions.status === 'loading' || activitySessions.limitReached}
                      onClick={() => void loadSessions(workspace.id, true)}
                    >
                      {props.labels.loadMore}
                    </LumenButton>
                  )}
                </LumenFrame>
              )}
            </LumenTreeItem>
          )
        })}
      {!timeView && workspaceActivity.workspaces.limitReached && (
        <LumenContentText context="feedback.message" role="status">
          {props.labels.sort.capacityReached}
        </LumenContentText>
      )}
      {!timeView && workspaceActivity.workspaces.hasMore && (
        <LumenButton
          className="hbar-app-react-load-more"
          size="s"
          tone="primary"
          variant="text"
          disabled={
            !connected || workspaceActivity.workspaces.status === 'loading' || workspaceActivity.workspaces.limitReached
          }
          onClick={() => {
            void execute('workspaceActivity.loadMore', { scope: 'workspaces' }).catch(() => {
              // The activity owner retains rows and displays paging failures below the tree.
            })
          }}
        >
          {props.labels.loadMore}
        </LumenButton>
      )}
    </LumenTree>
  )
})
