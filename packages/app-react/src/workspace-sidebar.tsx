import { NavigationActionFeedback } from './workspace-navigation-feedback'
import { FolderOpen, SquarePen } from 'lucide-react'
import {
  LumenContentText,
  LumenActionMenu,
  LumenAppSidebar,
  LumenAppSidebar06,
  LumenButton,
  LumenDialog,
  LumenFormField,
  LumenFrame,
  LumenIcon,
  LumenInput,
} from '@lumen/app-ui'
import { HbarActionIconButton } from './action-icon-button'
import { WorkspaceSidebarRail } from './workspace-sidebar-rail'
import { WorkspaceSidebarFooter } from './workspace-sidebar-footer'
import { SESSION_ARCHIVE_BATCH_MAX_ITEMS, workspaceDisplayName } from '@hbar/app-runtime'

import './lumen-workspace-shell.css'
import './sidebar-entry-layout.css'
import './workspace-session-entry.css'
import './sidebar-navigation.css'
import { WorkspaceOrganizationFeedback } from './workspace-organization'
import { WorkspaceHeaderSortMenu } from './workspace-header-sort-menu'
import { WorkspaceDisplayNameDialog, WorkspaceDisplayNameFeedback } from './workspace-display-names'
import { HbarWorkspaceFoldersDialog } from './workspace-folders'
import { SessionRenameRecovery } from './session-navigation-row'
import { SessionArchiveBatchPanel, SessionArchiveRecovery } from './session-archive'
import { SidebarSearchEntry } from './sidebar-search-entry'
import { SidebarLoadFeedback } from './sidebar-load-feedback'
import { WorkspaceShellIcon, WorkspaceSidebarAction } from './workspace-shell-icons'
import { memo } from 'react'
import type { WorkspaceSidebarProps } from './workspace-shell-contract'
import { useWorkspaceSidebar } from './workspace-sidebar-model'
import { WorkspaceProjectTree } from './workspace-project-tree'
export const WorkspaceSidebar = memo(function WorkspaceSidebar(props: WorkspaceSidebarProps) {
  const { railCollapsed, sidebarFocusRef, railSearchFocus, error, execute, recordError, setSidebarVisible } =
    props.bridge
  const model = useWorkspaceSidebar(props)
  const {
    runtime,
    navigation,
    directory,
    workspacePins,
    workspaceActivity,
    agentTree,
    timeView,
    activityPreferenceBusy,
    organization,
    displayNames,
    organizationMenuRef,
    hiddenWorkspaceIds,
    presentation,
    rosterRefresh,
    sessionArchive,
    expanded,
    visibleExpanded,
    rosterBusy,
    workspaceCursor,
    loading,
    navigationAction,
    actionWorkspaceId,
    projectPicker,
    workspacePath,
    setWorkspacePath,
    batchSelecting,
    setBatchSelecting,
    batchLimitReached,
    batchToolbarRef,
    loadWorkspaces,
    loadSessions,
    workspaces,
    displayNameFor,
    editWorkspace,
    sidebarWorkspaces,
    organizationBusy,
    organizationCanWrite,
    organizationTargetName,
    restoreHiddenWorkspaces,
    refreshOrganization,
    refreshSidebar,
    refreshProjectSessions,
    reconcileOrganization,
    retryWorkspacePins,
    timelineItems,
    batchSelectedTargets,
    clearBatchSelection,
    exitBatchSelection,
    settleNavigation,
    openPanel,
    openWorkspaceSurface,
    openWorkspace,
    navigationBusy,
    navigationBlocked,
    connected,
    actionTargetName,
    runNavigationAction,
    reconcileNavigationAction,
    closeProjectPicker,
    newSession,
    addWorkspace,
    openFolders,
    serverValue,
    serverTone,
    shellSlots,
  } = model
  const secondaryNavigation = (compact: boolean) =>
    props.featureNavigation !== undefined ? (
      typeof props.featureNavigation === 'function' ? (
        props.featureNavigation(compact)
      ) : (
        props.featureNavigation
      )
    ) : (
      <LumenActionMenu<'status' | 'schedules' | 'commands'>
        label={props.labels.more}
        labelVisible={!compact}
        items={[
          { id: 'status', label: props.labels.status },
          { id: 'schedules', label: props.labels.schedules, disabled: !connected || !navigation.workspaceId },
          { id: 'commands', label: props.labels.commands },
        ]}
        onAction={(id) => {
          if (id === 'status') settleNavigation(execute('app.openStatus', { section: 'dashboard' }))
          else if (id === 'commands') openPanel('commands')
          else if (navigation.workspaceId) openWorkspaceSurface(navigation.workspaceId, 'schedules')
        }}
      />
    )
  const sidebarPane = railCollapsed ? (
    <LumenAppSidebar06
      slots={{
        drawer: (
          <WorkspaceSidebarRail
            labels={{
              navigation: props.labels.projectsAndSessions,
              expand: props.labels.showSidebar,
              newSession: props.labels.newSession,
              search: props.labels.searchChats,
              settings: props.labels.settings,
              serverValue: `${props.labels.server} · ${serverValue}`,
            }}
            expandRef={sidebarFocusRef}
            connected={connected}
            serverTone={serverTone}
            newDisabled={!connected || navigationBlocked}
            newBusy={navigationBusy}
            secondaryNavigation={secondaryNavigation(true)}
            notificationNavigation={props.notificationNavigation}
            searchSelected={presentation.modalInstanceId === 'chat-search'}
            settingsSelected={presentation.page.kind === 'settings'}
            onExpand={() => setSidebarVisible(true)}
            onNew={() => newSession()}
            onSearch={() => {
              const node = document.activeElement
              if (node instanceof HTMLElement)
                railSearchFocus.current = {
                  owner: runtime,
                  node,
                  workspaceId: navigation.workspaceId,
                  sessionId: navigation.sessionId,
                  opened: false,
                }
              void execute('app.openPanel', { panelId: 'chat-search' }).catch((reason: unknown) => {
                railSearchFocus.current = null
                recordError(reason)
              })
            }}
            onSettings={() => settleNavigation(execute('app.openSettings', { scope: 'global' }))}
          >
            {!projectPicker && actionWorkspaceId === null && (
              <NavigationActionFeedback
                state={navigationAction}
                labels={props.labels}
                connected={connected}
                targetName={actionTargetName}
                onReconcile={reconcileNavigationAction}
              />
            )}
            {error && (
              <LumenContentText context="feedback.message" role="alert">
                {props.labels.error(error ?? '')}
              </LumenContentText>
            )}
          </WorkspaceSidebarRail>
        ),
      }}
    />
  ) : (
    <LumenFrame className="hbar-app-react-sidebar-surface">
      <LumenAppSidebar
        brand={props.labels.brand}
        title={timeView ? props.labels.sort.time.title : props.labels.projectsAndSessions}
        emptyLabel={
          workspaceActivity.workspaces.status === 'loading' ? props.labels.loading : props.labels.noWorkspaces
        }
        status={{ label: props.labels.server, value: serverValue, tone: serverTone }}
        brandAction={
          <LumenFrame className="hbar-app-react-sidebar-brand-actions">
            {props.notificationNavigation}
            <HbarActionIconButton
              ref={sidebarFocusRef}
              label={props.labels.hideSidebar}
              onClick={() => setSidebarVisible(false)}
            >
              <WorkspaceShellIcon name="panel-close" />
            </HbarActionIconButton>
          </LumenFrame>
        }
        treeAction={
          <LumenFrame className="hbar-app-react-project-organization-actions">
            <WorkspaceHeaderSortMenu
              menuRef={organizationMenuRef}
              labels={props.labels.sort}
              sortBy={workspaceActivity.sortBy}
              pending={['loading', 'saving', 'submitting'].includes(workspaceActivity.preferenceStatus)}
              organization={{
                mode: workspaceActivity.organization,
                pending: activityPreferenceBusy,
                disabled: !connected,
                labels: props.labels.sort.organization,
                onChoose: (mode) => {
                  void execute('workspaceActivity.setOrganization', { organization: mode }).catch(recordError)
                },
              }}
              sortDisabled={!connected}
              hiddenCount={hiddenWorkspaceIds.length}
              restoreDisabled={!organizationCanWrite}
              refreshDisabled={
                !connected ||
                organizationBusy ||
                (timeView ? workspaceActivity.timeline.status : workspaceActivity.workspaces.status) === 'loading'
              }
              onSortChange={(sortBy) => {
                void execute('workspaceActivity.setSort', { sortBy }).catch(recordError)
              }}
              onRestoreHidden={restoreHiddenWorkspaces}
              onRefresh={refreshSidebar}
            />
            <HbarActionIconButton
              label={props.labels.openWorkspace}
              disabled={!connected || navigationBlocked}
              onClick={openWorkspace}
            >
              <WorkspaceShellIcon name="folder-open" />
            </HbarActionIconButton>
          </LumenFrame>
        }
        actions={
          <WorkspaceSidebarFooter
            feedback={connected && props.sidebarFeedback}
            secondaryNavigation={secondaryNavigation(false)}
            settings={props.labels.settings}
            settingsShortcut={props.labels.settingsShortcut}
            settingsSelected={presentation.page.kind === 'settings'}
            onSettings={() => settleNavigation(execute('app.openSettings', { scope: 'global' }))}
          />
        }
      >
        <LumenFrame className="hbar-app-react-sidebar-primary" data-sidebar-session-actions="true">
          <WorkspaceSidebarAction
            icon="plus"
            label={props.labels.newSession}
            size="l"
            variant="outlined"
            disabled={!connected || navigationBlocked}
            onClick={() => newSession()}
          />
          {!projectPicker && actionWorkspaceId === null && (
            <NavigationActionFeedback
              state={navigationAction}
              labels={props.labels}
              connected={connected}
              targetName={actionTargetName}
              onReconcile={reconcileNavigationAction}
            />
          )}
          <LumenFrame className="hbar-app-react-sidebar-query-actions">
            <SidebarSearchEntry
              label={props.labels.searchChats}
              shortcut={props.labels.searchShortcut}
              open={presentation.modalInstanceId === 'chat-search'}
              onOpen={() => openPanel('chat-search')}
            />
            <HbarActionIconButton
              className="hbar-app-react-roster-refresh"
              label={props.labels.roster.refreshExpanded}
              loading={rosterBusy}
              disabled={!connected || visibleExpanded.size === 0 || rosterBusy}
              onClick={() => refreshProjectSessions()}
            >
              <WorkspaceShellIcon name="refresh" />
            </HbarActionIconButton>
            <HbarActionIconButton
              ref={batchToolbarRef}
              className="hbar-app-react-session-batch-mode"
              label={props.labels.archiveBatch.enter}
              aria-pressed={batchSelecting}
              disabled={
                sessionArchive.batch.status !== 'idle' ||
                !['idle', 'succeeded'].includes(sessionArchive.mutation.status)
              }
              onClick={() => {
                if (batchSelecting) exitBatchSelection()
                else setBatchSelecting(true)
              }}
            >
              <WorkspaceShellIcon name="list-checks" tier="md" />
            </HbarActionIconButton>
          </LumenFrame>
          <SessionArchiveBatchPanel
            labels={props.labels.archiveBatch}
            connected={connected}
            selecting={batchSelecting}
            selectedTargets={batchSelectedTargets}
            toolbarRef={batchToolbarRef}
            onClearSelection={clearBatchSelection}
            onExitSelection={exitBatchSelection}
            onBatchStarted={() => {
              setBatchSelecting(false)
            }}
            onBatchCancelled={() => setBatchSelecting(true)}
            onBatchDismissed={exitBatchSelection}
          />
          {batchLimitReached && batchSelecting && (
            <LumenContentText context="feedback.message" role="status" className="hbar-app-react-sidebar-action-error">
              {props.labels.archiveBatch.maximumReached(SESSION_ARCHIVE_BATCH_MAX_ITEMS)}
            </LumenContentText>
          )}
        </LumenFrame>
        {shellSlots?.navigation ? (
          <LumenFrame as="nav" data-hbar-app-ui-component="app-sidebar-03-navigation">
            {shellSlots.navigation}
          </LumenFrame>
        ) : null}
        <LumenFrame className="hbar-app-react-sidebar-list">
          <WorkspaceProjectTree props={props} model={model} />
          <SidebarLoadFeedback
            workspaceIds={
              timeView
                ? [...new Set(timelineItems.map((item) => item.workspaceId))]
                : sidebarWorkspaces.map((workspace) => workspace.id)
            }
            workspaceName={displayNameFor}
            activity={workspaceActivity}
            roster={rosterRefresh}
            agents={agentTree}
            directory={directory}
            timeView={timeView}
            connected={connected}
            labels={{
              error: props.labels.error,
              refresh: props.labels.sort.refresh,
              roster: props.labels.roster,
              agents: props.labels.agentTree,
            }}
            onRefreshRoster={refreshProjectSessions}
            onRefreshSessions={(workspaceId) => void loadSessions(workspaceId)}
            onRefreshAgents={(parentSessionId) => {
              void execute('sessionAgentTree.refresh', { parentSessionId }).catch(() => {
                // The branch owner retains its children and the targeted footer retry.
              })
            }}
          >
            <WorkspaceDisplayNameFeedback
              state={displayNames}
              connected={connected}
              labels={props.labels.displayNames}
              onOpen={editWorkspace}
              onRefresh={() => execute('workspaceAlias.refresh', {}).then(() => undefined)}
              onReconcile={() => execute('workspaceAlias.reconcile', {}).then(() => undefined)}
            />
            <WorkspaceOrganizationFeedback
              state={organization}
              labels={props.labels.organization}
              targetName={organizationTargetName}
              connected={connected}
              onRefresh={refreshOrganization}
              onReconcile={reconcileOrganization}
            />
            {agentTree.revealError && (
              <LumenFrame className="hbar-app-react-organization-feedback" role="alert">
                <LumenContentText context="section.description">
                  {props.labels.agentTree.error(agentTree.revealError)}
                </LumenContentText>
                {navigation.sessionId && (
                  <LumenButton
                    size="s"
                    variant="outlined"
                    disabled={!connected}
                    onClick={() => {
                      const sessionId = navigation.sessionId
                      if (sessionId) void execute('sessionAgentTree.reveal', { sessionId }).catch(recordError)
                    }}
                  >
                    {props.labels.agentTree.retry}
                  </LumenButton>
                )}
              </LumenFrame>
            )}
            {workspacePins.status === 'error' && (
              <LumenFrame className="hbar-app-react-pin-feedback" role="alert">
                <LumenContentText context="section.description">
                  {props.labels.pinRestoreFailure(workspacePins.error ?? 'UNKNOWN')}
                </LumenContentText>
                <LumenButton size="s" variant="outlined" disabled={!connected} onClick={retryWorkspacePins}>
                  {props.labels.pinRetryRestore}
                </LumenButton>
              </LumenFrame>
            )}
            {(!timeView ? workspaceActivity.workspaces.error : workspaceActivity.timeline.error) && (
              <LumenFrame className="hbar-app-react-organization-feedback" role="alert">
                <LumenContentText context="section.description">
                  {props.labels.error(
                    (!timeView ? workspaceActivity.workspaces.error : workspaceActivity.timeline.error) ?? 'UNKNOWN',
                  )}
                </LumenContentText>
                <LumenButton size="s" variant="outlined" disabled={!connected} onClick={refreshSidebar}>
                  {props.labels.sort.refresh}
                </LumenButton>
              </LumenFrame>
            )}
            {workspaceActivity.preferenceError && (
              <LumenFrame className="hbar-app-react-organization-feedback" role="alert">
                <LumenContentText context="section.description">
                  {props.labels.error(workspaceActivity.preferenceError)}
                </LumenContentText>
                <LumenButton size="s" variant="outlined" disabled={!connected} onClick={refreshSidebar}>
                  {props.labels.sort.refresh}
                </LumenButton>
              </LumenFrame>
            )}
            {workspaceActivity.organizationPreferenceError && (
              <LumenFrame className="hbar-app-react-organization-feedback" role="alert">
                <LumenContentText context="section.description">
                  {props.labels.error(workspaceActivity.organizationPreferenceError)}
                </LumenContentText>
                <LumenButton size="s" variant="outlined" disabled={!connected} onClick={refreshSidebar}>
                  {props.labels.sort.refresh}
                </LumenButton>
              </LumenFrame>
            )}
            {error && (
              <LumenContentText context="feedback.message" role="alert" tone="danger">
                {props.labels.error(error)}
              </LumenContentText>
            )}
          </SidebarLoadFeedback>
        </LumenFrame>
        <SessionRenameRecovery labels={props.labels.renameEditor} connected={props.connection === 'connected'} />
        <SessionArchiveRecovery labels={props.labels.archive} connected={connected} expandedWorkspaces={expanded} />
      </LumenAppSidebar>
    </LumenFrame>
  )
  const overlayRegion = (
    <>
      <WorkspaceDisplayNameDialog
        owner={runtime}
        state={displayNames}
        connected={connected}
        labels={props.labels.displayNames}
        onEdit={(input) => {
          void execute('workspaceAlias.edit', input).catch(() => undefined)
        }}
        onClose={(input) => {
          void execute('workspaceAlias.close', input).catch(() => undefined)
        }}
        onSave={(input) => execute('workspaceAlias.save', input).then(() => undefined)}
        onReset={(input) => execute('workspaceAlias.reset', input).then(() => undefined)}
        onRebase={(input) => execute('workspaceAlias.rebase', input).then(() => undefined)}
        onRefresh={() => execute('workspaceAlias.refresh', {}).then(() => undefined)}
        onReconcile={() => execute('workspaceAlias.reconcile', {}).then(() => undefined)}
      />
      {projectPicker && (
        <LumenDialog
          open
          title={projectPicker === 'create-session' ? props.labels.chooseWorkspace : props.labels.openWorkspace}
          closeLabel={props.labels.cancel}
          onClose={closeProjectPicker}
          className="hbar-app-react-workspace-picker"
          footer={
            <LumenButton variant="text" disabled={navigationBusy} onClick={closeProjectPicker}>
              {props.labels.cancel}
            </LumenButton>
          }
        >
          <LumenContentText context="dialog.body">{props.labels.chooseWorkspaceDescription}</LumenContentText>
          <LumenFrame className="hbar-app-react-workspace-picker-list">
            {workspaces.length === 0 ? (
              <LumenContentText context="dialog.body">
                {loading.has('workspaces') ? props.labels.loading : props.labels.noWorkspaces}
              </LumenContentText>
            ) : (
              workspaces.map((workspace, index) => (
                <LumenFrame key={workspace.id} className="hbar-workspace-folder-entry-row">
                  <LumenButton
                    variant="text"
                    className="hbar-app-react-workspace-picker-item"
                    autoFocus={index === 0}
                    disabled={!connected || navigationBlocked}
                    aria-label={
                      projectPicker === 'create-session'
                        ? props.labels.createSessionInWorkspace(workspaceDisplayName(workspace, displayNames.snapshot))
                        : workspaceDisplayName(workspace, displayNames.snapshot)
                    }
                    onClick={() =>
                      runNavigationAction({
                        kind: projectPicker === 'create-session' ? 'create-session' : 'select-workspace',
                        workspaceId: workspace.id,
                      })
                    }
                  >
                    <WorkspaceShellIcon name="folder" />
                    <LumenFrame>
                      <LumenContentText context="popover.title">
                        {workspaceDisplayName(workspace, displayNames.snapshot)}
                      </LumenContentText>
                      <LumenContentText context="choice.description">{workspace.path}</LumenContentText>
                    </LumenFrame>
                  </LumenButton>
                  <HbarActionIconButton
                    label={props.labels.workspaceFolders.manage}
                    disabled={!connected || navigationBlocked}
                    onClick={() => openFolders(workspace.id)}
                  >
                    <LumenIcon icon={SquarePen} tier="sm" />
                  </HbarActionIconButton>
                </LumenFrame>
              ))
            )}
            {workspaceCursor && (
              <LumenButton
                variant="text"
                disabled={!connected || loading.has('workspaces') || navigationBlocked}
                onClick={() => void loadWorkspaces(workspaceCursor)}
              >
                {props.labels.loadMore}
              </LumenButton>
            )}
          </LumenFrame>
          <LumenFrame as="form" className="hbar-app-react-workspace-picker-form" onSubmit={addWorkspace}>
            <LumenFormField
              controlId="hbar-workspace-path"
              label={props.labels.workspacePath}
              description={props.labels.workspacePathHint}
            >
              <LumenFrame className="hbar-workspace-folder-entry-row">
                <LumenInput
                  id="hbar-workspace-path"
                  autoFocus={workspaces.length === 0}
                  value={workspacePath}
                  maxLength={4000}
                  disabled={!connected || navigationBlocked}
                  onChange={(event) => setWorkspacePath(event.currentTarget.value)}
                />
                <LumenButton
                  type="button"
                  variant="outlined"
                  indicator="none"
                  disabled={!connected || navigationBlocked}
                  onClick={() => openFolders(undefined, workspacePath, true)}
                >
                  <LumenIcon icon={FolderOpen} tier="sm" />
                  {props.labels.workspaceFolders.browse}
                </LumenButton>
              </LumenFrame>
            </LumenFormField>
            <LumenButton type="submit" disabled={!connected || navigationBlocked || !workspacePath.trim()}>
              {props.labels.addWorkspace}
            </LumenButton>
          </LumenFrame>
          <NavigationActionFeedback
            state={navigationAction}
            labels={props.labels}
            connected={connected}
            targetName={actionTargetName}
            onReconcile={reconcileNavigationAction}
          />
          {error && (
            <LumenContentText context="dialog.body" role="alert">
              {props.labels.error(error)}
            </LumenContentText>
          )}
        </LumenDialog>
      )}
      <HbarWorkspaceFoldersDialog labels={props.labels.workspaceFolders} connected={connected} />
    </>
  )
  return (
    <>
      {sidebarPane}
      {overlayRegion}
    </>
  )
})
